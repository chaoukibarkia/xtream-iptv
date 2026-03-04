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
import androidx.constraintlayout.widget.ConstraintSet;
import androidx.constraintlayout.widget.Guideline;
import androidx.transition.TransitionManager;
import android.text.TextUtils;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.AbsListView;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextSwitcher;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.ViewSwitcher;
import android.view.MotionEvent;

import com.bumptech.glide.Glide;
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
import androidx.media3.common.TrackGroup;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.dash.DashMediaSource;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.smoothstreaming.SsMediaSource;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.exoplayer.trackselection.MappingTrackSelector;
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
import java.util.Timer;
import java.util.TimerTask;

import cz.msebera.android.httpclient.Header;
import zb.zebra.Util.IPTVTrackSelectionHelper;
import zb.zebra.Util.OnSwipeTouchListener;
import zb.zebra.Util.TrackSelectionHelper;
import zb.zebra.iptv.Country;
import zb.zebra.iptv.CountrysAdapter;
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

public class IptvActivity extends Activity implements View.OnClickListener, AdapterView.OnItemSelectedListener{
    private String video_url;
    private Handler mainHandler;
    private AudioManager am;
    private String userAgent;
    ListView channelListView;
    ListView countrysListView;
    List<Tvgenre> tvgenres;
    TextSwitcher tvgenreswitcher;
    ConstraintLayout channellistRoot;
    ConstraintLayout countryside;
    ImageView leftarrow;
    ImageView rightarrow;
    Spinner tvGenreView;
    AsyncHttpClient client = new AsyncHttpClient();
    Long stream_id=-1L;
    String iptvparent="-1";
    List<Country> countryList;
    List<Iptvchannel>iptvchannels;
    Long category_id=-1L;
    private PlayerView simpleExoPlayerView;
    private ExoPlayer player;
    ChannelsAdapter channelsAdapter;
    CountrysAdapter countrysAdapter;
    private Timeline.Window window;
    private DataSource.Factory mediaDataSourceFactory;
    private DefaultTrackSelector trackSelector;
    private boolean shouldAutoPlay;
    private // BandwidthMeter removed in 2.19;
    TextView currentProg;
    TextView nextProg;
    Handler handlCountDown;
    ConstraintLayout epgview;
    // DefaultExtractorsFactory no longer needed = new DefaultExtractorsFactory();
    SharedPreferences sharedPref;
    SharedPreferences.Editor editor;
    int channelindex;
    int tvGenreIndex=0;
    Boolean barposition=false;
    LinearLayout badsignal;
    LinearLayout disconnected;
    ImageView channelLogo;
    ImageView audioIcon;
    ImageView subtitleIcon;
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
    private ConstraintLayout iptvconstraint;

    private TextView selectedProgramDescription;
    private TextView selectedProgram;
    private Date lastdate;
    private ConstraintSet originalConstraints = new ConstraintSet();
    private ConstraintSet archiveviewConstraints = new ConstraintSet();
    private ConstraintSet categoriesConstraints = new ConstraintSet();
    private ConstraintSet categoriesClosedConstraints = new ConstraintSet();
    private ConstraintSet archiveviewClosedConstraints = new ConstraintSet();
    private boolean archiveviewzoomed = false;
    ImageView listviewmask;

    Typeface font;
    Typeface fontbold;
    private ImageView chevrondown;
    private ImageView programmelistchevrondown;
    private ImageView chevronup;
    private int selectedcategorieIndex=-1;
    private TextView programmeLabel;
    String user="";
    String pass="";
    private ArrayList<Iptvchannel> allchannels;
    private ArrayList<Iptvchannel> favs;
    private int retry=0;
    private TextView nextProgtime;
    private Long selected_country_id=0L;
    private Long selected_category_id;
    Handler h = new Handler();
    private LinearLayout audiomenulist;
    private LinearLayout subtitlemenulist;
    private LinearLayout audiosubmenu;
    private Button audiomenubtn;
    private Button subtitlemenubtn;
    private IPTVTrackSelectionHelper trackSelectionHelper;
    private void loadPreferences() {

        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);

        // Get value
        user = settings.getString(ActiveCodeActivity.PREF_UNAME, "");
        pass = settings.getString(ActiveCodeActivity.PREF_PASSWORD, "");


    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final Handler handler = new Handler();
        Timer    playertimer = new Timer();
        TimerTask doAsynchronousTask = new TimerTask() {
            @Override
            public void run() {
                handler.post(new Runnable() {
                    @SuppressWarnings("unchecked")
                    public void run() {
                        try {

                            if(player.getPlaybackState()==Player.STATE_ENDED){
                                Log.e("checking player",":"+MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts");
                                playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts");
                                if(channelListView.getSelectedItem()!=null) {
                                    Glide.with(IptvActivity.this).load(((Iptvchannel) channelListView.getSelectedItem()).getImage()).into(channelLogo);
                                    channelLogo.setVisibility(View.VISIBLE);
                                }
                                h.removeCallbacksAndMessages(null);
                                h.postDelayed(new Runnable() {

                                    @Override
                                    public void run() {
                                        // EITHER HIDE IT IMMEDIATELY
                                        channelLogo.setVisibility(View.GONE);
                                    }
                                }, 3000); // 3 seconds

                            }                        }
                        catch (Exception e) {
                            // TODO Auto-generated catch block
                        }
                    }
                });
            }
        };
        playertimer.scheduleAtFixedRate(doAsynchronousTask, 3000l, 3000l);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_iptv_categories_open);

        loadPreferences();


        font = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        fontbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Medium.ttf");
        channelLogo= findViewById(R.id.channelLogo);
        badsignal=(LinearLayout)findViewById(R.id.badsignal);
        disconnected=(LinearLayout)findViewById(R.id.disconnected);
        channelsAdapterMap=new HashMap<>();
        channellistRoot = (ConstraintLayout) findViewById(R.id.channellistRoot);
        countryside = (ConstraintLayout) findViewById(R.id.countryside);
        programmelistRoot = (ConstraintLayout) findViewById(R.id.programmelistRoot);

        leftarrow = findViewById(R.id.leftarrow);
        rightarrow = findViewById(R.id.rightarrow);
        programmeLabel = (TextView) findViewById(R.id.textView4);
        programmeLabel.setTextSize(26);
        programmeLabel.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        programmeLabel.setTypeface(font);
        programmeLabel.setTextColor(Color.WHITE);

        programmeLabel.setTypeface(Typeface.DEFAULT_BOLD);
        iptvparent = getIntent().getStringExtra("iptvparent");
        archiveview = (ConstraintLayout) findViewById(R.id.archiveview);
        channelListView = (ListView) findViewById(R.id.channelsList);
        countrysListView = (ListView) findViewById(R.id.countryList);
        programmesList = (ListView) findViewById(R.id.programmesList);

        audiomenulist=(LinearLayout) findViewById(R.id.audiomenu);
        subtitlemenulist=(LinearLayout) findViewById(R.id.subtitlemenu);
        audiosubmenu =(LinearLayout) findViewById(R.id.audiosubmenu);
        tvGenreView = (Spinner) findViewById(R.id.spinner);
        tvgenreswitcher= (TextSwitcher) findViewById(R.id.spinner2);

        currentProg= (TextView) findViewById(R.id.currentProgram);
        nextProg= (TextView) findViewById(R.id.nextProgram);
        currentProg.setSelected(true);
        nextProg.setSelected(true);
        nextProgtime= (TextView) findViewById(R.id.nextProgtime);
        currentProg.setTypeface(fontbold);
        nextProgtime.setTypeface(font);
        nextProg.setTypeface(fontbold);
        selectedProgram= (TextView) findViewById(R.id.selectedProgram);
        selectedProgramDescription= (TextView) findViewById(R.id.selectedProgramDescription);


