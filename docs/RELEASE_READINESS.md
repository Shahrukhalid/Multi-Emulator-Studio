# Production release readiness

M5 introduces a release evidence gate, not a public release. Successful CI builds are development candidates only unless the protected signing job explicitly produces a signed candidate. Native runtime and clean first-run verification remain mandatory.

## Candidate artifacts

Every desktop CI artifact contains `CANDIDATE.json` and `SHA256SUMS.txt`, generated from the packaged files. The manifest records exact build commit, application version, platform, signing category, filenames, lengths and SHA-256 checksums. Pull-request runs build the merge commit represented by `GITHUB_SHA`; don't attach evidence from a different source revision to those artifacts. Signed macOS candidates are generated only after protected notarization checks succeed. The ordinary Windows CI installer is unsigned and cannot be treated as a production candidate; the protected [Windows signing workflow](WINDOWS_SIGNING.md) requires configured credentials and successful Authenticode verification.

## Required evidence per supported platform

- Clean first launch, automatic SDK/Java setup and personal license review.
- Two independently booted devices, Google Play Store and preinstalled YouTube.
- Navigation, isolated shutdown, persistence and existing-profile upgrade preservation.
- Measured screen performance and working native video streaming (not PNG refresh presented as video).
- Production signature verified by the OS: notarized Developer ID on macOS and valid Authenticode publisher signature on Windows.
- Owner review of actual physical-host reports and exact final installer hashes.

After all checks actually pass, copy `release-evidence.template.json` into a separate candidate directory, next to the actual signed installers, their unmodified candidate manifests and reports. Preserve each artifact's path relative to its manifest. Fill the exact tested commit/version, each relative filename and SHA-256, and set a check to passed only when its report supports that result. Run:

```sh
node desktop/release-readiness.mjs /path/to/candidate/evidence.json FULL_COMMIT VERSION
```

This tool checks completeness, platform/signing labels, exact commit/version and actual local artifact/report bytes. It does not independently prove a human attestation or authenticate signatures on another OS. Keep original reports and signature-verification output and inspect them before publication. Never mark a missing test as passed. The main-branch desktop workflow automatically publishes checksum-verified development previews only; stable publication still requires the production evidence above.

Current blocker: M7 adds adaptive screenshot cadence, host reservation reporting, and a disposable profile restart while its sibling stays ready. The isolated QA self-test exercises concurrent full-resolution capture pairs, records timings and checks profile identity/settings after restart. Reservation figures are not measured process consumption; profile settings are not proof of guest app-data persistence. Using an existing SDK does not establish clean automatic setup. Physical-host reports on both platforms, guest persistence, native video playback, clean first-run setup, and production signing remain required. A release check must still fail until evidence is complete.
