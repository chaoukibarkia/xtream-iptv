import { prisma } from '../src/config/database.js';
import * as fs from 'fs';

/**
 * Backup StreamCategory table before making changes
 */

async function main() {
  console.log('💾 Creating backup of StreamCategory table...\n');

  const allStreamCategories = await prisma.streamCategory.findMany({
    include: {
      category: true,
    },
  });

  const backup = {
    timestamp: new Date().toISOString(),
    totalRecords: allStreamCategories.length,
    data: allStreamCategories,
  };

  const backupPath = '/storage-pool/xtream/iptv-server/backups';
  const backupFile = `${backupPath}/stream-category-backup-${Date.now()}.json`;

  // Create backups directory if it doesn't exist
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }

  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

  console.log(`✅ Backup created successfully!`);
  console.log(`📁 File: ${backupFile}`);
  console.log(`📊 Total records: ${allStreamCategories.length}`);
  console.log(`💿 File size: ${(fs.statSync(backupFile).size / 1024 / 1024).toFixed(2)} MB\n`);

  // Also create a summary
  const primaryCount = allStreamCategories.filter((sc) => sc.isPrimary).length;
  const secondaryCount = allStreamCategories.filter((sc) => !sc.isPrimary).length;

  console.log(`📈 Breakdown:`);
  console.log(`   Primary categorizations:   ${primaryCount}`);
  console.log(`   Secondary categorizations: ${secondaryCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
