package zb.zebra;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.provider.Settings;
import android.support.v7.app.AppCompatActivity;
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
import io.michaelrocks.paranoid.Obfuscate;
import zb.zebra.Util.CustomMessageClass;
import zb.zebra.Util.STBChangeDialogClass;
import zb.zebra.iptvapplication.R;

@Obfuscate
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
    String codeurl="https://www.machinevaisselle.tn/api/getcodeservice/getcode?code='";
    String macattr="'&stbid='";
    String salt="'";
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
                        if(pass.length()<14)
                        pass = pass + view.getTag();
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
                client.get(codeurl + pass + macattr + androidDeviceId + salt, new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


                        Log.e("RES", res.toString());
                        if (res != null) {
                            Log.e("RES", res.toString());
                            try {
                                if (res.getString("result")!=null)
                                {if(res.getString("result").equalsIgnoreCase("Code expired") || res.getString("result").equalsIgnoreCase("Test expired") || res.getString("result").equalsIgnoreCase("User disabled") ) {
                                    //Toast.makeText(getApplicationContext(),res.getString("user_response"),Toast.LENGTH_LONG).show();
                                    CustomMessageClass cdd=new CustomMessageClass(ActiveCodeActivity.this);
                                    cdd.setMsg(res.getString("user_response"));
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

                                }else if (res.getString("result").equalsIgnoreCase("OK")) {
                                    savePreferences(res.getString("username"), res.getString("password"),pass);

                                    Intent menuIntent = new Intent(ActiveCodeActivity.this, MenuActivity.class);
                                    startActivity(menuIntent);
                                }
                                else if (res.getString("result").equalsIgnoreCase("Stbid changed")) {

                                    STBChangeDialogClass cdd=new STBChangeDialogClass(ActiveCodeActivity.this);
                                    cdd.setCodeid(res.getInt("id_code"));
                                    cdd.setMsg(res.getString("user_response"));
                                    cdd.show();
                                        /*savePreferences(res.getString("username"), res.getString("password"));

                                        Intent menuIntent = new Intent(MainActivity.this, MenuActivity.class);
                                        startActivity(menuIntent);*/
                                }

                                }else {
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
                    public void onFailure(int statusCode, Header[] headers,  Throwable t,JSONObject res) {
                        // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                        Log.e("error", t.getStackTrace().toString());

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
                });


            }

            @Override
            public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                Log.e("error", t.getStackTrace().toString());


            }
        });



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
