package zb.zebra;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Handler;
import android.support.v4.app.ActivityOptionsCompat;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.support.v7.widget.GridLayoutManager;
import android.support.v7.widget.RecyclerView;
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

import io.michaelrocks.paranoid.Obfuscate;
import zb.zebra.iptvapplication.R;
import zb.zebra.zebra.film.Film;
import zb.zebra.zebra.film.FilmGenre;
import zb.zebra.zebra.film.FilmGenresAdapter;
import zb.zebra.zebra.film.FilmsAdapter;
import zb.zebra.zebra.film.Movie;
@Obfuscate
public class FilmZebraActivity extends AppCompatActivity {
    AsyncHttpClient client = new AsyncHttpClient();
    ListView genresListView;
    FilmGenresAdapter filmGenresAdapter;
    private String vodparent;
    Typeface fontbold;
    Typeface fontlight;
    Typeface fontblackbold;
    TextView filmsLabel;
    EditText searchfilminput;

    Moshi moshi = new Moshi.Builder().build();
    private RecyclerView mRecyclerView;
    private FilmsAdapter mAdapter;
    List<FilmGenre>filmGenres;
    private int selectedGenreindex=0;
    private int currentFilmPosition=0;
    Handler handlCountDown;

    String user="";
    String pass="";
    private TextView filmtitle;
    private TextView filmrating;

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
        setContentView(R.layout.activity_film_zebra);
        fontbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Medium.ttf");
        fontlight = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Light.ttf");
        fontblackbold = Typeface.createFromAsset(getAssets(), "fonts/Gotham-Black.ttf");
loadPreferences();
        filmsLabel=(TextView)findViewById(R.id.filmsLabel);
        filmsLabel.setTypeface(fontblackbold);
        filmtitle=findViewById(R.id.filmtitle);
        filmrating=findViewById(R.id.filmRating);
        filmtitle.setTypeface(fontblackbold);
        filmrating.setTypeface(fontblackbold);
        vodparent = getIntent().getStringExtra("vodparent");

