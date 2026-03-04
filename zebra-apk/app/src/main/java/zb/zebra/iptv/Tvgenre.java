package zb.zebra.iptv;

/**
 * Created by medbenhamed on 09/02/18.
 */

public class Tvgenre {
    String name;
    Long id;

    public Tvgenre( Long id,String name) {
        this.name = name;
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }
}
