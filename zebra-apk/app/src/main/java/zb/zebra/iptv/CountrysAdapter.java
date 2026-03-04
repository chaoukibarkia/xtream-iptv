package zb.zebra.iptv;

import android.content.Context;
import android.graphics.Typeface;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ImageView;
import android.widget.TextView;

import com.bumptech.glide.Glide;

import java.util.ArrayList;
import java.util.List;

import zb.zebra.iptvapplication.R;

/**
 * Created by zb on 31/01/18.
 */

public class CountrysAdapter extends BaseAdapter {
    private List<Country> countrysList=new ArrayList<>();
    private Context mcontext;
    Typeface font;

    public CountrysAdapter(List<Country> countrysList, Context mcontext) {
        this.countrysList = countrysList;
        this.mcontext = mcontext;
        font = Typeface.createFromAsset(mcontext.getAssets(), "fonts/Gotham-Medium.ttf");

    }

    public List<Country> getCountrysList() {
        return countrysList;
    }

    public void setCountrysList(List<Country> countrysList) {
        this.countrysList = countrysList;
    }

    @Override
    public int getCount() {
        return countrysList.size();
    }

    @Override
    public Country getItem(int i) {
        return countrysList.get(i);
    }


    @Override
    public long getItemId(int i) {
        return i;
    }

    @Override
    public View getView(final int i, View view, ViewGroup viewGroup) {


        View v = view;
        LayoutInflater inflater = (LayoutInflater) mcontext.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        v = inflater.inflate(R.layout.country_item_view, null);
        TextView name = (TextView)v.findViewById(R.id.textView);


        ImageView image = (ImageView)v.findViewById(R.id.imageView);
        final ImageView playstate = (ImageView)v.findViewById(R.id.playstate);
        ImageView favimg= (ImageView)v.findViewById(R.id.favimg);

            Glide.with(mcontext).load(countrysList.get(i).getFlag()).into(
                        image);


        name.setText(countrysList.get(i).getName());
        name.setTypeface(font);


        return v;
    }


}
