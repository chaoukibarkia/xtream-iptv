package zb.zebra;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.provider.Settings;
import androidx.appcompat.app.AppCompatActivity;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.GridLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

import cz.msebera.android.httpclient.Header;
import cz.msebera.android.httpclient.HttpResponse;
import cz.msebera.android.httpclient.client.methods.HttpGet;
import cz.msebera.android.httpclient.impl.client.CloseableHttpClient;
import cz.msebera.android.httpclient.impl.client.HttpClientBuilder;
import cz.msebera.android.httpclient.util.EntityUtils;
import zb.zebra.Util.CustomMessageClass;
import zb.zebra.Util.DeviceChangeDialogClass;
import zb.zebra.Util.STBChangeDialogClass;
import zb.zebra.iptvapplication.R;

public class ActiveCodeActivity extends AppCompatActivity {
    public static final String PREFS_NAME = "ZebraUser";
    public static final String PREF_UNAME = "user" ;
    public static final String PREF_PASSWORD = "pass";
    public static final String ACTIVECODE="code";
    GridLayout pinbtngrid;
    Typeface font;
    String pass="";
    TextView passinput1;
    TextView passinput2;
    TextView passinput3;
    TextView passinput4;
    TextView passinput5;
    TextView passinput6;
    TextView passinput7;
    TextView passinput8;
    TextView passinput9;
    TextView passinput10;
    TextView passinput11;
    TextView passinput12;
    TextView passinput13;
    TextView passinput14;
    TextView status;
    String activateUrl="https://s01.zz00.org/activate";
    AsyncHttpClient client = new AsyncHttpClient();


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        stopService(new Intent(this, MyService.class));

