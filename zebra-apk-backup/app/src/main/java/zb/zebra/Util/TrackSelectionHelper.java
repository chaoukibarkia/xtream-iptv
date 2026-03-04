package zb.zebra.Util;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.res.TypedArray;
import android.graphics.Color;
import android.os.Build;
import android.text.TextUtils;
import android.util.Pair;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckedTextView;
import android.widget.LinearLayout;

import com.google.android.exoplayer2.Format;
import com.google.android.exoplayer2.RendererCapabilities;
import com.google.android.exoplayer2.source.TrackGroup;
import com.google.android.exoplayer2.source.TrackGroupArray;
import com.google.android.exoplayer2.trackselection.FixedTrackSelection;
import com.google.android.exoplayer2.trackselection.MappingTrackSelector;
import com.google.android.exoplayer2.trackselection.MappingTrackSelector.MappedTrackInfo;
import com.google.android.exoplayer2.trackselection.MappingTrackSelector.SelectionOverride;
import com.google.android.exoplayer2.trackselection.RandomTrackSelection;
import com.google.android.exoplayer2.trackselection.TrackSelection;
import com.google.android.exoplayer2.util.MimeTypes;

import java.util.Arrays;
import java.util.Locale;

import zb.zebra.iptvapplication.R;

/**
 * Helper class for displaying track selection dialogs.
 */
