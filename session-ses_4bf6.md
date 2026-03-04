# Adapting Zeba Android app for Xtream Code

**Session ID:** ses_4bf626d05ffeXqsHeVkMUoNUBs
**Created:** 12/21/2025, 11:13:47 AM
**Updated:** 12/21/2025, 11:18:44 AM

---

## User

we habe a zeba android app that we want to adjust to work with our newly iptv app backend compatible xtream code 

---

## Assistant

I understand you have a Zeba Android app that you want to modify to work with your new IPTV backend that's compatible with Xtream Codes API. Let me first explore your codebase to understand both the backend API structure and the Android app structure.

```
Tool: task
```

```
Tool: glob
```

```
Tool: glob
```

---

## User

zebra

---

## User

we habe a zebra android app that we want to adjust to work with our newly iptv app backend compatible xtream code 

---

## Assistant

I see you have a **Zebra** Android app that you want to connect to your Xtream Codes-compatible IPTV backend. Let me explore your backend API structure and look for the Zebra app.

```
Tool: task
```

```
Tool: glob
```

```
Tool: list
```

---

## Assistant

---

## User

continue

---

## Assistant

Great! I found your Zebra Android app in `/storage-pool/xtream/zebra-apk/`. Let me explore the app structure to understand how it currently works and what needs to be adjusted to connect to your new Xtream Codes-compatible backend.

```
Tool: todowrite
```

```
Tool: read
```

```
Tool: read
```

```
Tool: read
```

```
Tool: read
```

---

## Assistant

Now let me examine the IPTV-specific activities and data models to understand how the app retrieves and displays content:

```
Tool: read
```

```
Tool: read
```

```
Tool: read
```

```
Tool: read
```

---

## Assistant

Perfect! Now I have a comprehensive understanding of both the Zebra Android app and your new Xtream Codes-compatible backend. Let me update my todos and create a detailed migration plan.

```
Tool: todowrite
```

---

## Assistant

## Zebra Android App → Xtream Codes Backend Migration Plan

Based on my analysis, I've identified the key differences and required changes. Let me present a comprehensive plan:

---

## **Current Architecture Analysis**

### **Authentication Flow (Current)**
The Zebra app currently uses a **custom two-step authentication**:
1. **Step 1**: Authenticates with `https://www.machinevaisselle.tn/auth/loginservice/login` using hardcoded credentials (`zebra`/`ZebR@++2020`) to get a Bearer token
2. **Step 2**: Uses the Bearer token to call `https://www.machinevaisselle.tn/api/getcodeservice/getcode` with an activation code and device ID
3. Returns Xtream credentials (`username`/`password`) and server details (`domain`, `http_port`)

### **Content Retrieval (Current)**
The app mixes **custom API calls** with **Xtream API calls**:
- **Live TV Categories**: Custom API (`https://machinevaisselle.tn/api/stream_categories`)
- **Live Streams**: Xtream API (`/player_api.php?action=get_live_streams`)
- **VOD**: Xtream API (`/player_api.php?action=get_vod_streams`)
- **Series**: Custom API (`https://www.machinevaisselle.tn/api/getseriesservice/getseries`)

---

## **Required Changes**

### **🔴 CRITICAL: Authentication System**

**Current Problem**: The app relies on a completely separate authentication service (`machinevaisselle.tn`) that:
- Issues activation codes
- Manages device locks (STB ID)
- Provides Xtream credentials after activation

**Solution Options**:

**Option A: Integrate Activation Code System into Your Backend** (Recommended)
- Add activation code management to your IPTV backend (`/admin/activation-codes` routes already exist!)
- Create a new endpoint that mimics the current flow: `/api/activate`
- Benefits: Single backend, better control, no external dependencies

**Option B: Direct Xtream Authentication**
- Remove the activation code system entirely
- Distribute Xtream credentials directly to users
- Simpler but less secure for your business model

**Option C: Keep Hybrid Approach**
- Continue using `machinevaisselle.tn` for activation
- Minimal changes to the app
- Dependency on external service

### **📱 File-by-File Changes Required**

#### **1. MainActivity.java (lines 51-52, 89)**
**Current**:
```java
public static String mainlink="https://settings.tn:8000";
String codeurl="https://www.machinevaisselle.tn/api/getcodeservice/getcode?code='";
```

**Change to**:
```java
public static String mainlink="YOUR_BACKEND_URL";  // e.g., "https://your-server.com"
String codeurl="YOUR_BACKEND_URL/api/activate?code='";  // If implementing Option A
```

#### **2. ActiveCodeActivity.java (lines 63-66, 255)**
Same changes as MainActivity.java for activation endpoints.

#### **3. MenuActivity.java (lines 57-59, 342, 457)**
Same changes as above.

#### **4. IptvActivity.java (MAJOR CHANGES NEEDED)**

**Current Issues**:
- Lines 810-883: Uses custom API for categories with custom Bearer auth
- Lines 890-1010: Uses custom API for TV genres
- Lines 1456-1504: Uses standard Xtream API ✅ (NO CHANGE NEEDED)
- Lines 1672-1789: Uses standard Xtream API ✅ (NO CHANGE NEEDED)

