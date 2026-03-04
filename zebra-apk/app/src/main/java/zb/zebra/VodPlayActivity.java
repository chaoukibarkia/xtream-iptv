package zb.zebra;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.TypedArray;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import androidx.palette.graphics.Palette;
import android.util.Log;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;
import android.graphics.drawable.Drawable;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;
import android.graphics.drawable.Drawable;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;
import android.graphics.drawable.Drawable;
import com.bumptech.glide.request.target.Target;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;
import android.graphics.drawable.Drawable;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.ui.PlayerView;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.common.Timeline;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.exoplayer.trackselection.FixedTrackSelection;
import androidx.media3.exoplayer.trackselection.MappingTrackSelector;
import androidx.media3.exoplayer.trackselection.RandomTrackSelection;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.common.util.Util;
import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;

import org.json.JSONException;
import org.json.JSONObject;

import cz.msebera.android.httpclient.Header;
import zb.zebra.Util.OnSwipeTouchListener;
import zb.zebra.iptvapplication.R;
import zb.zebra.Util.TrackSelectionHelper;
import zb.zebra.zebra.film.MovieDetails;
import zb.zebra.zebra.tvshow.Episode;


public class VodPlayActivity extends Activity implements Player.Listener {
    private PlayerView simpleExoPlayerView;
    private ExoPlayer player;
    private Boolean started=true;
    private int currentWindow;
    private boolean shouldAutoPlay=true;
    private DefaultTrackSelector trackSelector;
    private long playbackPosition;
    private TrackSelectionHelper trackSelectionHelper;
    // DefaultBandwidthMeter no longer needed in Media3
    String link="";
    private LinearLayout debugRootView;
    Button audiobtn;
    ImageView poster ;
    TextView vodtitle;
    TextView vodDescription;
    LinearLayout infoblock;
    LinearLayout flagszone;
    Button subtitlebtn;
    MovieDetails moviedetails;
    LinearLayout audiomenulist;
    LinearLayout controlbar;
    Episode episode;
    String user="";
    String pass="";
    private void loadPreferences() {

        SharedPreferences settings = getSharedPreferences(ActiveCodeActivity.PREFS_NAME,
                Context.MODE_PRIVATE);

        // Get value
        user = settings.getString(ActiveCodeActivity.PREF_UNAME, "");
        pass = settings.getString(ActiveCodeActivity.PREF_PASSWORD, "");

    }
    private AsyncHttpClient client=new AsyncHttpClient();

