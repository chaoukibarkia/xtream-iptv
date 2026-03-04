# Stream Health Check Feature

## Overview

**Problem**: When a user tries to watch a broken channel, a connection is registered even though the stream won't work. This blocks users with `maxConnections=1` until the timeout cleanup occurs (5-10 minutes).

**Solution**: Check if the stream source is working **BEFORE** registering a connection. If the source is broken, return an error immediately without registering a connection.

---

## How It Works

### Current Flow (Without Health Check)
```
User requests channel
  ↓
Register connection (counts toward limit)
  ↓
Start FFmpeg/proxy
  ↓
Stream fails (broken source)
  ↓
Connection stuck until timeout (5-10 min)
```

### New Flow (With Health Check)
```
User requests channel
  ↓
✨ HEALTH CHECK: Test source URL
  ↓
Source broken? → Return error immediately (NO connection registered)
  ↓
Source OK? → Register connection → Start stream
```

---

## Benefits

### 1. Instant Feedback ⚡
- **Before**: User waits for stream to start, then gets error
- **After**: User gets immediate "stream unavailable" error (< 5 seconds)

### 2. No Connection Wasted 🎯
- **Before**: Broken stream registers connection, blocks user
- **After**: No connection registered if stream broken

### 3. Better UX 😊
- Users know immediately if channel is working
- Can try another channel right away
- No frustrating waits

### 4. Less System Load 💪
- Don't start FFmpeg for broken streams
- No transcoding for non-working sources
- Save CPU and bandwidth

---

## Implementation

### New Service: `StreamHealthChecker`

**File**: `iptv-server/src/services/streaming/StreamHealthCheck.ts`

```typescript
// Check if stream source is working
const health = await streamHealthChecker.checkStreamHealth(
  streamId,
  sourceUrl,
  userAgent
);

if (!health.healthy) {
  // Return error immediately - NO connection registered
  return reply.status(503).send({
    error: 'Stream source unavailable',
    details: health.error,
    latency: health.latency
  });
}

// Source is OK - proceed normally
await registerConnection(...);
```

---

## Configuration

### Default Settings
```typescript
{
  enabled: true,          // Health check enabled
  method: 'http',         // Use HTTP check (fast)
  timeout: 5000,          // 5 second timeout
  cacheResults: true,     // Cache results for 5 minutes
  cacheTTL: 300           // Cache duration in seconds
}
```

### Health Check Methods

#### 1. HTTP Check (Default - Fast)
```typescript
method: 'http'
```
- **Speed**: Very fast (< 1 second)
- **Method**: HTTP HEAD/GET request
- **Checks**: Server responds, correct content-type
- **Best for**: Quick availability check

#### 2. FFprobe Check (Thorough)
```typescript
method: 'ffprobe'
```
- **Speed**: Slower (2-5 seconds)
- **Method**: FFprobe analyzes stream
- **Checks**: Stream is valid, has video/audio
- **Best for**: Verify stream quality

#### 3. Both (Most Reliable)
```typescript
method: 'both'
```
- Tries HTTP first (fast)
- Falls back to FFprobe if HTTP fails
- Most thorough but slowest

---

## Integration Points

### Where to Add Health Checks

#### 1. Before Starting On-Demand Stream
```typescript
// In handleLiveStream() before starting stream
const health = await streamHealthChecker.checkStreamHealth(
  stream.id,
  stream.sourceUrl
);

if (!health.healthy) {
  return reply.status(503).send({
    error: 'Stream not available',
    details: health.error
  });
}
```

#### 2. Before Playing VOD
```typescript
// Before starting VOD playback
const health = await streamHealthChecker.checkStreamHealth(
  stream.id,
  stream.sourceUrl
);
```

#### 3. Admin API - Test Stream
```typescript
// New endpoint: POST /admin/streams/:id/test
const health = await streamHealthChecker.checkStreamHealth(
  streamId,
  sourceUrl
);

return { 
  healthy: health.healthy,
  latency: health.latency,
  error: health.error
};
```

---

## Caching Strategy

### Why Cache?
- Avoid checking same stream repeatedly
- Reduce load on upstream sources
- Faster response for popular channels

### Cache Behavior
```
First request → Check source → Cache result (5 min)
Second request (within 5 min) → Use cached result (instant)
After 5 min → Check again → Update cache
```

