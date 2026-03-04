# Quick Reference - Device ID Update Feature

## Backend Changes (COMPLETED ✅)

### New API Endpoint
```
POST https://s01.zz00.org/activate/update-device

Body:
{
  "code": "78491662826500",
  "oldDeviceId": "47f703f7bbcb0d4a",
  "newDeviceId": "nouveau_device_id"
}

Success Response (200):
{
  "success": true,
  "message": "STB ID mis à jour avec succès"
}

Error Responses:
- 404: Code invalide
- 400: Code non activé
- 403: Ancien STB ID incorrect
```

### Modified Activation Error Response
```
POST https://s01.zz00.org/activate

Error Response (400) when device mismatch:
{
  "error": "Code is locked to a different device",
  "errorCode": "DEVICE_MISMATCH",
  "currentDeviceId": "47f703f7bbcb0d4a"
}
```

## Android Changes (DOCUMENTED 📋)

See complete guide: `ANDROID_DEVICE_UPDATE_GUIDE.md`

### Quick Summary:
1. Modify `ActiveCodeActivity.java` onFailure() handler
2. Create new file `DeviceChangeDialogClass.java`
3. No layout changes needed (reuse stbchangedialog.xml)

### Key Code Snippet for ActiveCodeActivity.java:
```java
@Override
public void onFailure(int statusCode, Header[] headers, Throwable t, JSONObject res) {
    if (res != null && statusCode == 400) {
        String errorCode = res.optString("errorCode", "");
        if ("DEVICE_MISMATCH".equals(errorCode)) {
            // Show device change dialog
            DeviceChangeDialogClass dialog = new DeviceChangeDialogClass(ActiveCodeActivity.this);
            dialog.setMsg("Votre STB ID a changé. Voulez-vous appliquer le nouveau STB ID sur votre box ?");
            dialog.setActivationCode(pass);
            dialog.setOldDeviceId(res.optString("currentDeviceId", ""));
            dialog.setNewDeviceId(Settings.Secure.getString(
                getApplicationContext().getContentResolver(),
                Settings.Secure.ANDROID_ID));
            dialog.show();
            return;
        }
    }
    // ... default error handling
}
```

## Testing

### Backend Test (curl):
```bash
# 1. First activation
curl -X POST https://s01.zz00.org/activate \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","deviceId":"device_A"}'

# 2. Try with different device (should fail)
curl -X POST https://s01.zz00.org/activate \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","deviceId":"device_B"}'

# 3. Update device
curl -X POST https://s01.zz00.org/activate/update-device \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","oldDeviceId":"device_A","newDeviceId":"device_B"}'

# 4. Activate with new device (should work)
curl -X POST https://s01.zz00.org/activate \
  -H "Content-Type: application/json" \
  -d '{"code":"78491662826500","deviceId":"device_B"}'
```

### Android Test Flow:
1. Activate code on Device A
2. Try to activate same code on Device B
3. See French dialog: "Votre STB ID a changé..."
4. Click "Oui"
5. Device updates and logs in automatically

## Files Modified

### Backend (4 files):
- ✅ `iptv-server/src/api/routes/admin.ts` - Added lockedDeviceId to schema
- ✅ `iptv-server/src/api/routes/activation.ts` - Added update-device endpoint + cache import
- ✅ `iptv-server/src/services/activation/ActivationCodeService.ts` - Enhanced error response
- ✅ TypeScript compilation: ✅ No errors

### Android (2 files to modify):
- 📋 `zebra-apk/app/src/main/java/zb/zebra/ActiveCodeActivity.java`
- 📋 `zebra-apk/app/src/main/java/zb/zebra/Util/DeviceChangeDialogClass.java` (new)

### Documentation (3 files):
- 📄 `ANDROID_DEVICE_UPDATE_GUIDE.md` - Complete Android implementation guide
- 📄 `IMPLEMENTATION_SUMMARY.md` - Full project summary
- 📄 `QUICK_REFERENCE.md` - This file

## User Experience

```
┌─────────────────────────────────────┐
│  User enters code on new device     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Dialog appears in French:          │
│                                     │
│  "Votre STB ID a changé.           │
│   Voulez-vous appliquer le nouveau │
│   STB ID sur votre box ?"          │
│                                     │
│      [Oui]          [Non]          │
└──────┬──────────────────┬──────────┘
       │                  │
       ▼                  ▼
   Updates          Returns to
   device &         activation
   logs in          screen
```

## Deployment Checklist

### Backend:
- ✅ Code changes complete
- ✅ TypeScript compilation OK
- ⏳ Deploy to production server
- ⏳ Test on production with curl

### Android:
- ⏳ Implement changes per guide
- ⏳ Build APK
- ⏳ Test on real device
- ⏳ Distribute to users

## Support

For questions or issues:
- Backend logs: Check Pino logs with tag "Device ID updated successfully"
- Android logs: Filter Logcat by "DeviceChange" or "Activation"
- Security: All device updates are logged with IP addresses for audit
