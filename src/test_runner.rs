use crate::model::Device;
use crate::runtime::{Engine, NavigationKey, TouchInput};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StepExecutionStatus {
    Pending,
    Running,
    Passed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MatrixStepAction {
    LaunchApp {
        package: String,
    },
    Tap {
        x: u32,
        y: u32,
    },
    Swipe {
        x: u32,
        y: u32,
        end_x: u32,
        end_y: u32,
    },
    InputText {
        text: String,
    },
    Key {
        key: NavigationKey,
    },
    Wait {
        ms: u64,
    },
    CaptureScreenshot,
    AssertAlive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixTestStep {
    pub id: String,
    pub title: String,
    pub action: MatrixStepAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixTestSuite {
    pub id: String,
    pub name: String,
    pub steps: Vec<MatrixTestStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixStepResult {
    pub step_id: String,
    pub status: StepExecutionStatus,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub screenshot_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixDeviceResult {
    pub device_id: Uuid,
    pub device_name: String,
    pub status: StepExecutionStatus,
    pub total_duration_ms: u64,
    pub steps: Vec<MatrixStepResult>,
    pub latest_screenshot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixRunReport {
    pub suite_id: String,
    pub suite_name: String,
    pub total_devices: usize,
    pub passed_devices: usize,
    pub failed_devices: usize,
    pub total_duration_ms: u64,
    pub devices: Vec<MatrixDeviceResult>,
}

pub struct ParallelTestRunner;

impl ParallelTestRunner {
    /// Factory for the default smoke test suite matching our zero-cost UI workflow.
    pub fn default_smoke_suite() -> MatrixTestSuite {
        MatrixTestSuite {
            id: "smoke".into(),
            name: "Smoke Test Suite".into(),
            steps: vec![
                MatrixTestStep {
                    id: "assert_alive".into(),
                    title: "Check Device Online & Responsive".into(),
                    action: MatrixStepAction::AssertAlive,
                },
                MatrixTestStep {
                    id: "key_home".into(),
                    title: "Navigate to Home Screen".into(),
                    action: MatrixStepAction::Key {
                        key: NavigationKey::Home,
                    },
                },
                MatrixTestStep {
                    id: "screen_capture".into(),
                    title: "Capture Live Screen Snapshot".into(),
                    action: MatrixStepAction::CaptureScreenshot,
                },
            ],
        }
    }

    /// Execute a single step against an engine and device.
    pub fn execute_step<E: Engine>(
        engine: &mut E,
        device: &Device,
        action: &MatrixStepAction,
    ) -> (crate::Result<()>, Option<String>) {
        match action {
            MatrixStepAction::LaunchApp { package } => (engine.launch_app(device, package), None),
            MatrixStepAction::Tap { x, y } => {
                (engine.touch(device, TouchInput::Tap { x: *x, y: *y }), None)
            }
            MatrixStepAction::Swipe { x, y, end_x, end_y } => (
                engine.touch(
                    device,
                    TouchInput::Swipe {
                        x: *x,
                        y: *y,
                        end_x: *end_x,
                        end_y: *end_y,
                    },
                ),
                None,
            ),
            MatrixStepAction::InputText { text } => (engine.input_text(device, text), None),
            MatrixStepAction::Key { key } => (engine.navigate(device, key.clone()), None),
            MatrixStepAction::Wait { ms } => {
                std::thread::sleep(std::time::Duration::from_millis(*ms));
                (Ok(()), None)
            }
            MatrixStepAction::CaptureScreenshot => match engine.screen(device) {
                Ok(frame) => (Ok(()), Some(frame.png_base64)),
                Err(e) => (Err(e), None),
            },
            MatrixStepAction::AssertAlive => match engine.status(device) {
                Ok(crate::model::Status {
                    state: crate::model::DeviceState::Ready,
                    ..
                }) => (Ok(()), None),
                Ok(s) => (
                    Err(crate::Error::Unavailable(format!(
                        "Device not ready: {:?}",
                        s.state
                    ))),
                    None,
                ),
                Err(e) => (Err(e), None),
            },
        }
    }

    /// Execute an entire test suite on a single device, short-circuiting on failure.
    pub fn execute_device_suite<E: Engine>(
        engine: &mut E,
        device: &Device,
        suite: &MatrixTestSuite,
    ) -> MatrixDeviceResult {
        let start = Instant::now();
        let mut step_results = Vec::new();
        let mut overall_status = StepExecutionStatus::Passed;
        let mut latest_screenshot = None;

        for step in &suite.steps {
            if overall_status == StepExecutionStatus::Failed {
                step_results.push(MatrixStepResult {
                    step_id: step.id.clone(),
                    status: StepExecutionStatus::Skipped,
                    duration_ms: 0,
                    error: None,
                    screenshot_base64: None,
                });
                continue;
            }

            let step_start = Instant::now();
            let (res, screenshot) = Self::execute_step(engine, device, &step.action);
            let step_duration = step_start.elapsed().as_millis() as u64;

            if let Some(s) = screenshot {
                latest_screenshot = Some(s.clone());
                step_results.push(MatrixStepResult {
                    step_id: step.id.clone(),
                    status: StepExecutionStatus::Passed,
                    duration_ms: step_duration,
                    error: None,
                    screenshot_base64: Some(s),
                });
            } else {
                match res {
                    Ok(()) => {
                        step_results.push(MatrixStepResult {
                            step_id: step.id.clone(),
                            status: StepExecutionStatus::Passed,
                            duration_ms: step_duration,
                            error: None,
                            screenshot_base64: None,
                        });
                    }
                    Err(e) => {
                        overall_status = StepExecutionStatus::Failed;
                        step_results.push(MatrixStepResult {
                            step_id: step.id.clone(),
                            status: StepExecutionStatus::Failed,
                            duration_ms: step_duration,
                            error: Some(e.to_string()),
                            screenshot_base64: None,
                        });
                    }
                }
            }
        }

        MatrixDeviceResult {
            device_id: device.id,
            device_name: device.spec.name.clone(),
            status: overall_status,
            total_duration_ms: start.elapsed().as_millis() as u64,
            steps: step_results,
            latest_screenshot,
        }
    }

    /// Execute a test suite across a slice of target devices.
    pub fn execute_matrix<E: Engine>(
        engine: &mut E,
        devices: &[Device],
        suite: &MatrixTestSuite,
    ) -> MatrixRunReport {
        let start = Instant::now();
        let mut device_results = Vec::new();
        let mut passed = 0;
        let mut failed = 0;

        for device in devices {
            let res = Self::execute_device_suite(engine, device, suite);
            if res.status == StepExecutionStatus::Passed {
                passed += 1;
            } else {
                failed += 1;
            }
            device_results.push(res);
        }

        MatrixRunReport {
            suite_id: suite.id.clone(),
            suite_name: suite.name.clone(),
            total_devices: devices.len(),
            passed_devices: passed,
            failed_devices: failed,
            total_duration_ms: start.elapsed().as_millis() as u64,
            devices: device_results,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DeviceSpec, GraphicsMode};

    struct MockEngine {
        fail_action: bool,
    }

    impl Engine for MockEngine {
        fn create(&mut self, _: &Device) -> crate::Result<()> {
            Ok(())
        }
        fn start(&mut self, d: &Device) -> crate::Result<crate::model::Status> {
            self.status(d)
        }
        fn stop(&mut self, _: &Device) -> crate::Result<()> {
            Ok(())
        }
        fn status(&mut self, d: &Device) -> crate::Result<crate::model::Status> {
            Ok(crate::model::Status {
                id: d.id,
                state: if self.fail_action {
                    crate::model::DeviceState::Stopped
                } else {
                    crate::model::DeviceState::Ready
                },
                pid: Some(1234),
                console_port: Some(5554),
                addresses: vec![],
                diagnostic: None,
            })
        }
        fn delete(&mut self, _: &Device) -> crate::Result<()> {
            Ok(())
        }
        fn install_apk(&mut self, _: &Device, _: &std::path::Path) -> crate::Result<()> {
            Ok(())
        }
        fn logs(&mut self, _: &Device) -> crate::Result<String> {
            Ok(String::new())
        }
        fn touch(&mut self, _: &Device, _: TouchInput) -> crate::Result<()> {
            if self.fail_action {
                Err(crate::Error::Unavailable("touch failed".into()))
            } else {
                Ok(())
            }
        }
        fn navigate(&mut self, _: &Device, _: NavigationKey) -> crate::Result<()> {
            if self.fail_action {
                Err(crate::Error::Unavailable("navigate failed".into()))
            } else {
                Ok(())
            }
        }
        fn screen(&mut self, _: &Device) -> crate::Result<crate::runtime::ScreenFrame> {
            Ok(crate::runtime::ScreenFrame {
                png_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==".into(),
                width: 1,
                height: 1,
            })
        }
    }

    fn sample_device(name: &str) -> Device {
        Device {
            id: Uuid::new_v4(),
            spec: DeviceSpec {
                name: name.into(),
                image: "system-images;android-34;google_apis;x86_64".into(),
                hardware_profile: "pixel_8".into(),
                ram_mb: 4096,
                cores: 4,
                width: 1080,
                height: 2400,
                disk_mb: 8192,
                locale: "en-US".into(),
                graphics_mode: GraphicsMode::Auto,
                proxy: None,
                location_preset: None,
            },
        }
    }

    #[test]
    fn test_execute_suite_success() {
        let mut engine = MockEngine { fail_action: false };
        let device = sample_device("Pixel 8 Pro");
        let suite = ParallelTestRunner::default_smoke_suite();

        let res = ParallelTestRunner::execute_device_suite(&mut engine, &device, &suite);
        assert_eq!(res.status, StepExecutionStatus::Passed);
        assert_eq!(res.steps.len(), 3);
        assert!(res.latest_screenshot.is_some());
        assert!(res
            .steps
            .iter()
            .all(|s| s.status == StepExecutionStatus::Passed));
    }

    #[test]
    fn test_execute_suite_step_failure_and_skip() {
        let mut engine = MockEngine { fail_action: true };
        let device = sample_device("Failing Device");
        let suite = ParallelTestRunner::default_smoke_suite();

        let res = ParallelTestRunner::execute_device_suite(&mut engine, &device, &suite);
        assert_eq!(res.status, StepExecutionStatus::Failed);
        // Step 1 fails on AssertAlive because state is Stopped
        assert_eq!(res.steps[0].status, StepExecutionStatus::Failed);
        // Remaining steps are skipped
        assert_eq!(res.steps[1].status, StepExecutionStatus::Skipped);
        assert_eq!(res.steps[2].status, StepExecutionStatus::Skipped);
    }

    #[test]
    fn test_matrix_runner_aggregates_stats() {
        let mut engine = MockEngine { fail_action: false };
        let dev1 = sample_device("Device 1");
        let dev2 = sample_device("Device 2");
        let suite = ParallelTestRunner::default_smoke_suite();

        let report = ParallelTestRunner::execute_matrix(&mut engine, &[dev1, dev2], &suite);
        assert_eq!(report.total_devices, 2);
        assert_eq!(report.passed_devices, 2);
        assert_eq!(report.failed_devices, 0);
        assert_eq!(report.devices.len(), 2);
    }
}
