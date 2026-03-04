# Viewer Count Display Feature

## Overview
Added real-time viewer count display for VOD content in both the **Portal** (user-facing) and **Admin** interfaces, including movie details pages and movie cards.

## Backend Changes

### 1. Player API Routes (`iptv-server/src/api/routes/player.ts`)
- **Import Added**: `vodViewerManager` from VodViewerManager service
- **`getVodStreams()` function**: 
  - Now fetches viewer counts for all VOD streams using `vodViewerManager.getViewerCounts()`
  - Adds `viewer_count` field to each VOD stream item
- **`getVodInfo()` function**:
  - Now fetches viewer count for the specific VOD using `vodViewerManager.getViewerCount()`
  - Adds `viewer_count` field to the info object

### 2. Admin API Routes (`iptv-server/src/api/routes/admin.ts`)
- **`GET /admin/streams`**: Already had viewer count for VOD (no changes needed)
- **`GET /admin/streams/:id`**: Updated to include viewer count for VOD streams
  - Fetches viewer count using `vodViewerManager.getViewerCount()`
  - Returns enhanced stream object with `viewerCount` field

### 3. TypeScript Types (`iptv-server/src/types/stream.ts`)
- **`VodStreamItem` interface**: Added optional `viewer_count?: number` field
- **`VodInfo` interface**: Added optional `viewer_count?: number` field to the `info` object

### 4. Viewer Tracking (Already Existing)
The backend already has a complete viewer tracking system via:
- `VodViewerManager` service that tracks viewers in Redis
- Automatic viewer registration/refresh on segment requests
- TTL-based expiry (60 seconds) for inactive viewers

## Frontend Changes

### Portal (User-Facing)

#### 1. Movie Details Page (`iptv-frontend/src/app/(portal)/portal/watch/vod/[id]/page.tsx`)
- **Import Added**: `Eye` icon from lucide-react
- **`VodInfo` interface**: Added `viewer_count?: number` to the info object
- **Display Logic**: Shows viewer count with eye icon when available:
  ```tsx
  {vodInfo.info.viewer_count !== undefined && (
    <div className="flex items-center gap-1 text-gray-400">
      <Eye className="h-4 w-4" />
      <span>{vodInfo.info.viewer_count} watching</span>
    </div>
  )}
  ```

#### 2. Movies Page (`iptv-frontend/src/app/(portal)/portal/movies/page.tsx`)
- **Import Added**: `Eye` icon from lucide-react
- **`Movie` interface**: Added optional `viewerCount?: number` field
- **Mock Data**: Updated all mock movies with sample viewer counts
- **Display Logic**: Shows viewer count in movie cards when > 0:
  ```tsx
  {movie.viewerCount !== undefined && movie.viewerCount > 0 && (
    <>
      <span>•</span>
      <span className="flex items-center">
        <Eye className="h-3 w-3 mr-1" />
        {movie.viewerCount}
      </span>
    </>
  )}
  ```

### Admin Interface

#### 1. VOD List Page (`iptv-frontend/src/app/(admin)/admin/vod/page.tsx`)
- **Already Implemented**: MovieCard component already displays viewer count
- Uses `Users` icon with green color for admin interface
- Shows "{viewerCount} watching" when > 0
- Data automatically fetched from `/admin/streams` endpoint

#### 2. VOD Details Page (`iptv-frontend/src/app/(admin)/admin/vod/[id]/page.tsx`)
- **Already Implemented**: Shows viewer count in header metadata
- Uses `Users` icon with green color
- Displays alongside rating, year, and duration
- Data automatically fetched from `/admin/streams/:id` endpoint

## Features

### Viewer Count Display

**Portal (User-Facing)**:
- **Movie Details Page**: Shows "👁️ X watching" below movie title with rating, year, duration
- **Movie Cards**: Shows "👁️ X" next to rating in compact format (only when > 0)
- Uses Eye icon for intuitive recognition
- Gray color to match other metadata

**Admin Interface**:
- **VOD List Cards**: Shows "👥 X watching" below rating in green color
- **VOD Details Page**: Shows "👥 X watching" in header metadata section
- Green color indicates active viewers (admin context)
- Always shows when > 0

