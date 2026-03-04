import { prisma } from '../src/config/database.js';

// Sample episode data templates
const sampleEpisodes = [
  {
    title: "Episode 1",
    plot: "The beginning of an exciting journey.",
    sourceUrl: "https://example.com/episode1.mp4",
    containerExtension: "mp4",
  },
  {
    title: "Episode 2", 
    plot: "The story continues with new challenges.",
    sourceUrl: "https://example.com/episode2.mp4",
    containerExtension: "mp4",
  },
  {
    title: "Episode 3",
    plot: "Unexpected turns lead to thrilling moments.",
    sourceUrl: "https://example.com/episode3.mp4",
    containerExtension: "mp4",
  },
  {
    title: "Episode 4",
    plot: "Tensions rise as conflicts unfold.",
    sourceUrl: "https://example.com/episode4.mp4",
    containerExtension: "mp4",
  },
  {
    title: "Episode 5",
    plot: "New alliances are formed.",
    sourceUrl: "https://example.com/episode5.mp4",
    containerExtension: "mp4",
  },
  {
    title: "Episode 6",
    plot: "The stakes have never been higher.",
    sourceUrl: "https://example.com/episode6.mp4",
    containerExtension: "mp4",
  },
  {
    title: "Episode 7",
    plot: "Secrets are revealed that change everything.",
    sourceUrl: "https://example.com/episode7.mp4",
    containerExtension: "mp4",
  },
  {
    title: "Episode 8",
    plot: "The season finale brings shocking conclusions.",
    sourceUrl: "https://example.com/episode8.mp4",
    containerExtension: "mp4",
  },
];

async function updateSeries() {
  try {
    const series = await prisma.series.findMany({
      include: {
        episodes: true,
      },
    });

    console.log(`Found ${series.length} series\n`);
    
    let updated = 0;
    
    for (const s of series) {
      console.log(`\nProcessing: ${s.name} (ID: ${s.id})`);
      
      // Determine how many seasons this series should have
      const existingSeasons = [...new Set(s.episodes.map(e => e.seasonNumber))].sort((a, b) => a - b);
      
      // If series has no episodes, add 1 season with 8 episodes
      if (existingSeasons.length === 0) {
        console.log(`  Adding Season 1 with 8 episodes`);
        
        for (let ep = 1; ep <= 8; ep++) {
          const template = sampleEpisodes[ep - 1];
          await prisma.episode.create({
            data: {
              seriesId: s.id,
              seasonNumber: 1,
              episodeNumber: ep,
              title: `${s.name} - S01E${ep.toString().padStart(2, '0')} - ${template.title}`,
              plot: template.plot,
              sourceUrl: template.sourceUrl,
              containerExtension: template.containerExtension,
              duration: 2400, // 40 minutes default
            },
          });
        }
        updated++;
        console.log(`  ✓ Created 8 episodes for Season 1`);
        continue;
      }
      
      // Check each existing season and fill missing episodes
      const maxSeason = Math.max(...existingSeasons);
      
      for (let season = 1; season <= maxSeason; season++) {
        const episodesInSeason = s.episodes.filter(e => e.seasonNumber === season);
        
        if (episodesInSeason.length === 0) {
          // Season exists in the series but has no episodes
          console.log(`  Adding 8 episodes to Season ${season}`);
          
          for (let ep = 1; ep <= 8; ep++) {
            const template = sampleEpisodes[ep - 1];
            await prisma.episode.create({
              data: {
                seriesId: s.id,
                seasonNumber: season,
                episodeNumber: ep,
                title: `${s.name} - S${season.toString().padStart(2, '0')}E${ep.toString().padStart(2, '0')} - ${template.title}`,
                plot: template.plot,
                sourceUrl: template.sourceUrl,
                containerExtension: template.containerExtension,
                duration: 2400,
              },
            });
          }
          updated++;
          console.log(`  ✓ Created 8 episodes for Season ${season}`);
        } else if (episodesInSeason.length < 8) {
          // Season has some episodes but less than 8, fill the rest
          const existingEpisodeNumbers = episodesInSeason.map(e => e.episodeNumber);
          const maxEpisode = Math.max(...existingEpisodeNumbers);
          
          if (maxEpisode < 8) {
            console.log(`  Adding episodes ${maxEpisode + 1}-8 to Season ${season}`);
            
            for (let ep = maxEpisode + 1; ep <= 8; ep++) {
              const template = sampleEpisodes[ep - 1];
              await prisma.episode.create({
                data: {
                  seriesId: s.id,
                  seasonNumber: season,
                  episodeNumber: ep,
                  title: `${s.name} - S${season.toString().padStart(2, '0')}E${ep.toString().padStart(2, '0')} - ${template.title}`,
                  plot: template.plot,
                  sourceUrl: template.sourceUrl,
                  containerExtension: template.containerExtension,
                  duration: 2400,
                },
              });
            }
            updated++;
            console.log(`  ✓ Created episodes ${maxEpisode + 1}-8 for Season ${season}`);
          } else {
            console.log(`  Season ${season} already has ${episodesInSeason.length} episodes - skipping`);
          }
        } else {
          console.log(`  Season ${season} already has ${episodesInSeason.length} episodes - skipping`);
        }
      }
    }
    
    console.log(`\n✓ Update complete! Updated ${updated} series/seasons`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateSeries();
