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
