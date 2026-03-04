package zb.zebra.iptv;

import android.content.Context;
import android.graphics.Typeface;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.sql.Timestamp;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import zb.zebra.iptvapplication.R;

/**
     * Created by medbenhamed on 31/01/18.
     */

    public class ProgrammesAdapter extends BaseAdapter {
        private List<ProgrammeItem> programmeItems=new ArrayList<>();
        private Context mcontext;
        Typeface font;
    Typeface fontlight;

        public ProgrammesAdapter(List<ProgrammeItem> programmeItems, Context mcontext) {
            this.programmeItems = programmeItems;
            this.mcontext = mcontext;
            font = Typeface.createFromAsset(mcontext.getAssets(), "fonts/Gotham-Medium.ttf");
            fontlight = Typeface.createFromAsset(mcontext.getAssets(), "fonts/Gotham-Light.ttf");
        }

        @Override
        public int getCount() {
            return programmeItems.size();
        }

        @Override
        public Object getItem(int i) {
            return programmeItems.get(i);
        }


        @Override
        public long getItemId(int i) {
            return i;
        }

        @Override
        public View getView(int i, View view, ViewGroup viewGroup) {


            View v = view;
            LayoutInflater inflater = (LayoutInflater) mcontext.getSystemService(Context.LAYOUT_INFLATER_SERVICE);
            v = inflater.inflate(R.layout.programme_view, null);
            TextView name = (TextView)v.findViewById(R.id.textView);
            name.setTypeface(font);
            ProgressBar progressbar= (ProgressBar)v.findViewById(R.id.progressBar);
            name.setText(programmeItems.get(i).getTitle());
            TextView start = (TextView)v.findViewById(R.id.startView);
            SimpleDateFormat sdf = new SimpleDateFormat("HH'H'mm");

            if(new Date().getTime()>(programmeItems.get(i).getStop_timestamp()*1000)){
                progressbar.setProgress(100);
            }
            else if(new Date().getTime()<(programmeItems.get(i).getStart_timestamp()*1000)){
                progressbar.setProgress(0);
            }
            else{
                progressbar.setProgress((int)(((float)(new Date().getTime()-(programmeItems.get(i).getStart_timestamp()*1000))/(float)((programmeItems.get(i).getStop_timestamp()*1000)-(programmeItems.get(i).getStart_timestamp()*1000)))*100));
            }


            Timestamp timestamp = new Timestamp(programmeItems.get(i).getStart_timestamp()* 1000);
            Date progdate = new Date(timestamp.getTime());



            start.setText(sdf.format(progdate) );
            //ImageView resolutionimg = (ImageView)v.findViewById(R.id.resolutionimg);
            start.setTypeface(fontlight);

            return v;
        }


}
