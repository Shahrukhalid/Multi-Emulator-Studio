#!/usr/bin/env bash
# Structural checks are distinct from launching the GUI or notarization.
set -euo pipefail
app="${1:?application bundle required}"
plist="$app/Contents/Info.plist"
plutil -lint "$plist"
package_type=$(/usr/libexec/PlistBuddy -c 'Print :CFBundlePackageType' "$plist")
[[ "$package_type" == APPL ]] || { echo 'Invalid application bundle type' >&2; exit 1; }
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")
[[ -n "$executable" && "$executable" != */* && "$executable" != . && "$executable" != .. ]] || { echo 'Invalid bundle executable name' >&2; exit 1; }
binary="$app/Contents/MacOS/$executable"
[[ -f "$binary" && -x "$binary" && ! -L "$binary" ]] || { echo 'Bundle executable is absent, non-executable, or a symlink' >&2; exit 1; }
lipo "$binary" -verify_arch arm64
codesign --verify --deep --strict --verbose=2 "$app"
echo 'Application bundle structure, ARM64 executable and signature verified; GUI launch is unverified.'
