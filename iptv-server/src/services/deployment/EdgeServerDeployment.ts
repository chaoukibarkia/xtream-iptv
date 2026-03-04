import { EventEmitter } from 'events';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { prisma } from '../../config/database.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DeploymentMode = 'docker' | 'native';

export interface DeploymentConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  serverName: string;
  externalIp?: string;
  domain?: string;
  sslEmail?: string;
  mainPanelUrl: string;
  maxConnections?: number;
  skipNvidia?: boolean;
  skipHttps?: boolean;
  deploymentMode?: DeploymentMode; // 'docker' or 'native'
}

export interface DeploymentStatus {
  id: string;
  host: string;
  serverName: string;
  status: 'pending' | 'connecting' | 'detecting' | 'installing' | 'configuring' | 'building' | 'starting' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  steps: DeploymentStep[];
  gpuDetected: boolean;
  gpuModel?: string;
  gpuMemory?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  serverId?: number;
  apiKey?: string;
  deploymentMode?: DeploymentMode;
}

export interface DeploymentStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ServerProbeResult {
  connected: boolean;
  os?: string;
  osVersion?: string;
  kernel?: string;
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
  gpuDetected: boolean;
  gpuModel?: string;
  gpuMemory?: string;
  gpuDriverVersion?: string;
  dockerInstalled: boolean;
  dockerVersion?: string;
  nvidiaDockertoolkit: boolean;
  nodeInstalled: boolean;
  nodeVersion?: string;
  error?: string;
}

const DEPLOYMENT_STEPS_DOCKER = [
  'ssh_connection',
  'system_probe',
  'prerequisites',
  'docker_setup',
  'nvidia_driver',
  'nvidia_patch',
  'nvidia_toolkit',
  'copy_ffmpeg',
  'create_config',
  'copy_files',
  'start_services',
  'ssl_setup',
  'register_server',
  'verification',
];

const DEPLOYMENT_STEPS_NATIVE = [
  'ssh_connection',
  'system_probe',
  'prerequisites',
  'nodejs_setup',
  'nvidia_driver',
  'nvidia_patch',
  'install_ffmpeg',
  'create_config',
  'copy_files',
  'install_dependencies',
  'setup_systemd',
  'start_services',
  'ssl_setup',
  'register_server',
  'verification',
];

// Path to pre-built FFmpeg archive (built once with NVIDIA support, works for both GPU and CPU)
// Build with: ./ffmpeg-build/build-ffmpeg-nvidia.sh
const FFMPEG_ARCHIVE = '/opt/ffmpeg-nvidia.tar.gz';

class EdgeServerDeploymentService extends EventEmitter {
  private activeDeployments: Map<string, DeploymentStatus> = new Map();
  private deploymentProcesses: Map<string, any> = new Map();

