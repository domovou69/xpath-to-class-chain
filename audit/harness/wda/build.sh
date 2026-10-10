#!/bin/sh
# Builds the mini-WDA binary: pristine WDA sources from upstream/, adapted by patches/,
# plus local stubs, compiled for macOS with Foundation + libxml2 (no Xcode project, no device).
# Output: $HARNESS_OUT/wdaemu (default audit/harness/out/wdaemu).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${HARNESS_OUT:-$HERE/../out}
SRC=$OUT/wda-src
rm -rf "$SRC"; mkdir -p "$SRC"
cp "$HERE"/upstream/*.h "$HERE"/upstream/*.m "$SRC"/
for p in "$HERE"/patches/*.patch; do patch -s -d "$SRC" -p1 < "$p"; done
SDK=$(xcrun --show-sdk-path)
clang -fobjc-arc -fmodules -w \
  -I "$HERE/stubs" -I "$SRC" -I "$HERE" -I "$SDK/usr/include/libxml2" \
  "$HERE/main.m" "$HERE/Node.m" "$HERE/stubs/stubs.m" "$SRC"/*.m \
  -framework Foundation -lxml2 -o "$OUT/wdaemu"
echo "built $OUT/wdaemu"
