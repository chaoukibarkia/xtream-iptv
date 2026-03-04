package zb.zebra;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Handler;
import androidx.core.app.ActivityOptionsCompat;
import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

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
import java.text.BreakIterator;
import java.util.ArrayList;
import java.util.List;

import cz.msebera.android.httpclient.Header;

import zb.zebra.iptvapplication.R;
import zb.zebra.zebra.film.Movie;
import zb.zebra.zebra.tvshow.Saison;
import zb.zebra.zebra.tvshow.TvshowGenre;
import zb.zebra.zebra.tvshow.TvshowGenresAdapter;
import zb.zebra.zebra.tvshow.SaisonsAdapter;
import zb.zebra.zebra.tvshow.*;

public class TvshowZebraActivity extends AppCompatActivity {
    AsyncHttpClient client = new AsyncHttpClient();
    ListView genresListView;
    TvshowGenresAdapter tvshowGenresAdapter;
    private String vodparent;
    Typeface fontbold;
    Typeface fontlight;
    Typeface fontblackbold;
    TextView tvshowsLabel;

    Moshi moshi = new Moshi.Builder().build();
    private RecyclerView mRecyclerView;
    private TvshowsAdapter mAdapter;
    List<TvshowGenre>tvshowGenres;
    private int selectedGenreindex=0;
    private int currentTvshowPosition=0;
    Handler handlCountDown;

    String user="";
    String pass="";
    private TextView tvshowtitle;
    private TextView tvshowrating;

    private EditText searchtvshowinput;
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
        setContentView(R.layout.activity_tvshow_zebra);
        fontbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Medium.ttf");
        fontlight = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        fontblackbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Black.ttf");
        loadPreferences();
        tvshowsLabel=(TextView)findViewById(R.id.tvshowsLabel);
        tvshowsLabel.setTypeface(fontblackbold);
        vodparent = getIntent().getStringExtra("vodparent");


