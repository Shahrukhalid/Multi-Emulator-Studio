use crate::model::{Device, DeviceState};
use crate::runtime::Engine;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastInstallItem {
    pub device_id: Uuid,
    pub device_name: String,
    pub success: bool,
    pub message: String,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastInstallReport {
    pub package_name: String,
    pub total_devices: usize,
    pub successful_devices: usize,
    pub failed_devices: usize,
    pub total_duration_ms: u64,
    pub results: Vec<BroadcastInstallItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynchronizedFrame {
    pub device_id: Uuid,
    pub device_name: String,
    pub hardware_profile: String,
    pub width: u32,
    pub height: u32,
    pub png_base64: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynchronizedScreenshotsReport {
    pub timestamp_ms: u64,
    pub frames: Vec<SynchronizedFrame>,
}

pub struct FleetEngine;

impl FleetEngine {
    pub fn broadcast_install<E: Engine>(
        engine: &mut E,
        devices: &[Device],
        package_path: &Path,
    ) -> BroadcastInstallReport {
        let start = Instant::now();
        let file_name = package_path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "package.apk".into());

        let mut results = Vec::new();
        let mut success_count = 0;
        let mut fail_count = 0;

        for d in devices {
            let item_start = Instant::now();
            let status = engine.status(d);
            let is_ready = matches!(status, Ok(ref s) if s.state == DeviceState::Ready);

            if !is_ready {
                fail_count += 1;
                results.push(BroadcastInstallItem {
                    device_id: d.id,
                    device_name: d.spec.name.clone(),
                    success: false,
                    message: "Device is stopped or not in ready state".into(),
                    elapsed_ms: item_start.elapsed().as_millis() as u64,
                });
                continue;
            }

            match engine.install_apk(d, package_path) {
                Ok(_) => {
                    success_count += 1;
                    results.push(BroadcastInstallItem {
                        device_id: d.id,
                        device_name: d.spec.name.clone(),
                        success: true,
                        message: "Successfully installed".into(),
                        elapsed_ms: item_start.elapsed().as_millis() as u64,
                    });
                }
                Err(err) => {
                    fail_count += 1;
                    results.push(BroadcastInstallItem {
                        device_id: d.id,
                        device_name: d.spec.name.clone(),
                        success: false,
                        message: err.to_string(),
                        elapsed_ms: item_start.elapsed().as_millis() as u64,
                    });
                }
            }
        }

        BroadcastInstallReport {
            package_name: file_name,
            total_devices: devices.len(),
            successful_devices: success_count,
            failed_devices: fail_count,
            total_duration_ms: start.elapsed().as_millis() as u64,
            results,
        }
    }

    pub fn capture_synchronized_screenshots<E: Engine>(
        engine: &mut E,
        devices: &[Device],
    ) -> SynchronizedScreenshotsReport {
        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let mut frames = Vec::new();

        for d in devices {
            let status = engine.status(d);
            let state_str = match status {
                Ok(ref s) => format!("{:?}", s.state).to_lowercase(),
                Err(_) => "unknown".into(),
            };

            match engine.screen(d) {
                Ok(frame) => {
                    frames.push(SynchronizedFrame {
                        device_id: d.id,
                        device_name: d.spec.name.clone(),
                        hardware_profile: d.spec.hardware_profile.clone(),
                        width: frame.width,
                        height: frame.height,
                        png_base64: frame.png_base64,
                        state: state_str,
                    });
                }
                Err(_) => {
                    // 1x1 transparent PNG fallback base64
                    let fallback_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
                    frames.push(SynchronizedFrame {
                        device_id: d.id,
                        device_name: d.spec.name.clone(),
                        hardware_profile: d.spec.hardware_profile.clone(),
                        width: d.spec.width,
                        height: d.spec.height,
                        png_base64: fallback_b64.into(),
                        state: state_str,
                    });
                }
            }
        }

        SynchronizedScreenshotsReport {
            timestamp_ms,
            frames,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DeviceSpec, GraphicsMode, Status};
    use crate::runtime::{GoogleApps, NavigationKey, ScreenFrame, TouchInput};
    use std::collections::HashSet;
    use std::path::PathBuf;

    struct MockFleetEngine {
        running_ids: HashSet<Uuid>,
        fail_install: bool,
    }

    impl MockFleetEngine {
        fn new(running: &[Uuid]) -> Self {
            Self {
                running_ids: running.iter().copied().collect(),
                fail_install: false,
            }
        }
    }

    impl Engine for MockFleetEngine {
        fn create(&mut self, _: &Device) -> crate::Result<()> {
            Ok(())
        }
        fn start(&mut self, d: &Device) -> crate::Result<Status> {
            self.running_ids.insert(d.id);
            self.status(d)
        }
        fn stop(&mut self, d: &Device) -> crate::Result<()> {
            self.running_ids.remove(&d.id);
            Ok(())
        }
        fn status(&mut self, d: &Device) -> crate::Result<Status> {
            let state = if self.running_ids.contains(&d.id) {
                DeviceState::Ready
            } else {
                DeviceState::Stopped
            };
            Ok(Status {
                id: d.id,
                state,
                pid: None,
                console_port: None,
                addresses: vec!["127.0.0.1".into()],
                diagnostic: None,
            })
        }
        fn delete(&mut self, _: &Device) -> crate::Result<()> {
            Ok(())
        }
        fn install_apk(&mut self, _: &Device, _: &Path) -> crate::Result<()> {
            if self.fail_install {
                return Err(crate::Error::Runtime("Mock install rejected".into()));
            }
            Ok(())
        }
        fn logs(&mut self, _: &Device) -> crate::Result<String> {
            Ok(String::new())
        }
        fn screen_png(&mut self, _: &Device) -> crate::Result<Vec<u8>> {
            Ok(b"\x89PNG\r\n\x1a\n".to_vec())
        }
        fn screen(&mut self, d: &Device) -> crate::Result<ScreenFrame> {
            Ok(ScreenFrame {
                png_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==".into(),
                width: d.spec.width,
                height: d.spec.height,
            })
        }
        fn launch_app(&mut self, _: &Device, _: &str) -> crate::Result<()> {
            Ok(())
        }
        fn navigate(&mut self, _: &Device, _: NavigationKey) -> crate::Result<()> {
            Ok(())
        }
        fn touch(&mut self, _: &Device, _: TouchInput) -> crate::Result<()> {
            Ok(())
        }
        fn google_apps(&mut self, _: &Device) -> crate::Result<GoogleApps> {
            Ok(GoogleApps {
                play_store: true,
                youtube: true,
                youtube_preinstalled: true,
            })
        }
        fn open_youtube_store(&mut self, _: &Device) -> crate::Result<()> {
            Ok(())
        }
        fn video_start(&mut self, _: &Device) -> crate::Result<Uuid> {
            Ok(Uuid::new_v4())
        }
        fn video_read(&mut self, _: &Device, _: Uuid) -> crate::Result<Vec<u8>> {
            Ok(vec![])
        }
        fn video_stop(&mut self, _: &Device, _: Uuid) -> crate::Result<()> {
            Ok(())
        }
    }

    fn make_test_device(name: &str, profile: &str) -> Device {
        Device {
            id: Uuid::new_v4(),
            spec: DeviceSpec {
                name: name.into(),
                image: "system-images;android-34;google_apis;x86_64".into(),
                hardware_profile: profile.into(),
                ram_mb: 4096,
                cores: 4,
                width: 1080,
                height: 2400,
                disk_mb: 8192,
                locale: "en_US".into(),
                graphics_mode: GraphicsMode::Auto,
                proxy: None,
                location_preset: None,
            },
        }
    }

    #[test]
    fn test_broadcast_install_mixed_states() {
        let dev1 = make_test_device("Pixel 8", "pixel_8");
        let dev2 = make_test_device("Galaxy S24", "galaxy_s24");
        let mut engine = MockFleetEngine::new(&[dev1.id]); // dev1 ready, dev2 stopped

        let path = PathBuf::from("test-app-release.apk");
        let report =
            FleetEngine::broadcast_install(&mut engine, &[dev1.clone(), dev2.clone()], &path);

        assert_eq!(report.total_devices, 2);
        assert_eq!(report.successful_devices, 1);
        assert_eq!(report.failed_devices, 1);
        assert_eq!(report.package_name, "test-app-release.apk");

        let res1 = report
            .results
            .iter()
            .find(|r| r.device_id == dev1.id)
            .unwrap();
        assert!(res1.success);
        assert_eq!(res1.message, "Successfully installed");

        let res2 = report
            .results
            .iter()
            .find(|r| r.device_id == dev2.id)
            .unwrap();
        assert!(!res2.success);
        assert!(res2.message.contains("stopped"));
    }

    #[test]
    fn test_capture_synchronized_screenshots() {
        let dev1 = make_test_device("Pixel 8", "pixel_8");
        let dev2 = make_test_device("Pixel Tablet", "pixel_tablet");
        let mut engine = MockFleetEngine::new(&[dev1.id, dev2.id]);

        let report = FleetEngine::capture_synchronized_screenshots(
            &mut engine,
            &[dev1.clone(), dev2.clone()],
        );
        assert_eq!(report.frames.len(), 2);
        assert!(report.frames.iter().all(|f| !f.png_base64.is_empty()));
        assert!(report.frames.iter().all(|f| f.width > 0 && f.height > 0));
    }
}
