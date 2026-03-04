package zb.zebra.zebra.tvshow;

import android.os.Parcel;
import android.os.Parcelable;

import java.util.List;

import zb.zebra.Util.PaletteColors;


public class TvshowDetails implements Parcelable {


    public TvshowDetails() {
    }

    protected TvshowDetails(Parcel in) {
        id = in.readLong();
        name = in.readString();
        movie_image = in.readString();
        description = in.readString();
    }

    public TvshowDetails(Long id, String name, String movie_image, String description) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.movie_image = movie_image;
    }

    public static final Creator<TvshowDetails> CREATOR = new Creator<TvshowDetails>() {
        @Override
        public TvshowDetails createFromParcel(Parcel in) {
            return new TvshowDetails(in);
        }

        @Override
        public TvshowDetails[] newArray(int size) {
            return new TvshowDetails[size];
        }
    };


    private Long id;
    private String name;
    private String description;
    private String movie_image;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public PaletteColors getPaletteColors() {
        return paletteColors;
    }

    private PaletteColors paletteColors;


    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel parcel, int i) {
        parcel.writeLong(id);
        parcel.writeString(name);
        parcel.writeString(description);
        parcel.writeString(movie_image);
    }

    public void setPaletteColors(PaletteColors paletteColors) {
        this.paletteColors = paletteColors;
    }
}
