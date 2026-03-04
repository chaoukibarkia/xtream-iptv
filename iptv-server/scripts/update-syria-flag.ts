import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating Syria flag path...');
  
  await prisma.category.updateMany({ 
    where: { countryCode: 'SY' }, 
    data: { flagSvgUrl: '/flags/sy.svg' } 
  });
  
  console.log('✅ Updated Syria flag');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
