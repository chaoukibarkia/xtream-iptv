# Deployment Summary - STB ID Update Feature

**Date:** December 22, 2025  
**Time:** 08:03 UTC  
**Server:** LXC Container 102 (10.10.0.12:3001)  
**Service:** iptv-backend.service

---

## ✅ Deployment Status: SUCCESSFUL

### 1. Build Process
- **Status:** ✅ Completed
- **Command:** `npm run build`
- **Result:** TypeScript compiled successfully to JavaScript
- **Output:** `/storage-pool/xtream/iptv-server/dist/`

### 2. Deployment to LXC 102
- **Status:** ✅ Completed
- **Steps:**
  1. Stopped container 102
  2. Mounted rootfs at `/var/lib/lxc/102/rootfs`
  3. Removed old dist folder
  4. Copied new dist files
  5. Set ownership to nodeapp user (UID 101000)
  6. Unmounted and started container

### 3. Service Restart
- **Status:** ✅ Completed
- **Service:** `iptv-backend.service`
- **Command:** `systemctl restart iptv-backend.service`
- **Result:** Service running successfully
- **PID:** 322
- **Memory:** 221.1M
- **Uptime:** Active since Dec 22 08:03:10 UTC

### 4. Verification Tests
- **Status:** ✅ All tests passed

**Health Check:**
```bash
$ curl http://10.10.0.12:3001/health
{"status":"ok","timestamp":"2025-12-22T08:03:48.825Z"}
```

**New Endpoint Test:**
```bash
$ curl -X POST http://10.10.0.12:3001/activate/update-device \
  -H "Content-Type: application/json" \
  -d '{"code":"12345678901234","oldDeviceId":"test","newDeviceId":"test2"}'

Response: {"error":"Code d'activation invalide"}
```
✅ Endpoint is responding correctly (returns French error message as expected for invalid code)

**Log Verification:**
```
Dec 22 08:03:43 iptv-backend node[322]: {"level":40,"time":1766390623319,"pid":322,"hostname":"iptv-backend","code":"1234**********","ip":"10.10.0.1","msg":"Device update: Invalid code"}
```
✅ New logging code is active

---

## 🚀 New Features Deployed

### 1. Device ID Update Endpoint
**Endpoint:** `POST /activate/update-device`

**Request:**
```json
{
  "code": "78491662826500",
  "oldDeviceId": "47f703f7bbcb0d4a",
  "newDeviceId": "nouveau_device_id"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "STB ID mis à jour avec succès"
}
```

**Error Responses:**
- `404`: Code d'activation invalide
- `400`: Code non activé / Aucune ligne associée
- `403`: Ancien STB ID incorrect

### 2. Enhanced Activation Error Response
When activation fails due to device mismatch, the API now returns:
```json
{
  "error": "Code is locked to a different device",
  "errorCode": "DEVICE_MISMATCH",
  "currentDeviceId": "47f703f7bbcb0d4a"
}
```

### 3. Admin Schema Enhancement
- Added `lockedDeviceId` field to IPTV line schema
- Admins can now update device locks via `PUT /admin/lines/:id`

---

## 🔧 Technical Details

### Modified Files
1. `iptv-server/src/api/routes/admin.ts` - Added lockedDeviceId to schema
2. `iptv-server/src/api/routes/activation.ts` - New endpoint + cache import
3. `iptv-server/src/services/activation/ActivationCodeService.ts` - Enhanced errors

### Database Changes
- No schema migrations required (lockedDeviceId already exists in Prisma schema)

### Cache Invalidation
- Device ID updates automatically invalidate Redis auth cache
- Pattern: `line_auth:${username}:*`

### Security Features
- Validates old device ID before allowing update
- Logs all device update attempts with IP addresses
- Transaction-based update (atomic)

---

## 📊 Service Status

```
● iptv-backend.service - IPTV Backend API Server
   Loaded: loaded (/etc/systemd/system/iptv-backend.service; enabled)
   Active: active (running) since Mon 2025-12-22 08:03:10 UTC
 Main PID: 322 (node)
    Tasks: 18
   Memory: 221.1M
```

**Container Info:**
- Container ID: 102
- IP Address: 10.10.0.12
- Port: 3001
- Service Name: iptv-backend.service

---

## 🧪 Testing URLs

### Internal (Container Network):
```bash
# Health check
curl http://10.10.0.12:3001/health

# Update device
curl -X POST http://10.10.0.12:3001/activate/update-device \
  -H "Content-Type: application/json" \
  -d '{"code":"CODE","oldDeviceId":"OLD","newDeviceId":"NEW"}'

# Activate (test device mismatch error)
curl -X POST http://10.10.0.12:3001/activate \
  -H "Content-Type: application/json" \
  -d '{"code":"CODE","deviceId":"DEVICE_ID"}'
```

### External (Production):
```bash
# Update device
curl -X POST https://s01.zz00.org/activate/update-device \
  -H "Content-Type: application/json" \
  -d '{"code":"CODE","oldDeviceId":"OLD","newDeviceId":"NEW"}'
```

---

## 📝 Next Steps

### For Backend:
✅ COMPLETED - No further action needed

### For Android App:
1. Implement changes according to `ANDROID_DEVICE_UPDATE_GUIDE.md`
2. Build APK with new dialog functionality
3. Test on real devices with device mismatch scenario
4. Deploy to users

### Testing Checklist:
- [x] Backend builds successfully
- [x] Service restarts without errors
- [x] New endpoint responds correctly
- [x] Logs show new code is active
- [ ] End-to-end test with real activation code
- [ ] Android app integration test

---

## 🔍 Monitoring

### Check Service Status:
```bash
pct exec 102 -- systemctl status iptv-backend.service
```

### View Logs:
```bash
# Recent logs
pct exec 102 -- journalctl -u iptv-backend.service -n 50

# Follow logs
pct exec 102 -- journalctl -u iptv-backend.service -f

# Filter device-related logs
pct exec 102 -- journalctl -u iptv-backend.service | grep -i device
```

### Check for Errors:
```bash
pct exec 102 -- journalctl -u iptv-backend.service -p err -n 50
```

---

## 📧 Support

**Logs Location (in container):**
- Systemd logs: `journalctl -u iptv-backend.service`
- Application logs: Via Pino logger (JSON format)

**Log Patterns to Watch:**
- `"Device update: Invalid code"` - Invalid activation code
- `"Device ID updated successfully"` - Successful update
- `"Device update: Old device ID mismatch"` - Security validation failed

---

**Deployment completed successfully at 08:03 UTC on December 22, 2025**
