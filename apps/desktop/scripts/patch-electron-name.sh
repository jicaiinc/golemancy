#!/bin/bash
# Patch Electron.app's Info.plist to show "SoloCraft" instead of "Electron" in macOS menu bar (dev only)
PLIST=$(find "$(dirname "$0")/../../../node_modules" -path "*/electron/dist/Electron.app/Contents/Info.plist" 2>/dev/null | head -1)
if [ -n "$PLIST" ]; then
  plutil -replace CFBundleDisplayName -string "SoloCraft" "$PLIST" 2>/dev/null
  plutil -replace CFBundleName -string "SoloCraft" "$PLIST" 2>/dev/null
fi
