package zb.zebra;

import android.app.Service;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;

import org.json.JSONException;
import org.json.JSONObject;

import cz.msebera.android.httpclient.Header;
import zb.zebra.Util.CustomMessageClass;
import zb.zebra.Util.STBChangeDialogClass;

public class MyService extends Service {
    Handler handler;
    Runnable runnable;
    AsyncHttpClient client = new AsyncHttpClient();
    public static String mainlink="https://settings.tn:8000";
    String login ;
    String password;
    String activecode;

    @Override
    public void onDestroy() {
        handler.removeCallbacks(runnable);
        super.onDestroy();
    }


    public MyService() {
        handler = new Handler();
        runnable = new Runnable() {
            @Override
            public void run() {
                // Check if credentials are still valid using player_api
                android.content.SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME, MODE_PRIVATE);
                String user = settings.getString(ActiveCodeActivity.PREF_UNAME, "");
                String pass = settings.getString(ActiveCodeActivity.PREF_PASSWORD, "");
                
                if (!user.isEmpty() && !pass.isEmpty()) {
                    client.get(MainActivity.mainlink + "/player_api.php?username=" + user + "&password=" + pass, new JsonHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                            try {
                                // Check if account is expired or disabled
                                if (res.has("user_info")) {
                                    JSONObject userInfo = res.getJSONObject("user_info");
                                    String status = userInfo.has("status") ? userInfo.getString("status") : "";
                                    
                                    if (status.equalsIgnoreCase("expired") || status.equalsIgnoreCase("disabled") || status.equalsIgnoreCase("banned")) {
                                        // Redirect to login
                                        Intent activecodeIntent = new Intent(MyService.this, MainActivity.class);
                                        activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                                        activecodeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        stopSelf();
                                        startActivity(activecodeIntent);
                                    }
                                }
                            } catch (JSONException e) {
                                Log.e("MyService", "Failed to parse user info: " + e.getMessage());
                            }
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                            // If authentication fails (401), redirect to activation
                            if (statusCode == 401) {
                                Intent activecodeIntent = new Intent(MyService.this, ActiveCodeActivity.class);
                                activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                                activecodeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                stopSelf();
                                startActivity(activecodeIntent);
                            }
                            Log.e("MyService", "Failed to check credentials: " + t.getMessage());
                        }
                    });
                }
                
                handler.postDelayed(runnable, 43200000); //12 hours
            }
        };

        handler.postDelayed(runnable, 0);//43200000);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

}