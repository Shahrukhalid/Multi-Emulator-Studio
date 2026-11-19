# Multi-Emulator Studio

Proprietary development desktop application for managing official Android Emulator instances. Copyright © 2026 Shahrukh Khalid. All rights reserved.

This is a development foundation — not a commercial release. See [handoff](docs/HANDOFF.md) for verified functionality, unresolved runtime and CI gates, API contracts and next steps. See [SDK setup](docs/SDK.md) for prerequisites and local development, and [release readiness](docs/RELEASE_READINESS.md) for the production evidence gate.

Core: Rust stable (1.91 or later), cargo test --locked. Desktop: cd desktop, npm ci, npm run build, cargo run --locked. No Google system image is redistributed. No telemetry or commercial license activation is implemented.
