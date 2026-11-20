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

## Fifth increment — compatibility and boot diagnostics

- Add an opt-in software graphics mode for new device profiles, with automatic graphics as the default for existing profiles. Both modes retain required hardware virtualization. No automatic crash retry, guest data reset, or change to host security settings.
- Display the official emulator version, preserve native-exit diagnostics when reaping an already-exited process, and report boot timeout as a crashed device with bounded local log context. Reject launches when the configured system image is missing.
- The opt-in physical-host test now records SDK version and graphics mode, rejects failed acceleration preflight, and independently verifies boot completion on both disposable guests before testing data persistence.
- Official Android documentation describes software graphics as an option for graphics compatibility; it is not evidence that the recorded SIGILL will be resolved: https://developer.android.com/studio/run/emulator-acceleration
- Physical macOS and Windows runtime verification is still required. The current Linux development environment cannot verify the supported native hosts. Compilation and packaging are not substitutes for two successful guest boots, persistence checks, and clean installation.

## Sixth increment — consolidated release candidate

- Fix the M3.5 rustfmt failure. Local Apple Silicon checks: rustfmt, core Clippy, 17 core tests, desktop Clippy and TypeScript build passed.
- Real-host software graphics smoke attempt stopped at the official emulator version preflight. The executable returned SIGABRT with a Qt message that its build requires NEON. No AVDs were created by this attempt, and software graphics was not exercised. Do not bypass host restrictions or claim the underlying incompatibility is fixed.
- Require nonempty platform installer artifacts and SHA-256 manifests in desktop CI. The checksums verify artifact integrity, not code signing or successful installation.
- Consolidate the entire M2/M3/UI stack in one draft pull request targeting main. Keep the earlier branches available until the consolidated candidate is verified.

### Production release gate

- [ ] Consolidated macOS and Windows core/desktop CI, dependency audit, packaging and checksum checks pass.
- [ ] Real physical-host smoke test passes on both supported platforms, with two completed boots, independent test app data, rename preservation, restart persistence and cleanup.
- [ ] Clean install, native GUI interactions, uninstall and installer signing/notarization are verified for each supported platform.
- [ ] Review final changes, reconcile pending dependency updates, and ensure release notes reflect limitations.

No production merge or release until the applicable gates are verified. A CI-generated unsigned development artifact is not a production installer.

## Seventh increment — native runtime preflight

- Consolidated M3.6 macOS and Windows core and desktop CI passed. Local M3.7 core tests (18/18), Clippy, frontend build, desktop Clippy and checksum unit test passed.
- Confirmed the installed emulator launcher and its QEMU executable are native ARM64 Mach-O binaries on the Apple Silicon host. The official emulator version command itself still fails with SIGABRT/Qt NEON compatibility error. The root cause is not established; the failure occurs before any guest launches.
- Add one structured, fail-closed version and acceleration preflight shared by the desktop, CLI and smoke test. Do not launch a guest when the version probe fails. Display the actual diagnostic rather than treating a detected SDK or successful acceleration as runtime readiness.
- Next prerequisite: verify the official Android Emulator launches through Android Studio on a compatible physical macOS or Windows host using the supported SDK Manager installation. If the official emulator fails there, resolve that environment through official support before repeating the disposable smoke test. No host security changes, SDK replacement, or automatic retries were attempted.
- Production release remains blocked by native execution and clean-install verification.

## Eighth increment — macOS signing and installer integrity

- A downloaded unsigned development build was rejected by macOS as damaged. This alert alone does not establish the exact signature defect; do not override Gatekeeper.
- Add an owner-approved manual Developer ID signing and notarization job with a protected environment, explicit credential checks, temporary signing keychain, accepted notarization, stapled ticket validation, read-only DMG verification, app signature and Gatekeeper assessment, and final checksums. Ordinary PR artifacts remain clearly labeled unsigned.
- Owner certificate and notarization credentials are required before the new signed candidate can be built. See `docs/MACOS_SIGNING.md`. Production release remains blocked until signed build verification and real runtime testing succeed.

## Ninth increment — free local development signing

- Use Tauri's ad-hoc signing identity for ordinary Apple Silicon development builds; verify app signature and read-only DMG contents before uploading an explicitly labeled development artifact. Do not claim that the artifact is notarized or accepted by Gatekeeper when downloaded.
- Retain the protected Developer ID workflow for future public distribution. No Apple account is needed for local builds from source. Actual Android runtime remains an independent verification gate.
- Local macOS development bundle built with Tauri 2.12.4 and `APPLE_SIGNING_IDENTITY=-`; `codesign --verify --deep --strict` passed and the signature was reported as ad-hoc. No notarization or guest boot success is asserted.

