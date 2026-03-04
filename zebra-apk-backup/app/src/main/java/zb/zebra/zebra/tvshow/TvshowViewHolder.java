package zb.zebra.zebra.tvshow;

import android.graphics.Bitmap;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.support.constraint.ConstraintLayout;
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
import com.bumptech.glide.load.resource.drawable.GlideDrawable;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.animation.GlideAnimation;
import com.bumptech.glide.request.target.SimpleTarget;
import com.bumptech.glide.request.target.Target;

import zb.zebra.iptvapplication.R;
import zb.zebra.zebra.tvshow.Tvshow;
import zb.zebra.zebra.tvshow.TvshowsAdapter;

public class TvshowViewHolder extends RecyclerView.ViewHolder
{
    public ImageView imageView;
    public TextView textView;
    public LinearLayout overlay;
    Typeface fontbold;
    public TvshowViewHolder(View itemView)
    {
        super(itemView);
        fontbold = Typeface.createFromAsset(itemView.getContext().getAssets(), "fonts/Gotham-Medium.ttf");

        imageView = (ImageView) itemView.findViewById(R.id.imageView);
        textView = (TextView) itemView.findViewById(R.id.tvshowTitle);
        overlay = (LinearLayout) itemView.findViewById(R.id.overlay);
    }
    public void bind(final Tvshow tvshow, final TvshowsAdapter.OnItemClickListener listener, final TvshowsAdapter.OnItemFocusChangeListener focuslistener) {
        Glide.with(itemView.getContext()).load(tvshow.getImage()).asBitmap().listener(new RequestListener<String, Bitmap>() {


            @Override
            public boolean onException(Exception e, String model, Target<Bitmap> target, boolean isFirstResource) {
                Glide.with(itemView.getContext()).load(R.drawable.unnamed).asBitmap().into(new SimpleTarget<Bitmap>() {
                    @Override
                    public void onResourceReady(Bitmap resource, GlideAnimation<? super Bitmap> glideAnimation) {
                        Drawable drawable = new GlideBitmapDrawable(itemView.getContext().getResources(), resource);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                            imageView.setBackground(drawable);
                        }
                    }
                });
                return false;
            }

            @Override
            public boolean onResourceReady(Bitmap resource, String model, Target<Bitmap> target, boolean isFromMemoryCache, boolean isFirstResource) {
                return false;
            }
        }).into(new SimpleTarget<Bitmap>() {
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
              /*  */
                Log.e("width","width"+imageView.getLayoutParams().width);
                imageView.getLayoutParams().height = (int)(imageView.getMeasuredWidth()*1.5);
                imageView.requestLayout();
                Log.e("height","height"+imageView.getLayoutParams().height);
                return true;
            }
        });


        textView.setText(tvshow.getName().substring(0,(tvshow.getName().length()>30?30:tvshow.getName().length())));
        textView.setTypeface(fontbold);

        itemView.setAlpha(0.4f);
        itemView.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean hasFocus) {
                focuslistener.onItemFocusChangeListener(tvshow,v,getLayoutPosition());
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

                listener.onItemClick(tvshow,v);
            }
        });
    }
}