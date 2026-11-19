# M3 — production readiness

Status: in progress; no production release authorized by these checks alone.

## First increment

- Replace destructive clone/delete renaming with a validated SQLite metadata update preserving UUID and AVD identity. Regression tests cover running instances and persistence across database reopen.
- Show SDK setup on initial connection failure, allow choosing an existing SDK path, and avoid attempting unsupported live storage migration.
- Block creation without discovered images and profiles, show unverified acceleration truthfully, distinguish unknown/stopping states, surface diagnostics, and label copy-settings and window-info operations accurately.

## Remaining release gates

- Implement guided runtime acquisition, explicit license acceptance, native file pickers, and user-facing SDK recovery.
- Verify actual native desktop rendering and interactions on macOS and Windows, including rename with guest data, and verify two simultaneous Android boots using the disposable SDK smoke test on compatible physical hosts.
- Validate installer creation, clean install, launch, uninstall, compatibility, and signing on supported platforms. Keep iOS simulation marked unimplemented.
- Resolve dependency PR failures; run fresh security checks and packaging on the final merged commit. Do not treat compilation as runtime verification.
- Configure protected, fail-closed release automation and publish only after all applicable gates pass.

## Second increment — installer gate and setup guidance

- Desktop checks now require unsigned development installer packaging and dependency audit on pull requests as well as manual runs. These artifacts are not production releases.
- APK path selection rejects relative filenames; drag-and-drop explicitly reports when the webview does not supply an absolute path. A native picker remains pending.
- Settings explain official SDK installation and architecture-compatible images, and toolchain refresh no longer claims readiness when images or profiles are missing.
- Real host boot, clean install and runtime acquisition remain release blockers.

## Third increment — guided runtime installation

- Add an explicit, bounded native installation step using locally installed official sdkmanager and preaccepted licenses. Fixed Android 14 image selected by host CPU; validate installed tools and image afterward. No automatic license acceptance, Java bootstrap, or command-line tools download.
- Extend disposable real-host smoke test to verify that rename preserves the running device identity and private test app data before restart.
- Actual execution remains pending on compatible physical Windows and macOS hosts; CI compilation and unsigned packaging alone do not satisfy this gate.

## Fourth increment — native first-launch and APK selection

- Add a native directory picker to locate an existing SDK during first launch and a native, APK-filtered file picker for installation. Selection cancellation changes nothing; the user still explicitly confirms installation.
- Validate local file type in Rust and keep the typed manual path fallback. Match APK extension handling across the picker and the runtime.
- Java and official command-line tools must still be installed beforehand. Native interaction, clean installation and real guest boot remain separate verification gates.
- Local Apple Silicon verification: TypeScript build, desktop Rust check and 15 core unit tests passed. SDK probe found Android 14 ARM64 and a successful Hypervisor.Framework acceleration check. The real smoke test created two disposable AVDs, launched distinct processes, then both official Emulator 37.2.13.0 processes exited with SIGILL before boot. Cleanup completed. Guest data assertions and runtime release gate remain unverified; no production release.