        guidelineepg=(Guideline) findViewById(R.id.guidelineepg);
        handlCountDown = new Handler();
        epgview = (ConstraintLayout) findViewById(R.id.epgview);
        sharedPref = IptvActivity.this.getPreferences(Context.MODE_PRIVATE);
        editor = sharedPref.edit();
        channelindex=0;
        audioIcon = findViewById(R.id.audioIcon);
        subtitleIcon = findViewById(R.id.subtitleIcon);

        iptvconstraint= (ConstraintLayout) findViewById(R.id.iptvconstraint);
        originalConstraints.clone(this, R.layout.activity_iptv);
        categoriesConstraints.clone(this, R.layout.activity_iptv_categories_open);
        categoriesClosedConstraints.clone(this, R.layout.activity_iptv_categories_closed);
        archiveviewConstraints.clone(this, R.layout.activity_iptv_epg);
        archiveviewClosedConstraints.clone(this, R.layout.activity_iptv_epg_closed);

        listviewmask=(ImageView)findViewById(R.id.listviewmask);
        chevrondown=(ImageView)findViewById(R.id.chevrondown);
        programmelistchevrondown=(ImageView)findViewById(R.id.programmelistchevrondown);
        chevronup=(ImageView)findViewById(R.id.chevronup);
        ViewSwitcher.ViewFactory currentvf=new ViewSwitcher.ViewFactory(){

            @Override
            public View makeView() {
                TextView textView = new TextView(IptvActivity.this);
                textView.setTextSize(getResources().getDimension(R.dimen.tvgenresizen));
                textView.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
                textView.setTypeface(font);
                textView.setTextColor(Color.WHITE);

                textView.setTypeface(Typeface.DEFAULT_BOLD);

                return textView;
            }};
        tvgenreswitcher.setFactory(currentvf);


        shouldAutoPlay = true;
        // Media3 data source factory
        mediaDataSourceFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("IPTVAPPLICATION")
                .setConnectTimeoutMs(DefaultHttpDataSource.DEFAULT_CONNECT_TIMEOUT_MILLIS)
                .setReadTimeoutMs(DefaultHttpDataSource.DEFAULT_READ_TIMEOUT_MILLIS)
                .setAllowCrossProtocolRedirects(true);

        simpleExoPlayerView = (PlayerView) findViewById(R.id.surface_view);

        // Media3 track selector initialization
        trackSelector = new DefaultTrackSelector(this);
        trackSelectionHelper = new IPTVTrackSelectionHelper(trackSelector, this);

        audiomenubtn=findViewById(R.id.iptvaudiobtn);
        audiomenubtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if(player != null && player.getCurrentTracks() != null && !player.getCurrentTracks().isEmpty()) {
                    audiosubmenu.setVisibility(View.INVISIBLE);
                    audiomenulist.removeAllViews();
                    audiomenulist.addView(trackSelectionHelper.buildView(
                            IptvActivity.this, C.TRACK_TYPE_AUDIO, player.getCurrentTracks(),(ConstraintLayout) findViewById(R.id.iptvconstraint),"audio"));
                    audiomenulist.setVisibility(View.VISIBLE);
                    audiomenulist.requestFocus();
                    subtitlemenulist.setVisibility(View.INVISIBLE);


                }
            }
        });
        subtitlemenubtn=findViewById(R.id.iptvsubbtn);
        subtitlemenubtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if(player != null && player.getCurrentTracks() != null && !player.getCurrentTracks().isEmpty()) {
                    audiosubmenu.setVisibility(View.INVISIBLE);
                    subtitlemenulist.removeAllViews();
                    subtitlemenulist.addView(trackSelectionHelper.buildView(
                            IptvActivity.this, C.TRACK_TYPE_TEXT, player.getCurrentTracks(),(ConstraintLayout) findViewById(R.id.iptvconstraint),"subtitle"));
                    subtitlemenulist.setVisibility(View.VISIBLE);
                    subtitlemenulist.requestFocus();
                    audiomenulist.setVisibility(View.INVISIBLE);


                }
            }
        });


        player = new ExoPlayer.Builder(this)
                .setTrackSelector(trackSelector)
                .build();

        simpleExoPlayerView.setPlayer(player);
        simpleExoPlayerView.setOnTouchListener(new OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {
               
                return;
            }

            @Override
            public void onSwipeLeft() {

                if (countryside.getVisibility() == View.VISIBLE ) {
                    countryside.setVisibility(View.INVISIBLE);
                    return;
                }else if (channellistRoot.getVisibility() == View.VISIBLE) {
                    channellistRoot.setVisibility(View.INVISIBLE);
                    SlideToAbove();
                    return;
                }
                else if (programmelistRoot.getVisibility() == View.INVISIBLE && channellistRoot.getVisibility() == View.INVISIBLE) {
                    programmelistRoot.setVisibility(View.VISIBLE);
                    getProgrammes(stream_id);
                    archiveview.setVisibility(View.VISIBLE);


                    ConstraintLayout.LayoutParams params = (ConstraintLayout.LayoutParams) guidelineepg.getLayoutParams();
                    ValueAnimator anim = ValueAnimator.ofFloat(params.guidePercent, 0.77f);
                    anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                        @Override
                        public void onAnimationUpdate(ValueAnimator valueAnimator) {
                            float val = (Float) valueAnimator.getAnimatedValue();
                            ConstraintLayout.LayoutParams layoutParams = (ConstraintLayout.LayoutParams) guidelineepg.getLayoutParams();
                            layoutParams.guidePercent = val;
                            guidelineepg.setLayoutParams(layoutParams);
                        }
                    });
                    anim.setDuration(2);
                    anim.start();
                    return;
                }
            }

            @Override
            public void onSwipeUp() {
                
                return;
            }

            @Override
            public void onSwipeRight() {

                if (channellistRoot.getVisibility() == View.VISIBLE && countryside.getVisibility() == View.INVISIBLE ) {
                    countryside.setVisibility(View.VISIBLE);
                    return;
                }else if (channellistRoot.getVisibility() == View.INVISIBLE && programmelistRoot.getVisibility() == View.INVISIBLE ) {
                    channellistRoot.setVisibility(View.VISIBLE);
                    SlideToTop();
                    return;
                }else if (programmelistRoot.getVisibility() == View.VISIBLE) {
                    programmelistRoot.setVisibility(View.INVISIBLE);
                        archiveview.setVisibility(View.INVISIBLE);
                    return;
                }
            }
        });

        tvGenreView.setOnTouchListener(new OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {
               
                return;
            }

            @Override
            public void onSwipeLeft() {
                
                tvGenreIndex=((tvGenreView.getSelectedItemPosition()+1<=tvgenres.size()-1)?tvGenreView.getSelectedItemPosition()+1:0);
                tvGenreView.setSelection(tvGenreIndex);
                handlCountDown.removeCallbacks(getepgTimer);
                handlCountDown.postDelayed(getepgTimer, 200);
                return;
            }

            @Override
            public void onSwipeUp() {
                
                return;
            }

            @Override
            public void onSwipeRight() {
                
                tvGenreIndex=((tvGenreView.getSelectedItemPosition()-1>=0)?tvGenreView.getSelectedItemPosition()-1:tvgenres.size()-1);
                tvGenreView.setSelection(tvGenreIndex);

                handlCountDown.removeCallbacks(getepgTimer);
                handlCountDown.postDelayed(getepgTimer, 200);
                return;
            }
        });
        channelListView.setOnTouchListener(new OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {
               
                return;
            }

            @Override
            public void onSwipeLeft() {
                
                tvGenreIndex=((tvGenreView.getSelectedItemPosition()+1<=tvgenres.size()-1)?tvGenreView.getSelectedItemPosition()+1:0);
                tvGenreView.setSelection(tvGenreIndex);
                handlCountDown.removeCallbacks(getepgTimer);
                handlCountDown.postDelayed(getepgTimer, 200);
                return;
            }

            @Override
            public void onSwipeUp() {
                
                return;
            }

            @Override
            public void onSwipeRight() {
                
                tvGenreIndex=((tvGenreView.getSelectedItemPosition()-1>=0)?tvGenreView.getSelectedItemPosition()-1:tvgenres.size()-1);
                tvGenreView.setSelection(tvGenreIndex);

                handlCountDown.removeCallbacks(getepgTimer);
                handlCountDown.postDelayed(getepgTimer, 200);
                return;
            }
        });
        player.setPlayWhenReady(shouldAutoPlay);
        player.addListener(new PlayerEventListener());


        getCountries();
        countrysListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int i, long l) {
                if(selected_country_id!=countryList.get(i).getId()) {
                    selected_country_id = countryList.get(i).getId();
                    getTvgenres(countryList.get(i).getId());
                }
                else{
                    countryside.setVisibility(View.INVISIBLE);
                }
            }
        });
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
                    editor.putLong("stream_id", stream_id);
                    editor.putLong("category_id", category_id);
                    editor.putLong("country_id", selected_country_id);

                    editor.commit();
                    channelindex=i;
                    playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/"+stream_id+".ts ");
                    getEpg(stream_id);
                    if(channelListView.getSelectedItem()!=null) {
                        Glide.with(IptvActivity.this).load(((Iptvchannel) channelListView.getSelectedItem()).getImage()).into(channelLogo);
                        channelLogo.setVisibility(View.VISIBLE);
                    }
                    h.removeCallbacksAndMessages(null);
                    h.postDelayed(new Runnable() {

                        @Override
                        public void run() {
                            // EITHER HIDE IT IMMEDIATELY
                            channelLogo.setVisibility(View.GONE);
                        }
                    }, 3000); // 3 seconds

                }

            }
        });






        programmesList.setOnScrollListener(new AbsListView.OnScrollListener() {

            @Override
            public void onScrollStateChanged(AbsListView view, int scrollState) {

            }

            @Override
            public void onScroll(AbsListView lw, final int firstVisibleItem,
                                 final int visibleItemCount, final int totalItemCount)
            {

                int id = lw.getId();
                if (id == R.id.programmesList) {

                    // Make your calculation stuff here. You have all your
                    // needed info from the parameters of this function.

                    // Sample calculation to determine if the last
                    // item is fully visible.
                    final int lastprogrammeItem = firstVisibleItem + visibleItemCount;

                    if(lastprogrammeItem == totalItemCount)
                    {
                        Log.d("Last", "Last");
                        programmelistchevrondown.setVisibility(View.INVISIBLE);
                /*if(preLast!=lastItem)
                {
                    //to avoid multiple calls for last item
                    Log.d("Last", "Last");
                    preLast = lastItem;
                }*/
                    }else{

                        programmelistchevrondown.setVisibility(View.VISIBLE);
                    }

                }
            }
        });
