package zb.zebra.zebra.tvshow;

import android.content.Context;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import java.util.ArrayList;
import java.util.List;

import zb.zebra.iptvapplication.R;


public class SaisonsAdapter extends RecyclerView.Adapter<SaisonViewHolder>
{
    private List<Saison> mSaisonList;
    private LayoutInflater mInflater;
    private Context mContext;
    private final OnItemClickListener listener;
    private final OnItemFocusChangeListener focuslistener;
    private int currentPosition;


    public interface OnItemClickListener {
        void onItemClick(Saison item, View view);
    }

    public interface OnItemFocusChangeListener {
        void onItemFocusChangeListener(Saison item, View view, int position);
    }

    public SaisonsAdapter(Context context, OnItemClickListener listener, OnItemFocusChangeListener focuslistener)
    {
        this.mContext = context;
        this.mInflater = LayoutInflater.from(context);
        this.mSaisonList = new ArrayList<>();
        this.listener = listener;
        this.focuslistener= focuslistener;
    }

    @Override
    public SaisonViewHolder onCreateViewHolder(ViewGroup parent, int viewType)
    {
        View view = mInflater.inflate(R.layout.card_saison, parent, false);
        SaisonViewHolder viewHolder = new SaisonViewHolder(view);
        return viewHolder;
    }

    @Override
    public void onBindViewHolder(SaisonViewHolder holder, int position)
    {
        holder.bind(mSaisonList.get(position), listener,focuslistener);

    }

    @Override
    public int getItemCount() 
    {
        return (mSaisonList == null) ? 0 : mSaisonList.size();
    }

    public void setSaisonsList(List<Saison> saisonList)
    {
        this.mSaisonList.clear();
        this.mSaisonList.addAll(saisonList);
        // The adapter needs to know that the data has changed. If we don't call this, app will crash.
        notifyDataSetChanged();

    }
}