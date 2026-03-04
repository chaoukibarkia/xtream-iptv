package zb.zebra.zebra.film;

import android.content.Context;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;


import java.util.ArrayList;
import java.util.List;

import zb.zebra.iptvapplication.R;


public class FilmsAdapter extends RecyclerView.Adapter<FilmViewHolder>
{
    private List<Film> mFilmList;
    private LayoutInflater mInflater;
    private Context mContext;
    private final OnItemClickListener listener;
    private final OnItemFocusChangeListener focuslistener;
    private int currentPosition;


    public interface OnItemClickListener {
        void onItemClick(Film item, View view);
    }

    public interface OnItemFocusChangeListener {
        void onItemFocusChangeListener(Film item, View view, int position);
    }

    public FilmsAdapter(Context context, OnItemClickListener listener,OnItemFocusChangeListener focuslistener)
    {
        this.mContext = context;
        this.mInflater = LayoutInflater.from(context);
        this.mFilmList = new ArrayList<>();
        this.listener = listener;
        this.focuslistener= focuslistener;
    }

    @Override
    public FilmViewHolder onCreateViewHolder(ViewGroup parent, int viewType)
    {
        View view = mInflater.inflate(R.layout.card_film, parent, false);
        FilmViewHolder viewHolder = new FilmViewHolder(view);
        return viewHolder;
    }

    @Override
    public void onBindViewHolder(FilmViewHolder holder, int position) 
    {
        holder.bind(mFilmList.get(position), listener,focuslistener);

    }

    @Override
    public int getItemCount() 
    {
        return (mFilmList == null) ? 0 : mFilmList.size();
    }

    public void setFilmList(List<Film> filmList) 
    {
        this.mFilmList.clear();
        this.mFilmList.addAll(filmList);
        // The adapter needs to know that the data has changed. If we don't call this, app will crash.
        notifyDataSetChanged();
    }
}