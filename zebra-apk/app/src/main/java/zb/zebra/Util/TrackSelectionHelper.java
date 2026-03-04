package zb.zebra.Util;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.res.TypedArray;
import android.graphics.Color;
import android.text.TextUtils;
import android.util.Pair;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckedTextView;
import android.widget.LinearLayout;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.TrackGroup;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.MimeTypes;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import zb.zebra.iptvapplication.R;

/**
 * Helper class for displaying track selection dialogs (Media3 version).
 */
public final class TrackSelectionHelper implements View.OnClickListener {

  private final DefaultTrackSelector selector;
  private final Context context;

  private int trackType;
  private Tracks currentTracks;
  private List<TrackInfo> trackInfoList;
  private int selectedTrackIndex = -1;
  private View trackviewRoot;
  private String type;

  private CheckedTextView disableView;
  private CheckedTextView[][] trackViews;

  /**
   * @param selector The track selector.
   * @param context The context.
   */
  public TrackSelectionHelper(DefaultTrackSelector selector, Context context) {
    this.selector = selector;
    this.context = context;
  }

  @SuppressLint("InflateParams")
  public View buildView(Context context, int trackType, Tracks currentTracks, View trackviewRoot, String type) {
    this.trackType = trackType;
    this.currentTracks = currentTracks;
    this.trackviewRoot = trackviewRoot;
    this.type = type;

    // Extract track information
    trackInfoList = new ArrayList<>();
    int trackIndex = 0;
    for (Tracks.Group trackGroup : currentTracks.getGroups()) {
      if (trackGroup.getType() == trackType) {
        for (int i = 0; i < trackGroup.length; i++) {
          if (trackGroup.isTrackSupported(i)) {
            Format format = trackGroup.getTrackFormat(i);
            boolean isSelected = trackGroup.isTrackSelected(i);
            trackInfoList.add(new TrackInfo(trackIndex, format, isSelected, trackGroup));
            if (isSelected) {
              selectedTrackIndex = trackInfoList.size() - 1;
            }
            trackIndex++;
          }
        }
      }
    }

    LayoutInflater inflater = LayoutInflater.from(context);
    View view = inflater.inflate(R.layout.track_selection_dialog, null);
    ViewGroup root = (ViewGroup) view.findViewById(R.id.root);

    TypedArray attributeArray = context.getTheme().obtainStyledAttributes(
            new int[] {android.R.attr.selectableItemBackground});
    int selectableItemBackgroundResourceId = attributeArray.getResourceId(0, 0);
    attributeArray.recycle();

    // Add "Disable" option
    disableView = (CheckedTextView) inflater.inflate(
            android.R.layout.simple_list_item_single_choice, root, false);
    disableView.setBackgroundResource(selectableItemBackgroundResourceId);
    disableView.setText("Disable");
    disableView.setFocusable(true);
    disableView.setOnClickListener(this);
    root.addView(disableView);

    // Check if no tracks are selected (disabled)
    boolean isDisabled = (selectedTrackIndex == -1);
    disableView.setChecked(isDisabled);

    // Add track options
    trackViews = new CheckedTextView[trackInfoList.size()][];
    for (int i = 0; i < trackInfoList.size(); i++) {
      TrackInfo trackInfo = trackInfoList.get(i);
      CheckedTextView trackView = (CheckedTextView) inflater.inflate(
              android.R.layout.simple_list_item_single_choice, root, false);
      trackView.setBackgroundResource(selectableItemBackgroundResourceId);
      trackView.setText(buildTrackName(trackInfo.format));
      trackView.setTag(i);
      trackView.setFocusable(true);
      trackView.setOnClickListener(this);
      trackView.setChecked(trackInfo.isSelected && !isDisabled);
      root.addView(trackView);
      trackViews[i] = new CheckedTextView[] {trackView};
    }

    updateViews();
    return view;
  }

