package zb.zebra.zebra.tvshow;

import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Build;
import androidx.constraintlayout.widget.ConstraintLayout;
import androidx.core.view.ViewCompat;
import androidx.recyclerview.widget.RecyclerView;
import android.util.Log;
import android.view.View;
import android.view.ViewTreeObserver;
import android.widget.ImageView;
import android.widget.TextView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.CustomTarget;
import com.bumptech.glide.request.transition.Transition;
import com.bumptech.glide.request.target.Target;
import android.graphics.drawable.BitmapDrawable;
import com.loopj.android.http.AsyncHttpClient;

import java.util.HashMap;
import java.util.Map;

import zb.zebra.iptvapplication.R;

public class SaisonViewHolder extends RecyclerView.ViewHolder
{
    private AsyncHttpClient client=new AsyncHttpClient();
    public ImageView imageView;
    public TextView textView;
    public ConstraintLayout overlay;
    Typeface fontbold;
    Map<Integer,String> staticposters=new HashMap<>();


    public SaisonViewHolder(View itemView)
    {
        super(itemView);
        staticposters.put(34,"https://upload.wikimedia.org/wikipedia/en/thumb/5/5c/Billions-KeyArt.jpg/500px-Billions-KeyArt.jpg");
        staticposters.put(33,"https://ia.media-imdb.com/images/M/MV5BNDQ3OTMyMzM5NF5BMl5BanBnXkFtZTgwOTA2NzU2NDM@._V1_SX300.jpg");
        staticposters.put(43,"https://images-na.ssl-images-amazon.com/images/M/MV5BMTI4MDY5MTc5OF5BMl5BanBnXkFtZTcwMTMyMTk3Mg@@._V1_SX300.jpg");
        staticposters.put(48,"https://ia.media-imdb.com/images/M/MV5BMTU1OTcwNjg2Nl5BMl5BanBnXkFtZTgwOTk0NTk0MjI@._V1_SX300.jpg");
        staticposters.put(49,"http://fr.web.img4.acsta.net/pictures/16/05/20/11/42/132767.jpg");
        staticposters.put(40,"http://fr.web.img2.acsta.net/pictures/17/05/03/08/45/266320.jpg");
        staticposters.put(41,"https://images.justwatch.com/poster/42182848/s592/La-casa-de-papel");
        fontbold = Typeface.createFromAsset(itemView.getContext().getAssets(), "fonts/Gotham-Medium.ttf");

        imageView = (ImageView) itemView.findViewById(R.id.imageView);
        textView = (TextView) itemView.findViewById(R.id.saisonTitle);
        overlay =  itemView.findViewById(R.id.overlay);
    }
    public void bind(final Saison saison, final SaisonsAdapter.OnItemClickListener listener, final SaisonsAdapter.OnItemFocusChangeListener focuslistener) {
        imageView.setImageResource(R.drawable.empty);

                            imageView.setTag(saison.getImage());
                            Glide.with(itemView.getContext()).asBitmap().load(saison.getImage()).into(new CustomTarget<Bitmap>() {
                                                                                                          @Override
                                                                                                          public void onResourceReady(Bitmap resource, Transition<? super Bitmap> transition) {
                                                                                                              BitmapDrawable drawable = new BitmapDrawable(itemView.getContext().getResources(), resource);
                                                                                                              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                                                                                                                  imageView.setImageDrawable(drawable);


                                                                                                              }
                                                                                                          }
                                                                                                          
                                                                                                          @Override
                                                                                                          public void onLoadCleared(Drawable placeholder) {
                                                                                                          }
                                                                                                      });


        textView.setText(saison.getName().substring(0,(saison.getName().length()>30?30:saison.getName().length())));
        textView.setTypeface(fontbold);
        ViewTreeObserver vto = imageView.getViewTreeObserver();
        int finalHeight, finalWidth;
        vto.addOnPreDrawListener(new ViewTreeObserver.OnPreDrawListener() {
            public boolean onPreDraw() {
                imageView.getViewTreeObserver().removeOnPreDrawListener(this);

                Log.e("width","width"+imageView.getLayoutParams().width);
                imageView.getLayoutParams().height = (int)(imageView.getMeasuredWidth()*1.5);
                imageView.requestLayout();
                Log.e("height","height"+imageView.getLayoutParams().height);
                return true;
            }
        });

        itemView.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                focuslistener.onItemFocusChangeListener(saison,v,getLayoutPosition());
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

                listener.onItemClick(saison,v);
            }
        });
    }
}