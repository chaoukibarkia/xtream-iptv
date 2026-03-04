import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { creditService, creditPackageService } from '../../services/credits/index.js';
import { CreditTransactionType, UserRole, NotificationType } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { verifyToken } from './auth.js';
import { notificationService } from './notifications.js';

// Validation schemas
const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  credits: z.number().int().min(1),
  days: z.number().int().min(1).max(3650),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

const updatePackageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credits: z.number().int().min(1).optional(),
  days: z.number().int().min(1).max(3650).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

const topUpSchema = z.object({
  amount: z.number().int().min(1).max(100000),
  isPaid: z.boolean(),
  paymentNotes: z.string().max(500).optional(),
});

const transferSchema = z.object({
  toUserId: z.number().int().positive(),
  amount: z.number().int().min(1).max(100000),
});

const updatePaymentSchema = z.object({
  isPaid: z.boolean(),
  paymentNotes: z.string().max(500).optional(),
});

const calculateCostSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
  count: z.coerce.number().int().min(1).max(1000).optional(),
});

const transactionFiltersSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  type: z.nativeEnum(CreditTransactionType).optional(),
  isPaid: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default async function creditRoutes(fastify: FastifyInstance) {
  // ========================================
  // Credit Package Routes (Admin only)
  // ========================================

  // List all credit packages
  fastify.get('/admin/credit-packages', async (request, reply) => {
    const { includeInactive } = request.query as { includeInactive?: string };
    const packages = await creditPackageService.getAll(includeInactive === 'true');
    return packages;
  });

  // Get single credit package
  fastify.get('/admin/credit-packages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pkg = await creditPackageService.getById(parseInt(id));

    if (!pkg) {
      return reply.status(404).send({ error: 'Credit package not found' });
    }

    return pkg;
  });

  // Create credit package
  fastify.post('/admin/credit-packages', async (request, reply) => {
    const result = createPackageSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    const pkg = await creditPackageService.create(result.data);
    return reply.status(201).send(pkg);
  });

  // Update credit package
  fastify.put('/admin/credit-packages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = updatePackageSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    try {
      const pkg = await creditPackageService.update(parseInt(id), result.data);
      return pkg;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.status(404).send({ error: 'Credit package not found' });
      }
      throw error;
    }
  });

  // Delete credit package
  fastify.delete('/admin/credit-packages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await creditPackageService.delete(parseInt(id));
      return reply.status(204).send();
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.status(404).send({ error: 'Credit package not found' });
      }
      throw error;
    }
  });

  // ========================================
  // Credit Operations Routes
  // ========================================

  // Top-up credits for a user
  fastify.post('/admin/users/:id/credits/topup', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = topUpSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    const userId = parseInt(id);
    // Get admin user ID from auth context (assuming it's set by middleware)
    const adminId = (request as any).user?.id;

    try {
      const { transaction, newBalance } = await creditService.topUp(
        userId,
        result.data.amount,
        result.data.isPaid,
        result.data.paymentNotes,
        adminId
      );

      // Send notification to user about received credits
      await notificationService.create({
        userId,
        type: NotificationType.CREDIT,
        title: 'Credits Added',
        message: `${result.data.amount} credits have been added to your account. New balance: ${newBalance}`,
        link: '/admin/credits',
      });

      return {
        success: true,
        transaction,
        newBalance,
      };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Get user's credit history
  fastify.get('/admin/users/:id/credits/history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const filters = transactionFiltersSchema.safeParse(request.query);

    if (!filters.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: filters.error.errors });
    }

    const history = await creditService.getHistory(parseInt(id), {
      type: filters.data.type,
      isPaid: filters.data.isPaid,
      page: filters.data.page,
      limit: filters.data.limit,
    });

    return history;
  });

  // Transfer credits to sub-reseller
  fastify.post('/admin/credits/transfer', async (request, reply) => {
    const result = transferSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    // Get sender user ID from auth context
    const fromUserId = (request as any).user?.id;

    if (!fromUserId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const transferResult = await creditService.transfer(
        fromUserId,
        result.data.toUserId,
        result.data.amount
      );

      return {
        success: true,
        ...transferResult,
      };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Get all transactions (admin sees all, resellers see only their own)
  fastify.get('/admin/credits/transactions', async (request, reply) => {
    const filters = transactionFiltersSchema.safeParse(request.query);

    if (!filters.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: filters.error.errors });
    }

    // Get user from JWT token to determine filtering
    const authHeader = request.headers['authorization'];
    let filterUserId = filters.data.userId;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenData = await verifyToken(token);
      
      if (tokenData) {
        const user = await prisma.user.findUnique({
          where: { id: tokenData.userId },
          select: { id: true, role: true },
        });
        
        // Non-admin users can only see their own transactions
        if (user && user.role !== UserRole.ADMIN) {
          filterUserId = user.id;
        }
      }
    }

    const transactions = await creditService.getAllTransactions({
      userId: filterUserId,
      type: filters.data.type,
      isPaid: filters.data.isPaid,
      page: filters.data.page,
      limit: filters.data.limit,
    });

    return transactions;
  });

  // Update payment status of a transaction
  fastify.patch('/admin/credits/transactions/:id/payment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = updatePaymentSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    try {
      const transaction = await creditService.updatePaymentStatus(
        parseInt(id),
        result.data.isPaid,
        result.data.paymentNotes
      );

      return transaction;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Calculate credit cost for days
  fastify.get('/admin/credits/calculate', async (request, reply) => {
    const result = calculateCostSchema.safeParse(request.query);

    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: result.error.errors });
    }

    const { days, count = 1 } = result.data;
    const { credits: costPerItem, package: matchedPackage } = await creditPackageService.getCostForDays(days);
    const totalCost = costPerItem * count;

    return {
      days,
      count,
      costPerItem,
      totalCost,
      matchedPackage: matchedPackage
        ? { id: matchedPackage.id, name: matchedPackage.name, days: matchedPackage.days, credits: matchedPackage.credits }
        : null,
    };
  });

  // Get credit statistics
  fastify.get('/admin/credits/stats', async (request, reply) => {
    const stats = await creditService.getStats();
    return stats;
  });

  // Get current user's balance (for resellers)
  // This endpoint supports JWT Bearer token auth for logged-in users
  fastify.get('/admin/credits/balance', async (request, reply) => {
    // Try to get user from JWT Bearer token
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const tokenData = await verifyToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenData.userId },
      select: { id: true, credits: true },
    });

    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }

    return { balance: user.credits };
  });

  // ========================================
  // Reseller Credit Package Routes
  // ========================================

  const resellerPackageSchema = z.object({
    name: z.string().min(1).max(100),
    credits: z.number().int().min(1), // Credits sub-reseller receives
    price: z.number().int().min(1),   // Credits deducted from reseller
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  });

  const resellerTopUpSchema = z.object({
    amount: z.number().int().min(1).max(100000).optional(), // Direct amount (admin only)
    packageId: z.number().int().optional(), // Use a reseller package
  });

  // Get reseller's own credit packages
  fastify.get('/admin/reseller/packages', async (request, reply) => {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const tokenData = await verifyToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const packages = await prisma.resellerCreditPackage.findMany({
      where: { resellerId: tokenData.userId },
      orderBy: { credits: 'asc' },
    });

    return { packages };
  });

  // Create reseller credit package
  fastify.post('/admin/reseller/packages', async (request, reply) => {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const tokenData = await verifyToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const result = resellerPackageSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    // Price must be <= credits (reseller can't profit more than they give)
    // Actually, price is what reseller pays (their cost), credits is what sub-reseller gets
    // So price should typically be less than or equal to credits for reseller to make profit
    
    const pkg = await prisma.resellerCreditPackage.create({
      data: {
        resellerId: tokenData.userId,
        name: result.data.name,
        credits: result.data.credits,
        price: result.data.price,
        description: result.data.description,
        isActive: result.data.isActive ?? true,
      },
    });

    return reply.status(201).send(pkg);
  });

  // Update reseller credit package
  fastify.put('/admin/reseller/packages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const tokenData = await verifyToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const result = resellerPackageSchema.partial().safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    // Verify ownership
    const existing = await prisma.resellerCreditPackage.findFirst({
      where: { id: parseInt(id), resellerId: tokenData.userId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Package not found' });
    }

    const pkg = await prisma.resellerCreditPackage.update({
      where: { id: parseInt(id) },
      data: result.data,
    });

    return pkg;
  });

  // Delete reseller credit package
  fastify.delete('/admin/reseller/packages/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const tokenData = await verifyToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    // Verify ownership
    const existing = await prisma.resellerCreditPackage.findFirst({
      where: { id: parseInt(id), resellerId: tokenData.userId },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Package not found' });
    }

    await prisma.resellerCreditPackage.delete({
      where: { id: parseInt(id) },
    });

    return reply.status(204).send();
  });

  // Reseller top-up sub-reseller (deducts from reseller's balance)
  fastify.post('/admin/reseller/topup/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const tokenData = await verifyToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const result = resellerTopUpSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Validation failed', details: result.error.errors });
    }

    const resellerId = tokenData.userId;
    const subResellerId = parseInt(userId);

    // Verify the target user is a sub-reseller of this reseller
    const subReseller = await prisma.user.findFirst({
      where: { id: subResellerId, parentId: resellerId },
    });

    if (!subReseller) {
      return reply.status(403).send({ error: 'You can only top up your own sub-resellers' });
    }

    let creditsToGive: number;
    let creditsToDeduct: number;
    let description: string;

    if (result.data.packageId) {
      // Use a reseller package
      const pkg = await prisma.resellerCreditPackage.findFirst({
        where: { id: result.data.packageId, resellerId, isActive: true },
      });

      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found or inactive' });
      }

      creditsToGive = pkg.credits;
      creditsToDeduct = pkg.price;
      description = `Top-up via package: ${pkg.name}`;
    } else if (result.data.amount) {
      // Direct amount (1:1 transfer)
      creditsToGive = result.data.amount;
      creditsToDeduct = result.data.amount;
      description = `Direct credit transfer`;
    } else {
      return reply.status(400).send({ error: 'Either amount or packageId is required' });
    }

    // Check reseller has enough credits
    const reseller = await prisma.user.findUnique({
      where: { id: resellerId },
      select: { credits: true },
    });

    if (!reseller || reseller.credits < creditsToDeduct) {
      return reply.status(400).send({ 
        error: 'Insufficient credits',
        required: creditsToDeduct,
        available: reseller?.credits || 0,
      });
    }

    // Perform the transfer in a transaction
    const [updatedReseller, updatedSubReseller, txOut, txIn] = await prisma.$transaction([
      // Deduct from reseller
      prisma.user.update({
        where: { id: resellerId },
        data: { credits: { decrement: creditsToDeduct } },
        select: { credits: true },
      }),
      // Add to sub-reseller
      prisma.user.update({
        where: { id: subResellerId },
        data: { credits: { increment: creditsToGive } },
        select: { credits: true },
      }),
      // Record outgoing transaction for reseller
      prisma.creditTransaction.create({
        data: {
          userId: resellerId,
          type: 'TRANSFER_OUT',
          amount: -creditsToDeduct,
          balanceBefore: reseller.credits,
          balanceAfter: reseller.credits - creditsToDeduct,
          transferToId: subResellerId,
          description: `${description} to ${subReseller.username}`,
          createdById: resellerId,
        },
      }),
      // Record incoming transaction for sub-reseller
      prisma.creditTransaction.create({
        data: {
          userId: subResellerId,
          type: 'TRANSFER_IN',
          amount: creditsToGive,
          balanceBefore: subReseller.credits || 0,
          balanceAfter: (subReseller.credits || 0) + creditsToGive,
          transferFromId: resellerId,
          description: `${description} from parent reseller`,
          createdById: resellerId,
        },
      }),
    ]);

    // Send notification to sub-reseller about received credits
    await notificationService.create({
      userId: subResellerId,
      type: NotificationType.CREDIT,
      title: 'Credits Received',
      message: `You received ${creditsToGive} credits from your reseller. New balance: ${updatedSubReseller.credits}`,
      link: '/admin/credits',
    });

    return {
      success: true,
      creditsDeducted: creditsToDeduct,
      creditsGiven: creditsToGive,
      resellerNewBalance: updatedReseller.credits,
      subResellerNewBalance: updatedSubReseller.credits,
    };
  });
}
