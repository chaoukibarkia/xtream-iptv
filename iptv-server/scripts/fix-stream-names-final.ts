import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Nettoie et convertit un nom en MAJUSCULES (VERSION CORRIGÉE - SANS BUG)
 */
function cleanAndUppercase(name: string): string {
  // Retirer les préfixes techniques
  let cleaned = name.replace(/^(CSAT-AF|A\.F\||AF \||AR-|AR_|AR\||FR-|FR_|FR\||UK-|UK_|DE-|DE_|IT-|IT_|TR-B:|TR-N:|TR:|PL-|IN-|IN_|PK-|OS-|OSN_|OSN-|CA:|YAF:|AF:|PT:|Bangla:)\s*/i, '');
  
  // Remplacer underscores et pipes simples par des espaces
  cleaned = cleaned.replace(/[_|]/g, ' ');
  
  // Remplacer tirets entourés d'espaces (mais PAS les tirets dans les noms comme "Sci-Fi")
  cleaned = cleaned.replace(/\s+-\s+/g, ' ');
  
  // Supprimer tirets en début/fin
  cleaned = cleaned.replace(/^-+|-+$/g, '');
  
  // Nettoyer espaces multiples
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Convertir en MAJUSCULES
  return cleaned.toUpperCase();
}

async function fixAllStreamNames() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       CORRECTION FINALE DES NOMS DE STREAMS                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Récupérer tous les streams LIVE depuis le backup (noms originaux NON CORROMPUS)
    console.log('📥 Récupération des noms originaux depuis le backup PostgreSQL...');
    const backupStreams = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
      SELECT id, name
      FROM "_migration_backup_streams"
      WHERE "streamType" = 'LIVE'
      ORDER BY id
    `;
    
    console.log(`   Trouvé ${backupStreams.length} streams à corriger\n`);
    
    // Tester sur quelques exemples d'abord
    console.log('🧪 Test sur 10 exemples:');
    for (let i = 0; i < Math.min(10, backupStreams.length); i++) {
      const backup = backupStreams[i];
      const cleanName = cleanAndUppercase(backup.name);
      console.log(`   ID ${backup.id}:`);
      console.log(`      ORIGINAL : "${backup.name}"`);
      console.log(`      NETTOYÉ  : "${cleanName}"`);
    }
    
    console.log('\n❓ Continuer avec la correction de tous les streams? (Ctrl+C pour annuler)');
    console.log('   Début dans 3 secondes...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Corriger les noms
    console.log('🔄 Correction des noms en cours...');
    let corrected = 0;
    
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
    
    // Afficher quelques exemples finaux
    console.log('📋 Exemples de noms corrigés (vérification finale):');
    const samples = await prisma.$queryRaw<Array<{ id: number; old_name: string; new_name: string }>>`
      SELECT 
        s.id,
        b.name as old_name,
        s.name as new_name
      FROM "Stream" s
      JOIN "_migration_backup_streams" b ON s.id = b.id
      WHERE s."streamType" = 'LIVE'
      AND (b.name ILIKE '%bein%' OR b.name ILIKE '%canal%' OR b.name ILIKE '%tf1%' OR b.name ILIKE '%france%')
      LIMIT 20
    `;
    
    for (const sample of samples) {
      console.log(`\n   ID ${sample.id}:`);
      console.log(`      AVANT : ${sample.old_name}`);
      console.log(`      APRÈS : ${sample.new_name}`);
    }
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║             CORRECTION FINALE TERMINÉE ✅                    ║');
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