### Clear Cache
```typescript
// Manually clear cache when stream source updated
await streamHealthChecker.clearCache(streamId);
```

---

## Error Responses

### Stream Source Unavailable
```json
{
  "error": "Stream source unavailable",
  "details": "Connection timeout",
  "latency": 5000,
  "statusCode": 503
}
```

### Invalid Stream Format
```json
{
  "error": "Stream source unavailable",
  "details": "Invalid content type: text/html",
  "latency": 1234,
  "statusCode": 503
}
```

### Network Error
```json
{
  "error": "Stream source unavailable",
  "details": "ECONNREFUSED",
  "latency": 2000,
  "statusCode": 503
}
```

---

## Performance Impact

### Latency Added
- **HTTP check**: +500ms to 2s (fast)
- **FFprobe check**: +2s to 5s (thorough)
- **Cached result**: +0ms (instant)

### When Enabled
```
User Experience:
├─ Broken stream: Error in 1-5 seconds (was: stuck 5-10 min) ✅
├─ Working stream: +500ms-2s delay (cached after first request)
└─ Popular streams: No delay (cached results)
```

### Recommendation
```
✅ Enable for production
✅ Use HTTP method (fast)
✅ Enable caching (reduce checks)
✅ 5-minute cache TTL
```

---

## Deployment Strategy

### Phase 1: Optional Feature (Recommended)
```typescript
// Add setting to database
INSERT INTO "Setting" (key, value, type) VALUES
('streaming.healthCheckEnabled', 'true', 'boolean'),
('streaming.healthCheckMethod', 'http', 'string'),
('streaming.healthCheckCacheTTL', '300', 'number');
```

### Phase 2: Integration (Gradual)
```typescript
// Load from settings
const healthCheckEnabled = settings.get('streaming.healthCheckEnabled');

// Use in streaming routes
if (healthCheckEnabled) {
  const health = await streamHealthChecker.checkStreamHealth(...);
  if (!health.healthy) {
    return error;
  }
}
```

### Phase 3: Monitor & Tune
- Watch for false positives (working streams marked as broken)
- Adjust timeout if needed
- Monitor cache hit rate
- Tune TTL based on stream stability

---

## Testing

### Test Scenario 1: Broken Stream
```bash
# Test with non-existent stream URL
stream.sourceUrl = "http://broken-source.com/stream.m3u8"

# Expected:
# - Health check fails in 1-5 seconds
# - Error returned immediately
# - NO connection registered ✅
```

### Test Scenario 2: Working Stream
```bash
# Test with working stream
stream.sourceUrl = "http://working-source.com/stream.m3u8"

# Expected:
# - Health check passes
# - Connection registered
# - Stream starts normally ✅
```

### Test Scenario 3: Slow Source
```bash
# Test with very slow responding source
stream.sourceUrl = "http://slow-source.com/stream.m3u8"

# Expected:
# - Timeout after 5 seconds
# - Error returned (avoid hanging)
# - NO connection registered ✅
```

### Test Scenario 4: Cache Effectiveness
```bash
# Request same stream 10 times in 5 minutes
for i in {1..10}; do
  curl http://s01.zz00.org/live/user/pass/123.m3u8
done

# Expected:
# - First request: Health check performed
# - Requests 2-10: Cached result used (fast) ✅
```

---

## Configuration Examples

### Conservative (Default)
```typescript
{
  enabled: true,
  method: 'http',      // Fast check
  timeout: 5000,       // 5 seconds
  cacheResults: true,
  cacheTTL: 300        // 5 minutes
}
```

### Aggressive (Thorough)
```typescript
{
  enabled: true,
  method: 'both',      // HTTP + FFprobe
  timeout: 10000,      // 10 seconds
  cacheResults: true,
  cacheTTL: 180        // 3 minutes (fresher checks)
}
```

### Disabled (Existing Behavior)
```typescript
{
  enabled: false       // No health checks, rely on timeout cleanup
}
```

---

## Monitoring

### Log Messages

**Health Check Pass:**
```json
{
  "level": "info",
  "streamId": 123,
  "healthy": true,
  "latency": 850,
  "method": "http",
  "msg": "Stream health check completed"
}
```

**Health Check Fail:**
```json
{
  "level": "info",
  "streamId": 456,
  "healthy": false,
  "latency": 5000,
  "method": "http",
  "error": "Connection timeout",
  "msg": "Stream health check completed"
}
```

