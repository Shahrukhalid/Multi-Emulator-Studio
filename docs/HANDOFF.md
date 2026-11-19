# Multi-Emulator Studio — foundation handoff

**Development only. M0 and M1 implemented in milestone branches; M2 partially implemented and runtime-unverified. No commercial release or passed merge gate.**

## Changes and PRs

| Milestone | PR | Commit | Scope |
|---|---|---|---|
| M0 | [#1](https://github.com/Shahrukhalid/Multi-Emulator-Studio/pull/1) | 2706b6194f2b175b350746186b318e57bc727cbb | Rust core, SQLite schema, errors, host probe, Engine contract, CI |
| M1 | [#2](https://github.com/Shahrukhalid/Multi-Emulator-Studio/pull/2) | eeb5e882fc33a0880ebd5ce67876f5df04490e09 | Official SDK, lifecycle, controller, Tauri 2/TypeScript panel, resource queue, desktop checks |
| M2 | [#3](https://github.com/Shahrukhalid/Multi-Emulator-Studio/pull/3) | See branch head | Port identity diagnostics, crash state, network overlap report, tests, real-host smoke test, handoff |

PRs are stacked. Merge in order only after required checks pass. Do not publish a commercial release.

## Follow-up hardening

Moved desktop queue/health supervision into a native backend worker; the webview reads cached statuses. Failed queued starts are removed from automatic retries and retain a per-device diagnostic until explicit retry/stop. Failed status queries do not block other profiles. Official avdmanager hardware profile discovery is exposed as a constrained dropdown. The installed SDK returned real profile IDs, including pixel_6.

Local equivalent changes passed seven Rust unit tests, core and desktop Clippy, desktop cargo check and TypeScript build. The local execution environment disconnected before export; this commit reconstructs those changes from the tested diffs. Remote byte-for-byte verification, CI and real boot remain pending.

## Actual verification

Apple Silicon macOS, aarch64, 10 logical CPU cores, 16 GiB RAM, approximately 11 GiB free disk at test time, Rust 1.91.1. Official SDK installed, Android 14/API 34 Google APIs arm64-v8a image. Emulator acceleration returned code 0 with Hypervisor.Framework. No SDK images or credentials were committed.

Core local:

- cargo fmt --check — passed.
- cargo test --offline --locked — 5 passed, 0 failed: 120 stored profiles and duplicate ID protection; budget calculations; guest address overlap; controller lock; mock concurrent starts, queue admission, restart and delete.
- cargo clippy --offline --locked --all-targets -- -D warnings — passed.
- cargo run --offline -- --probe — actual host SDK/image detection and acceleration probe passed.

Desktop local (macOS):

- npm run build — TypeScript compilation and static asset generation passed. npm install could not write to the local npm cache; the exact locked TypeScript tarball was read from the existing cache into the project.
- cargo fmt --check, cargo check --offline --locked, cargo clippy --offline --locked --all-targets -- -D warnings — passed.
- Tauri CLI 2.12.4 build --debug --bundles dmg --no-sign --ci -- --locked with offline Cargo — compiled a macOS binary and unsigned .app development bundle. DMG failed at hdiutil: create failed - Device not configured. Rebuilding with --bundles app succeeded. No installable DMG or EXE is claimed; the .app was not launched or functionally validated.

Real Android integration:

- cargo build --offline; python3 tests/real_smoke.py SDK_DIRECTORY — official avdmanager created two named disposable AVD profiles using the installed image. Both were deleted by cleanup.
- Start failed before emulator spawn: loopback console/ADB port reservation could not succeed. A direct socket-bind diagnostic returned PermissionError: [Errno 1] Operation not permitted on 127.0.0.1:5554. Do not bypass this environment restriction.
- Neither emulator booted. Real concurrent runtime, app-data isolation, APK install, guest IP observation, restart persistence and crash recovery remain unverified.

Windows compile, packaging and runtime: **not verified**. GitHub Actions M0 run 44441292175 and M1 runs 44442685185/44442685316 failed; GitHub displayed that jobs did not start because recent account payments failed or spending limit needs to be increased. Account owner must resolve billing. No paid service was activated, no check bypassed, no retries.

## API contracts

Local CLI: cargo run --locked -- DATA_DIRECTORY [SDK_DIRECTORY]. One JSON request per line; reply is {"ok": ...} or {"error":{"code":"...","message":"..."}}.

Tauri commands: default_data_dir(), connect({root,sdkRoot}), dispatch({request}), health(). Connect establishes one local controller and persists SDK root. Typed SDK operations execute off the UI thread. Request shapes match Rust control::Request.

| action | fields | result |
|---|---|---|
| host | none | OS, arch, CPU, RAM, disk availability, support |
| sdk / images / acceleration | none | official tools, installed images, acceleration |
| hardware_profiles | none | discovered supported hardware IDs |
| list | none | persisted Device records |
| create | spec | new Device with generated UUID |
| clone_profile | id, name | fresh AVD with copied settings, not app data |
| start / restart / status | id | Status |
| stop / delete | id | boolean success |
| install_apk | id, path | boolean success; local APK only |
| logs | id | bounded recent logcat text |
| tick | none | health statuses and queued starts |
| network | none | observed interface statuses and duplicate address report |

DeviceSpec: name, image, hardware_profile, ram_mb, cores, width, height, disk_mb, locale. Input validated. AVD names derive from generated UUIDs. Status: id, state, pid, console_port, addresses, optional diagnostic. States: queued, stopped, starting, ready, stopping, crashed, unknown. Errors: invalid, unavailable, conflict, timeout, runtime, io, storage, json; desktop also internal.

## Remaining verification and limitations

- Complete opt-in smoke test on a normal compatible host with loopback permission, ample disk, and accepted SDK license. It attempts concurrent start, distinct PID/ports, isolated guest settings, restart persistence and cleanup. Extend with disposable APK to prove independent installed apps and app data.
- Locale is validated/stored but not applied to guest OS; implement via officially supported mechanism. Clone is configuration-only, not disk/app-data cloning.
- SDK guidance points to official tools and interactive license acceptance; no automatic installer or live uninstalled image catalog. Hardware-profile selection uses official avdmanager IDs restricted to the currently supported safe identifier format. No license acceptance automation.
- Conservative total RAM/CPU budget plus measured free disk reserve, not live per-instance forecasting. Queue is in memory and ticked by a native desktop worker; CLI requires explicit tick. Individual failures are isolated in diagnostics. Durable lifecycle state and fully independent per-device probe scheduling remain pending.
- Unknown/stale AVD locks fail closed. No automatic adoption or stale lock removal after abrupt crash. Normal shutdown attempts official emulator stop.
- Port scan is advisory: external process can claim a port before launch. SDK owns exclusive socket binding. ADB commands verify managed AVD name before targeting. Cross-process races unverified.
- Guest network observations require boot; duplicate private addresses may be normal on separate NAT networks. Public IP uniqueness and MAC customization not promised; no network observations from this run.
- Windows x64 compile and hardware acceleration tests, security audit and third-party notices remain required. No signing, notarization, billing, telemetry or commercial licensing implemented.

## Production GUI instructions for Antigravity

Start from milestone/m2-verification after checks and real-runtime blockers are resolved. Preserve Rust Engine, typed dispatcher, database and controller lock. Build polished device grid/list, create wizard, SDK onboarding and explicit license handling, lifecycle/health indicators, budget and queue view, APK picker, local logs and network limitations. Native pickers and deletion confirmations; never expose arbitrary shell or ADB commands. Show unavailable/error/queued/unknown states truthfully. Keep licensing separate, do not bundle restricted images or upload device data, preserve copyright and third-party notices, and avoid contributor trailers/branding. Verify actual backend calls and both platforms before release.
