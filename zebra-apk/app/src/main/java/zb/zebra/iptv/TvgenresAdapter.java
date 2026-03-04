package zb.zebra.iptv;

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

    public class TvgenresAdapter extends BaseAdapter {
        private List<Tvgenre> tvgenres=new ArrayList<>();
        private Context mcontext;
        Typeface font;
        public TvgenresAdapter(List<Tvgenre> tvgenres, Context mcontext) {
            this.tvgenres = tvgenres;
            this.mcontext = mcontext;
            font = Typeface.createFromAsset(mcontext.getAssets(), "fonts/Gotham-Medium.ttf");

        }

        @Override
        public int getCount() {
            return tvgenres.size();
        }

        @Override
        public Object getItem(int i) {
            return tvgenres.get(i);
        }

        @Override
        public long getItemId(int i) {
            return i;
        }

        @Override
        public View getView(int i, View view, ViewGroup viewGroup) {


            View v = view;
            LayoutInflater inflater = (LayoutInflater) mcontext.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
            v = inflater.inflate(R.layout.item_view, null);
            TextView name = (TextView)v.findViewById(R.id.textView);
            name.setText(tvgenres.get(i).getName());
            name.setTypeface(font);
            //ImageView resolutionimg = (ImageView)v.findViewById(R.id.resolutionimg);
            return v;
        }


}
