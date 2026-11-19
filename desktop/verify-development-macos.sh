#!/usr/bin/env bash
# Verify the local development signature and packaging integrity, not notarization.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS required' >&2; exit 1; }
root="${1:?bundle directory required}"
shopt -s nullglob
apps=("$root"/macos/*.app)
dmgs=("$root"/dmg/*.dmg)
[[ ${#apps[@]} -eq 1 && ${#dmgs[@]} -eq 1 ]] || { echo 'Expected one app and one DMG' >&2; exit 1; }
codesign --verify --deep --strict --verbose=2 "${apps[0]}"
codesign -dv --verbose=4 "${apps[0]}" 2>&1 | grep -F 'Signature=adhoc' >/dev/null
hdiutil verify "${dmgs[0]}"
mountpoint=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mes-dev-mount.XXXXXX")
mounted=0
cleanup() {
  if [[ "$mounted" == 1 ]]; then hdiutil detach "$mountpoint" >/dev/null || true; fi
  rmdir "$mountpoint" || true
}
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "${dmgs[0]}"
mounted=1
mounted_apps=("$mountpoint"/*.app)
[[ ${#mounted_apps[@]} -eq 1 ]] || { echo 'Expected one packaged app' >&2; exit 1; }
codesign --verify --deep --strict --verbose=2 "${mounted_apps[0]}"
codesign -dv --verbose=4 "${mounted_apps[0]}" 2>&1 | grep -F 'Signature=adhoc' >/dev/null
hdiutil detach "$mountpoint"
mounted=0
echo 'Development app and DMG signatures verified; not Apple notarized.'
