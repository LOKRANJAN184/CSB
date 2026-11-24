#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

export JAVA_HOME="$DIR/.tools/jdk21"
export ANDROID_HOME="$DIR/.tools/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "=== 1. Checking Environment ==="
echo "JAVA_HOME: $JAVA_HOME"
echo "ANDROID_HOME: $ANDROID_HOME"
java -version

echo ""
echo "=== 2. Accepting Android SDK Licenses ==="
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true

echo ""
echo "=== 3. Installing Platforms & Build Tools (API 35) ==="
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

echo ""
echo "=== 4. Syncing Web Assets with Capacitor ==="
"$DIR/node_modules/.bin/cap" sync android

echo ""
echo "=== 5. Building Android APK via Gradle ==="
cd "$DIR/android"
chmod +x ./gradlew
./gradlew assembleDebug

echo ""
echo "=== 6. Copying Built APK to Root Directory ==="
if [ -f "$DIR/android/app/build/outputs/apk/debug/app-debug.apk" ]; then
  cp "$DIR/android/app/build/outputs/apk/debug/app-debug.apk" "$DIR/Chendurar-Bakery.apk"
  echo "SUCCESS! APK generated at: $DIR/Chendurar-Bakery.apk"
  ls -lh "$DIR/Chendurar-Bakery.apk"
else
  echo "Error: Output APK not found."
  exit 1
fi

