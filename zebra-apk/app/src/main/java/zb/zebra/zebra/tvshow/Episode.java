package zb.zebra.zebra.tvshow;

import android.os.Parcel;
import android.os.Parcelable;

import com.squareup.moshi.Json;

/**
 * Created by medbenhamed on 06/02/18.
 */

public class Episode implements Parcelable {
    @Json(name = "name")
    private String name;
    @Json(name = "plot")
    private String description;
    @Json(name = "stream_icon")
    private String image;
    @Json(name = "container_extension")
    private String stream_extension;
    @Json(name = "stream_id")
    private Long id;
    @Json(name = "series_no")
    private String series_no;

    public String getSeries_no() {
        return series_no;
    }

    public void setSeries_no(String series_no) {
        this.series_no = series_no;
    }

    public String getStream_extension() {
        return stream_extension;
    }

    public void setStream_extension(String stream_extension) {
        this.stream_extension = stream_extension;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeLong(this.id);
        dest.writeString(this.name);
        dest.writeString(this.image);
        dest.writeString(this.description);
        dest.writeString(this.stream_extension);
        dest.writeString(this.series_no);
    }

    protected Episode(Parcel in) {
        this.id = in.readLong();
        this.name = in.readString();
        this.image = in.readString();
        this.description = in.readString();
        this.stream_extension = in.readString();
        this.series_no = in.readString();

    }
    public Episode(Long id, String name, String image, String description, String stream_extension, String series_no) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.description = description;
        this.stream_extension = stream_extension;
        this.series_no = series_no;

    }
    public static final Creator<Episode> CREATOR = new Creator<Episode>() {
        @Override
        public Episode createFromParcel(Parcel source) {
            return new Episode(source);
        }

        @Override
        public Episode[] newArray(int size) {
            return new Episode[size];
        }
    };


}