    ComponentListener componentListener;
    private LinearLayout subtitlemenulist;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_vod_play);
        loadPreferences();
        simpleExoPlayerView = (PlayerView) findViewById(R.id.player_view);
        flagszone=(LinearLayout)simpleExoPlayerView.findViewById(R.id.flags);
        controlbar=(LinearLayout)simpleExoPlayerView.findViewById(R.id.controlbar);
        DefaultRenderersFactory rf = new DefaultRenderersFactory(this.getApplicationContext())
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF);
        componentListener = new ComponentListener();
        trackSelector = new DefaultTrackSelector(this);
        trackSelectionHelper = new TrackSelectionHelper(trackSelector, this);
        debugRootView = findViewById(R.id.controls_root);
        player = new ExoPlayer.Builder(this)
                .setRenderersFactory(rf)
                .setTrackSelector(trackSelector)
                .build();
        poster=(ImageView) findViewById(R.id.poster_imageView);
        vodtitle=(TextView)  findViewById(R.id.title_textview);
        vodDescription=(TextView)  findViewById(R.id.desc_textview);
        infoblock=(LinearLayout) findViewById(R.id.infoblock);

        audiomenulist=(LinearLayout) findViewById(R.id.audiomenu);
        subtitlemenulist=(LinearLayout) findViewById(R.id.subtitlemenu);
        simpleExoPlayerView.setPlayer(player);
        simpleExoPlayerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            subtitlemenulist.setVisibility(View.INVISIBLE);
            audiomenulist.setVisibility(View.INVISIBLE);
        });
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        player.setPlayWhenReady(shouldAutoPlay);
        Typeface font = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Medium.ttf");
        vodtitle.setTypeface(font);
        vodDescription.setTypeface(font);
        Intent intent = getIntent();
        Long stream_id = intent.getLongExtra("stream_id", 0L);

        audiobtn=(Button)findViewById(R.id.audiobtn);
        subtitlebtn=(Button)findViewById(R.id.subtitlebtn);
        audiobtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                subtitlemenulist.setVisibility(View.INVISIBLE);
                if(player != null && player.getCurrentTracks() != null && !player.getCurrentTracks().isEmpty()) {
                    audiomenulist.removeAllViews();
                    audiomenulist.addView(trackSelectionHelper.buildView(
                            VodPlayActivity.this, C.TRACK_TYPE_AUDIO, player.getCurrentTracks(),(LinearLayout) findViewById(R.id.controlbar),"audio"));
                    audiomenulist.setVisibility(View.VISIBLE);
                }

                /*trackSelectionHelper.showSelectionDialog(
                            VodPlayActivity.this, "Audios", trackSelector.getCurrentMappedTrackInfo(), 1);*/
            }
        });
        subtitlebtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                audiomenulist.setVisibility(View.INVISIBLE);
                if(player != null && player.getCurrentTracks() != null && !player.getCurrentTracks().isEmpty())
                {subtitlemenulist.removeAllViews();
                    subtitlemenulist.addView(trackSelectionHelper.buildView(
                            VodPlayActivity.this, C.TRACK_TYPE_TEXT, player.getCurrentTracks(),(LinearLayout) findViewById(R.id.controlbar),"subtitle"));
                    subtitlemenulist.setVisibility(View.VISIBLE);
                }

            }
        });
        if(intent.getStringExtra("Activity").equalsIgnoreCase("MovieDetails")) {
            moviedetails = intent.getExtras().getParcelable(MovieDetails.class.getSimpleName());

            Glide.with(getApplicationContext())
                    .load(moviedetails.getMovie_image())
                    .diskCacheStrategy(DiskCacheStrategy.ALL)
                    .listener(new RequestListener<Drawable>() {
                        @Override
                        public boolean onLoadFailed(GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
                            return false;
                        }

                        @Override
                        public boolean onResourceReady(Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
                            //changePalette(((Drawable) resource).getBitmap());
                            return false;
                        }
                    })
                    .into(poster);

            vodtitle.setText(moviedetails.getName());
            vodDescription.setText(moviedetails.getPlot());
        }
        else if(intent.getStringExtra("Activity").equalsIgnoreCase("SeriesDetails")) {
            episode = intent.getExtras().getParcelable(Episode.class.getSimpleName());

            Glide.with(getApplicationContext())
                    .load(episode.getImage())
                    .diskCacheStrategy(DiskCacheStrategy.ALL)
                    .listener(new RequestListener<Drawable>() {
                        @Override
                        public boolean onLoadFailed(GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
                            return false;
                        }

                        @Override
                        public boolean onResourceReady(Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
                           // changePalette(((Drawable) resource).getBitmap());
                            return false;
                        }
                    })
                    .into(poster);

            vodtitle.setText(episode.getName());
            client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_vod_info&vod_id=" + episode.getId(), new JsonHttpResponseHandler() {
                @Override
                public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


                    if (res != null) {

                            try {
                                vodDescription.setText(res.getJSONObject("info").getString("plot"));
                            } catch (JSONException e) {
                                e.printStackTrace();
                            }


                    }
                }});

        }
        String stream_extension = intent.getStringExtra("stream_extension");
        String stream_type = intent.getStringExtra("stream_type");
        Log.e("link",MainActivity.mainlink+"/"+stream_type+"/"+user+"/"+pass+"/" + stream_id +"."+ stream_extension);
        playvideo(MainActivity.mainlink+"/"+stream_type+"/"+user+"/"+pass+"/" + stream_id +"."+ stream_extension);


        simpleExoPlayerView.setOnTouchListener(new OnSwipeTouchListener(this) {
            @Override
            public void onSwipeDown() {
                if(infoblock.getVisibility()==View.INVISIBLE) {
                    infoblock.setVisibility(View.VISIBLE);
                    return;
                }

            }

            @Override
            public void onSwipeLeft() {

            }

            @Override
            public void onSwipeUp() {
                if(infoblock.getVisibility()==View.VISIBLE) {
                    infoblock.setVisibility(View.INVISIBLE);
                    return ;
                }
            }

            @Override
            public void onSwipeRight() {

            }

            @Override
            public boolean onTouch(View view, MotionEvent motionEvent) {

                simpleExoPlayerView.showController();
                return super.onTouch(view, motionEvent);
            }
        });



        // Assign adapter to ListView


    }
    private void changePalette(Bitmap bmp) {
        Palette.from(bmp).generate(new Palette.PaletteAsyncListener() {
            @Override
            public void onGenerated(Palette palette) {
               /* PaletteColors colors = PaletteUtils.getPaletteColors(palette);
                vodtitle.setBackgroundColor(colors.getToolbarBackgroundColor());
                vodDescription.setBackgroundColor(colors.getStatusBarColor());
                infoblock.setBackgroundColor(colors.getStatusBarColor());
                controlbar.setBackgroundColor(colors.getStatusBarColor());
                Intent intent = getIntent();
                if(intent.getStringExtra("Activity").equalsIgnoreCase("MovieDetails")) {
                if (moviedetails != null) {
                 //   this.moviedetails.setPaletteColors(colors);
                }}
                else if(intent.getStringExtra("Activity").equalsIgnoreCase("SeriesDetails")) {

                }*/
            }
        });
    }
    public void playvideo(String link){
        this.link=link;
        initializePlayer();
        simpleExoPlayerView.setVisibility(View.VISIBLE);
        simpleExoPlayerView.setFocusable(true);
        player.seekTo(currentWindow, playbackPosition);
        player.getCurrentTrackGroups();
        simpleExoPlayerView.requestFocus();
    }



    private MediaSource buildMediaSource(Uri uri) {
        DefaultHttpDataSource.Factory dataSourceFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("IPTVAPPLICATION")
                .setConnectTimeoutMs(DefaultHttpDataSource.DEFAULT_CONNECT_TIMEOUT_MILLIS)
                .setReadTimeoutMs(DefaultHttpDataSource.DEFAULT_READ_TIMEOUT_MILLIS)
                .setAllowCrossProtocolRedirects(true);
        
        ProgressiveMediaSource extractorMediaSource = new ProgressiveMediaSource.Factory(dataSourceFactory)
                .createMediaSource(MediaItem.fromUri(uri));
        return extractorMediaSource;
    }



    private void initializePlayer() {
        if(link!="") {
            Uri uri = Uri.parse(link);
            MediaSource mediaSource = buildMediaSource(uri);
            player.prepare(mediaSource, true, false);
            player.addListener(componentListener);
            //simpleExoPlayerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
        }



    }

    private void releasePlayer() {
        if (player != null) {
            playbackPosition = player.getCurrentPosition();
            currentWindow = player.getCurrentWindowIndex();
            shouldAutoPlay = player.getPlayWhenReady();
            player.removeListener(componentListener);
            player.release();
            player = null;
        }
    }
    @Override
    public void onStart() {
        super.onStart();
        if (Util.SDK_INT > 23) {
            initializePlayer();
        }
    }

    public boolean dispatchKeyEvent(KeyEvent event) {
        if((event.getAction() == KeyEvent.ACTION_DOWN)) {
            Log.e("KEY", event.getKeyCode() + "");


            switch (event.getKeyCode()) {


                case KeyEvent.KEYCODE_MENU:
                    if(infoblock.getVisibility()==View.INVISIBLE) {
                        infoblock.setVisibility(View.VISIBLE);
                        return true;
                    }
                    else   if(infoblock.getVisibility()==View.VISIBLE) {
                        infoblock.setVisibility(View.INVISIBLE);
                        return true;
                    }
                case KeyEvent.KEYCODE_BACK:
                    if(infoblock.getVisibility()==View.VISIBLE) {
                        infoblock.setVisibility(View.INVISIBLE);
                        return true;
                    }else if(subtitlemenulist.getVisibility()==View.VISIBLE||audiomenulist.getVisibility()==View.VISIBLE) {
                        subtitlemenulist.setVisibility(View.INVISIBLE);
                        audiomenulist.setVisibility(View.INVISIBLE);
                        return true;
                    }

                default:
                    return super.dispatchKeyEvent(event);
            }
        }
        return super.dispatchKeyEvent(event);

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


    @Override
    public void onResume() {
        super.onResume();

        hideSystemUi();
        if ((Util.SDK_INT <= 23 || player == null)) {
            initializePlayer();
        }
    }
    @SuppressLint("InlinedApi")
    private void hideSystemUi() {
        simpleExoPlayerView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LOW_PROFILE
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
    }
    @Override
    public void onPause() {
        super.onPause();
        if (Util.SDK_INT <= 23) {
            releasePlayer();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        if (Util.SDK_INT > 23) {
            releasePlayer();
        }

    }


    private class ComponentListener implements Player.Listener  {

        @Override
        public void onPlaybackStateChanged(int playbackState) {
            String stateString;
            switch (playbackState) {
                case Player.STATE_IDLE:
                    stateString = "ExoPlayer.STATE_IDLE      -";
                    break;
                case Player.STATE_BUFFERING:
                    stateString = "ExoPlayer.STATE_BUFFERING -";



                    break;
                case Player.STATE_READY:
                    stateString = "ExoPlayer.STATE_READY     -";


                    if(getTracks(C.TRACK_TYPE_AUDIO)>0){

                    audiobtn.setVisibility(View.VISIBLE);}
                    else{audiobtn.setVisibility(View.INVISIBLE);}
                    Log.e("SUBS",getTracks(C.TRACK_TYPE_AUDIO)+"");
                    if(started){
                    if(getTracks(C.TRACK_TYPE_TEXT)>=1){
                        subtitlebtn.setVisibility(View.VISIBLE);
                        // Disable text tracks by default in Media3
                        trackSelector.setParameters(
                            trackSelector.buildUponParameters()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                        );

                    }

                        else{subtitlebtn.setVisibility(View.INVISIBLE);}
                    started=false;}



                    break;
                case Player.STATE_ENDED:
                    stateString = "ExoPlayer.STATE_ENDED     -";
                    break;
                default:
                    stateString = "UNKNOWN_STATE             -";
                    break;
            }
            Log.d("State", "changed state to " + stateString + " playWhenReady: " + (player != null && player.getPlayWhenReady()));
        }

        // Implementing VideoRendererEventListener.



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
            Toast.makeText(VodPlayActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }
    public void setAudio() {

        audiobtn.setText("Audio ");
    }
}
