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
