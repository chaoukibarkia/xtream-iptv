package zb.zebra.zebra.tvshow;

import android.os.Parcel;
import android.os.Parcelable;

import com.squareup.moshi.Json;


/**
 * Created by medbenhamed on 24/03/18.
 */

public class Saison implements Parcelable {
    @Json(name = "name")
    private String name;
    @Json(name = "overview")
    private String description;
    @Json(name = "cover")
    private String image;
    @Json(name = "container_extension")
    private String stream_extension;
    @Json(name = "season_number")
    private String number;
    private int series_id;
    private String series_name;
    @Json(name = "stream_id")
    private int id;


    public String getNumber() {
        return number;
    }

    public void setNumber(String number) {
        this.number = number;
    }

    public String getSeries_name() {
        return series_name;
    }

    public void setSeries_name(String series_name) {
        this.series_name = series_name;
    }


    public int getSeries_id() {
        return series_id;
    }

    public void setSeries_id(int series_id) {
        this.series_id = series_id;
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

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    @Override
    public int describeContents() {
        return 0;
    }

    public Saison(int id, int series_id, String series_name, String name,String number) {
        this.number = number;
        this.name = name;
        this.series_id = series_id;
        this.series_name = series_name;
        this.id = id;
    }
    public Saison(int id, int series_id, String name, String number) {
        this.number = number;
        this.name = name;
        this.series_id = series_id;
        this.id = id;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeInt(this.id);
        dest.writeInt(this.series_id);
        dest.writeString(this.series_name);
        dest.writeString(this.name);
        dest.writeString(this.image);
        dest.writeString(this.description);
        dest.writeString(this.stream_extension);
        dest.writeString(this.number);
    }

    protected Saison(Parcel in) {
        this.id = in.readInt();
        this.series_id = in.readInt();
        this.series_name = in.readString();
        this.name = in.readString();
        this.image = in.readString();
        this.description = in.readString();
        this.stream_extension = in.readString();
        this.number = in.readString();

    }
    protected Saison(int id, int series_id, String series_name, String name, String image, String description, String stream_extension,String number) {
        this.id = id;
        this.series_id = series_id;
        this.series_name = series_name;
        this.name = name;
        this.image = image;
        this.description = description;
        this.stream_extension = stream_extension;
        this.number = number;

    }
    public static final Creator<Saison> CREATOR = new Creator<Saison>() {
        @Override
        public Saison createFromParcel(Parcel source) {
            return new Saison(source);
        }

        @Override
        public Saison[] newArray(int size) {
            return new Saison[size];
        }
    };

    @Override
    public String toString() {
        return "Saison{" +
                "name='" + name + '\'' +
                ", description='" + description + '\'' +
                ", image='" + image + '\'' +
                ", stream_extension='" + stream_extension + '\'' +
                ", number='" + number + '\'' +
                ", series_id=" + series_id +
                ", series_name='" + series_name + '\'' +
                ", id=" + id +
                '}';
    }
}