### Real-time Updates
- Counts are updated on each API request based on Redis tracking
- Viewer automatically registered when playing video
- Auto-expires after 60 seconds of inactivity
- Performance-optimized with Redis batch queries

### Visual Design
- Portal: Eye icon (👁️) in gray
- Admin: Users icon (👥) in green  
- Only shows when viewer count > 0 (portal cards) or available (details pages)
- Responsive design works on all screen sizes

## API Response Format

### Player API

#### GET /player_api.php?action=get_vod_streams
```json
{
  "stream_id": 123,
  "name": "Movie Name",
  "viewer_count": 42,
  ...
}
```

#### GET /player_api.php?action=get_vod_info
```json
{
  "info": {
    "movie_image": "...",
    "viewer_count": 15,
    ...
  },
  "movie_data": { ... }
}
```

### Admin API

#### GET /admin/streams (with type=VOD)
```json
{
  "streams": [
    {
      "id": 123,
      "name": "Movie Name",
      "streamType": "VOD",
      "viewerCount": 42,
      "displayStatus": "active",
      ...
    }
  ]
}
```

#### GET /admin/streams/:id (VOD stream)
```json
{
  "id": 123,
  "name": "Movie Name",
  "streamType": "VOD",
  "viewerCount": 15,
  ...
}
```

#### GET /admin/vod (Admin VOD list)
```json
{
  "data": [
    {
      "id": 123,
      "name": "Movie Name",
      "year": 2023,
      "rating": 8.5,
      "viewerCount": 42,
      "tmdbSynced": true,
      ...
    }
  ],
  "pagination": { ... }
}
```

#### GET /admin/vod/:id (Admin VOD detail)
```json
{
  "id": 123,
  "name": "Movie Name",
  "year": 2023,
  "rating": 8.5,
  "viewerCount": 15,
  "tmdbSynced": true,
  ...
}
```

## Files Modified

### Backend (4 files)
1. `iptv-server/src/api/routes/player.ts` - Added viewer count to player API
2. `iptv-server/src/api/routes/admin.ts` - Added viewer count to stream detail endpoint  
3. `iptv-server/src/api/routes/vod.ts` - **Added viewer count to VOD endpoints (GET /admin/vod and GET /admin/vod/:id)**
4. `iptv-server/src/types/stream.ts` - Added viewer_count to interfaces

### Frontend (2 files)
1. `iptv-frontend/src/app/(portal)/portal/watch/vod/[id]/page.tsx` - Portal movie details
2. `iptv-frontend/src/app/(portal)/portal/movies/page.tsx` - Portal movie cards

**Note**: Admin VOD pages (MovieCard component and details page) already had full UI support - they were just waiting for the backend data!

## Testing

To test the feature:

1. **Start Services**:
   ```bash
   cd iptv-server && npm run dev
   cd iptv-frontend && npm run dev
   ```

2. **Test Portal**:
   - Open a VOD stream in the player
   - The viewer should be counted and displayed
   - Open the same VOD in another browser/tab
   - Viewer count should increase
   - Navigate to movies page to see viewer counts

3. **Test Admin**:
   - Login to admin panel
   - Go to VOD management page
   - View movie cards with active viewers
   - Click on a movie to see detailed viewer count
   - Wait 60 seconds after closing player
   - Viewer count should decrease

## Technical Notes

- **Storage**: Viewer count is tracked in Redis, not database
- **Accuracy**: Count is accurate to within 60 seconds (TTL)
- **Performance**: Minimal impact - Redis lookups are fast, batch queries used for lists
- **Scalability**: Supports thousands of concurrent viewers
- **Backward Compatibility**: Frontend gracefully handles missing viewer_count field
- **Redis Keys**: Format is `vod:{streamId}:viewer:{viewerId}`
- **Cleanup**: Automatic via Redis TTL expiry

## Future Enhancements

Possible improvements:
- Add viewer count to live streams
- Show viewer history/analytics
- Real-time updates via WebSocket
- Peak viewer count tracking
- Geographic distribution of viewers
