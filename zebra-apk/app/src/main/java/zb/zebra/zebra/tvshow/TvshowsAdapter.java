package zb.zebra.zebra.tvshow;

import android.content.Context;
import androidx.recyclerview.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import java.util.ArrayList;
import java.util.List;

import zb.zebra.iptvapplication.R;


public class TvshowsAdapter extends RecyclerView.Adapter<TvshowViewHolder>
{
    private List<Tvshow> mTvshowList;
    private LayoutInflater mInflater;
    private Context mContext;
    private final OnItemClickListener listener;
    private final OnItemFocusChangeListener focuslistener;
    private int currentPosition;


    public interface OnItemClickListener {
        void onItemClick(Tvshow item, View view);
    }

    public interface OnItemFocusChangeListener {
        void onItemFocusChangeListener(Tvshow item, View view, int position);
    }

    public TvshowsAdapter(Context context, OnItemClickListener listener, OnItemFocusChangeListener focuslistener)
    {
        this.mContext = context;
        this.mInflater = LayoutInflater.from(context);
        this.mTvshowList = new ArrayList<>();
        this.listener = listener;
        this.focuslistener= focuslistener;
    }

    @Override
    public TvshowViewHolder onCreateViewHolder(ViewGroup parent, int viewType)
    {
        View view = mInflater.inflate(R.layout.card_tvshow, parent, false);
        TvshowViewHolder viewHolder = new TvshowViewHolder(view);
        return viewHolder;
    }

    @Override
    public void onBindViewHolder(TvshowViewHolder holder, int position) 
    {
        holder.bind(mTvshowList.get(position), listener,focuslistener);

    }

    @Override
    public int getItemCount() 
    {
        return (mTvshowList == null) ? 0 : mTvshowList.size();
    }

    public void setTvshowList(List<Tvshow> tvshowList) 
    {
        this.mTvshowList.clear();
        this.mTvshowList.addAll(tvshowList);
        // The adapter needs to know that the data has changed. If we don't call this, app will crash.
        notifyDataSetChanged();
    }
}