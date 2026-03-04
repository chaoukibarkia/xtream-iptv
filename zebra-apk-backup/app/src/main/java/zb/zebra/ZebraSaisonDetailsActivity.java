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
import android.os.Bundle;
import android.support.constraint.ConstraintLayout;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.LinearLayoutManager;
import android.support.v7.widget.RecyclerView;
import android.util.Log;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.resource.bitmap.GlideBitmapDrawable;
import com.bumptech.glide.request.animation.GlideAnimation;
import com.bumptech.glide.request.target.SimpleTarget;
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
import zb.zebra.zebra.tvshow.Episode;
import zb.zebra.zebra.tvshow.EpisodesAdapter;
import zb.zebra.zebra.tvshow.Saison;
import zb.zebra.zebra.tvshow.SaisonDetails;

public class ZebraSaisonDetailsActivity extends AppCompatActivity {
    private AsyncHttpClient client = new AsyncHttpClient();
    Saison saison;
    SaisonDetails saisonDetails;
    TextView titletextview;
    TextView durationview;
    TextView dateview;
    TextView plotTextView;


    ImageView posterimageView;
    ConstraintLayout layoutbg;
    Typeface fontblackbold;
    Typeface fontbold;
    Typeface fontlight;

    EpisodesAdapter episodesAdapter;
    JSONObject episodesObject;
    List<Episode> episodes=new ArrayList<>();
    private TextView seriestextview;
    String user = "";
    String pass = "";
    Long tvshow_id;
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
        posterimageView = findViewById(R.id.imageView);
        loadPreferences();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().getSharedElementEnterTransition().setDuration(600);
            getWindow().getSharedElementReturnTransition().setDuration(600)
                    .setInterpolator(new DecelerateInterpolator());
        }


        episodesAdapter = new EpisodesAdapter(ZebraSaisonDetailsActivity.this, new EpisodesAdapter.OnItemClickListener() {
            @Override
            public void onItemClick(Episode item, View view) {
                Intent myIntent = new Intent(ZebraSaisonDetailsActivity.this, VodPlayActivity.class);

                myIntent.putExtra(Episode.class.getSimpleName(), ((Episode) item));
                myIntent.putExtra("Activity", "SeriesDetails");
                myIntent.putExtra("stream_id", ((Episode) item).getId()); //Optional parameters
                myIntent.putExtra("stream_type", "series");
                myIntent.putExtra("stream_extension", ((Episode) item).getStream_extension());
                ZebraSaisonDetailsActivity.this.startActivity(myIntent);
            }
        }, new EpisodesAdapter.OnItemFocusChangeListener() {
            @Override
            public void onItemFocusChangeListener(Episode item, View view, int position) {

            }
        });

        RecyclerView recyclerView = (RecyclerView) findViewById(R.id.recyclerView);
        LinearLayoutManager layoutManager = new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false);
        recyclerView.setLayoutManager(layoutManager);
        recyclerView.setAdapter(episodesAdapter);
        saison = getIntent().getExtras().getParcelable(Saison.class.getSimpleName());
        tvshow_id = getIntent().getLongExtra("tvshow_id", -1);
        String imgposter = getIntent().getStringExtra("imgposter");
        Glide.with(getApplicationContext()).load(imgposter).asBitmap().into(new SimpleTarget<Bitmap>() {
            @Override
            public void onResourceReady(Bitmap resource, GlideAnimation<? super Bitmap> glideAnimation) {
                Drawable drawable = new GlideBitmapDrawable(posterimageView.getContext().getResources(), resource);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                    posterimageView.setImageDrawable(drawable);


                }
            }
        });
        titletextview = findViewById(R.id.titletextview);
        seriestextview = findViewById(R.id.seriestextview);
        durationview = findViewById(R.id.durationtextview);
        dateview = findViewById(R.id.datetextview);
        plotTextView = findViewById(R.id.plotTextView);


        titletextview.setTypeface(fontblackbold);


        layoutbg = findViewById(R.id.layoutbg);

        fetchSaisonDetails();
    }

    private void fetchSaisonDetails() {
        saisonDetails = new SaisonDetails(saison.getId(), saison.getSeries_name(), saison.getImage(), saison.getDescription());

        bindDetails();

        fetchEpisodes();
        client.get("https://api.themoviedb.org/3/search/tv?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&language=fr&query=" + saison.getSeries_name().replace("PAPPEL", "PAPEL").replace(" 2013", "").replace(" 2014", "").replace(" 2015", "").replace(" 2016", "").replace(" 2017", "").replace(" 2018", ""), new JsonHttpResponseHandler() {
            @Override
            public void onSuccess(int statusCode, Header[] headers, final JSONObject restvshow) {
                try {
                    if (restvshow.getJSONArray("results").length() > 0)
                        client.get("https://api.themoviedb.org/3/tv/" + restvshow.getJSONArray("results").getJSONObject(0).getString("id") + "/season/" + saison.getName().substring(saison.getName().lastIndexOf("SAISON") + 6).replaceAll(" ", "") + "?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&append_to_response=credits&language=fr", new JsonHttpResponseHandler() {
                            @Override
                            public void onSuccess(int statusCode, Header[] headers, JSONObject res) {

                                try {
                                    Log.e("KKK", saison.getSeries_name());
                                    StringBuilder actors = new StringBuilder();
                                    for (int i = 0; i < (res.getJSONObject("credits").getJSONArray("cast").length() > 5 ? 5 : res.getJSONObject("credits").getJSONArray("cast").length()); i++) {
                                        actors.append(actors.toString()).append(((JSONObject) res.getJSONObject("credits").getJSONArray("cast").get(i)).getString("name")).append(" , ");

                                    }
                                    Log.e("KKK", actors.toString());
                                    saisonDetails = new SaisonDetails(saison.getId(), saison.getSeries_name(), "", saison.getDescription(), actors.toString(), "", res.getString("air_date"), res.getString("poster_path"), new ArrayList<String>(), "", 0, "");
                                    if (restvshow.getJSONArray("results").length() > 0)
                                        loadImage(restvshow.getJSONArray("results").getJSONObject(0).getString("backdrop_path"));


                                } catch (JSONException e) {

                                }

                            }

                            @Override
                            public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                                // called when response HTTP status is "4XX" (eg. 401, 403, 404)

                                checkConnection();
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


    private void bindDetails() {
        seriestextview.setText(saison.getSeries_name());
        titletextview.setText(saison.getName());
        durationview.setText(saisonDetails.getDuration());
        if (saisonDetails.getReleasedate() == null) {
            dateview.setText(saisonDetails.getReleasedate());
        } else {
            dateview.setText("");
        }
        plotTextView.setText(saisonDetails.getPlot());


    }

    private void loadImage(String url) {

        Glide.with(getApplicationContext()).load("http://image.tmdb.org/t/p/w500/" + url).asBitmap().into(new SimpleTarget<Bitmap>() {
            @Override
            public void onResourceReady(Bitmap resource, GlideAnimation<? super Bitmap> glideAnimation) {
                Drawable drawable = new GlideBitmapDrawable(getApplicationContext().getResources(), resource);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                    layoutbg.setBackground(drawable);
                }
            }
        });


    }

    private void fetchEpisodes() {
        JSONArray res = null;
        client.get(MainActivity.mainlink + "/player_api.php?username=" + user + "&password=" + pass + "&action=get_series_info&series_id=" + tvshow_id, new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONObject res) {
                        Log.e("lolo", res.toString());
                        try {
                            if (res != null) {

                                episodesObject = res.getJSONObject("episodes");

                                    if (episodesObject != null) {
                                        for (int i = 0; i < episodesObject.getJSONArray(saison.getNumber()).length(); i++) {
                                            JSONObject epElement=episodesObject.getJSONArray(saison.getNumber()).getJSONObject(i);
                                            episodes.add(new Episode(epElement.getLong("id"), epElement.getString("title"), epElement.getJSONObject("info").getString("movie_image"), epElement.getJSONObject("info").getString("plot"), epElement.getString("container_extension"), i + ""));
                                        }

                                    }
                                Collections.sort(episodes, new Comparator<Episode>() {
                                    public int compare(Episode o1, Episode o2) {
                                        return Integer.parseInt(o1.getSeries_no()) - (Integer.parseInt(o2.getSeries_no()));
                                    }
                                });
                                bindEpisodes(episodes);
                            }
                        } catch (JSONException e) {

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

    private void bindEpisodes(List<Episode> episodes) {

        episodesAdapter.setEpisodesList(episodes);

    }

    protected boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo netInfo = cm.getActiveNetworkInfo();
        if (netInfo != null && netInfo.isConnectedOrConnecting()) {
            return true;
        } else {
            return false;
        }
    }

    public void checkConnection() {
        if (isOnline()) {

        } else {
            Toast.makeText(ZebraSaisonDetailsActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }

}

