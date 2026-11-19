use crate::{
    model::{Device, DeviceState, Status},
    runtime::Engine,
    Error, Result,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, SeekFrom, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use uuid::Uuid;

const SHORT: Duration = Duration::from_secs(20);

fn log_tail(log: &Path, limit: u64) -> std::io::Result<String> {
    let mut file = fs::File::open(log)?;
    let start = file.metadata()?.len().saturating_sub(limit);
    file.seek(SeekFrom::Start(start))?;
    let mut bytes = Vec::new();
    file.take(limit).read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).trim().to_owned())
}

fn crash_diagnostic(log: &Path, exit: std::process::ExitStatus) -> String {
    let message = format!("emulator exited: {exit}; see local emulator log");
    let excerpt = log_tail(log, 4096);
    match excerpt {
        Ok(tail) if !tail.is_empty() => format!("{message}\n{tail}"),
        _ => message,
    }
}

/// No shell interpolation. Bounded process output is kept in temporary files.
pub fn run(cmd: &mut Command, stdin: Option<&str>, timeout: Duration) -> Result<String> {
    let mut output = tempfile::tempfile()?;
    let mut child = cmd
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(output.try_clone()?)
        .stderr(output.try_clone()?)
        .spawn()?;
    if let Some(input) = stdin {
        let result = child
            .stdin
            .take()
            .ok_or_else(|| Error::Runtime("missing stdin".into()))?
            .write_all(input.as_bytes());
        if let Err(e) = result {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e.into());
        }
    }
    let deadline = Instant::now() + timeout;
    loop {
        if output.metadata()?.len() > 16 * 1024 * 1024 {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::Runtime("SDK command output exceeded 16 MiB".into()));
        }
        if let Some(status) = child.try_wait()? {
            let size = output.metadata()?.len();
            output.seek(SeekFrom::Start(size.saturating_sub(1024 * 1024)))?;
            let mut bytes = Vec::new();
            output.take(1024 * 1024).read_to_end(&mut bytes)?;
            let text = String::from_utf8_lossy(&bytes).into_owned();
            return if status.success() {
                Ok(text)
            } else {
                Err(Error::Runtime(format!(
                    "SDK command exited with {status}: {text}"
                )))
            };
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::Timeout("SDK command".into()));
        }
        thread::sleep(Duration::from_millis(100));
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Sdk {
    pub root: PathBuf,
    pub emulator: PathBuf,
    pub adb: PathBuf,
    pub avdmanager: PathBuf,
    pub sdkmanager: PathBuf,
}
impl Sdk {
    pub fn detect(root: Option<PathBuf>) -> Result<Self> {
        let root = root
            .or_else(|| std::env::var_os("ANDROID_HOME").map(PathBuf::from))
            .or_else(|| std::env::var_os("ANDROID_SDK_ROOT").map(PathBuf::from))
            .or_else(|| {
                if cfg!(target_os = "macos") {
                    std::env::var_os("HOME").map(|p| PathBuf::from(p).join("Library/Android/sdk"))
                } else if cfg!(target_os = "windows") {
                    std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Android/Sdk"))
                } else {
                    None
                }
            })
            .ok_or_else(|| Error::Unavailable("choose Android SDK directory".into()))?
            .canonicalize()?;
        let suffix = if cfg!(windows) { ".exe" } else { "" };
        let batch = if cfg!(windows) { ".bat" } else { "" };
        let sdk = Self {
            emulator: root.join("emulator").join(format!("emulator{suffix}")),
            adb: root.join("platform-tools").join(format!("adb{suffix}")),
            avdmanager: root
                .join("cmdline-tools/latest/bin")
                .join(format!("avdmanager{batch}")),
            sdkmanager: root
                .join("cmdline-tools/latest/bin")
                .join(format!("sdkmanager{batch}")),
            root,
        };
        for tool in [&sdk.emulator, &sdk.adb, &sdk.avdmanager, &sdk.sdkmanager] {
            if !tool.is_file() {
                return Err(Error::Unavailable(format!(
                    "missing SDK tool: {}",
                    tool.display()
                )));
            }
        }
        Ok(sdk)
    }
    pub fn images(&self) -> Result<Vec<String>> {
        let mut images = Vec::new();
        let base = self.root.join("system-images");
        let abi = match std::env::consts::ARCH {
            "aarch64" => "arm64-v8a",
            "x86_64" => "x86_64",
            _ => return Err(Error::Unavailable("unsupported CPU".into())),
        };
        if !base.exists() {
            return Ok(images);
        }
        for api in fs::read_dir(base)? {
            let api = api?;
            if !api.file_type()?.is_dir() {
                continue;
            }
            for tag in fs::read_dir(api.path())? {
                let tag = tag?;
                if tag.path().join(abi).join("system.img").is_file() {
                    images.push(format!(
                        "system-images;{};{};{abi}",
                        api.file_name().to_string_lossy(),
                        tag.file_name().to_string_lossy()
                    ));
                }
            }
        }
        images.sort();
        Ok(images)
    }
    pub fn acceleration(&self) -> Result<String> {
        run(
            Command::new(&self.emulator).arg("-accel-check"),
            None,
            SHORT,
        )
    }
    pub fn hardware_profiles(&self) -> Result<Vec<String>> {
        let text = run(
            Command::new(&self.avdmanager)
                .env("ANDROID_HOME", &self.root)
                .env("ANDROID_SDK_ROOT", &self.root)
                .args(["list", "device", "-c"]),
            None,
            SHORT,
        )?;
        Ok(parse_hardware_profiles(&text))
    }
}

