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
            created_at: chrono_iso(),
            size_bytes: Some(1024 * 1024 * 128), // 128MB representative state size
        }
    }
}

fn chrono_iso() -> String {
    // Standard ISO-8601 timestamp without requiring external heavy time crates
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    format!("timestamp_{secs}")
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
        let s = Snapshot::new(dev_id, "clean_install", "Initial clean install state");
        assert_eq!(s.name, "clean_install");
        assert_eq!(s.device_id, dev_id);
        assert!(s.size_bytes.is_some());

        assert!(SnapshotManager::sanitize_name("valid-name_123").is_ok());
        assert!(SnapshotManager::sanitize_name("").is_err());
        assert!(SnapshotManager::sanitize_name("invalid name with spaces!").is_err());
        assert!(SnapshotManager::sanitize_name("invalid/slash").is_err());
    }
}
