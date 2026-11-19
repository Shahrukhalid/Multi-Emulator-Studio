# Architecture

The desktop shell is a local controller. Rust owns validation, process orchestration, resource checks and SQLite metadata; the Android SDK owns virtualization. Each generated UUID maps to one private AVD, and its display name is not an executable argument or filesystem identifier. Future Apple Simulator and Cuttlefish adapters use the Engine interface; neither is implemented.

M0: schema, host, errors, runtime contract and unit tests.
M1: official SDK detection, AVD lifecycle and desktop control.
M2: resource admission, simultaneous independent AVD verification and recovery.

No telemetry or remote execution. Never distribute Google system images. SDK installation and licenses remain under the user's control.
