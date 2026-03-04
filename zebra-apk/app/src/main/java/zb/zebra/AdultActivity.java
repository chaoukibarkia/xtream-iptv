package zb.zebra;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import androidx.annotation.Nullable;
import androidx.constraintlayout.widget.ConstraintLayout;
import androidx.constraintlayout.widget.Guideline;
import android.text.TextUtils;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.Animation;
import android.view.animation.TranslateAnimation;
import android.widget.AbsListView;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextSwitcher;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.ViewSwitcher;

import androidx.media3.common.C;
import androidx.media3.ui.PlayerView;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.common.Player;
import androidx.media3.common.Timeline;
import androidx.media3.exoplayer.mediacodec.MediaCodecRenderer;
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;
import androidx.media3.exoplayer.source.BehindLiveWindowException;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.exoplayer.dash.DashMediaSource;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.smoothstreaming.SsMediaSource;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.common.util.Util;
import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import cz.msebera.android.httpclient.Header;
import zb.zebra.Util.OnSwipeTouchListener;
import zb.zebra.iptvapplication.BuildConfig;
import zb.zebra.iptvapplication.R;
import zb.zebra.Util.ExternalStorageManager;
import zb.zebra.Util.Utils;
import zb.zebra.iptv.ChannelsAdapter;
import zb.zebra.iptv.Iptvchannel;
import zb.zebra.iptv.ProgrammeItem;
import zb.zebra.iptv.ProgrammesAdapter;
import zb.zebra.iptv.Tvgenre;
import zb.zebra.iptv.TvgenresAdapter;

public class AdultActivity extends Activity implements View.OnClickListener, AdapterView.OnItemSelectedListener{
    public static final String ADULTE_PASS = "adultepass";
    private String video_url;
    private Handler mainHandler;
    private AudioManager am;
    private String userAgent;
    ListView channelListView;
    List<Tvgenre>tvgenres;
    TextSwitcher tvgenreswitcher;
    ConstraintLayout channellistRoot;
    Spinner tvGenreView;
    AsyncHttpClient client = new AsyncHttpClient();
    Long stream_id=-1L;
    List<Iptvchannel>iptvchannels;
    Long category_id=-1L;
    private PlayerView simpleExoPlayerView;
    private ExoPlayer player;
    ChannelsAdapter channelsAdapter;
    private Timeline.Window window;
    private DataSource.Factory mediaDataSourceFactory;
    private DefaultTrackSelector trackSelector;
    private boolean shouldAutoPlay;
    private // BandwidthMeter removed in 2.19;
    TextView channelName;
    TextView currentProg;
    TextView nextProg;
    ImageView channelImage;
    Handler handlCountDown;
    ConstraintLayout epgview;
    // DefaultExtractorsFactory no longer needed = new DefaultExtractorsFactory();
    int channelindex;
    int tvGenreIndex=0;

    private Map<Long,ChannelsAdapter> channelsAdapterMap;
    private boolean inErrorState;
    private int resumeWindow;
    private long resumePosition;
    private Guideline guidelineepg;
    private ListView programmesList;
    private ArrayList<ProgrammeItem> programmes;
    private ProgrammesAdapter programmesAdapter;
    private ConstraintLayout programmelistRoot;
    private ConstraintLayout archiveview;
    private TextView selectedProgramDescription;
    private TextView selectedProgram;
    private ImageView chevrondown;
    private ImageView chevronup;
    ImageView listviewmask;
    String user="";
    String adultepass;

    GridLayout pinbtngrid;
    Typeface font;String pass="";
    String newpass="";
    TextView passinput1;
    TextView passinput2;
    TextView passinput3;
    TextView passinput4;
    private ConstraintLayout changepass;
    private TextView changepasstext;
    private String firstset="";
    private String secondset="";

    private void loadPreferences() {

        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);