**Required Changes**:
1. **Remove custom authentication** (lines 810-823, 890-900)
2. **Replace category API** with Xtream standard:
   ```java
   // OLD:
   client.get(Uri.encode("https://machinevaisselle.tn/api/stream_categories?$filter=...

   // NEW:
   client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_live_categories", ...
   ```

#### **5. FilmZebraActivity.java**

**Current Issues**:
- Lines 113-180: Custom Bearer auth + custom VOD search API
- Lines 232-261: Uses standard Xtream API ✅ (NO CHANGE NEEDED)
- Lines 343-387: Uses standard Xtream API ✅ (NO CHANGE NEEDED)

**Required Changes**:
1. Remove custom auth wrapper
2. Replace search API with Xtream standard (if search is needed, implement server-side)

#### **6. TvshowZebraActivity.java**

**Current Issues**:
- Lines 123-180: Custom Bearer auth + custom series search API
- Lines 219-246: Uses standard Xtream API ✅ (NO CHANGE NEEDED)
- Lines 327-395: Custom API for series filtering

**Required Changes**:
1. Remove custom auth
2. Replace with: `MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_series&category_id="+category_id`

---

## **Detailed Migration Plan**

### **Phase 1: Backend Preparation** ⚙️

1. **Decision Point**: Choose authentication approach (A, B, or C above)
   - **Question for you**: Do you want to keep the activation code system? If yes, I'll need to build the activation API into your backend.

2. **If Option A (Recommended)**:
   - Implement `/api/activate` endpoint
   - Migrate activation codes from `machinevaisselle.tn` database
   - Add device lock support
   - Test activation flow

3. **Configure Your Backend**:
   - Ensure all Xtream API endpoints are working
   - Set up HTTPS/SSL certificate
   - Configure domain/port

### **Phase 2: Android App Modifications** 📱

1. **Global Configuration** (`MainActivity.java`):
   - Update `mainlink` to your backend URL
   - Update activation endpoint URLs (if keeping activation system)

2. **Authentication Refactoring**:
   - Remove all Bearer token authentication code
   - Simplify to direct Xtream API calls
   - Remove hardcoded `zebra`/`ZebR@++2020` credentials

3. **Live TV Module** (`IptvActivity.java`):
   - Replace `getCountries()` method (lines 807-884)
   - Replace `getTvgenres()` method (lines 887-1010)
   - Keep `getChannels()`, `getEpg()`, `getProgrammes()` - already compatible! ✅

4. **VOD Module** (`FilmZebraActivity.java`):
   - Remove Bearer auth wrapper
   - Keep category and stream loading - already compatible! ✅
   - Implement search if needed (server-side feature)

5. **Series Module** (`TvshowZebraActivity.java`):
   - Remove Bearer auth wrapper
   - Replace custom series API with Xtream `get_series` action
   - Update series filtering logic

6. **Stream Playback** (Already Compatible! ✅):
   ```java
   // These URLs work perfectly with your backend:
   MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts"
   MainActivity.mainlink+"/movie/"+user+"/"+pass+"/"+vodId+".mp4"
   MainActivity.mainlink+"/series/"+user+"/"+pass+"/"+episodeId+".mp4"
   ```

### **Phase 3: Testing & Deployment** 🧪

1. **Create Test Accounts**:
   - Create test IPTV lines in your backend
   - Test activation flow (if applicable)
   - Verify all permissions and bouquets

2. **Test Each Module**:
   - Live TV: Categories, channels, EPG, playback
   - VOD: Categories, movies, playback
   - Series: Categories, shows, seasons, episodes, playback

3. **Device Testing**:
   - Test on multiple Android TV devices
   - Verify video codecs and formats work
   - Test network resilience

4. **Gradual Rollout**:
   - Beta test with small user group
   - Monitor logs and errors
   - Full deployment

---

## **Key Questions Before Implementation**

1. **Do you want to keep the activation code system?**
   - If YES: I'll implement the activation API in your backend
   - If NO: We'll simplify to direct username/password distribution

2. **What is your backend URL?**
   - Domain name
   - Port (if not standard 443/80)
   - Protocol (http/https)

3. **Do you need the custom category structure?**
   - The current app uses "Countries" → "Genres" → "Channels"
   - Your backend uses standard Xtream categories
   - Do you want to preserve the country-based navigation?

4. **Search functionality priority?**
   - Current app has VOD/Series search via custom API
   - Options: Implement in backend, remove feature, or simplify

5. **Timeline & Testing**:
   - Do you have test devices available?
   - Do you want me to proceed with implementation?

---

## **Estimated Effort**

- **With Activation System (Option A)**: 
  - Backend work: 4-6 hours
  - Android changes: 6-8 hours
  - Testing: 2-3 hours
  - **Total: ~15 hours**

- **Direct Authentication (Option B)**:
  - Backend work: 0-1 hours
  - Android changes: 4-5 hours
  - Testing: 2 hours
  - **Total: ~7 hours**

---

**Ready to proceed?** Please answer the key questions above, and I'll create the specific code changes tailored to your choice!

```
Tool: todowrite
```

---

## Assistant

---

