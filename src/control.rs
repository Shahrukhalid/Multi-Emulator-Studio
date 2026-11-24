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
}
pub struct Controller {
    sdk: Sdk,
    manager: Manager<Android>,
    root: PathBuf,
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
        })
    }
}
