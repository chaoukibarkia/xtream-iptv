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
import androidx.constraintlayout.widget.ConstraintLayout;
import androidx.core.app.ActivityOptionsCompat;
import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;

import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import android.util.Log;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.CustomTarget;
import com.bumptech.glide.request.transition.Transition;
import com.bumptech.glide.request.target.Target;
import android.graphics.drawable.BitmapDrawable;
import com.loopj.android.http.AsyncHttpClient;
import com.loopj.android.http.JsonHttpResponseHandler;
import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.Moshi;
import com.squareup.moshi.Types;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;

import cz.msebera.android.httpclient.Header;

import zb.zebra.iptvapplication.R;
import zb.zebra.zebra.film.Movie;
import zb.zebra.zebra.tvshow.Saison;
import zb.zebra.zebra.tvshow.SaisonsAdapter;
import zb.zebra.zebra.tvshow.Saison;
import zb.zebra.zebra.tvshow.SaisonsAdapter;
import zb.zebra.zebra.tvshow.Tvshow;
import zb.zebra.zebra.tvshow.TvshowDetails;

public class ZebraTvshowDetailsActivity extends AppCompatActivity {
    private AsyncHttpClient client=new AsyncHttpClient();
    Tvshow tvshow;
    TvshowDetails tvshowDetails;
    TextView titletextview;
    TextView durationview;
    TextView dateview;
    TextView plotTextView;

