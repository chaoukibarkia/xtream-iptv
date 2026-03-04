"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useTestSshConnection,
  useProbeServer,
  useStartDeployment,
  useDeploymentStatus,
  useCancelDeployment,
  type ServerProbeResult,
  type DeploymentStatus,
  type DeploymentStep,
} from "@/lib/api/hooks/useServers";
import { useToast } from "@/hooks/use-toast";
import {
  Server,
  Globe,
  Key,
  Lock,
  Cpu,
  HardDrive,
  MemoryStick,
  Wifi,
  Check,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  Play,
  Shield,
  Zap,
  Terminal,
  Box,
  Settings,
  Rocket,
  Copy,
} from "lucide-react";

interface EdgeServerDeployWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeploymentComplete?: (serverId: number, apiKey: string) => void;
}

type WizardStep = "connection" | "probe" | "configure" | "deploy" | "complete";

export function EdgeServerDeployWizard({
  open,
  onOpenChange,
  onDeploymentComplete,
}: EdgeServerDeployWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("connection");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  
  // Connection form state
  const [connectionForm, setConnectionForm] = useState({
    host: "",
    port: 22,
    username: "root",
    password: "",
    privateKey: "",
  });
  
  // Server configuration state
  const [configForm, setConfigForm] = useState({
    serverName: "",
    externalIp: "",
    domain: "",
    sslEmail: "",
    maxConnections: 5000,
    skipNvidia: false,
    skipHttps: true,
    deploymentMode: "native" as "docker" | "native",
  });
  
  // Probe result
  const [probeResult, setProbeResult] = useState<ServerProbeResult | null>(null);
  
  // Deployment tracking
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<DeploymentStatus | null>(null);
  
  // Mutations
  const testConnection = useTestSshConnection();
  const probeServer = useProbeServer();
  const startDeployment = useStartDeployment();
  const cancelDeployment = useCancelDeployment();
  
  // Deployment status polling
  const { data: deploymentStatus } = useDeploymentStatus(
    step === "deploy" ? deploymentId : null,
    { refetchInterval: 2000 }
  );
  
  // Track deployment completion
  useEffect(() => {
    if (deploymentStatus && (deploymentStatus.status === "completed" || deploymentStatus.status === "failed")) {
      setFinalStatus(deploymentStatus);
      if (deploymentStatus.status === "completed") {
        setStep("complete");
        if (deploymentStatus.serverId && deploymentStatus.apiKey) {
          onDeploymentComplete?.(deploymentStatus.serverId, deploymentStatus.apiKey);
        }
      }
    }
  }, [deploymentStatus, onDeploymentComplete]);
  
  // Reset wizard when closing
  const handleClose = () => {
    if (step === "deploy" && deploymentId) {
      // Confirm before closing during deployment
      if (!confirm("Deployment is in progress. Are you sure you want to close?")) {
        return;
      }
    }
    setStep("connection");
    setProbeResult(null);
    setDeploymentId(null);
    setFinalStatus(null);
    setConnectionForm({
      host: "",
      port: 22,
      username: "root",
      password: "",
      privateKey: "",
    });
    setConfigForm({
      serverName: "",
      externalIp: "",
      domain: "",
      sslEmail: "",
      maxConnections: 5000,
      skipNvidia: false,
      skipHttps: true,
      deploymentMode: "native",
    });
    onOpenChange(false);
  };
  
  // Test SSH connection
  const handleTestConnection = async () => {
    try {
      const result = await testConnection.mutateAsync({
        host: connectionForm.host,
        port: connectionForm.port,
        username: connectionForm.username,
        password: authMethod === "password" ? connectionForm.password : undefined,
        privateKey: authMethod === "key" ? connectionForm.privateKey : undefined,
      });
      
      if (result.success) {
        toast({ title: "Success", description: "SSH connection successful!" });
        // Probe the server
        handleProbeServer();
      } else {
        toast({ title: "Error", description: `Connection failed: ${result.error}`, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Connection test failed", variant: "destructive" });
    }
  };
  
  // Probe server for system info
  const handleProbeServer = async () => {
    try {
      const result = await probeServer.mutateAsync({
        host: connectionForm.host,
        port: connectionForm.port,
        username: connectionForm.username,
        password: authMethod === "password" ? connectionForm.password : undefined,
        privateKey: authMethod === "key" ? connectionForm.privateKey : undefined,
      });
      
      setProbeResult(result);
      
      // Auto-fill some config
      if (!configForm.externalIp && connectionForm.host) {
        setConfigForm(prev => ({ ...prev, externalIp: connectionForm.host }));
      }
      
      setStep("probe");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Server probe failed", variant: "destructive" });
    }
  };
  
  // Start deployment
  const handleStartDeployment = async () => {
    try {
      const result = await startDeployment.mutateAsync({
        host: connectionForm.host,
        port: connectionForm.port,
        username: connectionForm.username,
        password: authMethod === "password" ? connectionForm.password : undefined,
        privateKey: authMethod === "key" ? connectionForm.privateKey : undefined,
        serverName: configForm.serverName,
        externalIp: configForm.externalIp || undefined,
        domain: configForm.domain || undefined,
        sslEmail: configForm.sslEmail || undefined,
        maxConnections: configForm.maxConnections,
        skipNvidia: configForm.skipNvidia,
        skipHttps: configForm.skipHttps,
        deploymentMode: configForm.deploymentMode,
      });
      
      setDeploymentId(result.deploymentId);
      setStep("deploy");
      toast({ title: "Success", description: "Deployment started!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to start deployment", variant: "destructive" });
    }
  };
  
  // Cancel deployment
  const handleCancelDeployment = async () => {
    if (!deploymentId) return;
    
    if (!confirm("Are you sure you want to cancel this deployment?")) return;
    
    try {
      await cancelDeployment.mutateAsync(deploymentId);
      toast({ title: "Info", description: "Deployment cancelled" });
      handleClose();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to cancel deployment", variant: "destructive" });
    }
  };
  
  // Get step icon
  const getStepIcon = (stepStatus: DeploymentStep["status"]) => {
    switch (stepStatus) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-gray-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-300" />;
    }
  };
  
  // Format step name for display
  const formatStepName = (name: string): string => {
    const names: Record<string, string> = {
      ssh_connection: "SSH Connection",
      system_probe: "System Detection",
      prerequisites: "Prerequisites",
      docker_setup: "Docker Installation",
      nvidia_driver: "NVIDIA Driver",
      nvidia_patch: "NVIDIA Patch (Unlimited NVENC)",
      nvidia_toolkit: "NVIDIA Container Toolkit",
      copy_ffmpeg: "Copy Pre-built FFmpeg",
      create_config: "Configuration",
      copy_files: "Copy Application Files",
      start_services: "Start Services",
      ssl_setup: "SSL Certificate",
      register_server: "Register Server",
      verification: "Verification",
    };
    return names[name] || name;
  };
  
  // Get status color
  const getStatusColor = (status: DeploymentStatus["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "connecting":
      case "detecting":
        return "bg-blue-500";
      case "installing":
      case "configuring":
        return "bg-yellow-500";
      case "building":
        return "bg-purple-500";
      case "starting":
        return "bg-cyan-500";
      default:
        return "bg-gray-500";
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-500" />
            Deploy Edge Server
          </DialogTitle>
          <DialogDescription>
            Automatically install and configure a new edge streaming server
          </DialogDescription>
        </DialogHeader>
        
        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 py-4 border-b">
          {(["connection", "probe", "configure", "deploy", "complete"] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  step === s
                    ? "bg-blue-500 text-white"
                    : ["complete"].includes(step) || 
                      (step === "deploy" && i < 3) ||
                      (step === "configure" && i < 2) ||
                      (step === "probe" && i < 1)
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {i + 1}
              </div>
              {i < 4 && (
                <div
                  className={`w-12 h-0.5 mx-1 ${
                    ["complete"].includes(step) ||
                    (step === "deploy" && i < 3) ||
                    (step === "configure" && i < 2) ||
                    (step === "probe" && i < 1)
                      ? "bg-green-500"
                      : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        
        <ScrollArea className="flex-1 px-1">
          {/* Step 1: Connection */}
          {step === "connection" && (
            <div className="space-y-6 py-4">
              <div className="grid gap-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="host">Server IP / Hostname</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="host"
                        placeholder="192.168.1.100 or server.example.com"
                        value={connectionForm.host}
                        onChange={(e) => setConnectionForm({ ...connectionForm, host: e.target.value })}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">SSH Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={connectionForm.port}
                      onChange={(e) => setConnectionForm({ ...connectionForm, port: parseInt(e.target.value) || 22 })}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <Server className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="username"
                      placeholder="root"
                      value={connectionForm.username}
                      onChange={(e) => setConnectionForm({ ...connectionForm, username: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Authentication Method</Label>
                  <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as "password" | "key")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="password" className="flex items-center gap-2">
                        <Lock className="h-4 w-4" /> Password
                      </TabsTrigger>
                      <TabsTrigger value="key" className="flex items-center gap-2">
                        <Key className="h-4 w-4" /> SSH Key
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="password" className="mt-4">
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          type="password"
                          placeholder="SSH Password"
                          value={connectionForm.password}
                          onChange={(e) => setConnectionForm({ ...connectionForm, password: e.target.value })}
                          className="pl-10"
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="key" className="mt-4">
                      <Textarea
                        placeholder="Paste your private SSH key here (e.g., contents of ~/.ssh/id_rsa)"
                        value={connectionForm.privateKey}
                        onChange={(e) => setConnectionForm({ ...connectionForm, privateKey: e.target.value })}
                        rows={5}
                        className="font-mono text-xs"
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  The server must be running Ubuntu 20.04+ or Debian 11+ with SSH access enabled.
                  Root access or sudo privileges are required for installation.
                </AlertDescription>
              </Alert>
              
              <div className="flex justify-end">
                <Button
                  onClick={handleTestConnection}
                  disabled={!connectionForm.host || !connectionForm.username || testConnection.isPending || probeServer.isPending}
                >
                  {testConnection.isPending || probeServer.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {testConnection.isPending ? "Testing..." : "Probing..."}
                    </>
                  ) : (
                    <>
                      <Wifi className="h-4 w-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          
          {/* Step 2: Probe Results */}
          {step === "probe" && probeResult && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Operating System
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold capitalize">{probeResult.os || "Unknown"}</div>
                    <div className="text-sm text-muted-foreground">
                      Version {probeResult.osVersion || "?"} • Kernel {probeResult.kernel || "?"}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      CPU & Memory
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{probeResult.cpuCores || "?"} Cores</div>
                    <div className="text-sm text-muted-foreground">
                      {probeResult.memoryGb || "?"}GB RAM • {probeResult.diskGb || "?"}GB Disk
                    </div>
                  </CardContent>
                </Card>
                
                <Card className={probeResult.gpuDetected ? "border-green-500/50 bg-green-500/5" : ""}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      GPU (Hardware Transcoding)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {probeResult.gpuDetected ? (
                      <>
                        <div className="text-2xl font-bold text-green-600">{probeResult.gpuModel || "Detected"}</div>
                        <div className="text-sm text-muted-foreground">
                          {probeResult.gpuMemory || "?"} • Driver {probeResult.gpuDriverVersion || "Not installed"}
                        </div>
                        <Badge className="mt-2 bg-green-500">NVENC Available</Badge>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-gray-400">No GPU Detected</div>
                        <div className="text-sm text-muted-foreground">
                          Software transcoding will be used (CPU intensive)
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
                
                <Card className={probeResult.dockerInstalled ? "border-blue-500/50 bg-blue-500/5" : ""}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Box className="h-4 w-4" />
                      Docker
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {probeResult.dockerInstalled ? (
                      <>
                        <div className="text-2xl font-bold text-blue-600">Installed</div>
                        <div className="text-sm text-muted-foreground">
                          Version {probeResult.dockerVersion || "?"}
                        </div>
                        {probeResult.nvidiaDockertoolkit && (
                          <Badge className="mt-2 bg-blue-500">NVIDIA Runtime Ready</Badge>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-yellow-600">Not Installed</div>
                        <div className="text-sm text-muted-foreground">
                          Will be installed during deployment
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
              
              {probeResult.gpuDetected && (
                <Alert className="bg-green-500/10 border-green-500/30">
                  <Zap className="h-4 w-4 text-green-500" />
                  <AlertDescription className="text-green-700 dark:text-green-300">
                    <strong>NVIDIA GPU detected!</strong> The nvidia-patch will be applied to unlock unlimited 
                    NVENC sessions, enabling high-density hardware transcoding without the consumer driver limit.
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("connection")}>
                  Back
                </Button>
                <Button onClick={() => setStep("configure")}>
                  Continue to Configuration
                </Button>
              </div>
            </div>
          )}
          
          {/* Step 3: Configure */}
          {step === "configure" && (
            <div className="space-y-6 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="serverName">Server Name *</Label>
                  <Input
                    id="serverName"
                    placeholder="edge-server-01"
                    value={configForm.serverName}
                    onChange={(e) => setConfigForm({ ...configForm, serverName: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    A unique name to identify this server in the panel
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="externalIp">External IP Address</Label>
                    <Input
                      id="externalIp"
                      placeholder="Leave empty to use connection IP"
                      value={configForm.externalIp}
                      onChange={(e) => setConfigForm({ ...configForm, externalIp: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxConnections">Max Connections</Label>
                    <Input
                      id="maxConnections"
                      type="number"
                      value={configForm.maxConnections}
                      onChange={(e) => setConfigForm({ ...configForm, maxConnections: parseInt(e.target.value) || 5000 })}
                    />
                  </div>
                </div>
                
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    SSL Configuration (Optional)
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="domain">Domain Name</Label>
                      <Input
                        id="domain"
                        placeholder="edge1.example.com"
                        value={configForm.domain}
                        onChange={(e) => setConfigForm({ ...configForm, domain: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sslEmail">SSL Email</Label>
                      <Input
                        id="sslEmail"
                        type="email"
                        placeholder="admin@example.com"
                        value={configForm.sslEmail}
                        onChange={(e) => setConfigForm({ ...configForm, sslEmail: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Skip HTTPS Setup</Label>
                      <p className="text-xs text-muted-foreground">Enable if you'll configure SSL manually later</p>
                    </div>
                    <Switch
                      checked={configForm.skipHttps}
                      onCheckedChange={(checked) => setConfigForm({ ...configForm, skipHttps: checked })}
                    />
                  </div>
                </div>
                
                {/* Deployment Mode Selection */}
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Deployment Mode
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Choose how to install the edge server on the target machine
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                        configForm.deploymentMode === "native"
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground/50"
                      }`}
                      onClick={() => setConfigForm({ ...configForm, deploymentMode: "native" })}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Terminal className="h-5 w-5" />
                        <span className="font-medium">Native (Recommended)</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Install directly on the OS with systemd. Best performance, easier debugging.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">Node.js</Badge>
                        <Badge variant="outline" className="text-xs">PM2/systemd</Badge>
                      </div>
                    </div>
                    
                    <div
                      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                        configForm.deploymentMode === "docker"
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground/50"
                      }`}
                      onClick={() => setConfigForm({ ...configForm, deploymentMode: "docker" })}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Box className="h-5 w-5" />
                        <span className="font-medium">Docker</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Run in Docker containers. Isolated environment, easier rollback.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">Docker</Badge>
                        <Badge variant="outline" className="text-xs">Compose</Badge>
                      </div>
                    </div>
                  </div>
                </div>
                
                {probeResult?.gpuDetected && (
                  <div className="border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      GPU Configuration
                    </h4>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Skip NVIDIA Setup</Label>
                        <p className="text-xs text-muted-foreground">
                          Only enable if NVIDIA drivers are already fully configured
                        </p>
                      </div>
                      <Switch
                        checked={configForm.skipNvidia}
                        onCheckedChange={(checked) => setConfigForm({ ...configForm, skipNvidia: checked })}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("probe")}>
                  Back
                </Button>
                <Button
                  onClick={handleStartDeployment}
                  disabled={!configForm.serverName || startDeployment.isPending}
                >
                  {startDeployment.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4 mr-2" />
                      Start Deployment
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          
          {/* Step 4: Deploy */}
          {step === "deploy" && deploymentStatus && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-2">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getStatusColor(deploymentStatus.status)}`}>
                  {deploymentStatus.status === "completed" ? (
                    <Check className="h-8 w-8 text-white" />
                  ) : deploymentStatus.status === "failed" ? (
                    <X className="h-8 w-8 text-white" />
                  ) : (
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  )}
                </div>
                <h3 className="text-xl font-semibold capitalize">
                  {deploymentStatus.status === "completed" ? "Deployment Complete!" :
                   deploymentStatus.status === "failed" ? "Deployment Failed" :
                   `${deploymentStatus.status}...`}
                </h3>
                <p className="text-muted-foreground">{deploymentStatus.currentStep}</p>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{deploymentStatus.progress}%</span>
                </div>
                <Progress value={deploymentStatus.progress} className="h-2" />
              </div>
              
              {deploymentStatus.gpuDetected && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-2 rounded">
                  <Zap className="h-4 w-4" />
                  <span>GPU Detected: {deploymentStatus.gpuModel || "NVIDIA"} - Hardware transcoding enabled</span>
                </div>
              )}
              
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">Deployment Steps</h4>
                <div className="space-y-2">
                  {deploymentStatus.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      {getStepIcon(s.status)}
                      <span className={s.status === "running" ? "font-medium" : ""}>
                        {formatStepName(s.name)}
                      </span>
                      {s.message && (
                        <span className="text-muted-foreground text-xs ml-auto max-w-[300px] truncate">
                          {s.message}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {deploymentStatus.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{deploymentStatus.error}</AlertDescription>
                </Alert>
              )}
              
              <div className="flex justify-between">
                <Button
                  variant="destructive"
                  onClick={handleCancelDeployment}
                  disabled={deploymentStatus.status === "completed" || deploymentStatus.status === "failed"}
                >
                  Cancel Deployment
                </Button>
                {deploymentStatus.status === "failed" && (
                  <Button variant="outline" onClick={() => setStep("configure")}>
                    Try Again
                  </Button>
                )}
              </div>
            </div>
          )}
          
          {/* Step 5: Complete */}
          {step === "complete" && finalStatus && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500">
                  <Check className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-2xl font-bold">Deployment Successful!</h3>
                <p className="text-muted-foreground">
                  Your edge server <strong>{finalStatus.serverName}</strong> has been deployed and registered.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Server ID</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{finalStatus.serverId}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Host</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-mono">{finalStatus.host}</div>
                  </CardContent>
                </Card>
              </div>
              
              {finalStatus.apiKey && (
                <Card className="border-yellow-500/50 bg-yellow-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Server API Key
                    </CardTitle>
                    <CardDescription>
                      Save this key! It won't be shown again.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-gray-100 dark:bg-gray-800 p-2 rounded font-mono text-sm break-all">
                        {finalStatus.apiKey}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(finalStatus.apiKey!);
                          toast({ title: "Copied", description: "API key copied to clipboard" });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {finalStatus.gpuDetected && (
                <Alert className="bg-green-500/10 border-green-500/30">
                  <Zap className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    <strong>Hardware transcoding enabled!</strong> {finalStatus.gpuModel} with nvidia-patch applied 
                    for unlimited NVENC sessions.
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="flex justify-end">
                <Button onClick={handleClose}>
                  Close Wizard
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

