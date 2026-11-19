use crate::{
    model::{Device, DeviceSpec, DeviceState, Status},
    runtime::Engine,
    storage::Store,
    Result,
};
use std::{
    collections::VecDeque,
    fs::{File, OpenOptions},
    path::Path,
};
use uuid::Uuid;

pub struct Manager<E: Engine> {
    store: Store,
    engine: E,
    _lock: File,
    queue: VecDeque<Uuid>,
}
impl<E: Engine> Manager<E> {
    pub fn open(root: &Path, engine: E) -> Result<Self> {
        std::fs::create_dir_all(root)?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("manager.lock"))?;
        lock.try_lock()
            .map_err(|_| crate::Error::Conflict("another controller owns this storage".into()))?;
        Ok(Self {
            store: Store::open(&root.join("metadata.db"))?,
            engine,
            _lock: lock,
            queue: VecDeque::new(),
        })
    }
    pub fn list(&self) -> Result<Vec<Device>> {
        self.store.list()
    }
    pub fn set_config(&self, key: &str, value: &str) -> Result<()> {
        self.store.set_config(key, value)
    }
    pub fn create(&mut self, spec: DeviceSpec) -> Result<Device> {
        let d = Device::new(spec)?;
        self.engine.create(&d)?;
        if let Err(err) = self.store.insert(&d) {
            let _ = self.engine.delete(&d);
            return Err(err);
        }
        Ok(d)
    }
    pub fn start(&mut self, id: Uuid) -> Result<Status> {
        let status = self.engine.start(&self.store.get(id)?)?;
        if status.state == DeviceState::Queued {
            if !self.queue.contains(&id) {
                self.queue.push_back(id);
            }
        } else {
            self.queue.retain(|x| *x != id);
        }
        Ok(status)
    }
    pub fn stop(&mut self, id: Uuid) -> Result<()> {
        self.queue.retain(|x| *x != id);
        self.engine.stop(&self.store.get(id)?)
    }
    pub fn restart(&mut self, id: Uuid) -> Result<Status> {
        self.stop(id)?;
        self.start(id)
    }
    pub fn status(&mut self, id: Uuid) -> Result<Status> {
        if self.queue.contains(&id) {
            return Ok(Status {
                id,
                state: DeviceState::Queued,
                pid: None,
                console_port: None,
                addresses: vec![],
            });
        }
        self.engine.status(&self.store.get(id)?)
    }
    pub fn delete(&mut self, id: Uuid) -> Result<()> {
        self.queue.retain(|x| *x != id);
        self.engine.delete(&self.store.get(id)?)?;
        self.store.remove(id)
    }
    /// Copy settings, not app data. This creates an entirely fresh AVD.
    pub fn clone_profile(&mut self, id: Uuid, name: String) -> Result<Device> {
        let mut spec = self.store.get(id)?.spec;
        spec.name = name;
        self.create(spec)
    }
    pub fn install_apk(&mut self, id: Uuid, path: &Path) -> Result<()> {
        self.engine.install_apk(&self.store.get(id)?, path)
    }
    pub fn logs(&mut self, id: Uuid) -> Result<String> {
        self.engine.logs(&self.store.get(id)?)
    }
    /// Poll all profiles and admit queued starts in FIFO order.
    pub fn tick(&mut self) -> Result<Vec<Status>> {
        let mut statuses = self.snapshot()?;
        while let Some(id) = self.queue.front().copied() {
            let s = self.start(id)?;
            let queued = s.state == DeviceState::Queued;
            statuses.retain(|old| old.id != id);
            statuses.push(s);
            if queued {
                break;
            }
        }
        Ok(statuses)
    }
    pub fn snapshot(&mut self) -> Result<Vec<Status>> {
        let mut statuses = Vec::new();
        for d in self.store.list()? {
            statuses.push(self.status(d.id)?);
        }
        Ok(statuses)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Error;
    use std::collections::{HashMap, HashSet};
    #[derive(Default)]
    struct Fake {
        created: HashSet<Uuid>,
        active: HashMap<Uuid, u16>,
        next: u16,
    }
    impl Engine for Fake {
        fn create(&mut self, d: &Device) -> Result<()> {
            assert!(self.created.insert(d.id));
            Ok(())
        }
        fn start(&mut self, d: &Device) -> Result<Status> {
            if self.active.contains_key(&d.id) {
                return Err(Error::Conflict("already active".into()));
            }
            if self.active.len() == 2 {
                return Ok(Status {
                    id: d.id,
                    state: DeviceState::Queued,
                    pid: None,
                    console_port: None,
                    addresses: vec![],
                });
            }
            self.next += 2;
            self.active.insert(d.id, 5552 + self.next);
            self.status(d)
        }
        fn stop(&mut self, d: &Device) -> Result<()> {
            self.active.remove(&d.id);
            Ok(())
        }
        fn status(&mut self, d: &Device) -> Result<Status> {
            let port = self.active.get(&d.id).copied();
            Ok(Status {
                id: d.id,
                state: if port.is_some() {
                    DeviceState::Ready
                } else {
                    DeviceState::Stopped
                },
                pid: port.map(u32::from),
                console_port: port,
                addresses: vec![],
            })
        }
        fn delete(&mut self, d: &Device) -> Result<()> {
            if self.active.contains_key(&d.id) {
                return Err(Error::Conflict("active".into()));
            }
            self.created.remove(&d.id);
            Ok(())
        }
        fn install_apk(&mut self, _: &Device, _: &Path) -> Result<()> {
            Ok(())
        }
        fn logs(&mut self, _: &Device) -> Result<String> {
            Ok("test".into())
        }
    }
    #[test]
    fn concurrent_profiles_queue_restart_and_delete_mock_only() {
        let dir = tempfile::tempdir().unwrap();
        let mut m = Manager::open(dir.path(), Fake::default()).unwrap();
        let a = m.create(crate::model::sample()).unwrap();
        let b = m.clone_profile(a.id, "clone".into()).unwrap();
        let c = m.create(crate::model::sample()).unwrap();
        assert_ne!(a.id, b.id);
        let sa = m.start(a.id).unwrap();
        let sb = m.start(b.id).unwrap();
        assert_ne!(sa.console_port, sb.console_port);
        assert_eq!(m.start(c.id).unwrap().state, DeviceState::Queued);
        assert!(m.delete(a.id).is_err());
        assert!(m.start(a.id).is_err());
        m.stop(a.id).unwrap();
        let states = m.tick().unwrap();
        assert!(states
            .iter()
            .any(|s| s.id == c.id && s.state == DeviceState::Ready));
        assert_eq!(m.status(b.id).unwrap().state, DeviceState::Ready);
        assert_eq!(m.restart(b.id).unwrap().state, DeviceState::Ready);
        m.delete(a.id).unwrap();
        assert_eq!(m.list().unwrap().len(), 2);
    }
    #[test]
    fn storage_controller_lock_prevents_second_manager() {
        let dir = tempfile::tempdir().unwrap();
        let m = Manager::open(dir.path(), Fake::default()).unwrap();
        assert!(Manager::open(dir.path(), Fake::default()).is_err());
        drop(m);
        assert!(Manager::open(dir.path(), Fake::default()).is_ok());
    }
}
