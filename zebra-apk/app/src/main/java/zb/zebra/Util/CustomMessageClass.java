package zb.zebra.Util;

import android.app.Activity;
import android.app.Dialog;
import android.app.ProgressDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

import cz.msebera.android.httpclient.HttpResponse;
import cz.msebera.android.httpclient.client.methods.HttpGet;
import cz.msebera.android.httpclient.impl.client.CloseableHttpClient;
import cz.msebera.android.httpclient.impl.client.HttpClientBuilder;
import cz.msebera.android.httpclient.util.EntityUtils;
import zb.zebra.ActiveCodeActivity;
import zb.zebra.MainActivity;
import zb.zebra.iptvapplication.R;

public class CustomMessageClass extends Dialog implements
    View.OnClickListener {

  public Activity c;
  public Dialog d;
  public Button yes;

  private String msg;

  TextView msgtxtv;

  public String getMsg() {
    return msg;
  }

  public void setMsg(String msg) {
    this.msg = msg;
  }

  public TextView getMsgtxtv() {
    return msgtxtv;
  }

  public void setMsgtxtv(TextView msgtxtv) {
    this.msgtxtv = msgtxtv;
  }

  public CustomMessageClass(Activity a) {
    super(a);
    // TODO Auto-generated constructor stub
    this.c = a;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    setContentView(R.layout.msgdialog);
    msgtxtv = (TextView) findViewById(R.id.msgtxtv);
    msgtxtv.setText(getMsg());

    yes = (Button) findViewById(R.id.btn_yes);
    yes.setOnClickListener(this);

  }

  @Override
  public void onClick(View v) {
    int id = v.getId();
    if (id == R.id.btn_yes) {
      Intent activecodeIntent=new Intent(c.getApplication(),ActiveCodeActivity.class);
      activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
      c.startActivity(activecodeIntent);
      dismiss();
    }

  }

  @Override
  public void onBackPressed() {

    Intent activecodeIntent=new Intent(c.getApplication(),ActiveCodeActivity.class);
    activecodeIntent.setFlags(activecodeIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
    c.startActivity(activecodeIntent);
    dismiss();
    super.onBackPressed();
  }
}