package zb.zebra;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.support.constraint.ConstraintLayout;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;

import android.text.method.ScrollingMovementMethod;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.resource.bitmap.GlideBitmapDrawable;
import com.bumptech.glide.request.animation.GlideAnimation;
import com.bumptech.glide.request.target.SimpleTarget;
import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;


import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import cz.msebera.android.httpclient.Header;
import zb.zebra.iptvapplication.R;
import zb.zebra.zebra.film.Movie;
import zb.zebra.zebra.film.MovieDetails;

public class ZebraFilmDetailsActivity extends AppCompatActivity {
    private AsyncHttpClient client=new AsyncHttpClient();
    Movie movie;
    MovieDetails movieDetails;
    TextView titletextview;
    TextView durationview;
    TextView dateview;
    TextView plotTextView;

    TextView directorTv;
    TextView actorTv;

    ImageView posterimageView;
    ConstraintLayout layoutbg;
    Typeface fontblackbold;
    Typeface fontbold;
    Typeface fontlight;
    Button playbtn;
    private TextView directorLabelTv;
    private TextView actorLabelTv;
    String user="";
    String pass="";
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
        setContentView(R.layout.activity_zebra_film_details);
        fontblackbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Black.ttf");
        fontbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Medium.ttf");
        fontlight = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().getSharedElementEnterTransition().setDuration(1000);
            getWindow().getSharedElementReturnTransition().setDuration(1000)
                    .setInterpolator(new DecelerateInterpolator());
        }
        loadPreferences();
        movie=getIntent().getExtras().getParcelable(Movie.class.getSimpleName());
        titletextview=findViewById(R.id.titletextview);
        durationview=findViewById(R.id.durationtextview);
        dateview=findViewById(R.id.datetextview);
        plotTextView=findViewById(R.id.plotTextView);

        plotTextView.setMovementMethod(new ScrollingMovementMethod());

        titletextview.setTypeface(fontblackbold);






        directorTv=findViewById(R.id.directorTv);
        actorTv=findViewById(R.id.actorTv);
        directorLabelTv=findViewById(R.id.directorLabelTv);
        actorLabelTv=findViewById(R.id.actorLabelTv);



        actorLabelTv.setTypeface(fontbold);
        directorLabelTv.setTypeface(fontbold);


        posterimageView=findViewById(R.id.imageView);
        layoutbg=findViewById(R.id.layoutbg);
        playbtn = findViewById(R.id.playbtn);
        playbtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

                Intent myIntent = new Intent(ZebraFilmDetailsActivity.this, VodPlayActivity.class);
                myIntent.putExtra(MovieDetails.class.getSimpleName(), movieDetails);
                myIntent.putExtra("Activity", "MovieDetails");
                myIntent.putExtra("stream_id", movie.getId()); //Optional parameters
                myIntent.putExtra("stream_type", "movie");
                myIntent.putExtra("stream_extension", movie.getStream_extension());
                ZebraFilmDetailsActivity.this.startActivity(myIntent);
            }
        });
        fetchMovieDetails();
    }
    private void fetchMovieDetails() {
        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_vod_info&vod_id=" + movie.getId(), new JsonHttpResponseHandler() {
            @Override
            public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


                try {
                    movieDetails=new MovieDetails(movie.getId(),movie.getName(), res.getJSONObject("info").has("director")?res.getJSONObject("info").getString("director"):"",res.getJSONObject("info").has("plot")? res.getJSONObject("info").getString("plot"):"", res.getJSONObject("info").has("cast")?res.getJSONObject("info").getString("cast"):"", res.getJSONObject("info").has("rating")?res.getJSONObject("info").getString("rating"):"",res.getJSONObject("info").has("releasedate")?res.getJSONObject("info").getString("releasedate"):"",res.getJSONObject("info").has("movie_image")?res.getJSONObject("info").getString("movie_image"):"", res.getJSONObject("info").has("genre")?Arrays.asList(res.getJSONObject("info").getString("genre").split("/")):new ArrayList<String>(), "",res.getJSONObject("info").has("duration_secs")?res.getJSONObject("info").getInt("duration_secs"):0,res.getJSONObject("info").has("duration")?res.getJSONObject("info").getString("duration"):"");

                    //bindMovieDetails(movieDetails);

                } catch (JSONException e) {
                    movieDetails=new MovieDetails(movie.getId(),movie.getName(), "","","","","","",new ArrayList<String>(),"",0,"");
                    //bindMovieDetails(movieDetails);
                    e.printStackTrace();
                }
                bindDetails();

            }

            @Override
            public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                // called when response HTTP status is "4XX" (eg. 401, 403, 404)

                checkConnection();
            }
        });


    }

    private void bindDetails() {
        titletextview.setText(movie.getName());
        if(movieDetails.getDuration()!="0"){
        durationview.setText(movieDetails.getDuration());}
        else{durationview.setText("");}
        dateview.setText(movieDetails.getReleasedate());
        plotTextView.setText(movieDetails.getPlot());

        directorTv.setText(movieDetails.getDirector());
        if(!movieDetails.getDirector().equalsIgnoreCase("")){directorLabelTv.setText("Director:");}
        List<String> actors=Arrays.asList(movieDetails.getCast().split("/ "));
        String actorsstr="";
        for (int i=0;i<((actors.size()<4)?actors.size():4);i++){
            if(i==0){actorsstr+=actors.get(i)+" , ";}
            else if(i==((actors.size()<4)?actors.size()-1:3)){actorsstr+=actors.get(i)+"";}
            else {
                actorsstr += actors.get(i) + " , ";
            }
        }
        if(!actorsstr.equalsIgnoreCase("")){actorLabelTv.setText("Actors:");}
        actorTv.setText(actorsstr);
        loadImage(movie.getImage());

    }

    private void loadImage(String url) {
        Glide.with(this).load(url).asBitmap().into(new SimpleTarget<Bitmap>() {
            @Override
            public void onResourceReady(Bitmap resource, GlideAnimation<? super Bitmap> glideAnimation) {
                Drawable drawable = new GlideBitmapDrawable(ZebraFilmDetailsActivity.this.getResources(), resource);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                    posterimageView.setImageDrawable(drawable);


                }
            }
        });

        client.get("https://api.themoviedb.org/3/search/movie?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&language=fr&query=" + movie.getName().replace(" MULTI "," ").replace(" BLURAY ","").replace("X264-LOST","").replace("1080P","").replace(" 2013","").replace(" 2014","").replace(" 2015","").replace(" 2016","").replace(" 2017","").replace(" 2018",""), new JsonHttpResponseHandler() {
            @Override
            public void onSuccess(int statusCode, Header[] headers, JSONObject res) {


                try {
                    Glide.with(getApplicationContext()).load("http://image.tmdb.org/t/p/w500/"+res.getJSONArray("results").getJSONObject(0).getString("backdrop_path")).asBitmap().into(new SimpleTarget<Bitmap>() {
                        @Override
                        public void onResourceReady(Bitmap resource, GlideAnimation<? super Bitmap> glideAnimation) {
                            Drawable drawable = new GlideBitmapDrawable(getApplicationContext().getResources(), resource);
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                                layoutbg.setBackground(drawable);
                            }
                        }
                    });

                } catch (JSONException e) {

                }


            }

            @Override
            public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                // called when response HTTP status is "4XX" (eg. 401, 403, 404)

                checkConnection();
            }
        });



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
            Toast.makeText(ZebraFilmDetailsActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }
}

