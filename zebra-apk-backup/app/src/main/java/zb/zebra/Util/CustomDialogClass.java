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
import zb.zebra.iptvapplication.R;

public class CustomDialogClass extends Dialog implements
    android.view.View.OnClickListener {

  public Activity c;
  public Dialog d;
  public Button yes, no;

  private String changelogmsg;
  private String currentversion;

  TextView changelogmsgtxtv;
  TextView currentversiontxtv;
  private String apkUrl;

  public String getApkUrl() {
    return apkUrl;
  }

  public void setApkUrl(String apkUrl) {
    this.apkUrl = apkUrl;
  }

  public String getChangelogmsg() {
    return changelogmsg;
  }

  public void setChangelogmsg(String changelogmsg) {
    this.changelogmsg = changelogmsg;
  }

  public String getCurrentversion() {
    return currentversion;
  }

  public void setCurrentversion(String currentversion) {
    this.currentversion = currentversion;
  }

  public CustomDialogClass(Activity a) {
    super(a);
    // TODO Auto-generated constructor stub
    this.c = a;
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    setContentView(R.layout.customdialog);
    changelogmsgtxtv = (TextView) findViewById(R.id.changelogmsgtxtv);
    currentversiontxtv = (TextView) findViewById(R.id.currentversiontxtv);
    changelogmsgtxtv.setText(changelogmsg);
    currentversiontxtv.setText(currentversion);
    yes = (Button) findViewById(R.id.btn_yes);
    no = (Button) findViewById(R.id.btn_no);
    yes.setOnClickListener(this);

  }

  @Override
  public void onBackPressed() {
    c.finishAffinity();
  }

  @Override
  public void onClick(View v) {
    switch (v.getId()) {
    case R.id.btn_yes:
      new DownloadNewVersion().execute(apkUrl);
      break;

    default:
      break;
    }
}

  ProgressDialog bar;
  class DownloadNewVersion extends AsyncTask<String,Integer,Boolean> {

    @Override
    protected void onPreExecute() {
      super.onPreExecute();

      bar = new ProgressDialog(c);
      bar.setCancelable(false);

      bar.setMessage("Downloading...");

      bar.setIndeterminate(true);
      bar.setCanceledOnTouchOutside(false);
      bar.show();

    }

    protected void onProgressUpdate(Integer... progress) {
      super.onProgressUpdate(progress);

      bar.setIndeterminate(false);
      bar.setMax(100);
      bar.setProgress(progress[0]);
      String msg = "";
      if(progress[0]>99){

        msg="Finalisation... ";

      }else {

        msg="Téléchargement... "+progress[0]+"%";
      }
      bar.setMessage(msg);

    }
    @Override
    protected void onPostExecute(Boolean result) {
      // TODO Auto-generated method stub
      super.onPostExecute(result);

      bar.dismiss();

      if(result){

        Toast.makeText(c.getApplicationContext(),"Update Done",
                Toast.LENGTH_SHORT).show();

      }else{

        Toast.makeText(c.getApplicationContext(),"Error: Try Again",
                Toast.LENGTH_SHORT).show();

      }

    }

    @Override
    protected Boolean doInBackground(String... arg0) {
      Boolean flag = false;

      try {



        CloseableHttpClient httpClient = HttpClientBuilder.create().build();
        HttpGet request = new HttpGet(arg0[0]);


        HttpResponse result = httpClient.execute(request);





        String PATH = Environment.getExternalStorageDirectory()+"/Download/";

        File file = new File(PATH);
        file.mkdirs();

        File outputFile = new File(file,"zebra_latest.apk");

        if(outputFile.exists()){
          outputFile.delete();
        }

        FileOutputStream fos = new FileOutputStream(outputFile);
        InputStream is = result.getEntity().getContent();

        int total_size = 1431692;//size of apk

        byte[] buffer = new byte[1024];
        int len1 = 0;
        int per = 0;
        int downloaded=0;
        while ((len1 = is.read(buffer)) != -1) {
          fos.write(buffer, 0, len1);
          downloaded +=len1;
          per = (int) (downloaded * 100 / total_size);
          publishProgress(per);
        }
        fos.close();
        is.close();

        OpenNewVersion(PATH);
        Log.e("sss", "dddd" + flag);
        flag = true;
      } catch (Exception e) {
        Log.e("sss", "Update Error: " + e.getMessage());
        flag = false;
      }

      return flag;

    }


  }
  void OpenNewVersion(String location) {

    Intent intent = new Intent(Intent.ACTION_VIEW);
    intent.setDataAndType(Uri.fromFile(new File(location + "zebra_latest.apk")),
            "application/vnd.android.package-archive");
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    c.startActivity(intent);

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