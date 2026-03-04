package zb.zebra.zebra.tvshow;

import android.content.Context;
import android.graphics.Typeface;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

import zb.zebra.iptvapplication.R;

/**
     * Created by medbenhamed on 31/01/18.
     */

    public class TvshowGenresAdapter extends BaseAdapter {
        private List<TvshowGenre> filmGenres=new ArrayList<>();
        private Context mcontext;
    Typeface fontlight;

        public TvshowGenresAdapter(List<TvshowGenre> filmGenres, Context mcontext) {
            this.filmGenres = filmGenres;
            this.mcontext = mcontext;

        }

        @Override
        public int getCount() {
            return filmGenres.size();
        }

        @Override
        public Object getItem(int i) {
            return filmGenres.get(i);
        }

        @Override
        public long getItemId(int i) {
            return i;
        }

        @Override
        public View getView(int i, View view, ViewGroup viewGroup) {

            fontlight = Typeface.createFromAsset(mcontext.getAssets(), "fonts/Gotham-Medium.ttf");
            View v = view;
            LayoutInflater inflater = (LayoutInflater) mcontext.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
            v = inflater.inflate(R.layout.filmgenre_view, null);
            TextView name = (TextView)v.findViewById(R.id.textView);
            name.setText(filmGenres.get(i).getName());
            name.setTypeface(fontlight);
            //ImageView resolutionimg = (ImageView)v.findViewById(R.id.resolutionimg);
            return v;
        }


}
