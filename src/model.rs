use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
}
impl DeviceSpec {
    pub fn validate(&self) -> Result<()> {
        let safe = |s: &str| {
            !s.is_empty()
                && s.len() <= 128
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"_-.".contains(&c))
        };
        let image: Vec<_> = self.image.split(';').collect();
        if self.name.trim().is_empty()
            || self.name.len() > 128
            || image.len() != 4
            || image[0] != "system-images"
            || !image[1].starts_with("android-")
            || !image[1..].iter().all(|s| safe(s))
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
        Ok(())
    }
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
    }
}
