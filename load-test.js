/**
 * HLS Stream Load Tester
 * Simulates multiple concurrent viewers fetching HLS segments
 * 
 * Usage: node load-test.js <url> <viewers> <duration>
 * Example: node load-test.js https://s01.zz00.org/live/admin/admin123/15.m3u8 50 60
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Random User Agents for realistic simulation
const USER_AGENTS = [
  // Desktop Browsers
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Mobile Browsers
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  // IPTV Players
  'VLC/3.0.20 LibVLC/3.0.20',
  'Lavf/60.3.100',
  'Kodi/20.2 (Windows NT 10.0; Win64; x64)',
  'TiviMate/4.7.0',
  'IPTV Smarters Pro/3.1.5',
  'GSE SMART IPTV/4.8',
  'Perfect Player IPTV/1.6.0',
  'OTT Navigator/1.6.8',
  'Televizo/1.9.7',
  'Xtream IPTV Player/3.2.1',
  // Smart TV
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/85.0.4183.93 TV Safari/537.36',
  'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager',
  'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K GB) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
  // Streaming Devices
  'Roku/DVP-12.5 (12.5.5)',
  'AppleTV/17.1',
  'AmazonWebAppPlatform/3.0 (FireTV)',
  'Chromecast/1.56.284932',
  // HLS.js and other players
  'hls.js/1.4.12',
  'ExoPlayerLib/2.19.1',
  'AVPlayer/iOS 17.1',
];

// Configuration
const STREAM_URL = process.argv[2] || 'https://s01.zz00.org/live/admin/admin123/15.m3u8';
const NUM_VIEWERS = parseInt(process.argv[3]) || 50;
const DURATION_SECONDS = parseInt(process.argv[4]) || 60;
const RAMP_UP_SECONDS = 5;

// Stats tracking
const stats = {
  startTime: Date.now(),
  totalBytesReceived: 0,
  totalSegmentsFetched: 0,
  totalPlaylistsFetched: 0,
  errors: 0,
  activeViewers: 0,
  viewerStats: new Map(),
};

// HTTP agent with connection pooling
const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: NUM_VIEWERS * 2,
  timeout: 30000,
});
const httpAgent = new http.Agent({ 
  keepAlive: true, 
  maxSockets: NUM_VIEWERS * 2,
  timeout: 30000,
});

/**
 * Fetch a URL and return the response body and size
 */
function fetchUrl(url, timeout = 10000, userAgent = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const agent = parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent;

    const options = { 
      agent, 
      timeout,
      headers: userAgent ? { 'User-Agent': userAgent } : {},
    };

    const req = protocol.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        fetchUrl(res.headers.location, timeout, userAgent).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      let size = 0;

      res.on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
      });

      res.on('end', () => {
        resolve({ body: Buffer.concat(chunks).toString(), size });
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Parse HLS playlist and extract segment URLs
 */
function parsePlaylist(content, baseUrl) {
  const lines = content.split('\n');
  const segments = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      if (trimmed.startsWith('http')) {
        segments.push(trimmed);
      } else {
        // Relative URL
        const url = new URL(trimmed, baseUrl);
        segments.push(url.href);
      }
    }
  }
  
  return segments;
}

/**
 * Simulate a single viewer
 */
