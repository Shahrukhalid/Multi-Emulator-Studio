use crate::model::{Device, DeviceState, Status};
use crate::runtime::{Engine, ScreenFrame};
use crate::{Error, Result};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IosSimulatorDevice {
    pub udid: String,
    pub name: String,
    pub state: String,
    #[serde(default, alias = "isAvailable", alias = "is_available")]
    pub is_available: bool,
    #[serde(
        default,
        rename = "deviceTypeIdentifier",
        alias = "device_type_identifier"
    )]
    pub device_type_identifier: Option<String>,
    #[serde(default, rename = "runtimeIdentifier", alias = "runtime_identifier")]
    pub runtime_identifier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IosRuntime {
    pub identifier: String,
    pub version: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, alias = "isAvailable", alias = "is_available")]
    pub is_available: bool,
}

#[derive(Debug, Clone, Default)]
pub struct IosEngine {
    active_sessions: HashMap<Uuid, String>, // MES Device UUID -> Apple Simctl UDID
}

impl IosEngine {
    pub fn new() -> Self {
        Self {
            active_sessions: HashMap::new(),
        }
    }

    /// Check whether current host OS is macOS
    pub fn is_macos() -> bool {
        cfg!(target_os = "macos")
    }

    /// Check whether Xcode Command Line Tools and simctl are installed
    pub fn is_simctl_available() -> bool {
        if !Self::is_macos() {
            return false;
        }
        Command::new("xcrun")
            .args(["simctl", "help"])
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
    }

