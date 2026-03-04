import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Known foreign prefixes
const foreignPrefixes = [
  { prefixes: ['DE ', 'DE.'], country: 'ALLEMAGNE' },
  { prefixes: ['ES '], country: 'ESPAGNE' },
  { prefixes: ['BE.', 'BE '], country: 'BELGIQUE' },
  { prefixes: ['IT ', 'ITI-'], country: 'ITALIE' },
  { prefixes: ['IN ', 'PB ', 'PUNJABI'], country: 'INDE' },
  { prefixes: ['PK '], country: 'PAKISTAN' },
  { prefixes: ['BANGLA', 'BAN ', 'BD '], country: 'BANGLADESH' },
  { prefixes: ['USA', 'US.', 'US '], country: 'ÉTATS-UNIS' },
  { prefixes: ['RAF ', 'AAF ', 'GAF ', 'EAF ', 'YAF ', 'CSAT-AF', 'A.F '], country: 'AFRIQUE' },
  { prefixes: ['ROYA-'], country: 'JORDANIE' },
  { prefixes: ['AD-', 'AD '], country: 'ÉMIRATS ARABES UNIS' },
  { prefixes: ['ARB-', 'OS-'], country: 'CHAÎNES ARABES' },
  { prefixes: ['PT ', 'PT.'], country: 'PORTUGAL' },
  { prefixes: ['UK ', 'UK.', 'GB '], country: 'ROYAUME-UNI' },
  { prefixes: ['NL ', 'NL.'], country: 'PAYS-BAS' },
  { prefixes: ['TR ', 'TR.'], country: 'TURQUIE' },
  { prefixes: ['RU ', 'RU.'], country: 'RUSSIE' },
  { prefixes: ['PL ', 'PL.'], country: 'POLOGNE' },
  { prefixes: ['RO ', 'RO.'], country: 'ROUMANIE' },
  { prefixes: ['SHAHID', 'MBC', 'AL ', 'AL-'], country: 'CHAÎNES ARABES' },
];

async function main() {
  // Get FRANCE parent category
  const france = await prisma.category.findFirst({
    where: { name: 'FRANCE', parentId: null },
    include: { children: true }
  });

  if (!france) {
    console.error('FRANCE category not found!');
    return;
  }

  console.log('Analyzing FRANCE subcategories...\n');

  for (const subcat of france.children) {
    const channels = await prisma.stream.findMany({
      where: {
        categories: { some: { categoryId: subcat.id } }
      },
      select: { id: true, name: true }
    });

    // Find misplaced channels
    const misplaced: { channel: string; suggestedCountry: string }[] = [];
    
    for (const channel of channels) {
      const upperName = channel.name.toUpperCase();
      
      for (const { prefixes, country } of foreignPrefixes) {
        for (const prefix of prefixes) {
          if (upperName.startsWith(prefix)) {
            misplaced.push({ channel: channel.name, suggestedCountry: country });
            break;
          }
        }
      }
    }

    if (misplaced.length > 0) {
      console.log(`=== FRANCE/${subcat.name} ===`);
      console.log(`Total channels: ${channels.length}, Misplaced: ${misplaced.length}`);
      
      // Group by suggested country
      const byCountry: Record<string, string[]> = {};
      for (const { channel, suggestedCountry } of misplaced) {
        if (!byCountry[suggestedCountry]) byCountry[suggestedCountry] = [];
        byCountry[suggestedCountry].push(channel);
      }
      
      for (const [country, chans] of Object.entries(byCountry)) {
        console.log(`  -> ${country}: ${chans.length} channels`);
        chans.slice(0, 3).forEach(c => console.log(`      - ${c}`));
        if (chans.length > 3) console.log(`      ... and ${chans.length - 3} more`);
      }
      console.log('');
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
