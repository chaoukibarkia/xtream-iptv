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
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.os.StrictMode;
import android.provider.Settings;
import android.support.constraint.ConstraintLayout;
import android.support.constraint.ConstraintSet;
import android.support.constraint.Guideline;
import android.support.transition.TransitionManager;
import android.support.v4.app.ActivityCompat;
import android.support.v7.app.AppCompatActivity;
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
import zb.zebra.iptvapplication.R;
import zb.zebra.Util.CustomDialogClass;


public class MenuActivity extends AppCompatActivity {
    private static final int REQUEST_EXTERNAL_STORAGE = 1;
    private static String[] PERMISSIONS_STORAGE = {
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
    };
    String codeurl="https://www.machinevaisselle.tn/api/getcodeservice/getcode?code='";
    String macattr="'&stbid='";
    String salt="'";
    ImageButton vodBtn;
    ImageButton vodTvShowBtn;
    ImageButton iptvBtn;
    ImageButton compteBtn;
    ImageButton compteBtnSelected;
    String lastmenuelement;
    AsyncHttpClient client = new AsyncHttpClient();
    private int rightcount=0;
    private ImageView menuselector;
    Guideline selectortop;
    Guideline selectorbottom;
    Guideline selectorleft;
    Guideline selectorright;
    private ConstraintLayout constraintLayout;
    private ConstraintSet originalConstraints = new ConstraintSet();
  //  private AppVerUpdater appVerUpdater;
    private ConstraintSet iptvConstraints= new ConstraintSet();
    private ConstraintSet vodfilmConstraints= new ConstraintSet();
    private ConstraintSet vodtvshowConstraints= new ConstraintSet();
    private ConstraintSet accountConstraints= new ConstraintSet();
    Button ChangeAccountBtn;
    Button CancelBtn;
    String apkUrl="";
    TextView accountname;
    TextView accountactivation;
    TextView accountexpiration;

    SharedPreferences sharedPref;
    String user="";
    String pass="";
    private ConstraintLayout accountpop;
    private Button ouibtn;
    private String backmenuelement="";
    Typeface font;
    private Button nonbtn;
    private ConstraintLayout exitpop;
    private TextView exitmsg;
    private TextView apkversion;
final android.os.Handler handler = new android.os.Handler();

    private void loadPreferences() {

        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);

