/**
 * HLS Stream Load Tester v2
 * Simulates concurrent viewers with retry logic and better error handling
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// User Agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
  'VLC/3.0.20 LibVLC/3.0.20',
  'Lavf/60.3.100',
  'Kodi/20.2',
  'TiviMate/4.7.0',
  'IPTV Smarters Pro/3.1.5',
  'Perfect Player IPTV/1.6.0',
  'hls.js/1.4.12',
  'ExoPlayerLib/2.19.1',
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) SamsungBrowser/5.0',
  'Roku/DVP-12.5',
  'AppleTV/17.1',
  'AmazonWebAppPlatform/3.0 (FireTV)',
];

// Config
const STREAM_URL = process.argv[2] || 'https://s01.zz00.org/live/admin/admin123/15.m3u8';
const NUM_VIEWERS = parseInt(process.argv[3]) || 100;
const DURATION_SECONDS = parseInt(process.argv[4]) || 60;
const RAMP_UP_SECONDS = parseInt(process.argv[5]) || 10;

// Stats
const stats = {
  startTime: 0,
  totalBytes: 0,
  segments: 0,
  playlists: 0,
  errors: 0,
  retries: 0,
  activeViewers: 0,
};

// Agents with higher limits
const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 500,
  maxFreeSockets: 100,
  timeout: 60000,
});

function fetch(url, userAgent, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const proto = parsed.protocol === 'https:' ? https : http;
    
    const req = proto.get(url, {
      agent: httpsAgent,
      timeout,
      headers: { 'User-Agent': userAgent },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetch(res.headers.location, userAgent, timeout).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks).toString(), size: chunks.reduce((a, c) => a + c.length, 0) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchWithRetry(url, userAgent, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, userAgent);
    } catch (e) {
      stats.retries++;
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

function parseSegments(playlist, baseUrl) {
  return playlist.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.startsWith('http') ? l : new URL(l.trim(), baseUrl).href);
}

async function viewer(id, url, duration) {
  const ua = USER_AGENTS[id % USER_AGENTS.length];
  stats.activeViewers++;
  
  const end = Date.now() + duration;
  let lastSeg = null;
  
  try {
    while (Date.now() < end) {
      try {
        const { body, size } = await fetchWithRetry(url, ua);
        stats.playlists++;
        stats.totalBytes += size;
        
        const segs = parseSegments(body, url);
        if (segs.length > 0) {
          const seg = segs[segs.length - 1];
          if (seg !== lastSeg) {
            try {
              const r = await fetchWithRetry(seg, ua);
              stats.segments++;
              stats.totalBytes += r.size;
              lastSeg = seg;
            } catch (e) { stats.errors++; }
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        stats.errors++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } finally {
    stats.activeViewers--;
  }
}

function printStats() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const mb = (stats.totalBytes / 1048576).toFixed(1);
  const mbps = ((stats.totalBytes * 8) / (elapsed * 1000000)).toFixed(1);
  process.stdout.write(`\r${elapsed.toFixed(0)}s | 👥${stats.activeViewers} | 📦${stats.segments} | ${mb}MB | ${mbps}Mbps | ❌${stats.errors} | 🔄${stats.retries}   `);
}

async function main() {
  console.log('='.repeat(50));
  console.log(`HLS Load Test: ${NUM_VIEWERS} viewers, ${DURATION_SECONDS}s`);
  console.log(`URL: ${STREAM_URL}`);
  console.log(`Ramp-up: ${RAMP_UP_SECONDS}s`);
  console.log('='.repeat(50));

  // Test connection
  try {
    await fetch(STREAM_URL, USER_AGENTS[0], 5000);
    console.log('✅ Stream accessible');
  } catch (e) {
    console.error('❌ Cannot access stream:', e.message);
    process.exit(1);
  }

  stats.startTime = Date.now();
  const interval = setInterval(printStats, 500);
  
  // Start viewers with ramp-up
  const viewers = [];
  const delay = (RAMP_UP_SECONDS * 1000) / NUM_VIEWERS;
  
  console.log('\nStarting viewers...\n');
  
  for (let i = 0; i < NUM_VIEWERS; i++) {
    viewers.push(viewer(i, STREAM_URL, DURATION_SECONDS * 1000));
    await new Promise(r => setTimeout(r, delay));
  }
  
  await Promise.all(viewers);
  clearInterval(interval);
  
  // Results
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const mb = (stats.totalBytes / 1048576).toFixed(2);
  const mbps = ((stats.totalBytes * 8) / (elapsed * 1000000)).toFixed(2);
  
  console.log('\n\n' + '='.repeat(50));
  console.log('RESULTS');
  console.log('='.repeat(50));
  console.log(`Duration: ${elapsed.toFixed(1)}s`);
  console.log(`Viewers: ${NUM_VIEWERS}`);
  console.log(`Segments: ${stats.segments}`);
  console.log(`Data: ${mb} MB`);
  console.log(`Bandwidth: ${mbps} Mbps`);
  console.log(`Per viewer: ${(mbps / NUM_VIEWERS).toFixed(2)} Mbps`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Retries: ${stats.retries}`);
  console.log('='.repeat(50));
  
  httpsAgent.destroy();
}

process.on('SIGINT', () => {
  console.log('\n\nStopping...');
  httpsAgent.destroy();
  process.exit(0);
});

main().catch(console.error);
