package zb.zebra.zebra.film;

import android.os.Parcel;
import android.os.Parcelable;

import com.squareup.moshi.Json;

/**
 * Created by medbenhamed on 06/02/18.
 */

public class Movie implements Parcelable {
    @Json(name = "name")
    private String name;

    private String description;
    @Json(name = "stream_icon")
    private String image;
    @Json(name = "container_extension")
    private String stream_extension;
    @Json(name = "stream_id")
    private Long id;


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
    }

    protected Movie(Parcel in) {
        this.id = in.readLong();
        this.name = in.readString();
        this.image = in.readString();
        this.description = in.readString();
        this.stream_extension = in.readString();

    }
    public Movie(Long id,String name,String image,String description,String stream_extension) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.description = description;
        this.stream_extension = stream_extension;

    }
    public static final Creator<Movie> CREATOR = new Creator<Movie>() {
        @Override
        public Movie createFromParcel(Parcel source) {
            return new Movie(source);
        }

        @Override
        public Movie[] newArray(int size) {
            return new Movie[size];
        }
    };


}
