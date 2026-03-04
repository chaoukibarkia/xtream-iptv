/**
 * Monitoring Services
 * 
 * Provides stream health monitoring capabilities:
 * - StreamHealthMonitor: Basic URL reachability checks for all streams
 * - AlwaysOnHealthMonitor: Comprehensive health checks for always-on streams
 *   - Audio silence detection
 *   - Frozen video detection
 *   - Process resource monitoring (CPU/Memory)
 *   - Automatic recovery with restart
 */

export {
  StreamHealthMonitor,
  streamHealthMonitor,
  HealthStatus,
  StreamHealth,
} from './StreamHealthMonitor.js';

export {
  AlwaysOnHealthMonitor,
  alwaysOnHealthMonitor,
  // Helper functions
  checkAudio,
  isVideoFrozen,
  getProcessMetrics,
  isProcessResponsive,
  checkHttpStream,
  restartStream,
  // Types
  HealthCheckConfig,
  StreamHealthStatus,
  HealthIssue,
  ProcessMetrics,
  AudioStatus,
  VideoStatus,
  HealthCheckResult,
} from './AlwaysOnHealthMonitor.js';


