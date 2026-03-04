package zb.zebra;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.AsyncTask;
import android.provider.Settings;
import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.ImageView;
import android.widget.Toast;

import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import cz.msebera.android.httpclient.Header;
import cz.msebera.android.httpclient.HttpResponse;
import cz.msebera.android.httpclient.client.methods.HttpGet;
import cz.msebera.android.httpclient.impl.client.CloseableHttpClient;
import cz.msebera.android.httpclient.impl.client.HttpClientBuilder;
import cz.msebera.android.httpclient.util.EntityUtils;
import zb.zebra.Util.CustomDialogClass;
import zb.zebra.Util.CustomMessageClass;
import zb.zebra.Util.STBChangeDialogClass;
import zb.zebra.iptvapplication.R;

public class MainActivity extends AppCompatActivity {
    SharedPreferences sharedPref;
    private static final int REQUEST_EXTERNAL_STORAGE = 1;
    private static String[] PERMISSIONS_STORAGE = {
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
    };
    public static String mainlink="https://s01.zz00.org";
    String activateUrl="https://s01.zz00.org/activate";
    String login ;
    String password;
    String activecode;
    ImageView disconnected;
    AsyncHttpClient client = new AsyncHttpClient();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sharedPref = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);


        setContentView(R.layout.activity_main);

        login = sharedPref.getString("user","");
        password = sharedPref.getString("pass","");
        activecode = sharedPref.getString("activecode","");
        Log.e("ACTIVECODE",activecode);
        disconnected=(ImageView)findViewById(R.id.disconnectedcart);
        checkConnection();

        // If we already have credentials, skip activation and go directly to menu
        if (login != null && !login.isEmpty() && password != null && !password.isEmpty()) {
            Log.e("MainActivity", "Credentials already exist, going to MenuActivity");
            Intent menuIntent = new Intent(MainActivity.this, MenuActivity.class);
            startActivity(menuIntent);
            finish();
            return;
        }

        // If we have an activation code but no credentials, try to activate
        if (activecode != null && !activecode.isEmpty()) {
            // Get device ID
            String androidDeviceId = Settings.Secure.getString(getApplicationContext().getContentResolver(),
                    Settings.Secure.ANDROID_ID);

            // Create JSON body for activation
            JSONObject activationBody = new JSONObject();
            try {
                activationBody.put("code", activecode);
                activationBody.put("deviceId", androidDeviceId);
            } catch (JSONException e) {
                e.printStackTrace();
            }

            // Call new activation API
            try {
                client.post(getApplicationContext(), activateUrl,
                        new cz.msebera.android.httpclient.entity.StringEntity(activationBody.toString(), "UTF-8"),
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
                                        savePreferences(username, password, activecode);

                                        // Navigate to menu
                                        Intent menuIntent = new Intent(MainActivity.this, MenuActivity.class);
                                        startActivity(menuIntent);
                                        finish();
                                    } else {
                                        // Show error
                                        String errorMsg = res.optString("error", "Activation failed");
                                        CustomMessageClass cdd = new CustomMessageClass(MainActivity.this);
                                        cdd.setMsg(errorMsg);
                                        cdd.show();
                                    }
                                } catch (JSONException e) {
                                    e.printStackTrace();
                                    Intent activecodeIntent = new Intent(MainActivity.this, ActiveCodeActivity.class);
                                    activecodeIntent.setFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
                                    startActivity(activecodeIntent);
                                    finish();
                                }
                            }

                            @Override
                            public void onFailure(int statusCode, Header[] headers, Throwable t, JSONObject res) {
                                Log.e("Activation", "Failed: " + (res != null ? res.toString() : t.getMessage()));

                                // Go to activation screen
                                Intent activecodeIntent = new Intent(MainActivity.this, ActiveCodeActivity.class);
                                activecodeIntent.setFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
                                startActivity(activecodeIntent);
                                finish();
                            }
                        }
                );
            } catch (Exception e) {
                e.printStackTrace();
                Intent activecodeIntent = new Intent(MainActivity.this, ActiveCodeActivity.class);
                activecodeIntent.setFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
                startActivity(activecodeIntent);
                finish();
            }
        } else {
            // No activation code, go to activation screen
            Intent activecodeIntent = new Intent(MainActivity.this, ActiveCodeActivity.class);
            activecodeIntent.setFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
            startActivity(activecodeIntent);
            finish();
        }


    }
    private void savePreferences(String user,String pass) {
        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = settings.edit();

        editor.putString(ActiveCodeActivity.PREF_UNAME, user);
        editor.putString(ActiveCodeActivity.PREF_PASSWORD, pass);
        editor.commit();
    }
    private void savePreferences(String user,String pass,String activecode) {
        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = settings.edit();
        editor.putString(ActiveCodeActivity.ACTIVECODE, activecode);
        editor.putString(ActiveCodeActivity.PREF_UNAME, user);
        editor.putString(ActiveCodeActivity.PREF_PASSWORD, pass);
        editor.commit();
    }


    protected boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo netInfo = cm.getActiveNetworkInfo();
        if (netInfo != null && netInfo.isConnectedOrConnecting()) {
            return true;
        } else {
            return false;
        }
    }
    public void checkConnection(){
        if(isOnline()){

        }else{

            disconnected.setVisibility(View.VISIBLE);
            new java.util.Timer().schedule(
                    new java.util.TimerTask() {
                        @Override
                        public void run() {
                            MainActivity.this.finishAffinity();
                        }
                    },
                    3000
            );

            //Toast.makeText(MainActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }


}
