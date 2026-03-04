#!/bin/bash
# AndroidX Migration Script

cd /storage-pool/xtream/zebra-apk

# Find all Java files and migrate imports
find app/src/main/java -name "*.java" -type f | while read file; do
    echo "Migrating: $file"
    
    # Support library to AndroidX mappings
    sed -i 's/import android\.support\.v4\.app\./import androidx.fragment.app./g' "$file"
    sed -i 's/import android\.support\.v4\.content\./import androidx.core.content./g' "$file"
    sed -i 's/import android\.support\.v4\.view\./import androidx.core.view./g' "$file"
    sed -i 's/import android\.support\.v7\.app\./import androidx.appcompat.app./g' "$file"
    sed -i 's/import android\.support\.v7\.widget\./import androidx.recyclerview.widget./g' "$file"
    sed -i 's/import android\.support\.v7\.widget\.RecyclerView/import androidx.recyclerview.widget.RecyclerView/g' "$file"
    sed -i 's/import android\.support\.v7\.widget\.CardView/import androidx.cardview.widget.CardView/g' "$file"
    sed -i 's/import android\.support\.v7\.palette\./import androidx.palette.graphics./g' "$file"
    sed -i 's/import android\.support\.design\./import com.google.android.material./g' "$file"
    sed -i 's/import android\.support\.constraint\./import androidx.constraintlayout.widget./g' "$file"
    sed -i 's/import android\.support\.transition\./import androidx.transition./g' "$file"
    sed -i 's/import android\.support\.annotation\./import androidx.annotation./g' "$file"
    sed -i 's/import android\.support\.leanback\./import androidx.leanback./g' "$file"
    sed -i 's/import android\.support\.test\./import androidx.test./g' "$file"
    
done

# Migrate XML layout files
find app/src/main/res/layout -name "*.xml" -type f | while read file; do
    echo "Migrating XML: $file"
    
    sed -i 's/android\.support\.v4\.widget\./androidx.core.widget./g' "$file"
    sed -i 's/android\.support\.v7\.widget\./androidx.recyclerview.widget./g' "$file"
    sed -i 's/android\.support\.v7\.widget\.CardView/androidx.cardview.widget.CardView/g' "$file"
    sed -i 's/android\.support\.v7\.widget\.RecyclerView/androidx.recyclerview.widget.RecyclerView/g' "$file"
    sed -i 's/android\.support\.design\./com.google.android.material./g' "$file"
    sed -i 's/android\.support\.constraint\./androidx.constraintlayout.widget./g' "$file"
    sed -i 's/android\.support\.leanback\./androidx.leanback./g' "$file"
    
done

echo "AndroidX migration completed!"
