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
    String codeurl="https://www.machinevaisselle.tn/api/getcodeservice/getcode?code='";
    String macattr="'&stbid='";
    String salt="'";
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
                client.get(Uri.encode("https://www.machinevaisselle.tn/auth/loginservice/login?username='zebra'&password='ZebR@++2020'"), new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                        String androidDeviceId = Settings.Secure.getString(getApplicationContext().getContentResolver(),
                                Settings.Secure.ANDROID_ID);

                        String bearer = "";
                        try {
                            Log.e("value", res.getString("value"));

                            bearer = res.getString("value");
                        } catch (JSONException e) {
                            e.printStackTrace();
                        }
                        client.addHeader("Accept", "application/json");
                        client.addHeader("Authorization", "Bearer " + bearer);
                        Log.e("dD",codeurl + macattr + androidDeviceId + salt);
                        client.get(codeurl +  macattr + androidDeviceId + salt, new JsonHttpResponseHandler() {
                            @Override
                            public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


                                if (res != null) {
                                    try {

                                        if (res.getString("result")!=null)
                                        {
                                            if(res.getString("result").equalsIgnoreCase("Code expired") || res.getString("result").equalsIgnoreCase("Test expired") || res.getString("result").equalsIgnoreCase("User disabled") ) {

                                            Intent activecodeIntent = new Intent(MyService.this, MainActivity.class);
                                            activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                                                activecodeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                                stopSelf();
                                                startActivity(activecodeIntent);
                                            }

                                        }

                                    } catch (JSONException e) {
                                        e.printStackTrace();

                                    }
                                }
                            }

                            @Override
                            public void onFailure(int statusCode, Header[] headers, Throwable t,JSONObject res) {
                                // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                                Log.e("error",res.toString());
                                Intent activecodeIntent = new Intent(MyService.this, ActiveCodeActivity.class);
                                activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                                stopSelf();
                                startActivity(activecodeIntent);


                            }
                        });


                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                        // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                        Log.e("error", t.getStackTrace().toString());


                    }
                });
                handler.postDelayed(runnable, 43200000); //100 ms you should do it 4000
            }
        };

        handler.postDelayed(runnable, 0);//43200000);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

}