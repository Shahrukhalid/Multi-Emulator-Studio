use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct Host {
    pub os: &'static str,
    pub arch: &'static str,
    pub cores: usize,
    pub ram_mb: Option<u64>,
    pub supported: bool,
}
pub fn detect() -> Host {
    #[cfg(target_os = "macos")]
    let ram_mb = Command::new("/usr/sbin/sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .parse::<u64>()
                .ok()
        })
        .map(|n| n / 1048576);
    #[cfg(target_os = "windows")]
    let ram_mb = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
        ])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .parse::<u64>()
                .ok()
        })
        .map(|n| n / 1048576);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let ram_mb = None;
    Host {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        cores: std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(1),
        ram_mb,
        supported: cfg!(any(
            all(target_os = "macos", target_arch = "aarch64"),
            all(target_os = "windows", target_arch = "x86_64")
        )),
    }
}
