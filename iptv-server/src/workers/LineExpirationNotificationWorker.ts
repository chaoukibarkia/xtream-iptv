import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import { notificationService } from '../api/routes/notifications.js';

interface WorkerConfig {
  // Check interval in milliseconds
  checkInterval: number;
  // How many days before expiration to start warning
  warningDaysBefore: number[];
  // Enable/disable
  enabled: boolean;
}

const DEFAULT_CONFIG: WorkerConfig = {
  checkInterval: 60 * 60 * 1000, // 1 hour
  warningDaysBefore: [30, 7, 3, 1], // Warn at 30, 7, 3, and 1 day(s) before expiration
  enabled: true,
};

export class LineExpirationNotificationWorker {
  private config: WorkerConfig;
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config?: Partial<WorkerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the worker
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Line expiration notification worker disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Line expiration notification worker already running');
      return;
    }

    this.isRunning = true;

    // Run initial check after 5 minutes (let server start up)
    setTimeout(() => {
      this.checkExpiringLines().catch((err) =>
        logger.error({ err }, 'Initial line expiration check failed')
      );
    }, 5 * 60 * 1000);

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.checkExpiringLines().catch((err) =>
        logger.error({ err }, 'Line expiration check failed')
      );
    }, this.config.checkInterval);

    logger.info(
      {
        checkInterval: `${this.config.checkInterval / 60000} minutes`,
        warningDaysBefore: this.config.warningDaysBefore.join(', ') + ' days',
      },
      'Line expiration notification worker started'
    );
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.isRunning = false;
    logger.info('Line expiration notification worker stopped');
  }

  /**
   * Check for expiring lines and send notifications
   */
  private async checkExpiringLines(): Promise<void> {
    try {
      logger.debug('Checking for expiring IPTV lines...');

      const now = new Date();
      let totalNotificationsSent = 0;

      // Check each warning threshold
      for (const daysBefore of this.config.warningDaysBefore) {
        const warningDate = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000);
        const notificationsSent = await this.processExpiringLines(warningDate, daysBefore);
        totalNotificationsSent += notificationsSent;
      }

      // Check for already expired lines
      const expiredNotificationsSent = await this.processExpiredLines(now);
      totalNotificationsSent += expiredNotificationsSent;

      if (totalNotificationsSent > 0) {
        logger.info(
          { totalNotificationsSent },
          'Line expiration notifications sent'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Error during line expiration check');
      throw error;
    }
  }

  /**
   * Process lines expiring at a specific date and send notifications
   */
  private async processExpiringLines(warningDate: Date, daysBefore: number): Promise<number> {
    // Find lines expiring around this date (within 1 hour window to account for check frequency)
    const windowStart = new Date(warningDate.getTime() - 30 * 60 * 1000); // 30 minutes before
    const windowEnd = new Date(warningDate.getTime() + 30 * 60 * 1000);   // 30 minutes after

    const expiringLines = await prisma.iptvLine.findMany({
      where: {
        expiresAt: {
          gte: windowStart,
          lte: windowEnd,
        },
        status: 'active',
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            role: true,
            parentId: true,
          },
        },
      },
    });

    if (expiringLines.length === 0) {
      return 0;
    }

    let notificationsSent = 0;

    for (const line of expiringLines) {
      try {
        // Check if we already sent this type of notification for this line
        const recentNotifications = await prisma.notification.findMany({
          where: {
            userId: line.ownerId || 1, // Fallback to admin if no owner
            type: 'LINE',
            message: {
              contains: `Line ${line.username}`,
            },
            createdAt: {
              gte: new Date(Date.now() - 12 * 60 * 60 * 1000), // Within last 12 hours
            },
          },
        });

        // Skip if we already sent a notification for this line recently
        if (recentNotifications.length > 0) {
          continue;
        }

        const message = daysBefore > 1 
          ? `Line ${line.username} will expire in ${daysBefore} days on ${line.expiresAt?.toLocaleDateString()}.`
          : `Line ${line.username} will expire tomorrow on ${line.expiresAt?.toLocaleDateString()}.`;

        const title = daysBefore > 1
          ? `Line Expiring in ${daysBefore} Days`
          : 'Line Expiring Tomorrow';

        // Notify the owner of the line
        if (line.ownerId) {
          await notificationService.create({
            userId: line.ownerId,
            type: 'LINE',
            title,
            message,
          });
          notificationsSent++;
        }

        // Also notify the parent reseller if applicable
        if (line.owner?.parentId) {
          await notificationService.create({
            userId: line.owner.parentId,
            type: 'LINE',
            title: `Sub-Reseller's ${title}`,
            message: `${line.owner.username}'s line ${line.username} will expire ${daysBefore > 1 ? `in ${daysBefore} days` : 'tomorrow'} on ${line.expiresAt?.toLocaleDateString()}.`,
          });
          notificationsSent++;
        }

        logger.debug(
          { lineId: line.id, username: line.username, daysBefore, ownerId: line.ownerId },
          'Sent line expiration warning notification'
        );
      } catch (error) {
        logger.error(
          { error, lineId: line.id, username: line.username },
          'Failed to send line expiration notification'
        );
      }
    }

    return notificationsSent;
  }

  /**
   * Process lines that have already expired and send notifications
   */
  private async processExpiredLines(now: Date): Promise<number> {
    // Find lines that expired within the last 24 hours and are still active
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const expiredLines = await prisma.iptvLine.findMany({
      where: {
        expiresAt: {
          gte: oneDayAgo,
          lt: now,
        },
        status: 'active', // Still marked as active but expired
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            role: true,
            parentId: true,
          },
        },
      },
    });

    if (expiredLines.length === 0) {
      return 0;
    }

    let notificationsSent = 0;

    for (const line of expiredLines) {
      try {
        // Check if we already sent an expiration notification for this line
        const existingNotifications = await prisma.notification.findMany({
          where: {
            userId: line.ownerId || 1,
            type: 'ERROR',
            message: {
              contains: `Line ${line.username} has expired`,
            },
          },
        });

        // Skip if we already sent an expiration notification
        if (existingNotifications.length > 0) {
          continue;
        }

        const message = `Line ${line.username} has expired on ${line.expiresAt?.toLocaleDateString()}. The line is no longer active and needs to be renewed.`;
        const title = 'Line Expired';

        // Notify the owner of the line
        if (line.ownerId) {
          await notificationService.create({
            userId: line.ownerId,
            type: 'ERROR',
            title,
            message,
          });
          notificationsSent++;
        }

        // Also notify the parent reseller if applicable
        if (line.owner?.parentId) {
          await notificationService.create({
            userId: line.owner.parentId,
            type: 'ERROR',
            title: `Sub-Reseller's ${title}`,
            message: `${line.owner.username}'s line ${line.username} has expired on ${line.expiresAt?.toLocaleDateString()}.`,
          });
          notificationsSent++;
        }

        // Optionally mark the line as expired in the database
        // (You might want to have a separate status for expired lines)
        // await prisma.iptvLine.update({
        //   where: { id: line.id },
        //   data: { status: 'expired' },
        // });

        logger.debug(
          { lineId: line.id, username: line.username, ownerId: line.ownerId },
          'Sent line expiration notification'
        );
      } catch (error) {
        logger.error(
          { error, lineId: line.id, username: line.username },
          'Failed to send line expired notification'
        );
      }
    }

    return notificationsSent;
  }

  /**
   * Manually trigger a check (useful for testing or forced runs)
   */
  async manualCheck(): Promise<void> {
    logger.info('Manual line expiration check triggered');
    await this.checkExpiringLines();
  }
}

// Export singleton
export const lineExpirationNotificationWorker = new LineExpirationNotificationWorker();