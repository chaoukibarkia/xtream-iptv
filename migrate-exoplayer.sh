#!/bin/bash
# ExoPlayer 2.19.1 API Migration Script

cd /storage-pool/xtream/zebra-apk

echo "Migrating ExoPlayer imports..."

# Update imports in all Java files
find app/src/main/java -name "*.java" -type f | while read file; do
    # Remove deprecated imports
    sed -i '/import com.google.android.exoplayer2.ExoPlayerFactory;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.SimpleExoPlayer;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.extractor.DefaultExtractorsFactory;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.source.ExtractorMediaSource;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.ui.SimpleExoPlayerView;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.source.MediaSourceEventListener;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.upstream.TransferListener;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.upstream.DefaultHttpDataSourceFactory;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.source.dash.DefaultDashChunkSource;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.source.smoothstreaming.DefaultSsChunkSource;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.trackselection.AdaptiveTrackSelection;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.trackselection.TrackSelection;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.upstream.BandwidthMeter;/d' "$file"
    sed -i '/import com.google.android.exoplayer2.upstream.DefaultBandwidthMeter;/d' "$file"
    
    # Add new imports before the first exoplayer import
    if grep -q "import com.google.android.exoplayer2" "$file"; then
        # Add MediaItem import if not present
        if ! grep -q "import com.google.android.exoplayer2.MediaItem;" "$file"; then
            sed -i '/import com.google.android.exoplayer2\.C;/a import com.google.android.exoplayer2.MediaItem;' "$file"
        fi
        # Add PlayerView import if SimpleExoPlayerView was used
        if ! grep -q "import com.google.android.exoplayer2.ui.StyledPlayerView;" "$file"; then
            sed -i '/import com.google.android.exoplayer2\.C;/a import com.google.android.exoplayer2.ui.StyledPlayerView;' "$file"
        fi
        # Add ProgressiveMediaSource if needed
        if ! grep -q "import com.google.android.exoplayer2.source.ProgressiveMediaSource;" "$file"; then
            sed -i '/import com.google.android.exoplayer2\.source\.MediaSource;/a import com.google.android.exoplayer2.source.ProgressiveMediaSource;' "$file"
        fi
    fi
    
    # Replace type declarations
    sed -i 's/private SimpleExoPlayer player/private ExoPlayer player/g' "$file"
    sed -i 's/SimpleExoPlayer player/ExoPlayer player/g' "$file"
    sed -i 's/private SimpleExoPlayerView /private StyledPlayerView /g' "$file"
    sed -i 's/SimpleExoPlayerView /StyledPlayerView /g' "$file"
    
    # Replace variable assignments
    sed -i 's/BandwidthMeter bandwidthMeter/\/\/ BandwidthMeter removed in 2.19/g' "$file"
    sed -i 's/= new DefaultBandwidthMeter()/\/\/ DefaultBandwidthMeter no longer needed/g' "$file"
    
    # Replace ExtractorMediaSource with ProgressiveMediaSource
    sed -i 's/ExtractorMediaSource/ProgressiveMediaSource/g' "$file"
    sed -i 's/DefaultExtractorsFactory extractorsFactory/\/\/ DefaultExtractorsFactory no longer needed/g' "$file"
    
done

echo "ExoPlayer API migration completed!"
echo "Note: Manual updates still needed for:"
echo "1. ExoPlayer creation: Use new ExoPlayer.Builder(context).build()"
echo "2. MediaSource creation: Use MediaItem.fromUri() with Factory pattern"
echo "3. Player event listeners: Extend Player.Listener instead of implementing Player.EventListener"
