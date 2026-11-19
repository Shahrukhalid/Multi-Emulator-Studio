use crate::{
    model::{Device, Status},
    Result,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct ScreenFrame {
    pub png_base64: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NavigationKey {
    Back,
    Home,
    Recents,
    VolumeUp,
    VolumeDown,
    Power,
}

#[cfg(test)]
#[test]
fn phone_key_contract_is_allowlisted() {
    for key in [
        "back",
        "home",
        "recents",
        "volume_up",
        "volume_down",
        "power",
    ] {
        assert!(serde_json::from_value::<NavigationKey>(serde_json::json!(key)).is_ok());
    }
    assert!(serde_json::from_value::<NavigationKey>(serde_json::json!("unknown")).is_err());
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TouchInput {
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
}
use std::path::Path;

/// Runtime boundary: future simulator adapters must implement actual capabilities.
pub trait Engine {
    fn create(&mut self, device: &Device) -> Result<()>;
    fn start(&mut self, device: &Device) -> Result<Status>;
    fn stop(&mut self, device: &Device) -> Result<()>;
    fn status(&mut self, device: &Device) -> Result<Status>;
    fn delete(&mut self, device: &Device) -> Result<()>;
    fn install_apk(&mut self, device: &Device, path: &Path) -> Result<()>;
    fn logs(&mut self, device: &Device) -> Result<String>;
    fn screen(&mut self, _: &Device) -> Result<ScreenFrame> {
        Err(crate::Error::Unavailable(
            "Screen viewing is unavailable".into(),
        ))
    }
    fn navigate(&mut self, _: &Device, _: NavigationKey) -> Result<()> {
        Err(crate::Error::Unavailable(
            "Navigation is unavailable".into(),
        ))
    }
    fn touch(&mut self, _: &Device, _: TouchInput) -> Result<()> {
        Err(crate::Error::Unavailable(
            "Touch input is unavailable".into(),
        ))
    }
}
