package zb.zebra.zebra.tvshow;

import android.graphics.Typeface;
import androidx.constraintlayout.widget.ConstraintLayout;
import androidx.core.view.ViewCompat;
import androidx.recyclerview.widget.RecyclerView;
import android.view.View;
import android.widget.ImageView;
import android.widget.TextView;


import com.bumptech.glide.Glide;
import com.loopj.android.http.AsyncHttpClient;


import java.util.HashMap;
import java.util.Map;


import zb.zebra.iptvapplication.R;

public class EpisodeViewHolder extends RecyclerView.ViewHolder
{
    private AsyncHttpClient client=new AsyncHttpClient();
    public ImageView imageView;
    public TextView textView;
    public ConstraintLayout overlay;
    Typeface fontbold;
    Map<Integer,String> staticposters=new HashMap<>();


    public EpisodeViewHolder(View itemView)
    {
        super(itemView);

        fontbold = Typeface.createFromAsset(itemView.getContext().getAssets(), "fonts/Gotham-Medium.ttf");

        imageView = (ImageView) itemView.findViewById(R.id.imageView);
        textView = (TextView) itemView.findViewById(R.id.episodeTitle);
        overlay =  itemView.findViewById(R.id.overlay);
    }
    public void bind(final Episode episode, final EpisodesAdapter.OnItemClickListener listener, final EpisodesAdapter.OnItemFocusChangeListener focuslistener) {

        if(episode!=null&&episode.getImage()!=null&&!episode.getImage().isEmpty()){


            Glide.with(imageView.getContext())
                    .load(episode.getImage())
                    .into(imageView);}
        textView.setText(episode.getName());
        textView.setTypeface(fontbold);

        itemView.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                focuslistener.onItemFocusChangeListener(episode,v,getLayoutPosition());
                if (hasFocus) {
                    // run scale animation and make it bigger
                    ViewCompat.setElevation(itemView, 1);
                    overlay.setVisibility(View.VISIBLE);

                } else {
                    // run scale animation and make it smaller
                    ViewCompat.setElevation(itemView, 0);
                    overlay.setVisibility(View.INVISIBLE);
                }
            }
        });
        itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {

                listener.onItemClick(episode,v);
            }
        });
    }
}