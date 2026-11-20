# SDK setup

For first-time desktop users, open Settings → Quick setup, review https://developer.android.com/studio/terms, then use **Set up Android automatically**. The app downloads the host-specific official command-line tools and a private Eclipse Temurin Java runtime, verifies their SHA-256 checksums, and runs the official SDK installer with interactive license prompts. No separately installed Android Studio, SDK or Java should be needed on supported macOS and Windows hosts. Internet, 12 GB free disk space, OS-provided download/archive utilities and hardware virtualization are required. Clean-machine end-to-end verification is still pending. No Google SDK packages are redistributed with the app.

Advanced/manual alternative: install JDK 17 or a supported Java runtime and official Android command-line tools from https://developer.android.com/studio#command-line-tools-only. Extract them under SDK/cmdline-tools/latest. Use the official sdkmanager interactively:

```
sdkmanager --list
sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "system-images;android-34;google_apis_playstore;arm64-v8a"
```

On Windows x64 select an available x86_64 image instead. The user must review and accept licenses personally. Select the SDK root in the development panel. No SDK or system images are included in this repository or installer.

Run `cargo run --locked -- --probe [SDK_DIRECTORY]` to discover the host, SDK, installed architecture-compatible images, and acceleration result. The JSON-lines development controller runs with `cargo run --locked -- DATA_DIRECTORY [SDK_DIRECTORY]`; keep it open for the lifetime of its emulators.

The desktop shell uses `cd desktop`, `npm ci`, `npm run build`, `cargo run --locked`. For packaging install the official Tauri 2 CLI and use `cargo tauri build --bundles dmg` (macOS) or `cargo tauri build --bundles nsis` (Windows). Windows requires supported WebView2 and C++ build tools; macOS requires Xcode command-line tools.

The advanced Settings page can also install the fixed runtime packages from an existing SDK directory after licenses are accepted. The installer does not automatically accept licenses. Existing profiles keep their original SDK; do not silently migrate them. For runtime verification, build the core with `cargo build --locked` and run `python3 tests/real_smoke.py SDK_DIRECTORY` on a compatible physical host with Android 14, Android build tools and hardware acceleration. A nonzero exit or missing run is not a release pass.

For an explicitly selected graphics-compatibility test on a compatible host, run `python3 tests/real_smoke.py SDK_DIRECTORY --graphics software`. The default is `--graphics auto`. Run only one test at a time; both modes require hardware virtualization and create disposable profiles. A successful probe alone does not prove boot readiness. If the official emulator exits with an illegal-instruction error, check the official emulator and host compatibility before retrying; software graphics is not a proven solution for that error.

## Clean-machine acceptance checklist

On a supported clean physical macOS or Windows host with no Android Studio, Java or SDK installed, verify the development installer opens normally. Use a new test OS account or disposable host; never remove an existing user's SDK or profile data to simulate this condition.

1. Launch the application, open Quick setup, review Android SDK terms, and start setup. Confirm it shows downloads and every required license prompt. Decline a license first; it must not connect or claim success.
2. Retry and accept the licenses individually. Switch away from Settings and return during setup; the installer log and prompt must still be accessible. Cancel a running install and verify it stops before retrying.
3. Complete installation, confirm the private SDK and Java directories exist and no system-wide Java or Android Studio installation was required. Restart the app and check that it reconnects to the managed SDK.
4. Verify official emulator and acceleration probes, create two disposable Google Play devices, confirm each boots with Play Store and YouTube, test local navigation, stop and restart, then run the two-device smoke benchmark. Record failures honestly; package detection alone is not boot verification.
5. Verify existing-device upgrade separately with a backed-up test profile. Keep its original SDK path and app data intact.

This is a manual acceptance gate, not a claim that these tests have passed.

### Isolated desktop QA build

On a development Mac, build `cd desktop && cargo tauri build --debug --bundles app --config tauri.qa.conf.json`. This uses a distinct application identifier and data directory, ignores automatic discovery of machine-wide SDKs, and exercises the managed first-run setup. It is not an end-user release. Leave the normal app and SDK intact. QA app data persists between runs; use a fresh QA OS account for repeated clean-machine tests rather than deleting user data. The owner must review and respond to official license prompts in the QA app.

After Quick setup completes, stay in Settings and select **Run two-device test** before creating any QA profiles. Close other emulators first. The test creates only disposable AVDs in its own directory, checks native preflight, concurrent boot and distinct processes, Play Store and system YouTube, captures five valid PNG frames per guest, checks independent shutdown and removes its disposable profiles. Use **Copy report** to share the resulting JSON for troubleshooting. This is not the full APK/persistence smoke test or high-FPS video verification; a failed or missing result does not qualify for release.

The updated self-test also checks that each disposable guest emits an encoded H.264 keyframe and parameter sets. To verify actual desktop decoding, open a selected running phone, wait for a PNG frame, then click **Try live video (30s)**. The experimental local stream uses the Android encoder, bounded native memory and WebCodecs where available. Test visibility changes, rotation, controls and stopping; if unsupported or interrupted, it restores PNG refresh. It is not continuous production streaming, and no FPS claim is made without a measured physical-host run.
