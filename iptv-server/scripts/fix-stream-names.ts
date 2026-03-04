import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Nettoie et convertit un nom en MAJUSCULES (VERSION CORRIGÉE)
 */
function cleanAndUppercase(name: string): string {
  // Retirer les préfixes techniques
  let cleaned = name.replace(/^(CSAT-AF|A\.F\||AF \||AR-|AR_|AR\||FR-|FR_|FR\||UK-|UK_|DE-|DE_|IT-|IT_|TR-|TR-B:|TR-N:|TR:|PL-|IN-|IN_|PK-|OS-|OSN_|OSN-|CA:|YAF:|AF:|PT:)\s*/i, '');
  
  // Remplacer underscores et pipes par des espaces (mais PAS les tirets simples dans les noms)
  cleaned = cleaned.replace(/[_|]/g, ' ');
  
  // Remplacer tirets uniquement s'ils sont entourés d'espaces
  cleaned = cleaned.replace(/\s+-\s+/g, ' ');
  
  // Supprimer tirets en début/fin
  cleaned = cleaned.replace(/^-+|-+\$/g, '');
  
  // Remplacer séparateurs multiples
  cleaned = cleaned.replace(/\s*(\/\/\/|---|\\|\\|)\s*/g, ' ');
  
  // Nettoyer espaces multiples
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Convertir en MAJUSCULES
  return cleaned.toUpperCase();
}

async function fixAllStreamNames() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          CORRECTION DES NOMS DE STREAMS - ESPACES           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Récupérer tous les streams LIVE depuis le backup (noms originaux)
    console.log('📥 Récupération des noms originaux depuis le backup...');
    const backupStreams = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
      SELECT id, name
      FROM "_migration_backup_streams"
      WHERE "streamType" = 'LIVE'
      ORDER BY id
    `;
    
    console.log(`   Trouvé ${backupStreams.length} streams à corriger\n`);
    
    // Corriger les noms
    console.log('🔄 Correction des noms en cours...');
    let corrected = 0;
    let unchanged = 0;
    
    for (const backup of backupStreams) {
      const cleanName = cleanAndUppercase(backup.name);
      
      // Mettre à jour le nom dans la table Stream
      await prisma.stream.update({
        where: { id: backup.id },
        data: { name: cleanName }
      });
      
      corrected++;
      
      if (corrected % 100 === 0) {
        console.log(`   Corrigé ${corrected}/${backupStreams.length} streams...`);
      }
    }
    
    console.log(`\n✅ Correction terminée: ${corrected} streams\n`);
    
    // Afficher quelques exemples
    console.log('📋 Exemples de noms corrigés:');
    const samples = await prisma.$queryRaw<Array<{ id: number; old_name: string; new_name: string }>>`
      SELECT 
        s.id,
        b.name as old_name,
        s.name as new_name
      FROM "Stream" s
      JOIN "_migration_backup_streams" b ON s.id = b.id
      WHERE s."streamType" = 'LIVE'
      AND (b.name ILIKE '%bein%' OR b.name ILIKE '%canal%' OR b.name ILIKE '%tf1%')
      LIMIT 15
    `;
    
    for (const sample of samples) {
      console.log(`\n   ID ${sample.id}:`);
      console.log(`      AVANT : ${sample.old_name}`);
      console.log(`      APRÈS : ${sample.new_name}`);
    }
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                  CORRECTION TERMINÉE                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
  } catch (error) {
    console.error('\n❌ ERREUR PENDANT LA CORRECTION:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution
fixAllStreamNames()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
