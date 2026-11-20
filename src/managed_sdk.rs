//! First-run downloads from official publishers. No SDK files are redistributed.
use crate::{android::run, Error, Result};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

const DOWNLOAD: Duration = Duration::from_secs(900);
const TOOLS_VERSION: &str = "15859902";

fn tools_archive() -> Result<(&'static str, &'static str)> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok((
            "mac_arm64",
            "835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e",
        )),
        ("macos", "x86_64") => Ok((
            "mac_x86_64",
            "c5a6378ab5cf7e0d5701921405115befff13e9ff7417fb588389338f8bd050f3",
        )),
        ("windows", "x86_64") => Ok((
            "win",
            "90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a",
        )),
        _ => Err(Error::Unavailable(
            "Managed Android setup is not supported on this host".into(),
        )),
    }
}

fn system_tool(name: &str) -> Result<PathBuf> {
    let path = if cfg!(windows) {
        PathBuf::from(
            std::env::var_os("SystemRoot")
                .ok_or_else(|| Error::Unavailable("Windows system directory unavailable".into()))?,
        )
        .join("System32")
        .join(format!("{name}.exe"))
    } else {
        PathBuf::from("/usr/bin").join(name)
    };
    if !path.is_file() {
        return Err(Error::Unavailable(format!(
            "Required operating system utility missing: {name}"
        )));
    }
    Ok(path)
}

fn download(url: &str, path: &Path, limit: u64) -> Result<()> {
    if !url.starts_with("https://") {
        return Err(Error::Invalid("HTTPS required for runtime download".into()));
    }
    run(
        Command::new(system_tool("curl")?)
            .args([
                "--disable",
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--proto",
                "=https",
                "--proto-redir",
                "=https",
                "--max-time",
                "850",
                "--max-filesize",
                &limit.to_string(),
                "--output",
            ])
            .arg(path)
            .arg(url),
        None,
        DOWNLOAD,
    )?;
    if fs::metadata(path)?.len() > limit {
        return Err(Error::Invalid("Runtime download exceeds size limit".into()));
    }
    Ok(())
}

fn verify(path: &Path, expected: &str) -> Result<()> {
    if expected.len() != 64 || !expected.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(Error::Invalid("Invalid published runtime checksum".into()));
    }
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let size = file.read(&mut buf)?;
        if size == 0 {
            break;
        }
        hasher.update(&buf[..size]);
    }
    if format!("{:x}", hasher.finalize()) != expected.to_ascii_lowercase() {
        return Err(Error::Invalid("Official runtime checksum mismatch".into()));
    }
    Ok(())
}

fn extract(archive: &Path, directory: &Path) -> Result<()> {
    fs::create_dir(directory)?;
    run(
        Command::new(system_tool("tar")?)
            .arg("-xf")
            .arg(archive)
            .arg("-C")
            .arg(directory),
        None,
        Duration::from_secs(180),
    )?;
    Ok(())
}

pub fn managed_root(data: &Path) -> PathBuf {
    data.join("managed-android-sdk")
}

pub fn java_home(root: &Path) -> Option<PathBuf> {
    let home = root.join("mes-java");
    home.join(if cfg!(windows) {
        "bin/java.exe"
    } else {
        "bin/java"
    })
    .is_file()
    .then_some(home)
}

pub fn sdk_command(root: &Path, executable: &Path) -> Command {
    let mut command = Command::new(executable);
    if let Some(java) = java_home(root) {
        command.env("JAVA_HOME", java);
    }
    command
        .env("ANDROID_HOME", root)
        .env("ANDROID_SDK_ROOT", root)
        .env_remove("REPO_OS_OVERRIDE");
    command
}

/// Download command-line tools and a private Temurin JRE. No license is accepted here.
pub fn prepare(data: &Path) -> Result<PathBuf> {
    let (platform, checksum) = tools_archive()?;
    fs::create_dir_all(data)?;
    if crate::host::disk_free_mb(data).unwrap_or(0) < 12000 {
        return Err(Error::Unavailable(
            "At least 12 GB of free space is required for Android setup".into(),
        ));
    }
    let root = managed_root(data);
    fs::create_dir_all(&root)?;
    if root.is_symlink() || !root.canonicalize()?.starts_with(data.canonicalize()?) {
        return Err(Error::Invalid(
            "Managed runtime directory is not private".into(),
        ));
    }
    let stage = tempfile::tempdir_in(&root)?;
    let tools = root.join("cmdline-tools/latest");
    if !tools.exists() {
        let archive = stage.path().join("tools.zip");
        download(&format!("https://dl.google.com/android/repository/commandlinetools-{platform}-{TOOLS_VERSION}_latest.zip"), &archive, 300 * 1024 * 1024)?;
        verify(&archive, checksum)?;
        let unpacked = stage.path().join("tools");
        extract(&archive, &unpacked)?;
        let source = unpacked.join("cmdline-tools");
        if !source
            .join(if cfg!(windows) {
                "bin/sdkmanager.bat"
            } else {
                "bin/sdkmanager"
            })
            .is_file()
        {
            return Err(Error::Invalid("Invalid official SDK archive layout".into()));
        }
        fs::create_dir_all(root.join("cmdline-tools"))?;
        fs::rename(source, &tools)?;
    }
    if java_home(&root).is_none() {
        if root.join("mes-java").exists() {
            return Err(Error::Conflict(
                "Incomplete private Java installation; inspect managed runtime directory".into(),
            ));
        }
        let os = if cfg!(windows) { "windows" } else { "mac" };
        let arch = if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else {
            "x64"
        };
        let metadata = stage.path().join("java.json");
        download(&format!("https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture={arch}&image_type=jre&os={os}&vendor=eclipse"), &metadata, 2 * 1024 * 1024)?;
        let assets: serde_json::Value = serde_json::from_slice(&fs::read(metadata)?)?;
        let package = &assets[0]["binary"]["package"];
        let url = package["link"]
            .as_str()
            .ok_or_else(|| Error::Invalid("Missing Temurin download metadata".into()))?;
        let checksum = package["checksum"]
            .as_str()
            .ok_or_else(|| Error::Invalid("Missing Temurin checksum".into()))?;
        if !url.starts_with("https://github.com/adoptium/temurin21-binaries/releases/download/")
            || !url.ends_with(if cfg!(windows) { ".zip" } else { ".tar.gz" })
        {
            return Err(Error::Invalid("Unexpected Temurin download source".into()));
        }
        let archive = stage.path().join(if cfg!(windows) {
            "java.zip"
        } else {
            "java.tar.gz"
        });
        download(url, &archive, 300 * 1024 * 1024)?;
        verify(&archive, checksum)?;
        let unpacked = stage.path().join("java");
        extract(&archive, &unpacked)?;
        let source = fs::read_dir(&unpacked)?
            .filter_map(|entry| entry.ok())
            .map(|entry| {
                if cfg!(windows) {
                    entry.path()
                } else {
                    entry.path().join("Contents/Home")
                }
            })
            .find(|path| {
                path.join(if cfg!(windows) {
                    "bin/java.exe"
                } else {
                    "bin/java"
                })
                .is_file()
            })
            .ok_or_else(|| Error::Invalid("Invalid Temurin archive layout".into()))?;
        fs::rename(source, root.join("mes-java"))?;
    }
    Ok(root)
}

