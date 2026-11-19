use crate::{host::Host, model::DeviceSpec, Error, Result};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Budget {
    pub ram_mb: u64,
    pub cores: u64,
}
impl Budget {
    pub fn from_host(host: &Host) -> Result<Self> {
        if !host.supported {
            return Err(Error::Unavailable("unsupported host platform".into()));
        }
        let ram = host
            .ram_mb
            .ok_or_else(|| Error::Unavailable("host RAM detection failed".into()))?;
        Ok(Self {
            ram_mb: ram.saturating_sub((ram / 3).max(4096)),
            cores: (host.cores as u64).saturating_sub(2),
        })
    }
    pub fn fits(&self, active: impl Iterator<Item = DeviceSpec>, new: &DeviceSpec) -> bool {
        let (ram, cores) = active.fold((0u64, 0u64), |(r, c), s| {
            (r + u64::from(s.ram_mb) + 512, c + u64::from(s.cores))
        });
        ram + u64::from(new.ram_mb) + 512 <= self.ram_mb
            && cores + u64::from(new.cores) <= self.cores
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resource_reservation_accounts_for_overhead() {
        let b = Budget {
            ram_mb: 6000,
            cores: 4,
        };
        let s = crate::model::sample();
        assert!(b.fits([s.clone()].into_iter(), &s));
        assert!(!b.fits([s.clone(), s.clone()].into_iter(), &s));
    }
}
