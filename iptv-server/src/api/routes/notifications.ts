import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { z } from 'zod';
import { NotificationType } from '@prisma/client';
import { verifyToken } from './auth.js';

// Validation schemas
const createNotificationSchema = z.object({
  userId: z.number().int().optional(), // If not provided, creates for current user
  type: z.nativeEnum(NotificationType).default(NotificationType.INFO),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  link: z.string().url().optional(),
});

const markReadSchema = z.object({
  notificationIds: z.array(z.number().int()).min(1),
});

/**
 * Helper to get user from JWT token
 */
async function getUserFromToken(request: FastifyRequest): Promise<{ userId: number; role: string } | null> {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const tokenData = await verifyToken(token);
  
  if (!tokenData) return null;
  
  // Get user's role from database
  const user = await prisma.user.findUnique({
    where: { id: tokenData.userId },
    select: { role: true },
  });
  
  if (!user) return null;
  
  return { userId: tokenData.userId, role: user.role };
}

/**
 * Notification service for creating notifications programmatically
 */
export const notificationService = {
  /**
   * Create a notification for a user
   */
  async create(params: {
    userId: number;
    type?: NotificationType;
    title: string;
    message: string;
    link?: string;
  }) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type || NotificationType.INFO,
          title: params.title,
          message: params.message,
          link: params.link,
        },
      });
      logger.debug({ notificationId: notification.id, userId: params.userId }, 'Notification created');
      return notification;
    } catch (error) {
      logger.error({ error, params }, 'Failed to create notification');
      throw error;
    }
  },

  /**
   * Create notifications for multiple users
   */
  async createForUsers(params: {
    userIds: number[];
    type?: NotificationType;
    title: string;
    message: string;
    link?: string;
  }) {
    try {
      const notifications = await prisma.notification.createMany({
        data: params.userIds.map(userId => ({
          userId,
          type: params.type || NotificationType.INFO,
          title: params.title,
          message: params.message,
          link: params.link,
        })),
      });
      logger.debug({ count: notifications.count }, 'Bulk notifications created');
      return notifications;
    } catch (error) {
      logger.error({ error, params }, 'Failed to create bulk notifications');
      throw error;
    }
  },

  /**
   * Create notification for all admins
   */
  async notifyAdmins(params: {
    type?: NotificationType;
    title: string;
    message: string;
    link?: string;
  }) {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    
    if (admins.length === 0) return { count: 0 };
    
    return this.createForUsers({
      userIds: admins.map(a => a.id),
      ...params,
    });
  },

  /**
   * Create notification for a reseller and their parent (if any)
   */
  async notifyResellerChain(params: {
    resellerId: number;
    type?: NotificationType;
    title: string;
    message: string;
    link?: string;
  }) {
    const reseller = await prisma.user.findUnique({
      where: { id: params.resellerId },
      select: { id: true, parentId: true },
    });

    if (!reseller) return { count: 0 };

    const userIds = [reseller.id];
    if (reseller.parentId) {
      userIds.push(reseller.parentId);
    }

    return this.createForUsers({
      userIds,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    });
  },
};

export default async function notificationRoutes(fastify: FastifyInstance) {
  /**
   * GET /admin/notifications - Get current user's notifications
   */
  fastify.get('/admin/notifications', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const { unreadOnly, limit = '20', offset = '0' } = request.query as {
      unreadOnly?: string;
      limit?: string;
      offset?: string;
    };

    const where = {
      userId: tokenData.userId,
      ...(unreadOnly === 'true' ? { isRead: false } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: tokenData.userId, isRead: false },
      }),
    ]);

    return {
      notifications,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
      unreadCount,
    };
  });

  /**
   * GET /admin/notifications/unread-count - Get unread notification count
   */
  fastify.get('/admin/notifications/unread-count', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const count = await prisma.notification.count({
      where: { userId: tokenData.userId, isRead: false },
    });

    return { count };
  });

  /**
   * POST /admin/notifications/mark-read - Mark notifications as read
   */
  fastify.post('/admin/notifications/mark-read', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const result = markReadSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    // Only mark notifications that belong to the user
    const updated = await prisma.notification.updateMany({
      where: {
        id: { in: result.data.notificationIds },
        userId: tokenData.userId,
      },
      data: { isRead: true },
    });

    return { updated: updated.count };
  });

  /**
   * POST /admin/notifications/mark-all-read - Mark all notifications as read
   */
  fastify.post('/admin/notifications/mark-all-read', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const updated = await prisma.notification.updateMany({
      where: {
        userId: tokenData.userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return { updated: updated.count };
  });

  /**
   * DELETE /admin/notifications/:id - Delete a notification
   */
  fastify.delete('/admin/notifications/:id', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const { id } = request.params as { id: string };

    // Only delete if it belongs to the user
    const notification = await prisma.notification.findFirst({
      where: { id: parseInt(id), userId: tokenData.userId },
    });

    if (!notification) {
      return reply.status(404).send({ error: 'Notification not found' });
    }

    await prisma.notification.delete({
      where: { id: parseInt(id) },
    });

    return reply.status(204).send();
  });

  /**
   * DELETE /admin/notifications - Delete all read notifications
   */
  fastify.delete('/admin/notifications', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    const deleted = await prisma.notification.deleteMany({
      where: {
        userId: tokenData.userId,
        isRead: true,
      },
    });

    return { deleted: deleted.count };
  });

  /**
   * POST /admin/notifications - Create a notification (admin only, for testing or system use)
   */
  fastify.post('/admin/notifications', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    // Only admins can create notifications for other users
    if (tokenData.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const result = createNotificationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    const notification = await prisma.notification.create({
      data: {
        userId: result.data.userId || tokenData.userId,
        type: result.data.type,
        title: result.data.title,
        message: result.data.message,
        link: result.data.link,
      },
    });

    return reply.status(201).send(notification);
  });

  /**
   * POST /admin/notifications/test-line-expiration - Manual trigger for line expiration check (testing)
   */
  fastify.post('/admin/notifications/test-line-expiration', async (request, reply) => {
    const tokenData = await getUserFromToken(request);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Authorization required' });
    }

    // Only admins can trigger this test endpoint
    if (tokenData.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    try {
      const { lineExpirationNotificationWorker } = await import('../../workers/LineExpirationNotificationWorker.js');
      await lineExpirationNotificationWorker.manualCheck();
      
      return {
        success: true,
        message: 'Line expiration check triggered successfully',
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to trigger line expiration check');
      return reply.status(500).send({ 
        error: 'Failed to trigger line expiration check',
        details: error.message
      });
    }
  });
}
