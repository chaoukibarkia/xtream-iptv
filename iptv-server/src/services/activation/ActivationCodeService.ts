import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { ActivationCodeStatus } from '@prisma/client';

const CODE_LENGTH = 14;
const MAX_GENERATION_RETRIES = 10;

export interface GenerateCodeOptions {
  bouquetIds: number[];
  maxConnections: number;
  subscriptionDays: number;
  isTrial: boolean;
  codeExpiresAt?: Date;
  createdById: number;
}

export interface ActivationResult {
  success: boolean;
  isNew?: boolean;
  iptvLine?: {
    id: number;
    username: string;
    password: string;
    expiresAt: Date | null;
  };
  error?: string;
  errorCode?: string;
  currentDeviceId?: string;
}

export const activationCodeService = {
  /**
   * Generate a cryptographically secure 14-digit numeric code
   */
  generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += crypto.randomInt(0, 10).toString();
    }
    return code;
  },

  /**
   * Validate code format (14 digits)
   */
  isValidFormat(code: string): boolean {
    return /^\d{14}$/.test(code);
  },

  /**
   * Generate a single activation code with uniqueness check
   */
  async createCode(options: GenerateCodeOptions): Promise<string> {
    let attempts = 0;

    while (attempts < MAX_GENERATION_RETRIES) {
      const code = this.generateCode();

      try {
        await prisma.activationCode.create({
          data: {
            code,
            status: ActivationCodeStatus.UNUSED,
            bouquetIds: options.bouquetIds,
            maxConnections: options.maxConnections,
            subscriptionDays: options.subscriptionDays,
            isTrial: options.isTrial,
            codeExpiresAt: options.codeExpiresAt,
            createdById: options.createdById,
          },
        });

        return code;
      } catch (error: unknown) {
        // Unique constraint violation - retry with new code
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          attempts++;
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate unique code after max retries');
  },

  /**
   * Generate multiple activation codes in batch
   */
  async createBatch(count: number, options: GenerateCodeOptions): Promise<string[]> {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      const code = await this.createCode(options);
      codes.push(code);
    }

    return codes;
  },

  /**
   * Activate a code and create the IPTV line (or return existing credentials)
   */
  async activate(
    code: string,
    deviceId: string,
    preferredUsername?: string,
    ipAddress?: string
  ): Promise<ActivationResult> {
    // Validate format first
    if (!this.isValidFormat(code)) {
      return { success: false, error: 'Invalid code format' };
    }

    // Find the code
    const activationCode = await prisma.activationCode.findUnique({
      where: { code },
      include: {
        createdBy: { select: { id: true } },
        usedByLine: {
          select: {
            id: true,
            username: true,
            password: true,
            expiresAt: true,
            lockedDeviceId: true,
          },
        },
      },
    });

    if (!activationCode) {
      return { success: false, error: 'Invalid activation code' };
    }

    // If already used, check if same device and return credentials
    if (activationCode.status === ActivationCodeStatus.USED) {
      if (!activationCode.usedByLine) {
        return { success: false, error: 'Code has already been used' };
      }

      // Check device match
      if (activationCode.usedDeviceId !== deviceId) {
        return {
          success: false,
          error: 'Code is locked to a different device',
          errorCode: 'DEVICE_MISMATCH',
          currentDeviceId: activationCode.usedDeviceId || undefined,
        };
      }

      // Return existing credentials
      return {
        success: true,
        isNew: false,
        iptvLine: {
          id: activationCode.usedByLine.id,
          username: activationCode.usedByLine.username,
          password: activationCode.usedByLine.password,
          expiresAt: activationCode.usedByLine.expiresAt,
        },
      };
    }

    // Check other statuses
    if (activationCode.status === ActivationCodeStatus.EXPIRED) {
      return { success: false, error: 'Code has expired' };
    }

    if (activationCode.status === ActivationCodeStatus.REVOKED) {
      return { success: false, error: 'Code is no longer valid' };
    }

    // Check code expiry
    if (activationCode.codeExpiresAt && activationCode.codeExpiresAt < new Date()) {
      // Mark as expired
      await prisma.activationCode.update({
        where: { id: activationCode.id },
        data: { status: ActivationCodeStatus.EXPIRED },
      });
      return { success: false, error: 'Code has expired' };
    }

    // Generate username and password
    const username = await this.generateUniqueUsername(preferredUsername);
    const password = this.generatePassword();

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + activationCode.subscriptionDays);

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create the IPTV line
      const iptvLine = await tx.iptvLine.create({
        data: {
          username,
          password,
          maxConnections: activationCode.maxConnections,
          expiresAt,
          isTrial: activationCode.isTrial,
          ownerId: activationCode.createdById,
          status: 'active',
          lockedDeviceId: deviceId,
          bouquets:
            activationCode.bouquetIds.length > 0
              ? {
                  create: activationCode.bouquetIds.map((id) => ({ bouquetId: id })),
                }
              : undefined,
        },
      });

      // Mark code as used
      await tx.activationCode.update({
        where: { id: activationCode.id },
        data: {
          status: ActivationCodeStatus.USED,
          usedAt: new Date(),
          usedByLineId: iptvLine.id,
          usedFromIp: ipAddress,
          usedDeviceId: deviceId,
        },
      });

      return iptvLine;
    });

    logger.info(
      { username: result.username, codeId: activationCode.id, deviceId },
      'Activation code redeemed successfully'
    );

    return {
      success: true,
      isNew: true,
      iptvLine: {
        id: result.id,
        username: result.username,
        password: result.password,
        expiresAt: result.expiresAt,
      },
    };
  },

  /**
   * Generate unique username
   */
  async generateUniqueUsername(preferred?: string): Promise<string> {
    if (preferred) {
      // Clean the preferred username
      const clean = preferred.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20);

      if (clean.length >= 3) {
        const existing = await prisma.iptvLine.findUnique({
          where: { username: clean },
        });

        if (!existing) return clean;

        // Try with suffix
        for (let i = 1; i <= 99; i++) {
          const withSuffix = `${clean}${i}`;
          const exists = await prisma.iptvLine.findUnique({
            where: { username: withSuffix },
          });
          if (!exists) return withSuffix;
        }
      }
    }

    // Generate random username: user_<timestamp><random>
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    return `user_${timestamp}${random}`;
  },

  /**
   * Generate random password (8 characters alphanumeric)
   */
  generatePassword(): string {
    return Math.random().toString(36).slice(2, 10);
  },

  /**
   * Revoke an unused code
   */
  async revoke(codeId: number, userId: number): Promise<boolean> {
    const code = await prisma.activationCode.findUnique({
      where: { id: codeId },
    });

    if (!code || code.status !== ActivationCodeStatus.UNUSED) {
      return false;
    }

    // Check permission (creator or admin)
    if (code.createdById !== userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role !== 'ADMIN') {
        return false;
      }
    }

    await prisma.activationCode.update({
      where: { id: codeId },
      data: { status: ActivationCodeStatus.REVOKED },
    });

    return true;
  },
};