## M4 — live application verification

- Local launch through macOS LaunchServices returned `kLSNoExecutableErr` (-10827) for both the original Tauri bundle and a local copy. The bundle's Info.plist identifies the present executable, which is a permissioned ARM64 Mach-O binary with a valid ad-hoc signature. The root cause of the LaunchServices failure is not established.
- Explicitly validate Info.plist, application package type, executable path and permissions, ARM64 architecture and code signature for both original and mounted development bundles and the future notarized bundle. These checks do not substitute for observed GUI launch.
- The owner must verify normal Finder launch on a compatible desktop session, then verify the official Android emulator independently and run the full disposable two-device smoke test. No security overrides or forced launches were performed. Production release remains blocked.
- CI follow-up: Tauri successfully produced the ad-hoc DMG, then cleaned the intermediate `.app` as expected for a DMG-only build. Correct the verification gate to require exactly one DMG and verify the packaged app after mounting read-only; do not require the temporary app. Signature and ARM64 executable checks remain mandatory.

## M4.1 — embedded Android screen and graceful exit

- Owner screenshots confirm the application opened and an external Android guest reached its home screen. The reported boot was about 33 seconds; two-device verification remains pending.
- Start managed Android emulators without external windows by default and display actual local screen captures in an in-app phone viewer. Three bottom navigation buttons and user-initiated taps/swipes are routed only to the selected, identity-verified managed device. The viewer is a bounded screenshot refresh, not a high-frame-rate streaming engine. `MES_HEADLESS=0` remains an explicit development diagnostic mode.
- Successful process exit is treated as stopped, not crashed. Nonzero exits retain diagnostics; detailed log excerpts are collapsed instead of filling the device card.
- Embedded rendering and navigation require real-host testing; no runtime success is asserted for the new mode until observed.

## M4.2 — responsive embedded controls

- Request the next visible screen frame 250 ms after completion, rather than 750 ms, without overlapping captures. Pause refresh in hidden windows and back off on errors; retain the last frame with input disabled while reconnecting. Refresh immediately after user input when no capture is in flight.
- Verify the managed running process and AVD identity before every interactive command without repeatedly collecting network addresses. Bound individual capture and input commands to three seconds; skip screen requests when the desktop controller is busy.
- Provide explicit volume and power controls underneath the three navigation buttons. Test the key allowlist and exercise volume on disposable Android guests in the real smoke gate.
- The screenshot polling interval is not a measured frame rate; real-host responsiveness and simultaneous guest capacity remain unverified.

## M4.3 — multi-device workspace and Google Play images

- New Android profiles require an installed official Google Play system image; legacy profiles remain bootable and untouched. The runtime installer uses the official Android 14 Google Play package matching the host architecture. No unofficial APKs or redistribution.
- Up to four independently controlled phone panels can be opened in the main workspace; only one bounded screenshot capture is in flight across the panels. This is adaptive screenshot refresh, not encoded video streaming.
- The installed-app check queries exact package names on the selected managed device. YouTube is not guaranteed by all official images; missing apps are reported, never silently sideloaded. The real smoke test requires both packages on each of two disposable guests before claiming that the image fulfills the requirement.
- Actual guest boot, both Google apps, concurrent display performance and video streaming remain verification/development gates.

## M4.4 — in-app Play image setup and binary display transport

- Connected Settings can add the official Android 14 Google Play image for the host CPU without updating emulator binaries or modifying existing AVDs. SDK licenses must be accepted personally; parallel image installation and profile creation are blocked while setup runs.
- Native desktop screen capture uses validated bounded PNG bytes over binary IPC instead of Base64 JSON, with object URL cleanup and off-screen polling suspension. The CLI retains its JSON screen contract. This remains screenshot refresh, not encoded video streaming or a measured FPS claim.
- Verify YouTube package presence and system-app status independently. If missing, a user-initiated button opens its official Play Store listing inside the selected managed guest. No unofficial APK, sign-in automation, or silent installation.
- Require successful real-host tests for Play Store, preinstalled YouTube and display performance before production release.

## M4.5 — display performance measurement and scheduling (first increment)

- A FIFO scheduler allocates the single capture slot to visible panels fairly; hidden and closed waiting panels relinquish their queue position. In-flight captures still release their own slot. Successful refreshes now request a new frame after 100 ms, subject to capture duration and contention.
- Each phone panel reports observed successful decoded frames per second, capture-plus-decode latency and average PNG transfer size. These are measured values, not a promised video frame rate. The display still uses PNG refresh rather than a native encoded video stream.
- The optional real-host smoke test captures five samples per disposable device in alternating order and reports median/max CLI capture round-trip latency and image size. Native video streaming, hardware decoder support, real macOS runtime checks and measured performance remain pending.

