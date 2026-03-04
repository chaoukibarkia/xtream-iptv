import { logger } from '../config/logger.js';

/**
 * Safe process utilities that avoid shell command injection.
 * Uses Node.js native process methods instead of exec().
 */

/**
 * Check if a process with the given PID is running.
 * Uses process.kill with signal 0 (doesn't actually send a signal, just checks if process exists).
 */
export function isProcessRunning(pid: number): boolean {
  // Validate PID is a positive integer
  if (!Number.isInteger(pid) || pid <= 0) {
    logger.warn({ pid }, 'Invalid PID provided to isProcessRunning');
    return false;
  }

  try {
    // Signal 0 checks if the process exists without sending any signal
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // ESRCH = No such process
    // EPERM = Process exists but we don't have permission (still running)
    if (error.code === 'ESRCH') {
      return false;
    }
    if (error.code === 'EPERM') {
      // Process exists but we don't have permission to signal it
      return true;
    }
    logger.debug({ pid, error: error.message }, 'Error checking process');
    return false;
  }
}

/**
 * Send a signal to a process.
 * Returns true if signal was sent successfully, false otherwise.
 */
export function sendSignal(pid: number, signal: NodeJS.Signals | number): boolean {
  // Validate PID is a positive integer
  if (!Number.isInteger(pid) || pid <= 0) {
    logger.warn({ pid, signal }, 'Invalid PID provided to sendSignal');
    return false;
  }

  try {
    process.kill(pid, signal);
    return true;
  } catch (error: any) {
    // ESRCH = No such process (already dead)
    if (error.code === 'ESRCH') {
      logger.debug({ pid, signal }, 'Process not found (already terminated)');
      return false;
    }
    // EPERM = Permission denied
    if (error.code === 'EPERM') {
      logger.warn({ pid, signal }, 'Permission denied when sending signal');
      return false;
    }
    logger.error({ pid, signal, error: error.message }, 'Error sending signal');
    return false;
  }
}

/**
 * Gracefully terminate a process with SIGTERM, falling back to SIGKILL.
 */
export async function terminateProcess(pid: number, gracefulTimeoutMs: number = 3000): Promise<boolean> {
  // Validate PID
  if (!Number.isInteger(pid) || pid <= 0) {
    logger.warn({ pid }, 'Invalid PID provided to terminateProcess');
    return false;
  }

  // Check if process is running
  if (!isProcessRunning(pid)) {
    logger.debug({ pid }, 'Process not running, nothing to terminate');
    return true;
  }

  // Try graceful SIGTERM first
  logger.debug({ pid }, 'Sending SIGTERM');
  sendSignal(pid, 'SIGTERM');

  // Wait for graceful termination
  const checkInterval = 100;
  const maxChecks = Math.ceil(gracefulTimeoutMs / checkInterval);

  for (let i = 0; i < maxChecks; i++) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    if (!isProcessRunning(pid)) {
      logger.debug({ pid }, 'Process terminated gracefully');
      return true;
    }
  }

  // Force kill with SIGKILL
  logger.warn({ pid }, 'Process did not terminate gracefully, using SIGKILL');
  sendSignal(pid, 'SIGKILL');

  // Wait a bit and verify
  await new Promise(resolve => setTimeout(resolve, 500));
  const stillAlive = isProcessRunning(pid);

  if (stillAlive) {
    logger.error({ pid }, 'Process could not be killed!');
    return false;
  }

  logger.debug({ pid }, 'Process killed with SIGKILL');
  return true;
}

/**
 * Force kill a process immediately with SIGKILL.
 */
export function forceKill(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    logger.warn({ pid }, 'Invalid PID provided to forceKill');
    return false;
  }

  return sendSignal(pid, 'SIGKILL');
}
