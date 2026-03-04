import { prisma } from './src/config/database.js';

const settings = [
  { key: 'sourceChecker.mode', value: 'curl', description: 'Primary source checker mode: ffprobe, curl, or hybrid', category: 'sourceChecker', type: 'string', defaultValue: 'curl' },
  { key: 'sourceChecker.fallbackEnabled', value: 'true', description: 'Enable fallback FFprobe checking when curl reports failures', category: 'sourceChecker', type: 'boolean', defaultValue: 'true' },
  { key: 'curlSourceChecker.enabled', value: 'true', description: 'Enable curl-based source status checker', category: 'sourceChecker', type: 'boolean', defaultValue: 'true' },
  { key: 'curlSourceChecker.intervalMinutes', value: '30', description: 'Check interval in minutes for curl checker', category: 'sourceChecker', type: 'integer', defaultValue: '30' },
  { key: 'curlSourceChecker.batchSize', value: '20', description: 'Batch size for curl source checking', category: 'sourceChecker', type: 'integer', defaultValue: '20' },
  { key: 'curlSourceChecker.useContentValidation', value: 'false', description: 'Enable content validation (slower but more accurate)', category: 'sourceChecker', type: 'boolean', defaultValue: 'false' },
  { key: 'curlSourceChecker.maxConcurrentChecks', value: '10', description: 'Maximum concurrent curl checks', category: 'sourceChecker', type: 'integer', defaultValue: '10' }
];

async function migrate() {
  try {
    for (const setting of settings) {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: setting,
        create: setting,
      });
      console.log(`✅ Setting ${setting.key} added/updated`);
    }
    
    console.log('🎉 Database migration completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();