use crate::{
    android::{Android, Sdk},
    error::ApiError,
    manager::Manager,
    model::DeviceSpec,
    Result,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Request {
    Host,
    Sdk,
    Images,
    HardwareProfiles,
    Acceleration,
    EmulatorVersion,
    RuntimePreflight,
    List,
    Tick,
    Network,
    Create {
        spec: DeviceSpec,
    },
    CloneProfile {
        id: Uuid,
        name: String,
    },
    Rename {
        id: Uuid,
        name: String,
    },
    Start {
        id: Uuid,
    },
    Stop {
        id: Uuid,
    },
    Restart {
        id: Uuid,
    },
    Status {
        id: Uuid,
    },
    Delete {
        id: Uuid,
    },
    InstallApk {
        id: Uuid,
        path: PathBuf,
    },
    Logs {
        id: Uuid,
    },
    Screen {
        id: Uuid,
    },
    VideoStart {
        id: Uuid,
    },
    VideoStop {
        id: Uuid,
        token: Uuid,
    },
    GoogleApps {
        id: Uuid,
    },
    OpenYoutubeStore {
        id: Uuid,
    },
    Navigate {
        id: Uuid,
        key: crate::runtime::NavigationKey,
    },
    Touch {
        id: Uuid,
        input: crate::runtime::TouchInput,
    },
    SetLocation {
        id: Uuid,
        latitude: f64,
        longitude: f64,
        timezone: Option<String>,
    },
    GetLogcat {
        id: Uuid,
        lines: Option<usize>,
    },
    Rotate {
        id: Uuid,
        orientation: String,
    },
    SetProxyTarget {
        id: Uuid,
        target: Option<String>,
    },
    RunMatrixTest {
        device_ids: Option<Vec<Uuid>>,
        suite: Option<crate::test_runner::MatrixTestSuite>,
    },
    AnalyzeCrashes {
        id: Uuid,
    },
    GetTelemetry {
        id: Uuid,
    },
    IosRuntimes,
    IosDevices,
    IosBoot {
        udid: String,
    },
    IosShutdown {
        udid: String,
    },
    BroadcastInstall {
        device_ids: Option<Vec<Uuid>>,
        path: PathBuf,
    },
    SynchronizedScreenshots {
        device_ids: Option<Vec<Uuid>>,
    },
    SetNetworkProfile {
        id: Uuid,
        profile: String,
    },
    GetNetworkProfiles,
    GenerateReportHtml {
        matrix: crate::test_runner::MatrixRunReport,
        crashes: Option<Vec<crate::diagnostics::ParsedCrash>>,
        fleet: Option<crate::fleet::BroadcastInstallReport>,
    },
    PreflightReport,
    InputKey {
        id: Uuid,
        keycode: u32,
    },
    InputText {
        id: Uuid,
        text: String,
    },
    SetClipboard {
        id: Uuid,
        text: String,
    },
    GetClipboard {
        id: Uuid,
    },
    ListMacros,
    SaveMacro {
        macro_def: crate::macro_runner::MacroDefinition,
    },
    DeleteMacro {
        id: Uuid,
    },
    RunMacro {
        macro_id: Uuid,
        device_id: Uuid,
    },
    RunMacroFleet {
        macro_id: Uuid,
        device_ids: Option<Vec<Uuid>>,
    },
}
pub struct Controller {
    sdk: Sdk,
    manager: Manager<Android>,
    root: PathBuf,
    ios: crate::ios::IosEngine,
}
impl Controller {
    pub fn qa_profiles_idle(&mut self) -> Result<bool> {
        Ok(self.manager.snapshot()?.iter().all(|s| {
            matches!(
                s.state,
                crate::model::DeviceState::Stopped | crate::model::DeviceState::Crashed
            )
        }))
    }
    pub fn prepare_screen_capture(
        &mut self,
        id: &str,
    ) -> std::result::Result<crate::android::ScreenCapture, ApiError> {
        let id =
            Uuid::parse_str(id).map_err(|_| crate::Error::Invalid("Invalid device ID".into()))?;
        self.manager
            .prepare_screen_capture(id)
            .map_err(ApiError::from)
    }
    pub fn sdk(&self) -> Sdk {
        self.sdk.clone()
    }
    pub fn screen_png(&mut self, id: &str) -> std::result::Result<Vec<u8>, ApiError> {
        let id =
            Uuid::parse_str(id).map_err(|_| crate::Error::Invalid("Invalid device ID".into()))?;
        self.manager.screen_png(id).map_err(ApiError::from)
    }
    pub fn video_read(&mut self, id: &str, token: &str) -> std::result::Result<Vec<u8>, ApiError> {
        let parse = |text: &str| {
            Uuid::parse_str(text)
                .map_err(|_| crate::Error::Invalid("Invalid video identifier".into()))
        };
        self.manager
            .video_read(parse(id)?, parse(token)?)
            .map_err(ApiError::from)
    }
    pub fn open(root: &Path, sdk_root: Option<PathBuf>) -> Result<Self> {
        std::fs::create_dir_all(root)?;
        let previous =
            crate::storage::Store::open(&root.join("metadata.db"))?.config("sdk_root")?;
        let managed = crate::managed_sdk::managed_root(root);
        let sdk = Sdk::detect(
            sdk_root
                .or_else(|| previous.map(PathBuf::from))
                .or_else(|| {
                    let sdk = Sdk::detect(Some(managed.clone())).ok()?;
                    sdk.images()
                        .ok()?
                        .iter()
                        .any(|image| image.contains(";google_apis_playstore;"))
                        .then_some(managed)
                }),
        )?;
        let manager = Manager::open(root, Android::new(sdk.clone(), root.join("avds"))?)?;
        manager.set_config("sdk_root", &sdk.root.to_string_lossy())?;
        Ok(Self {
            sdk,
            manager,
            root: root.to_path_buf(),
            ios: crate::ios::IosEngine::new(),
        })
    }
    pub fn execute(&mut self, r: Request) -> std::result::Result<Value, ApiError> {
        self.dispatch(r).map_err(ApiError::from)
    }
    fn dispatch(&mut self, r: Request) -> Result<Value> {
        Ok(match r {
            Request::Host => {
                let mut host = json!(crate::host::detect());
                host["available_disk_mb"] = json!(crate::host::disk_free_mb(&self.root));
                host
            }
            Request::Sdk => json!(self.sdk),
            Request::Images => json!(self.sdk.images()?),
            Request::HardwareProfiles => json!(self.sdk.hardware_profiles()?),
            Request::Acceleration => json!(self.sdk.acceleration()?),
            Request::EmulatorVersion => json!(self.sdk.version()?),
            Request::RuntimePreflight => json!(self.sdk.preflight()),
            Request::List => json!(self.manager.list()?),
            Request::Tick => json!(self.manager.tick()?),
            Request::Network => {
                let statuses = self.manager.snapshot()?;
                json!({"overlaps":crate::network::overlaps(&statuses),"devices":statuses,"note":"Duplicate guest IPs can be expected in isolated NAT networks; public IP and MAC customization are not asserted."})
            }
            Request::Create { spec } => json!(self.manager.create(spec)?),
            Request::CloneProfile { id, name } => json!(self.manager.clone_profile(id, name)?),
            Request::Rename { id, name } => json!(self.manager.rename(id, name)?),
            Request::Start { id } => json!(self.manager.start(id)?),
            Request::Stop { id } => {
                self.manager.stop(id)?;
                json!(true)
            }
            Request::Restart { id } => json!(self.manager.restart(id)?),
            Request::Status { id } => json!(self.manager.status(id)?),
            Request::Delete { id } => {
                self.manager.delete(id)?;
                json!(true)
            }
            Request::InstallApk { id, path } => {
                self.manager.install_apk(id, &path)?;
                json!(true)
            }
            Request::Logs { id } => json!(self.manager.logs(id)?),
            Request::Screen { id } => json!(self.manager.screen(id)?),
            Request::VideoStart { id } => json!(self.manager.video_start(id)?),
            Request::VideoStop { id, token } => {
                self.manager.video_stop(id, token)?;
                json!(true)
            }
            Request::GoogleApps { id } => json!(self.manager.google_apps(id)?),
            Request::OpenYoutubeStore { id } => {
                self.manager.open_youtube_store(id)?;
                json!(true)
            }
            Request::Navigate { id, key } => {
                self.manager.navigate(id, key)?;
                json!(true)
            }
            Request::Touch { id, input } => {
                self.manager.touch(id, input)?;
                json!(true)
            }
            Request::SetLocation {
                id,
                latitude,
                longitude,
                timezone,
            } => {
                self.manager
                    .set_location(id, latitude, longitude, timezone.as_deref())?;
                json!(true)
            }
            Request::GetLogcat { id, lines } => {
                json!(self.manager.get_logcat(id, lines.unwrap_or(100))?)
            }
            Request::Rotate { id, orientation } => {
                self.manager.rotate(id, &orientation)?;
                json!(true)
            }
            Request::SetProxyTarget { id, target } => {
                json!(self.manager.set_proxy_target(id, target.as_deref())?)
            }
            Request::RunMatrixTest { device_ids, suite } => {
                json!(self.manager.run_matrix_test(device_ids, suite)?)
            }
            Request::AnalyzeCrashes { id } => {
                json!(self.manager.analyze_crashes(id)?)
            }
            Request::GetTelemetry { id } => {
                json!(self.manager.get_telemetry(id)?)
            }
            Request::IosRuntimes => json!(self.ios.list_runtimes()?),
            Request::IosDevices => json!(self.ios.list_devices()?),
            Request::IosBoot { udid } => {
                self.ios.boot_simulator(&udid)?;
                json!(true)
            }
            Request::IosShutdown { udid } => {
                self.ios.shutdown_simulator(&udid)?;
                json!(true)
            }
            Request::BroadcastInstall { device_ids, path } => {
                json!(self.manager.broadcast_install(device_ids, &path)?)
            }
            Request::SynchronizedScreenshots { device_ids } => {
                json!(self.manager.synchronized_screenshots(device_ids)?)
            }
            Request::SetNetworkProfile { id, profile } => {
                self.manager.set_network_profile(id, &profile)?;
                json!(true)
            }
            Request::GetNetworkProfiles => {
                json!(crate::network::standard_network_profiles())
            }
            Request::GenerateReportHtml {
                matrix,
                crashes,
                fleet,
            } => {
                let html = crate::report::HtmlReportGenerator::generate_html(
                    &matrix,
                    crashes.as_deref(),
                    fleet.as_ref(),
                );
                json!(html)
            }
            Request::PreflightReport => {
                json!(crate::preflight::PreflightAnalyzer::run_diagnostics(
                    &self.sdk, &self.root
                ))
            }
            Request::InputKey { id, keycode } => {
                self.manager.input_key(id, keycode)?;
                json!(true)
            }
            Request::InputText { id, text } => {
                self.manager.input_text(id, &text)?;
                json!(true)
            }
            Request::SetClipboard { id, text } => {
                self.manager.set_clipboard(id, &text)?;
                json!(true)
            }
            Request::GetClipboard { id } => {
                json!(self.manager.get_clipboard(id)?)
            }
            Request::ListMacros => {
                json!(self.manager.list_macros()?)
            }
            Request::SaveMacro { macro_def } => {
                self.manager.save_macro(&macro_def)?;
                json!(true)
            }
            Request::DeleteMacro { id } => {
                self.manager.delete_macro(id)?;
                json!(true)
            }
            Request::RunMacro {
                macro_id,
                device_id,
            } => {
                json!(self.manager.run_macro(macro_id, device_id)?)
            }
            Request::RunMacroFleet {
                macro_id,
                device_ids,
            } => {
                json!(self.manager.run_macro_fleet(macro_id, device_ids)?)
            }
        })
    }
}
