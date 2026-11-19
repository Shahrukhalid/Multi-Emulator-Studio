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
    Acceleration,
    List,
    Tick,
    Create { spec: DeviceSpec },
    CloneProfile { id: Uuid, name: String },
    Start { id: Uuid },
    Stop { id: Uuid },
    Restart { id: Uuid },
    Status { id: Uuid },
    Delete { id: Uuid },
    InstallApk { id: Uuid, path: PathBuf },
    Logs { id: Uuid },
}
pub struct Controller {
    sdk: Sdk,
    manager: Manager<Android>,
}
impl Controller {
    pub fn open(root: &Path, sdk_root: Option<PathBuf>) -> Result<Self> {
        let sdk = Sdk::detect(sdk_root)?;
        let manager = Manager::open(root, Android::new(sdk.clone(), root.join("avds"))?)?;
        Ok(Self { sdk, manager })
    }
    pub fn execute(&mut self, r: Request) -> std::result::Result<Value, ApiError> {
        self.dispatch(r).map_err(ApiError::from)
    }
    fn dispatch(&mut self, r: Request) -> Result<Value> {
        Ok(match r {
            Request::Host => json!(crate::host::detect()),
            Request::Sdk => json!(self.sdk),
            Request::Images => json!(self.sdk.images()?),
            Request::Acceleration => json!(self.sdk.acceleration()?),
            Request::List => json!(self.manager.list()?),
            Request::Tick => json!(self.manager.tick()?),
            Request::Create { spec } => json!(self.manager.create(spec)?),
            Request::CloneProfile { id, name } => json!(self.manager.clone_profile(id, name)?),
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
        })
    }
}
