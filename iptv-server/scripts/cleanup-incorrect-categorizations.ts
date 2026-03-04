import { prisma } from '../src/config/database.js';

/**
 * Delete incorrect secondary categorizations created on Dec 22
 */

async function main() {
  console.log('🗑️  Deleting incorrect secondary categorizations from Dec 22...\n');

  // Delete all non-primary categorizations created on or after 2025-12-22
  const deleteResult = await prisma.streamCategory.deleteMany({
    where: {
      isPrimary: false,
      createdAt: {
        gte: new Date('2025-12-22T00:00:00Z'),
      },
    },
  });

  console.log(`✅ Deleted ${deleteResult.count} incorrect secondary categorizations`);
  console.log(`📊 All streams now have only their primary categorizations\n`);

  // Verify
  const remaining = await prisma.streamCategory.count({
    where: {
      isPrimary: false,
    },
  });

  console.log(`🔍 Verification:`);
  console.log(`   Remaining secondary categorizations: ${remaining}`);
  console.log(`   (These are the ${remaining} correct ones from Dec 21)\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
