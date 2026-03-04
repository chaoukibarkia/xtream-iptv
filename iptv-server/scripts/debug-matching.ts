import { prisma } from '../src/config/database.js';

async function checkUnmatchedFiles() {
  try {
    console.log('\n=== Checking Series and Their Matches ===\n');
    
    const series = await prisma.series.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    console.log('Series names in database:\n');
    for (const s of series) {
      console.log(`  ${s.id}: ${s.name}`);
    }

    console.log('\n\n=== Testing Manual Mappings ===\n');
    
    const SERIES_MAPPINGS: Record<string, string[]> = {
      'House of the Dragon': ['house.of.the.dragon', 'house of the dragon'],
      'The Lord of the Rings The Rings of Power': ['lord.of.the.rings', 'rings.of.power', 'lotr'],
      'Only Murders in the Building': ['only.murders.in.the.building', 'only murders'],
      'The Penguin': ['the.penguin', 'penguin'],
      'Tulsa King': ['tulsa.king', 'tulsa king'],
      'Shrinking': ['shrinking'],
      'Slow Horses': ['slow.horses', 'slow horses'],
      'The Franchise': ['the.franchise', 'franchise'],
      '9-1-1 : Lone Star': ['9-1-1', '911', 'lone.star'],
      'Bad Monkey': ['bad.monkey', 'bad monkey'],
      'Citadel Diana': ['citadel.diana', 'citadel diana'],
      'Disclaimer': ['disclaimer'],
      'La Maquina': ['la.maquina', 'la maquina'],
      'Utopia': ['utopia'],
      'Zorro': ['zorro'],
      'Alien theory : Les preuves ultimes': ['alien.theory', 'alien theory', 'alien.country'],
    };

    const normalize = (str: string) => {
      return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const testFiles = [
      'Only.Murders.in.the.Building.S04E01.MULTI.VFF.1080p.10bit.WEBRip.6CH.x265.HEVC-SERQPH.mkv',
      'Tulsa.King.S02E05.MULTI.VFF.1080p.10bit.WEBRip.2CH.x265.HEVC-SERQPH.mkv',
    ];

    for (const filename of testFiles) {
      console.log(`\nFile: ${filename}`);
      console.log(`Normalized: ${normalize(filename)}\n`);
      
      for (const s of series) {
        const mappings = SERIES_MAPPINGS[s.name];
        if (mappings) {
          for (const mapping of mappings) {
            const normalizedMapping = normalize(mapping);
            if (normalize(filename).includes(normalizedMapping)) {
              console.log(`  ✓ Matches "${s.name}" via mapping "${mapping}"`);
            }
          }
        }
        
        // Also check direct series name match
        if (normalize(filename).includes(normalize(s.name))) {
          console.log(`  ✓ Matches "${s.name}" via direct name match`);
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUnmatchedFiles();