  private void updateViews() {
    boolean isDisabled = (selectedTrackIndex == -1);
    
    disableView.setChecked(isDisabled);
    
    for (int i = 0; i < trackInfoList.size(); i++) {
      if (trackViews[i] != null && trackViews[i].length > 0) {
        trackViews[i][0].setChecked(!isDisabled && i == selectedTrackIndex);
      }
    }
  }

  @Override
  public void onClick(View view) {
    if (view == disableView) {
      // Disable this track type
      TrackSelectionParameters.Builder builder = selector.buildUponParameters();
      
      if (trackType == C.TRACK_TYPE_AUDIO) {
        builder.setPreferredAudioLanguage("");
      } else if (trackType == C.TRACK_TYPE_TEXT) {
        builder.setPreferredTextLanguage("");
      }
      
      selector.setParameters(builder.build());
      selectedTrackIndex = -1;
    } else {
      // Enable and select specific track
      int clickedIndex = (int) view.getTag();
      selectedTrackIndex = clickedIndex;
      
      TrackInfo selectedTrack = trackInfoList.get(clickedIndex);
      TrackSelectionParameters.Builder builder = selector.buildUponParameters();
      
      // Set preferred track based on type
      if (trackType == C.TRACK_TYPE_AUDIO) {
        String lang = selectedTrack.format.language != null ? selectedTrack.format.language : "";
        builder.setPreferredAudioLanguage(lang);
      } else if (trackType == C.TRACK_TYPE_TEXT) {
        String lang = selectedTrack.format.language != null ? selectedTrack.format.language : "";
        builder.setPreferredTextLanguage(lang);
      }
      
      selector.setParameters(builder.build());
    }

    // Hide the menu
    ((LinearLayout) trackviewRoot.findViewById(R.id.audiomenu)).setVisibility(View.INVISIBLE);
    ((LinearLayout) trackviewRoot.findViewById(R.id.subtitlemenu)).setVisibility(View.INVISIBLE);

    // Update the views with the new state
    updateViews();
  }

  // Track name construction

  private static String buildTrackName(Format format) {
    String trackName;
    if (MimeTypes.isVideo(format.sampleMimeType)) {
      trackName = joinWithSeparator(joinWithSeparator(buildResolutionString(format),
              buildBitrateString(format)), buildTrackIdString(format));
    } else if (MimeTypes.isAudio(format.sampleMimeType)) {
      trackName = joinWithSeparator(buildLanguageString(format), buildAudioPropertyString(format));
    } else {
      trackName = buildLanguageString(format);
    }
    return trackName.length() == 0 ? "unknown" : trackName;
  }

  private static String buildResolutionString(Format format) {
    return format.width == Format.NO_VALUE || format.height == Format.NO_VALUE
            ? "" : format.width + "x" + format.height;
  }

  private static String buildAudioPropertyString(Format format) {
    return format.channelCount == Format.NO_VALUE || format.sampleRate == Format.NO_VALUE
            ? "" : format.channelCount + "ch, " + format.sampleRate + "Hz";
  }

  private static String buildLanguageString(Format format) {
    return TextUtils.isEmpty(format.language) || "und".equals(format.language) ? ""
            : (format.language.startsWith("fr")?"Français":(format.language.startsWith("en")?"English":(format.language.startsWith("spa")?"Español":format.language)));
  }

  private static String buildBitrateString(Format format) {
    return format.bitrate == Format.NO_VALUE ? ""
            : String.format(Locale.US, "%.2fMbit", format.bitrate / 1000000f);
  }

  private static String joinWithSeparator(String first, String second) {
    return first.length() == 0 ? second : (second.length() == 0 ? first : first + ", " + second);
  }

  private static String buildTrackIdString(Format format) {
    return format.id == null ? "" : ("id:" + format.id);
  }

  /**
   * Helper class to store track information
   */
  private static class TrackInfo {
    final int index;
    final Format format;
    final boolean isSelected;
    final Tracks.Group trackGroup;

    TrackInfo(int index, Format format, boolean isSelected, Tracks.Group trackGroup) {
      this.index = index;
      this.format = format;
      this.isSelected = isSelected;
      this.trackGroup = trackGroup;
    }
  }
}