        // Get value
        user = settings.getString(ActiveCodeActivity.PREF_UNAME, "");
        pass = settings.getString(ActiveCodeActivity.PREF_PASSWORD, "");

    }
    private void update(){


        new HttpAsyncTask().execute("https://machinevaisselle.tn/update/versionprod.json");

    }

   /* @Override
    protected void onResume() {
        super.onResume();
        appVerUpdater.onResume(this);
    }*/

   /* @Override
    protected void onStop() {
        super.onStop();
        appVerUpdater.onStop(this);
    }*/
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_menu);
       /* new AppUpdater(this)
                .setUpdateFrom(UpdateFrom.JSON).setUpdateJSON("http://192.168.1.16:80/newapp.json").start();*/
        startService(new Intent(this, MyService.class));

        StrictMode.VmPolicy.Builder builder = new StrictMode.VmPolicy.Builder();
        StrictMode.setVmPolicy(builder.build());
        font = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        sharedPref = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);

        verifyStoragePermissions(MenuActivity.this);
        update();
        vodBtn=(ImageButton)findViewById(R.id.vodBtn);
        vodTvShowBtn=(ImageButton)findViewById(R.id.VodTvshowBtn);
        iptvBtn=(ImageButton)findViewById(R.id.IptvBtn);
        compteBtn=(ImageButton)findViewById(R.id.compteBtn);
        compteBtnSelected=(ImageButton)findViewById(R.id.compteselectedBtn);
        menuselector=(ImageView) findViewById(R.id.selector);
        accountpop=(ConstraintLayout) findViewById(R.id.accountmainpop);
        CancelBtn=(Button) findViewById(R.id.Cancel);
        ChangeAccountBtn=(Button) findViewById(R.id.ChangeAccountbtn);
        accountname=(TextView)findViewById(R.id.accountname);
        accountactivation=(TextView)findViewById(R.id.accountactivation);
        accountexpiration=(TextView)findViewById(R.id.accountexpiration);
        apkversion=(TextView)findViewById(R.id.apkversion);
        exitpop=(ConstraintLayout)findViewById(R.id.exitpop);
        exitmsg=(TextView)findViewById(R.id.exitmsg);
        loadPreferences();
        ouibtn=(Button)findViewById(R.id.ouibtn);
        nonbtn=(Button)findViewById(R.id.nonbtn);

        CancelBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if(backmenuelement.equalsIgnoreCase("iptvBtn")){
                    iptvBtn.requestFocus();}
                if(backmenuelement.equalsIgnoreCase("vodBtn")){
                    vodBtn.requestFocus();}
                if(backmenuelement.equalsIgnoreCase("vodTvShowBtn")) {
                    vodTvShowBtn.requestFocus();
                }
                if(backmenuelement.equalsIgnoreCase("compteBtn")) {
                    compteBtn.requestFocus();
                }
                accountpop.setVisibility(View.INVISIBLE);
            }
        });
        ChangeAccountBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
               Intent changeAccountIntent=new Intent(MenuActivity.this,ActiveCodeActivity.class);
                changeAccountIntent.putExtra("previousactivity","menu");

                startActivity(changeAccountIntent);

            }
        });

        ouibtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                MenuActivity.this.finishAffinity();
            }
        });
        nonbtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if(backmenuelement.equalsIgnoreCase("iptvBtn")){
                    iptvBtn.requestFocus();}
                if(backmenuelement.equalsIgnoreCase("vodBtn")){
                    vodBtn.requestFocus();}
                if(backmenuelement.equalsIgnoreCase("vodTvShowBtn")) {
                    vodTvShowBtn.requestFocus();
                }
                if(backmenuelement.equalsIgnoreCase("compteBtn")) {
                    compteBtn.requestFocus();
                }
                exitpop.setVisibility(View.INVISIBLE);
            }
        });
        selectortop=(Guideline)findViewById(R.id.selectortopguide);
        selectorbottom=(Guideline)findViewById(R.id.selectorbottomguide);
        selectorleft=(Guideline)findViewById(R.id.selectorleftguide);
        selectorright=(Guideline)findViewById(R.id.selectorright2guide);
        constraintLayout = (ConstraintLayout)findViewById(R.id.menuconstraint);
        originalConstraints.clone(this, R.layout.activity_menu);
        iptvConstraints.clone(this, R.layout.activity_menu_iptv);
        vodfilmConstraints.clone(this, R.layout.activity_menu_vodfilm);
        vodtvshowConstraints.clone(this, R.layout.activity_menu_vodtvshow);
        accountConstraints.clone(this, R.layout.activity_menu_account);



        constraintLayout.setOnTouchListener(new zb.zebra.Util.OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {

                return;
            }

            @Override
            public void onSwipeLeft() {
                if(rightcount==2){
                    rightcount=0;
                            Intent secretIntent = new Intent(MenuActivity.this, SecretActivity.class);
                            secretIntent.setFlags(secretIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                            startActivity(secretIntent);

                }
                rightcount++;

            }

            @Override
            public void onSwipeUp() {

                return;
            }

            @Override
            public void onSwipeRight() {


            }
        });




        vodBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                 TransitionManager.beginDelayedTransition(constraintLayout);
                            vodfilmConstraints.applyTo(constraintLayout);
                            vodBtn.requestFocus();
