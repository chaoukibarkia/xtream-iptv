# Guide de modification Android - Mise à jour STB ID

Ce document explique comment modifier l'application Android Zebra pour gérer le changement de STB ID (Device ID) lorsqu'un utilisateur tente d'activer son code sur un nouvel appareil.

## Contexte

Actuellement, lorsqu'un utilisateur tente d'activer un code déjà utilisé sur un appareil différent, il reçoit l'erreur :
```
{"error":"Code is locked to a different device"}
```

Nous voulons afficher un dialogue en français demandant :
> "Votre STB ID a changé. Voulez-vous appliquer le nouveau STB ID sur votre box ?"

Si l'utilisateur clique sur "Oui", l'application envoie une requête API pour mettre à jour le Device ID.

## Modifications Backend (Déjà effectuées)

### 1. Nouveau endpoint API : `POST /activate/update-device`

**URL complète :** `https://s01.zz00.org/activate/update-device`

**Body JSON :**
```json
{
  "code": "78491662826500",
  "oldDeviceId": "47f703f7bbcb0d4a",
  "newDeviceId": "nouveau_device_id_ici"
}
```

**Réponse succès (200) :**
```json
{
  "success": true,
  "message": "STB ID mis à jour avec succès"
}
```

**Réponses d'erreur :**
- `404` : Code d'activation invalide
- `400` : Code non activé ou aucune ligne associée
- `403` : Ancien STB ID incorrect

### 2. Modification de l'erreur d'activation

Maintenant, quand l'activation échoue à cause d'un device différent, l'API retourne :
```json
{
  "error": "Code is locked to a different device",
  "errorCode": "DEVICE_MISMATCH",
  "currentDeviceId": "47f703f7bbcb0d4a"
}
```

## Modifications Android à effectuer

### Fichier 1 : `ActiveCodeActivity.java`

**Emplacement :** `/storage-pool/xtream/zebra-apk/app/src/main/java/zb/zebra/ActiveCodeActivity.java`

#### Modification dans la méthode `getActivation()` - Ligne 326

**Code actuel (lignes 326-344) :**
```java
@Override
public void onFailure(int statusCode, Header[] headers, Throwable t, JSONObject res) {
    Log.e("Activation", "Failed: " + (res != null ? res.toString() : t.getMessage()));
    status.setText("Code d'activation invalide");
    new java.util.Timer().schedule(
            new java.util.TimerTask() {
                @Override
                public void run() {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            status.setText("");
                        }
                    });
                }
            },
            3000
    );
}
```

**Nouveau code à implémenter :**
```java
@Override
public void onFailure(int statusCode, Header[] headers, Throwable t, JSONObject res) {
    Log.e("Activation", "Failed: statusCode=" + statusCode + ", error=" + (res != null ? res.toString() : t.getMessage()));
    
    // Check if it's a device mismatch error
    if (res != null && statusCode == 400) {
        try {
            String errorCode = res.optString("errorCode", "");
            String currentDeviceId = res.optString("currentDeviceId", "");
            
            if ("DEVICE_MISMATCH".equals(errorCode) && !currentDeviceId.isEmpty()) {
                // Show device change confirmation dialog
                DeviceChangeDialogClass deviceDialog = new DeviceChangeDialogClass(ActiveCodeActivity.this);
                deviceDialog.setMsg("Votre STB ID a changé. Voulez-vous appliquer le nouveau STB ID sur votre box ?");
                deviceDialog.setActivationCode(pass);
                deviceDialog.setOldDeviceId(currentDeviceId);
                String newDeviceId = Settings.Secure.getString(getApplicationContext().getContentResolver(),
                        Settings.Secure.ANDROID_ID);
                deviceDialog.setNewDeviceId(newDeviceId);
                deviceDialog.show();
                return;
            }
        } catch (Exception e) {
            Log.e("Activation", "Error parsing device mismatch: " + e.getMessage());
        }
    }
    
    // Default error handling
    status.setText("Code d'activation invalide");
    new java.util.Timer().schedule(
            new java.util.TimerTask() {
                @Override
                public void run() {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            status.setText("");
                        }
                    });
                }
            },
            3000
    );
}
```

### Fichier 2 : Créer `DeviceChangeDialogClass.java`

**Emplacement :** `/storage-pool/xtream/zebra-apk/app/src/main/java/zb/zebra/Util/DeviceChangeDialogClass.java`