channelListView.setOnScrollListener(new AbsListView.OnScrollListener() {

    @Override
    public void onScrollStateChanged(AbsListView view, int scrollState) {

    }

    @Override
    public void onScroll(AbsListView lw, final int firstVisibleItem,
                         final int visibleItemCount, final int totalItemCount)
    {

        int id = lw.getId();
        if (id == R.id.channelsList) {

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
        } else if (id == R.id.programmesList) {

            // Make your calculation stuff here. You have all your
            // needed info from the parameters of this function.

            // Sample calculation to determine if the last
            // item is fully visible.
            final int lastprogrammeItem = firstVisibleItem + visibleItemCount;

            if(lastprogrammeItem == totalItemCount)
            {
                Log.d("Last", "Last");
                programmelistchevrondown.setVisibility(View.INVISIBLE);
                    /*if(preLast!=lastItem)
                    {
                        //to avoid multiple calls for last item
                        Log.d("Last", "Last");
                        preLast = lastItem;
                    }*/
            }else{

                programmelistchevrondown.setVisibility(View.VISIBLE);
            }

        }
    }
});


        tvgenreswitcher.setOnClickListener(new AdapterView.OnClickListener() {
            @Override
            public void onClick(View view) {
                tvGenreView.performClick();
            }
        });

        stream_id = sharedPref.getLong("stream_id", 0L);
        if(stream_id!=0L&&stream_id!=-1L) {
            MediaSource mediaSource = buildMediaSource(Uri.parse(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts"),"ts",mainHandler,null);
            /*MediaSource mediaSource = new HlsMediaSource(Uri.parse(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts"),
                    mediaDataSourceFactory, mainHandler, null);*/

            player.prepare(mediaSource);
        }

        channellistRoot.setVisibility(View.INVISIBLE);
        lastdate=new Date();
        barposition=true;
        SlideToAbove();

        archiveview.setOnTouchListener(new OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {
                archiveviewzoomed = false;
                TransitionManager.beginDelayedTransition(iptvconstraint);
                archiveviewClosedConstraints.applyTo(iptvconstraint);
                return;
            }

            @Override
            public void onSwipeLeft() {

            }

            @Override
            public void onSwipeUp() {
                archiveviewzoomed = true;
                TransitionManager.beginDelayedTransition(iptvconstraint);
                archiveviewConstraints.applyTo(iptvconstraint);
                return;
            }

            @Override
            public void onSwipeRight() {

            }
        });
        countrysListView.requestFocus();
        channellistRoot.setVisibility(View.VISIBLE);


    }

    private MediaSource buildMediaSource(
            Uri uri,
            String overrideExtension,
            @Nullable Handler handler,
            /* listener parameter removed in Media3 */ Object unusedListener) {
        @C.ContentType int type = TextUtils.isEmpty(overrideExtension) ? Util.inferContentType(uri)
                : Util.inferContentType("." + overrideExtension);
        Log.e("LINK", String.valueOf(uri));
        switch (type) {
            case C.CONTENT_TYPE_DASH:
                return new DashMediaSource.Factory(buildDataSourceFactory())
                        .createMediaSource(MediaItem.fromUri(uri));
            case C.CONTENT_TYPE_SS:
                return new SsMediaSource.Factory(buildDataSourceFactory())
                        .createMediaSource(MediaItem.fromUri(uri));
            case C.CONTENT_TYPE_HLS:
                System.out.println("HEEERERERER" );
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
        return false; // BuildConfig.FLAVOR not available with namespace
    }

    public void getCountries(){


        client.get(Uri.encode("https://www.machinevaisselle.tn/auth/loginservice/login?username='zebra'&password='ZebR@++2020'"), new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                        String bearer="";
                        try {
                            Log.e("value",res.getString("value"));

                            bearer=res.getString("value");
                        } catch (JSONException e) {
                            e.printStackTrace();
                        }
                        client.addHeader("Accept", "application/json");
                        client.addHeader("Authorization", "Bearer " + bearer);
                        Log.e("bearer net",bearer+"");
                        client.get(Uri.encode("https://machinevaisselle.tn/api/stream_categories?$filter=category_type eq 'live' and parent_id eq 0 and flag ne null&$orderby=cat_order asc"), new JsonHttpResponseHandler() {
                                    @Override
                                    public void onSuccess(int statusCode, Header[] headers, JSONObject result) {


                                        countryList=new ArrayList<>();
                                        try {
                                            JSONArray res=result.getJSONArray("value");

                                            for (int i = 0; i < res.length(); i++) {

                                                JSONObject obj =(JSONObject) res.get(i);
                                                countryList.add(new Country(obj.getLong("id"),obj.getString("category_name"),obj.getString("flag").replace("http://","https://")));
                                                Log.e("data", obj.toString());
                                            }
                                             countrysAdapter = new CountrysAdapter(countryList, IptvActivity.this);

                                            countrysListView.setAdapter(countrysAdapter);
                                            countrysAdapter.notifyDataSetChanged();
                                            int selectedcountryIndex=0;
                                            for (int i = 0; i < countryList.size(); i++) {


                                                if (countryList.get(i).getId() == sharedPref.getLong("country_id", 0L)) {
                                                    selectedcountryIndex=i;
                                                    selected_country_id=countryList.get(i).getId();
                                                }
                                            }
                                            if(sharedPref.getLong("country_id", 0L)==selected_country_id){}
                                            else{
                                                selected_country_id=countryList.get(0).getId();
                                            }
                                            countrysListView.setSelection(selectedcountryIndex);
                                            getTvgenres(countryList.get(selectedcountryIndex).getId());

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

                    @Override
                    public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                        // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                        Log.e("error",t.getStackTrace().toString());
                        checkConnection();

                    }
                }
        );
    }


    public void getTvgenres(final Long iptvparent){


        client.get(Uri.encode("https://www.machinevaisselle.tn/auth/loginservice/login?username='zebra'&password='ZebR@++2020'"), new JsonHttpResponseHandler() {
            @Override
            public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                String bearer="";
                try {
                    bearer=res.getString("value");
                } catch (JSONException e) {
                    e.printStackTrace();
                }
                client.addHeader("Accept", "application/json");
                client.addHeader("Authorization", "Bearer " + bearer);
                client.get(Uri.encode("https://machinevaisselle.tn/api/stream_categories?$filter=category_type eq 'live'&$orderby=cat_order asc"), new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject result) {


                        disconnected.setVisibility(View.INVISIBLE);
                        tvgenres = new ArrayList<>();
                        tvgenres.add(new Tvgenre(-1L, "FAVORIS"));

                        try {
                            JSONArray res=result.getJSONArray("value");
                            for (int i = 0; i < res.length(); i++) {

                                JSONObject obj =(JSONObject) res.get(i);
                                if(iptvparent>0) {
                                    Log.e("data", obj.getString("parent_id"));
                                    Log.e("data", String.valueOf((obj.getLong("parent_id")==(iptvparent))));
                                    if (obj.getLong("parent_id")==iptvparent){
                                        Log.e("category",obj.getString("category_name"));
                                        if ((!obj.getString("category_name").equalsIgnoreCase("For Adults") && obj.getLong("id") != 46L) && obj.getLong("id") != 1) {
                                            tvgenres.add(new Tvgenre(obj.getLong("id"), obj.getString("category_name")));
                                        }
                                    }
                                }
                                    else{
                                        if ((!obj.getString("category_name").equalsIgnoreCase("For Adults") && obj.getLong("id") != 46L) && obj.getLong("id") != 1&&obj.getString("category_type").equalsIgnoreCase("live")&& obj.getLong("parent_id") != 0L) {
                                            tvgenres.add(new Tvgenre(obj.getLong("id"), obj.getString("category_name")));
                                        }
                                    }



                            }
                            for (int i = 0; i < tvgenres.size(); i++) {


                                if (tvgenres.get(i).getId() == sharedPref.getLong("category_id", 0L)) {
                                    tvGenreIndex = i;

                                    selectedcategorieIndex=i;
                                }
                            }

                        } catch (JSONException e) {
                            e.printStackTrace();
                        }
                        if(tvGenreIndex==0&&tvgenres.size()>1||tvGenreIndex>tvgenres.size()-1){tvGenreIndex=1;}
                        TvgenresAdapter tvgenresAdapter=new TvgenresAdapter(tvgenres,IptvActivity.this);
                        tvGenreView.setAdapter(tvgenresAdapter);
                        if(tvGenreIndex==0&&tvgenres.size()>1)
                        {tvGenreView.setSelection(1);}else{
                        tvGenreView.setSelection(tvGenreIndex);}
                        if (tvgenres.size() > 1) {
                            leftarrow.setVisibility(View.VISIBLE);
                            rightarrow.setVisibility(View.VISIBLE);
                        } else {
                            leftarrow.setVisibility(View.INVISIBLE);
                            rightarrow.setVisibility(View.INVISIBLE);
                        }
                        tvGenreView.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                            @Override
                            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                                category_id=tvgenres.get(position).getId();
                                getChannels(tvgenres.get(position).getId());
                                tvgenreswitcher.setText(tvgenres.get(position).getName());
                            }

                            @Override
                            public void onNothingSelected(AdapterView<?> parent) {

                                // sometimes you need nothing here
                            }
                        });
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                            // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                            checkConnection();

                        }
                    }
            );
                }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                            // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                            Log.e("error",t.getStackTrace().toString());
                            checkConnection();

                        }
                    }
            );















    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if((event.getAction() == KeyEvent.ACTION_DOWN)){
            switch (event.getKeyCode()) {

                case KeyEvent.KEYCODE_MENU:
                    if(channellistRoot.getVisibility()==View.VISIBLE)
                    //tvGenreView.performClick();{
                    {
                        addremoveFav(((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())),channelListView.getSelectedItemPosition());
                        channelsAdapter.notifyDataSetChanged();
                    }
                    else if(channellistRoot.getVisibility()==View.INVISIBLE)
                    //tvGenreView.performClick();{
                    {
                        audiosubmenu.setVisibility(View.VISIBLE);
                        audiomenubtn.requestFocus();
                    }
                    return true;


                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if(audiosubmenu.getVisibility() == View.VISIBLE) {
                        return super.dispatchKeyEvent(event);
                    }
                    else if(audiomenulist.getVisibility() == View.VISIBLE){
                        return super.dispatchKeyEvent(event);
                    }
                    else if(subtitlemenulist.getVisibility() == View.VISIBLE){
                        return super.dispatchKeyEvent(event);
                    }
                    else if(channelListView.getAdapter()!=null&&channelListView.getAdapter().getCount()>0) {

                        if (programmelistRoot.getVisibility() == View.VISIBLE) {
                            if(programmes!=null&&programmes.size()>0) {
                                selectedProgramDescription.setText(programmes.get(programmes.size() > programmesList.getSelectedItemPosition() + 1 ? programmesList.getSelectedItemPosition() + 1 : programmesList.getSelectedItemPosition()).getDescription());
                                selectedProgram.setText(programmes.get(programmes.size() > programmesList.getSelectedItemPosition() + 1 ? programmesList.getSelectedItemPosition() + 1 : programmesList.getSelectedItemPosition()).getTitle());
                                return super.dispatchKeyEvent(event);
                            }
                            else{
                                return super.dispatchKeyEvent(event);
                            }
                        }
                        if (countryside.getVisibility() == View.VISIBLE) {
                            if (countrysListView.getSelectedItemPosition() == channelListView.getAdapter().getCount() - 1) {
                                countrysListView.setSelection(0);

                                return true;
                            } else {
                                countrysListView.setSelection(countrysListView.getSelectedItemPosition() + 1);
                                return true;
                            }
                        }
                        if (channellistRoot.getVisibility() == View.VISIBLE) {
                            if (channelListView.getSelectedItemPosition() == channelListView.getAdapter().getCount() - 1) {
                                channelListView.setSelection(0);
                                handlCountDown.removeCallbacks(getepgTimer);
                                handlCountDown.postDelayed(getepgTimer, 500);

                                return true;
                            } else {
                                channelListView.setSelection(channelListView.getSelectedItemPosition() + 1);

                                handlCountDown.removeCallbacks(getepgTimer);
                                handlCountDown.postDelayed(getepgTimer, 500);
                                return true;
                            }
                        }
                       if (programmelistRoot.getVisibility() == View.INVISIBLE && channellistRoot.getVisibility() == View.INVISIBLE) {
                            if (channelListView.getSelectedItemPosition() == channelListView.getAdapter().getCount() - 1) {
                                channelListView.setSelection(0);

                            } else {
                                channelListView.setSelection(channelListView.getSelectedItemPosition() + 1);

                            }
                            Iptvchannel currentchannel = ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                            stream_id = currentchannel.getId();
                            if (channelindex >= 0)
                                ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                            channelsAdapter.notifyDataSetChanged();
                            player.stop();


                            editor.putLong("stream_id", stream_id);
                            editor.putLong("category_id", category_id);
                            editor.putLong("country_id", selected_country_id);

                            editor.commit();
                            channelindex = channelListView.getSelectedItemPosition();
                            playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts ");
                            getEpg(stream_id);
                           if(channelListView.getSelectedItem()!=null) {
                               Glide.with(this).load(((Iptvchannel) channelListView.getSelectedItem()).getImage()).into(channelLogo);
                               channelLogo.setVisibility(View.VISIBLE);
                           }
                           h.removeCallbacksAndMessages(null);
                           h.postDelayed(new Runnable() {

                               @Override
                               public void run() {
                                   // EITHER HIDE IT IMMEDIATELY
                                   channelLogo.setVisibility(View.GONE);
                               }
                           }, 3000); // 3 seconds

                           // SlideToTop();
                            lastdate = new Date();
                            handlCountDown.removeCallbacks(SlideToAboveTimer);
                            handlCountDown.postDelayed(SlideToAboveTimer, 5000);
                            return true;
                        } else {
                            return super.dispatchKeyEvent(event);
                        }
                    }else{return true;}
                case KeyEvent.KEYCODE_DPAD_UP:
                    if(audiosubmenu.getVisibility() == View.VISIBLE) {
                        return super.dispatchKeyEvent(event);
                    }
                    else if(audiomenulist.getVisibility() == View.VISIBLE){
                        return super.dispatchKeyEvent(event);
                    } else if(subtitlemenulist.getVisibility() == View.VISIBLE){
                        return super.dispatchKeyEvent(event);
                    }
                    else if(channelListView.getAdapter()!=null&&channelListView.getAdapter().getCount()>0) {
                        if (programmelistRoot.getVisibility() == View.VISIBLE) {
                            if(programmes!=null&&programmes.size()>0) {
                                selectedProgramDescription.setText(programmes.get(programmesList.getSelectedItemPosition() - 1 >= 0 ? programmesList.getSelectedItemPosition() - 1 : programmesList.getSelectedItemPosition()).getDescription());
                                selectedProgram.setText(programmes.get(programmesList.getSelectedItemPosition() - 1 >= 0 ? programmesList.getSelectedItemPosition() - 1 : programmesList.getSelectedItemPosition()).getTitle());
                                return super.dispatchKeyEvent(event);
                            }
                            else{
                                return super.dispatchKeyEvent(event);
                            }
                        }
                        if (countryside.getVisibility() == View.VISIBLE) {
                            if (countrysListView.getSelectedItemPosition() == 0) {
                                countrysListView.setSelection(countrysListView.getAdapter().getCount() - 1);


                                return true;
                            } else {
                                countrysListView.setSelection(countrysListView.getSelectedItemPosition() - 1);
                                return true;
                            }
                        }
                        if (channellistRoot.getVisibility() == View.VISIBLE) {
                            if (channelListView.getSelectedItemPosition() == 0) {
                                channelListView.setSelection(channelListView.getAdapter().getCount() - 1);
                                handlCountDown.removeCallbacks(getepgTimer);
                                handlCountDown.postDelayed(getepgTimer, 500);

                                return true;
                            } else {
                                channelListView.setSelection(channelListView.getSelectedItemPosition() - 1);

                                handlCountDown.removeCallbacks(getepgTimer);
                                handlCountDown.postDelayed(getepgTimer, 500);
                                return true;
                            }
                        }
                        if (programmelistRoot.getVisibility() == View.INVISIBLE && channellistRoot.getVisibility() == View.INVISIBLE) {
                            if (channelListView.getSelectedItemPosition() == 0) {
                                channelListView.setSelection(channelListView.getAdapter().getCount() - 1);

                            } else {
                                channelListView.setSelection(channelListView.getSelectedItemPosition() - 1);

                            }
                            Iptvchannel currentchannel = ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                            stream_id = currentchannel.getId();
                            if (channelindex >= 0)
                                ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                            channelsAdapter.notifyDataSetChanged();
                            player.stop();
                            retry=0;


                            editor.putLong("stream_id", stream_id);
                            editor.putLong("category_id", category_id);
                            editor.putLong("country_id", selected_country_id);

                            editor.commit();
                            channelindex = channelListView.getSelectedItemPosition();
                            playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts ");
                            if(channelListView.getSelectedItem()!=null) {
                                Glide.with(this).load(((Iptvchannel) channelListView.getSelectedItem()).getImage()).into(channelLogo);
                                channelLogo.setVisibility(View.VISIBLE);
                            }
                            h.removeCallbacksAndMessages(null);
                            h.postDelayed(new Runnable() {

                                @Override
                                public void run() {
                                    // EITHER HIDE IT IMMEDIATELY
                                    channelLogo.setVisibility(View.GONE);
                                }
                            }, 3000); // 3 seconds

                            getEpg(stream_id);

                           // SlideToTop();
                            lastdate = new Date();
                            handlCountDown.removeCallbacks(SlideToAboveTimer);
                            handlCountDown.postDelayed(SlideToAboveTimer, 5000);
                            return true;
                        } else {
                            return super.dispatchKeyEvent(event);
                        }
                    }
                    else{return true;}
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if(countryside.getVisibility() == View.INVISIBLE && channellistRoot.getVisibility()==View.INVISIBLE) {
                        programmelistRoot.setVisibility(View.VISIBLE);
                        getProgrammes(stream_id);
                        archiveview.setVisibility(View.VISIBLE);


                        ConstraintLayout.LayoutParams params = (ConstraintLayout.LayoutParams) guidelineepg.getLayoutParams();
                        ValueAnimator anim = ValueAnimator.ofFloat(params.guidePercent, 0.77f);
                        anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                            @Override
                            public void onAnimationUpdate(ValueAnimator valueAnimator) {
                                float val = (Float) valueAnimator.getAnimatedValue();
                                ConstraintLayout.LayoutParams layoutParams = (ConstraintLayout.LayoutParams) guidelineepg.getLayoutParams();
                                layoutParams.guidePercent = val;
                                guidelineepg.setLayoutParams(layoutParams);
                            }
                        });
                        anim.setDuration(2);
                        anim.start();
                    } else if(countryside.getVisibility() == View.VISIBLE && channellistRoot.getVisibility()==View.VISIBLE) {
                        categoriesClosedConstraints.applyTo(iptvconstraint);
                    } else if (countryside.getVisibility() == View.INVISIBLE) {

                        tvGenreIndex = ((tvGenreView.getSelectedItemPosition() + 1 <= tvgenres.size() - 1) ? tvGenreView.getSelectedItemPosition() + 1 : 0);
                        tvGenreView.setSelection(tvGenreIndex);
                        handlCountDown.removeCallbacks(getepgTimer);
                        handlCountDown.postDelayed(getepgTimer, 200);

                    } else {
                        categoriesClosedConstraints.applyTo(iptvconstraint);
                    }


                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:

                    if(channellistRoot.getVisibility()==View.VISIBLE) {

                        tvGenreIndex=((tvGenreView.getSelectedItemPosition()-1>=0)?tvGenreView.getSelectedItemPosition()-1:tvgenres.size()-1);
                        tvGenreView.setSelection(tvGenreIndex);

                        handlCountDown.removeCallbacks(getepgTimer);
                        handlCountDown.postDelayed(getepgTimer, 200);
                    }


                    return true;
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_DPAD_CENTER:

                    if(subtitlemenubtn.hasFocus()){
                        return super.dispatchKeyEvent(event);
                    }
                    else if(audiomenubtn.hasFocus()){
                        return super.dispatchKeyEvent(event);
                    }
                    else if(audiomenulist.getVisibility() == View.VISIBLE){
                        return super.dispatchKeyEvent(event);
                    }
                    else if(subtitlemenulist.getVisibility() == View.VISIBLE){
                        return super.dispatchKeyEvent(event);
                    }
                    else if (archiveview.getVisibility() == View.VISIBLE && archiveviewzoomed) {
                            Log.e("FOCUS", "NOW");
                            archiveviewzoomed = false;
                            TransitionManager.beginDelayedTransition(iptvconstraint);
                            archiveviewClosedConstraints.applyTo(iptvconstraint);
                            return true;

                        } else if (archiveview.getVisibility() == View.VISIBLE && !archiveviewzoomed) {
                            Log.e("FOCUS", "NOW");
                            archiveviewzoomed = true;
                            TransitionManager.beginDelayedTransition(iptvconstraint);
                            archiveviewConstraints.applyTo(iptvconstraint);
                            return true;

                    } else if (countryside.getVisibility() == View.VISIBLE) {
                            if(((Country) countrysListView.getSelectedItem())!=null&&selected_country_id ==((Country) countrysListView.getSelectedItem()).getId())
                            {
                                categoriesClosedConstraints.applyTo(iptvconstraint);
                            }
                            else {
                                if(((Country) countrysListView.getSelectedItem())!=null) {
                                    selected_country_id = ((Country) countrysListView.getSelectedItem()).getId();
                                    getTvgenres(((Country) countrysListView.getSelectedItem()).getId());
                                }}
                    } else if (channellistRoot.getVisibility() == View.INVISIBLE && programmelistRoot.getVisibility() == View.INVISIBLE) {
                        channellistRoot.setVisibility(View.VISIBLE);
                        SlideToTop();
                    } else if ((channelListView.getAdapter() != null && channelListView.getAdapter().getCount() > 0) && stream_id == ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).getId() && ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).getPlayState() == View.INVISIBLE) {
                        channellistRoot.setVisibility(View.INVISIBLE);
                        SlideToAbove();
                    } else if (channelListView.getAdapter() != null && channelListView.getAdapter().getCount() > 0) {
                        retry = 0;
                        badsignal.setVisibility(View.INVISIBLE);
                        Iptvchannel currentchannel = ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition()));
                        stream_id = currentchannel.getId();
                        if (channelindex >= 0)
                            ((Iptvchannel) channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).setPlayState(View.INVISIBLE);
                        channelsAdapter.notifyDataSetChanged();
                        Random r = new Random();
                        player.stop();


                            editor.putLong("stream_id", stream_id);
                            editor.putLong("category_id", category_id);
                            editor.putLong("country_id", selected_country_id);

                            editor.commit();
                            selectedcategorieIndex=tvGenreIndex;
                            channelindex = channelListView.getSelectedItemPosition();
                            playvideo(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts ");
                            if(channelListView.getSelectedItem()!=null) {
                                Glide.with(this).load(((Iptvchannel) channelListView.getSelectedItem()).getImage()).into(channelLogo);
                                channelLogo.setVisibility(View.VISIBLE);
                            }
                            h.removeCallbacksAndMessages(null);
                            h.postDelayed(new Runnable() {

                                @Override
                                public void run() {
                                    // EITHER HIDE IT IMMEDIATELY
                                    channelLogo.setVisibility(View.GONE);
                                }
                            }, 3000); // 3 seconds

                            getEpg(stream_id);


                        }


                    return true;
                case KeyEvent.KEYCODE_BACK:
                    if(audiosubmenu.getVisibility()==View.VISIBLE){
                        audiosubmenu.setVisibility(View.INVISIBLE);
                        return true;
                    }
                    else if(subtitlemenulist.getVisibility()==View.VISIBLE){
                        subtitlemenulist.setVisibility(View.INVISIBLE);
                        return true;
                    }
                    else if(audiomenulist.getVisibility()==View.VISIBLE){
                        audiomenulist.setVisibility(View.INVISIBLE);
                        return true;
                    }
                    else if (programmelistRoot.getVisibility() == View.VISIBLE) {
                        programmelistRoot.setVisibility(View.INVISIBLE);
                        archiveview.setVisibility(View.INVISIBLE);
                        return true;
                    }
                    else if(archiveview.getVisibility()==View.VISIBLE&&archiveviewzoomed){
                        Log.e("FOCUS","NOW");
                        archiveviewzoomed=false;
                        TransitionManager.beginDelayedTransition(iptvconstraint);
                        archiveviewClosedConstraints.applyTo(iptvconstraint);
                        return true;
                    } else if (channellistRoot.getVisibility() == View.INVISIBLE && countryside.getVisibility() == View.INVISIBLE && countryList.size() > 1) {
                        return super.dispatchKeyEvent(event);
                    } else if (channellistRoot.getVisibility() == View.VISIBLE && countryside.getVisibility() == View.INVISIBLE && countryList.size() > 1) {
                        categoriesConstraints.applyTo(iptvconstraint);
                        /*channellistRoot.setVisibility(View.INVISIBLE);
                        tvGenreView.setSelection(selectedcategorieIndex);
                        Log.e("FOCUS",tvGenreIndex+"NOW");
                           SlideToAbove();
                        */
                        return true;
                    } else if (channellistRoot.getVisibility() == View.VISIBLE && countryside.getVisibility() == View.VISIBLE && countryList.size() > 1) {
                        categoriesClosedConstraints.applyTo(iptvconstraint);
                        channellistRoot.setVisibility(View.INVISIBLE);
                        //tvGenreView.setSelection(selectedcategorieIndex);
                        Log.e("FOCUS",tvGenreIndex+"NOW");
                           SlideToAbove();

                        return true;
                    } else  if (channellistRoot.getVisibility() == View.INVISIBLE && countryside.getVisibility() == View.INVISIBLE && archiveview.getVisibility()==View.INVISIBLE) {
                        categoriesConstraints.applyTo(iptvconstraint);
                        /*channellistRoot.setVisibility(View.INVISIBLE);
                        tvGenreView.setSelection(selectedcategorieIndex);
                        Log.e("FOCUS",tvGenreIndex+"NOW");
                           SlideToAbove();
                        */
                        return true;
                    }
                    else
                        {return super.dispatchKeyEvent(event);}

                default:
                    return super.dispatchKeyEvent(event);
            }
        } else {
            return super.dispatchKeyEvent(event);
        }

    }


    public void getChannels(){
        getChannels(null);
    }

    public void getChannels(final Long tvgenreid){
        if(tvgenreid==-1L) {
            getFavs();
        }
        else if(channelsAdapterMap.containsKey(tvgenreid)){
        Log.e("FROM cache",tvgenreid+"");
            iptvchannels=channelsAdapterMap.get(tvgenreid).getChannelsList();
            channelsAdapter=new ChannelsAdapter(iptvchannels, IptvActivity.this);
            channelListView.setAdapter(channelsAdapter);
            channelindex = -1;

                for (int i = 0; i < channelsAdapterMap.get(tvgenreid).getCount(); i++) {

                    if (channelsAdapterMap.get(tvgenreid).getItem(i).getId() == sharedPref.getLong("stream_id", 0L)) {
                        channelindex = i;
                    }
                }
            if (channelindex != -1) {
                channelListView.setSelection(channelindex);
                getEpg(stream_id);


            }

            if (stream_id == 0L&&iptvchannels.size()>0) {
                stream_id = iptvchannels.get(0).getId();
                MediaSource mediaSource = buildMediaSource(Uri.parse(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts"), "ts", mainHandler, null);
                player.prepare(mediaSource);
            }
        }
        else {
            Log.e("Channels",MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_live_streams" + (tvgenreid != null ? "&category_id=" + tvgenreid : ""));
            client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_live_streams" + (tvgenreid != null ? "&category_id=" + tvgenreid : ""), new JsonHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                            disconnected.setVisibility(View.INVISIBLE);
                            iptvchannels = new ArrayList<>();
                            channelindex = -1;
                            try {
                                for (int i = 0; i < res.length(); i++) {
                                    JSONObject obj = (JSONObject) res.get(i);

                                    iptvchannels.add(new Iptvchannel(obj.getLong("stream_id"), obj.getString("name"), obj.getString("stream_icon"), isItFav(obj.getString("stream_id")),obj.getLong("category_id")));
                                    if (obj.getLong("stream_id") == sharedPref.getLong("stream_id", 0L)) {
                                        channelindex = i;
                                    }
                                }

                                channelsAdapter=new ChannelsAdapter(iptvchannels, IptvActivity.this);

                                channelsAdapterMap.put(tvgenreid,channelsAdapter);
                                channelListView.setAdapter(channelsAdapter);
                                channelsAdapter.notifyDataSetChanged();
                                Log.e("adapter",channelsAdapter+"");
                                if (channelindex != -1) {
                                    channelListView.setSelection(channelindex);
                                    getEpg(stream_id);

                                }
                                if (iptvchannels.size()>0&&stream_id == 0L) {
                                    stream_id = iptvchannels.get(0).getId();
                                    MediaSource mediaSource = buildMediaSource(Uri.parse(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts"), "ts", mainHandler, null);
                                    player.prepare(mediaSource);
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


    }
    private void getFavs() {
        if(allchannels!=null&&allchannels.size()>0){
            favs=new ArrayList<>();
            final JSONObject cachejsonObject = ExternalStorageManager.readCache(IptvActivity.this);
            for (int i = 0; i < allchannels.size(); i++) {
                if (cachejsonObject.has(allchannels.get(i).getId().toString())) {
                    allchannels.get(i).setFav(true);
                    favs.add(allchannels.get(i));
                }

            }



                iptvchannels = favs;
                channelsAdapter = new ChannelsAdapter(iptvchannels, getApplicationContext());
                channelListView.setAdapter(channelsAdapter);
                channelindex = -1;

                for (int i = 0; i < channelsAdapter.getCount(); i++) {

                    if (channelsAdapter.getItem(i).getId() == sharedPref.getLong("stream_id", 0L)) {
                        channelindex = i;
                    }
                }
                if (channelindex != -1) {
                    channelListView.setSelection(channelindex);
                    getEpg(stream_id);
                }
                if (stream_id == 0L && iptvchannels.size() > 0) {
                    stream_id = iptvchannels.get(0).getId();
                    MediaSource mediaSource = buildMediaSource(Uri.parse(MainActivity.mainlink+"/live/" + user + "/" + pass + "/" + stream_id + ".ts"), "ts", mainHandler, null);
                    player.prepare(mediaSource);
                }


        }
        else {
            allchannels = new ArrayList<>();

            final JSONObject cachejsonObject = ExternalStorageManager.readCache(IptvActivity.this);
            client.get(MainActivity.mainlink+"/player_api.php?username=" + user + "&password=" + pass + "&action=get_live_streams", new JsonHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                            disconnected.setVisibility(View.INVISIBLE);
                            favs = new ArrayList<>();
                            channelindex = -1;
                            try {
                                for (int i = 0; i < res.length(); i++) {
                                    JSONObject obj = (JSONObject) res.get(i);

                                    allchannels.add(new Iptvchannel(obj.getLong("stream_id"), obj.getString("name"), obj.getString("stream_icon"), isItFav(obj.getString("stream_id")), obj.getLong("category_id")));
                                    if (obj.getLong("stream_id") == sharedPref.getLong("stream_id", 0L)) {
                                        channelindex = i;
                                    }
                                }

                            } catch (JSONException e) {
                                e.printStackTrace();
                            }
                            for (int i = 0; i < allchannels.size(); i++) {
                                if (cachejsonObject.has(allchannels.get(i).getId().toString())) {
                                    favs.add(allchannels.get(i));
                                }

                            }
                            if(favs.size()>0) {
                                iptvchannels = favs;

                                channelsAdapter = new ChannelsAdapter(iptvchannels, getApplicationContext());
                                channelListView.setAdapter(channelsAdapter);
                                channelindex = -1;

                                for (int i = 0; i < channelsAdapter.getCount(); i++) {

                                    if (channelsAdapter.getItem(i).getId() == sharedPref.getLong("stream_id", 0L)) {
                                        channelindex = i;
                                    }
                                }
                                if (channelindex != -1) {
                                    channelListView.setSelection(channelindex);
                                    getEpg(stream_id);


                                }
                                if (stream_id == 0L && iptvchannels.size() > 0) {
                                    stream_id = iptvchannels.get(0).getId();
                                    MediaSource mediaSource = buildMediaSource(Uri.parse(MainActivity.mainlink+"/live/" + user + "/" + pass + "/" + stream_id + ".ts"), "ts", mainHandler, null);
                                    player.prepare(mediaSource);
                                }

                            }
                            else{
                                tvGenreIndex=((tvGenreView.getSelectedItemPosition()+1<=tvgenres.size()-1)?tvGenreView.getSelectedItemPosition()+1:0);
                                tvGenreView.setSelection(tvGenreIndex);
                                handlCountDown.removeCallbacks(getepgTimer);
                                handlCountDown.postDelayed(getepgTimer, 200);
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


    }
    private Boolean isItFav(String stream_id) {
        JSONObject cachejsonObject = ExternalStorageManager.readCache(IptvActivity.this);
        if (cachejsonObject.has(String.valueOf(stream_id))) {
          return true;
        }

            return false;
    }
    private void addremoveFav(Iptvchannel channel,int index) {
        JSONObject cachejsonObject = ExternalStorageManager.readCache(IptvActivity.this);


        if(category_id==-1L){
            if(channelsAdapterMap.get(channel.getCategory_id())!=null)
            for(int i=0;i<channelsAdapterMap.get(channel.getCategory_id()).getCount();i++) {
                if(channelsAdapterMap.get(channel.getCategory_id()).getItem(i).getId().equals(channel.getId())){
                    channelsAdapterMap.get(channel.getCategory_id()).getItem(i).setFav(false);
                }
            }
            favs.remove(index);
            if(index>0){channelListView.setSelection(index);}
            else if(index==0&&channelListView.getCount()>1){
                channelListView.setSelection(index);
            }
            removeFav(channel.getId().toString());
        }
        else if (!cachejsonObject.has(String.valueOf(channel.getId()))) {
            channelsAdapterMap.get(channel.getCategory_id()).getItem(index).setFav(true);
            addFav(channel.getId().toString());
        }
        else {
            channelsAdapterMap.get(channel.getCategory_id()).getItem(index).setFav(false);
        removeFav(channel.getId().toString());}

    }
    private void addFav(String stream_id) {
        JSONObject cachejsonObject = ExternalStorageManager.readCache(IptvActivity.this);
        try {
            cachejsonObject.put(stream_id, true);
        } catch (JSONException e) {
            e.printStackTrace();
        }
        ExternalStorageManager.writeCache(IptvActivity.this, cachejsonObject);
        channelsAdapter.notifyDataSetChanged();
    }
    private void removeFav(String stream_id) {
        JSONObject cachejsonObject = ExternalStorageManager.readCache(IptvActivity.this);
        cachejsonObject.remove(stream_id);
        ExternalStorageManager.writeCache(IptvActivity.this, cachejsonObject);
        channelsAdapter.notifyDataSetChanged();
    }
    public void getProgrammes(Long channelid){
        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_simple_data_table&stream_id="+channelid,  new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                        disconnected.setVisibility(View.INVISIBLE);
                        programmes=new ArrayList<>();
                        int focus=0;
                        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd");

                        try {
                            for (int i = 0; i < res.getJSONArray("epg_listings").length(); i++) {
                                JSONObject obj =(JSONObject) res.getJSONArray("epg_listings").get(i);
                                if(fmt.format(new Date()).equals(fmt.format(new Date(obj.getLong("start_timestamp")*1000)))) {
                                    if (i ==0  || !obj.getString("start").equals(((JSONObject) res.getJSONArray("epg_listings").get(i - 1)).getString("start"))) {
                                        programmes.add(new ProgrammeItem(obj.getLong("id"), obj.getLong("epg_id"), Utils.decodeBase64(obj.getString("title")), obj.getString("lang"), obj.getString("start"), obj.getString("end"), Utils.decodeBase64(obj.getString("description")), obj.getString("channel_id"), obj.getLong("start_timestamp"), obj.getLong("stop_timestamp")));
                                        if (new Date().getTime() > (obj.getLong("stop_timestamp") * 1000)) {
                                        } else if (new Date().getTime() < (obj.getLong("start_timestamp") * 1000)) {

                                        } else {
                                            focus = programmes.size() - 1;
                                        }
                                    }
                                }
                            }

                            programmesAdapter=new ProgrammesAdapter(programmes,IptvActivity.this);
                            programmesList.setOnItemClickListener(new AdapterView.OnItemClickListener() {
                                @Override
                                public void onItemClick(AdapterView<?> adapterView, View view, int i, long l) {
                                 if (programmelistRoot.getVisibility() == View.VISIBLE) {

                                         Log.e("IPTV","programmes"+i);

                                                    selectedProgramDescription.setText(programmes.get(i).getDescription());
                                                    selectedProgram.setText(programmes.get(i).getTitle());

                                    }
                                }
                            });
                            programmesList.setAdapter(programmesAdapter);

                           programmesList.setSelection(focus);
                            selectedProgramDescription.setText("");
                            selectedProgram.setText("");
                            Log.e("programmes",programmes+"");
                            if(programmes.size()>0) {
                                selectedProgramDescription.setText(programmes.get((programmesList.getSelectedItemPosition()>=0?programmesList.getSelectedItemPosition():0)).getDescription());
                                selectedProgram.setText(programmes.get((programmesList.getSelectedItemPosition()>=0?programmesList.getSelectedItemPosition():0)).getTitle());
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
        retry=0;
        badsignal.setVisibility(View.INVISIBLE);
        video_url = link; //video url*
        Log.e("LINK",video_url);
        MediaSource mediaSource = buildMediaSource(Uri.parse(video_url),"ts",mainHandler,null);
        player.prepare(mediaSource);

    }

    private void getEpg(Long stream_id) {
        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_short_epg&stream_id="+stream_id,  new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                        disconnected.setVisibility(View.INVISIBLE);
                        try {
                            JSONArray epgs= res.getJSONArray("epg_listings");
                            if (epgs.length()>1) {
                                Timestamp currentstamp = new Timestamp(epgs.getJSONObject(0).getLong("start_timestamp") * 1000);
                                Date currentdate = new Date(currentstamp.getTime());
                                SimpleDateFormat sdf = new SimpleDateFormat("HH'H'mm");
                                Timestamp nextstamp = new Timestamp(epgs.getJSONObject(1).getLong("start_timestamp") * 1000);
                                Date nextdate = new Date(nextstamp.getTime());
                                currentProg.setText( Utils.decodeBase64(epgs.getJSONObject(0).getString("title")));
                                nextProgtime.setText("-\n"+sdf.format(nextdate));
                                nextProg.setText(Utils.decodeBase64(epgs.getJSONObject(1).getString("title")));
                            }
                            else {
                                currentProg.setText("");
                                nextProgtime.setText("");
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
                        nextProgtime.setText("");
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

        if((channellistRoot.getVisibility()==View.INVISIBLE)){
            epgview.setVisibility(View.INVISIBLE);
        /*Animation slide = null;

        slide = new TranslateAnimation(Animation.RELATIVE_TO_SELF, 0.0f,
                Animation.RELATIVE_TO_SELF, 0.0f, Animation.RELATIVE_TO_SELF,
                0.0f, Animation.RELATIVE_TO_SELF, 5.0f);
        //epgview.setVisibility(View.VISIBLE);
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

        });*/
        }

    }
    public void SlideToTop() {
        epgview.setVisibility(View.VISIBLE);
        /*if(!barposition) {
            Animation slide = null;
            barposition = true;
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
        }*/

    }
    private Runnable SlideToAboveTimer = new Runnable() {
        @Override
        public void run() {
            SlideToAbove();
        }
    };
    private Runnable getepgTimer = new Runnable() {
        @Override
        public void run() {
            if(channelListView.getAdapter()!=null&&channelListView.getAdapter().getCount()>channelListView.getSelectedItemPosition()&&channelListView.getSelectedItemPosition()>=0)getEpg(((Iptvchannel)channelListView.getAdapter().getItem(channelListView.getSelectedItemPosition())).getId());
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

    private int getTracks(int trackType){
        if (player == null) return 0;
        
        Tracks tracks = player.getCurrentTracks();
        if (tracks.isEmpty()) return 0;
        
        int count = 0;
        for (Tracks.Group trackGroup : tracks.getGroups()) {
            if (trackGroup.getType() == trackType && trackGroup.length > 0) {
                count += trackGroup.length;
            }
        }
        return count;
    }

    private class PlayerEventListener implements Player.Listener {
        @Override
        public void onPlaybackStateChanged(int playbackState) {
            if (playbackState == ExoPlayer.STATE_READY && player != null && player.getPlayWhenReady()) {
                disconnected.setVisibility(View.INVISIBLE);
                audioIcon.setVisibility(View.INVISIBLE);
                subtitleIcon.setVisibility(View.INVISIBLE);
                if(getTracks(C.TRACK_TYPE_AUDIO)>1){
                    audioIcon.setVisibility(View.VISIBLE);
                    Handler handler = new Handler();
                    handler.postDelayed(new Runnable(){
                        @Override
                        public void run(){
                            (findViewById(R.id.audioIcon)).setVisibility(View.GONE);
                        }
                    }, 3000);
                }
                else{audioIcon.setVisibility(View.INVISIBLE);}

                    if(getTracks(C.TRACK_TYPE_TEXT)>1){
                        subtitleIcon.setVisibility(View.VISIBLE);
                        // Disable text tracks by default in Media3
                        trackSelector.setParameters(
                            trackSelector.buildUponParameters()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                        );
                        Handler handler = new Handler();
                        handler.postDelayed(new Runnable(){
                            @Override
                            public void run(){
                                (findViewById(R.id.subtitleIcon)).setVisibility(View.GONE);
                            }
                        }, 3000);

                    }

                    else{subtitleIcon.setVisibility(View.INVISIBLE);
                    }


            }
        }


        @Override
        public void onPlayerError(PlaybackException e) {
            if(channelindex>=0&&iptvchannels!=null&&channelindex<iptvchannels.size())
                if(selectedcategorieIndex==tvGenreView.getSelectedItemPosition())
                    ((Iptvchannel) channelListView.getAdapter().getItem(channelindex)).setPlayState(View.VISIBLE);
            channelsAdapter.notifyDataSetChanged();
            checkConnection();
            String errorString = null;

            if (e.errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED) {
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
            }
            if (errorString != null) {

                showToast(errorString);
            }
            stream_id = sharedPref.getLong("stream_id", 0L);
            if(stream_id!=0L&&stream_id!=-1L&&retry<3) {
                retry++;
                MediaSource mediaSource = buildMediaSource(Uri.parse(MainActivity.mainlink+"/live/"+user+"/"+pass+"/" + stream_id + ".ts"),"ts",mainHandler,null);

                player.prepare(mediaSource);
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
            disconnected.setVisibility(View.INVISIBLE);
            badsignal.setVisibility(View.VISIBLE);
        }else{
            disconnected.setVisibility(View.VISIBLE);

        }
    }
}
