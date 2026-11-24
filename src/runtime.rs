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

#[derive(Debug, Serialize)]
pub struct GoogleApps {
    pub play_store: bool,
    pub youtube: bool,
    pub youtube_preinstalled: bool,
}

impl GoogleApps {
    pub fn from_packages(packages: &str) -> Self {
        let has = |name: &str| packages.lines().any(|line| line.trim() == name);
        Self {
            play_store: has("package:com.android.vending"),
            youtube: has("package:com.google.android.youtube"),
            youtube_preinstalled: false,
        }
    }
}

#[cfg(test)]
#[test]
fn google_apps_require_exact_package_names() {
    let apps = GoogleApps::from_packages(
        "package:com.android.vending\npackage:com.google.android.youtube.fake\n",
    );
    assert!(apps.play_store);
    assert!(!apps.youtube);
    assert!(GoogleApps::from_packages("package:com.google.android.youtube\n").youtube);
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    fn screen_png(&mut self, _: &Device) -> Result<Vec<u8>> {
        Err(crate::Error::Unavailable(
            "Binary screen viewing is unavailable".into(),
        ))
    }
    fn video_start(&mut self, _: &Device) -> Result<uuid::Uuid> {
        Err(crate::Error::Unavailable(
            "Video streaming unavailable".into(),
        ))
    }
    fn video_read(&mut self, _: &Device, _: uuid::Uuid) -> Result<Vec<u8>> {
        Err(crate::Error::Unavailable(
            "Video streaming unavailable".into(),
        ))
    }
    fn video_stop(&mut self, _: &Device, _: uuid::Uuid) -> Result<()> {
        Ok(())
    }
    fn google_apps(&mut self, _: &Device) -> Result<GoogleApps> {
        Err(crate::Error::Unavailable(
            "Google app verification is unavailable".into(),
        ))
    }
    fn open_youtube_store(&mut self, _: &Device) -> Result<()> {
        Err(crate::Error::Unavailable("Play Store unavailable".into()))
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
    fn set_location(
        &mut self,
        _: &Device,
        _lat: f64,
        _lon: f64,
        _timezone: Option<&str>,
    ) -> Result<()> {
        Err(crate::Error::Unavailable(
            "Location mocking is unavailable".into(),
        ))
    }
    fn get_logcat(&mut self, _: &Device, _lines: usize) -> Result<String> {
        Err(crate::Error::Unavailable(
            "Live logcat is unavailable".into(),
        ))
    }
    fn rotate(&mut self, _: &Device, _orientation: &str) -> Result<()> {
        Err(crate::Error::Unavailable(
            "Screen rotation is unavailable".into(),
        ))
    }
    fn set_proxy_target(&mut self, _: &Device, _target: Option<&str>) -> Result<bool> {
        Err(crate::Error::Unavailable(
            "Dynamic proxy routing is unavailable".into(),
        ))
    }
    fn input_text(&mut self, _: &Device, _text: &str) -> Result<()> {
        Err(crate::Error::Unavailable(
            "Text input is unavailable".into(),
        ))
    }
    fn launch_app(&mut self, _: &Device, _package: &str) -> Result<()> {
        Err(crate::Error::Unavailable(
            "App launch is unavailable".into(),
        ))
    }
    fn set_network_profile(&mut self, _: &Device, _profile_id: &str) -> Result<()> {
        Err(crate::Error::Unavailable(
            "Network conditioning is unavailable".into(),
        ))
    }
    fn input_key(&mut self, _: &Device, _keycode: u32) -> Result<()> {
        Err(crate::Error::Unavailable("Key input is unavailable".into()))
    }
    fn set_clipboard(&mut self, _: &Device, _text: &str) -> Result<()> {
        Err(crate::Error::Unavailable(
            "Clipboard setting is unavailable".into(),
        ))
    }
    fn get_clipboard(&mut self, _: &Device) -> Result<String> {
        Err(crate::Error::Unavailable(
            "Clipboard retrieval is unavailable".into(),
        ))
    }
}
