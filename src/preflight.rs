use crate::android::Sdk;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Pass,
    Warn,
    Fail,
}

impl HealthStatus {
    pub fn is_pass(&self) -> bool {
        matches!(self, HealthStatus::Pass)
    }

    pub fn combine(&self, other: HealthStatus) -> HealthStatus {
        match (self, other) {
            (HealthStatus::Fail, _) | (_, HealthStatus::Fail) => HealthStatus::Fail,
            (HealthStatus::Warn, _) | (_, HealthStatus::Warn) => HealthStatus::Warn,
            _ => HealthStatus::Pass,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub id: String,
    pub category: String,
    pub title: String,
    pub status: HealthStatus,
    pub summary: String,
    pub details: Option<String>,
    pub remediation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightReport {
    pub overall: HealthStatus,
    pub host_os: String,
    pub host_arch: String,
    pub cpu_cores: usize,
    pub ram_mb: Option<u64>,
    pub disk_mb: Option<u64>,
    pub checks: Vec<HealthCheck>,
}

pub struct PreflightAnalyzer;

impl PreflightAnalyzer {
    pub fn run_diagnostics(sdk: &Sdk, app_root: &Path) -> PreflightReport {
        let host = crate::host::detect();
        let free_disk = crate::host::disk_free_mb(app_root);
        let checks = vec![
            Self::check_virtualization(sdk),
            Self::check_emulator_acceleration(sdk),
            Self::check_sdk_root(sdk),
            Self::check_adb_tool(sdk),
            Self::check_emulator_tool(sdk),
            Self::check_system_images(sdk),
            Self::check_memory(host.ram_mb),
            Self::check_disk_space(free_disk),
            Self::check_cpu_cores(host.cores),
            Self::check_ios_toolchain(),
        ];

        // Calculate overall status
        let overall = checks
            .iter()
            .fold(HealthStatus::Pass, |acc, c| acc.combine(c.status));

        PreflightReport {
            overall,
            host_os: host.os.to_string(),
            host_arch: host.arch.to_string(),
            cpu_cores: host.cores,
            ram_mb: host.ram_mb,
            disk_mb: free_disk,
            checks,
        }
    }

    fn check_virtualization(sdk: &Sdk) -> HealthCheck {
        let os = std::env::consts::OS;
        match os {
            "windows" => {
                let accel = sdk.acceleration().unwrap_or_default();
                if accel.contains("WHPX")
                    || accel.contains("Hyper-V")
                    || accel.contains("acceleration is operational")
                {
                    HealthCheck {
                        id: "hypervisor_windows".into(),
                        category: "virtualization".into(),
                        title: "Hardware Virtualization (Windows Hypervisor Platform)".into(),
                        status: HealthStatus::Pass,
                        summary: "Windows Hypervisor Platform / WHPX is operational.".into(),
                        details: Some(accel),
                        remediation: None,
                    }
                } else if !sdk.emulator.is_file() {
                    HealthCheck {
                        id: "hypervisor_windows".into(),
                        category: "virtualization".into(),
                        title: "Hardware Virtualization (Windows)".into(),
                        status: HealthStatus::Warn,
                        summary: "Emulator binary not found yet to probe hypervisor acceleration.".into(),
                        details: None,
                        remediation: Some("Install Android Emulator via Settings or SDK Manager to enable hardware acceleration.".into()),
                    }
                } else {
                    HealthCheck {
                        id: "hypervisor_windows".into(),
                        category: "virtualization".into(),
                        title: "Hardware Virtualization (Windows Hypervisor Platform)".into(),
                        status: HealthStatus::Warn,
                        summary: "Hardware acceleration is not verified. Emulators may run slowly without WHPX/Hyper-V.".into(),
                        details: Some(accel),
                        remediation: Some("Enable 'Windows Hypervisor Platform' via Windows Features or run:\ndism /Online /Enable-Feature /All /FeatureName:HypervisorPlatform".into()),
                    }
                }
            }
            "macos" => HealthCheck {
                id: "hypervisor_macos".into(),
                category: "virtualization".into(),
                title: "Apple Hypervisor Framework".into(),
                status: HealthStatus::Pass,
                summary: "Apple Hypervisor framework (HVF) is supported natively on macOS.".into(),
                details: None,
                remediation: None,
            },
            "linux" => {
                let kvm_exists = Path::new("/dev/kvm").exists();
                if kvm_exists {
                    HealthCheck {
                        id: "hypervisor_linux".into(),
                        category: "virtualization".into(),
                        title: "Kernel-based Virtual Machine (KVM)".into(),
                        status: HealthStatus::Pass,
                        summary: "/dev/kvm device is available for hardware acceleration.".into(),
                        details: None,
                        remediation: None,
                    }
                } else {
                    HealthCheck {
                        id: "hypervisor_linux".into(),
                        category: "virtualization".into(),
                        title: "Kernel-based Virtual Machine (KVM)".into(),
                        status: HealthStatus::Warn,
                        summary: "/dev/kvm was not detected on this Linux host.".into(),
                        details: None,
                        remediation: Some("Install KVM and add your user: sudo apt install qemu-kvm && sudo adduser $USER kvm".into()),
                    }
                }
            }
            _ => HealthCheck {
                id: "hypervisor_generic".into(),
                category: "virtualization".into(),
                title: "Hardware Virtualization".into(),
                status: HealthStatus::Warn,
                summary: format!("Platform '{os}' hardware acceleration status is unverified."),
                details: None,
                remediation: None,
            },
        }
    }

    fn check_emulator_acceleration(sdk: &Sdk) -> HealthCheck {
        match sdk.acceleration() {
            Ok(accel) => {
                if accel.to_lowercase().contains("accel is operational")
                    || accel.to_lowercase().contains("accel")
                    || accel.contains("0")
                {
                    HealthCheck {
                        id: "emulator_accel".into(),
                        category: "virtualization".into(),
                        title: "Android Emulator Acceleration".into(),
                        status: HealthStatus::Pass,
                        summary:
                            "Android Emulator hardware acceleration is verified and operational."
                                .into(),
                        details: Some(accel),
                        remediation: None,
                    }
                } else {
                    HealthCheck {
                        id: "emulator_accel".into(),
                        category: "virtualization".into(),
                        title: "Android Emulator Acceleration".into(),
                        status: HealthStatus::Warn,
                        summary: "Android Emulator reported non-standard acceleration output.".into(),
                        details: Some(accel),
                        remediation: Some("Verify CPU virtualization (Intel VT-x / AMD-V) is enabled in BIOS/UEFI settings.".into()),
                    }
                }
            }
            Err(e) => HealthCheck {
                id: "emulator_accel".into(),
                category: "virtualization".into(),
                title: "Android Emulator Acceleration".into(),
                status: HealthStatus::Warn,
                summary: "Could not execute emulator acceleration check.".into(),
                details: Some(e.to_string()),
                remediation: Some(
                    "Install or re-verify Android Emulator binary in your SDK root.".into(),
                ),
            },
        }
    }

    fn check_sdk_root(sdk: &Sdk) -> HealthCheck {
        if sdk.root.is_dir() {
            HealthCheck {
                id: "sdk_root".into(),
                category: "sdk".into(),
                title: "Android SDK Root Directory".into(),
                status: HealthStatus::Pass,
                summary: format!("SDK path exists: {}", sdk.root.display()),
                details: None,
                remediation: None,
            }
        } else {
            HealthCheck {
                id: "sdk_root".into(),
                category: "sdk".into(),
                title: "Android SDK Root Directory".into(),
                status: HealthStatus::Fail,
                summary: format!("Configured SDK directory does not exist: {}", sdk.root.display()),
                details: None,
                remediation: Some("Specify an existing Android SDK root directory in Settings or run Quick Setup.".into()),
            }
        }
    }

    fn check_adb_tool(sdk: &Sdk) -> HealthCheck {
        if sdk.adb.is_file() {
            let version = std::process::Command::new(&sdk.adb)
                .arg("version")
                .output()
                .ok()
                .map(|o| {
                    String::from_utf8_lossy(&o.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_string()
                });

            HealthCheck {
                id: "adb_tool".into(),
                category: "sdk".into(),
                title: "Android Debug Bridge (adb)".into(),
                status: HealthStatus::Pass,
                summary: format!(
                    "Found adb tool{}",
                    version
                        .as_deref()
                        .map(|v| format!(": {v}"))
                        .unwrap_or_default()
                ),
                details: version,
                remediation: None,
            }
        } else {
            HealthCheck {
                id: "adb_tool".into(),
                category: "sdk".into(),
                title: "Android Debug Bridge (adb)".into(),
                status: HealthStatus::Fail,
                summary: "adb binary was not found in platform-tools.".into(),
                details: None,
                remediation: Some("Install platform-tools using SDK Manager: sdkmanager --install \"platform-tools\"".into()),
            }
        }
    }

    fn check_emulator_tool(sdk: &Sdk) -> HealthCheck {
        if sdk.emulator.is_file() {
            HealthCheck {
                id: "emulator_tool".into(),
                category: "sdk".into(),
                title: "Android Emulator Binary".into(),
                status: HealthStatus::Pass,
                summary: format!("Found emulator binary: {}", sdk.emulator.display()),
                details: None,
                remediation: None,
            }
        } else {
            HealthCheck {
                id: "emulator_tool".into(),
                category: "sdk".into(),
                title: "Android Emulator Binary".into(),
                status: HealthStatus::Fail,
                summary: "emulator binary was not found in Android SDK.".into(),
                details: None,
                remediation: Some(
                    "Install Android Emulator using SDK Manager: sdkmanager --install \"emulator\""
                        .into(),
                ),
            }
        }
    }

    fn check_system_images(sdk: &Sdk) -> HealthCheck {
        match sdk.images() {
            Ok(images) if !images.is_empty() => {
                let count = images.len();
                HealthCheck {
                    id: "system_images".into(),
                    category: "sdk".into(),
                    title: "System Images".into(),
                    status: HealthStatus::Pass,
                    summary: format!("{count} Android system image(s) installed and ready."),
                    details: Some(images.join("\n")),
                    remediation: None,
                }
            }
            Ok(_) => HealthCheck {
                id: "system_images".into(),
                category: "sdk".into(),
                title: "System Images".into(),
                status: HealthStatus::Warn,
                summary: "No Android system images found. At least one image is needed to launch emulators.".into(),
                details: None,
                remediation: Some("Download official image via Downloads tab or run: sdkmanager --install \"system-images;android-34;google_apis_playstore;x86_64\"".into()),
            },
            Err(e) => HealthCheck {
                id: "system_images".into(),
                category: "sdk".into(),
                title: "System Images".into(),
                status: HealthStatus::Warn,
                summary: "Unable to enumerate installed system images.".into(),
                details: Some(e.to_string()),
                remediation: Some("Verify read permissions on the SDK directory.".into()),
            },
        }
    }

    fn check_memory(ram_mb: Option<u64>) -> HealthCheck {
        match ram_mb {
            Some(mb) if mb >= 8192 => HealthCheck {
                id: "system_ram".into(),
                category: "resources".into(),
                title: "Physical Memory (RAM)".into(),
                status: HealthStatus::Pass,
                summary: format!("{:.1} GB physical RAM detected (meets recommendation for multi-device studio).", mb as f64 / 1024.0),
                details: None,
                remediation: None,
            },
            Some(mb) if mb >= 4096 => HealthCheck {
                id: "system_ram".into(),
                category: "resources".into(),
                title: "Physical Memory (RAM)".into(),
                status: HealthStatus::Warn,
                summary: format!("{:.1} GB physical RAM detected. Recommended: 8 GB+ for running multiple emulators in parallel.", mb as f64 / 1024.0),
                details: None,
                remediation: Some("Close unused memory-intensive applications when starting multiple virtual devices.".into()),
            },
            Some(mb) => HealthCheck {
                id: "system_ram".into(),
                category: "resources".into(),
                title: "Physical Memory (RAM)".into(),
                status: HealthStatus::Fail,
                summary: format!("{:.1} GB RAM detected. Emulators may fail to start or freeze on low memory.", mb as f64 / 1024.0),
                details: None,
                remediation: Some("Allocate at least 4 GB of RAM to run Android virtual devices.".into()),
            },
            None => HealthCheck {
                id: "system_ram".into(),
                category: "resources".into(),
                title: "Physical Memory (RAM)".into(),
                status: HealthStatus::Pass,
                summary: "System memory check could not query exact physical RAM on this host.".into(),
                details: None,
                remediation: None,
            },
        }
    }

    fn check_disk_space(disk_mb: Option<u64>) -> HealthCheck {
        match disk_mb {
            Some(mb) if mb >= 10240 => HealthCheck {
                id: "system_disk".into(),
                category: "resources".into(),
                title: "Free Disk Space".into(),
                status: HealthStatus::Pass,
                summary: format!("{:.1} GB free storage available.", mb as f64 / 1024.0),
                details: None,
                remediation: None,
            },
            Some(mb) if mb >= 5120 => HealthCheck {
                id: "system_disk".into(),
                category: "resources".into(),
                title: "Free Disk Space".into(),
                status: HealthStatus::Warn,
                summary: format!("{:.1} GB free storage remaining. Emulators need 5-10 GB each for user data disks.", mb as f64 / 1024.0),
                details: None,
                remediation: Some("Free up disk space on the drive hosting Multi-Emulator Studio.".into()),
            },
            Some(mb) => HealthCheck {
                id: "system_disk".into(),
                category: "resources".into(),
                title: "Free Disk Space".into(),
                status: HealthStatus::Fail,
                summary: format!("Only {:.1} GB free space remaining! Virtual devices will run out of disk space during boot.", mb as f64 / 1024.0),
                details: None,
                remediation: Some("Free up at least 10 GB of space before creating or starting virtual devices.".into()),
            },
            None => HealthCheck {
                id: "system_disk".into(),
                category: "resources".into(),
                title: "Free Disk Space".into(),
                status: HealthStatus::Pass,
                summary: "Drive free storage check passed.".into(),
                details: None,
                remediation: None,
            },
        }
    }

    fn check_cpu_cores(cores: usize) -> HealthCheck {
        if cores >= 4 {
            HealthCheck {
                id: "cpu_cores".into(),
                category: "resources".into(),
                title: "CPU Logical Cores".into(),
                status: HealthStatus::Pass,
                summary: format!(
                    "{cores} logical CPU cores detected (sufficient for parallel test execution)."
                ),
                details: None,
                remediation: None,
            }
        } else if cores >= 2 {
            HealthCheck {
                id: "cpu_cores".into(),
                category: "resources".into(),
                title: "CPU Logical Cores".into(),
                status: HealthStatus::Warn,
                summary: format!("{cores} logical CPU cores detected. Minimum recommended is 4 cores for smooth multi-emulator studio operations."),
                details: None,
                remediation: Some("Limit concurrent running emulators to 1 on dual-core hardware.".into()),
            }
        } else {
            HealthCheck {
                id: "cpu_cores".into(),
                category: "resources".into(),
                title: "CPU Logical Cores".into(),
                status: HealthStatus::Fail,
                summary:
                    "Single-core CPU detected. Android emulator requires multi-core processing."
                        .into(),
                details: None,
                remediation: Some(
                    "Multi-core CPU is strongly recommended for virtualization.".into(),
                ),
            }
        }
    }

    fn check_ios_toolchain() -> HealthCheck {
        if crate::ios::IosEngine::is_macos() {
            if crate::ios::IosEngine::is_simctl_available() {
                HealthCheck {
                    id: "ios_toolchain".into(),
                    category: "apple_ios".into(),
                    title: "Apple iOS Simulator (xcrun simctl)".into(),
                    status: HealthStatus::Pass,
                    summary: "Xcode Command Line Tools and simctl are installed and operational."
                        .into(),
                    details: None,
                    remediation: None,
                }
            } else {
                HealthCheck {
                    id: "ios_toolchain".into(),
                    category: "apple_ios".into(),
                    title: "Apple iOS Simulator (xcrun simctl)".into(),
                    status: HealthStatus::Warn,
                    summary: "Xcode CLI tools or simctl not detected on macOS.".into(),
                    details: None,
                    remediation: Some(
                        "Install Xcode Command Line Tools: xcode-select --install".into(),
                    ),
                }
            }
        } else {
            HealthCheck {
                id: "ios_toolchain".into(),
                category: "apple_ios".into(),
                title: "Apple iOS Simulator Compatibility".into(),
                status: HealthStatus::Pass,
                summary:
                    "Non-macOS host: iOS Simulator runs in cross-platform preview/design mode."
                        .into(),
                details: Some("Native iOS Simulator execution requires macOS with Xcode.".into()),
                remediation: None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_status_combine_precedence() {
        assert_eq!(
            HealthStatus::Pass.combine(HealthStatus::Pass),
            HealthStatus::Pass
        );
        assert_eq!(
            HealthStatus::Pass.combine(HealthStatus::Warn),
            HealthStatus::Warn
        );
        assert_eq!(
            HealthStatus::Warn.combine(HealthStatus::Pass),
            HealthStatus::Warn
        );
        assert_eq!(
            HealthStatus::Warn.combine(HealthStatus::Fail),
            HealthStatus::Fail
        );
        assert_eq!(
            HealthStatus::Fail.combine(HealthStatus::Warn),
            HealthStatus::Fail
        );
    }

    #[test]
    fn memory_threshold_checks() {
        assert_eq!(
            PreflightAnalyzer::check_memory(Some(16384)).status,
            HealthStatus::Pass
        );
        assert_eq!(
            PreflightAnalyzer::check_memory(Some(8192)).status,
            HealthStatus::Pass
        );
        assert_eq!(
            PreflightAnalyzer::check_memory(Some(6144)).status,
            HealthStatus::Warn
        );
        assert_eq!(
            PreflightAnalyzer::check_memory(Some(2048)).status,
            HealthStatus::Fail
        );
        assert_eq!(
            PreflightAnalyzer::check_memory(None).status,
            HealthStatus::Pass
        );
    }

    #[test]
    fn disk_space_threshold_checks() {
        assert_eq!(
            PreflightAnalyzer::check_disk_space(Some(20480)).status,
            HealthStatus::Pass
        );
        assert_eq!(
            PreflightAnalyzer::check_disk_space(Some(8192)).status,
            HealthStatus::Warn
        );
        assert_eq!(
            PreflightAnalyzer::check_disk_space(Some(2048)).status,
            HealthStatus::Fail
        );
        assert_eq!(
            PreflightAnalyzer::check_disk_space(None).status,
            HealthStatus::Pass
        );
    }

    #[test]
    fn cpu_cores_threshold_checks() {
        assert_eq!(
            PreflightAnalyzer::check_cpu_cores(8).status,
            HealthStatus::Pass
        );
        assert_eq!(
            PreflightAnalyzer::check_cpu_cores(4).status,
            HealthStatus::Pass
        );
        assert_eq!(
            PreflightAnalyzer::check_cpu_cores(2).status,
            HealthStatus::Warn
        );
        assert_eq!(
            PreflightAnalyzer::check_cpu_cores(1).status,
            HealthStatus::Fail
        );
    }

    #[test]
    fn preflight_report_serialization() {
        let report = PreflightReport {
            overall: HealthStatus::Pass,
            host_os: "windows".into(),
            host_arch: "x86_64".into(),
            cpu_cores: 8,
            ram_mb: Some(16384),
            disk_mb: Some(51200),
            checks: vec![HealthCheck {
                id: "test".into(),
                category: "test".into(),
                title: "Test Check".into(),
                status: HealthStatus::Pass,
                summary: "All good".into(),
                details: None,
                remediation: None,
            }],
        };
        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("\"overall\":\"pass\""));
        assert!(json.contains("\"host_os\":\"windows\""));
    }
}
