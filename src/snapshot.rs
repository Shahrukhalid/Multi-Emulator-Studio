use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Snapshot {
    pub id: Uuid,
    pub device_id: Uuid,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub size_bytes: Option<u64>,
}

impl Snapshot {
    pub fn new(device_id: Uuid, name: &str, description: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            device_id,
            name: name.trim().to_string(),
            description: description.trim().to_string(),
            created_at: utc_timestamp_iso(),
            size_bytes: None,
        }
    }

    pub fn with_size(mut self, size_bytes: Option<u64>) -> Self {
        self.size_bytes = size_bytes;
        self
    }
}

/// Formats a UNIX epoch timestamp (seconds) as UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) without external time crates.
pub fn format_utc_iso(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// Returns the current system time as UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`).
pub fn utc_timestamp_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format_utc_iso(secs)
}

// Howard Hinnant's civil-from-days algorithm anchored at 1970-01-01.
fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year, m as u32, d as u32)
}

pub struct SnapshotManager;

impl SnapshotManager {
    pub fn sanitize_name(name: &str) -> Result<String, crate::Error> {
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed.len() > 64 {
            return Err(crate::Error::Invalid(
                "Snapshot name must be between 1 and 64 characters.".into(),
            ));
        }
        if !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            return Err(crate::Error::Invalid(
                "Snapshot name may only contain alphanumeric characters, underscores, and hyphens."
                    .into(),
            ));
        }
        Ok(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snapshot_creation_and_sanitize() {
        let dev_id = Uuid::new_v4();
        let s = Snapshot::new(dev_id, "clean_install", "Initial clean install state")
            .with_size(Some(1024 * 1024));
        assert_eq!(s.name, "clean_install");
        assert_eq!(s.device_id, dev_id);
        assert_eq!(s.size_bytes, Some(1024 * 1024));
        assert!(s.created_at.ends_with('Z') && s.created_at.contains('T'));
        assert_eq!(format_utc_iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_utc_iso(1_700_000_000), "2023-11-14T22:13:20Z");

        assert!(SnapshotManager::sanitize_name("valid-name_123").is_ok());
        assert!(SnapshotManager::sanitize_name("").is_err());
        assert!(SnapshotManager::sanitize_name("invalid name with spaces!").is_err());
        assert!(SnapshotManager::sanitize_name("invalid/slash").is_err());
    }
}