/// Install only the fixed official runtime packages using an existing SDK manager.
/// Licenses must already have been accepted interactively by the user.
pub fn install_runtime(root: &Path) -> Result<Sdk> {
    let root = root.canonicalize()?;
    let batch = if cfg!(windows) { ".bat" } else { "" };
    let manager = root.join(format!("cmdline-tools/latest/bin/sdkmanager{batch}"));
    if !manager.is_file() {
        return Err(Error::Unavailable(
            "Install official Android SDK command-line tools first".into(),
        ));
    }
    let abi = match std::env::consts::ARCH {
        "aarch64" => "arm64-v8a",
        "x86_64" => "x86_64",
        _ => return Err(Error::Unavailable("unsupported CPU".into())),
    };
    let image = format!("system-images;android-34;google_apis;{abi}");
    run(
        Command::new(manager)
            .env("ANDROID_HOME", &root)
            .env("ANDROID_SDK_ROOT", &root)
            .args(["--install", "platform-tools", "emulator", &image]),
        None,
        Duration::from_secs(1800),
    )?;
    let sdk = Sdk::detect(Some(root))?;
    if !sdk.images()?.contains(&image) {
        return Err(Error::Unavailable(
            "requested system image was not installed".into(),
        ));
    }
    Ok(sdk)
}

#[cfg(test)]
#[test]
fn runtime_install_requires_existing_sdkmanager() {
    let dir = tempfile::tempdir().unwrap();
    assert!(install_runtime(dir.path()).is_err());
}

fn parse_hardware_profiles(text: &str) -> Vec<String> {
    let mut profiles: Vec<_> = text
        .lines()
        .map(str::trim)
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 128
                && *s != "."
                && *s != ".."
                && !s.starts_with('-')
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"_-.".contains(&c))
        })
        .map(str::to_owned)
        .collect();
    profiles.sort();
    profiles.dedup();
    profiles
}

#[cfg(test)]
#[test]
fn hardware_catalog_filters_unsupported_identifiers() {
    assert_eq!(
        parse_hardware_profiles("pixel_6\nNexus 5\nmedium_phone\npixel_6\n..\n-force\n"),
        ["medium_phone", "pixel_6"]
    );
}

struct Instance {
    child: Child,
    port: u16,
    started: Instant,
    ever_ready: bool,
    spec: crate::model::DeviceSpec,
}

fn readiness_state(ever_ready: bool, ready: bool) -> DeviceState {
    if ready {
        DeviceState::Ready
    } else if ever_ready {
        DeviceState::Unknown
    } else {
        DeviceState::Starting
    }
}

