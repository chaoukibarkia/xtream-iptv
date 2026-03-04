import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

// Standard subcategories for all parent categories
const STANDARD_SUBCATEGORIES = [
  { name: 'GÉNÉRALISTE', sortOrder: 1 },
  { name: 'SPORTS', sortOrder: 2 },
  { name: 'INFO', sortOrder: 3 },
  { name: 'CINÉMA', sortOrder: 4 },
  { name: 'SÉRIES', sortOrder: 5 },
  { name: 'DIVERTISSEMENT', sortOrder: 6 },
  { name: 'ENFANTS', sortOrder: 7 },
  { name: 'DOCUMENTAIRES', sortOrder: 8 },
  { name: 'MUSIQUE', sortOrder: 9 },
  { name: 'RELIGIEUX', sortOrder: 10 },
];

// Special subcategories for ADULT category
const ADULT_SUBCATEGORIES = [
  { name: 'GÉNÉRALISTE', sortOrder: 1 },
  { name: 'PREMIUM', sortOrder: 2 },
  { name: 'LIVE CAMS', sortOrder: 3 },
  { name: 'AUTRES', sortOrder: 4 },
];

// Special subcategories for BEIN SPORTS
const BEIN_SUBCATEGORIES = [
  { name: 'BEIN HD', sortOrder: 1 },
  { name: 'BEIN SD', sortOrder: 2 },
  { name: 'BEIN MAX', sortOrder: 3 },
  { name: 'AUTRES', sortOrder: 4 },
];

// Special subcategories for INTERNATIONAL
const INTERNATIONAL_SUBCATEGORIES = [
  { name: 'SPORTS', sortOrder: 1 },
  { name: 'INFO', sortOrder: 2 },
  { name: 'CINÉMA', sortOrder: 3 },
  { name: 'DIVERTISSEMENT', sortOrder: 4 },
  { name: 'AUTRES', sortOrder: 5 },
];

async function fixCategoryStructure() {
  console.log('🔧 Fixing Category Structure\n');
  console.log('═'.repeat(60));
  console.log('');

  try {
    // Get all parent categories without subcategories
    const parentsWithoutSubs = await prisma.category.findMany({
      where: {
        type: StreamType.LIVE,
        parentId: null,
        children: {
          none: {}
        }
      },
      orderBy: { name: 'asc' }
    });

    console.log(`Found ${parentsWithoutSubs.length} parent categories without subcategories:\n`);

    for (const parent of parentsWithoutSubs) {
      console.log(`\n📁 Processing: ${parent.name} (ID: ${parent.id})`);

      // Determine which subcategories to use
      let subcategories = STANDARD_SUBCATEGORIES;
      
      if (parent.name.includes('ADULT') || parent.name.includes('XXX')) {
        subcategories = ADULT_SUBCATEGORIES;
      } else if (parent.name.includes('BEIN')) {
        subcategories = BEIN_SUBCATEGORIES;
      } else if (parent.name.includes('INTERNATIONAL')) {
        subcategories = INTERNATIONAL_SUBCATEGORIES;
      }

      // Create subcategories
      for (const subcat of subcategories) {
        const created = await prisma.category.create({
          data: {
            name: subcat.name,
            type: StreamType.LIVE,
            parentId: parent.id,
            sortOrder: subcat.sortOrder,
            isActive: true,
          },
        });
        console.log(`   ✅ Created: ${created.name} (ID: ${created.id})`);
      }
    }

    // Verify final structure
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('\n📊 Final Category Structure:\n');

    const allParents = await prisma.category.findMany({
      where: {
        type: StreamType.LIVE,
        parentId: null
      },
      include: {
        _count: {
          select: { children: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    let withSubs = 0;
    let withoutSubs = 0;

    for (const p of allParents) {
      const code = p.countryCode ? `[${p.countryCode}]` : '[  ]';
      const status = p._count.children > 0 ? '✅' : '❌';
      console.log(`   ${status} ${code} ${p.name.padEnd(30)} → ${p._count.children} subcategories`);
      
      if (p._count.children > 0) withSubs++;
      else withoutSubs++;
    }

    console.log(`\n✅ With subcategories: ${withSubs}`);
    console.log(`❌ Without subcategories: ${withoutSubs}`);
    console.log('\n✅ Category structure fixed!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixCategoryStructure();
