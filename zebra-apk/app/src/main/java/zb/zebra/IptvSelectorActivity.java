package zb.zebra;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.AsyncTask;
import android.os.Bundle;
import android.os.StrictMode;
import androidx.constraintlayout.widget.ConstraintLayout;
import androidx.constraintlayout.widget.ConstraintSet;
import androidx.constraintlayout.widget.Guideline;
import androidx.transition.TransitionManager;
import androidx.core.app.ActivityCompat;
import androidx.appcompat.app.AppCompatActivity;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ImageView;
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
import zb.zebra.Util.CustomDialogClass;
import zb.zebra.iptvapplication.R;


public class IptvSelectorActivity extends AppCompatActivity {

    ImageButton allChBtn;
    ImageButton arChBtn;
    ImageButton frChBtn;
    private ConstraintSet originalConstraints = new ConstraintSet();
    //  private AppVerUpdater appVerUpdater;
    private ConstraintSet allConstraints= new ConstraintSet();
    private ConstraintSet frConstraints= new ConstraintSet();
    private ConstraintSet arConstraints= new ConstraintSet();
final android.os.Handler handler = new android.os.Handler();
    private ConstraintLayout constraintLayout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_iptv_selector);

        StrictMode.VmPolicy.Builder builder = new StrictMode.VmPolicy.Builder();
        StrictMode.setVmPolicy(builder.build());

        allChBtn=(ImageButton)findViewById(R.id.allChBtn);
        arChBtn=(ImageButton)findViewById(R.id.arChBtn);
        frChBtn=(ImageButton)findViewById(R.id.frChBtn);

        constraintLayout = (ConstraintLayout)findViewById(R.id.menuconstraint);
        originalConstraints.clone(this, R.layout.activity_iptv_selector);
        allConstraints.clone(this, R.layout.activity_iptv_selector_all);
        arConstraints.clone(this, R.layout.activity_iptv_selector_ar);
        frConstraints.clone(this, R.layout.activity_iptv_selector_fr);

        allChBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

handler.postDelayed(new Runnable() {
  @Override
  public void run() {
    //Do something after 100ms
    Intent iptvIntent=new Intent(IptvSelectorActivity.this,IptvActivity.class);
      iptvIntent.putExtra("iptvparent","-1");
                startActivity(iptvIntent);
  }
}, 1000);

            }
        });



        arChBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {


            handler.postDelayed(new Runnable() {
              @Override
              public void run() {
                //Do something after 100ms
                Intent iptvIntent=new Intent(IptvSelectorActivity.this,IptvActivity.class);
                  iptvIntent.putExtra("iptvparent","84");
                            startActivity(iptvIntent);
              }
            }, 1000);


            }
        });
        frChBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {


            handler.postDelayed(new Runnable() {
              @Override
              public void run() {
                //Do something after 100ms
               Intent iptvIntent=new Intent(IptvSelectorActivity.this,IptvActivity.class);
                  iptvIntent.putExtra("iptvparent","83");
                startActivity(iptvIntent);

              }
            }, 1000);
            }
        });


        frChBtn.requestFocus();

    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if((event.getAction() == KeyEvent.ACTION_DOWN)){
            Log.e("KEY",event.getKeyCode()+"");
            switch (event.getKeyCode()) {


                case KeyEvent.KEYCODE_DPAD_RIGHT:

                        if(frChBtn.hasFocus()) {
                            TransitionManager.beginDelayedTransition(constraintLayout);
                            arConstraints.applyTo(constraintLayout);
                            arChBtn.requestFocus();
                            return true;
                        }
                        else if(arChBtn.hasFocus()) {
                            TransitionManager.beginDelayedTransition(constraintLayout);
                            allConstraints.applyTo(constraintLayout);
                            allChBtn.requestFocus();
                            return true;
                        }


                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if(allChBtn.hasFocus()) {
                        TransitionManager.beginDelayedTransition(constraintLayout);
                        arConstraints.applyTo(constraintLayout);
                        arChBtn.requestFocus();
                        return true;
                    }
                    else if(arChBtn.hasFocus()) {
                        TransitionManager.beginDelayedTransition(constraintLayout);
                        frConstraints.applyTo(constraintLayout);
                        frChBtn.requestFocus();
                        return true;
                    }

                    return super.dispatchKeyEvent(event);

                default:

                    return super.dispatchKeyEvent(event);
            }}
        else{      return super.dispatchKeyEvent(event);}

    }


}