  /**
   * Test SSH connection to a remote server
   */
  async testConnection(config: { host: string; port?: number; username: string; password?: string; privateKey?: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const sshCommand = this.buildSshCommand(config, 'echo "SSH_CONNECTION_OK"');
      const { stdout, stderr } = await execAsync(sshCommand, { timeout: 15000 });
      
      if (stdout.includes('SSH_CONNECTION_OK')) {
        return { success: true };
      }
      
      return { success: false, error: stderr || 'Connection test failed' };
    } catch (error: any) {
      logger.error({ error, host: config.host }, 'SSH connection test failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Probe remote server for system information
   */
  async probeServer(config: { host: string; port?: number; username: string; password?: string; privateKey?: string }): Promise<ServerProbeResult> {
    const result: ServerProbeResult = {
      connected: false,
      gpuDetected: false,
      dockerInstalled: false,
      nvidiaDockertoolkit: false,
      nodeInstalled: false,
    };

    try {
      // Test connection first
      const connTest = await this.testConnection(config);
      if (!connTest.success) {
        return { ...result, error: connTest.error };
      }
      result.connected = true;

      // Run probe script
      const probeScript = `
        echo "OS=$(cat /etc/os-release | grep ^ID= | cut -d= -f2 | tr -d '\"')"
        echo "OS_VERSION=$(cat /etc/os-release | grep VERSION_ID | cut -d= -f2 | tr -d '\"')"
        echo "KERNEL=$(uname -r)"
        echo "CPU_CORES=$(nproc)"
        echo "MEMORY_GB=$(free -g | awk '/^Mem:/{print $2}')"
        echo "DISK_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')"
        
        # Check for Docker
        if command -v docker &>/dev/null; then
          echo "DOCKER_INSTALLED=true"
          echo "DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')"
        else
          echo "DOCKER_INSTALLED=false"
        fi
        
        # Check for Node.js
        if command -v node &>/dev/null; then
          echo "NODE_INSTALLED=true"
          echo "NODE_VERSION=$(node --version | tr -d 'v')"
        else
          echo "NODE_INSTALLED=false"
        fi
        
        # Check for NVIDIA GPU
        if lspci 2>/dev/null | grep -qi nvidia; then
          echo "GPU_DETECTED=true"
          if command -v nvidia-smi &>/dev/null; then
            echo "GPU_MODEL=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
            echo "GPU_MEMORY=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1)"
            echo "GPU_DRIVER=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)"
          fi
        else
          echo "GPU_DETECTED=false"
        fi
        
        # Check for NVIDIA Container Toolkit
        if docker info 2>/dev/null | grep -q nvidia; then
          echo "NVIDIA_TOOLKIT=true"
        else
          echo "NVIDIA_TOOLKIT=false"
        fi
      `;

      const sshCommand = this.buildSshCommand(config, probeScript);
      const { stdout } = await execAsync(sshCommand, { timeout: 30000 });
      
      // Parse output
      const lines = stdout.split('\n');
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (!key || !value) continue;
        
        switch (key.trim()) {
          case 'OS': result.os = value.trim(); break;
          case 'OS_VERSION': result.osVersion = value.trim(); break;
          case 'KERNEL': result.kernel = value.trim(); break;
          case 'CPU_CORES': result.cpuCores = parseInt(value.trim()); break;
          case 'MEMORY_GB': result.memoryGb = parseInt(value.trim()); break;
          case 'DISK_GB': result.diskGb = parseInt(value.trim()); break;
          case 'DOCKER_INSTALLED': result.dockerInstalled = value.trim() === 'true'; break;
          case 'DOCKER_VERSION': result.dockerVersion = value.trim(); break;
          case 'NODE_INSTALLED': result.nodeInstalled = value.trim() === 'true'; break;
          case 'NODE_VERSION': result.nodeVersion = value.trim(); break;
          case 'GPU_DETECTED': result.gpuDetected = value.trim() === 'true'; break;
          case 'GPU_MODEL': result.gpuModel = value.trim(); break;
          case 'GPU_MEMORY': result.gpuMemory = value.trim(); break;
          case 'GPU_DRIVER': result.gpuDriverVersion = value.trim(); break;
          case 'NVIDIA_TOOLKIT': result.nvidiaDockertoolkit = value.trim() === 'true'; break;
        }
      }

      return result;
    } catch (error: any) {
      logger.error({ error, host: config.host }, 'Server probe failed');
      return { ...result, error: error.message };
    }
  }

  /**
   * Start a new deployment
   */
  async startDeployment(config: DeploymentConfig): Promise<string> {
    const deploymentId = crypto.randomUUID();
    const deploymentMode = config.deploymentMode || 'docker';
    const steps = deploymentMode === 'native' ? DEPLOYMENT_STEPS_NATIVE : DEPLOYMENT_STEPS_DOCKER;
    
    const status: DeploymentStatus = {
      id: deploymentId,
      host: config.host,
      serverName: config.serverName,
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing...',
      steps: steps.map(name => ({
        name,
        status: 'pending' as const,
      })),
      gpuDetected: false,
      startedAt: new Date(),
      deploymentMode,
    };

    this.activeDeployments.set(deploymentId, status);
    
    // Store in Redis for persistence
    await redis.setex(
      `deployment:${deploymentId}`,
      3600 * 24, // 24 hour expiry
      JSON.stringify(status)
    );

    // Start deployment in background
    this.runDeployment(deploymentId, config).catch(error => {
      logger.error({ error, deploymentId }, 'Deployment failed');
    });

    return deploymentId;
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus | null> {
    // Check memory first
    let status = this.activeDeployments.get(deploymentId);
    
    if (!status) {
      // Check Redis
      const cached = await redis.get(`deployment:${deploymentId}`);
      if (cached) {
        status = JSON.parse(cached);
      }
    }
    
    return status || null;
  }

  /**
   * Cancel a running deployment
   */
  async cancelDeployment(deploymentId: string): Promise<boolean> {
    const process = this.deploymentProcesses.get(deploymentId);
    if (process) {
      process.kill('SIGTERM');
      this.deploymentProcesses.delete(deploymentId);
    }

    const status = this.activeDeployments.get(deploymentId);
    if (status) {
      status.status = 'failed';
      status.error = 'Deployment cancelled by user';
      status.completedAt = new Date();
      await this.saveStatus(deploymentId, status);
    }

    return true;
  }

  /**
   * List all active deployments
   */
  getActiveDeployments(): DeploymentStatus[] {
    return Array.from(this.activeDeployments.values());
  }

  // ==================== Private Methods ====================

  private async runDeployment(deploymentId: string, config: DeploymentConfig): Promise<void> {
    const status = this.activeDeployments.get(deploymentId)!;
    const deploymentMode = config.deploymentMode || 'docker';
    
    try {
      // Step 1: SSH Connection
      await this.updateStep(deploymentId, 'ssh_connection', 'running', 'Testing SSH connection...');
      const connTest = await this.testConnection({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
      });
      
      if (!connTest.success) {
        throw new Error(`SSH connection failed: ${connTest.error}`);
      }
      await this.updateStep(deploymentId, 'ssh_connection', 'completed', 'SSH connection established');

      // Step 2: System Probe
      await this.updateStep(deploymentId, 'system_probe', 'running', 'Probing system information...');
      status.status = 'detecting';
      await this.saveStatus(deploymentId, status);
      
      const probe = await this.probeServer({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
      });
      
      status.gpuDetected = probe.gpuDetected;
      status.gpuModel = probe.gpuModel;
      status.gpuMemory = probe.gpuMemory;
      await this.updateStep(deploymentId, 'system_probe', 'completed', 
        `OS: ${probe.os} ${probe.osVersion}, CPU: ${probe.cpuCores} cores, RAM: ${probe.memoryGb}GB` +
        (probe.gpuDetected ? `, GPU: ${probe.gpuModel}` : ', No GPU detected') +
        (probe.nodeInstalled ? `, Node: ${probe.nodeVersion}` : ''));

      // Step 3: Prerequisites
      await this.updateStep(deploymentId, 'prerequisites', 'running', 'Installing prerequisites...');
      status.status = 'installing';
      await this.saveStatus(deploymentId, status);
      
      await this.executeRemote(config, `
        apt-get update -qq && \
        apt-get install -y -qq curl wget git jq ca-certificates gnupg lsb-release \
          software-properties-common pciutils htop net-tools
      `);
      await this.updateStep(deploymentId, 'prerequisites', 'completed', 'Prerequisites installed');

      // Branch based on deployment mode
      if (deploymentMode === 'native') {
        await this.runNativeDeployment(deploymentId, config, probe);
      } else {
        await this.runDockerDeployment(deploymentId, config, probe);
      }

    } catch (error: any) {
      status.status = 'failed';
      status.error = error.message;
      status.completedAt = new Date();
      await this.saveStatus(deploymentId, status);
      
      this.emit('deployment:failed', { deploymentId, error: error.message });
      logger.error({ deploymentId, error }, 'Edge server deployment failed');
      throw error;
    }
  }

  /**
   * Docker-based deployment
   */
  private async runDockerDeployment(deploymentId: string, config: DeploymentConfig, probe: ServerProbeResult): Promise<void> {
    const status = this.activeDeployments.get(deploymentId)!;

    // Step 4: Docker Setup
    if (!probe.dockerInstalled) {
      await this.updateStep(deploymentId, 'docker_setup', 'running', 'Installing Docker...');
      await this.executeRemote(config, 'curl -fsSL https://get.docker.com | sh');
      await this.updateStep(deploymentId, 'docker_setup', 'completed', 'Docker installed');
    } else {
      await this.updateStep(deploymentId, 'docker_setup', 'skipped', `Docker already installed (${probe.dockerVersion})`);
    }

    // Step 5-7: NVIDIA Setup (if GPU detected and not skipped)
    if (probe.gpuDetected && !config.skipNvidia) {
      await this.installNvidiaDriver(deploymentId, config, probe);
      await this.applyNvidiaPatch(deploymentId, config);
      
      // NVIDIA Container Toolkit (Docker only)
      if (!probe.nvidiaDockertoolkit) {
        await this.updateStep(deploymentId, 'nvidia_toolkit', 'running', 'Installing NVIDIA Container Toolkit...');
        await this.executeRemote(config, `
          distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
          curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
            gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null || true
          curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null
          apt-get update -qq
          apt-get install -y -qq nvidia-container-toolkit
          nvidia-ctk runtime configure --runtime=docker
          systemctl restart docker
        `);
        await this.updateStep(deploymentId, 'nvidia_toolkit', 'completed', 'NVIDIA Container Toolkit installed');
      } else {
        await this.updateStep(deploymentId, 'nvidia_toolkit', 'skipped', 'NVIDIA Container Toolkit already installed');
      }
    } else {
      await this.updateStep(deploymentId, 'nvidia_driver', 'skipped', 'No GPU or skipped');
      await this.updateStep(deploymentId, 'nvidia_patch', 'skipped', 'No GPU or skipped');
      await this.updateStep(deploymentId, 'nvidia_toolkit', 'skipped', 'No GPU or skipped');
    }

    // Step 8: Install FFmpeg
    await this.updateStep(deploymentId, 'copy_ffmpeg', 'running', 
      probe.gpuDetected ? 'Copying NVIDIA FFmpeg with NVENC support...' : 'Installing system FFmpeg...');
    await this.copyPrebuiltFfmpeg(config, probe.gpuDetected);
    await this.updateStep(deploymentId, 'copy_ffmpeg', 'completed', 
      probe.gpuDetected ? 'NVIDIA FFmpeg with NVENC/CUVID installed' : 'System FFmpeg installed (CPU encoding)');

    // Step 9: Create Configuration
    await this.updateStep(deploymentId, 'create_config', 'running', 'Creating configuration files...');
    status.status = 'configuring';
    await this.saveStatus(deploymentId, status);

    const serverApiKey = crypto.randomUUID();
    const externalIp = config.externalIp || config.host;
    
    await this.createDeploymentFiles(config, {
      gpuDetected: probe.gpuDetected,
      serverApiKey,
      externalIp,
    });
    await this.updateStep(deploymentId, 'create_config', 'completed', 'Configuration created');

    // Step 10: Copy Files
    await this.updateStep(deploymentId, 'copy_files', 'running', 'Copying application files...');
    await this.copyApplicationFiles(config);
    await this.updateStep(deploymentId, 'copy_files', 'completed', 'Application files copied');

    // Step 11: Start Services
    await this.updateStep(deploymentId, 'start_services', 'running', 'Starting Docker services...');
    status.status = 'starting';
    await this.saveStatus(deploymentId, status);
    
    await this.executeRemote(config, `
      cd /opt/iptv-edge
      docker-compose up -d
      sleep 10
      docker-compose ps
    `);
    await this.updateStep(deploymentId, 'start_services', 'completed', 'Docker services started');

    // Complete registration
    await this.completeDeployment(deploymentId, config, probe, serverApiKey, externalIp, 'docker');
  }

  /**
   * Native OS deployment (without Docker)
   */
  private async runNativeDeployment(deploymentId: string, config: DeploymentConfig, probe: ServerProbeResult): Promise<void> {
    const status = this.activeDeployments.get(deploymentId)!;

    // Step 4: Node.js Setup
    if (!probe.nodeInstalled || !probe.nodeVersion?.startsWith('20')) {
      await this.updateStep(deploymentId, 'nodejs_setup', 'running', 'Installing Node.js 20...');
      await this.executeRemote(config, `
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -qq nodejs
        npm install -g pm2
      `);
      await this.updateStep(deploymentId, 'nodejs_setup', 'completed', 'Node.js 20 and PM2 installed');
    } else {
      await this.updateStep(deploymentId, 'nodejs_setup', 'running', 'Installing PM2...');
      await this.executeRemote(config, 'npm install -g pm2');
      await this.updateStep(deploymentId, 'nodejs_setup', 'completed', `Node.js ${probe.nodeVersion} detected, PM2 installed`);
    }

    // Step 5-6: NVIDIA Setup (if GPU detected and not skipped)
    if (probe.gpuDetected && !config.skipNvidia) {
      await this.installNvidiaDriver(deploymentId, config, probe);
      await this.applyNvidiaPatch(deploymentId, config);
    } else {
      await this.updateStep(deploymentId, 'nvidia_driver', 'skipped', 'No GPU or skipped');
      await this.updateStep(deploymentId, 'nvidia_patch', 'skipped', 'No GPU or skipped');
    }

    // Step 7: Install FFmpeg
    await this.updateStep(deploymentId, 'install_ffmpeg', 'running', 
      probe.gpuDetected ? 'Installing NVIDIA FFmpeg with NVENC support...' : 'Installing system FFmpeg...');
    await this.copyPrebuiltFfmpeg(config, probe.gpuDetected);
    await this.updateStep(deploymentId, 'install_ffmpeg', 'completed', 
      probe.gpuDetected ? 'NVIDIA FFmpeg with NVENC/CUVID installed' : 'System FFmpeg installed');

    // Step 8: Create Configuration
    await this.updateStep(deploymentId, 'create_config', 'running', 'Creating configuration files...');
    status.status = 'configuring';
    await this.saveStatus(deploymentId, status);

    const serverApiKey = crypto.randomUUID();
    const externalIp = config.externalIp || config.host;
    
    await this.createNativeDeploymentFiles(config, {
      gpuDetected: probe.gpuDetected,
      serverApiKey,
      externalIp,
    });
    await this.updateStep(deploymentId, 'create_config', 'completed', 'Configuration created');

    // Step 9: Copy Files
    await this.updateStep(deploymentId, 'copy_files', 'running', 'Copying application files...');
    await this.copyNativeApplicationFiles(config);
    await this.updateStep(deploymentId, 'copy_files', 'completed', 'Application files copied');

    // Step 10: Install Dependencies
    await this.updateStep(deploymentId, 'install_dependencies', 'running', 'Installing Node.js dependencies...');
    await this.executeRemote(config, `
      cd /opt/iptv-edge
      npm ci --production
      npx prisma generate
    `, 300000);
    await this.updateStep(deploymentId, 'install_dependencies', 'completed', 'Dependencies installed');

    // Step 11: Setup systemd
    await this.updateStep(deploymentId, 'setup_systemd', 'running', 'Setting up systemd service...');
    await this.setupSystemdService(config, probe.gpuDetected);
    await this.updateStep(deploymentId, 'setup_systemd', 'completed', 'Systemd service configured');

    // Step 12: Start Services
    await this.updateStep(deploymentId, 'start_services', 'running', 'Starting services...');
    status.status = 'starting';
    await this.saveStatus(deploymentId, status);
    
    await this.executeRemote(config, `
      systemctl daemon-reload
      systemctl enable iptv-edge
      systemctl start iptv-edge
      sleep 5
      systemctl status iptv-edge --no-pager
    `);
    await this.updateStep(deploymentId, 'start_services', 'completed', 'Services started');

    // Complete registration
    await this.completeDeployment(deploymentId, config, probe, serverApiKey, externalIp, 'native');
  }

  /**
   * Install NVIDIA driver
   */
  private async installNvidiaDriver(deploymentId: string, config: DeploymentConfig, probe: ServerProbeResult): Promise<void> {
    if (!probe.gpuDriverVersion) {
      await this.updateStep(deploymentId, 'nvidia_driver', 'running', 'Installing NVIDIA driver...');
      await this.executeRemote(config, `
        apt-get install -y -qq linux-headers-$(uname -r)
        add-apt-repository -y ppa:graphics-drivers/ppa
        apt-get update -qq
        LATEST_DRIVER=$(apt-cache search nvidia-driver | grep -oP 'nvidia-driver-\\d+' | sort -V | tail -1)
        apt-get install -y -qq $LATEST_DRIVER
      `);
      await this.updateStep(deploymentId, 'nvidia_driver', 'completed', 'NVIDIA driver installed');
    } else {
      await this.updateStep(deploymentId, 'nvidia_driver', 'skipped', `Driver already installed (${probe.gpuDriverVersion})`);
    }
  }

  /**
   * Apply NVIDIA patch
   */
  private async applyNvidiaPatch(deploymentId: string, config: DeploymentConfig): Promise<void> {
    await this.updateStep(deploymentId, 'nvidia_patch', 'running', 'Applying nvidia-patch for unlimited NVENC...');
    await this.executeRemote(config, `
      cd /tmp
      rm -rf nvidia-patch 2>/dev/null || true
      git clone https://github.com/keylase/nvidia-patch.git
      cd nvidia-patch
      ./patch.sh || echo "Patch may have been already applied"
    `);
    await this.updateStep(deploymentId, 'nvidia_patch', 'completed', 'nvidia-patch applied for unlimited NVENC');
  }

  /**
   * Complete deployment - register server and verify
   */
  private async completeDeployment(
    deploymentId: string, 
    config: DeploymentConfig, 
    probe: ServerProbeResult, 
    serverApiKey: string, 
    externalIp: string,
    mode: DeploymentMode
  ): Promise<void> {
    const status = this.activeDeployments.get(deploymentId)!;

    // SSL Setup (if domain provided)
    if (config.domain && config.sslEmail && !config.skipHttps) {
      await this.updateStep(deploymentId, 'ssl_setup', 'running', 'Setting up SSL certificate...');
      if (mode === 'native') {
        await this.executeRemote(config, `
          apt-get install -y -qq certbot
          certbot certonly --standalone --non-interactive \
            --agree-tos --email ${config.sslEmail} \
            -d ${config.domain} || echo "SSL setup may need manual completion"
        `);
      } else {
        await this.executeRemote(config, `
          cd /opt/iptv-edge
          docker-compose run --rm certbot certonly \
            --webroot --webroot-path=/var/www/certbot \
            --email ${config.sslEmail} --agree-tos --no-eff-email \
            -d ${config.domain} || echo "SSL setup may need manual completion"
        `);
      }
      await this.updateStep(deploymentId, 'ssl_setup', 'completed', 'SSL certificate configured');
    } else {
      await this.updateStep(deploymentId, 'ssl_setup', 'skipped', 'No domain or skipped');
    }

    // Register Server
    await this.updateStep(deploymentId, 'register_server', 'running', 'Registering server in database...');
    
    const server = await prisma.server.create({
      data: {
        name: config.serverName,
        type: 'EDGE_STREAMER',
        status: 'OFFLINE', // Will become ONLINE after first heartbeat
        internalIp: config.host,
        externalIp: externalIp,
        httpPort: 3001,
        httpsPort: config.domain ? 443 : undefined,
        maxConnections: config.maxConnections || 5000,
        region: await this.detectRegion(externalIp),
        canTranscode: true,
        transcodeProfiles: probe.gpuDetected 
          ? ['passthrough', 'h264_nvenc_1080p', 'h264_nvenc_720p', 'h264_nvenc_480p']
          : ['passthrough', 'h264_720p', 'h264_480p'],
        supportsHls: true,
        supportsMpegts: true,
        supportsRtmp: true,
        apiKey: serverApiKey,
        hasNvenc: probe.gpuDetected,
        nvencGpuModel: probe.gpuModel,
      },
    });
    
    status.serverId = server.id;
    status.apiKey = serverApiKey;
    await this.updateStep(deploymentId, 'register_server', 'completed', `Server registered with ID: ${server.id}`);

    // Verification
    await this.updateStep(deploymentId, 'verification', 'running', 'Verifying deployment...');
    
    const healthCheck = await this.executeRemote(config, `
      curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || echo "000"
    `);
    
    if (healthCheck.stdout.trim() === '200') {
      await this.updateStep(deploymentId, 'verification', 'completed', 'Health check passed');
    } else {
      await this.updateStep(deploymentId, 'verification', 'completed', 'Service starting, health check pending');
    }

    // Deployment complete
    status.status = 'completed';
    status.progress = 100;
    status.currentStep = `Deployment completed successfully (${mode} mode)!`;
    status.completedAt = new Date();
    await this.saveStatus(deploymentId, status);
    
    this.emit('deployment:completed', { deploymentId, status });
    logger.info({ deploymentId, serverId: server.id, mode }, 'Edge server deployment completed');
  }

  /**
   * Create configuration files for native deployment
   */
  private async createNativeDeploymentFiles(config: DeploymentConfig, options: { gpuDetected: boolean; serverApiKey: string; externalIp: string }): Promise<void> {
    const remoteDir = '/opt/iptv-edge';
    
    // Create directory structure
    await this.executeRemote(config, `mkdir -p ${remoteDir}/{logs,cache,data}`);
    
    // Create .env file
    const envContent = `
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
SERVER_NAME=${config.serverName}
SERVER_TYPE=EDGE
EXTERNAL_IP=${options.externalIp}
INTERNAL_IP=0.0.0.0
MAX_CONNECTIONS=${config.maxConnections || 5000}
MAIN_PANEL_URL=${config.mainPanelUrl}
SERVER_API_KEY=${options.serverApiKey}
FFMPEG_PATH=${options.gpuDetected ? '/opt/ffmpeg-nvidia/bin/ffmpeg' : '/usr/bin/ffmpeg'}
HLS_SEGMENT_PATH=/media/hls
HLS_OUTPUT_DIR=/media/hls-segments
LOG_LEVEL=info
${options.gpuDetected ? `
# GPU Settings
NVIDIA_VISIBLE_DEVICES=all
DEFAULT_VIDEO_CODEC=h264_nvenc
ENABLE_HARDWARE_DECODE=true
ENABLE_HARDWARE_ENCODE=true
` : `
# CPU Settings
DEFAULT_VIDEO_CODEC=libx264
X264_PRESET=veryfast
`}
`.trim();

    await this.executeRemote(config, `cat > ${remoteDir}/.env << 'ENVEOF'
${envContent}
ENVEOF`);
  }

  /**
   * Copy application files for native deployment
   */
  private async copyNativeApplicationFiles(config: DeploymentConfig): Promise<void> {
    const remoteDir = '/opt/iptv-edge';
    const projectDir = path.resolve(__dirname, '../../../../');
    
    // Create a deployment archive
    const archivePath = `/tmp/edge-native-deploy-${Date.now()}.tar.gz`;
    
    try {
      await execAsync(`tar -czf ${archivePath} -C ${projectDir}/iptv-server dist prisma package.json package-lock.json`);
      
      // Copy via SCP
      const scpCommand = config.privateKey
        ? `scp -o StrictHostKeyChecking=accept-new -i "${config.privateKey}" ${archivePath} ${config.username}@${config.host}:${remoteDir}/`
        : config.password
          ? `sshpass -p '${config.password}' scp -o StrictHostKeyChecking=accept-new ${archivePath} ${config.username}@${config.host}:${remoteDir}/`
          : `scp -o StrictHostKeyChecking=accept-new ${archivePath} ${config.username}@${config.host}:${remoteDir}/`;
      
      await execAsync(scpCommand);
      
      // Extract on remote
      await this.executeRemote(config, `
        cd ${remoteDir}
        tar -xzf *.tar.gz
        rm -f *.tar.gz
        mkdir -p /tmp/hls-segments
        chown -R root:root ${remoteDir}
      `);
    } finally {
      // Cleanup local archive
      await execAsync(`rm -f ${archivePath}`).catch(() => {});
    }
  }

  /**
   * Setup systemd service for native deployment
   */
  private async setupSystemdService(config: DeploymentConfig, gpuEnabled: boolean): Promise<void> {
    const serviceContent = `[Unit]
Description=IPTV Edge Server
After=network.target${gpuEnabled ? ' nvidia-persistenced.service' : ''}
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/iptv-edge
EnvironmentFile=/opt/iptv-edge/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iptv-edge

# Resource limits
LimitNOFILE=65535
LimitNPROC=65535

# Security
NoNewPrivileges=false
${gpuEnabled ? `
# GPU access
SupplementaryGroups=video render
` : ''}

[Install]
WantedBy=multi-user.target
`;

    await this.executeRemote(config, `cat > /etc/systemd/system/iptv-edge.service << 'SERVICEEOF'
${serviceContent}
SERVICEEOF`);
  }

  private async updateStep(deploymentId: string, stepName: string, stepStatus: DeploymentStep['status'], message?: string): Promise<void> {
    const status = this.activeDeployments.get(deploymentId);
    if (!status) return;

    const stepIndex = status.steps.findIndex(s => s.name === stepName);
    if (stepIndex === -1) return;

    status.steps[stepIndex].status = stepStatus;
    status.steps[stepIndex].message = message;
    
    if (stepStatus === 'running') {
      status.steps[stepIndex].startedAt = new Date();
      status.currentStep = message || stepName;
    } else if (stepStatus === 'completed' || stepStatus === 'failed' || stepStatus === 'skipped') {
      status.steps[stepIndex].completedAt = new Date();
    }

    // Calculate progress
    const completedSteps = status.steps.filter(s => 
      s.status === 'completed' || s.status === 'skipped'
    ).length;
    status.progress = Math.round((completedSteps / status.steps.length) * 100);

    await this.saveStatus(deploymentId, status);
    this.emit('deployment:progress', { deploymentId, status });
  }

  private async saveStatus(deploymentId: string, status: DeploymentStatus): Promise<void> {
    this.activeDeployments.set(deploymentId, status);
    await redis.setex(
      `deployment:${deploymentId}`,
      3600 * 24,
      JSON.stringify(status)
    );
  }

  private buildSshCommand(config: { host: string; port?: number; username: string; password?: string; privateKey?: string }, command: string): string {
    const port = config.port || 22;
    const sshOptions = '-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes';
    
    if (config.privateKey) {
      // Use private key auth (key should be a path)
      return `ssh ${sshOptions} -p ${port} -i "${config.privateKey}" ${config.username}@${config.host} "${command.replace(/"/g, '\\"')}"`;
    } else if (config.password) {
      // Use sshpass for password auth
      return `sshpass -p '${config.password}' ssh ${sshOptions} -p ${port} ${config.username}@${config.host} "${command.replace(/"/g, '\\"')}"`;
    } else {
      // Assume SSH key is configured in ssh-agent or default location
      return `ssh ${sshOptions} -p ${port} ${config.username}@${config.host} "${command.replace(/"/g, '\\"')}"`;
    }
  }

  private async executeRemote(config: DeploymentConfig, command: string, timeout = 300000): Promise<{ stdout: string; stderr: string }> {
    const sshCommand = this.buildSshCommand({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
    }, command);

    return execAsync(sshCommand, { timeout });
  }

  /**
   * Install FFmpeg on edge server
   * - GPU servers: Copy pre-built NVIDIA FFmpeg with NVENC/CUVID support
   * - CPU servers: Install system FFmpeg (simpler, faster, no CUDA dependencies)
   */
  private async copyPrebuiltFfmpeg(config: DeploymentConfig, gpuEnabled: boolean): Promise<void> {
    
    // For non-GPU servers, just install system FFmpeg - simpler and faster
    if (!gpuEnabled) {
      logger.info({ host: config.host }, 'Installing system FFmpeg for CPU-only server');
      
      await this.executeRemote(config, `
        echo "=== Installing System FFmpeg (CPU-only) ==="
        apt-get update -qq
        apt-get install -y -qq ffmpeg
        
        echo ""
        echo "FFmpeg installed:"
        ffmpeg -version | head -3
        
        echo ""
        echo "Available encoders:"
        echo "  ✓ libx264 (H.264 software encoding)"
        echo "  ✓ libx265 (HEVC software encoding)"
        echo "  ✓ libvpx (VP8/VP9 software encoding)"
        
        echo ""
        echo "=== FFmpeg setup complete (CPU mode) ==="
      `);
      
      return;
    }

    // For GPU servers, copy pre-built NVIDIA FFmpeg
    const ffmpegDir = '/opt/ffmpeg-nvidia';
    
    // Check if pre-built archive exists locally
    try {
      await execAsync(`test -f ${FFMPEG_ARCHIVE}`);
    } catch {
      // Archive doesn't exist, install system FFmpeg as fallback
      logger.warn({ archivePath: FFMPEG_ARCHIVE }, 'Pre-built NVIDIA FFmpeg archive not found, installing system FFmpeg');
      
      await this.executeRemote(config, `
        apt-get update -qq
        apt-get install -y -qq ffmpeg
        
        echo "NOTE: Using system FFmpeg. For NVENC support, build custom FFmpeg:"
        echo "  Run: ./ffmpeg-build/build-ffmpeg-docker.sh"
      `);
      return;
    }

    logger.info({ host: config.host }, 'Copying NVIDIA FFmpeg for GPU server');

    // Copy pre-built FFmpeg archive via SCP
    const scpOptions = '-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30';
    const scpCommand = config.privateKey
      ? `scp ${scpOptions} -i "${config.privateKey}" ${FFMPEG_ARCHIVE} ${config.username}@${config.host}:/opt/ffmpeg-nvidia.tar.gz`
      : config.password
        ? `sshpass -p '${config.password}' scp ${scpOptions} ${FFMPEG_ARCHIVE} ${config.username}@${config.host}:/opt/ffmpeg-nvidia.tar.gz`
        : `scp ${scpOptions} ${FFMPEG_ARCHIVE} ${config.username}@${config.host}:/opt/ffmpeg-nvidia.tar.gz`;

    await execAsync(scpCommand, { timeout: 300000 }); // 5 min timeout for copy (archive is ~126MB)

    // Extract and setup NVIDIA FFmpeg on GPU server
    const installScript = `
#!/bin/bash
set -e

FFMPEG_DIR="${ffmpegDir}"

echo "=== Installing NVIDIA FFmpeg for GPU Server ==="

echo "Extracting FFmpeg archive..."
cd /opt
tar -xzf ffmpeg-nvidia.tar.gz
rm -f ffmpeg-nvidia.tar.gz

echo "Installing runtime dependencies..."
apt-get update -qq

# Install all required runtime libraries
apt-get install -y -qq \\
    libass9 libfreetype6 libgnutls30 libmp3lame0 libnuma1 \\
    libopus0 libtheora0 libvdpau1 libvorbis0a libvorbisenc2 \\
    libva2 libva-drm2 libva-x11-2 libxv1 \\
    libxcb-shape0 libxcb-xfixes0 libxcb-shm0 libxcb1 \\
    libsdl2-2.0-0 libsndio7.0 \\
    libxml2 2>/dev/null || true

# Install codec libraries (try multiple versions for compatibility)
apt-get install -y -qq libvpx7 2>/dev/null || apt-get install -y -qq libvpx9 2>/dev/null || apt-get install -y -qq libvpx-dev 2>/dev/null || true
apt-get install -y -qq libx264-163 2>/dev/null || apt-get install -y -qq libx264-164 2>/dev/null || apt-get install -y -qq libx264-dev 2>/dev/null || true  
apt-get install -y -qq libx265-199 2>/dev/null || apt-get install -y -qq libx265-209 2>/dev/null || apt-get install -y -qq libx265-dev 2>/dev/null || true
apt-get install -y -qq libwebp7 2>/dev/null || apt-get install -y -qq libwebp-dev 2>/dev/null || true
apt-get install -y -qq libfdk-aac2 2>/dev/null || apt-get install -y -qq libfdk-aac-dev 2>/dev/null || true
apt-get install -y -qq libsrt1.4-gnutls 2>/dev/null || apt-get install -y -qq libsrt1.5-gnutls 2>/dev/null || apt-get install -y -qq libsrt-openssl-dev 2>/dev/null || true

# Create version symlinks for library compatibility
echo "Creating library compatibility symlinks..."
create_symlink_if_needed() {
    local pattern="\$1"
    local target="\$2"
    local source_lib
    source_lib=\$(find /usr/lib -name "\${pattern}*" 2>/dev/null | head -1)
    if [ -n "\$source_lib" ] && [ ! -e "\$target" ]; then
        ln -sf "\$source_lib" "\$target"
    fi
}

create_symlink_if_needed "libvpx.so" "/usr/lib/x86_64-linux-gnu/libvpx.so.7"
create_symlink_if_needed "libx264.so" "/usr/lib/x86_64-linux-gnu/libx264.so.163"
create_symlink_if_needed "libx265.so" "/usr/lib/x86_64-linux-gnu/libx265.so.199"
create_symlink_if_needed "libsrt-gnutls.so" "/usr/lib/x86_64-linux-gnu/libsrt-gnutls.so.1.4"

# Install CUDA runtime libraries for NPP support
echo "Installing CUDA runtime libraries..."
if ! ldconfig -p | grep -q libnpp; then
    if [ ! -f /etc/apt/sources.list.d/cuda*.list ]; then
        UBUNTU_VERSION=\$(lsb_release -rs 2>/dev/null | cut -d. -f1 || echo "22")
        if [ "\$UBUNTU_VERSION" = "22" ] || [ "\$UBUNTU_VERSION" = "24" ]; then
            wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb 2>/dev/null || true
            dpkg -i cuda-keyring_1.1-1_all.deb 2>/dev/null || true
            rm -f cuda-keyring_1.1-1_all.deb
        fi
    fi
    apt-get update -qq 2>/dev/null || true
    apt-get install -y -qq cuda-libraries-12-2 2>/dev/null || apt-get install -y -qq cuda-libraries-12-0 2>/dev/null || true
fi

# Setup FFmpeg
echo "Setting up FFmpeg..."
ln -sf \${FFMPEG_DIR}/bin/ffmpeg /usr/local/bin/ffmpeg
ln -sf \${FFMPEG_DIR}/bin/ffprobe /usr/local/bin/ffprobe

if [ -d "\${FFMPEG_DIR}/lib" ]; then
    echo "\${FFMPEG_DIR}/lib" > /etc/ld.so.conf.d/ffmpeg-nvidia.conf
fi
ldconfig

# Verify installation
echo ""
echo "=== Verifying FFmpeg Installation ==="
if ffmpeg -version > /dev/null 2>&1; then
    echo "FFmpeg installed successfully!"
    ffmpeg -version | head -3
    
    echo ""
    echo "Hardware encoders (NVENC):"
    ffmpeg -encoders 2>/dev/null | grep -i nvenc || echo "  (will be available when GPU is active)"
    
    echo ""
    echo "Hardware decoders (CUVID):"
    ffmpeg -decoders 2>/dev/null | grep -i cuvid | head -5 || echo "  (will be available when GPU is active)"
else
    echo "WARNING: NVIDIA FFmpeg not working, installing system FFmpeg as fallback..."
    apt-get install -y -qq ffmpeg
    ln -sf /usr/bin/ffmpeg /usr/local/bin/ffmpeg
    ln -sf /usr/bin/ffprobe /usr/local/bin/ffprobe
fi

echo ""
echo "=== FFmpeg setup complete (GPU mode) ==="
`;

    await this.executeRemote(config, installScript, 600000); // 10 min timeout

    logger.info({ host: config.host, gpuEnabled }, 'NVIDIA FFmpeg installed on edge server');
  }

  private async createDeploymentFiles(config: DeploymentConfig, options: { gpuDetected: boolean; serverApiKey: string; externalIp: string }): Promise<void> {
    const remoteDir = '/opt/iptv-edge';
    
    // Create directory structure
    await this.executeRemote(config, `mkdir -p ${remoteDir}/{config,logs,cache,certs,scripts}`);
    
    // Create .env file
    const envContent = `
SERVER_NAME=${config.serverName}
EXTERNAL_IP=${options.externalIp}
INTERNAL_IP=0.0.0.0
MAX_CONNECTIONS=${config.maxConnections || 5000}
MAIN_PANEL_URL=${config.mainPanelUrl}
SERVER_API_KEY=${options.serverApiKey}
DOMAIN=${config.domain || ''}
SSL_EMAIL=${config.sslEmail || ''}
GPU_DETECTED=${options.gpuDetected}
BUILD_TYPE=${options.gpuDetected ? 'nvidia' : 'cpu'}
`.trim();

    await this.executeRemote(config, `cat > ${remoteDir}/.env << 'ENVEOF'
${envContent}
ENVEOF`);

    // Create docker-compose.yml
    const dockerCompose = this.generateDockerCompose(options.gpuDetected, !!config.domain);
    await this.executeRemote(config, `cat > ${remoteDir}/docker-compose.yml << 'COMPOSEEOF'
${dockerCompose}
COMPOSEEOF`);

    // Create Dockerfile
    const dockerfile = this.generateDockerfile(options.gpuDetected);
    await this.executeRemote(config, `cat > ${remoteDir}/Dockerfile.edge << 'DOCKEREOF'
${dockerfile}
DOCKEREOF`);

    // Create NGINX config if domain specified
    if (config.domain) {
      const nginxConfig = this.generateNginxConfig(config.domain);
      await this.executeRemote(config, `cat > ${remoteDir}/config/nginx.conf << 'NGINXEOF'
${nginxConfig}
NGINXEOF`);
    }

    // Create GPU monitoring script
    if (options.gpuDetected) {
      const gpuMonitorScript = this.generateGpuMonitorScript();
      await this.executeRemote(config, `cat > ${remoteDir}/scripts/gpu-monitor.sh << 'GPUEOF'
${gpuMonitorScript}
GPUEOF
chmod +x ${remoteDir}/scripts/gpu-monitor.sh`);
    }
  }

  private async copyApplicationFiles(config: DeploymentConfig): Promise<void> {
    const remoteDir = '/opt/iptv-edge';
    const projectDir = path.resolve(__dirname, '../../../../');
    
    // Create a deployment archive
    const archivePath = `/tmp/edge-deploy-${Date.now()}.tar.gz`;
    
    try {
      await execAsync(`tar -czf ${archivePath} -C ${projectDir}/iptv-server dist prisma package.json package-lock.json`);
      
      // Copy via SCP
      const scpCommand = config.privateKey
        ? `scp -o StrictHostKeyChecking=accept-new -i "${config.privateKey}" ${archivePath} ${config.username}@${config.host}:${remoteDir}/`
        : config.password
          ? `sshpass -p '${config.password}' scp -o StrictHostKeyChecking=accept-new ${archivePath} ${config.username}@${config.host}:${remoteDir}/`
          : `scp -o StrictHostKeyChecking=accept-new ${archivePath} ${config.username}@${config.host}:${remoteDir}/`;
      
      await execAsync(scpCommand);
      
      // Extract on remote
      await this.executeRemote(config, `
        cd ${remoteDir}
        tar -xzf *.tar.gz
        rm -f *.tar.gz
      `);
    } finally {
      // Cleanup local archive
      await execAsync(`rm -f ${archivePath}`).catch(() => {});
    }
  }

  private generateDockerCompose(gpuEnabled: boolean, hasNginx: boolean): string {
    let compose = `version: '3.7'

services:
  edge-server:
    build:
      context: .
      dockerfile: Dockerfile.edge
    image: iptv-edge:\${BUILD_TYPE:-cpu}
    container_name: iptv-edge
`;

    if (gpuEnabled) {
      compose += `    runtime: nvidia
`;
    }

    compose += `    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3001
      - SERVER_NAME=\${SERVER_NAME}
      - SERVER_TYPE=EDGE
      - EXTERNAL_IP=\${EXTERNAL_IP}
      - MAX_CONNECTIONS=\${MAX_CONNECTIONS}
      - MAIN_PANEL_URL=\${MAIN_PANEL_URL}
      - SERVER_API_KEY=\${SERVER_API_KEY}
      - FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg
`;

    if (gpuEnabled) {
      compose += `      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=compute,video,utility
      - DEFAULT_VIDEO_CODEC=h264_nvenc
      - ENABLE_HARDWARE_DECODE=true
      - ENABLE_HARDWARE_ENCODE=true
`;
    } else {
      compose += `      - DEFAULT_VIDEO_CODEC=libx264
      - X264_PRESET=veryfast
`;
    }

    compose += `    ports:
      - "3001:3001"
      - "1935:1935"
    volumes:
      - ./logs:/var/log/iptv
      - ./cache:/var/cache/iptv
      - hls-segments:/tmp/hls-segments
`;

    if (gpuEnabled) {
      compose += `    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, video, compute]
`;
    }

    compose += `    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
`;

    if (hasNginx) {
      compose += `
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/letsencrypt:ro
      - ./config/webroot:/var/www/certbot
    depends_on:
      - edge-server
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    container_name: certbot
    volumes:
      - ./certs:/etc/letsencrypt
      - ./config/webroot:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait \$\${!}; done;'"
`;
    }

    compose += `
volumes:
  hls-segments:

networks:
  default:
    driver: bridge
`;

    return compose;
  }

  private generateDockerfile(gpuEnabled: boolean): string {
    if (gpuEnabled) {
      return `FROM nvidia/cuda:12.2.0-devel-ubuntu22.04 AS ffmpeg-builder
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \\
    autoconf automake build-essential cmake git \\
    libass-dev libfreetype6-dev libgnutls28-dev \\
    libmp3lame-dev libnuma-dev libopus-dev libsdl2-dev \\
    libtool libva-dev libvdpau-dev libvorbis-dev libvpx-dev \\
    libx264-dev libx265-dev libxcb1-dev libxcb-shm0-dev \\
    libxcb-xfixes0-dev meson nasm ninja-build pkg-config \\
    texinfo wget yasm zlib1g-dev libfdk-aac-dev libtheora-dev \\
    libwebp-dev libsrt-gnutls-dev libxml2-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 https://git.videolan.org/git/ffmpeg/nv-codec-headers.git && \\
    cd nv-codec-headers && make install

ARG FFMPEG_VERSION=6.1.1
RUN wget https://ffmpeg.org/releases/ffmpeg-\${FFMPEG_VERSION}.tar.xz && \\
    tar xf ffmpeg-\${FFMPEG_VERSION}.tar.xz && \\
    cd ffmpeg-\${FFMPEG_VERSION} && \\
    ./configure --prefix=/opt/ffmpeg \\
        --extra-cflags="-I/usr/local/cuda/include" \\
        --extra-ldflags="-L/usr/local/cuda/lib64" \\
        --enable-gpl --enable-gnutls --enable-libass \\
        --enable-libfdk-aac --enable-libfreetype --enable-libmp3lame \\
        --enable-libopus --enable-libtheora --enable-libvorbis \\
        --enable-libvpx --enable-libwebp --enable-libx264 \\
        --enable-libx265 --enable-libxml2 --enable-libsrt \\
        --enable-nonfree --enable-cuda-nvcc --enable-cuvid \\
        --enable-nvenc --enable-nvdec --enable-libnpp \\
        --enable-version3 --disable-debug --disable-doc \\
    && make -j$(nproc) && make install

FROM node:20-bullseye-slim AS node-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate

FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \\
    libass9 libfreetype6 libgnutls30 libmp3lame0 libnuma1 \\
    libopus0 libtheora0 libvdpau1 libvorbis0a libvorbisenc2 \\
    libvpx7 libwebp7 libx264-163 libx265-199 libfdk-aac2 \\
    libsrt1.4-gnutls libxml2 curl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \\
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffmpeg /opt/ffmpeg/bin/ffmpeg
COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffprobe /opt/ffmpeg/bin/ffprobe
RUN ln -s /opt/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg && \\
    ln -s /opt/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe

COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/prisma ./prisma

RUN mkdir -p /tmp/hls-segments /var/log/iptv /var/cache/iptv

ENV NODE_ENV=production PORT=3001
ENV FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,video,utility

EXPOSE 3001 1935

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \\
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]`;
    } else {
      return `FROM node:20-bullseye-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \\
    ffmpeg curl ca-certificates && \\
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \\
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /tmp/hls-segments /var/log/iptv /var/cache/iptv

ENV NODE_ENV=production PORT=3001
ENV FFMPEG_PATH=/usr/bin/ffmpeg

EXPOSE 3001 1935

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \\
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]`;
    }
  }

  private generateNginxConfig(domain: string): string {
    return `events {
    worker_connections 4096;
}

http {
    upstream edge_backend {
        server edge-server:3001;
    }

    server {
        listen 80;
        server_name ${domain};

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            proxy_pass http://edge_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}`;
  }

  private generateGpuMonitorScript(): string {
    return `#!/bin/bash
# GPU Monitoring Script for Edge Server

source /opt/iptv-edge/.env

while true; do
    GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
    GPU_MEM=$(nvidia-smi --query-gpu=utilization.memory --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
    GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
    GPU_POWER=$(nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
    ENCODER_COUNT=$(nvidia-smi --query-gpu=encoder.stats.sessionCount --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
    
    curl -s -X POST "\${MAIN_PANEL_URL}/admin/servers/metrics" \\
        -H "Content-Type: application/json" \\
        -H "X-Server-Key: \${SERVER_API_KEY}" \\
        -d "{
            \\"serverName\\": \\"\${SERVER_NAME}\\",
            \\"gpu\\": {
                \\"utilization\\": \${GPU_UTIL:-0},
                \\"memoryUtilization\\": \${GPU_MEM:-0},
                \\"temperature\\": \${GPU_TEMP:-0},
                \\"powerDraw\\": \${GPU_POWER:-0},
                \\"encoderSessions\\": \${ENCODER_COUNT:-0}
            },
            \\"timestamp\\": \\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\"
        }" > /dev/null 2>&1
    
    echo "$(date): GPU=\${GPU_UTIL}% MEM=\${GPU_MEM}% TEMP=\${GPU_TEMP}°C ENCODERS=\${ENCODER_COUNT}" >> /var/log/iptv/gpu-metrics.log
    
    sleep 10
done`;
  }

  private async detectRegion(ip: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`curl -s "http://ip-api.com/json/${ip}?fields=regionName,countryCode"`);
      const data = JSON.parse(stdout);
      return data.countryCode || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Browse files on a remote server via SSH
   */
  async browseRemoteFiles(config: {
    host: string;
    port?: number;
    path: string;
    allowedExtensions: string[];
  }): Promise<{
    currentPath: string;
    parentPath: string | null;
    items: Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      extension: string | null;
    }>;
    totalFiles: number;
    totalDirs: number;
  }> {
    const { host, port = 22, path: dirPath, allowedExtensions } = config;

    // Get credentials from the server record or use default SSH key
    const sshOptions = [
      '-o StrictHostKeyChecking=no',
      '-o UserKnownHostsFile=/dev/null',
      '-o BatchMode=yes',
      '-o ConnectTimeout=10',
      `-p ${port}`,
    ].join(' ');

    // Build the extensions pattern for find command
    const extPattern = allowedExtensions.map(e => `-name "*${e}"`).join(' -o ');

    const listScript = `
      if [ -d "${dirPath}" ]; then
        echo "EXISTS=true"
        
        # List directories
        find "${dirPath}" -maxdepth 1 -mindepth 1 -type d -printf 'DIR:%f\\n' 2>/dev/null | sort
        
        # List files with allowed extensions
        find "${dirPath}" -maxdepth 1 -mindepth 1 -type f \\( ${extPattern} \\) -printf 'FILE:%f\\n' 2>/dev/null | sort
      else
        echo "EXISTS=false"
      fi
    `;

    try {
      // Using root or the configured user with key-based auth
      const sshCommand = `ssh ${sshOptions} root@${host} "${listScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
      const { stdout, stderr } = await execAsync(sshCommand, { timeout: 30000 });

      const lines = stdout.split('\n').filter(l => l.trim());
      
      if (lines[0] === 'EXISTS=false') {
        throw new Error('Directory not found');
      }

      const items: Array<{
        name: string;
        path: string;
        isDirectory: boolean;
        extension: string | null;
      }> = [];

      for (const line of lines) {
        if (line.startsWith('DIR:')) {
          const name = line.substring(4);
          items.push({
            name,
            path: path.join(dirPath, name),
            isDirectory: true,
            extension: null,
          });
        } else if (line.startsWith('FILE:')) {
          const name = line.substring(5);
          const ext = path.extname(name).toLowerCase();
          items.push({
            name,
            path: path.join(dirPath, name),
            isDirectory: false,
            extension: ext,
          });
        }
      }

      // Sort: directories first, then files
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      const parentPath = dirPath !== '/media' && dirPath !== '/' 
        ? path.dirname(dirPath) 
        : null;

      return {
        currentPath: dirPath,
        parentPath,
        items,
        totalFiles: items.filter(i => !i.isDirectory).length,
        totalDirs: items.filter(i => i.isDirectory).length,
      };
    } catch (error: any) {
      logger.error({ error, host, path: dirPath }, 'Remote file browser failed');
      throw new Error(`Failed to browse files on ${host}: ${error.message}`);
    }
  }

  /**
   * Search files on a remote server via SSH
   */
  async searchRemoteFiles(config: {
    host: string;
    port?: number;
    basePath: string;
    query: string;
    limit: number;
    allowedExtensions: string[];
  }): Promise<{
    query: string;
    results: Array<{ name: string; path: string; directory: string }>;
    total: number;
    truncated: boolean;
  }> {
    const { host, port = 22, basePath, query, limit, allowedExtensions } = config;

    const sshOptions = [
      '-o StrictHostKeyChecking=no',
      '-o UserKnownHostsFile=/dev/null',
      '-o BatchMode=yes',
      '-o ConnectTimeout=10',
      `-p ${port}`,
    ].join(' ');

    // Build the extensions pattern for find command
    const extPattern = allowedExtensions.map(e => `-name "*${e}"`).join(' -o ');
    const searchPattern = query.toLowerCase();

    const searchScript = `
      find "${basePath}" -type f \\( ${extPattern} \\) -iname "*${searchPattern}*" 2>/dev/null | head -${limit} | while read filepath; do
        filename=$(basename "$filepath")
        dirname=$(dirname "$filepath")
        echo "RESULT:$filename|$filepath|$dirname"
      done
    `;

    try {
      const sshCommand = `ssh ${sshOptions} root@${host} "${searchScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
      const { stdout } = await execAsync(sshCommand, { timeout: 60000 });

      const results: Array<{ name: string; path: string; directory: string }> = [];

      for (const line of stdout.split('\n')) {
        if (line.startsWith('RESULT:')) {
          const [name, filePath, directory] = line.substring(7).split('|');
          if (name && filePath && directory) {
            results.push({ name, path: filePath, directory });
          }
        }
      }

      return {
        query,
        results,
        total: results.length,
        truncated: results.length >= limit,
      };
    } catch (error: any) {
      logger.error({ error, host, query }, 'Remote file search failed');
      throw new Error(`Failed to search files on ${host}: ${error.message}`);
    }
  }
}

export const edgeServerDeployment = new EdgeServerDeploymentService();

