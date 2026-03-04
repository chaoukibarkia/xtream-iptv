import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of country names to ISO 3166-1 alpha-2 codes and Wikipedia SVG URLs
const COUNTRY_FLAGS: { [key: string]: { code: string; flagUrl: string } } = {
  'FRANCE': {
    code: 'FR',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Flag_of_France.svg',
  },
  'TUNISIE': {
    code: 'TN',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Flag_of_Tunisia.svg',
  },
  'MAROC': {
    code: 'MA',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Flag_of_Morocco.svg',
  },
  'ALGÉRIE': {
    code: 'DZ',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Flag_of_Algeria.svg',
  },
  'ARABIE SAOUDITE': {
    code: 'SA',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Flag_of_Saudi_Arabia.svg',
  },
  'ÉGYPTE': {
    code: 'EG',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Flag_of_Egypt.svg',
  },
  'LIBAN': {
    code: 'LB',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Flag_of_Lebanon.svg',
  },
  'ÉMIRATS ARABES UNIS': {
    code: 'AE',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Flag_of_the_United_Arab_Emirates.svg',
  },
  'QATAR': {
    code: 'QA',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Flag_of_Qatar.svg',
  },
  'IRAK': {
    code: 'IQ',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f6/Flag_of_Iraq.svg',
  },
  'SYRIE': {
    code: 'SY',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Flag_of_Syria.svg',
  },
  'KOWEÏT': {
    code: 'KW',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Flag_of_Kuwait.svg',
  },
  'LIBYE': {
    code: 'LY',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Libya.svg',
  },
  'PALESTINE': {
    code: 'PS',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/00/Flag_of_Palestine.svg',
  },
  'SOUDAN': {
    code: 'SD',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Flag_of_Sudan.svg',
  },
  'ROYAUME-UNI': {
    code: 'GB',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Flag_of_the_United_Kingdom_%281-2%29.svg',
  },
  'ÉTATS-UNIS': {
    code: 'US',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a4/Flag_of_the_United_States.svg',
  },
  'ALLEMAGNE': {
    code: 'DE',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Flag_of_Germany.svg',
  },
  'ITALIE': {
    code: 'IT',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/03/Flag_of_Italy.svg',
  },
  'ESPAGNE': {
    code: 'ES',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Flag_of_Spain.svg',
  },
  'TURQUIE': {
    code: 'TR',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Flag_of_Turkey.svg',
  },
  'PORTUGAL': {
    code: 'PT',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Flag_of_Portugal.svg',
  },
  'BELGIQUE': {
    code: 'BE',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Flag_of_Belgium.svg',
  },
  'PAYS-BAS': {
    code: 'NL',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/20/Flag_of_the_Netherlands.svg',
  },
  'POLOGNE': {
    code: 'PL',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/12/Flag_of_Poland.svg',
  },
  'INDE': {
    code: 'IN',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/41/Flag_of_India.svg',
  },
  'PAKISTAN': {
    code: 'PK',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/32/Flag_of_Pakistan.svg',
  },
  'CANADA': {
    code: 'CA',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d9/Flag_of_Canada_%28Pantone%29.svg',
  },
  'BANGLADESH': {
    code: 'BD',
    flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Flag_of_Bangladesh.svg',
  },
};

async function main() {
  console.log('🏁 Adding country flags to categories...\n');

  try {
    // Get all parent categories (categories with no parent)
    const parentCategories = await prisma.category.findMany({
      where: {
        parentId: null,
      },
    });

    console.log(`Found ${parentCategories.length} parent categories\n`);

    let updated = 0;
    let skipped = 0;

    for (const category of parentCategories) {
      const countryData = COUNTRY_FLAGS[category.name];

      if (countryData) {
        await prisma.category.update({
          where: { id: category.id },
          data: {
            countryCode: countryData.code,
            flagSvgUrl: countryData.flagUrl,
          },
        });
        console.log(`✅ ${category.name} -> ${countryData.code} (${countryData.flagUrl})`);
        updated++;
      } else {
        console.log(`⏭️  ${category.name} - No country mapping (special category)`);
        skipped++;
      }
    }

    console.log(`\n✅ Updated ${updated} categories with flags`);
    console.log(`⏭️  Skipped ${skipped} special categories (non-country categories)`);
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
