use crate::{
    model::{Device, Status},
    Result,
};
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
}