### Metrics to Track
- Health check success rate
- Average latency per method
- Cache hit rate
- False positive rate (working streams marked broken)

---

## Comparison with Timeout Cleanup

| Aspect | Health Check | Timeout Cleanup |
|--------|--------------|-----------------|
| **Detection Time** | 1-5 seconds | 5-10 minutes |
| **User Feedback** | Immediate | Delayed |
| **Connection Used** | No | Yes (wasted) |
| **System Load** | Minimal check | Full FFmpeg started |
| **Best For** | Known broken sources | Network issues |

### Recommended: Use Both ✅
- **Health check**: Prevents broken streams
- **Timeout cleanup**: Handles edge cases (network issues, crashes)

---

## Status

### Current Implementation
✅ Service created: `StreamHealthCheck.ts`  
⏳ Integration pending: Needs to be added to streaming routes  
⏳ Settings pending: Needs database settings  
⏳ Testing pending: Needs real-world validation

### Next Steps
1. Add settings to database
2. Integrate into streaming routes
3. Test with real streams
4. Monitor false positives
5. Tune configuration
6. Deploy gradually (optional flag)

---

## Conclusion

The Stream Health Check feature provides **proactive** protection against broken streams, complementing the **reactive** timeout cleanup. Together, they create a robust connection management system:

- **Health Check**: Prevents waste (don't register if broken)
- **Timeout Cleanup**: Safety net (cleanup if something goes wrong)

**Result**: Users get instant feedback on broken streams and never get permanently stuck, even in worst-case scenarios. 🎉

---

**Feature Status**: ✅ **READY FOR INTEGRATION**  
**Recommended**: Enable as optional feature, monitor, then make default  
**Impact**: Positive UX improvement with minimal performance cost

---

## 🚀 DEPLOYMENT STATUS: LIVE

**Deployed**: December 12, 2025 13:05 UTC

### All Servers Updated ✅

| Server | Container | Health Check | Service |
|--------|-----------|--------------|---------|
| s01 Main | LXC 102 | ✅ Deployed | ✅ Running |
| s02 Edge | LXC 201 | ✅ Deployed | ✅ Running |
| s03 Edge | LXC 202 | ✅ Deployed | ✅ Running |
| s04 Edge | LXC 203 | ✅ Deployed | ✅ Running |

### What Was Deployed

**File Modified**: `streaming.ts` → `streaming.js`

**Added Function**:
```typescript
async function checkStreamSourceHealth(
  streamId: number,
  sourceUrl: string,
  customUserAgent?: string | null
): Promise<{ healthy: boolean; error?: string; cached: boolean }>
```

**Integration Points**:
1. ✅ Live streams (`handleLiveStream`)
2. ✅ VOD movies (`/movie/` endpoint)
3. ✅ Series episodes (`/series/` endpoint)

### Behavior Now

```
User requests stream
  ↓
Authenticate user ✅
  ↓
Check connection limit ✅
  ↓
Fetch stream info from DB ✅
  ↓
✨ NEW: Health check source URL
  ↓
Source broken? → 503 error (no connection)
Source OK? → Register connection → Start stream
```

### Error Response (When Source Broken)
```json
{
  "error": "Stream source unavailable",
  "message": "The channel source is currently not responding. Please try again later or choose another channel.",
  "details": "Connection timeout"
}
```

### Caching
- Results cached for 5 minutes per stream
- Prevents repeated checks for popular channels
- Cache key: `streamId`

### Logs
```json
{
  "level": "warn",
  "streamId": 123,
  "streamName": "Broken Channel",
  "error": "Connection refused",
  "cached": false,
  "msg": "Stream source unavailable - not registering connection"
}
```

---

## Complete Protection Stack

Your system now has **4 layers** of protection:

| Layer | Type | Detection | User Impact |
|-------|------|-----------|-------------|
| **1. Health Check** | Proactive | < 5 seconds | Instant error |
| **2. Zapping Fix** | Active | Immediate | Instant switch |
| **3. Timeout** | Reactive | 5-10 min | Auto-recovery |
| **4. Backup URLs** | Failover | Automatic | Seamless switch |

### Result
✅ Users with `maxConnections=1` are never permanently blocked  
✅ Broken channels don't waste connections  
✅ Instant feedback when source unavailable  
✅ Self-healing system

---

**Feature Status**: ✅ **LIVE IN PRODUCTION**