        setContentView(R.layout.activity_active_code);
        font = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        pinbtngrid=findViewById(R.id.pinbtngrid);
        passinput1=(TextView)findViewById(R.id.passinput1);
        passinput2=(TextView)findViewById(R.id.passinput2);
        passinput3=(TextView)findViewById(R.id.passinput3);
        passinput4=(TextView)findViewById(R.id.passinput4);
        passinput5=(TextView)findViewById(R.id.passinput5);
        passinput6=(TextView)findViewById(R.id.passinput6);
        passinput7=(TextView)findViewById(R.id.passinput7);
        passinput8=(TextView)findViewById(R.id.passinput8);
        passinput9=(TextView)findViewById(R.id.passinput9);
        passinput10=(TextView)findViewById(R.id.passinput10);
        passinput11=(TextView)findViewById(R.id.passinput11);
        passinput12=(TextView)findViewById(R.id.passinput12);
        passinput13=(TextView)findViewById(R.id.passinput13);
        passinput14=(TextView)findViewById(R.id.passinput14);
        status=(TextView)findViewById(R.id.status);
        for (int i=0;i<pinbtngrid.getChildCount();i++)
        {((Button)pinbtngrid.getChildAt(i)).setTypeface(font);
            ((Button)pinbtngrid.getChildAt(i)).setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    if(view.getTag().equals("del")&&pass != null && pass.length() > 0 ) {
                            pass = pass.substring(0, pass.length() - 1);

                        switch (pass.length()) {
                            case 0:
                                passinput1.setVisibility(View.INVISIBLE);

                                break;
                            case 1:
                                passinput2.setVisibility(View.INVISIBLE);

                                break;
                            case 2:
                                passinput3.setVisibility(View.INVISIBLE);
                                break;
                            case 3:
                                passinput4.setVisibility(View.INVISIBLE);
                                break;
                            case 4:
                                passinput5.setVisibility(View.INVISIBLE);
                                break;
                            case 5:
                                passinput6.setVisibility(View.INVISIBLE);
                                break;
                            case 6:
                                passinput7.setVisibility(View.INVISIBLE);
                                break;
                            case 7:
                                passinput8.setVisibility(View.INVISIBLE);
                                break;
                            case 8:
                                passinput9.setVisibility(View.INVISIBLE);
                                break;
                            case 9:
                                passinput10.setVisibility(View.INVISIBLE);
                                break;
                            case 10:
                                passinput11.setVisibility(View.INVISIBLE);
                                break;
                            case 11:
                                passinput12.setVisibility(View.INVISIBLE);
                                break;
                            case 12:
                                passinput13.setVisibility(View.INVISIBLE);
                                break;
                            case 13:
                                passinput14.setVisibility(View.INVISIBLE);
                                break;

                            default: {
                            }
                        }
                    }
                    else if(!view.getTag().equals("del")){
                        if(pass.length()<14) {
                            pass = pass + view.getTag();
                            Log.e("ActiveCode", "Added digit, pass length now: " + pass.length());
                        }
                        switch (pass.length()) {
                            case 1:
                                passinput1.setVisibility(View.VISIBLE);
                                passinput1.setText((CharSequence) view.getTag());
                                break;
                            case 2:
                                passinput2.setVisibility(View.VISIBLE);
                                passinput2.setText((CharSequence) view.getTag());
                                break;
                            case 3:
                                passinput3.setVisibility(View.VISIBLE);
                                passinput3.setText((CharSequence) view.getTag());
                                break;
                            case 4:
                                passinput4.setVisibility(View.VISIBLE);
                                passinput4.setText((CharSequence) view.getTag());
                                break;
                            case 5:
                                passinput5.setVisibility(View.VISIBLE);
                                passinput5.setText((CharSequence) view.getTag());
                                break;
                            case 6:
                                passinput6.setVisibility(View.VISIBLE);
                                passinput6.setText((CharSequence) view.getTag());
                                break;
                            case 7:
                                passinput7.setVisibility(View.VISIBLE);
                                passinput7.setText((CharSequence) view.getTag());
                                break;
                            case 8:
                                passinput8.setVisibility(View.VISIBLE);
                                passinput8.setText((CharSequence) view.getTag());
                                break;
                            case 9:
                                passinput9.setVisibility(View.VISIBLE);
                                passinput9.setText((CharSequence) view.getTag());
                                break;
                            case 10:
                                passinput10.setVisibility(View.VISIBLE);
                                passinput10.setText((CharSequence) view.getTag());
                                break;
                            case 11:
                                passinput11.setVisibility(View.VISIBLE);
                                passinput11.setText((CharSequence) view.getTag());
                                break;
                            case 12:
                                passinput12.setVisibility(View.VISIBLE);
                                passinput12.setText((CharSequence) view.getTag());
                                break;
                            case 13:
                                passinput13.setVisibility(View.VISIBLE);
                                passinput13.setText((CharSequence) view.getTag());
                                break;
                            case 14:
                                passinput14.setVisibility(View.VISIBLE);
                                passinput14.setText((CharSequence) view.getTag());
                                getActivation();

                                break;
                            default: {
                            }
                        }
                    }
                }
            });}

    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if ((event.getAction() == KeyEvent.ACTION_DOWN)) {
            Log.e("KEY", event.getKeyCode() + "");
            switch (event.getKeyCode()) {


                case KeyEvent.KEYCODE_BACK:
                    if(!getIntent().hasExtra("previousactivity")||!getIntent().getStringExtra("previousactivity").equals("menu"))
                    ActiveCodeActivity.this.finishAffinity();
                    break;
                default:
                    break;
            }
            return super.dispatchKeyEvent(event);
        }
        else{
            return super.dispatchKeyEvent(event);
        }
    }

    private void savePreferences(String user,String pass,String activecode) {
        SharedPreferences settings = getSharedPreferences(PREFS_NAME,
                Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = settings.edit();
        editor.putString(ACTIVECODE, activecode);
        editor.putString(PREF_UNAME, user);
        editor.putString(PREF_PASSWORD, pass);
        editor.commit();
    }

    public Boolean getActivation(){
        // Get device ID
        String androidDeviceId = Settings.Secure.getString(getApplicationContext().getContentResolver(),
                Settings.Secure.ANDROID_ID);

        // Create JSON body for activation
        JSONObject activationBody = new JSONObject();
        try {
            activationBody.put("code", pass);
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
                                    savePreferences(username, password, pass);

                                    // Navigate to menu
                                    Intent menuIntent = new Intent(ActiveCodeActivity.this, MenuActivity.class);
                                    startActivity(menuIntent);
                                } else {
                                    // Show error
                                    String errorMsg = res.optString("error", "Activation failed");
                                    CustomMessageClass cdd = new CustomMessageClass(ActiveCodeActivity.this);
                                    cdd.setMsg(errorMsg);
                                    cdd.show();
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
                            } catch (JSONException e) {
                                e.printStackTrace();
                                status.setText("Erreur de connexion");
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
                        }

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
                                        zb.zebra.Util.DeviceChangeDialogClass deviceDialog = new zb.zebra.Util.DeviceChangeDialogClass(ActiveCodeActivity.this);
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
                    }
            );
        } catch (Exception e) {
            e.printStackTrace();
            status.setText("Erreur de connexion");
        }

        return true;
    }

    public static JSONObject GET(String url){
        JSONObject jsonObject = null;
        try  {
            CloseableHttpClient httpClient = HttpClientBuilder.create().build();
            HttpGet request = new HttpGet(url);


            HttpResponse result = httpClient.execute(request);
            String json = EntityUtils.toString(result.getEntity(), "UTF-8");

            jsonObject=new JSONObject(json);


        } catch (IOException ex) {
        } catch (JSONException e) {
            e.printStackTrace();
        }
        return jsonObject;
    }


}
