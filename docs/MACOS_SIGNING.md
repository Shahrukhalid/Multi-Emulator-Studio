# Signed macOS candidates

The ordinary pull-request build produces unsigned development artifacts. These are not public installers and macOS Gatekeeper may reject them. Never disable Gatekeeper or remove quarantine to work around an integrity error.

## One-time owner setup

1. Obtain a valid **Developer ID Application** certificate (including its private key) through the Apple Developer Program. Export the certificate and private key as a password-protected PKCS#12 file in Keychain Access.
2. Create an App Store Connect API key authorized for notarization. Retain its issuer ID, key ID and `.p8` private key securely.
3. In repository Settings → Environments, create `macos-signing`. Restrict deployment branches to `main` and the reviewed `milestone/m3-6-release-candidate` branch. Require owner approval where available. Store the following as environment secrets, not repository files or pull-request text:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded PKCS#12 export |
| `APPLE_CERTIFICATE_PASSWORD` | PKCS#12 export password |
| `APPLE_SIGNING_IDENTITY` | Exact Developer ID Application identity |
| `APPLE_API_ISSUER` | App Store Connect issuer ID |
| `APPLE_API_KEY` | App Store Connect key ID |
| `APPLE_API_PRIVATE_KEY` | Base64-encoded `.p8` key |

Reference: https://v2.tauri.app/distribute/sign/macos/

## Build and validation

Manually dispatch Desktop checks on the reviewed candidate branch with `signed_macos` enabled, then approve the protected environment. Ordinary pull requests never receive signing credentials. The signing job requires the ordinary CI jobs to succeed; it imports the certificate into a temporary runner keychain, builds the signed app, submits the signed DMG for Apple notarization, requires acceptance, staples and validates the ticket, verifies and mounts the DMG read-only, verifies the app signature and Gatekeeper assessment, and hashes the final artifact. Secrets and temporary files are removed at job exit. A missing secret, failed notarization or verification failure prevents uploading a signed artifact.

Only use the artifact named `verified-signed-macOS-ARM64` for signed-candidate testing. Do not publish it as a production release before actual Android runtime and clean-install verification pass. No signed candidate exists until the owner configures the environment and the protected build succeeds.
