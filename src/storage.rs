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
            CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, value TEXT NOT NULL);",
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
}
#[cfg(test)]
mod tests {
    use super::*;
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
}