        searchfilminput=(EditText)findViewById(R.id.searchinput);
        searchfilminput.setOnEditorActionListener(new EditText.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                       Log.e("SEARCH","DONE");
                    searchfilminput.clearFocus();
                    InputMethodManager in = (InputMethodManager)getSystemService(Context.INPUT_METHOD_SERVICE);
                    in.hideSoftInputFromWindow(searchfilminput.getWindowToken(), 0);
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
                                    client.get("https://www.machinevaisselle.tn/api/getvodsservice/getvods?searchstr='"+searchfilminput.getText()+"'", new JsonHttpResponseHandler() {
                                                @Override
                                                public void onSuccess(int statusCode, Header[] headers, JSONArray result) {

                                                    List<Film> films = new ArrayList<>();

                                                    try {
                                                        List<JSONObject> movies = new ArrayList<>();
                                                        if (result != null) {
                                                            for (int i = 0; i < result.length(); i++) {

                                                                movies.add(result.getJSONObject(i));

                                                            }
                                                            Type type = Types.newParameterizedType(List.class, Film.class);
                                                            JsonAdapter<List<Film>> jsonAdapter = moshi.adapter(type);

                                                            try {
                                                                films=(jsonAdapter.fromJson(movies.toString()));
                                                            } catch (IOException e) {
                                                                e.printStackTrace();
                                                            }
                                                        }
                                                    }
                                                    catch (JSONException e){

                                                    }


                                                    mAdapter.setFilmList(films);
                                                    mRecyclerView.requestFocus();

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

                    return true;
                }
                return false;
            }
        });
        genresListView=(ListView)findViewById(R.id.categoriesList);
        genresListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> adapterView, View view, int i, long l) {
                selectedGenreindex=i;
                getFilms(filmGenres.get(i).getId(),false,true);
                genresListView.setSelection(i);
                mRecyclerView.scrollToPosition(0);
            }
        });
        handlCountDown = new Handler();
        mRecyclerView = (RecyclerView) findViewById(R.id.recyclerView);
        mRecyclerView.setLayoutManager(new GridLayoutManager(this, 6));
        mAdapter = new FilmsAdapter(this,new FilmsAdapter.OnItemClickListener(){
            @Override public void onItemClick(Film item,View view) {
                Film film = (Film) item;
               // Intent i = new Intent(FilmZebraActivity.this, ZebraFilmDetailsActivity.class);
                // Pass the movie to the activity
                Movie movie=new Movie(film.getId(),film.getName(),film.getImage(),film.getDescription(),film.getStream_extension());
                /*i.putExtra(Movie.class.getSimpleName(), movie);


                    Bundle bundle = ActivityOptionsCompat.makeSceneTransitionAnimation(
                            FilmZebraActivity.this,
                            view.findViewById(R.id.imageView),
                            "poster_transition").toBundle();
                FilmZebraActivity.this.startActivity(i, bundle);*/
                Intent intent = new Intent(FilmZebraActivity.this, ZebraFilmDetailsActivity.class);
// Pass data object in the bundle and populate details activity.
                intent.putExtra(Movie.class.getSimpleName(), movie);
                ActivityOptionsCompat options = ActivityOptionsCompat.
                        makeSceneTransitionAnimation(FilmZebraActivity.this, view.findViewById(R.id.imageView), "poster_transition");
                startActivity(intent, options.toBundle());

               // Toast.makeText(mRecyclerView.getContext(), "Item Clicked", Toast.LENGTH_LONG).show();
            }
        },new FilmsAdapter.OnItemFocusChangeListener(){
            @Override public void onItemFocusChangeListener(Film item,View view,int position) {
            currentFilmPosition=position;
                filmtitle.setText(item.getName());
                filmrating.setText(item.getRating()+"/₁₀");
            }
        });

        mRecyclerView.setAdapter(mAdapter);

        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_vod_categories",  new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                        filmGenres=new ArrayList<>();
                        try {
                            for (int i = 0; i < res.length(); i++) {
                                JSONObject obj = (JSONObject) res.get(i);
                               if(obj.getLong("category_id")!=70) {
                                    filmGenres.add(new FilmGenre(obj.getLong("category_id"), obj.getString("category_name")));
                                }

                            }
                        }
                        catch (JSONException e){

                        }
                        filmGenresAdapter =new FilmGenresAdapter(filmGenres,FilmZebraActivity.this);
                        genresListView.setAdapter(filmGenresAdapter);
                        getFilms(filmGenres.get(0).getId(),true,false);

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
                    Log.e("SELECTED",""+currentFilmPosition+"/"+mAdapter.getItemCount());
                    if(mRecyclerView.hasFocus()&&((currentFilmPosition%(mAdapter.getItemCount()>=6?6:mAdapter.getItemCount()))==0)) {
                        genresListView.setSelector(R.drawable.channelitembgselected);
                       genresListView.requestFocus();
                       genresListView.setSelection(selectedGenreindex);

                        return true;
                    }

                    return super.dispatchKeyEvent(event);

                case KeyEvent.KEYCODE_DPAD_UP:

                    if(genresListView.hasFocus()&&genresListView.getSelectedItemPosition()==0){
                        searchfilminput.requestFocus();
                        genresListView.setSelector(android.R.color.transparent);
                        return true;
                    }
                    else if(genresListView.hasFocus()){
                        genresListView.setSelector(R.drawable.channelitembgselected);
                        if((genresListView.getSelectedItemPosition()>0)) {
                            genresListView.setSelection(genresListView.getSelectedItemPosition() - 1);
                            handlCountDown.removeCallbacks(getFilms);
                            handlCountDown.postDelayed(getFilms, 500);
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
                            handlCountDown.removeCallbacks(getFilms);
                            handlCountDown.postDelayed(getFilms, 500);
                            selectedGenreindex=genresListView.getSelectedItemPosition();
                        }
                        return true;
                        //
                    }
                    else if(searchfilminput.hasFocus()){
                        genresListView.setSelector(R.drawable.channelitembgselected);
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


    public void getFilms(Long category_id, final Boolean first,final Boolean click){

        client.get(MainActivity.mainlink+"/player_api.php?username="+user+"&password="+pass+"&action=get_vod_streams" + "&category_id=" + category_id,  new JsonHttpResponseHandler() {
                    @Override
                    public void onSuccess(int statusCode, Header[] headers, JSONArray res) {
                        List<Film> films = new ArrayList<>();

                        try {
                            List<JSONObject> movies = new ArrayList<>();
                            if (res != null) {
                                for (int i = 0; i < res.length(); i++) {

                                        movies.add(res.getJSONObject(i));

                                }
                                Type type = Types.newParameterizedType(List.class, Film.class);
                                JsonAdapter<List<Film>> jsonAdapter = moshi.adapter(type);

                                try {
                                    films=(jsonAdapter.fromJson(movies.toString()));
                                } catch (IOException e) {
                                    e.printStackTrace();
                                }
                            }
                        }
                        catch (JSONException e){

                        }


                        mAdapter.setFilmList(films);
                        if(first||!click)
                            genresListView.requestFocus();
                        else
                            mRecyclerView.requestFocus();


                    }

                    @Override
                    public void onFailure(int statusCode, Header[] headers, String res, Throwable t) {
                        // called when response HTTP status is "4XX" (eg. 401, 403, 404)
                        checkConnection();

                    }
                }
        );



    }
    private Runnable getFilms = new Runnable() {
        @Override
        public void run() {
            getFilms(filmGenres.get(genresListView.getSelectedItemPosition()).getId(),false,false);
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
            Toast.makeText(FilmZebraActivity.this, "You are not connected to internet", Toast.LENGTH_SHORT).show();

        }
    }
}
