import { EventEmitter } from 'events';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

interface RelaySession {
  streamId: number;
  server: net.Server;
  clients: Set<net.Socket>;
  ffmpegProcess: ChildProcess | null;
  sourcePath: string; // Can be a pipe or file
  port: number;
}

/**
 * MPEG-TS Relay Service
 * 
 * Creates a TCP server per stream that accepts multiple child connections.
 * Reads MPEG-TS from a named pipe (written by FFmpeg) and broadcasts to all connected children.
 */
class MpegtsRelayService extends EventEmitter {
  private sessions: Map<number, RelaySession> = new Map();
  private readonly pipeBasePath: string;

  constructor() {
    super();
    this.pipeBasePath = path.join(config.ffmpeg.hlsSegmentPath, 'pipes');
  }

  /**
   * Start a relay server for a stream
   * @param streamId - The stream ID
   * @param port - TCP port to listen on (default: 9000 + streamId)
   * @returns The pipe path that FFmpeg should write to
   */
  async startRelay(streamId: number, port?: number): Promise<string> {
    const relayPort = port || 9000 + streamId;
    
    // Stop existing relay if any
    if (this.sessions.has(streamId)) {
      await this.stopRelay(streamId);
    }

    // Create pipes directory
    await fs.promises.mkdir(this.pipeBasePath, { recursive: true });

    // Create named pipe for FFmpeg to write to
    const pipePath = path.join(this.pipeBasePath, `stream_${streamId}.ts`);
    
    // Remove existing pipe if any
    try {
      await fs.promises.unlink(pipePath);
    } catch {
      // Ignore if doesn't exist
    }

    // Create named pipe (FIFO)
    await new Promise<void>((resolve, reject) => {
      const mkfifo = spawn('mkfifo', [pipePath]);
      mkfifo.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`mkfifo failed with code ${code}`));
      });
    });

    // Create TCP server
    const clients = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
      logger.info({ streamId, clientAddr, port: relayPort }, 'Child server connected to MPEG-TS relay');
      
      clients.add(socket);
      
      socket.on('close', () => {
        clients.delete(socket);
        logger.info({ streamId, clientAddr }, 'Child server disconnected from MPEG-TS relay');
      });
      
      socket.on('error', (err) => {
        logger.warn({ streamId, clientAddr, error: err.message }, 'Child socket error');
        clients.delete(socket);
      });
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      server.listen(relayPort, '0.0.0.0', () => {
        logger.info({ streamId, port: relayPort, pipePath }, 'MPEG-TS relay server started');
        resolve();
      });
      server.on('error', reject);
    });

    // Create session
    const session: RelaySession = {
      streamId,
      server,
      clients,
      ffmpegProcess: null,
      sourcePath: pipePath,
      port: relayPort,
    };
    this.sessions.set(streamId, session);

    // Start reading from pipe and broadcasting to clients
    this.startBroadcasting(session);

    return pipePath;
  }

  /**
   * Start reading from pipe and broadcasting to all connected clients
   */
  private startBroadcasting(session: RelaySession): void {
    const { streamId, sourcePath, clients } = session;
    
    // Open pipe for reading (this will block until FFmpeg starts writing)
    const readStream = fs.createReadStream(sourcePath, {
      highWaterMark: 188 * 7 * 128, // MPEG-TS packet size * 7 packets * 128 = ~168KB buffer
    });

    readStream.on('data', (chunk: Buffer | string) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      // Broadcast to all connected clients
      for (const client of clients) {
        if (!client.destroyed) {
          client.write(data, (err) => {
            if (err) {
              logger.warn({ streamId, error: err.message }, 'Failed to write to child client');
              clients.delete(client);
              client.destroy();
            }
          });
        }
      }
    });

    readStream.on('error', (err) => {
      logger.error({ streamId, error: err.message }, 'Pipe read error');
    });

    readStream.on('end', () => {
      logger.info({ streamId }, 'Pipe stream ended');
    });

    logger.info({ streamId, pipePath: sourcePath }, 'Started broadcasting from pipe');
  }

  /**
   * Stop a relay server
   */
  async stopRelay(streamId: number): Promise<void> {
    const session = this.sessions.get(streamId);
    if (!session) return;

    // Close all client connections
    for (const client of session.clients) {
      client.destroy();
    }
    session.clients.clear();

    // Close server
    await new Promise<void>((resolve) => {
      session.server.close(() => resolve());
    });

    // Remove pipe
    try {
      await fs.promises.unlink(session.sourcePath);
    } catch {
      // Ignore
    }

    this.sessions.delete(streamId);
    logger.info({ streamId, port: session.port }, 'MPEG-TS relay stopped');
  }

  /**
   * Get the pipe path for a stream (for FFmpeg to write to)
   */
  getPipePath(streamId: number): string | null {
    const session = this.sessions.get(streamId);
    return session?.sourcePath || null;
  }

  /**
   * Get the relay port for a stream
   */
  getRelayPort(streamId: number): number | null {
    const session = this.sessions.get(streamId);
    return session?.port || null;
  }

  /**
   * Check if a relay is running for a stream
   */
  isRunning(streamId: number): boolean {
    return this.sessions.has(streamId);
  }

  /**
   * Stop all relays
   */
  async stopAll(): Promise<void> {
    const streamIds = Array.from(this.sessions.keys());
    await Promise.all(streamIds.map(id => this.stopRelay(id)));
  }
}

export const mpegtsRelayService = new MpegtsRelayService();

