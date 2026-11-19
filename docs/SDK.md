# SDK setup

Install JDK 17 and the official Android SDK command-line tools from https://developer.android.com/studio#command-line-tools-only. Extract them under SDK/cmdline-tools/latest. Use the official sdkmanager interactively:

```
sdkmanager --list
sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "system-images;android-34;google_apis;arm64-v8a"
```

On Windows x64 select an available x86_64 image instead. The user must review and accept licenses personally. Select the SDK root in the development panel. No SDK or system images are included in this repository or installer.

Run `cargo run --locked -- --probe [SDK_DIRECTORY]` to discover the host, SDK, installed architecture-compatible images, and acceleration result. The JSON-lines development controller runs with `cargo run --locked -- DATA_DIRECTORY [SDK_DIRECTORY]`; keep it open for the lifetime of its emulators.

The desktop shell uses `cd desktop`, `npm ci`, `npm run build`, `cargo run --locked`. For packaging install the official Tauri 2 CLI and use `cargo tauri build --bundles dmg` (macOS) or `cargo tauri build --bundles nsis` (Windows). Windows requires supported WebView2 and C++ build tools; macOS requires Xcode command-line tools.

The desktop Settings page can install the fixed official Android runtime package set from an existing SDK command-line tools directory after you have personally accepted the required licenses. No Java or command-line tools bootstrap is included. The installer does not automatically accept licenses. For runtime verification, build the core with `cargo build --locked` and run `python3 tests/real_smoke.py SDK_DIRECTORY` on a compatible physical host with Android 14, Android build tools and hardware acceleration. A nonzero exit or missing run is not a release pass.

For an explicitly selected graphics-compatibility test on a compatible host, run `python3 tests/real_smoke.py SDK_DIRECTORY --graphics software`. The default is `--graphics auto`. Run only one test at a time; both modes require hardware virtualization and create disposable profiles. A successful probe alone does not prove boot readiness. If the official emulator exits with an illegal-instruction error, check the official emulator and host compatibility before retrying; software graphics is not a proven solution for that error.
