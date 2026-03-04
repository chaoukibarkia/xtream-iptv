package zb.zebra.zebra.tvshow;

import android.os.Parcel;
import android.os.Parcelable;

import java.util.List;

import zb.zebra.Util.PaletteColors;

/**
 * Created by medbenhamed on 23/03/18.
 */

public class SaisonDetails implements Parcelable {


    public SaisonDetails() {
    }

    protected SaisonDetails(Parcel in) {
        id = in.readInt();
        name = in.readString();
        director = in.readString();
        plot = in.readString();
        cast = in.readString();
        rating = in.readString();
        releasedate = in.readString();
        movie_image = in.readString();
        genres = in.createStringArrayList();
        imdb_id = in.readString();
        duration_secs = in.readInt();
        duration = in.readString();
    }

    public SaisonDetails(int id, String name, String director, String plot, String cast, String rating, String releasedate, String movie_image, List<String> genres, String imdb_id, int duration_secs, String duration) {
        this.id = id;
        this.name = name;
        this.director = director;
        this.plot = plot;
        this.cast = cast;
        this.rating = rating;
        this.releasedate = releasedate;
        this.movie_image = movie_image;
        this.genres = genres;
        this.imdb_id = imdb_id;
        this.duration_secs = duration_secs;
        this.duration = duration;
    }

    public static final Creator<SaisonDetails> CREATOR = new Creator<SaisonDetails>() {
        @Override
        public SaisonDetails createFromParcel(Parcel in) {
            return new SaisonDetails(in);
        }

        @Override
        public SaisonDetails[] newArray(int size) {
            return new SaisonDetails[size];
        }
    };


    private int id;
    private String name;

    private String director;
    private String plot;
    private String cast;
    private String rating;
    private String releasedate;
    private String movie_image;
    private List<String> genres;
    private String imdb_id;
    private int duration_secs;
    private String duration;

    public SaisonDetails(int id, String name, String movie_image, String plot) {
        this.id = id;
        this.name = name;
        this.movie_image = movie_image;
        this.plot = plot;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
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
    public String getDirector() {
        return director;
    }

    public void setDirector(String director) {
        this.director = director;
    }

    public String getPlot() {
        return plot;
    }

    public void setPlot(String plot) {
        this.plot = plot;
    }

    public String getCast() {
        return cast;
    }

    public void setCast(String cast) {
        this.cast = cast;
    }

    public String getRating() {
        return rating;
    }

    public void setRating(String rating) {
        this.rating = rating;
    }

    public String getReleasedate() {
        return releasedate;
    }

    public void setReleasedate(String releasedate) {
        this.releasedate = releasedate;
    }

    public String getMovie_image() {
        return movie_image;
    }

    public void setMovie_image(String movie_image) {
        this.movie_image = movie_image;
    }

    public List<String> getGenres() {
        return genres;
    }

    public void setGenres(List<String> genres) {
        this.genres = genres;
    }

    public String getImdb_id() {
        return imdb_id;
    }

    public void setImdb_id(String imdb_id) {
        this.imdb_id = imdb_id;
    }

    public int getDuration_secs() {
        return duration_secs;
    }

    public void setDuration_secs(int duration_secs) {
        this.duration_secs = duration_secs;
    }

    public String getDuration() {
        return duration;
    }

    public void setDuration(String duration) {
        this.duration = duration;
    }

    @Override
    public int describeContents() {
        return 0;
    }

    @Override
    public void writeToParcel(Parcel parcel, int i) {
        parcel.writeInt(id);
        parcel.writeString(name);
        parcel.writeString(director);
        parcel.writeString(plot);
        parcel.writeString(cast);
        parcel.writeString(rating);
        parcel.writeString(releasedate);
        parcel.writeString(movie_image);
        parcel.writeStringList(genres);
        parcel.writeString(imdb_id);
        parcel.writeInt(duration_secs);
        parcel.writeString(duration);
    }

    public void setPaletteColors(PaletteColors paletteColors) {
        this.paletteColors = paletteColors;
    }
}
