package zb.zebra.iptv;

import android.view.View;

/**
 * Created by medbenhamed on 06/02/18.
 */

public class Iptvchannel {

        String name;
        String image;
        Long category_id;
        Long id;
        int playState= View.INVISIBLE;
        boolean isFav= false;

    public Iptvchannel(Long id, String name, String image,Boolean isFav,Long category_id) {
        this.name = name;
        this.image = image;
        this.id = id;
        this.playState=View.INVISIBLE;
        this.isFav=isFav;
        this.category_id=category_id;
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

    public int getPlayState() {
        return playState;
    }

    public void setPlayState(int playState) {
        this.playState = playState;
    }

    public boolean isFav() {
        return isFav;
    }

    public void setFav(boolean fav) {
        isFav = fav;
    }

    public Long getCategory_id() {
        return category_id;
    }

    public void setCategory_id(Long category_id) {
        this.category_id = category_id;
    }
}
