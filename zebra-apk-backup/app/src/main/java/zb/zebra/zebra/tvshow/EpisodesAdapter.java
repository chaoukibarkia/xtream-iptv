package zb.zebra.zebra.tvshow;

import android.content.Context;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import java.util.ArrayList;
import java.util.List;

import zb.zebra.iptvapplication.R;


public class EpisodesAdapter extends RecyclerView.Adapter<EpisodeViewHolder>
{
    private List<Episode> mEpisodeList;
    private LayoutInflater mInflater;
    private Context mContext;
    private final OnItemClickListener listener;
    private final OnItemFocusChangeListener focuslistener;
    private int currentPosition;


    public interface OnItemClickListener {
        void onItemClick(Episode item, View view);
    }

    public interface OnItemFocusChangeListener {
        void onItemFocusChangeListener(Episode item, View view, int position);
    }

    public EpisodesAdapter(Context context, OnItemClickListener listener, OnItemFocusChangeListener focuslistener)
    {
        this.mContext = context;
        this.mInflater = LayoutInflater.from(context);
        this.mEpisodeList = new ArrayList<>();
        this.listener = listener;
        this.focuslistener= focuslistener;
    }

    @Override
    public EpisodeViewHolder onCreateViewHolder(ViewGroup parent, int viewType)
    {
        View view = mInflater.inflate(R.layout.card_episode, parent, false);
        EpisodeViewHolder viewHolder = new EpisodeViewHolder(view);
        return viewHolder;
    }

    @Override
    public void onBindViewHolder(EpisodeViewHolder holder, int position)
    {
        holder.bind(mEpisodeList.get(position), listener,focuslistener);

    }

    @Override
    public int getItemCount() 
    {
        return (mEpisodeList == null) ? 0 : mEpisodeList.size();
    }

    public void setEpisodesList(List<Episode> episodeList)
    {
        this.mEpisodeList.clear();
        this.mEpisodeList.addAll(episodeList);
        // The adapter needs to know that the data has changed. If we don't call this, app will crash.
        notifyDataSetChanged();

    }
}