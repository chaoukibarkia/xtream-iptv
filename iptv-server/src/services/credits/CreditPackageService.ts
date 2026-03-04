import { PrismaClient, CreditPackage } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreatePackageData {
  name: string;
  credits: number;
  days: number;
  description?: string;
  isActive?: boolean;
}

export interface UpdatePackageData {
  name?: string;
  credits?: number;
  days?: number;
  description?: string;
  isActive?: boolean;
}

class CreditPackageService {
  /**
   * Get all credit packages
   */
  async getAll(includeInactive = false): Promise<CreditPackage[]> {
    const where = includeInactive ? {} : { isActive: true };
    return prisma.creditPackage.findMany({
      where,
      orderBy: { days: 'asc' },
    });
  }

  /**
   * Get a single credit package by ID
   */
  async getById(id: number): Promise<CreditPackage | null> {
    return prisma.creditPackage.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new credit package
   */
  async create(data: CreatePackageData): Promise<CreditPackage> {
    return prisma.creditPackage.create({
      data: {
        name: data.name,
        credits: data.credits,
        days: data.days,
        description: data.description,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Update a credit package
   */
  async update(id: number, data: UpdatePackageData): Promise<CreditPackage> {
    return prisma.creditPackage.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a credit package
   */
  async delete(id: number): Promise<void> {
    await prisma.creditPackage.delete({
      where: { id },
    });
  }

  /**
   * Seed default packages if none exist
   */
  async seedDefaults(): Promise<void> {
    const count = await prisma.creditPackage.count();
    if (count > 0) return;

    const defaultPackages: CreatePackageData[] = [
      { name: '1 Week', credits: 1, days: 7, description: 'Weekly subscription' },
      { name: '1 Month', credits: 1, days: 30, description: 'Monthly subscription' },
      { name: '3 Months', credits: 3, days: 90, description: 'Quarterly subscription' },
      { name: '6 Months', credits: 6, days: 180, description: 'Semi-annual subscription' },
      { name: '1 Year', credits: 12, days: 365, description: 'Annual subscription' },
    ];

    await prisma.creditPackage.createMany({
      data: defaultPackages,
    });
  }

  /**
   * Get credit cost for a specific number of days
   * Uses package pricing if available, otherwise falls back to default calculation
   */
  async getCostForDays(days: number): Promise<{ credits: number; package?: CreditPackage }> {
    // First try to find an exact match package
    const exactMatch = await prisma.creditPackage.findFirst({
      where: { days, isActive: true },
    });

    if (exactMatch) {
      return { credits: exactMatch.credits, package: exactMatch };
    }

    // Otherwise calculate based on default rate (1 credit = 30 days)
    const credits = Math.max(1, Math.ceil(days / 30));
    return { credits };
  }
}

export const creditPackageService = new CreditPackageService();
export default creditPackageService;