        genresListView=(ListView)findViewById(R.id.categoriesList);
        genresListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int i, long l) {
                selectedGenreindex=i;
                getTvshows(tvshowGenres.get(i).getId(),false,true);
                genresListView.setSelection(i);
            }
        });
        handlCountDown = new Handler();
        mRecyclerView = (RecyclerView) findViewById(R.id.recyclerView);
        mRecyclerView.setLayoutManager(new GridLayoutManager(this, 6));
        searchtvshowinput=(EditText)findViewById(R.id.searchinput);
        searchtvshowinput.setOnEditorActionListener(new EditText.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                    Log.e("SEARCH","DONE");
                    searchtvshowinput.clearFocus();
                    InputMethodManager in = (InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);
                    in.hideSoftInputFromWindow(searchtvshowinput.getWindowToken(), 0);
                    
                    // Use new Xtream API with search parameter
                    String searchQuery = searchtvshowinput.getText().toString();
                    client.get(MainActivity.mainlink + "/player_api.php?username=" + user + "&password=" + pass + "&action=get_series&search=" + Uri.encode(searchQuery), new JsonHttpResponseHandler() {
                        @Override
                        public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                            List<Tvshow> tvshows=new ArrayList<>();
                            try {
                                for (int i = 0; i < res.length(); i++) {
                                    JSONObject obj = (JSONObject) res.get(i);
                                    Long seriesId = obj.has("series_id") ? obj.getLong("series_id") : 0L;
                                    String name = obj.has("name") ? obj.getString("name") : "";
                                    String cover = obj.has("cover") ? obj.getString("cover") : "";
                                    String plot = obj.has("plot") ? obj.getString("plot") : "";
                                    
                                    tvshows.add(new Tvshow(seriesId, name, cover, plot, ""));
                                }
                            }
                            catch (JSONException e){
                                Log.e("ERROR", "Failed to parse series search results: " + e.getMessage());
                            }

                            mAdapter.setTvshowList(tvshows);
                            mRecyclerView.requestFocus();
                            mRecyclerView.getChildAt(0).requestFocus();
                        }

                        @Override
                        public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                            Log.e("error", "Failed to search series: " + t.getMessage());
                            checkConnection();
                        }
                    });

                    return true;
                }
                return false;
            }
        });
        mAdapter = new TvshowsAdapter(this,new TvshowsAdapter.OnItemClickListener(){
            @Override public void onItemClick(Tvshow item,View view) {
                Tvshow tvshow = (Tvshow) item;
                // Intent i = new Intent(TvshowZebraActivity.this, ZebraTvshowDetailsActivity.class);
                // Pass the movie to the activity
                Log.e("PPP",tvshow.getId()+"");
                Movie movie=new Movie(tvshow.getId(),tvshow.getName(),tvshow.getImage(),tvshow.getDescription(),tvshow.getStream_extension());
                /*i.putExtra(Movie.class.getSimpleName(), movie);


                    Bundle bundle = ActivityOptionsCompat.makeSceneTransitionAnimation(
                            TvshowZebraActivity.this,
                            view.findViewById(R.id.imageView),
                            "poster_transition").toBundle();
                TvshowZebraActivity.this.startActivity(i, bundle);*/
                Intent intent = new Intent(TvshowZebraActivity.this, ZebraTvshowDetailsActivity.class);
// Pass data object in the bundle and populate details activity.
                intent.putExtra(Movie.class.getSimpleName(), movie);
                ActivityOptionsCompat options = ActivityOptionsCompat.
                        makeSceneTransitionAnimation(TvshowZebraActivity.this, view.findViewById(R.id.imageView), "poster_transition");
                startActivity(intent, options.toBundle());

                // Toast.makeText(mRecyclerView.getContext(), "Item Clicked", Toast.LENGTH_LONG).show();
            }
        },new TvshowsAdapter.OnItemFocusChangeListener(){
            @Override public void onItemFocusChangeListener(Tvshow item,View view,int position) {
                currentTvshowPosition=position;
            }
        });

        mRecyclerView.setAdapter(mAdapter);

        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_series_categories",  new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                        tvshowGenres=new ArrayList<>();
                        try {
                            for (int i = 0; i < res.length(); i++) {
                                JSONObject obj = (JSONObject) res.get(i);
                                    tvshowGenres.add(new TvshowGenre(obj.getLong("category_id"), obj.getString("category_name")));

                            }
                        }
                        catch (JSONException e){

                        }
                        tvshowGenresAdapter =new TvshowGenresAdapter(tvshowGenres,TvshowZebraActivity.this);
                        genresListView.setAdapter(tvshowGenresAdapter);
                        getTvshows(tvshowGenres.get(0).getId(),true,false);

                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                        // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                        Log.e("Log","Failed");
                        checkConnection();
                    }
                }
        );
    }
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if((event.getAction() == KeyEvent.ACTION_DOWN)){
            Log.e("KEY",event.getKeyCode()+"");
            switch (event.getKeyCode()) {

                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if(mRecyclerView.hasFocus()&&((currentTvshowPosition%(mAdapter.getItemCount()>=6?6:mAdapter.getItemCount()))==0)) {
                        genresListView.setSelector(R.drawable.channelitembgselected);
                        genresListView.requestFocus();
                        genresListView.setSelection(selectedGenreindex);
                        if (!searchtvshowinput.getText().toString().equals("")){
                            searchtvshowinput.setText("");
                            handlCountDown.removeCallbacks(getTvshows);
                            handlCountDown.postDelayed(getTvshows, 500);
                        }

                        return true;
                    }

                    return super.dispatchKeyEvent(event);

                case KeyEvent.KEYCODE_DPAD_UP:

                    if(genresListView.hasFocus()&&genresListView.getSelectedItemPosition()==0){
                        searchtvshowinput.requestFocus();
                        genresListView.setSelector(R.drawable.channelitembgselected);
                        return true;
                    }
                    else if(genresListView.hasFocus()){
                        genresListView.setSelector(R.drawable.channelitembgselected);
                        if((genresListView.getSelectedItemPosition()>0)) {
                            genresListView.setSelection(genresListView.getSelectedItemPosition() - 1);
                            handlCountDown.removeCallbacks(getTvshows);
                            handlCountDown.postDelayed(getTvshows, 500);
                            selectedGenreindex=genresListView.getSelectedItemPosition();
                        }
                        return true;
                        //
                    }
                    else{
                        return super.dispatchKeyEvent(event);}
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if(genresListView.hasFocus()&&genresListView.getSelectedItemPosition()==genresListView.getCount()-1){
                        genresListView.setSelector(R.drawable.channelitembgselected);
                        return true;
                    }
                    else if(genresListView.hasFocus()){
                        genresListView.setSelector(R.drawable.channelitembgselected);
                        if((genresListView.getSelectedItemPosition()+1<genresListView.getCount())) {

                            genresListView.setSelection(genresListView.getSelectedItemPosition() + 1);
                            handlCountDown.removeCallbacks(getTvshows);
                            handlCountDown.postDelayed(getTvshows, 500);
                            selectedGenreindex=genresListView.getSelectedItemPosition();
                        }
                        return true;
                        //
                    }
                    else{
                        return super.dispatchKeyEvent(event);}
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if(genresListView.hasFocus()){
                        genresListView.setSelector(R.drawable.channelitembgselected);
                        selectedGenreindex=genresListView.getSelectedItemPosition();

                    }
                    return super.dispatchKeyEvent(event);
                default:

                    return super.dispatchKeyEvent(event);
            }}
        else{      return super.dispatchKeyEvent(event);}

    }


    public void getTvshows(final Long category_id, final Boolean first, final Boolean click){

        // Use new Xtream API with category filtering
        client.get(MainActivity.mainlink + "/player_api.php?username=" + user + "&password=" + pass + "&action=get_series&category_id=" + category_id, new JsonHttpResponseHandler() {
            @Override
            public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                List<Tvshow> tvshows=new ArrayList<>();
                try {
                    for (int i = 0; i < res.length(); i++) {
                        JSONObject obj = (JSONObject) res.get(i);
                        
                        Long seriesId = obj.has("series_id") ? obj.getLong("series_id") : 0L;
                        String name = obj.has("name") ? obj.getString("name") : "";
                        String cover = obj.has("cover") ? obj.getString("cover") : "";
                        String plot = obj.has("plot") ? obj.getString("plot") : "";
                        
                        tvshows.add(new Tvshow(seriesId, name, cover, plot, ""));
                    }
                }
                catch (JSONException e){
                    Log.e("ERROR", "Failed to parse series: " + e.getMessage());
                }

                mAdapter.setTvshowList(tvshows);
                if(first||!click)
                    genresListView.requestFocus();
                else{
                    mRecyclerView.requestFocus();
                    mRecyclerView.scrollToPosition(0);
                    mRecyclerView.getChildAt(0).requestFocus();
                }
            }

            @Override
            public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                Log.e("error", "Failed to fetch series by category: " + t.getMessage());
                checkConnection();
            }
        });
    }



    private Runnable getTvshows = new Runnable() {
        @Override
        public void run() {
            if(!searchtvshowinput.hasFocus()){
            searchtvshowinput.setText("");
            getTvshows(tvshowGenres.get(genresListView.getSelectedItemPosition()).getId(),false,false);}
        }
    };
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
            Toast.makeText(TvshowZebraActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }
}
