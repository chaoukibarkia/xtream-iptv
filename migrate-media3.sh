#!/bin/bash
# AndroidX Media3 Migration Script
# Migrates from com.google.android.exoplayer2.* to androidx.media3.*

cd /storage-pool/xtream/zebra-apk

echo "Migrating to AndroidX Media3..."

find app/src/main/java -name "*.java" -type f | while read file; do
    echo "Processing: $file"
    
    # Core ExoPlayer classes
    sed -i 's/import com\.google\.android\.exoplayer2\.C;/import androidx.media3.common.C;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.ExoPlaybackException;/import androidx.media3.common.PlaybackException;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.ExoPlayer;/import androidx.media3.exoplayer.ExoPlayer;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.Player;/import androidx.media3.common.Player;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.Timeline;/import androidx.media3.common.Timeline;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.Format;/import androidx.media3.common.Format;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.MediaItem;/import androidx.media3.common.MediaItem;/g' "$file"
    
    # MediaSource classes
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.MediaSource;/import androidx.media3.exoplayer.source.MediaSource;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.ProgressiveMediaSource;/import androidx.media3.exoplayer.source.ProgressiveMediaSource;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.TrackGroup;/import androidx.media3.common.TrackGroup;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.TrackGroupArray;/import androidx.media3.common.Tracks;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.BehindLiveWindowException;/import androidx.media3.exoplayer.source.BehindLiveWindowException;/g' "$file"
    
    # Streaming sources
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.dash\.DashMediaSource;/import androidx.media3.exoplayer.dash.DashMediaSource;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.hls\.HlsMediaSource;/import androidx.media3.exoplayer.hls.HlsMediaSource;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.source\.smoothstreaming\.SsMediaSource;/import androidx.media3.exoplayer.smoothstreaming.SsMediaSource;/g' "$file"
    
    # Track selection
    sed -i 's/import com\.google\.android\.exoplayer2\.trackselection\.DefaultTrackSelector;/import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.trackselection\.MappingTrackSelector;/import androidx.media3.exoplayer.trackselection.MappingTrackSelector;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.RendererCapabilities;/import androidx.media3.exoplayer.RendererCapabilities;/g' "$file"
    
    # UI classes
    sed -i 's/import com\.google\.android\.exoplayer2\.ui\.StyledPlayerView;/import androidx.media3.ui.PlayerView;/g' "$file"
    
    # Upstream/DataSource classes
    sed -i 's/import com\.google\.android\.exoplayer2\.upstream\.DataSource;/import androidx.media3.datasource.DataSource;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.upstream\.DefaultDataSourceFactory;/import androidx.media3.datasource.DefaultDataSource;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.upstream\.DefaultHttpDataSource;/import androidx.media3.datasource.DefaultHttpDataSource;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.upstream\.HttpDataSource;/import androidx.media3.datasource.HttpDataSource;/g' "$file"
    
    # Util classes
    sed -i 's/import com\.google\.android\.exoplayer2\.util\.Util;/import androidx.media3.common.util.Util;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.util\.MimeTypes;/import androidx.media3.common.MimeTypes;/g' "$file"
    
    # MediaCodec classes
    sed -i 's/import com\.google\.android\.exoplayer2\.mediacodec\.MediaCodecRenderer;/import androidx.media3.exoplayer.mediacodec.MediaCodecRenderer;/g' "$file"
    sed -i 's/import com\.google\.android\.exoplayer2\.mediacodec\.MediaCodecUtil;/import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;/g' "$file"
    
    # Replace deprecated class names
    sed -i 's/TrackGroupArray/Tracks/g' "$file"
    sed -i 's/ExoPlaybackException/PlaybackException/g' "$file"
    sed -i 's/StyledPlayerView/PlayerView/g' "$file"
    sed -i 's/DefaultDataSourceFactory/DefaultDataSource.Factory/g' "$file"
    
done

echo "Updating XML layouts..."

find app/src/main/res/layout -name "*.xml" -type f | while read file; do
    sed -i 's/com\.google\.android\.exoplayer2\.ui\.SimpleExoPlayerView/androidx.media3.ui.PlayerView/g' "$file"
    sed -i 's/com\.google\.android\.exoplayer2\.ui\.StyledPlayerView/androidx.media3.ui.PlayerView/g' "$file"
done

echo "AndroidX Media3 migration completed!"
