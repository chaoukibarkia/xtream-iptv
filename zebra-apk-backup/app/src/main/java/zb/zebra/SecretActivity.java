package zb.zebra;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.GridLayout;
import android.widget.TextView;

import zb.zebra.iptvapplication.R;

public class SecretActivity extends AppCompatActivity {
    GridLayout pinbtngrid;
    Typeface font;String pass="";
    String adultpass="";
    TextView passinput1;
    TextView passinput2;
    TextView passinput3;
    TextView passinput4;
    android.support.constraint.ConstraintLayout secretmain;
    private void loadPreferences() {

        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);

        // Get value

        adultpass = settings.getString(AdultActivity.ADULTE_PASS, "6969");


    }
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        overridePendingTransition(R.anim.slide_in, R.anim.slide_out);
        setContentView(R.layout.activity_secret);
        loadPreferences();
        font = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        pinbtngrid=findViewById(R.id.pinbtngrid);
        passinput1=(TextView)findViewById(R.id.passinput1);
        passinput2=(TextView)findViewById(R.id.passinput2);
        passinput3=(TextView)findViewById(R.id.passinput3);
        passinput4=(TextView)findViewById(R.id.passinput4);
        secretmain=findViewById(R.id.secretmain);
        for (int i=0;i<pinbtngrid.getChildCount();i++)
        {((Button)pinbtngrid.getChildAt(i)).setTypeface(font);
            ((Button)pinbtngrid.getChildAt(i)).setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    pass = pass + view.getTag();
                    Log.e("LENGTH",pass.length()+"");
                    switch (pass.length()) {
                        case 1:
                            passinput1.setVisibility(View.VISIBLE);
                            break;
                        case 2:
                            passinput2.setVisibility(View.VISIBLE);
                            break;
                        case 3:
                            passinput3.setVisibility(View.VISIBLE);
                            break;
                        case 4:
                            passinput4.setVisibility(View.VISIBLE);
                            if(!pass.equalsIgnoreCase(adultpass))
                            {
                                    passinput1.setVisibility(View.INVISIBLE);
                                    passinput2.setVisibility(View.INVISIBLE);
                                    passinput3.setVisibility(View.INVISIBLE);
                                    passinput4.setVisibility(View.INVISIBLE);
                                    pass="";
                            }
                            else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                                startActivity(adulteIntent);}
                            break;
                        default: {
                        }
                    }
                }
            });}
            secretmain.setOnTouchListener(new zb.zebra.Util.OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {

                return;
            }

            @Override
            public void onSwipeLeft() {


            }

            @Override
            public void onSwipeUp() {

                return;
            }

            @Override
            public void onSwipeRight() {
                            onBackPressed();

            }
        });
    }
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if((event.getAction() == KeyEvent.ACTION_DOWN)){
            Log.e("KEY",event.getKeyCode()+"");
            switch (event.getKeyCode()) {



                case KeyEvent.KEYCODE_NUMPAD_1:
                case KeyEvent.KEYCODE_1:
                    pass = pass + "1";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    }
                    else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_2:
                case KeyEvent.KEYCODE_2:
                    pass = pass + "2";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_3:
                case KeyEvent.KEYCODE_3:
                    pass = pass + "3";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_4:
                case KeyEvent.KEYCODE_4:
                    pass = pass + "4";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_5:
                case KeyEvent.KEYCODE_5:
                    pass = pass + "5";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_6:
                case KeyEvent.KEYCODE_6:
                    pass = pass + "6";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_7:
                case KeyEvent.KEYCODE_7:
                    pass = pass + "7";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_8:
                case KeyEvent.KEYCODE_8:
                    pass = pass + "8";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                case KeyEvent.KEYCODE_NUMPAD_9:
                case KeyEvent.KEYCODE_9:
                    pass = pass + "9";
                    if(pass.length()==4&&!pass.equalsIgnoreCase(adultpass))
                    {
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        pass="";
                    } else if(pass.length()==1)
                    {
                        passinput1.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==2)
                    {
                        passinput2.setVisibility(View.VISIBLE);

                    }
                    else if(pass.length()==3)
                    {
                        passinput3.setVisibility(View.VISIBLE);

                    }

                    else  if(pass.length()==4&&pass.equalsIgnoreCase(adultpass)){
                        Intent adulteIntent=new Intent(SecretActivity.this,AdultActivity.class);
                        startActivity(adulteIntent);
                    }
                    return super.dispatchKeyEvent(event);
                default:

                    return super.dispatchKeyEvent(event);
            }}
        else{      return super.dispatchKeyEvent(event);}

    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(R.anim.slide_in_left,R.anim.slide_out_right);
    }

    @Override
    public void onBackPressed() {
        finish();
    }


}
