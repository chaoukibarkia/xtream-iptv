package zb.zebra.zebra.film;

import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.support.v4.view.ViewCompat;
import android.support.v7.widget.RecyclerView;
import android.util.Log;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;


import com.bumptech.glide.Glide;
import com.bumptech.glide.load.resource.bitmap.GlideBitmapDrawable;
import com.bumptech.glide.request.animation.GlideAnimation;
import com.bumptech.glide.request.target.SimpleTarget;

import zb.zebra.iptvapplication.R;

public class FilmViewHolder extends RecyclerView.ViewHolder
{
    public ImageView imageView;
    public TextView textView;
    public LinearLayout overlay;
    Typeface fontbold;
    public FilmViewHolder(View itemView)
    {
        super(itemView);
        fontbold = Typeface.createFromAsset(itemView.getContext().getAssets(), "fonts/Gotham-Medium.ttf");

        imageView = (ImageView) itemView.findViewById(R.id.imageView);
        textView = (TextView) itemView.findViewById(R.id.filmTitle);
        overlay = (LinearLayout) itemView.findViewById(R.id.overlay);
    }
    public void bind(final Film film, final FilmsAdapter.OnItemClickListener listener, final FilmsAdapter.OnItemFocusChangeListener focuslistener) {
        Glide.with(itemView.getContext()).load(film.getImage()).asBitmap().into(new SimpleTarget<Bitmap>() {
            @Override
            public void onResourceReady(Bitmap resource, GlideAnimation<? super Bitmap> glideAnimation) {
                Drawable drawable = new GlideBitmapDrawable(itemView.getContext().getResources(), resource);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                    imageView.setBackground(drawable);
                }
            }
        });

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


        textView.setText(film.getName().substring(0,(film.getName().length()>30?30:film.getName().length())));
        textView.setTypeface(fontbold);
        itemView.setAlpha(0.4f);
        itemView.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                focuslistener.onItemFocusChangeListener(film,v,getLayoutPosition());
                if (hasFocus) {
                    // run scale animation and make it bigger
                    ViewCompat.setElevation(itemView, 1);
                    itemView.setAlpha(1);
                    Animation anim = AnimationUtils.loadAnimation(itemView.getContext(), R.anim.scale_in_tv);
                    itemView.startAnimation(anim);
                    anim.setFillAfter(true);
                    overlay.setVisibility(View.VISIBLE);
                } else {
                    // run scale animation and make it smaller
                    ViewCompat.setElevation(itemView, 0);
                    itemView.setAlpha(0.4f);
                    Animation anim = AnimationUtils.loadAnimation(itemView.getContext(), R.anim.scale_out_tv);
                    itemView.startAnimation(anim);
                    anim.setFillAfter(true);
                    overlay.setVisibility(View.INVISIBLE);
                }
            }
        });
        itemView.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {

                listener.onItemClick(film,v);
            }
        });
    }
}