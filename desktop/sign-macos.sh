#!/usr/bin/env bash
# Manual protected CI job only. Never print or commit signing credentials.
set -euo pipefail
for name in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_API_ISSUER APPLE_API_KEY APPLE_API_PRIVATE_KEY; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing macos-signing environment secret: $name" >&2
    exit 1
  fi
done
if [[ "$APPLE_SIGNING_IDENTITY" != 'Developer ID Application:'* ]]; then
  echo 'A Developer ID Application identity is required.' >&2
  exit 1
fi
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'This signing job requires a native Apple Silicon macOS runner.' >&2
  exit 1
fi
umask 077
work=$(mktemp -d "${RUNNER_TEMP:?}/mes-sign.XXXXXX")
keychain="$work/signing.keychain-db"
mountpoint="$work/mount"
mounted=0
cleanup() {
  if [[ "$mounted" == 1 ]]; then hdiutil detach "$mountpoint" >/dev/null || true; fi
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT
password=$(openssl rand -hex 32)
printf '%s' "$APPLE_CERTIFICATE" | base64 -D > "$work/certificate.p12"
printf '%s' "$APPLE_API_PRIVATE_KEY" | base64 -D > "$work/AuthKey.p8"
export APPLE_API_KEY_PATH="$work/AuthKey.p8"
security create-keychain -p "$password" "$keychain"
security unlock-keychain -p "$password" "$keychain"
security set-keychain-settings -t 3600 -u "$keychain"
security import "$work/certificate.p12" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"
security find-identity -v -p codesigning "$keychain" | grep -F -- "$APPLE_SIGNING_IDENTITY" >/dev/null
unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_API_PRIVATE_KEY password

# Never validate a stale package. Tauri signs and notarizes the application.
node -e "require('node:fs').rmSync('target/release/bundle', {recursive:true, force:true})"
cargo tauri build --bundles dmg --ci -- --locked
shopt -s nullglob
dmgs=(target/release/bundle/dmg/*.dmg)
[[ ${#dmgs[@]} -eq 1 ]] || { echo 'Expected exactly one DMG' >&2; exit 1; }
dmg="${dmgs[0]}"
codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$dmg"
codesign --verify --strict "$dmg"
xcrun notarytool submit "$dmg" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait --output-format json > "$work/notary.json"
node -e 'const r=require(process.argv[1]); if(r.status!=="Accepted") { console.error("DMG notarization not accepted"); process.exit(1); }' "$work/notary.json"
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
hdiutil verify "$dmg"
mkdir "$mountpoint"
hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "$dmg"
mounted=1
apps=("$mountpoint"/*.app)
[[ ${#apps[@]} -eq 1 ]] || { echo 'Expected exactly one application in DMG' >&2; exit 1; }
codesign --verify --deep --strict --verbose=2 "${apps[0]}"
spctl --assess --type execute --verbose=2 "${apps[0]}"
hdiutil detach "$mountpoint"
mounted=0
node verify-packages.mjs target/release/bundle dmg
echo 'Developer ID signature, Apple notarization, DMG integrity and mounted application verified.'