    /// List available iOS runtimes (real on macOS, simulated catalog on other hosts)
    pub fn list_runtimes(&self) -> Result<Vec<IosRuntime>> {
        if !Self::is_simctl_available() {
            return Ok(vec![
                IosRuntime {
                    identifier: "com.apple.CoreSimulator.SimRuntime.iOS-17-4".into(),
                    version: "17.4".into(),
                    name: "iOS 17.4".into(),
                    is_available: true,
                },
                IosRuntime {
                    identifier: "com.apple.CoreSimulator.SimRuntime.iOS-17-2".into(),
                    version: "17.2".into(),
                    name: "iOS 17.2".into(),
                    is_available: true,
                },
                IosRuntime {
                    identifier: "com.apple.CoreSimulator.SimRuntime.iOS-16-4".into(),
                    version: "16.4".into(),
                    name: "iOS 16.4".into(),
                    is_available: true,
                },
            ]);
        }

        let output = Command::new("xcrun")
            .args(["simctl", "list", "runtimes", "--json"])
            .output()
            .map_err(|e| Error::Runtime(format!("Failed to execute xcrun simctl: {e}")))?;

        if !output.status.success() {
            return Err(Error::Runtime(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        #[derive(Deserialize)]
        struct SimctlRuntimes {
            runtimes: Vec<IosRuntime>,
        }

        let parsed: SimctlRuntimes = serde_json::from_slice(&output.stdout).map_err(|e| {
            Error::Runtime(format!("Failed to parse xcrun simctl runtimes JSON: {e}"))
        })?;

        Ok(parsed.runtimes)
    }

    /// List available devices (real on macOS, simulated catalog on other hosts)
    pub fn list_devices(&self) -> Result<Vec<IosSimulatorDevice>> {
        if !Self::is_simctl_available() {
            return Ok(vec![
                IosSimulatorDevice {
                    udid: "sim-iphone-15-pro".into(),
                    name: "iPhone 15 Pro".into(),
                    state: "Shutdown".into(),
                    is_available: true,
                    device_type_identifier: Some(
                        "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro".into(),
                    ),
                    runtime_identifier: Some("com.apple.CoreSimulator.SimRuntime.iOS-17-4".into()),
                },
                IosSimulatorDevice {
                    udid: "sim-iphone-15".into(),
                    name: "iPhone 15".into(),
                    state: "Shutdown".into(),
                    is_available: true,
                    device_type_identifier: Some(
                        "com.apple.CoreSimulator.SimDeviceType.iPhone-15".into(),
                    ),
                    runtime_identifier: Some("com.apple.CoreSimulator.SimRuntime.iOS-17-4".into()),
                },
                IosSimulatorDevice {
                    udid: "sim-ipad-air".into(),
                    name: "iPad Air (5th generation)".into(),
                    state: "Shutdown".into(),
                    is_available: true,
                    device_type_identifier: Some(
                        "com.apple.CoreSimulator.SimDeviceType.iPad-Air-5th-generation".into(),
                    ),
                    runtime_identifier: Some("com.apple.CoreSimulator.SimRuntime.iOS-17-2".into()),
                },
            ]);
        }

        let output = Command::new("xcrun")
            .args(["simctl", "list", "devices", "available", "--json"])
            .output()
            .map_err(|e| Error::Runtime(format!("Failed to execute xcrun simctl: {e}")))?;

        if !output.status.success() {
            return Err(Error::Runtime(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        #[derive(Deserialize)]
        struct SimctlRawDevice {
            udid: String,
            name: String,
            state: String,
            #[serde(default, alias = "isAvailable", alias = "is_available")]
            is_available: bool,
            #[serde(
                default,
                rename = "deviceTypeIdentifier",
                alias = "device_type_identifier"
            )]
            device_type_identifier: Option<String>,
        }

        #[derive(Deserialize)]
        struct SimctlDevicesResponse {
            devices: HashMap<String, Vec<SimctlRawDevice>>,
        }

        let parsed: SimctlDevicesResponse =
            serde_json::from_slice(&output.stdout).map_err(|e| {
                Error::Runtime(format!("Failed to parse xcrun simctl devices JSON: {e}"))
            })?;

        let mut list = Vec::new();
        for (runtime_id, dev_list) in parsed.devices {
            for d in dev_list {
                list.push(IosSimulatorDevice {
                    udid: d.udid,
                    name: d.name,
                    state: d.state,
                    is_available: d.is_available,
                    device_type_identifier: d.device_type_identifier,
                    runtime_identifier: Some(runtime_id.clone()),
                });
            }
        }

        Ok(list)
    }

    /// Boot an iOS simulator via simctl
    pub fn boot_simulator(&mut self, udid: &str) -> Result<()> {
        if !Self::is_simctl_available() {
            if !Self::is_macos() {
                return Err(Error::Unavailable(
                    "Apple iOS Simulator requires a macOS host with Xcode Command Line Tools installed."
                        .into(),
                ));
            }
            return Err(Error::Unavailable(
                "Xcode xcrun simctl is not installed or available on this host.".into(),
            ));
        }

        let output = Command::new("xcrun")
            .args(["simctl", "boot", udid])
            .output()
            .map_err(|e| Error::Runtime(format!("Failed to boot simulator: {e}")))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            if !err.contains("already booted") {
                return Err(Error::Runtime(format!("simctl boot failed: {err}")));
            }
        }

        Ok(())
    }

    /// Shutdown an iOS simulator via simctl
    pub fn shutdown_simulator(&mut self, udid: &str) -> Result<()> {
        if !Self::is_simctl_available() {
            return Ok(());
        }

        let output = Command::new("xcrun")
            .args(["simctl", "shutdown", udid])
            .output()
            .map_err(|e| Error::Runtime(format!("Failed to shutdown simulator: {e}")))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            if !err.contains("current state: Shutdown") {
                return Err(Error::Runtime(format!("simctl shutdown failed: {err}")));
            }
        }

        Ok(())
    }

    /// Capture live simulator screenshot as PNG bytes
    pub fn screenshot_simulator(&self, udid: &str) -> Result<Vec<u8>> {
        let fallback_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82".to_vec();

        if !Self::is_simctl_available() || udid == "default" || udid.is_empty() {
            // Return 1x1 transparent PNG fallback for non-macOS preview or placeholder UDID
            return Ok(fallback_png);
        }

        let output = match Command::new("xcrun")
            .args(["simctl", "io", udid, "screenshot", "-"])
            .output()
        {
            Ok(out) => out,
            Err(_) => return Ok(fallback_png),
        };

        if !output.status.success() {
            // If the simulator is unbooted or screenshot capture fails, gracefully return fallback frame
            return Ok(fallback_png);
        }

        Ok(output.stdout)
    }

    /// Install an iOS app bundle (.app)
    pub fn install_app(&self, udid: &str, app_path: &Path) -> Result<()> {
        if !Self::is_simctl_available() {
            return Err(Error::Unavailable(
                "Apple iOS Simulator requires a macOS host with Xcode Command Line Tools installed."
                    .into(),
            ));
        }

        let output = Command::new("xcrun")
            .args(["simctl", "install", udid])
            .arg(app_path)
            .output()
            .map_err(|e| Error::Runtime(format!("Failed to install app on simulator: {e}")))?;

        if !output.status.success() {
            return Err(Error::Runtime(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        Ok(())
    }

    /// Launch an installed bundle ID on an iOS simulator
    pub fn launch_bundle(&self, udid: &str, bundle_id: &str) -> Result<()> {
        if !Self::is_simctl_available() {
            return Err(Error::Unavailable(
                "Apple iOS Simulator requires a macOS host with Xcode Command Line Tools installed."
                    .into(),
            ));
        }

        let output = Command::new("xcrun")
            .args(["simctl", "launch", udid, bundle_id])
            .output()
            .map_err(|e| Error::Runtime(format!("Failed to launch app on simulator: {e}")))?;

        if !output.status.success() {
            return Err(Error::Runtime(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        Ok(())
    }

    /// Read simulator system logs
    pub fn read_logs(&self, udid: &str) -> Result<String> {
        if !Self::is_simctl_available() {
            return Ok("iOS Simulator logs require a macOS host.".into());
        }

        let output = Command::new("xcrun")
            .args([
                "simctl", "spawn", udid, "log", "show", "--last", "1m", "--style", "compact",
            ])
            .output()
            .map_err(|e| Error::Runtime(format!("Failed to fetch simulator logs: {e}")))?;

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

impl Engine for IosEngine {
    fn create(&mut self, _d: &Device) -> Result<()> {
        Ok(())
    }

    fn start(&mut self, d: &Device) -> Result<Status> {
        let udid = d.spec.hardware_profile.clone();
        self.boot_simulator(&udid)?;
        self.active_sessions.insert(d.id, udid);
        self.status(d)
    }

    fn stop(&mut self, d: &Device) -> Result<()> {
        if let Some(udid) = self.active_sessions.remove(&d.id) {
            self.shutdown_simulator(&udid)?;
        }
        Ok(())
    }

    fn status(&mut self, d: &Device) -> Result<Status> {
        let is_running = self.active_sessions.contains_key(&d.id);
        Ok(Status {
            id: d.id,
            state: if is_running {
                DeviceState::Ready
            } else {
                DeviceState::Stopped
            },
            pid: None,
            console_port: None,
            addresses: vec!["127.0.0.1".into()],
            diagnostic: if !Self::is_macos() {
                Some("Running on non-macOS host (preview/mock mode)".into())
            } else {
                None
            },
        })
    }

    fn delete(&mut self, d: &Device) -> Result<()> {
        self.stop(d)
    }

    fn install_apk(&mut self, d: &Device, path: &Path) -> Result<()> {
        if let Some(udid) = self.active_sessions.get(&d.id) {
            self.install_app(udid, path)
        } else {
            Err(Error::Unavailable("Simulator is not booted".into()))
        }
    }

    fn logs(&mut self, d: &Device) -> Result<String> {
        if let Some(udid) = self.active_sessions.get(&d.id) {
            self.read_logs(udid)
        } else {
            Ok(String::new())
        }
    }

    fn screen_png(&mut self, d: &Device) -> Result<Vec<u8>> {
        if let Some(udid) = self.active_sessions.get(&d.id) {
            self.screenshot_simulator(udid)
        } else {
            self.screenshot_simulator("default")
        }
    }

    fn screen(&mut self, d: &Device) -> Result<ScreenFrame> {
        let png = self.screen_png(d)?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
        Ok(ScreenFrame {
            png_base64: b64,
            width: d.spec.width,
            height: d.spec.height,
        })
    }

    fn launch_app(&mut self, d: &Device, package: &str) -> Result<()> {
        if let Some(udid) = self.active_sessions.get(&d.id) {
            self.launch_bundle(udid, package)
        } else {
            Err(Error::Unavailable("Simulator is not booted".into()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ios_runtimes_fallback_on_non_macos() {
        let engine = IosEngine::new();
        let runtimes = engine.list_runtimes().unwrap();
        assert!(!runtimes.is_empty());
        assert!(runtimes.iter().all(|r| !r.identifier.is_empty()));
    }

    #[test]
    fn test_ios_device_list_fallback() {
        let engine = IosEngine::new();
        let devices = engine.list_devices().unwrap();
        assert!(!devices.is_empty());
        assert!(devices
            .iter()
            .all(|d| !d.name.is_empty() && !d.udid.is_empty()));
    }

    #[test]
    fn test_ios_engine_status_and_lifecycle() {
        let mut engine = IosEngine::new();
        let d = Device {
            id: Uuid::new_v4(),
            spec: crate::model::DeviceSpec {
                name: "iPhone 15 Pro".into(),
                image: "ios-17-4".into(),
                hardware_profile: "sim-iphone-15-pro".into(),
                ram_mb: 8192,
                cores: 6,
                width: 1179,
                height: 2556,
                disk_mb: 65536,
                locale: "en_US".into(),
                graphics_mode: crate::model::GraphicsMode::Auto,
                proxy: None,
                location_preset: None,
            },
        };

        // Stopped by default
        let status = engine.status(&d).unwrap();
        assert_eq!(status.state, DeviceState::Stopped);

        // Screen screenshot returns valid PNG header
        let png = engine.screen_png(&d).unwrap();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
    }
}
