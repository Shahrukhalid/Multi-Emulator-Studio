//! User-initiated, disposable two-device runtime verification.
use crate::{
    android::{Android, Sdk},
    budget::Budget,
    manager::Manager,
    model::{DeviceSpec, DeviceState, GraphicsMode},
    runtime::NavigationKey,
    Error, Result,
};
use std::{
    path::Path,
    time::{Duration, Instant},
};
use uuid::Uuid;

#[derive(Default, serde::Serialize)]
pub struct QaReport {
    pub passed: bool,
    pub checks: Vec<String>,
    pub failure: Option<String>,
    pub cleanup_errors: Vec<String>,
}

/// Retain each local QA result, including failures, without replacing earlier evidence.
pub fn save_report(data: &Path, report: &QaReport) -> Result<std::path::PathBuf> {
    use std::io::Write;
    let mut file = tempfile::Builder::new()
        .prefix("qa-report-")
        .suffix(".json")
        .tempfile_in(data)?;
    serde_json::to_writer_pretty(&mut file, report)?;
    file.write_all(b"\n")?;
    file.as_file().sync_all()?;
    let (_, path) = file.keep().map_err(|err| err.error)?;
    Ok(path)
}

#[cfg(test)]
#[test]
fn qa_reports_retain_failed_attempts_without_overwriting() {
    let dir = tempfile::tempdir().unwrap();
    let report = QaReport {
        failure: Some("preflight failed".into()),
        ..QaReport::default()
    };
    let first = save_report(dir.path(), &report).unwrap();
    let second = save_report(dir.path(), &report).unwrap();
    assert_ne!(first, second);
    let json: serde_json::Value = serde_json::from_slice(&std::fs::read(first).unwrap()).unwrap();
    assert_eq!(json["passed"], false);
    assert_eq!(json["failure"], "preflight failed");
}

pub fn run(sdk: Sdk, data: &Path) -> QaReport {
    let mut report = QaReport::default();
    let host = crate::host::detect();
    report.checks.push(format!(
        "Host {} {}: {} logical cores, RAM {:?} MiB, free disk {:?} MiB",
        host.os,
        host.arch,
        host.cores,
        host.ram_mb,
        crate::host::disk_free_mb(data)
    ));
    let preflight = sdk.preflight();
    if !preflight.ready {
        report.failure = Some(preflight.diagnostic);
        return report;
    }
    report
        .checks
        .push("Official emulator version and acceleration passed".into());
    // Retain an isolated test directory if a device cannot be cleaned up.
    let path = match tempfile::Builder::new()
        .prefix("qa-runtime-")
        .tempdir_in(data)
    {
        Ok(dir) => dir.keep(),
        Err(err) => {
            report.failure = Some(err.to_string());
            return report;
        }
    };
    let mut ids = Vec::new();
    let mut manager = match Android::new(sdk.clone(), path.join("avds"))
        .and_then(|android| Manager::open(&path, android))
    {
        Ok(manager) => manager,
        Err(err) => {
            report.failure = Some(err.to_string());
            return report;
        }
    };
    let result = verify(&sdk, &mut manager, &mut ids, &mut report);
    if let Err(err) = result {
        report.failure = Some(err.to_string());
    }
    for id in ids {
        match manager.stop(id) {
            Ok(()) => {
                if let Err(err) = manager.delete(id) {
                    report
                        .cleanup_errors
                        .push(format!("Disposable profile cleanup: {err}"));
                }
            }
            Err(err) => report
                .cleanup_errors
                .push(format!("Disposable emulator stop: {err}")),
        }
    }
    drop(manager);
    report.passed = report.failure.is_none() && report.cleanup_errors.is_empty();
    if report.cleanup_errors.is_empty() {
        report
            .checks
            .push("Disposable devices stopped and removed".into());
    }
    report
}