#[cfg(test)]
#[test]
fn transient_adb_loss_does_not_return_to_initial_boot() {
    assert_eq!(readiness_state(false, false), DeviceState::Starting);
    assert_eq!(readiness_state(false, true), DeviceState::Ready);
    assert_eq!(readiness_state(true, false), DeviceState::Unknown);
    assert_eq!(readiness_state(true, true), DeviceState::Ready);
}

#[cfg(test)]
#[test]
fn stopped_crash_logs_remain_available_and_stop_clears_crash() {
    let dir = tempfile::tempdir().unwrap();
    let sdk = Sdk {
        root: dir.path().to_path_buf(),
        emulator: dir.path().join("emulator"),
        adb: dir.path().join("adb"),
        avdmanager: dir.path().join("avdmanager"),
        sdkmanager: dir.path().join("sdkmanager"),
    };
    let mut engine = Android::new(sdk, dir.path().join("avds")).unwrap();
    let d = Device::new(crate::model::sample()).unwrap();
    fs::write(engine.log_path(&d), "local crash log").unwrap();
    engine.crashed.insert(d.id, "test failure".into());
    assert_eq!(engine.status(&d).unwrap().state, DeviceState::Crashed);
    assert_eq!(engine.logs(&d).unwrap(), "local crash log");
    engine.stop(&d).unwrap();
    assert_eq!(engine.status(&d).unwrap().state, DeviceState::Stopped);
    assert_eq!(log_tail(&engine.log_path(&d), 3).unwrap(), "log");
}