**Contenu complet du nouveau fichier :**
```java
package zb.zebra.Util;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;

import org.json.JSONException;
import org.json.JSONObject;

import cz.msebera.android.httpclient.Header;
import cz.msebera.android.httpclient.entity.StringEntity;
import zb.zebra.ActiveCodeActivity;
import zb.zebra.MenuActivity;
import zb.zebra.iptvapplication.R;

public class DeviceChangeDialogClass extends Dialog implements View.OnClickListener {
    
    private static final String UPDATE_DEVICE_URL = "https://s01.zz00.org/activate/update-device";
    
    private AsyncHttpClient client = new AsyncHttpClient();
    private Activity activity;
    private String msg;
    private String activationCode;
    private String oldDeviceId;
    private String newDeviceId;
    
    private TextView msgtxtv;
    private Button btnYes;
    private Button btnNo;

    public DeviceChangeDialogClass(Activity activity) {
        super(activity);
        this.activity = activity;
    }

    public void setMsg(String msg) {
        this.msg = msg;
    }

    public void setActivationCode(String activationCode) {
        this.activationCode = activationCode;
    }

    public void setOldDeviceId(String oldDeviceId) {
        this.oldDeviceId = oldDeviceId;
    }

    public void setNewDeviceId(String newDeviceId) {
        this.newDeviceId = newDeviceId;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.stbchangedialog);
        
        msgtxtv = (TextView) findViewById(R.id.msgtxtv);
        msgtxtv.setText(msg);
        
        btnYes = (Button) findViewById(R.id.btn_yes);
        btnNo = (Button) findViewById(R.id.btn_no);
        
        btnYes.setOnClickListener(this);
        btnNo.setOnClickListener(this);
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        
        if (id == R.id.btn_yes) {
            // User confirmed - update device ID
            updateDeviceId();
        } else if (id == R.id.btn_no) {
            // User declined - go back to activation screen
            dismiss();
            Intent activecodeIntent = new Intent(activity, ActiveCodeActivity.class);
            activity.startActivity(activecodeIntent);
        }
    }

    private void updateDeviceId() {
        Log.e("DeviceChange", "Updating device ID: code=" + activationCode + ", oldId=" + oldDeviceId + ", newId=" + newDeviceId);
        
        // Create JSON body
        JSONObject requestBody = new JSONObject();
        try {
            requestBody.put("code", activationCode);
            requestBody.put("oldDeviceId", oldDeviceId);
            requestBody.put("newDeviceId", newDeviceId);
        } catch (JSONException e) {
            Log.e("DeviceChange", "Error creating request body: " + e.getMessage());
            Toast.makeText(activity, "Erreur lors de la création de la requête", Toast.LENGTH_SHORT).show();
            dismiss();
            return;
        }

        // Make API call
        try {
            client.post(activity.getApplicationContext(), UPDATE_DEVICE_URL,
                    new StringEntity(requestBody.toString(), "UTF-8"),
                    "application/json",
                    new JsonHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, JSONObject response) {
                            Log.e("DeviceChange", "Success: " + response.toString());
                            try {
                                if (response.getBoolean("success")) {
                                    Toast.makeText(activity, "STB ID mis à jour avec succès", Toast.LENGTH_SHORT).show();
                                    
                                    // Now re-activate with new device ID
                                    reActivateWithNewDevice();
                                } else {
                                    String errorMsg = response.optString("error", "Échec de la mise à jour");
                                    Toast.makeText(activity, errorMsg, Toast.LENGTH_SHORT).show();
                                    dismiss();
                                }
                            } catch (JSONException e) {
                                Log.e("DeviceChange", "Error parsing response: " + e.getMessage());
                                Toast.makeText(activity, "Erreur lors du traitement de la réponse", Toast.LENGTH_SHORT).show();
                                dismiss();
                            }
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, Throwable t, JSONObject errorResponse) {
                            Log.e("DeviceChange", "Failed: statusCode=" + statusCode + ", error=" + (errorResponse != null ? errorResponse.toString() : t.getMessage()));
                            
                            String errorMsg = "Erreur de mise à jour";
                            if (errorResponse != null) {
                                errorMsg = errorResponse.optString("error", errorMsg);
                            }
                            
                            Toast.makeText(activity, errorMsg, Toast.LENGTH_LONG).show();
                            dismiss();
                        }
                    }
            );
        } catch (Exception e) {
            Log.e("DeviceChange", "Exception: " + e.getMessage());
            Toast.makeText(activity, "Erreur de connexion", Toast.LENGTH_SHORT).show();
            dismiss();
        }
    }

    private void reActivateWithNewDevice() {
        // Create activation request with new device ID
        JSONObject activationBody = new JSONObject();
        try {
            activationBody.put("code", activationCode);
            activationBody.put("deviceId", newDeviceId);
        } catch (JSONException e) {
            Log.e("DeviceChange", "Error creating activation body: " + e.getMessage());
            dismiss();
            return;
        }

        // Call activation API
        try {
            client.post(activity.getApplicationContext(), "https://s01.zz00.org/activate",
                    new StringEntity(activationBody.toString(), "UTF-8"),
                    "application/json",
                    new JsonHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                            try {
                                if (res.getBoolean("success")) {
                                    JSONObject credentials = res.getJSONObject("credentials");
                                    String username = credentials.getString("username");
                                    String password = credentials.getString("password");

                                    // Save credentials
                                    savePreferences(username, password, activationCode);

                                    dismiss();
                                    
                                    // Navigate to menu
                                    Intent menuIntent = new Intent(activity, MenuActivity.class);
                                    activity.startActivity(menuIntent);
                                } else {
                                    String errorMsg = res.optString("error", "Activation failed");
                                    Toast.makeText(activity, errorMsg, Toast.LENGTH_SHORT).show();
                                    dismiss();
                                }
                            } catch (JSONException e) {
                                Log.e("DeviceChange", "Error parsing activation response: " + e.getMessage());
                                Toast.makeText(activity, "Erreur de connexion", Toast.LENGTH_SHORT).show();
                                dismiss();
                            }
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, Throwable t, JSONObject res) {
                            Log.e("DeviceChange", "Activation failed after device update: " + (res != null ? res.toString() : t.getMessage()));
                            Toast.makeText(activity, "Erreur d'activation", Toast.LENGTH_SHORT).show();
                            dismiss();
                        }
                    }
            );
        } catch (Exception e) {
            Log.e("DeviceChange", "Exception during re-activation: " + e.getMessage());
            Toast.makeText(activity, "Erreur de connexion", Toast.LENGTH_SHORT).show();
            dismiss();
        }
    }

    private void savePreferences(String username, String password, String activecode) {
        SharedPreferences settings = activity.getSharedPreferences(ActiveCodeActivity.PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = settings.edit();
        editor.putString(ActiveCodeActivity.ACTIVECODE, activecode);
        editor.putString(ActiveCodeActivity.PREF_UNAME, username);
        editor.putString(ActiveCodeActivity.PREF_PASSWORD, password);
        editor.commit();
    }

    @Override
    public void onBackPressed() {
        dismiss();
        Intent activecodeIntent = new Intent(activity, ActiveCodeActivity.class);
        activity.startActivity(activecodeIntent);
        super.onBackPressed();
    }
}
```

