import { prisma } from '../src/config/database.js';

async function removeDuplicateCategories() {
  try {
    console.log('=== Finding Duplicate Categories ===\n');
    
    // Get all categories
    const allCategories = await prisma.category.findMany({
      include: {
        streams: true,
        series: true,
        streamCategories: true,
        seriesCategories: true,
        children: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });

    // Group by type::name
    const grouped: Record<string, typeof allCategories> = {};
    for (const cat of allCategories) {
      const key = `${cat.type}::${cat.name}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(cat);
    }

    let totalDuplicates = 0;
    let totalDeleted = 0;

    for (const [key, categories] of Object.entries(grouped)) {
      if (categories.length <= 1) continue;

      totalDuplicates += categories.length - 1;
      
      console.log(`\n📋 ${key}`);
      console.log(`  Found ${categories.length} duplicates`);
      
      // Keep the first one (lowest ID) as the primary
      const [primary, ...duplicates] = categories.sort((a, b) => a.id - b.id);
      
      console.log(`  ✓ Keeping ID ${primary.id} (${primary.streams.length + primary.streamCategories.length} streams, ${primary.series.length + primary.seriesCategories.length} series)`);
      
      // Process each duplicate
      for (const dup of duplicates) {
        console.log(`  🗑️  Removing ID ${dup.id} (${dup.streams.length + dup.streamCategories.length} streams, ${dup.series.length + dup.seriesCategories.length} series, ${dup.children.length} children)`);
        
        // 1. Update all streams that use this duplicate category (primary relation)
        if (dup.streams.length > 0) {
          await prisma.stream.updateMany({
            where: { categoryId: dup.id },
            data: { categoryId: primary.id },
          });
          console.log(`    - Moved ${dup.streams.length} streams to primary category`);
        }

        // 2. Update all series that use this duplicate category (primary relation)
        if (dup.series.length > 0) {
          await prisma.series.updateMany({
            where: { categoryId: dup.id },
            data: { categoryId: primary.id },
          });
          console.log(`    - Moved ${dup.series.length} series to primary category`);
        }

        // 3. Handle many-to-many stream categories
        if (dup.streamCategories.length > 0) {
          for (const sc of dup.streamCategories) {
            // Check if the stream already has this primary category
            const existing = await prisma.streamCategory.findUnique({
              where: {
                streamId_categoryId: {
                  streamId: sc.streamId,
                  categoryId: primary.id,
                },
              },
            });

            if (!existing) {
              // Move to primary category
              await prisma.streamCategory.update({
                where: {
                  streamId_categoryId: {
                    streamId: sc.streamId,
                    categoryId: dup.id,
                  },
                },
                data: {
                  categoryId: primary.id,
                },
              });
            } else {
              // Delete duplicate relation
              await prisma.streamCategory.delete({
                where: {
                  streamId_categoryId: {
                    streamId: sc.streamId,
                    categoryId: dup.id,
                  },
                },
              });
            }
          }
          console.log(`    - Handled ${dup.streamCategories.length} stream category relations`);
        }

        // 4. Handle many-to-many series categories
        if (dup.seriesCategories.length > 0) {
          for (const sc of dup.seriesCategories) {
            // Check if the series already has this primary category
            const existing = await prisma.seriesCategory.findUnique({
              where: {
                seriesId_categoryId: {
                  seriesId: sc.seriesId,
                  categoryId: primary.id,
                },
              },
            });

            if (!existing) {
              // Move to primary category
              await prisma.seriesCategory.update({
                where: {
                  seriesId_categoryId: {
                    seriesId: sc.seriesId,
                    categoryId: dup.id,
                  },
                },
                data: {
                  categoryId: primary.id,
                },
              });
            } else {
              // Delete duplicate relation
              await prisma.seriesCategory.delete({
                where: {
                  seriesId_categoryId: {
                    seriesId: sc.seriesId,
                    categoryId: dup.id,
                  },
                },
              });
            }
          }
          console.log(`    - Handled ${dup.seriesCategories.length} series category relations`);
        }

        // 5. Move child categories to the primary parent
        if (dup.children.length > 0) {
          await prisma.category.updateMany({
            where: { parentId: dup.id },
            data: { parentId: primary.id },
          });
          console.log(`    - Moved ${dup.children.length} child categories to primary`);
        }

        // 6. Update parent references if this duplicate was a parent
        if (dup.parentId) {
          // Check if it's pointing to another duplicate
          const otherDup = duplicates.find(d => d.id === dup.parentId);
          if (otherDup) {
            await prisma.category.update({
              where: { id: dup.id },
              data: { parentId: primary.id },
            });
          }
        }

        // 7. Finally, delete the duplicate category
        try {
          await prisma.category.delete({
            where: { id: dup.id },
          });
          totalDeleted++;
          console.log(`    ✅ Deleted duplicate category ID ${dup.id}`);
        } catch (error: any) {
          console.log(`    ❌ Failed to delete ID ${dup.id}: ${error.message}`);
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total duplicate categories found: ${totalDuplicates}`);
    console.log(`Total categories deleted: ${totalDeleted}`);
    
    // Final count
    const finalCount = await prisma.category.count();
    console.log(`Categories remaining: ${finalCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeDuplicateCategories();
