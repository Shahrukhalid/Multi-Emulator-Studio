use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GraphicsMode {
    #[default]
    Auto,
    Software,
}

impl GraphicsMode {
    pub fn emulator_arg(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Software => "software",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceSpec {
    pub name: String,
    pub image: String,
    pub hardware_profile: String,
    pub ram_mb: u32,
    pub cores: u32,
    pub width: u32,
    pub height: u32,
    pub disk_mb: u32,
    pub locale: String,
    #[serde(default)]
    pub graphics_mode: GraphicsMode,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub location_preset: Option<String>,
}
impl DeviceSpec {
    pub fn validate(&self) -> Result<()> {
        let safe = |s: &str| {
            !s.is_empty()
                && s.len() <= 128
                && s != "."
                && s != ".."
                && !s.starts_with('-')
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"_-.".contains(&c))
        };
        let is_ios = self.image.starts_with("ios-") || self.image.contains("CoreSimulator");
        let valid_image = if is_ios {
            safe(&self.image)
        } else {
            let image: Vec<_> = self.image.split(';').collect();
            image.len() == 4
                && image[0] == "system-images"
                && image[1].starts_with("android-")
                && image[1..].iter().all(|s| safe(s))
        };
        if self.name.trim().is_empty()
            || self.name.len() > 128
            || !valid_image
            || !safe(&self.hardware_profile)
            || !safe(&self.locale)
            || !(1024..=32768).contains(&self.ram_mb)
            || !(1..=16).contains(&self.cores)
            || !(320..=4320).contains(&self.width)
            || !(320..=4320).contains(&self.height)
            || !(2048..=131072).contains(&self.disk_mb)
        {
            return Err(Error::Invalid("invalid device specification".into()));
        }
        if let Some(proxy) = &self.proxy {
            if proxy.len() > 512
                || proxy.contains('\0')
                || proxy.contains('\n')
                || proxy.contains('\r')
            {
                return Err(Error::Invalid("invalid proxy configuration".into()));
            }
        }
        if let Some(loc) = &self.location_preset {
            if !loc.is_empty() && (!safe(loc) || loc.len() > 64) {
                return Err(Error::Invalid("invalid location preset".into()));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
#[test]
fn rejects_ambiguous_sdk_identifiers() {
    let mut spec = sample();
    spec.hardware_profile = "-force".into();
    assert!(spec.validate().is_err());
    spec.hardware_profile = "pixel_6".into();
    spec.image = "system-images;android-34;..;arm64-v8a".into();
    assert!(spec.validate().is_err());
}

#[cfg(test)]
#[test]
fn legacy_profiles_default_to_auto_graphics() {
    let mut value = serde_json::to_value(sample()).unwrap();
    value.as_object_mut().unwrap().remove("graphics_mode");
    let spec: DeviceSpec = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(spec.graphics_mode, GraphicsMode::Auto);
    value["graphics_mode"] = serde_json::json!("software");
    let spec: DeviceSpec = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(spec.graphics_mode.emulator_arg(), "software");
    value["graphics_mode"] = serde_json::json!("invalid");
    assert!(serde_json::from_value::<DeviceSpec>(value).is_err());
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Device {
    pub id: Uuid,
    pub spec: DeviceSpec,
}
impl Device {
    pub fn new(spec: DeviceSpec) -> Result<Self> {
        spec.validate()?;
        Ok(Self {
            id: Uuid::new_v4(),
            spec,
        })
    }
    pub fn avd_name(&self) -> String {
        format!("mes_{}", self.id.simple())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceState {
    Queued,
    Stopped,
    Starting,
    Ready,
    Stopping,
    Crashed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Status {
    pub id: Uuid,
    pub state: DeviceState,
    pub pid: Option<u32>,
    pub console_port: Option<u16>,
    pub addresses: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<String>,
}

#[cfg(test)]
pub fn sample() -> DeviceSpec {
    DeviceSpec {
        name: "Test".into(),
        image: "system-images;android-34;google_apis;arm64-v8a".into(),
        hardware_profile: "pixel_6".into(),
        ram_mb: 2048,
        cores: 2,
        width: 1080,
        height: 1920,
        disk_mb: 4096,
        locale: "en-US".into(),
        graphics_mode: GraphicsMode::Auto,
        proxy: None,
        location_preset: None,
    }
}
