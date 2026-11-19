# Dependency and privacy policy

Keep Cargo and npm lockfiles committed; use locked builds and review dependency changes and their license obligations. Run cargo audit before packaging. Never disable a failing check or bypass repository protection. Third-party binary notices must be produced and included before distributing a packaged commercial release.

The app runs local, official SDK executables with typed arguments; no arbitrary host shell interface is exposed. Managed storage is user-owned local data, not a cloud service. Never commit or upload SDK images, APKs, AVDs, local metadata, logs, auth keys, credentials or signing material. Logs may contain private device information; display locally only. Treat paths selected by users as trusted local SDK/APK paths, not remote URLs.

Runtime testing is separate from compilation. Distribution remains disabled pending successful runtime and security gates, and installation of SDK tools is user-authorized.