/* package */public final class TrackSelectionHelper implements View.OnClickListener {

  private static final TrackSelection.Factory FIXED_FACTORY = new FixedTrackSelection.Factory();
  private static final TrackSelection.Factory RANDOM_FACTORY = new RandomTrackSelection.Factory();

  private final MappingTrackSelector selector;
  private final TrackSelection.Factory adaptiveVideoTrackSelectionFactory;

  private MappedTrackInfo trackInfo;
  private int rendererIndex;
  private TrackGroupArray trackGroups;
  private boolean[] trackGroupsAdaptive;
  private boolean isDisabled;
  private SelectionOverride override;
  private Activity parent;

  private CheckedTextView disableView;
  private CheckedTextView defaultView;
  private CheckedTextView enableRandomAdaptationView;
  private CheckedTextView[][] trackViews;
    View trackviewRoot;
  private String type;

  /**
   * @param selector The track selector.
   * @param adaptiveVideoTrackSelectionFactory A factory for adaptive video {@link TrackSelection}s,
   *     or null if the selection helper should not support adaptive video.
   */
  public TrackSelectionHelper(MappingTrackSelector selector,
                              TrackSelection.Factory adaptiveVideoTrackSelectionFactory) {
    this.selector = selector;
    this.adaptiveVideoTrackSelectionFactory = adaptiveVideoTrackSelectionFactory;
  }





  @SuppressLint("InflateParams")
  public View buildView(Context context, int rendererIndex, MappedTrackInfo trackInfo, View trackviewRoot, String type) {
    this.trackInfo = trackInfo;
    this.rendererIndex = rendererIndex;
      this.trackviewRoot=trackviewRoot;
      this.type= type;
    trackGroups = trackInfo.getTrackGroups(rendererIndex);
    trackGroupsAdaptive = new boolean[trackGroups.length];
    for (int i = 0; i < trackGroups.length; i++) {
      trackGroupsAdaptive[i] = adaptiveVideoTrackSelectionFactory != null
              && trackInfo.getAdaptiveSupport(rendererIndex, i, false)
              != RendererCapabilities.ADAPTIVE_NOT_SUPPORTED
              && trackGroups.get(i).length > 1;
    }
    isDisabled = selector.getRendererDisabled(rendererIndex);
    override = selector.getSelectionOverride(rendererIndex, trackGroups);

    LayoutInflater inflater = LayoutInflater.from(context);
    View view = inflater.inflate(R.layout.track_selection_dialog, null);
    ViewGroup root = (ViewGroup) view.findViewById(R.id.root);

    TypedArray attributeArray = context.getTheme().obtainStyledAttributes(
            new int[] {android.R.attr.selectableItemBackground});
    int selectableItemBackgroundResourceId = attributeArray.getResourceId(0, 0);
    attributeArray.recycle();

    // View for disabling the renderer.
    disableView = (CheckedTextView) inflater.inflate(
            android.R.layout.simple_list_item_single_choice, root, false);
    disableView.setBackgroundResource(selectableItemBackgroundResourceId);

    disableView.setText(R.string.selection_disabled);
    disableView.setFocusable(true);
    disableView.setOnClickListener(this);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {

      disableView.setBackground(context.getDrawable(R.drawable.selector_btn));

        disableView.setTextColor(context.getColorStateList(R.color.audio_color));
      }
    }
    // View for clearing the override to allow the selector to use its default selection logic.
    defaultView = (CheckedTextView) inflater.inflate(
            android.R.layout.simple_list_item_single_choice, root, false);
    defaultView.setBackgroundResource(selectableItemBackgroundResourceId);
    defaultView.setText(R.string.selection_default);
    defaultView.setFocusable(true);
    defaultView.setOnClickListener(this);
    root.addView(inflater.inflate(R.layout.list_divider, root, false));
    //root.addView(defaultView);

    // Per-track views.
    boolean haveSupportedTracks = false;
    boolean haveAdaptiveTracks = false;
    trackViews = new CheckedTextView[trackGroups.length][];
    for (int groupIndex = 0; groupIndex < trackGroups.length; groupIndex++) {
      TrackGroup group = trackGroups.get(groupIndex);
      boolean groupIsAdaptive = trackGroupsAdaptive[groupIndex];
      haveAdaptiveTracks |= groupIsAdaptive;
      trackViews[groupIndex] = new CheckedTextView[group.length];
      for (int trackIndex = 0; trackIndex < group.length; trackIndex++) {
        if (trackIndex == 0) {
          root.addView(inflater.inflate(R.layout.list_divider, root, false));
        }
        int trackViewLayoutId = groupIsAdaptive ? android.R.layout.simple_list_item_multiple_choice
                : android.R.layout.simple_list_item_single_choice;
        CheckedTextView trackView = (CheckedTextView) inflater.inflate(
                trackViewLayoutId, root, false);

        trackView.setBackgroundResource(selectableItemBackgroundResourceId);
        trackView.setText(buildTrackName(group.getFormat(trackIndex)));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          trackView.setBackground(context.getDrawable(R.drawable.selector_btn));
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            trackView.setTextColor(context.getColorStateList(R.color.audio_color));
          }
          else{
            trackView.setTextColor(Color.GRAY);
          }
        }
        if (trackInfo.getTrackFormatSupport(this.rendererIndex, groupIndex, trackIndex)
                == RendererCapabilities.FORMAT_HANDLED) {
          trackView.setFocusable(true);
          trackView.setTag(Pair.create(groupIndex, trackIndex));
          trackView.setOnClickListener(this);
          haveSupportedTracks = true;
        } else {
          trackView.setFocusable(false);
          trackView.setEnabled(false);
        }

        trackViews[groupIndex][trackIndex] = trackView;
        root.addView(trackView);
      }
    }
    if(root.getChildCount()>0&&rendererIndex==2) {
      root.addView(disableView);
    }

    if (haveAdaptiveTracks) {
      // View for using random adaptation.
      enableRandomAdaptationView = (CheckedTextView) inflater.inflate(
              android.R.layout.simple_list_item_multiple_choice, root, false);
      enableRandomAdaptationView.setBackgroundResource(selectableItemBackgroundResourceId);
      enableRandomAdaptationView.setText(R.string.enable_random_adaptation);
      enableRandomAdaptationView.setOnClickListener(this);
      root.addView(inflater.inflate(R.layout.list_divider, root, false));
      root.addView(enableRandomAdaptationView);
    }

    updateViews();
    return view;
  }

  private void updateViews() {
    disableView.setChecked(isDisabled);
    defaultView.setChecked(!isDisabled && override == null);
    for (int i = 0; i < trackViews.length; i++) {
      for (int j = 0; j < trackViews[i].length; j++) {
        trackViews[i][j].setChecked(override != null && override.groupIndex == i
                && override.containsTrack(j));
      }
    }
    if (enableRandomAdaptationView != null) {
      boolean enableView = !isDisabled && override != null && override.length > 1;
      enableRandomAdaptationView.setEnabled(enableView);
      enableRandomAdaptationView.setFocusable(enableView);
      if (enableView) {
        enableRandomAdaptationView.setChecked(!isDisabled
                && override.factory instanceof RandomTrackSelection.Factory);
      }
    }
  }

  // View.OnClickListener

  @Override
  public void onClick(View view) {

    if (view == disableView) {
      isDisabled = true;
      override = null;
    } else if (view == defaultView) {
      isDisabled = false;
      override = null;
    } else if (view == enableRandomAdaptationView) {
      setOverride(override.groupIndex, override.tracks, !enableRandomAdaptationView.isChecked());
    } else {
      isDisabled = false;
      @SuppressWarnings("unchecked")
      Pair<Integer, Integer> tag = (Pair<Integer, Integer>) view.getTag();
      int groupIndex = tag.first;
      int trackIndex = tag.second;
      if (!trackGroupsAdaptive[groupIndex] || override == null
              || override.groupIndex != groupIndex) {
        override = new SelectionOverride(FIXED_FACTORY, groupIndex, trackIndex);
      } else {
        // The group being modified is adaptive and we already have a non-null override.
        boolean isEnabled = ((CheckedTextView) view).isChecked();
        int overrideLength = override.length;
        if (isEnabled) {
          // Remove the track from the override.
          if (overrideLength == 1) {
            // The last track is being removed, so the override becomes empty.
            override = null;
            isDisabled = true;
          } else {
            setOverride(groupIndex, getTracksRemoving(override, trackIndex),
                    enableRandomAdaptationView.isChecked());
          }
        } else {
          // Add the track to the override.
          setOverride(groupIndex, getTracksAdding(override, trackIndex),
                  enableRandomAdaptationView.isChecked());
        }
      }
      ((LinearLayout) trackviewRoot.findViewById(R.id.audiomenu)).setVisibility(View.INVISIBLE);
      ((LinearLayout) trackviewRoot.findViewById(R.id.subtitlemenu)).setVisibility(View.INVISIBLE);
      if(type.equalsIgnoreCase("audio"))
      trackviewRoot.findViewById(R.id.audiobtn).requestFocus();
      if(type.equalsIgnoreCase("subtitle"))
        trackviewRoot.findViewById(R.id.subtitlebtn).requestFocus();
    }
    // Update the views with the new state.
    updateViews();
    selector.setRendererDisabled(rendererIndex, isDisabled);
    if (override != null) {
      selector.setSelectionOverride(rendererIndex, trackGroups, override);
    } else {
      selector.clearSelectionOverrides(rendererIndex);
    }


  }

  private void setOverride(int group, int[] tracks, boolean enableRandomAdaptation) {
    TrackSelection.Factory factory = tracks.length == 1 ? FIXED_FACTORY
            : (enableRandomAdaptation ? RANDOM_FACTORY : adaptiveVideoTrackSelectionFactory);
    override = new SelectionOverride(factory, group, tracks);
  }

  // Track array manipulation.

  private static int[] getTracksAdding(SelectionOverride override, int addedTrack) {
    int[] tracks = override.tracks;
    tracks = Arrays.copyOf(tracks, tracks.length + 1);
    tracks[tracks.length - 1] = addedTrack;
    return tracks;
  }

  private static int[] getTracksRemoving(SelectionOverride override, int removedTrack) {
    int[] tracks = new int[override.length - 1];
    int trackCount = 0;
    for (int i = 0; i < tracks.length + 1; i++) {
      int track = override.tracks[i];
      if (track != removedTrack) {
        tracks[trackCount++] = track;
      }
    }
    return tracks;
  }

  // Track name construction.

  private static String buildTrackName(Format format) {
    String trackName;
    if (MimeTypes.isVideo(format.sampleMimeType)) {
      trackName = joinWithSeparator(joinWithSeparator(buildResolutionString(format),
              buildBitrateString(format)), buildTrackIdString(format));
    } else if (MimeTypes.isAudio(format.sampleMimeType)) {
      trackName = buildLanguageString(format);
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

}