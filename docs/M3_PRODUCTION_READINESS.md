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
