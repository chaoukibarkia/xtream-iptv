import { PrismaClient, CreditTransactionType, CreditTransaction, User } from '@prisma/client';

const prisma = new PrismaClient();

// Default: 1 credit = 30 days
const DAYS_PER_CREDIT = 30;

export interface TransactionFilters {
  userId?: number;
  type?: CreditTransactionType;
  isPaid?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedTransactions {
  transactions: CreditTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface TopUpResult {
  transaction: CreditTransaction;
  newBalance: number;
}

export interface TransferResult {
  sentTransaction: CreditTransaction;
  receivedTransaction: CreditTransaction;
  senderNewBalance: number;
  receiverNewBalance: number;
}

class CreditService {
  /**
   * Calculate credits needed for a given subscription duration
   * Default: 1 credit per 30 days, minimum 1 credit
   */
  calculateCost(days: number): number {
    return Math.max(1, Math.ceil(days / DAYS_PER_CREDIT));
  }

  /**
   * Get user's current credit balance
   */
  async getBalance(userId: number): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    return user?.credits ?? 0;
  }

  /**
   * Check if user has enough credits
   */
  async hasCredits(userId: number, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= amount;
  }

  /**
   * Top-up reseller credits (admin or parent reseller action)
   */
  async topUp(
    userId: number,
    amount: number,
    isPaid: boolean,
    notes?: string,
    createdById?: number
  ): Promise<TopUpResult> {
    if (amount <= 0) {
      throw new Error('Top-up amount must be positive');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, credits: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = user.credits;
    const balanceAfter = balanceBefore + amount;

    // Use transaction to ensure atomicity
    const [transaction] = await prisma.$transaction([
      prisma.creditTransaction.create({
        data: {
          userId,
          type: CreditTransactionType.TOP_UP,
          amount,
          balanceBefore,
          balanceAfter,
          isPaid,
          paymentNotes: notes,
          createdById,
          description: `Credit top-up: +${amount} credits`,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { credits: balanceAfter },
      }),
    ]);

    return { transaction, newBalance: balanceAfter };
  }

  /**
   * Deduct credits for line/code creation
   */
  async deduct(
    userId: number,
    amount: number,
    description: string,
    relatedLineId?: number,
    relatedCodeId?: number
  ): Promise<CreditTransaction> {
    if (amount <= 0) {
      throw new Error('Deduction amount must be positive');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, credits: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.credits < amount) {
      throw new Error(`Insufficient credits. Required: ${amount}, Available: ${user.credits}`);
    }

    const balanceBefore = user.credits;
    const balanceAfter = balanceBefore - amount;

    const [transaction] = await prisma.$transaction([
      prisma.creditTransaction.create({
        data: {
          userId,
          type: CreditTransactionType.DEDUCTION,
          amount: -amount, // Negative for deductions
          balanceBefore,
          balanceAfter,
          relatedLineId,
          relatedCodeId,
          description,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { credits: balanceAfter },
      }),
    ]);

    // Check for low credit warnings after deduction
    const { logger } = await import('../../config/logger.js');
    logger.info({ userId, balanceAfter }, 'Credit deduction completed, checking low credit warning');
    try {
      await this.checkLowCreditWarning(userId, balanceAfter);
    } catch (error) {
      // Don't fail the deduction if notification fails
      logger.warn({ error, userId, balanceAfter }, 'Failed to check low credit warning');
    }

    return transaction;
  }

  /**
   * Refund credits (e.g., when a line is deleted early)
   */
  async refund(
    userId: number,
    amount: number,
    description: string,
    relatedLineId?: number,
    relatedCodeId?: number,
    createdById?: number
  ): Promise<CreditTransaction> {
    if (amount <= 0) {
      throw new Error('Refund amount must be positive');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, credits: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = user.credits;
    const balanceAfter = balanceBefore + amount;

    const [transaction] = await prisma.$transaction([
      prisma.creditTransaction.create({
        data: {
          userId,
          type: CreditTransactionType.REFUND,
          amount,
          balanceBefore,
          balanceAfter,
          relatedLineId,
          relatedCodeId,
          createdById,
          description,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { credits: balanceAfter },
      }),
    ]);

    return transaction;
  }

  /**
   * Transfer credits from parent reseller to sub-reseller
   */
  async transfer(
    fromUserId: number,
    toUserId: number,
    amount: number
  ): Promise<TransferResult> {
    if (amount <= 0) {
      throw new Error('Transfer amount must be positive');
    }

    // Get both users
    const [fromUser, toUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: fromUserId },
        select: { id: true, credits: true, role: true },
      }),
      prisma.user.findUnique({
        where: { id: toUserId },
        select: { id: true, credits: true, parentId: true },
      }),
    ]);

    if (!fromUser) {
      throw new Error('Sender not found');
    }
    if (!toUser) {
      throw new Error('Recipient not found');
    }

    // Check if recipient is a child of sender (or sender is admin)
    if (fromUser.role !== 'ADMIN' && toUser.parentId !== fromUserId) {
      throw new Error('Can only transfer credits to your sub-resellers');
    }

    if (fromUser.credits < amount) {
      throw new Error(`Insufficient credits. Required: ${amount}, Available: ${fromUser.credits}`);
    }

    const senderBalanceBefore = fromUser.credits;
    const senderBalanceAfter = senderBalanceBefore - amount;
    const receiverBalanceBefore = toUser.credits;
    const receiverBalanceAfter = receiverBalanceBefore + amount;

    const [sentTransaction, receivedTransaction] = await prisma.$transaction([
      // Sender's outgoing transaction
      prisma.creditTransaction.create({
        data: {
          userId: fromUserId,
          type: CreditTransactionType.TRANSFER_OUT,
          amount: -amount,
          balanceBefore: senderBalanceBefore,
          balanceAfter: senderBalanceAfter,
          transferToId: toUserId,
          createdById: fromUserId,
          description: `Transfer to sub-reseller ID ${toUserId}`,
        },
      }),
      // Receiver's incoming transaction
      prisma.creditTransaction.create({
        data: {
          userId: toUserId,
          type: CreditTransactionType.TRANSFER_IN,
          amount,
          balanceBefore: receiverBalanceBefore,
          balanceAfter: receiverBalanceAfter,
          transferFromId: fromUserId,
          createdById: fromUserId,
          description: `Transfer from parent reseller ID ${fromUserId}`,
        },
      }),
      // Update sender balance
      prisma.user.update({
        where: { id: fromUserId },
        data: { credits: senderBalanceAfter },
      }),
      // Update receiver balance
      prisma.user.update({
        where: { id: toUserId },
        data: { credits: receiverBalanceAfter },
      }),
    ]);

    return {
      sentTransaction,
      receivedTransaction,
      senderNewBalance: senderBalanceAfter,
      receiverNewBalance: receiverBalanceAfter,
    };
  }

  /**
   * Get transaction history for a user
   */
  async getHistory(userId: number, filters?: Omit<TransactionFilters, 'userId'>): Promise<PaginatedTransactions> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.isPaid !== undefined) {
      where.isPaid = filters.isPaid;
    }

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, username: true } },
          transferTo: { select: { id: true, username: true } },
          transferFrom: { select: { id: true, username: true } },
          relatedLine: { select: { id: true, username: true } },
          relatedCode: { select: { id: true, code: true } },
        },
      }),
      prisma.creditTransaction.count({ where }),
    ]);

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all transactions (admin view)
   */
  async getAllTransactions(filters?: TransactionFilters): Promise<PaginatedTransactions> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters?.userId) {
      where.userId = filters.userId;
    }
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.isPaid !== undefined) {
      where.isPaid = filters.isPaid;
    }

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, username: true } },
          createdBy: { select: { id: true, username: true } },
          transferTo: { select: { id: true, username: true } },
          transferFrom: { select: { id: true, username: true } },
          relatedLine: { select: { id: true, username: true } },
          relatedCode: { select: { id: true, code: true } },
        },
      }),
      prisma.creditTransaction.count({ where }),
    ]);

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update payment status of a transaction
   */
  async updatePaymentStatus(
    transactionId: number,
    isPaid: boolean,
    notes?: string
  ): Promise<CreditTransaction> {
    const transaction = await prisma.creditTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.type !== CreditTransactionType.TOP_UP) {
      throw new Error('Can only update payment status for TOP_UP transactions');
    }

    return prisma.creditTransaction.update({
      where: { id: transactionId },
      data: {
        isPaid,
        paymentNotes: notes ?? transaction.paymentNotes,
      },
    });
  }

  /**
   * Get credit statistics for admin dashboard
   */
  async getStats() {
    const [
      totalCreditsInSystem,
      totalTopUps,
      paidTopUps,
      unpaidTopUps,
      totalDeductions,
    ] = await Promise.all([
      prisma.user.aggregate({ _sum: { credits: true } }),
      prisma.creditTransaction.count({ where: { type: CreditTransactionType.TOP_UP } }),
      prisma.creditTransaction.count({ where: { type: CreditTransactionType.TOP_UP, isPaid: true } }),
      prisma.creditTransaction.count({ where: { type: CreditTransactionType.TOP_UP, isPaid: false } }),
      prisma.creditTransaction.count({ where: { type: CreditTransactionType.DEDUCTION } }),
    ]);

    return {
      totalCreditsInSystem: totalCreditsInSystem._sum.credits ?? 0,
      totalTopUps,
      paidTopUps,
      unpaidTopUps,
      totalDeductions,
    };
  }

  /**
   * Check and send low credit warning notifications
   * Called after credit deductions to warn users when running low
   */
  private async checkLowCreditWarning(userId: number, currentBalance: number): Promise<void> {
    const { logger } = await import('../../config/logger.js');
    logger.info({ userId, currentBalance }, 'Checking low credit warning');

    // Define warning thresholds
    const warningThresholds = [10, 5, 1]; // Warn at 10, 5, and 1 credits remaining

    // Only check if balance is at one of the warning thresholds
    if (!warningThresholds.includes(currentBalance)) {
      logger.debug({ userId, currentBalance, warningThresholds }, 'Balance not at warning threshold, skipping');
      return;
    }

    logger.info({ userId, currentBalance }, 'Balance is at warning threshold, checking for recent warnings');

    // Check if we already sent a warning at this level in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentWarnings = await prisma.notification.findMany({
      where: {
        userId,
        type: 'WARNING',
        message: {
          contains: `${currentBalance} credit${currentBalance === 1 ? '' : 's'} remaining`,
        },
        createdAt: {
          gte: oneDayAgo,
        },
      },
    });

    logger.info({ userId, currentBalance, recentWarningsCount: recentWarnings.length }, 'Recent warnings check completed');

    // Skip if we already warned at this level recently
    if (recentWarnings.length > 0) {
      logger.info({ userId, currentBalance }, 'Recent warning found, skipping notification');
      return;
    }

    // Import notification service dynamically to avoid circular dependency
    const { notificationService } = await import('../../api/routes/notifications.js');

    const message = currentBalance === 1
      ? 'You have only 1 credit remaining in your account. Please top up to avoid service interruption.'
      : `You have ${currentBalance} credits remaining in your account. Consider topping up to avoid service interruption.`;

    const title = currentBalance <= 1
      ? 'Critical: Very Low Credit Balance'
      : 'Low Credit Balance Warning';

    logger.info({ userId, currentBalance, title, message }, 'Creating low credit notification');

    const notification = await notificationService.create({
      userId,
      type: 'WARNING',
      title,
      message,
    });

    logger.info({ userId, currentBalance, notificationId: notification?.id }, 'Low credit notification created');

    // Also notify parent reseller if applicable  
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { parentId: true, username: true },
    });

    if (user?.parentId) {
      logger.info({ userId, parentId: user.parentId, username: user.username }, 'Creating parent notification');
      const parentNotification = await notificationService.create({
        userId: user.parentId,
        type: 'WARNING',
        title: `Sub-Reseller ${title}`,
        message: `Your sub-reseller ${user.username} has ${currentBalance} credit${currentBalance === 1 ? '' : 's'} remaining.`,
      });
      logger.info({ parentId: user.parentId, notificationId: parentNotification?.id }, 'Parent notification created');
    }
  }
}

export const creditService = new CreditService();
export default creditService;
