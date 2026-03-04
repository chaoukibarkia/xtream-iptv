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
import android.support.v7.app.AppCompatActivity;
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
import io.michaelrocks.paranoid.Obfuscate;
import zb.zebra.Util.CustomDialogClass;
import zb.zebra.Util.CustomMessageClass;
import zb.zebra.Util.STBChangeDialogClass;
import zb.zebra.iptvapplication.R;

@Obfuscate
public class MainActivity extends AppCompatActivity {
    SharedPreferences sharedPref;
    private static final int REQUEST_EXTERNAL_STORAGE = 1;
    private static String[] PERMISSIONS_STORAGE = {
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
    };
    public static String mainlink="https://settings.tn:8000";
    String codeurl="https://www.machinevaisselle.tn/api/getcodeservice/getcode?code='";
    String macattr="'&stbid='";
    String salt="'";
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
        savePreferences(login,password,"");
        activecode = sharedPref.getString("activecode","");
        Log.e("ACTIVECODE",activecode);
        disconnected=(ImageView)findViewById(R.id.disconnectedcart);
        checkConnection();






               /* String androidDeviceId = Settings.Secure.getString(getApplicationContext().getContentResolver(),
                        Settings.Secure.ANDROID_ID);

                new HttpAsyncTask().execute(codeurl+activecode+macattr+ androidDeviceId+salt);*/


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
                                    {if(res.getString("result").equalsIgnoreCase("Code expired") || res.getString("result").equalsIgnoreCase("Test expired") || res.getString("result").equalsIgnoreCase("User disabled") ) {

                                        CustomMessageClass cdd=new CustomMessageClass(MainActivity.this);
                                        cdd.setMsg(res.getString("user_response"));
                                        cdd.show();

                                    }else if (res.getString("result").equalsIgnoreCase("OK")) {
                                        savePreferences(res.getString("username"), res.getString("password"),res.getString("code"));
                                        MainActivity.mainlink="https://"+res.getString("domain")+":"+res.getString("http_port");
                                        Intent menuIntent = new Intent(MainActivity.this, MenuActivity.class);
                                        startActivity(menuIntent);
                                    }
                                    else if (res.getString("result").equalsIgnoreCase("Stbid changed")) {
                                        MainActivity.mainlink="https://"+res.getString("domain")+":"+res.getString("http_port");
                                        STBChangeDialogClass cdd=new STBChangeDialogClass(MainActivity.this);
                                        cdd.setCodeid(res.getInt("id_code"));
                                        cdd.setMsg(res.getString("user_response"));
                                        cdd.show();

                                    }
                                    }else {
                                        Intent activecodeIntent = new Intent(MainActivity.this, ActiveCodeActivity.class);
                                        activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                                        startActivity(activecodeIntent);
                                    }

                                } catch (JSONException e) {
                                    e.printStackTrace();
                                    new java.util.Timer().schedule(
                                            new java.util.TimerTask() {
                                                @Override
                                                public void run() {
                                                    runOnUiThread(new Runnable() {

                                                        @Override
                                                        public void run() {


                                                        }
                                                    });

                                                }
                                            },
                                            3000
                                    );
                                }
                            }
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, Throwable t,JSONObject res) {
                            // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                            Log.e("error",res.toString());
                            Intent activecodeIntent = new Intent(MainActivity.this, ActiveCodeActivity.class);
                            activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
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
