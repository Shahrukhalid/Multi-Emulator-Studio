use crate::{model::Device, Error, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use uuid::Uuid;

pub struct Store(Connection);
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let c = Connection::open(path)?;
        c.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS macros(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, device_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL);",
        )?;
        Ok(Self(c))
    }
    pub fn insert(&self, d: &Device) -> Result<()> {
        d.spec.validate()?;
        self.0.execute(
            "INSERT INTO devices VALUES(?1,?2)",
            params![d.id.to_string(), serde_json::to_string(d)?],
        )?;
        Ok(())
    }
    pub fn list(&self) -> Result<Vec<Device>> {
        let mut stmt = self.0.prepare("SELECT id, data FROM devices ORDER BY id")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        rows.map(|r| {
            let (id, data) = r?;
            let d: Device = serde_json::from_str(&data)?;
            if d.id.to_string() != id {
                return Err(Error::Invalid("stored device identity mismatch".into()));
            }
            d.spec.validate()?;
            Ok(d)
        })
        .collect()
    }
    pub fn get(&self, id: Uuid) -> Result<Device> {
        let value: Option<String> = self
            .0
            .query_row(
                "SELECT data FROM devices WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        let d: Device =
            serde_json::from_str(&value.ok_or_else(|| Error::Invalid("unknown device".into()))?)?;
        if d.id != id {
            return Err(Error::Invalid("stored device identity mismatch".into()));
        }
        d.spec.validate()?;
        Ok(d)
    }
    pub fn remove(&self, id: Uuid) -> Result<()> {
        if self
            .0
            .execute("DELETE FROM devices WHERE id=?1", [id.to_string()])?
            != 1
        {
            return Err(Error::Invalid("unknown device".into()));
        }
        Ok(())
    }
    /// Change the display name without recreating the virtual device.
    pub fn rename(&self, id: Uuid, name: String) -> Result<Device> {
        let mut d = self.get(id)?;
        d.spec.name = name;
        d.spec.validate()?;
        if self.0.execute(
            "UPDATE devices SET data=?1 WHERE id=?2",
            params![serde_json::to_string(&d)?, id.to_string()],
        )? != 1
        {
            return Err(Error::Invalid("unknown device".into()));
        }
        Ok(d)
    }
    pub fn set_config(&self, key: &str, value: &str) -> Result<()> {
        self.0.execute(
            "INSERT INTO config VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
    pub fn config(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .0
            .query_row("SELECT value FROM config WHERE key=?1", [key], |r| r.get(0))
            .optional()?)
    }
    pub fn save_macro(&self, m: &crate::macro_runner::MacroDefinition) -> Result<()> {
        self.0.execute(
            "INSERT INTO macros VALUES(?1, ?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            params![m.id.to_string(), serde_json::to_string(m)?],
        )?;
        Ok(())
    }
    pub fn list_macros(&self) -> Result<Vec<crate::macro_runner::MacroDefinition>> {
        let mut stmt = self.0.prepare("SELECT data FROM macros ORDER BY id")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        let mut list = Vec::new();
        for r in rows {
            list.push(serde_json::from_str(&r?)?);
        }
        if list.is_empty() {
            list = crate::macro_runner::MacroRunner::default_macros();
            for m in &list {
                let _ = self.save_macro(m);
            }
        }
        Ok(list)
    }
    pub fn get_macro(&self, id: Uuid) -> Result<crate::macro_runner::MacroDefinition> {
        let value: Option<String> = self
            .0
            .query_row(
                "SELECT data FROM macros WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(val) = value {
            return Ok(serde_json::from_str(&val)?);
        }
        if let Some(def) = crate::macro_runner::MacroRunner::default_macros()
            .into_iter()
            .find(|m| m.id == id)
        {
            return Ok(def);
        }
        Err(Error::Invalid("Macro definition not found".into()))
    }
    pub fn delete_macro(&self, id: Uuid) -> Result<()> {
        self.0
            .execute("DELETE FROM macros WHERE id=?1", [id.to_string()])?;
        Ok(())
    }
    pub fn save_snapshot(&self, s: &crate::snapshot::Snapshot) -> Result<()> {
        self.0.execute(
            "INSERT OR REPLACE INTO snapshots VALUES(?1, ?2, ?3, ?4)",
            params![
                s.id.to_string(),
                s.device_id.to_string(),
                s.name,
                serde_json::to_string(s)?
            ],
        )?;
        Ok(())
    }
    pub fn list_snapshots(&self, device_id: Uuid) -> Result<Vec<crate::snapshot::Snapshot>> {
        let mut stmt = self
            .0
            .prepare("SELECT data FROM snapshots WHERE device_id=?1 ORDER BY rowid DESC")?;
        let rows = stmt.query_map([device_id.to_string()], |r| r.get::<_, String>(0))?;
        let mut list = Vec::new();
        for row in rows {
            let data = row?;
            let s: crate::snapshot::Snapshot = serde_json::from_str(&data)?;
            list.push(s);
        }
        Ok(list)
    }
    pub fn get_snapshot(&self, id: Uuid) -> Result<crate::snapshot::Snapshot> {
        let value: Option<String> = self
            .0
            .query_row(
                "SELECT data FROM snapshots WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        let s: crate::snapshot::Snapshot =
            serde_json::from_str(&value.ok_or_else(|| Error::Invalid("unknown snapshot".into()))?)?;
        Ok(s)
    }
    pub fn delete_snapshot(&self, id: Uuid) -> Result<()> {
        self.0
            .execute("DELETE FROM snapshots WHERE id=?1", [id.to_string()])?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rename_persists_without_new_identity() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");
        let s = Store::open(&path).unwrap();
        let d = Device::new(crate::model::sample()).unwrap();
        s.insert(&d).unwrap();
        assert_eq!(s.rename(d.id, "Updated".into()).unwrap().id, d.id);
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(s.list().unwrap().len(), 1);
        assert_eq!(s.get(d.id).unwrap().spec.name, "Updated");
    }
    #[test]
    fn stores_120_profiles_and_rejects_duplicate_ids() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");
        let s = Store::open(&path).unwrap();
        for _ in 0..120 {
            s.insert(&Device::new(crate::model::sample()).unwrap())
                .unwrap();
        }
        let d = s.list().unwrap().pop().unwrap();
        assert!(s.insert(&d).is_err());
        drop(s);
        assert_eq!(Store::open(&path).unwrap().list().unwrap().len(), 120);
    }
    #[test]
    fn rejects_mismatched_persisted_identity() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open(&dir.path().join("test.db")).unwrap();
        let a = Device::new(crate::model::sample()).unwrap();
        let b = Device::new(crate::model::sample()).unwrap();
        s.insert(&a).unwrap();
        s.0.execute(
            "UPDATE devices SET data=?1 WHERE id=?2",
            params![serde_json::to_string(&b).unwrap(), a.id.to_string()],
        )
        .unwrap();
        assert!(s.get(a.id).is_err());
        assert!(s.list().is_err());
    }
    #[test]
    fn macro_persistence_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open(&dir.path().join("test.db")).unwrap();
        let macros = s.list_macros().unwrap();
        assert!(!macros.is_empty());
        let mut sample_macro = macros[0].clone();
        sample_macro.name = "Custom Renamed Macro".into();
        s.save_macro(&sample_macro).unwrap();
        assert_eq!(
            s.get_macro(sample_macro.id).unwrap().name,
            "Custom Renamed Macro"
        );
        s.delete_macro(sample_macro.id).unwrap();
    }
    #[test]
    fn snapshot_persistence_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open(&dir.path().join("test.db")).unwrap();
        let dev_id = Uuid::new_v4();
        let snap = crate::snapshot::Snapshot::new(dev_id, "test_checkpoint", "Before running test");
        s.save_snapshot(&snap).unwrap();

        let list = s.list_snapshots(dev_id).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "test_checkpoint");

        let fetched = s.get_snapshot(snap.id).unwrap();
        assert_eq!(fetched.name, "test_checkpoint");

        s.delete_snapshot(snap.id).unwrap();
        assert!(s.list_snapshots(dev_id).unwrap().is_empty());
    }
}