handler.postDelayed(new Runnable() {
  @Override
  public void run() {
    //Do something after 100ms
    Intent vodIntent=new Intent(MenuActivity.this,FilmZebraActivity.class);
                vodIntent.putExtra("vodparent","2");
                startActivity(vodIntent);
  }
}, 1000);

            }
        });



        vodTvShowBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
               /* Intent vodIntent=new Intent(MenuActivity.this,VodSerieActivity.class);
                vodIntent.putExtra("vodparent","25");
                startActivity(vodIntent);*/

               TransitionManager.beginDelayedTransition(constraintLayout);
                           vodtvshowConstraints.applyTo(constraintLayout);
                            vodTvShowBtn.requestFocus();
            handler.postDelayed(new Runnable() {
              @Override
              public void run() {
                //Do something after 100ms
                Intent vodIntent=new Intent(MenuActivity.this,TvshowZebraActivity.class);
                            vodIntent.putExtra("vodparent","25");
                            startActivity(vodIntent);
              }
            }, 1000);


            }
        });
        iptvBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

                 TransitionManager.beginDelayedTransition(constraintLayout);
                           iptvConstraints.applyTo(constraintLayout);
                        iptvBtn.requestFocus();
            handler.postDelayed(new Runnable() {
              @Override
              public void run() {
                //Do something after 100ms
               Intent iptvIntent=new Intent(MenuActivity.this,IptvActivity.class);
                  //iptvIntent.setFlags(iptvIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                startActivity(iptvIntent);

              }
            }, 1000);
            }
        });


        compteBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                compteBtn.requestFocus();


                    TransitionManager.beginDelayedTransition(constraintLayout);
                    accountConstraints.applyTo(constraintLayout);
                   handler.postDelayed(new Runnable() {
              @Override
              public void run() {
                //Do something after 100ms

                ouibtn.setVisibility(View.INVISIBLE);
                nonbtn.setVisibility(View.INVISIBLE);
                backmenuelement="compteBtn";
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
                          String activecode = sharedPref.getString("activecode","");
                          client.get(codeurl + activecode + macattr + androidDeviceId + salt, new JsonHttpResponseHandler() {
                              @Override
                              public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


                                  if (res != null) {
                                      Log.e("RES", res.toString());
                                      try {
                                          if (res.getString("result") != null) {


                                              JSONObject user_info = res;
                                              accountname.setText(user_info.getString("code"));
                                              accountactivation.setText("Activé: " + user_info.getString("act_date"));
                                              accountexpiration.setText("Expire: " + ((user_info.get("exp_date") != null && user_info.getString("exp_date") != "null") ? user_info.getString("exp_date") : "Jamais"));
                                              PackageInfo pInfo = null;
                                              try {
                                                  pInfo = MenuActivity.this.getPackageManager().getPackageInfo(getPackageName(), 0);
                                              } catch (PackageManager.NameNotFoundException e) {
                                                  e.printStackTrace();
                                              }

                                              apkversion.setText("Version : " + pInfo.versionName);
                                              accountpop.setVisibility(View.VISIBLE);
                                              CancelBtn.requestFocus();


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
            }, 1000);

            }
        });
        compteBtnSelected.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Log.e("ddddd","clicked");
                compteBtnSelected.requestFocus();


                    TransitionManager.beginDelayedTransition(constraintLayout);
                    accountConstraints.applyTo(constraintLayout);
                   handler.postDelayed(new Runnable() {
              @Override
              public void run() {
                //Do something after 100ms

                ouibtn.setVisibility(View.INVISIBLE);
                nonbtn.setVisibility(View.INVISIBLE);
                backmenuelement="compteBtn";
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
                          String activecode = sharedPref.getString("activecode","");
                          client.get(codeurl + activecode + macattr + androidDeviceId + salt, new JsonHttpResponseHandler() {
                              @Override
                              public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


                                  if (res != null) {
                                      Log.e("RES", res.toString());
                                      try {
                                          if (res.getString("result") != null) {


                                              JSONObject user_info = res;
                                              accountname.setText(sharedPref.getString("activecode", ""));
                                              accountactivation.setText("Activé: " + user_info.getString("act_date"));
                                              accountexpiration.setText("Expire: " + ((user_info.get("exp_date") != null && user_info.getString("exp_date") != "null") ? user_info.getString("exp_date") : "Jamais"));
                                              PackageInfo pInfo = null;
                                              try {
                                                  pInfo = MenuActivity.this.getPackageManager().getPackageInfo(getPackageName(), 0);
                                              } catch (PackageManager.NameNotFoundException e) {
                                                  e.printStackTrace();
                                              }

                                              apkversion.setText("Version : " + pInfo.versionName);
                                              accountpop.setVisibility(View.VISIBLE);
                                              CancelBtn.requestFocus();

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
            }, 1000);

            }
        });
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if((event.getAction() == KeyEvent.ACTION_DOWN)){
            Log.e("KEY",event.getKeyCode()+"");
            switch (event.getKeyCode()) {

                
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if(accountpop.getVisibility()==View.VISIBLE||exitpop.getVisibility()==View.VISIBLE){

                        return super.dispatchKeyEvent(event);}
                    if(vodTvShowBtn.hasFocus()){
                        rightcount=rightcount+1;
                        if(rightcount>=3) {
                            Log.e("SECRET", "ADULTE");
                           /* RelativeLayout relativeLayout=new RelativeLayout(MenuActivity.this);
                            LayoutInflater inflater = (LayoutInflater) MenuActivity.this.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
                            View v = inflater.inflate(R.layout.pincode_view, null);
                            RelativeLayout pincoderoot=(RelativeLayout)v.findViewById(R.id.pincoderoot);
                            final PinEntryEditText pincode=(PinEntryEditText)pincoderoot.findViewById(R.id.pincode);
                            //pincode.setInputType( InputType.TYPE_CLASS_TEXT | InputType.TYPE_NUMBER_VARIATION_PASSWORD );
                            pincode.requestFocus();

                            RelativeLayout.LayoutParams lp=new RelativeLayout.LayoutParams(RelativeLayout.LayoutParams.WRAP_CONTENT, RelativeLayout.LayoutParams.WRAP_CONTENT);

                            pincoderoot.setLayoutParams(lp);

                            relativeLayout.addView(pincoderoot);
                            relativeLayout.setGravity(Gravity.CENTER);
                            pincode.setAnimateText(true);
                            final zb.zebra.iptvapplication.Util.PrettyDialog.PrettyDialog pDialog=new zb.zebra.iptvapplication.Util.PrettyDialog.PrettyDialog(MenuActivity.this);

                            pincode.setOnPinEnteredListener(new PinEntryEditText.OnPinEnteredListener() {
                                @Override
                                public void onPinEntered(CharSequence str) {
                                    if (str.toString().equals("1234")) {
                                        pDialog.dismiss();
                                        Intent adulteIntent=new Intent(MenuActivity.this,AdultActivity.class);
                                        startActivity(adulteIntent);
                                    } else {
                                        pincode.setError(true);

                                        pincode.postDelayed(new Runnable() {
                                            @Override
                                            public void run() {
                                                pincode.setText(null);
                                            }
                                        }, 500);
                                    }
                                }
                            });

                            //pincode.setTransformationMethod(PasswordTransformationMethod.getInstance());
                            pDialog
                                    .setTitle("")
                                    .setIcon(
                                            R.drawable.pdlg_icon_info  // icon resource
                                           )

                                    .addContent(relativeLayout,new zb.zebra.iptvapplication.Util.PrettyDialog.PrettyDialogCallback() {
                                        @Override
                                        public void onClick() {
                                            // Dismiss
                                        }
                                    })
                                    .show();
                            //Intent adulteIntent=new Intent(MenuActivity.this,AdultActivity.class);
                            //startActivity(adulteIntent);

                        }*/
                            Intent secretIntent = new Intent(MenuActivity.this, SecretActivity.class);
                            secretIntent.setFlags(secretIntent.getFlags() | Intent.FLAG_ACTIVITY_NO_HISTORY);
                            startActivity(secretIntent);
                            rightcount=0;

                        }
                    }
                    else{
                        if(iptvBtn.hasFocus()) {
                            TransitionManager.beginDelayedTransition(constraintLayout);
                            vodfilmConstraints.applyTo(constraintLayout);
                            vodBtn.requestFocus();
                            return true;
                        }
                        else if(vodBtn.hasFocus()) {
                            TransitionManager.beginDelayedTransition(constraintLayout);
                            vodtvshowConstraints.applyTo(constraintLayout);
                            vodTvShowBtn.requestFocus();
                            return true;
                        }

                        return super.dispatchKeyEvent(event);
                    }


                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if(accountpop.getVisibility()==View.VISIBLE||exitpop.getVisibility()==View.VISIBLE){

                        return super.dispatchKeyEvent(event);}
                    if(vodTvShowBtn.hasFocus()) {
                        TransitionManager.beginDelayedTransition(constraintLayout);
                        vodfilmConstraints.applyTo(constraintLayout);
                        vodBtn.requestFocus();
                        return true;
                    }
                    else if(vodBtn.hasFocus()) {
                        TransitionManager.beginDelayedTransition(constraintLayout);
                        iptvConstraints.applyTo(constraintLayout);
                        iptvBtn.requestFocus();
                        return true;
                    }

                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_DPAD_UP:
                    if(accountpop.getVisibility()==View.VISIBLE||exitpop.getVisibility()==View.VISIBLE){
                        if(backmenuelement.equalsIgnoreCase("iptvBtn")){
                            iptvBtn.requestFocus();}
                        if(backmenuelement.equalsIgnoreCase("vodBtn")){
                            vodBtn.requestFocus();}
                        if(backmenuelement.equalsIgnoreCase("vodTvShowBtn")) {
                            vodTvShowBtn.requestFocus();
                        }
                        if(backmenuelement.equalsIgnoreCase("compteBtn")) {
                            compteBtn.requestFocus();
                        }
                        accountpop.setVisibility(View.INVISIBLE);
                    exitpop.setVisibility(View.INVISIBLE);}
                    if(compteBtn.hasFocus()){

                    TransitionManager.beginDelayedTransition(constraintLayout);
                        if(lastmenuelement=="iptvBtn"){
                            iptvConstraints.applyTo(constraintLayout);
                            iptvBtn.requestFocus();return true;}
                        if(lastmenuelement=="vodBtn"){
                            vodfilmConstraints.applyTo(constraintLayout);
                        vodBtn.requestFocus();return true;}
                        if(lastmenuelement=="vodTvShowBtn"){
                            vodtvshowConstraints.applyTo(constraintLayout);
                        vodTvShowBtn.requestFocus();return true;}
                    }


                    return super.dispatchKeyEvent(event);


                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if(accountpop.getVisibility()==View.VISIBLE||exitpop.getVisibility()==View.VISIBLE){

                        accountpop.setVisibility(View.INVISIBLE);
                    exitpop.setVisibility(View.INVISIBLE);
                        if(backmenuelement.equalsIgnoreCase("iptvBtn")){
                            iptvBtn.requestFocus();}
                        if(backmenuelement.equalsIgnoreCase("vodBtn")){
                            vodBtn.requestFocus();}
                        if(backmenuelement.equalsIgnoreCase("vodTvShowBtn")) {
                            vodTvShowBtn.requestFocus();
                        }
                        if(backmenuelement.equalsIgnoreCase("compteBtn")) {
                            compteBtn.requestFocus();
                        }return true;}
                    if(vodBtn.hasFocus())
                    lastmenuelement="vodBtn";
                    if(iptvBtn.hasFocus())
                        lastmenuelement="iptvBtn";
                    if(vodTvShowBtn.hasFocus())
                        lastmenuelement="vodTvShowBtn";
                    compteBtn.requestFocus();

                    TransitionManager.beginDelayedTransition(constraintLayout);
                    accountConstraints.applyTo(constraintLayout);



                    return true;

                case KeyEvent.KEYCODE_BACK:
                    if(accountpop.getVisibility()==View.VISIBLE||exitpop.getVisibility()==View.VISIBLE)
                    {   accountpop.setVisibility(View.INVISIBLE);
                    exitpop.setVisibility(View.INVISIBLE);
                            if(backmenuelement.equalsIgnoreCase("iptvBtn")){
                                iptvBtn.requestFocus();}
                            if(backmenuelement.equalsIgnoreCase("vodBtn")){
                                vodBtn.requestFocus();}
                            if(backmenuelement.equalsIgnoreCase("vodTvShowBtn")) {
                                vodTvShowBtn.requestFocus();
                            }
                            if(backmenuelement.equalsIgnoreCase("compteBtn")) {
                                compteBtn.requestFocus();
                            }
                            Log.e("Focus",""+backmenuelement);
                            return true;
                    }
                    else if(exitpop.getVisibility()==View.INVISIBLE) {

                        if(vodBtn.hasFocus())
                            backmenuelement="vodBtn";
                        if(iptvBtn.hasFocus())
                            backmenuelement="iptvBtn";
                        if(vodTvShowBtn.hasFocus())
                            backmenuelement="vodTvShowBtn";
                        if(compteBtn.hasFocus())
                            backmenuelement="compteBtn";
                        exitpop.setVisibility(View.VISIBLE);
                        exitmsg.setTypeface(font);
                        exitmsg.setTextSize(getResources().getDimension(R.dimen.exit_text_size));
                        exitmsg.setText("QUITTEZ L'APPLICATION ?");

                        ouibtn.setVisibility(View.VISIBLE);
                        nonbtn.setVisibility(View.VISIBLE);
                        nonbtn.requestFocus();

                    }
                    return true;

                default:
                    rightcount=0;
                    return super.dispatchKeyEvent(event);
            }}
        else{      return super.dispatchKeyEvent(event);}

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
    private class HttpAsyncTask extends AsyncTask<String, Void, JSONObject> {
        @Override
        protected JSONObject doInBackground(String... urls) {

            return GET(urls[0]);
        }
        // onPostExecute displays the results of the AsyncTask.

        @Override
        protected void onPostExecute(JSONObject res) {

            if(res!=null) {

                PackageInfo pInfo = null;
                try {
                    pInfo = MenuActivity.this.getPackageManager().getPackageInfo(getPackageName(), 0);

                    if(res.getInt("currentversion")>pInfo.versionCode) {
                        CustomDialogClass cdd=new CustomDialogClass(MenuActivity.this);
                        cdd.setChangelogmsg("Changement :\n" + res.getString("changelog"));
                        cdd.setCurrentversion("Version Installée :\n" + pInfo.versionName);
                        cdd.setApkUrl(res.getString("apkUrl"));
                        cdd.show();

                        /*AlertDialog.Builder builder = new AlertDialog.Builder(MenuActivity.this);
                        AlertDialog alertDialog = null;
                        // Get the layout inflater
                        LayoutInflater inflater = MenuActivity.this.getLayoutInflater();

                        // Inflate and set the layout for the dialog
                        // Pass null as the parent view because its going in the dialog layout

                        View dialoglayout = inflater.inflate(R.layout.updatedialog, null);
                        TextView changelogtextview = (TextView) dialoglayout.findViewById(R.id.changelog);
                        changelogtextview.setText("Changement :\n" + res.getString("changelog"));
                        TextView currentversion = (TextView) dialoglayout.findViewById(R.id.currentversion);
                        currentversion.setText("Version Installée :\n" + pInfo.versionName);
                        final String apkUrl=res.getString("apkUrl");
                        builder.setView(dialoglayout)
                                // Add action buttons
                                .setPositiveButton("Mettre À Jour", new DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(DialogInterface dialog, int id) {
                                        new DownloadNewVersion().execute(apkUrl);

                                    }
                                })
                                .setNegativeButton("Reporter", new DialogInterface.OnClickListener() {
                                    public void onClick(DialogInterface dialog, int id) {

                                    }
                                });
                        alertDialog = builder.create();
                        alertDialog.show();*/
                    }
                } catch (PackageManager.NameNotFoundException e) {
                    e.printStackTrace();
                } catch (JSONException e) {
                    e.printStackTrace();
                }
            }
        }

    }
    @Override
    protected void onStop() {
        super.onStop();
        Intent intent = new Intent(MenuActivity.this, MyService.class);
        stopService(intent);
    }
    public static void verifyStoragePermissions(Activity activity) {
        // Check if we have write permission
        int permission = ActivityCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE);

        if (permission != PackageManager.PERMISSION_GRANTED) {
            // We don't have permission so prompt the user
            ActivityCompat.requestPermissions(
                    activity,
                    PERMISSIONS_STORAGE,
                    REQUEST_EXTERNAL_STORAGE
            );
        }
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
            Toast.makeText(MenuActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }

}