fn verify(
    sdk: &Sdk,
    manager: &mut Manager<Android>,
    ids: &mut Vec<Uuid>,
    report: &mut QaReport,
) -> Result<()> {
    let image = sdk
        .images()?
        .into_iter()
        .find(|image| image.contains(";android-34;google_apis_playstore;"))
        .ok_or_else(|| {
            Error::Unavailable("Install the official Android 14 Google Play image first".into())
        })?;
    let profiles = sdk.hardware_profiles()?;
    let hardware = profiles
        .iter()
        .find(|profile| profile.as_str() == "pixel_6")
        .ok_or_else(|| Error::Unavailable("Pixel 6 hardware profile unavailable".into()))?
        .clone();
    let budget = Budget::from_host(&crate::host::detect())?;
    report.checks.push(format!(
        "Admission budget: {} MiB RAM and {} cores (reservations, not measured consumption)",
        budget.ram_mb, budget.cores
    ));
    for name in ["QA phone A", "QA phone B"] {
        let device = manager.create(DeviceSpec {
            name: name.into(),
            image: image.clone(),
            hardware_profile: hardware.clone(),
            ram_mb: 2048,
            cores: 2,
            width: if name.ends_with('A') { 1080 } else { 1440 },
            height: if name.ends_with('A') { 2400 } else { 3120 },
            disk_mb: 2048,
            locale: "en-US".into(),
            graphics_mode: GraphicsMode::Auto,
            proxy: None,
            location_preset: None,
        })?;
        ids.push(device.id);
    }
    let started = Instant::now();
    let a = manager.start(ids[0])?;
    let b = manager.start(ids[1])?;
    if a.state != DeviceState::Starting
        || b.state != DeviceState::Starting
        || a.console_port.is_none()
        || b.console_port.is_none()
        || a.console_port == b.console_port
        || a.pid.is_none()
        || b.pid.is_none()
        || a.pid == b.pid
    {
        return Err(Error::Unavailable(
            "Two independent emulator processes could not be admitted".into(),
        ));
    }
    loop {
        let mut ready = true;
        for id in ids.iter().copied() {
            let state = manager.status(id)?;
            match state.state {
                DeviceState::Ready => {}
                DeviceState::Starting => ready = false,
                _ => {
                    return Err(Error::Runtime(state.diagnostic.unwrap_or_else(|| {
                        format!("Guest failed to boot: {:?}", state.state)
                    })))
                }
            }
        }
        if ready {
            break;
        }
        if started.elapsed() > Duration::from_secs(300) {
            return Err(Error::Timeout("Two-device boot".into()));
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    report.checks.push(format!(
        "Two independent guests booted in {:.1} seconds",
        started.elapsed().as_secs_f64()
    ));
    // Exercise the same independent capture workers used by the desktop UI.
    for round in 1..=5 {
        let a = manager.prepare_screen_capture(ids[0])?;
        let b = manager.prepare_screen_capture(ids[1])?;
        let started = Instant::now();
        let (a, b) = std::thread::scope(|scope| {
            let a = scope.spawn(move || a.capture());
            let b = scope.spawn(move || b.capture());
            (a.join(), b.join())
        });
        let a = a.map_err(|_| Error::Runtime("Guest A capture worker failed".into()))??;
        let b = b.map_err(|_| Error::Runtime("Guest B capture worker failed".into()))??;
        report.checks.push(format!(
            "Concurrent capture {round}: A {} bytes, B {} bytes, {} ms",
            a.len(),
            b.len(),
            started.elapsed().as_millis()
        ));
    }
    for (index, id) in ids.iter().copied().enumerate() {
        let apps = manager.google_apps(id)?;
        report.checks.push(format!(
            "Guest {}: Play Store {}, YouTube {}, preinstalled {}",
            index + 1,
            apps.play_store,
            apps.youtube,
            apps.youtube_preinstalled
        ));
        if !apps.play_store || !apps.youtube || !apps.youtube_preinstalled {
            return Err(Error::Unavailable(
                "Google Play image did not include both required apps as specified".into(),
            ));
        }
        manager.navigate(id, NavigationKey::Home)?;
        let mut total = 0u128;
        for _ in 0..5 {
            let start = Instant::now();
            let png = manager.screen_png(id)?;
            if png.is_empty() {
                return Err(Error::Runtime("Empty screen frame".into()));
            }
            total += start.elapsed().as_millis();
        }
        report.checks.push(format!(
            "Guest {}: five valid PNG captures; mean capture {} ms",
            index + 1,
            total / 5
        ));
        let token = manager.video_start(id)?;
        let sample = (|| -> Result<usize> {
            let deadline = Instant::now() + Duration::from_secs(8);
            let mut bytes = Vec::new();
            while Instant::now() < deadline && bytes.len() < 2 * 1024 * 1024 {
                let packet = manager.video_read(id, token)?;
                match packet.first() {
                    Some(1) => bytes.extend_from_slice(&packet[1..]),
                    Some(2) => break,
                    _ => std::thread::sleep(Duration::from_millis(20)),
                }
                if has_video_headers(&bytes) {
                    return Ok(bytes.len());
                }
            }
            Err(Error::Unavailable(
                "Android encoder did not yield H.264 SPS, PPS and IDR sample".into(),
            ))
        })();
        manager.video_stop(id, token)?;
        report.checks.push(format!("Guest {}: H.264 encoder emitted headers and keyframe ({} bytes sampled; decoder playback not verified)", index + 1, sample?));
    }
    // Harmless unique files in the disposable guests' writable data partition.
    // Neither a production AVD nor an external device is targeted.
    manager.qa_persistence_marker(ids[0], true)?;
    manager.qa_persistence_marker(ids[1], true)?;
    manager.stop(ids[0])?;
    if manager.status(ids[1])?.state != DeviceState::Ready {
        return Err(Error::Runtime(
            "Stopping one guest affected the other".into(),
        ));
    }
    report.checks.push("Independent shutdown verified".into());
    // Restart the same disposable profile while its sibling remains running.
    let before = manager
        .list()?
        .into_iter()
        .find(|d| d.id == ids[0])
        .ok_or_else(|| Error::Runtime("Missing QA profile after shutdown".into()))?;
    let restarted = manager.start(ids[0])?;
    if restarted.state != DeviceState::Starting {
        return Err(Error::Runtime("QA profile could not restart".into()));
    }
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        let state = manager.status(ids[0])?;
        if state.state == DeviceState::Ready {
            break;
        }
        if state.state != DeviceState::Starting {
            return Err(Error::Runtime(
                state
                    .diagnostic
                    .unwrap_or_else(|| "QA restart failed".into()),
            ));
        }
        if Instant::now() >= deadline {
            return Err(Error::Timeout("QA profile restart".into()));
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    let after = manager.list()?.into_iter().find(|d| d.id == ids[0]);
    if after.as_ref() != Some(&before) || manager.status(ids[1])?.state != DeviceState::Ready {
        return Err(Error::Runtime(
            "Profile changed or sibling stopped during restart".into(),
        ));
    }
    manager.screen_png(ids[0])?;
    manager.qa_persistence_marker(ids[0], false)?;
    manager.qa_persistence_marker(ids[1], false)?;
    report.checks.push("Same profile identity/settings and guest data marker retained after restart; sibling remained ready with its own marker (arbitrary app-data migration not verified)".into());
    Ok(())
}

fn has_video_headers(bytes: &[u8]) -> bool {
    let mut flags = [false; 3];
    for window in bytes.windows(4) {
        if window[..3] == [0, 0, 1] {
            match window[3] & 31 {
                7 => flags[0] = true,
                8 => flags[1] = true,
                5 => flags[2] = true,
                _ => {}
            }
        }
    }
    flags.into_iter().all(|flag| flag)
}

#[cfg(test)]
#[test]
fn qa_video_checks_for_required_nal_types() {
    assert!(!has_video_headers(&[0, 0, 1, 0x67]));
    assert!(has_video_headers(&[
        0, 0, 0, 1, 0x67, 0, 0, 1, 0x68, 0, 0, 1, 0x65
    ]));
}

#[cfg(test)]
#[test]
fn failed_preflight_never_creates_qa_devices() {
    let data = tempfile::tempdir().unwrap();
    let missing = data.path().join("missing");
    let sdk = Sdk {
        root: data.path().to_owned(),
        emulator: missing.clone(),
        adb: missing.clone(),
        avdmanager: missing.clone(),
        sdkmanager: missing,
    };
    let result = run(sdk, data.path());
    assert!(!result.passed);
    assert!(result.failure.is_some());
    assert_eq!(std::fs::read_dir(data.path()).unwrap().count(), 0);
}
