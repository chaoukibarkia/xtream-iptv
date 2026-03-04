package zb.zebra.iptv;

import android.content.Context;
import android.graphics.Typeface;
import android.os.Handler;
import android.util.Log;
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
 * Created by medbenhamed on 31/01/18.
 */

public class ChannelsAdapter extends BaseAdapter {
    private List<Iptvchannel> channelsList=new ArrayList<>();
    private Context mcontext;
    Typeface font;

    public ChannelsAdapter(List<Iptvchannel> channelsList, Context mcontext) {
        this.channelsList = channelsList;
        this.mcontext = mcontext;
        font = Typeface.createFromAsset(mcontext.getAssets(), "fonts/Gotham-Medium.ttf");

    }

    public List<Iptvchannel> getChannelsList() {
        return channelsList;
    }

    public void setChannelsList(List<Iptvchannel> channelsList) {
        this.channelsList = channelsList;
    }

    @Override
    public int getCount() {
        return channelsList.size();
    }

    @Override
    public Iptvchannel getItem(int i) {
        return channelsList.get(i);
    }


    @Override
    public long getItemId(int i) {
        return i;
    }

    @Override
    public View getView(final int i, View view, ViewGroup viewGroup) {


        View v = view;
        LayoutInflater inflater = (LayoutInflater) mcontext.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
        v = inflater.inflate(R.layout.item_view, null);
        TextView name = (TextView)v.findViewById(R.id.textView);


        ImageView image = (ImageView)v.findViewById(R.id.imageView);
        final ImageView playstate = (ImageView)v.findViewById(R.id.playstate);
        ImageView favimg= (ImageView)v.findViewById(R.id.favimg);
        if(!channelsList.get(i).getImage().isEmpty())
            Glide.with(mcontext).load(channelsList.get(i).getImage()).into(
                        image
            );

        if(channelsList.get(i).isFav()){
            Log.e("Isfav","True");

            favimg.setVisibility(View.VISIBLE);}
        name.setText(channelsList.get(i).getName());
        playstate.setVisibility(channelsList.get(i).getPlayState());
        Handler mVolHandler = new Handler();
        Runnable mVolRunnable = new Runnable() {
            public void run() {
                playstate.setVisibility(View.INVISIBLE);
                channelsList.get(i).setPlayState(View.INVISIBLE);
            }
        };
        if(channelsList.get(i).getPlayState()== View.VISIBLE){
            mVolHandler.removeCallbacks(mVolRunnable);
            mVolHandler.postDelayed(mVolRunnable, 10000);
        }
        name.setTypeface(font);
        //ImageView resolutionimg = (ImageView)v.findViewById(R.id.resolutionimg);


        return v;
    }


}