    ImageView posterimageView;
    ConstraintLayout layoutbg;
    Typeface fontblackbold;
    Typeface fontbold;
    Typeface fontlight;
    RecyclerView recyclerView;
    SaisonsAdapter saisonsAdapter;
    JSONObject saisonsJson;
    private TextView seriestextview;
    String user="";
    String pass="";
    Moshi moshi = new Moshi.Builder().build();
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
        setContentView(R.layout.activity_zebra_tvshow_details);
        fontblackbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Black.ttf");
        fontbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Medium.ttf");
        fontlight = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        posterimageView=findViewById(R.id.imageView);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().getSharedElementEnterTransition().setDuration(600);
            getWindow().getSharedElementReturnTransition().setDuration(600)
                    .setInterpolator(new DecelerateInterpolator());
        }
        loadPreferences();

        saisonsAdapter=new SaisonsAdapter(ZebraTvshowDetailsActivity.this, new SaisonsAdapter.OnItemClickListener() {
            @Override
            public void onItemClick(Saison item, View view) {
                Saison saison = (Saison) item;
                // Intent i = new Intent(TvshowZebraActivity.this, ZebraTvshowDetailsActivity.class);
                // Pass the movie to the activity

                /*i.putExtra(Movie.class.getSimpleName(), movie);


                    Bundle bundle = ActivityOptionsCompat.makeSceneTransitionAnimation(
                            TvshowZebraActivity.this,
                            view.findViewById(R.id.imageView),
                            "poster_transition").toBundle();
                TvshowZebraActivity.this.startActivity(i, bundle);*/
                Intent intent = new Intent(ZebraTvshowDetailsActivity.this, ZebraSaisonDetailsActivity.class);
// Pass data object in the bundle and populate details activity.
                intent.putExtra(Saison.class.getSimpleName(), saison);
                intent.putExtra("tvshow_id", tvshow.getId());
                intent.putExtra("imgposter",((ImageView)view.findViewById(R.id.imageView)).getTag().toString());
                ActivityOptionsCompat options = ActivityOptionsCompat.
                        makeSceneTransitionAnimation(ZebraTvshowDetailsActivity.this, view.findViewById(R.id.imageView), "poster_transition");
                startActivity(intent, options.toBundle());
            }
        }, new SaisonsAdapter.OnItemFocusChangeListener() {
            @Override
            public void onItemFocusChangeListener(Saison item, View view, int position) {

            }
        });

        recyclerView= (RecyclerView) findViewById(R.id.recyclerView);
        LinearLayoutManager layoutManager = new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false);
        recyclerView.setLayoutManager(layoutManager);
        recyclerView.setAdapter(saisonsAdapter);
        Movie movie=getIntent().getExtras().getParcelable(Movie.class.getSimpleName());
        tvshow=new Tvshow(movie.getId(),movie.getName(),movie.getImage(),movie.getDescription(),"");

        String imgposter=tvshow.getImage();
        Glide.with(getApplicationContext()).asBitmap().load(imgposter).into(new CustomTarget<Bitmap>() {
            @Override
            public void onResourceReady(Bitmap resource, Transition<? super Bitmap> transition) {
                BitmapDrawable drawable = new BitmapDrawable(posterimageView.getContext().getResources(), resource);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                    posterimageView.setImageDrawable(drawable);


                }
            }
            
            @Override
            public void onLoadCleared(Drawable placeholder) {
            }
        });
        titletextview=findViewById(R.id.titletextview);
        seriestextview=findViewById(R.id.seriestextview);
        durationview=findViewById(R.id.durationtextview);
        dateview=findViewById(R.id.datetextview);
        plotTextView=findViewById(R.id.plotTextView);



        titletextview.setTypeface(fontblackbold);


        layoutbg=findViewById(R.id.layoutbg);

        fetchTvshowDetails();
    }
    private void fetchTvshowDetails() {
        tvshowDetails=new TvshowDetails(tvshow.getId(),tvshow.getName(), tvshow.getImage(), tvshow.getDescription());

        bindDetails();

        fetchSaisons();


    }


    private void bindDetails() {
        seriestextview.setText(tvshow.getName());
        titletextview.setText(tvshow.getName());
        plotTextView.setText(tvshow.getDescription());



    }

    private void loadImage(String url) {

                    Glide.with(getApplicationContext()).asBitmap().load(url).into(new CustomTarget<Bitmap>() {
                        @Override
                        public void onResourceReady(Bitmap resource, Transition<? super Bitmap> transition) {
                            BitmapDrawable drawable = new BitmapDrawable(getApplicationContext().getResources(), resource);
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                                layoutbg.setBackground(drawable);
                            }
                        }
                        
                        @Override
                        public void onLoadCleared(Drawable placeholder) {
                        }
                    });




    }
    private void fetchSaisons() {
        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_series_info&series_id="+ tvshow.getId(),  new JsonHttpResponseHandler() {
            @Override
            public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                Log.e("saisonlist",res.toString());
                List<Saison> saisonlist=new ArrayList<>();
                try {
                    List<JSONObject> movies = new ArrayList<>();

                    if (res != null) {

                        if (res.get("seasons") instanceof JSONArray)
                        {
                            for (int i = 0; i < res.getJSONArray("seasons").length(); i++) {

                                    movies.add(res.getJSONArray("seasons").getJSONObject(i));
                            }
                        }
                        else
                        {
                            Iterator itr = res.getJSONObject("seasons").keys();
                            while(itr.hasNext()) {
                                String element = (String) itr.next();
                                    movies.add(res.getJSONObject("seasons").getJSONObject(element));

                            }


                        }



                        Type type = Types.newParameterizedType(List.class, Saison.class);
                        JsonAdapter<List<Saison>> jsonAdapter = moshi.adapter(type);
                        Log.e("backdrop",res.getJSONObject("info").getJSONArray("backdrop_path").get(0).toString());
                        loadImage(res.getJSONObject("info").getJSONArray("backdrop_path").get(0).toString());

                        try {
                            saisonlist=(jsonAdapter.fromJson(movies.toString()));
                            List<Saison>saisons=new ArrayList<>();
                            for(int i=0;i<saisonlist.size();i++){
                                if(res.getJSONObject("episodes").has(saisonlist.get(i).getNumber())) {
                                    saisonlist.get(i).setSeries_name(tvshow.getName());
                                    saisons.add(saisonlist.get(i));
                                }
                            }

                            bindSaisons(saisons);

                        } catch (IOException e) {
                            e.printStackTrace();
                        }
                       // saisons=res.getJSONObject("saisons");
                    }
                }
                catch (JSONException e){

                }




            }

            @Override
            public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                checkConnection();

            }
        });


            }
            private void bindSaisons(List<Saison> saisons) {

                saisonsAdapter.setSaisonsList(saisons);

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
            Toast.makeText(ZebraTvshowDetailsActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }

}

