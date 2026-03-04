package zb.zebra.Util;

import android.app.Activity;
import android.app.Dialog;
import android.app.ProgressDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;

import cz.msebera.android.httpclient.Header;
import cz.msebera.android.httpclient.HttpResponse;
import cz.msebera.android.httpclient.client.methods.HttpGet;
import cz.msebera.android.httpclient.entity.StringEntity;
import cz.msebera.android.httpclient.impl.client.CloseableHttpClient;
import cz.msebera.android.httpclient.impl.client.HttpClientBuilder;
import cz.msebera.android.httpclient.util.EntityUtils;
import zb.zebra.ActiveCodeActivity;
import zb.zebra.MainActivity;
import zb.zebra.MenuActivity;
import zb.zebra.iptvapplication.R;

public class STBChangeDialogClass extends Dialog implements
    View.OnClickListener {
  AsyncHttpClient client = new AsyncHttpClient();
  String codeurl="https://www.machinevaisselle.tn";
  String infourl="https://www.machinevaisselle.tn/api/getcodeservice/getcode?code='";
  String macattr="'&stbid='";
  String salt="'";
  public Activity c;
  public Dialog d;
  public Button yes, no;

  private String msg;
  private int codeid;
  private SharedPreferences sharedPref;

  public int getCodeid() {
    return codeid;
  }

  public void setCodeid(int codeid) {
    this.codeid = codeid;
  }

  TextView msgtxtv;

  public String getMsg() {
    return msg;
  }

  public void setMsg(String msg) {
    this.msg = msg;
  }

  public STBChangeDialogClass(Activity a) {
    super(a);
    // TODO Auto-generated constructor stub
    this.c = a;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    setContentView(R.layout.stbchangedialog);
  msgtxtv = (TextView) findViewById(R.id.msgtxtv);
   msgtxtv.setText(msg);
    yes = (Button) findViewById(R.id.btn_yes);
    no = (Button) findViewById(R.id.btn_no);
    yes.setOnClickListener(this);
    no.setOnClickListener(this);

  }
    private void savePreferences(String user,String pass,String activecode) {
        SharedPreferences settings = c.getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = settings.edit();
        editor.putString(ActiveCodeActivity.ACTIVECODE, activecode);
        editor.putString(ActiveCodeActivity.PREF_UNAME, user);
        editor.putString(ActiveCodeActivity.PREF_PASSWORD, pass);
        editor.commit();
    }
  @Override
  public void onClick(View v) {
    switch (v.getId()) {
    case R.id.btn_yes:

      client.get(Uri.encode("https://www.machinevaisselle.tn/auth/loginservice/login?username='zebra'&password='ZebR@++2020'"), new JsonHttpResponseHandler() {
        @Override
        public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
         String androidDeviceId = Settings.Secure.getString(c.getApplicationContext().getContentResolver(),
                            Settings.Secure.ANDROID_ID);
          String bearer = "";
          try {

            bearer = res.getString("value");
          } catch (JSONException e) {
            e.printStackTrace();
          }
          client.addHeader("Accept", "application/json");
          client.addHeader("Authorization", "Bearer " + bearer);
          String patch = "{\"$id\": 1,\"@xdata.type\": \"XData.Default.active_code\",\"id_code\": "+getCodeid()+",\"stbid\": \""+androidDeviceId+"\"}";
          Log.e("url", codeurl + "/api/active_code(" + getCodeid() + ")");


          try {
            client.patch(getContext(),codeurl + "/api/active_code(" + getCodeid() + ")",new StringEntity(patch),"application/json", new JsonHttpResponseHandler() {
              @Override
              public void onSuccess(int statusCode, Header[] headers, JSONObject res) {

                if (res != null) {
                  Log.e("RES", res.toString());
                  getNewInfo();
                  dismiss();
                  Intent menuIntent = new Intent(getContext(), MenuActivity.class);
                  c.startActivity(menuIntent);
                }


              }

              @Override
              public void onFailure(int statusCode, Header[] headers, Throwable t,JSONObject res) {
                // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                Log.e("error", t.getStackTrace().toString());


              }
            });
          } catch (UnsupportedEncodingException e) {
            e.printStackTrace();
          }


        }

        @Override
        public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
          // called when response HTTP status is "4XX" (eg. 401, 403, 404)
          Log.e("error", t.getStackTrace().toString());


        }
      });
     // Intent menuIntent = new Intent(MainActivity.this, MenuActivity.class);
      //startActivity(menuIntent);
      break;
    case R.id.btn_no:
      dismiss();
        Intent activecodeIntent = new Intent(getContext(), ActiveCodeActivity.class);
        getContext().startActivity(activecodeIntent);
      break;
    default:
      break;
    }
    dismiss();
  }



  public void getNewInfo(){
    client.get(Uri.encode("https://www.machinevaisselle.tn/auth/loginservice/login?username='zebra'&password='ZebR@++2020'"), new JsonHttpResponseHandler() {
      @Override
      public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
       String androidDeviceId = Settings.Secure.getString(c.getApplicationContext().getContentResolver(),
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
        sharedPref = c.getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);
        String login = sharedPref.getString("user","");
        String password = sharedPref.getString("pass","");
        String activecode = sharedPref.getString("activecode","");
        client.get(infourl + activecode + macattr + androidDeviceId + salt, new JsonHttpResponseHandler() {
          @Override
          public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


            if (res != null) {
              Log.e("RES", res.toString());
              try {
                if (res.getString("result") != null) {
                    savePreferences(res.getString("username"), res.getString("password"),  res.getString("code"));
                }
              } catch (JSONException e) {
                e.printStackTrace();
                
              }
            }


          }

          @Override
          public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
            // called when response HTTP status is "4XX" (eg. 401, 403, 404)
            Log.e("error", t.getStackTrace().toString());


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
}