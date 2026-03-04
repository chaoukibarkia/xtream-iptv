package zb.zebra.iptv;

/**
 * Created by medbenhamed on 15/03/18.
 */

public class ProgrammeItem {

    private Long id;
    private Long epg_id;
    private String title;
    private String lang;
    private String start;
    private String end;
    private String description;
    private String channel_id;
    private Long start_timestamp;
    private Long stop_timestamp;

    public ProgrammeItem(Long id, Long epg_id, String title, String lang, String start, String end, String description, String channel_id, Long start_timestamp, Long stop_timestamp) {
        this.id = id;
        this.epg_id = epg_id;
        this.title = title;
        this.lang = lang;
        this.start = start;
        this.end = end;
        this.description = description;
        this.channel_id = channel_id;
        this.start_timestamp = start_timestamp;
        this.stop_timestamp = stop_timestamp;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getEpg_id() {
        return epg_id;
    }

    public void setEpg_id(Long epg_id) {
        this.epg_id = epg_id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLang() {
        return lang;
    }

    public void setLang(String lang) {
        this.lang = lang;
    }

    public String getStart() {
        return start;
    }

    public void setStart(String start) {
        this.start = start;
    }

    public String getEnd() {
        return end;
    }

    public void setEnd(String end) {
        this.end = end;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getChannel_id() {
        return channel_id;
    }

    public void setChannel_id(String channel_id) {
        this.channel_id = channel_id;
    }

    public Long getStart_timestamp() {
        return start_timestamp;
    }

    public void setStart_timestamp(Long start_timestamp) {
        this.start_timestamp = start_timestamp;
    }

    public Long getStop_timestamp() {
        return stop_timestamp;
    }

    public void setStop_timestamp(Long stop_timestamp) {
        this.stop_timestamp = stop_timestamp;
    }
}
