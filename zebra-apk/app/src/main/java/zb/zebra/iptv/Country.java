package zb.zebra.iptv;

public class Country {
    private Long id;
    private String name;
    private String flag;

    public Country(Long id, String name, String flag) {
        this.id = id;
        this.name = name;
        this.flag = flag;
    }

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

    public String getFlag() {
        return flag;
    }

    public void setFlag(String flag) {
        this.flag = flag;
    }
}
