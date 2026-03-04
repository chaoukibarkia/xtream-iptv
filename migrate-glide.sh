#!/bin/bash
# Glide 4.x Migration Script

cd /storage-pool/xtream/zebra-apk

FILES=(
  "app/src/main/java/zb/zebra/ZebraFilmDetailsActivity.java"
  "app/src/main/java/zb/zebra/ZebraTvshowDetailsActivity.java"
  "app/src/main/java/zb/zebra/Util/GlideBackgroundManager.java"
  "app/src/main/java/zb/zebra/ZebraSaisonDetailsActivity.java"
  "app/src/main/java/zb/zebra/zebra/tvshow/SaisonViewHolder.java"
  "app/src/main/java/zb/zebra/zebra/tvshow/TvshowViewHolder.java"
  "app/src/main/java/zb/zebra/zebra/film/FilmViewHolder.java"
  "app/src/main/java/zb/zebra/VodPlayActivity.java"
)

for file in "${FILES[@]}"; do
  echo "Migrating: $file"
  
  # Remove old Glide imports
  sed -i '/import com\.bumptech\.glide\.load\.resource\.bitmap\.GlideBitmapDrawable;/d' "$file"
  sed -i '/import com\.bumptech\.glide\.load\.resource\.drawable\.GlideDrawable;/d' "$file"
  sed -i '/import com\.bumptech\.glide\.request\.animation\.GlideAnimation;/d' "$file"
  
  # Add new Glide imports
  if ! grep -q "import com.bumptech.glide.load.DataSource;" "$file"; then
    sed -i '/import com\.bumptech\.glide/a import com.bumptech.glide.load.DataSource;\nimport com.bumptech.glide.load.engine.GlideException;\nimport com.bumptech.glide.request.RequestListener;\nimport com.bumptech.glide.request.target.Target;\nimport android.graphics.drawable.Drawable;' "$file"
  fi
  
  # Replace GlideDrawable with Drawable
  sed -i 's/GlideDrawable/Drawable/g' "$file"
  sed -i 's/GlideBitmapDrawable/Drawable/g' "$file"
  
  # Replace GlideAnimation with transition parameter (not used in new API)
  sed -i 's/GlideAnimation<[^>]*> anim/boolean isFirstResource/g' "$file"
  sed -i 's/GlideAnimation<?> anim/boolean isFirstResource/g' "$file"
  
  # Replace RequestListener implementation
  sed -i 's/implements RequestListener<[^>]*>/implements RequestListener<Drawable>/g' "$file"
  
done

echo "Glide 4.x migration completed!"