## M4.6 — managed first-run setup

- Add opt-in Quick setup for new users. Download official host-specific Android command-line tools (published SHA-256 pin), and Temurin Java from official metadata with the published archive checksum, into private application data. Verify downloads before extraction; use the official SDK manager to install platform tools, emulator and the Google Play Android 14 image. No separate Android Studio installation, silent license acceptance or SDK redistribution.
- Show official installer output and require a separate explicit user response to each license prompt. Keep legacy profiles on their existing SDK. Report package validation independently from emulator compatibility; an installed image does not prove successful boot or YouTube presence.
- Clean-machine download, license interactions, Windows setup, macOS native emulator launch, actual Play Store/YouTube checks and encoded video streaming are not yet verified. Production release remains blocked.

## M4.7 — first-run setup reliability

- Maintain setup phase, installer log and pending license state independently of Settings DOM. Re-rendering cannot lose the active session or prompt; competing license actions are serialized and a failed cancellation does not pretend setup stopped.
- Added automated desktop tests for separate license responses, duplicate clicks, cancellation retry, diagnostic retention and preventing connection after a failed installation. Run them on macOS and Windows in desktop CI.
- Actual clean-host downloads, boot, app availability and native encoded streaming remain separate release gates.

## M4.8 — isolated first-run QA and compatibility diagnostics

- Provide a separately identified development QA bundle which intentionally uses only its own managed SDK for automatic discovery. Existing production devices, metadata and SDK paths are untouched. This supports realistic first-run testing even when the host already has Android Studio or SDK tools.
- On the owner's Apple Silicon Mac, the official command-line tools URL responded successfully and official Temurin metadata returned an ARM64 macOS Java 21 archive and SHA-256. The existing machine SDK has only the Google APIs Android 14 image, not the Google Play image.
- The connected execution context denied a macOS CPU capability query; previous Qt/NEON preflight failures in this context do not establish physical CPU incompatibility. Clarify the diagnostic and require normal desktop testing instead of bypassing checks.
- Full downloads, interactive license acceptance, real guest boot, performance and YouTube checks require the owner's QA run. Do not claim these passed from build or endpoint checks alone.

## M4.9 — native runtime self-test

- Add a QA-only user-initiated two-device self-test using the private managed SDK. It validates the official emulator probe, concurrent boot and distinct managed processes, Google apps, local Home input, five PNG captures per guest, independent shutdown and cleanup. No ordinary profiles are modified; the QA app requires an empty profile list and the private SDK.
- Surface pass/failure, capture timing and cleanup diagnostics inside Settings. The test cannot pass when preflight fails, an app is missing or disposable cleanup fails. Unit tests exercise failure before guest creation; real native execution has not yet been observed.
- The isolated QA setup has not been completed on the owner host. Native verification, full installer acceptance, video streaming and production signing remain release blockers.

## M5 — release preparation (first increment)

- M4.9 core and desktop CI completed successfully on both supported platform runners. Add exact-commit candidate manifests with artifact size and SHA-256; preserve development/unsigned labels and distinguish notarized candidates.
- Add a fail-closed release evidence completeness and integrity check with tests for stale commits, missing runtime outcomes, unsigned packages and modified files. See `docs/RELEASE_READINESS.md`; the template intentionally contains pending values. Physical-host evidence and OS signature validation are still required and are not inferred from this script.
- Native streaming and actual clean setup/guest verification remain open. Do not publish or merge a production release solely because CI passed.

## M5.1–M5.5 — runtime, video and signing preparation

- M5.1: the connected Mac still has only the Google APIs image and its official emulator version probe aborts with the Qt/NEON diagnostic in this restricted execution context. No physical guest boot is claimed. The isolated QA app is required for actual first-run and boot testing.
- M5.2: implement opt-in experimental H.264 screen encoding through the selected managed guest, bounded local binary transfer, Annex-B parsing and WebCodecs decoding. Limit to two 30-second sessions; fall back to PNG on unsupported decoder, hidden screen, timeout or failure. No persistence or external stream listener. Synthetic H.264 parser and re-decode checks passed; native guest video and measured live desktop FPS remain unverified.
- M5.3: extend the QA self-test with bounded checks for H.264 parameter sets and a keyframe, distinct from rendered playback. Clean macOS/Windows install and personal license review must happen on physical hosts.
- M5.4: add a separate protected Windows Authenticode signing candidate workflow and documentation. Existing protected macOS notarization workflow retained. Neither production identity is configured or verified here.
- M5.5: retain release evidence gate. No stable release or merge while physical acceptance, continuous video performance and production signature checks are missing.