        // Get value
        user = settings.getString(ActiveCodeActivity.PREF_UNAME, "");
        adultepass = settings.getString(ADULTE_PASS, "6969");
        pass = settings.getString(ActiveCodeActivity.PREF_PASSWORD, "");

    }
    private MediaSource buildMediaSource(
            Uri uri,
            String overrideExtension,
            @Nullable Handler handler,
            /* listener parameter removed in Media3 */ Object unusedListener) {
        @C.ContentType int type = TextUtils.isEmpty(overrideExtension) ? Util.inferContentType(uri)
                : Util.inferContentType("." + overrideExtension);
        switch (type) {
            case C.CONTENT_TYPE_DASH:
                return new DashMediaSource.Factory(buildDataSourceFactory())
                        .createMediaSource(MediaItem.fromUri(uri));
            case C.CONTENT_TYPE_SS:
                return new SsMediaSource.Factory(buildDataSourceFactory())
                        .createMediaSource(MediaItem.fromUri(uri));
            case C.CONTENT_TYPE_HLS:
                return new HlsMediaSource.Factory(mediaDataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(uri));
            case C.CONTENT_TYPE_OTHER:
                return new ProgressiveMediaSource.Factory(mediaDataSourceFactory)
                        .createMediaSource(MediaItem.fromUri(uri));
            default: {
                throw new IllegalStateException("Unsupported type: " + type);
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_adult);
        channelsAdapterMap=new HashMap<>();
        channellistRoot = (ConstraintLayout) findViewById(R.id.channellistRoot);
        programmelistRoot = (ConstraintLayout) findViewById(R.id.programmelistRoot);
        archiveview = (ConstraintLayout) findViewById(R.id.archiveview);
        changepass = (ConstraintLayout) findViewById(R.id.changepass);
        channelListView = (ListView) findViewById(R.id.channelsList);

        programmesList = (ListView) findViewById(R.id.programmesList);

        loadPreferences();
        tvGenreView = (Spinner) findViewById(R.id.spinner);
        tvgenreswitcher= (TextSwitcher) findViewById(R.id.spinner2);
        changepasstext =(TextView) findViewById(R.id.changepasstext);
        currentProg= (TextView) findViewById(R.id.currentProgram);
        nextProg= (TextView) findViewById(R.id.nextProgram);
        selectedProgram= (TextView) findViewById(R.id.selectedProgram);
        selectedProgramDescription= (TextView) findViewById(R.id.selectedProgramDescription);
        chevrondown=(ImageView)findViewById(R.id.chevrondown);
        chevronup=(ImageView)findViewById(R.id.chevronup);
        listviewmask=(ImageView)findViewById(R.id.listviewmask);
        guidelineepg=(Guideline) findViewById(R.id.guidelineepg);
        handlCountDown = new Handler();
        font = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        epgview = (ConstraintLayout) findViewById(R.id.epgview);
        //sharedPref = AdultActivity.this.getPreferences(Context.MODE_PRIVATE);
        //editor = sharedPref.edit();
        channelindex=0;
        ViewSwitcher.ViewFactory currentvf=new ViewSwitcher.ViewFactory(){

            @Override
            public View makeView() {
                TextView textView = new TextView(AdultActivity.this);
                textView.setTextSize(26);
                textView.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
                textView.setTypeface(font);
                textView.setTextColor(Color.WHITE);

                textView.setTypeface(Typeface.DEFAULT_BOLD);

                return textView;
            }};



        tvgenreswitcher.setFactory(currentvf);


/*        MediaSource mediaSource = new HlsMediaSource(Uri.parse("https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.ts"),
                mediaDataSourceFactory, mainHandler, null);*/
        shouldAutoPlay = true;
        // Media3 data source factory
        mediaDataSourceFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("IPTVAPPLICATION")
                .setConnectTimeoutMs(DefaultHttpDataSource.DEFAULT_CONNECT_TIMEOUT_MILLIS)
                .setReadTimeoutMs(DefaultHttpDataSource.DEFAULT_READ_TIMEOUT_MILLIS)
                .setAllowCrossProtocolRedirects(true);

        simpleExoPlayerView = (PlayerView) findViewById(R.id.surface_view);


        simpleExoPlayerView.setOnTouchListener(new OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {

                return;
            }

            @Override
            public void onSwipeLeft() {

                if (channellistRoot.getVisibility() == View.VISIBLE) {
                    channellistRoot.setVisibility(View.INVISIBLE);
                    SlideToAbove();
                    return;
                }

            }

            @Override
            public void onSwipeUp() {

                return;
            }

            @Override
            public void onSwipeRight() {

                if (channellistRoot.getVisibility() == View.INVISIBLE && programmelistRoot.getVisibility() == View.INVISIBLE ) {
                    channellistRoot.setVisibility(View.VISIBLE);
                    SlideToTop();
                    return;
                }
            }
        });
        trackSelector = new DefaultTrackSelector(this);

        player = new ExoPlayer.Builder(this)
                .setTrackSelector(trackSelector)
                .build();

        simpleExoPlayerView.setPlayer(player);

        player.setPlayWhenReady(shouldAutoPlay);
        player.addListener(new PlayerEventListener());

/*        MediaSource mediaSource = new HlsMediaSource(Uri.parse("https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.ts"),
                mediaDataSourceFactory, mainHandler, null);*/




        font = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        pinbtngrid=findViewById(R.id.pinbtngrid);
        passinput1=(TextView)findViewById(R.id.passinput1);
        passinput2=(TextView)findViewById(R.id.passinput2);
        passinput3=(TextView)findViewById(R.id.passinput3);
        passinput4=(TextView)findViewById(R.id.passinput4);
        for (int i=0;i<pinbtngrid.getChildCount();i++)
        {((Button)pinbtngrid.getChildAt(i)).setTypeface(font);
            ((Button)pinbtngrid.getChildAt(i)).setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    newpass = newpass + view.getTag();
                    Log.e("LENGTH",newpass.length()+"");
                    switch (newpass.length()) {
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
                            if(firstset.equals(""))
                            {
                                passinput1.setVisibility(View.INVISIBLE);
                                passinput2.setVisibility(View.INVISIBLE);
                                passinput3.setVisibility(View.INVISIBLE);
                                passinput4.setVisibility(View.INVISIBLE);
                                firstset=newpass;
                                newpass="";
                                changepasstext.setText("RÉINSERER VOTRE CODE A 4 CHIFFRES");


                            }
                            else  if(newpass.length()==4&&(!firstset.equals(""))){
                                if ((firstset.equals(newpass))) {

                                    adultepass=newpass;
                                    saveNewPass(adultepass);
                                    firstset="";
                                    changepass.setVisibility(View.INVISIBLE);
                                    passinput1.setVisibility(View.INVISIBLE);
                                    passinput2.setVisibility(View.INVISIBLE);
                                    passinput3.setVisibility(View.INVISIBLE);
                                    passinput4.setVisibility(View.INVISIBLE);
                                    newpass="";
                                }
                                else{
                                    newpass="";
                                    passinput1.setVisibility(View.INVISIBLE);
                                    passinput2.setVisibility(View.INVISIBLE);
                                    passinput3.setVisibility(View.INVISIBLE);
                                    passinput4.setVisibility(View.INVISIBLE);
                                    changepasstext.setText("CODE ERRONÉ,INSERER VOTRE CODE A 4 CHIFFRES");
                                    firstset="";
                                }
                            }
                            break;
                        default: {
                        }
                    }
                }
            });}


        channelListView.setOnScrollListener(new AbsListView.OnScrollListener() {

            @Override
            public void onScrollStateChanged(AbsListView view, int scrollState) {

            }

            @Override
            public void onScroll(AbsListView lw, final int firstVisibleItem,
                                 final int visibleItemCount, final int totalItemCount)
            {

                if(lw.getId() == R.id.channelsList)
                {

                        // Make your calculation stuff here. You have all your
                        // needed info from the parameters of this function.

                        // Sample calculation to determine if the last
                        // item is fully visible.
                        final int lastItem = firstVisibleItem + visibleItemCount;

                        if(lastItem == totalItemCount)
                        {
                            Log.d("Last", "Last");
                            listviewmask.setVisibility(View.INVISIBLE);
                            chevrondown.setVisibility(View.INVISIBLE);
                    /*if(preLast!=lastItem)
                    {
                        //to avoid multiple calls for last item
                        Log.d("Last", "Last");
                        preLast = lastItem;
                    }*/
                        }else{
                            listviewmask.setVisibility(View.VISIBLE);
                            chevrondown.setVisibility(View.VISIBLE);
                        }
                        Log.d("firstVisibleItem", firstVisibleItem+"");
                        if(firstVisibleItem!=0){
                            chevronup.setVisibility(View.VISIBLE);
                        }else{chevronup.setVisibility(View.INVISIBLE);}
                }
            }
        });




        getTvgenres();
        channelListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int i, long l) {
                if(channellistRoot.getVisibility()==View.INVISIBLE)
                {   channellistRoot.setVisibility(View.VISIBLE);}
                else if(stream_id==iptvchannels.get(i).getId()){
                    channellistRoot.setVisibility(View.INVISIBLE);
                }
                else{
                    Iptvchannel currentchannel=iptvchannels.get(i);
                    stream_id=currentchannel.getId();


                    player.stop();
                    //editor.putLong("stream_id", stream_id);
                    //editor.putLong("category_id", category_id);
                   // editor.commit();
                    channelindex=i;
                    playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts");
                   // getEpg(stream_id);

                }
            }
        });

        tvgenreswitcher.setOnClickListener(new AdapterView.OnClickListener() {
            @Override
            public void onClick(View view) {
                tvGenreView.performClick();
            }
        });


        //stream_id = sharedPref.getLong("stream_id", 0L);
      /*  if(channelListView.getAdapter()!=null&&channelListView.getAdapter().getCount()>0){
        stream_id = ((Iptvchannel)channelListView.getAdapter().getItem(0)).getId();
        MediaSource mediaSource = buildMediaSource(Uri.parse(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts"), "ts", mainHandler, null);
             player.prepare(mediaSource);
            }*/


    }
    public DataSource.Factory buildDataSourceFactory(/* TransferListener removed in Media3 */) {
        return new DefaultDataSource.Factory(this, buildHttpDataSourceFactory());
    }

    public HttpDataSource.Factory buildHttpDataSourceFactory(
            /* TransferListener removed in Media3 */) {
        return new DefaultHttpDataSource.Factory()
                .setUserAgent(userAgent)
                .setConnectTimeoutMs(DefaultHttpDataSource.DEFAULT_CONNECT_TIMEOUT_MILLIS)
                .setReadTimeoutMs(DefaultHttpDataSource.DEFAULT_READ_TIMEOUT_MILLIS)
                .setAllowCrossProtocolRedirects(true);
    }

    public boolean useExtensionRenderers() {
        return false; // Flavor removed from BuildConfig in namespace gradle
    }

    public void getTvgenres(){

                        tvgenres = new ArrayList<>();
                        tvgenres.add(new Tvgenre(46L,"ADULTE"));

                        TvgenresAdapter tvgenresAdapter=new TvgenresAdapter(tvgenres,AdultActivity.this);
                        tvGenreView.setAdapter(tvgenresAdapter);
                        tvGenreView.setSelection(0);
                        tvGenreView.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                            @Override
                            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                                category_id=46L;
                                getChannels(46L);
                                tvgenreswitcher.setText("Adulte");
                            }

                            @Override
                            public void onNothingSelected(AdapterView<?> parent) {

                                // sometimes you need nothing here
                            }
                        });


    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if((event.getAction() == KeyEvent.ACTION_DOWN)){
            Log.e("KEY",event.getKeyCode()+"");
            switch (event.getKeyCode()) {

                case KeyEvent.KEYCODE_MENU:
                    if(changepass.getVisibility()!=View.INVISIBLE)
                    {changepass.setVisibility(View.INVISIBLE);
                    channelListView.requestFocus();}
                    else {
                        changepasstext.setText("VEUILLEZ INSERER VOTRE CODE A 4 CHIFFRES");
                        firstset="";
                        newpass="";
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        changepass.setVisibility(View.VISIBLE);
                        changepass.requestFocus();
                    }
                    return true;


                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if(changepass.getVisibility()==View.VISIBLE){

                        return super.dispatchKeyEvent(event);}
                    else if(programmelistRoot.getVisibility()==View.VISIBLE) {

                        selectedProgramDescription.setText(programmes.get(programmes.size()>programmesList.getSelectedItemPosition()+1?programmesList.getSelectedItemPosition()+1:programmesList.getSelectedItemPosition()).getDescription());
                        selectedProgram.setText(programmes.get(programmes.size()>programmesList.getSelectedItemPosition()+1?programmesList.getSelectedItemPosition()+1:programmesList.getSelectedItemPosition()).getTitle());
                        return super.dispatchKeyEvent(event);
                    }
                    else if(channellistRoot.getVisibility()==View.VISIBLE) {
                        Log.e("eedf",channelListView.getSelectedItemPosition()+"");
                        if(channelListView.getSelectedItemPosition()==channelListView.getAdapter().getCount()-1){
                            channelListView.setSelection(0);

                            return true;
                        }else
                        {channelListView.setSelection(channelListView.getSelectedItemPosition() + 1);

                            return true;}
                    }
                    else{
                        if(channelListView.getSelectedItemPosition()==channelListView.getAdapter().getCount()-1) {
                            channelListView.setSelection(0);

                            Iptvchannel currentchannel = ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                            stream_id = currentchannel.getId();
                            if (channelindex >= 0)
                                ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                            channelsAdapter.notifyDataSetChanged();
                            Random r = new Random();
                            player.stop();


                            //editor.putLong("stream_id", stream_id);
                            //editor.putLong("category_id", category_id);
                            //editor.commit();
                            channelindex = channelListView.getSelectedItemPosition();
                            playvideo(MainActivity.mainlink+"/live/" + user + "/" + pass + "/" + stream_id + ".ts");
                            return true;
                        }
                        else
                        {channelListView.setSelection(channelListView.getSelectedItemPosition() + 1);
                            Iptvchannel currentchannel = ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                            stream_id = currentchannel.getId();
                            if (channelindex >= 0)
                                ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                            channelsAdapter.notifyDataSetChanged();
                            Random r = new Random();
                            player.stop();


                            //editor.putLong("stream_id", stream_id);
                            //editor.putLong("category_id", category_id);
                            //editor.commit();
                            channelindex = channelListView.getSelectedItemPosition();
                            playvideo(MainActivity.mainlink+"/live/" + user + "/" + pass + "/" + stream_id + ".ts");
                            return true;}
                    }
                case KeyEvent.KEYCODE_DPAD_UP:
                    if(changepass.getVisibility()==View.VISIBLE){
                        return super.dispatchKeyEvent(event);}
                    else if(programmelistRoot.getVisibility()==View.VISIBLE) {
                        selectedProgramDescription.setText(programmes.get(programmesList.getSelectedItemPosition()-1>=0?programmesList.getSelectedItemPosition()-1:programmesList.getSelectedItemPosition()).getDescription());
                        selectedProgram.setText(programmes.get(programmesList.getSelectedItemPosition()-1>=0?programmesList.getSelectedItemPosition()-1:programmesList.getSelectedItemPosition()).getTitle());
                        return super.dispatchKeyEvent(event);
                    }
                    else if(channellistRoot.getVisibility()==View.VISIBLE) {
                        if(channelListView.getSelectedItemPosition()==0){
                            channelListView.setSelection(channelListView.getAdapter().getCount()-1);

                            return true;
                        }else
                        {                 channelListView.setSelection(channelListView.getSelectedItemPosition() - 1);


                            return true;}
                    }
                    else{
                        if(channelListView.getSelectedItemPosition()==0){
                            channelListView.setSelection(channelListView.getAdapter().getCount()-1);

                            Iptvchannel currentchannel=((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                            stream_id=currentchannel.getId();
                            if(channelindex>=0)
                                ((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                            channelsAdapter.notifyDataSetChanged();
                            Random r = new Random();
                            player.stop();


                            //editor.putLong("stream_id", stream_id);
                            //editor.putLong("category_id", category_id);
                            //editor.commit();
                            channelindex=channelListView.getSelectedItemPosition();
                            playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts");
                            return true;
                        }else
                        {                 channelListView.setSelection(channelListView.getSelectedItemPosition() - 1);

                            Iptvchannel currentchannel=((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                            stream_id=currentchannel.getId();
                            if(channelindex>=0)
                                ((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                            channelsAdapter.notifyDataSetChanged();
                            Random r = new Random();
                            player.stop();


                            //editor.putLong("stream_id", stream_id);
                            //editor.putLong("category_id", category_id);
                            //editor.commit();
                            channelindex=channelListView.getSelectedItemPosition();
                            playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts");
                            return true;}
                    }

                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if(changepass.getVisibility()==View.VISIBLE){
                        return super.dispatchKeyEvent(event);}

                    else{
                        tvGenreIndex=((tvGenreView.getSelectedItemPosition()+1<=tvgenres.size()-1)?tvGenreView.getSelectedItemPosition()+1:0);
                        tvGenreView.setSelection(tvGenreIndex);

                    }


                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if(changepass.getVisibility()==View.VISIBLE){
                        return super.dispatchKeyEvent(event);}
                        else if(channellistRoot.getVisibility()==View.VISIBLE) {

                        tvGenreIndex=((tvGenreView.getSelectedItemPosition()-1>=0)?tvGenreView.getSelectedItemPosition()-1:tvgenres.size()-1);
                        tvGenreView.setSelection(tvGenreIndex);


                    }



                    return true;
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_DPAD_CENTER:
                    if(changepass.getVisibility()==View.VISIBLE){
                        return super.dispatchKeyEvent(event);}
                    if(channellistRoot.getVisibility()==View.INVISIBLE&&programmelistRoot.getVisibility()==View.INVISIBLE)
                    {   channellistRoot.setVisibility(View.VISIBLE);SlideToTop();
                        return true;}
                    else if(channelListView.getAdapter()!=null&&stream_id==((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).getId() && ((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).getPlayState()==View.INVISIBLE){
                        channellistRoot.setVisibility(View.INVISIBLE);
                        handlCountDown.postDelayed(SlideToAboveTimer, 2000);
                        return true;
                    }
                    else if(channellistRoot.getVisibility()==View.VISIBLE&&channelListView.getAdapter()!=null){
                        Iptvchannel currentchannel=((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                        stream_id=currentchannel.getId();
                        if(channelindex>=0)
                            ((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                        channelsAdapter.notifyDataSetChanged();
                    Random r = new Random();
                    player.stop();


                        //editor.putLong("stream_id", stream_id);
                        //editor.putLong("category_id", category_id);
                        //editor.commit();
                        channelindex=channelListView.getSelectedItemPosition();
                         playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts");

                        return true;
                    }


                case KeyEvent.KEYCODE_BACK:
                    if(changepass.getVisibility()==View.VISIBLE){
                        changepasstext.setText("VEUILLEZ INSERER VOTRE CODE A 4 CHIFFRES");
                        firstset="";
                        newpass="";
                        passinput1.setVisibility(View.INVISIBLE);
                        passinput2.setVisibility(View.INVISIBLE);
                        passinput3.setVisibility(View.INVISIBLE);
                        passinput4.setVisibility(View.INVISIBLE);
                        changepass.setVisibility(View.INVISIBLE);
                        return true;}
                    else if(channellistRoot.getVisibility()==View.VISIBLE)
                    {channellistRoot.setVisibility(View.INVISIBLE);
                        tvGenreView.setSelection(tvGenreIndex);
                        handlCountDown.postDelayed(SlideToAboveTimer, 2000);
                        return true;}
                    else  if(programmelistRoot.getVisibility()==View.VISIBLE) {
                        programmelistRoot.setVisibility(View.INVISIBLE);archiveview.setVisibility(View.INVISIBLE);return true;
                    }
                    else
                        {
                            return super.dispatchKeyEvent(event);
                        }

                default:
                    return super.dispatchKeyEvent(event);
            }}
        else{      return super.dispatchKeyEvent(event);}

    }


    public void getChannels(){
        getChannels(null);
    }
    private Boolean isItFav(String stream_id) {
        JSONObject cachejsonObject = ExternalStorageManager.readCache(AdultActivity.this);
        if (cachejsonObject.has(String.valueOf(stream_id))) {
            return true;
        }

        return false;
    }
    public void getChannels(final Long tvgenreid){

        if(channelsAdapterMap.containsKey(46L)){
        Log.e("FROM cache",46L+"");
            channelListView.setAdapter(channelsAdapterMap.get(46L));
            channelindex = -1;



        }
        else {
            Log.e("FROM net",46L+"");

            // Use new Xtream API directly - no Bearer token needed
            Log.e("bearer net",MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_live_streams" +"&category_id=" + tvgenreid );

            client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_live_streams" + (tvgenreid != null ? "&category_id=" + tvgenreid : ""), new JsonHttpResponseHandler() {
                @Override
                public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                    iptvchannels = new ArrayList<>();
                    channelindex = -1;
                    Log.e("obj",res.toString());
                    try {

                        for (int i = 0; i < res.length(); i++) {
                            JSONObject obj = (JSONObject) res.get(i);

                            iptvchannels.add(new Iptvchannel(obj.getLong("stream_id"), obj.getString("name"), obj.getString("stream_icon"), isItFav(obj.getString("stream_id")),obj.getLong("category_id")));
                            /*if (obj.getLong("stream_id") == sharedPref.getLong("stream_id", 0L)) {
                                channelindex = i;
                            }*/
                        }
                        channelindex=0;
                        Log.e("channelsAdapter",iptvchannels+"");
                        channelsAdapter = new ChannelsAdapter(iptvchannels, AdultActivity.this);
                        channelsAdapterMap.put(46L,channelsAdapter);
                        channelListView.setAdapter(channelsAdapter);


                    } catch (JSONException e) {
                        e.printStackTrace();
                    }


                }

                @Override
                public void onFailure(int statusCode, Header[] headers, Throwable t,JSONObject jsonObject) {
                    Log.e("error", "Failed to fetch adult channels: " + t.getMessage());
                    checkConnection();
                }
            });
        }


    }

    public void getProgrammes(Long channelid){
        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_simple_data_table&stream_id="+channelid,  new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                        programmes=new ArrayList<>();
                        int focus=0;
                        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd");

                        try {
                            for (int i = 0; i < res.getJSONArray("epg_listings").length(); i++) {
                                JSONObject obj =(JSONObject) res.getJSONArray("epg_listings").get(i);

                                if(fmt.format(new Date()).equals(fmt.format(new Date(obj.getLong("start_timestamp")*1000)))){
                                programmes.add(new ProgrammeItem(obj.getLong("id"),obj.getLong("epg_id"), Utils.decodeBase64(obj.getString("title")),obj.getString("lang"),obj.getString("start"),obj.getString("end"),Utils.decodeBase64(obj.getString("description")),obj.getString("channel_id"),obj.getLong("start_timestamp"),obj.getLong("stop_timestamp")));
                                if(new Date().getTime()>(obj.getLong("stop_timestamp")*1000)) {
                                }
                                else if(new Date().getTime()<(obj.getLong("start_timestamp")*1000)){

                                }
                                else{
                                    focus=programmes.size()-1;
                                }}
                            }
                            programmesAdapter=new ProgrammesAdapter(programmes,AdultActivity.this);
                            programmesList.setAdapter(programmesAdapter);
                            programmesList.setSelection(focus);
                            selectedProgramDescription.setText("");
                            selectedProgram.setText("");
                            if(programmes.size()>0) {
                                selectedProgramDescription.setText(programmes.get(programmesList.getSelectedItemPosition()).getDescription());
                                selectedProgram.setText(programmes.get(programmesList.getSelectedItemPosition()).getTitle());
                            }


                        } catch (JSONException e) {
                            e.printStackTrace();
                        }


                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                        // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                        checkConnection();

                    }
                }
        );



    }

    public void playvideo(String link){

        video_url = link; //video url
        MediaSource mediaSource = buildMediaSource(Uri.parse(video_url),"ts",mainHandler,null);
        player.setPlayWhenReady(true);
        player.addListener(new PlayerEventListener());
        player.prepare(mediaSource);

    }

    private void getEpg(Long stream_id) {
        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_short_epg&stream_id="+stream_id,  new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {

                        try {
                            JSONArray epgs= res.getJSONArray("epg_listings");
                            if (epgs.length()>1) {
                                Timestamp currentstamp = new Timestamp(epgs.getJSONObject(0).getLong("start_timestamp") * 1000);
                                Date currentdate = new Date(currentstamp.getTime());
                                Log.e("current", "" + currentstamp.toString());
                                SimpleDateFormat sdf = new SimpleDateFormat("HH:mm");
                                Timestamp nextstamp = new Timestamp(epgs.getJSONObject(1).getLong("start_timestamp") * 1000);
                                Log.e("next", "" + nextstamp.toString());
                                Date nextdate = new Date(nextstamp.getTime());

                                currentProg.setText(sdf.format(currentdate) + ":" + Utils.decodeBase64(epgs.getJSONObject(0).getString("title")));
                                nextProg.setText(sdf.format(nextdate) + ":" + Utils.decodeBase64(epgs.getJSONObject(1).getString("title")));
                            }
                            else {
                                currentProg.setText("");
                                nextProg.setText("");
                            }
                        } catch (JSONException e) {
                            e.printStackTrace();
                        }
                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                        // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                        currentProg.setText("");
                        nextProg.setText("");
                        checkConnection();
                    }
                }
        );

    }


    public void onClick(View v) {

        //for play and pause
    }

    @Override
    public void onPause ()
    {
        if (player != null)
        {

            player.stop();
        }
        super.onPause();
    }


    @Override
    public void onItemSelected(AdapterView<?> adapterView, View view, int i, long l) {

        String item = adapterView.getItemAtPosition(i).toString();
    }

    @Override
    public void onNothingSelected(AdapterView<?> adapterView) {

    }
    public void SlideToAbove() {

        Animation slide = null;

        slide = new TranslateAnimation(Animation.RELATIVE_TO_SELF, 0.0f,
                Animation.RELATIVE_TO_SELF, 0.0f, Animation.RELATIVE_TO_SELF,
                0.0f, Animation.RELATIVE_TO_SELF, 5.0f);
        //epgview.setVisibility(View.VISIBLE);
        slide.setDuration(5000);
        slide.setFillAfter(true);
        slide.setFillEnabled(true);

        epgview.startAnimation(slide);


        slide.setAnimationListener(new Animation.AnimationListener() {

            @Override
            public void onAnimationStart(Animation animation) {

            }

            @Override
            public void onAnimationRepeat(Animation animation) {
            }

            @Override
            public void onAnimationEnd(Animation animation) {



            }

        });

    }
    public void SlideToTop() {

        Animation slide = null;

        slide = new TranslateAnimation(Animation.RELATIVE_TO_SELF, 0.0f,
                Animation.RELATIVE_TO_SELF, 0.0f, Animation.RELATIVE_TO_SELF,
                5.0f, Animation.RELATIVE_TO_SELF, 0.0f);

        slide.setDuration(500);
        slide.setFillAfter(true);
        slide.setFillEnabled(true);

        epgview.startAnimation(slide);


        slide.setAnimationListener(new Animation.AnimationListener() {

            @Override
            public void onAnimationStart(Animation animation) {

            }

            @Override
            public void onAnimationRepeat(Animation animation) {
            }

            @Override
            public void onAnimationEnd(Animation animation) {



            }

        });

    }
    private Runnable SlideToAboveTimer = new Runnable() {
        @Override
        public void run() {
            SlideToAbove();
        }
    };


    private void showToast(int messageId) {
        showToast(getString(messageId));
    }

    private void showToast(String message) {
        Toast.makeText(getApplicationContext(), message, Toast.LENGTH_LONG).show();
    }

    private static boolean isBehindLiveWindow(PlaybackException e) {
        if (e.errorCode != PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            return false;
        }
        Throwable cause = e.getCause();
        while (cause != null) {
            if (cause instanceof BehindLiveWindowException) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }


    private class PlayerEventListener implements Player.Listener {

        @Override
        public void onPlayerError(PlaybackException e) {
            iptvchannels.get(channelindex).setPlayState(View.VISIBLE);
            channelsAdapter.notifyDataSetChanged();
            String errorString = null;
            
            // Media3 simplified error handling
            Throwable cause = e.getCause();
            if (cause instanceof MediaCodecRenderer.DecoderInitializationException) {
                // Special case for decoder initialization failures.
                MediaCodecRenderer.DecoderInitializationException decoderInitializationException =
                        (MediaCodecRenderer.DecoderInitializationException) cause;
                if (decoderInitializationException.codecInfo == null) {
                    if (decoderInitializationException.getCause() instanceof MediaCodecUtil.DecoderQueryException) {
                        errorString = getString(R.string.error_querying_decoders);
                    } else if (decoderInitializationException.secureDecoderRequired) {
                        errorString = getString(R.string.error_no_secure_decoder,
                                decoderInitializationException.mimeType);
                    } else {
                        errorString = getString(R.string.error_no_decoder,
                                decoderInitializationException.mimeType);
                    }
                } else {
                    errorString = getString(R.string.error_instantiating_decoder,
                            decoderInitializationException.codecInfo.name);
                }
            }
            
            if (errorString != null) {
                showToast(errorString);
            }
            inErrorState = true;
            if (isBehindLiveWindow(e)) {
                clearResumePosition();
               // initializePlayer();
            }
        }


    }


    private void releasePlayer() {
        if (player != null) {
            shouldAutoPlay = player.getPlayWhenReady();
            updateResumePosition();
            player.release();
            player = null;
            trackSelector = null;

        }
    }

    private void updateResumePosition() {
        resumeWindow = player.getCurrentWindowIndex();
        resumePosition = Math.max(0, player.getContentPosition());
    }

    private void clearResumePosition() {
        resumeWindow = C.INDEX_UNSET;
        resumePosition = C.TIME_UNSET;
    }

    private void saveNewPass(String newpass) {
        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = settings.edit();

        editor.putString(ADULTE_PASS, newpass);
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
            Toast.makeText(AdultActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }
}