### Fichier 3 : Layout déjà existant

**Emplacement :** `/storage-pool/xtream/zebra-apk/app/src/main/res/layout/stbchangedialog.xml`

Le layout existant est déjà approprié avec :
- Un TextView pour le message (`msgtxtv`)
- Un bouton "Oui" (`btn_yes`)
- Un bouton "Non" (`btn_no`)

**Aucune modification nécessaire pour le layout.**

## Flux de fonctionnement

1. **Utilisateur entre le code d'activation sur un nouvel appareil**
   - L'app obtient le nouveau Device ID via `Settings.Secure.ANDROID_ID`
   - Envoie une requête POST à `/activate`

2. **Backend détecte un Device ID différent**
   - Retourne erreur 400 avec :
     - `errorCode: "DEVICE_MISMATCH"`
     - `currentDeviceId: "ancien_id"`

3. **App Android affiche le dialogue**
   - Message : "Votre STB ID a changé. Voulez-vous appliquer le nouveau STB ID sur votre box ?"
   - Boutons : "Oui" / "Non"

4. **Si utilisateur clique "Oui"**
   - Envoie POST à `/activate/update-device` avec :
     - `code`: code d'activation
     - `oldDeviceId`: l'ancien Device ID (reçu de l'erreur)
     - `newDeviceId`: le nouveau Device ID
   - Si succès : ré-active automatiquement avec le nouveau Device ID
   - Si succès de l'activation : sauvegarde les credentials et va au menu

5. **Si utilisateur clique "Non"**
   - Retourne à l'écran d'activation

## Testing

Pour tester cette fonctionnalité :

1. Activer un code sur un appareil (Device ID = A)
2. Essayer d'activer le même code sur un autre appareil (Device ID = B)
3. Vérifier que le dialogue apparaît en français
4. Cliquer sur "Oui" et vérifier que le Device ID est mis à jour
5. Vérifier que l'utilisateur est connecté avec succès

## Logs utiles pour debug

Dans Android Studio / Logcat, filtrer par :
- `ACTIVECODE` : Logs d'activation
- `DeviceChange` : Logs de changement de device
- `Activation` : Logs généraux d'activation

## Notes importantes

1. **Sécurité** : L'ancien Device ID doit correspondre à celui stocké en base
2. **Invalidation du cache** : Le backend invalide automatiquement le cache Redis après mise à jour
3. **Réactivation automatique** : Après mise à jour du Device ID, l'app réactive automatiquement le code
4. **Message en français** : Tous les messages sont en français comme demandé

## URL de l'API

- **Activation** : `https://s01.zz00.org/activate`
- **Mise à jour Device** : `https://s01.zz00.org/activate/update-device`

Ces URLs sont configurées dans :
- Backend : variables d'environnement
- Android : hardcodées dans `ActiveCodeActivity.java` (ligne 61) et `DeviceChangeDialogClass.java`