pub struct Android {
    sdk: Sdk,
    home: PathBuf,
    active: HashMap<Uuid, Instance>,
    crashed: HashMap<Uuid, String>,
}
impl Android {
    pub fn new(sdk: Sdk, home: PathBuf) -> Result<Self> {
        fs::create_dir_all(&home)?;
        fs::create_dir_all(home.join("android-user"))?;
        Ok(Self {
            sdk,
            home: home.canonicalize()?,
            active: HashMap::new(),
            crashed: HashMap::new(),
        })
    }
    pub fn sdk(&self) -> &Sdk {
        &self.sdk
    }
    fn command(&self, path: &Path) -> Command {
        let mut cmd = Command::new(path);
        cmd.env("ANDROID_HOME", &self.sdk.root)
            .env("ANDROID_SDK_ROOT", &self.sdk.root)
            .env("ANDROID_AVD_HOME", &self.home)
            .env("ANDROID_USER_HOME", self.home.join("android-user"))
            .env("ANDROID_EMULATOR_HOME", self.home.join("android-user"));
        cmd
    }
    fn avd_dir(&self, d: &Device) -> PathBuf {
        self.home.join(format!("{}.avd", d.avd_name()))
    }
    fn log_path(&self, d: &Device) -> PathBuf {
        self.home.join(format!("{}.log", d.avd_name()))
    }
    fn adb_for(&self, port: u16) -> Command {
        let mut cmd = self.command(&self.sdk.adb);
        cmd.args(["-s", &format!("emulator-{port}")]);
        cmd
    }
    fn port(&self) -> Result<u16> {
        // Emulator console uses an even port and ADB the next odd port.
        for port in (5554u16..=5682).step_by(2) {
            if self.active.values().any(|i| i.port == port) {
                continue;
            }
            let console = match TcpListener::bind(("127.0.0.1", port)) {
                Ok(x) => x,
                Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
                Err(e) => {
                    return Err(Error::Unavailable(format!(
                        "cannot reserve emulator console port: {e}"
                    )))
                }
            };
            match TcpListener::bind(("127.0.0.1", port + 1)) {
                Ok(_adb) => {
                    drop(console);
                    return Ok(port);
                }
                Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
                Err(e) => {
                    return Err(Error::Unavailable(format!(
                        "cannot reserve emulator ADB port: {e}"
                    )))
                }
            }
        }
        Err(Error::Conflict("no available emulator port pair".into()))
    }
    fn assert_idle(&mut self, d: &Device) -> Result<()> {
        if let Some(i) = self.active.get_mut(&d.id) {
            if i.child.try_wait()?.is_none() {
                return Err(Error::Conflict("device is active".into()));
            }
        }
        self.active.remove(&d.id);
        // Never remove unknown/stale emulator locks automatically.
        let dir = self.avd_dir(d);
        if dir.exists() {
            if !dir.canonicalize()?.starts_with(&self.home) {
                return Err(Error::Conflict("AVD outside managed directory".into()));
            }
            for entry in fs::read_dir(&dir)? {
                if entry?.file_name().to_string_lossy().ends_with(".lock") {
                    return Err(Error::Conflict("AVD lock exists; stop the external process or recover using official tools".into()));
                }
            }
        }
        Ok(())
    }
    fn ready_port(&mut self, d: &Device) -> Result<u16> {
        let s = self.status(d)?;
        if s.state != DeviceState::Ready {
            return Err(Error::Conflict("device is not ready".into()));
        }
        s.console_port
            .ok_or_else(|| Error::Conflict("missing port".into()))
    }
    fn owns_port(&self, d: &Device, port: u16) -> bool {
        run(
            self.adb_for(port).args(["emu", "avd", "name"]),
            None,
            Duration::from_secs(5),
        )
        .map(|s| s.lines().any(|l| l.trim() == d.avd_name()))
        .unwrap_or(false)
    }
    fn check_disk(&self, required: u64) -> Result<()> {
        let free = crate::host::disk_free_mb(&self.home)
            .ok_or_else(|| Error::Unavailable("cannot measure free disk space".into()))?;
        if free < required + 2048 {
            return Err(Error::Unavailable(
                "insufficient disk space (2 GB host reserve)".into(),
            ));
        }
        Ok(())
    }
}
impl Engine for Android {
    fn create(&mut self, d: &Device) -> Result<()> {
        d.spec.validate()?;
        self.check_disk(u64::from(d.spec.disk_mb))?;
        if !self.sdk.images()?.contains(&d.spec.image) {
            return Err(Error::Unavailable(
                "install an architecture-compatible image using sdkmanager".into(),
            ));
        }
        if self.avd_dir(d).exists() {
            return Err(Error::Conflict("AVD already exists".into()));
        }
        let name = d.avd_name();
        run(
            self.command(&self.sdk.avdmanager).args([
                "create",
                "avd",
                "--name",
                &name,
                "--package",
                &d.spec.image,
                "--device",
                &d.spec.hardware_profile,
            ]),
            Some("no\n"),
            Duration::from_secs(60),
        )?;
        let configured = (|| -> Result<()> {
            let avd = self.avd_dir(d).canonicalize()?;
            if !avd.starts_with(&self.home) {
                return Err(Error::Conflict("AVD outside managed directory".into()));
            }
            let config = avd.join("config.ini");
            if !config.canonicalize()?.starts_with(&avd) {
                return Err(Error::Conflict(
                    "AVD config outside managed directory".into(),
                ));
            }
            let mut data = fs::read_to_string(&config)?;
            let settings = [
                ("hw.ramSize", d.spec.ram_mb.to_string()),
                ("hw.cpu.ncore", d.spec.cores.to_string()),
                ("hw.lcd.width", d.spec.width.to_string()),
                ("hw.lcd.height", d.spec.height.to_string()),
                ("disk.dataPartition.size", format!("{}M", d.spec.disk_mb)),
            ];
            for (key, val) in settings {
                data = data
                    .lines()
                    .filter(|line| {
                        line.split_once('=')
                            .map(|(k, _)| k.trim() != key)
                            .unwrap_or(true)
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                data.push_str(&format!("\n{key}={val}\n"));
            }
            fs::write(config, data)?;
            Ok(())
        })();
        if let Err(err) = configured {
            // Only the just-created, UUID-named AVD is eligible for rollback.
            if self.assert_idle(d).is_ok() {
                if let Err(cleanup) = self.delete(d) {
                    return Err(Error::Runtime(format!(
                        "profile configuration failed: {err}; rollback failed: {cleanup}"
                    )));
                }
            }
            return Err(err);
        }
        Ok(())
    }
    fn start(&mut self, d: &Device) -> Result<Status> {
        self.assert_idle(d)?;
        let dead: Vec<_> = self
            .active
            .iter_mut()
            .filter_map(|(id, i)| match i.child.try_wait() {
                Ok(Some(exit)) => Some((*id, exit)),
                _ => None,
            })
            .collect();
        for (id, exit) in dead {
            self.active.remove(&id);
            let log = self.home.join(format!("mes_{}.log", id.simple()));
            self.crashed.insert(id, crash_diagnostic(&log, exit));
        }
        let budget = crate::budget::Budget::from_host(&crate::host::detect())?;
        if !budget.fits(std::iter::empty(), &d.spec) {
            return Err(Error::Unavailable(
                "profile exceeds total managed host capacity".into(),
            ));
        }
        if !budget.fits(self.active.values().map(|i| i.spec.clone()), &d.spec) {
            return Ok(Status {
                id: d.id,
                state: DeviceState::Queued,
                pid: None,
                console_port: None,
                addresses: vec![],
                diagnostic: None,
            });
        }
        self.check_disk(1024)?;
        let accel = self.sdk.acceleration()?;
        if !accel.lines().any(|l| l.trim() == "0") {
            return Err(Error::Unavailable(
                "hardware acceleration unavailable".into(),
            ));
        }
        if !self.avd_dir(d).join("config.ini").is_file() {
            return Err(Error::Unavailable("AVD missing".into()));
        }
        let port = self.port()?;
        let name = d.avd_name();
        let log = fs::File::create(self.log_path(d))?;
        let mut launch = self.command(&self.sdk.emulator);
        launch.args([
            "-avd",
            &name,
            "-port",
            &port.to_string(),
            "-no-snapshot",
            "-accel",
            "on",
        ]);
        if std::env::var_os("MES_HEADLESS").as_deref() == Some(std::ffi::OsStr::new("1")) {
            launch.arg("-no-window");
        }
        let child = launch
            .stdin(Stdio::null())
            .stdout(log.try_clone()?)
            .stderr(log)
            .spawn()?;
        self.active.insert(
            d.id,
            Instance {
                child,
                port,
                started: Instant::now(),
                ever_ready: false,
                spec: d.spec.clone(),
            },
        );
        self.crashed.remove(&d.id);
        Ok(Status {
            id: d.id,
            state: DeviceState::Starting,
            pid: self.active.get(&d.id).map(|i| i.child.id()),
            console_port: Some(port),
            addresses: vec![],
            diagnostic: None,
        })
    }
    fn status(&mut self, d: &Device) -> Result<Status> {
        let Some(instance) = self.active.get_mut(&d.id) else {
            let state = if self.assert_idle(d).is_ok() {
                if self.crashed.contains_key(&d.id) {
                    DeviceState::Crashed
                } else {
                    DeviceState::Stopped
                }
            } else {
                DeviceState::Unknown
            };
            return Ok(Status {
                id: d.id,
                state,
                pid: None,
                console_port: None,
                addresses: vec![],
                diagnostic: self.crashed.get(&d.id).cloned(),
            });
        };
        if let Some(exit) = instance.child.try_wait()? {
            self.active.remove(&d.id);
            let diagnostic =
                crash_diagnostic(&self.home.join(format!("{}.log", d.avd_name())), exit);
            self.crashed.insert(d.id, diagnostic.clone());
            return Ok(Status {
                id: d.id,
                state: DeviceState::Crashed,
                pid: None,
                console_port: None,
                addresses: vec![],
                diagnostic: Some(diagnostic),
            });
        }
        let port = instance.port;
        let pid = instance.child.id();
        let ever_ready = instance.ever_ready;
        let should_timeout = !ever_ready && instance.started.elapsed() > Duration::from_secs(300);
        let ready = self.owns_port(d, port)
            && run(
                self.adb_for(port)
                    .args(["shell", "getprop", "sys.boot_completed"]),
                None,
                SHORT,
            )
            .map(|s| s.trim() == "1")
            .unwrap_or(false);
        if !ready && should_timeout {
            self.stop(d)?;
            self.crashed.insert(
                d.id,
                "emulator boot timed out; see local emulator log".into(),
            );
            return Err(Error::Timeout("emulator boot".into()));
        }
        let state = readiness_state(ever_ready, ready);
        if let Some(i) = self.active.get_mut(&d.id) {
            i.ever_ready |= ready;
        }
        let addresses = if ready {
            run(
                self.adb_for(port)
                    .args(["shell", "ip", "-o", "addr", "show"]),
                None,
                SHORT,
            )
            .unwrap_or_default()
            .lines()
            .filter_map(|l| {
                let fields: Vec<_> = l.split_whitespace().collect();
                if fields.len() > 3 && matches!(fields[2], "inet" | "inet6") && fields[1] != "lo" {
                    Some(fields[3].to_owned())
                } else {
                    None
                }
            })
            .collect()
        } else {
            vec![]
        };
        Ok(Status {
            id: d.id,
            state,
            pid: Some(pid),
            console_port: Some(port),
            addresses,
            diagnostic: (ever_ready && !ready)
                .then(|| "emulator still running; ADB readiness temporarily unavailable".into()),
        })
    }
    fn stop(&mut self, d: &Device) -> Result<()> {
        let Some(port) = self.active.get(&d.id).map(|i| i.port) else {
            self.assert_idle(d)?;
            self.crashed.remove(&d.id);
            return Ok(());
        };
        if self.owns_port(d, port) {
            let _ = run(self.adb_for(port).args(["emu", "kill"]), None, SHORT);
        }
        let i = self
            .active
            .get_mut(&d.id)
            .ok_or_else(|| Error::Conflict("instance disappeared".into()))?;
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            if i.child.try_wait()?.is_some() {
                self.active.remove(&d.id);
                self.crashed.remove(&d.id);
                return Ok(());
            }
            if Instant::now() > deadline {
                i.child.kill()?;
                i.child.wait()?;
                self.active.remove(&d.id);
                self.crashed.remove(&d.id);
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
    }
    fn delete(&mut self, d: &Device) -> Result<()> {
        self.assert_idle(d)?;
        run(
            self.command(&self.sdk.avdmanager)
                .args(["delete", "avd", "--name", &d.avd_name()]),
            None,
            SHORT,
        )?;
        self.crashed.remove(&d.id);
        Ok(())
    }
    fn install_apk(&mut self, d: &Device, path: &Path) -> Result<()> {
        let path = path.canonicalize()?;
        if !path.is_file() || path.extension().and_then(|s| s.to_str()) != Some("apk") {
            return Err(Error::Invalid("select a local APK file".into()));
        }
        let port = self.ready_port(d)?;
        let output = run(
            self.adb_for(port).args(["install", "-r"]).arg(path),
            None,
            Duration::from_secs(120),
        )?;
        if !output.lines().any(|line| line.trim() == "Success") {
            return Err(Error::Runtime(format!(
                "APK install not confirmed: {output}"
            )));
        }
        Ok(())
    }
    fn logs(&mut self, d: &Device) -> Result<String> {
        let status = self.status(d);
        if let Ok(s) = status {
            if s.state == DeviceState::Ready {
                if let Some(port) = s.console_port {
                    return run(
                        self.adb_for(port).args(["logcat", "-d", "-t", "200"]),
                        None,
                        SHORT,
                    );
                }
            }
        }
        log_tail(&self.log_path(d), 64 * 1024).map_err(Error::from)
    }
}
impl Drop for Android {
    fn drop(&mut self) {
        let devices: Vec<_> = self
            .active
            .iter()
            .map(|(id, i)| Device {
                id: *id,
                spec: i.spec.clone(),
            })
            .collect();
        for d in devices {
            if self.stop(&d).is_err() {
                if let Some(mut i) = self.active.remove(&d.id) {
                    let _ = i.child.kill();
                    let _ = i.child.wait();
                }
            }
        }
    }
}