async function simulateViewer(viewerId, streamUrl, durationMs) {
  // Assign a random user agent to this viewer
  const userAgent = USER_AGENTS[viewerId % USER_AGENTS.length];
  
  const viewerStats = {
    bytesReceived: 0,
    segmentsFetched: 0,
    playlistsFetched: 0,
    errors: 0,
    startTime: Date.now(),
    userAgent: userAgent.substring(0, 30) + '...',
  };
  
  stats.viewerStats.set(viewerId, viewerStats);
  stats.activeViewers++;

  const endTime = Date.now() + durationMs;
  let lastSegment = null;

  try {
    while (Date.now() < endTime) {
      try {
        // Fetch playlist with user agent
        const { body: playlist, size: playlistSize } = await fetchUrl(streamUrl, 5000, userAgent);
        viewerStats.playlistsFetched++;
        viewerStats.bytesReceived += playlistSize;
        stats.totalPlaylistsFetched++;
        stats.totalBytesReceived += playlistSize;

        // Parse segments
        const segments = parsePlaylist(playlist, streamUrl);
        
        if (segments.length > 0) {
          // Get last segment (most recent)
          const segment = segments[segments.length - 1];
          
          // Only fetch if it's a new segment
          if (segment !== lastSegment) {
            try {
              const { size } = await fetchUrl(segment, 15000, userAgent);
              viewerStats.segmentsFetched++;
              viewerStats.bytesReceived += size;
              stats.totalSegmentsFetched++;
              stats.totalBytesReceived += size;
              lastSegment = segment;
            } catch (err) {
              viewerStats.errors++;
              stats.errors++;
            }
          }
        }

        // Wait before next playlist fetch (HLS typically updates every segment duration)
        await new Promise(r => setTimeout(r, 2000));

      } catch (err) {
        viewerStats.errors++;
        stats.errors++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } finally {
    stats.activeViewers--;
  }

  return viewerStats;
}

/**
 * Print live stats
 */
function printLiveStats() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const mbReceived = (stats.totalBytesReceived / 1048576).toFixed(2);
  const mbps = ((stats.totalBytesReceived * 8) / (elapsed * 1000000)).toFixed(2);
  
  process.stdout.write(`\r⏱️  ${elapsed.toFixed(0)}s | 👥 ${stats.activeViewers} viewers | 📦 ${stats.totalSegmentsFetched} segments | 📊 ${mbReceived} MB | 🚀 ${mbps} Mbps | ❌ ${stats.errors} errors    `);
}

/**
 * Main function
 */
async function main() {
  console.log('========================================');
  console.log('  HLS Stream Load Tester');
  console.log('========================================');
  console.log(`Stream URL: ${STREAM_URL}`);
  console.log(`Viewers: ${NUM_VIEWERS}`);
  console.log(`Duration: ${DURATION_SECONDS}s`);
  console.log(`Ramp-up: ${RAMP_UP_SECONDS}s`);
  console.log('========================================');
  console.log('');

  // Verify stream is accessible
  console.log('Testing stream accessibility...');
  try {
    const { body } = await fetchUrl(STREAM_URL, 5000);
    const segments = parsePlaylist(body, STREAM_URL);
    console.log(`✅ Stream accessible (${segments.length} segments in playlist)`);
  } catch (err) {
    console.error(`❌ Failed to access stream: ${err.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('Starting viewers...');

  // Start live stats display
  const statsInterval = setInterval(printLiveStats, 500);

  // Start viewers with ramp-up
  const viewers = [];
  const delayMs = (RAMP_UP_SECONDS * 1000) / NUM_VIEWERS;
  
  for (let i = 1; i <= NUM_VIEWERS; i++) {
    viewers.push(
      simulateViewer(i, STREAM_URL, DURATION_SECONDS * 1000)
    );
    await new Promise(r => setTimeout(r, delayMs));
  }

  // Wait for all viewers to complete
  await Promise.all(viewers);

  // Stop stats display
  clearInterval(statsInterval);
  console.log('\n');

  // Print final results
  const totalElapsed = (Date.now() - stats.startTime) / 1000;
  const totalMB = (stats.totalBytesReceived / 1048576).toFixed(2);
  const avgMbps = ((stats.totalBytesReceived * 8) / (totalElapsed * 1000000)).toFixed(2);
  const avgMbpsPerViewer = (avgMbps / NUM_VIEWERS).toFixed(2);

  console.log('========================================');
  console.log('  Load Test Results');
  console.log('========================================');
  console.log(`Duration: ${totalElapsed.toFixed(1)}s`);
  console.log(`Viewers: ${NUM_VIEWERS}`);
  console.log(`Total segments fetched: ${stats.totalSegmentsFetched}`);
  console.log(`Total playlists fetched: ${stats.totalPlaylistsFetched}`);
  console.log(`Total data received: ${totalMB} MB`);
  console.log(`Average bandwidth: ${avgMbps} Mbps`);
  console.log(`Avg per viewer: ${avgMbpsPerViewer} Mbps`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Error rate: ${((stats.errors / (stats.totalSegmentsFetched + stats.totalPlaylistsFetched)) * 100).toFixed(2)}%`);
  console.log('========================================');

  // Cleanup
  httpsAgent.destroy();
  httpAgent.destroy();
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nStopping load test...');
  httpsAgent.destroy();
  httpAgent.destroy();
  process.exit(0);
});

main().catch(console.error);