/// Interactive official installer: the frontend reads output and submits each answer.
pub struct SetupSession {
    child: Child,
    output: tempfile::NamedTempFile,
    started: Instant,
    answered_at: u64,
}

#[derive(serde::Serialize)]
pub struct SetupStatus {
    pub output: String,
    pub awaiting_answer: bool,
    pub done: bool,
    pub success: bool,
}

impl SetupSession {
    pub fn start(root: &Path) -> Result<Self> {
        let image = format!(
            "system-images;android-34;google_apis_playstore;{}",
            if cfg!(target_arch = "aarch64") {
                "arm64-v8a"
            } else {
                "x86_64"
            }
        );
        let sdkmanager = root.join(if cfg!(windows) {
            "cmdline-tools/latest/bin/sdkmanager.bat"
        } else {
            "cmdline-tools/latest/bin/sdkmanager"
        });
        Self::spawn(sdk_command(root, &sdkmanager).args([
            "--install",
            "platform-tools",
            "emulator",
            &image,
        ]))
    }
    fn spawn(command: &mut Command) -> Result<Self> {
        let output = tempfile::NamedTempFile::new()?;
        let writer = fs::OpenOptions::new().append(true).open(output.path())?;
        let child = command
            .stdin(Stdio::piped())
            .stdout(writer.try_clone()?)
            .stderr(writer)
            .spawn()?;
        Ok(Self {
            child,
            output,
            started: Instant::now(),
            answered_at: 0,
        })
    }
    pub fn status(&mut self) -> Result<SetupStatus> {
        let size = self.output.as_file().metadata()?.len();
        if size > 8 * 1024 * 1024 || self.started.elapsed() > Duration::from_secs(3600) {
            let _ = self.child.kill();
            let _ = self.child.wait();
            return Err(Error::Timeout("Android setup output/time limit".into()));
        }
        let mut bytes = Vec::new();
        fs::File::open(self.output.path())?
            .take(size)
            .read_to_end(&mut bytes)?;
        let output = String::from_utf8_lossy(&bytes).into_owned();
        let exit = self.child.try_wait()?;
        let tail = output.trim_end();
        let awaiting_answer = exit.is_none()
            && size > self.answered_at
            && (tail.ends_with("(y/N):") || tail.ends_with("(y/N)?") || tail.ends_with("(y/n):"));
        Ok(SetupStatus {
            output,
            awaiting_answer,
            done: exit.is_some(),
            success: exit.is_some_and(|status| status.success()),
        })
    }
    pub fn answer(&mut self, yes: bool) -> Result<()> {
        if !self.status()?.awaiting_answer {
            return Err(Error::Conflict(
                "No new SDK license prompt to answer".into(),
            ));
        }
        self.answered_at = self.output.as_file().metadata()?.len();
        self.child
            .stdin
            .as_mut()
            .ok_or_else(|| Error::Conflict("SDK installer input closed".into()))?
            .write_all(if yes { b"y\n" } else { b"n\n" })?;
        Ok(())
    }
}
impl Drop for SetupSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
#[test]
fn rejects_mismatched_download_checksum() {
    let file = tempfile::NamedTempFile::new().unwrap();
    assert!(verify(file.path(), &"0".repeat(64)).is_err());
    assert!(verify(
        file.path(),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    .is_ok());
}

#[cfg(all(test, unix))]
#[test]
fn sdk_license_prompt_requires_separate_explicit_answers() {
    let mut process = SetupSession::spawn(Command::new("/bin/sh").args(["-c", "printf 'License one\\nAccept? (y/N): '; read a; [ \"$a\" = y ] || exit 1; printf '\\nLicense two\\nAccept? (y/N): '; read b; [ \"$b\" = y ] || exit 1"])).unwrap();
    fn await_prompt(session: &mut SetupSession, text: &str) {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let status = session.status().unwrap();
            if status.awaiting_answer && status.output.contains(text) {
                return;
            }
            assert!(!status.done && Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    await_prompt(&mut process, "License one");
    process.answer(true).unwrap();
    await_prompt(&mut process, "License two");
    process.answer(true).unwrap();
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let status = process.status().unwrap();
        if status.done {
            assert!(status.success);
            break;
        }
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
}
