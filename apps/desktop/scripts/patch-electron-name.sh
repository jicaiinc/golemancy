#!/bin/bash
# Patch Electron.app's Info.plist and icon to show "Golemancy" instead of "Electron" in macOS (dev only)

# Find Electron.app path
ELECTRON_APP=$(find "$(dirname "$0")/../../../node_modules" -path "*/electron/dist/Electron.app" 2>/dev/null | head -1)

if [ -z "$ELECTRON_APP" ]; then
  exit 0
fi

# Patch Info.plist
PLIST="$ELECTRON_APP/Contents/Info.plist"
if [ -f "$PLIST" ]; then
  plutil -replace CFBundleDisplayName -string "Golemancy" "$PLIST" 2>/dev/null
  plutil -replace CFBundleName -string "Golemancy" "$PLIST" 2>/dev/null
fi

# Replace electron.icns with our icon
ELECTRON_ICNS="$ELECTRON_APP/Contents/Resources/electron.icns"
OUR_ICNS="$(dirname "$0")/../resources/build/icons/mac/icon.icns"

if [ -f "$OUR_ICNS" ] && [ -f "$ELECTRON_ICNS" ]; then
  cp "$OUR_ICNS" "$ELECTRON_ICNS"
fi
