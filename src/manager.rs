use crate::{
    model::{Device, DeviceSpec, DeviceState, Status},
    runtime::Engine,
    storage::Store,
    Result,
};
use std::{
    collections::{HashMap, VecDeque},
    fs::{File, OpenOptions},
    path::Path,
};
use uuid::Uuid;

pub struct Manager<E: Engine> {
    store: Store,
    engine: E,
    _lock: File,
    queue: VecDeque<Uuid>,
    failed_starts: HashMap<Uuid, String>,
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
            failed_starts: HashMap::new(),
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
        self.failed_starts.remove(&id);
        let device = self.store.get(id)?;
        let status = match self.engine.start(&device) {
            Ok(status) => status,
            Err(err) => {
                if self.queue.contains(&id) {
                    self.queue.retain(|queued| *queued != id);
                    self.failed_starts.insert(id, err.to_string());
                }
                return Err(err);
            }
        };
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
        self.failed_starts.remove(&id);
        self.queue.retain(|x| *x != id);
        self.engine.stop(&self.store.get(id)?)
    }
    pub fn restart(&mut self, id: Uuid) -> Result<Status> {
        self.stop(id)?;
        self.start(id)
    }
    pub fn status(&mut self, id: Uuid) -> Result<Status> {
        if let Some(message) = self.failed_starts.get(&id) {
            return Ok(Status {
                id,
                state: DeviceState::Unknown,
                pid: None,
                console_port: None,
                addresses: vec![],
                diagnostic: Some(message.clone()),
            });
        }
        if self.queue.contains(&id) {
            return Ok(Status {
                id,
                state: DeviceState::Queued,
                pid: None,
                console_port: None,
                addresses: vec![],
                diagnostic: None,
            });
        }
        self.engine.status(&self.store.get(id)?)
    }
    pub fn delete(&mut self, id: Uuid) -> Result<()> {
        self.failed_starts.remove(&id);
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
    pub fn rename(&self, id: Uuid, name: String) -> Result<Device> {
        self.store.rename(id, name)
    }
    pub fn install_apk(&mut self, id: Uuid, path: &Path) -> Result<()> {
        self.engine.install_apk(&self.store.get(id)?, path)
    }
    pub fn logs(&mut self, id: Uuid) -> Result<String> {
        self.engine.logs(&self.store.get(id)?)
    }
    pub fn screen(&mut self, id: Uuid) -> Result<crate::runtime::ScreenFrame> {
        self.engine.screen(&self.store.get(id)?)
    }
    pub fn screen_png(&mut self, id: Uuid) -> Result<Vec<u8>> {
        self.engine.screen_png(&self.store.get(id)?)
    }
    pub fn video_start(&mut self, id: Uuid) -> Result<Uuid> {
        self.engine.video_start(&self.store.get(id)?)
    }
    pub fn video_read(&mut self, id: Uuid, token: Uuid) -> Result<Vec<u8>> {
        self.engine.video_read(&self.store.get(id)?, token)
    }
    pub fn video_stop(&mut self, id: Uuid, token: Uuid) -> Result<()> {
        self.engine.video_stop(&self.store.get(id)?, token)
    }
    pub fn google_apps(&mut self, id: Uuid) -> Result<crate::runtime::GoogleApps> {
        self.engine.google_apps(&self.store.get(id)?)
    }
    pub fn open_youtube_store(&mut self, id: Uuid) -> Result<()> {
        self.engine.open_youtube_store(&self.store.get(id)?)
    }
    pub fn navigate(&mut self, id: Uuid, key: crate::runtime::NavigationKey) -> Result<()> {
        self.engine.navigate(&self.store.get(id)?, key)
    }
    pub fn touch(&mut self, id: Uuid, input: crate::runtime::TouchInput) -> Result<()> {
        self.engine.touch(&self.store.get(id)?, input)
    }
    /// Poll all profiles and admit queued starts in FIFO order.
    pub fn tick(&mut self) -> Result<Vec<Status>> {
        let mut statuses = self.snapshot()?;
        while let Some(id) = self.queue.front().copied() {
            let s = match self.start(id) {
                Ok(s) => s,
                Err(err) => {
                    self.queue.retain(|queued| *queued != id);
                    self.failed_starts.insert(id, err.to_string());
                    Self::unavailable_status(id, err)
                }
            };
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
            statuses.push(match self.status(d.id) {
                Ok(s) => s,
                Err(err) => Self::unavailable_status(d.id, err),
            });
        }
        Ok(statuses)
    }
    fn unavailable_status(id: Uuid, err: crate::Error) -> Status {
        Status {
            id,
            state: DeviceState::Unknown,
            pid: None,
            console_port: None,
            addresses: vec![],
            diagnostic: Some(err.to_string()),
        }
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
        fail_start: HashSet<Uuid>,
        fail_status: HashSet<Uuid>,
    }
    impl Engine for Fake {
        fn create(&mut self, d: &Device) -> Result<()> {
            assert!(self.created.insert(d.id));
            Ok(())
        }
        fn start(&mut self, d: &Device) -> Result<Status> {
            if self.fail_start.contains(&d.id) {
                return Err(Error::Runtime("mock start failed".into()));
            }
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
                    diagnostic: None,
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
            if self.fail_status.contains(&d.id) {
                return Err(Error::Timeout("mock status failed".into()));
            }
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
                diagnostic: None,
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
    #[test]
    fn rename_preserves_device_identity_and_running_instance() {
        let dir = tempfile::tempdir().unwrap();
        let mut m = Manager::open(dir.path(), Fake::default()).unwrap();
        let original = m.create(crate::model::sample()).unwrap();
        let before = m.start(original.id).unwrap();
        let renamed = m.rename(original.id, "New name".into()).unwrap();
        assert_eq!(renamed.id, original.id);
        assert_eq!(renamed.avd_name(), original.avd_name());
        let mut expected = original.spec;
        expected.name = "New name".into();
        assert_eq!(renamed.spec, expected);
        assert_eq!(m.list().unwrap(), vec![renamed]);
        assert_eq!(
            m.status(original.id).unwrap().console_port,
            before.console_port
        );
        assert!(m.rename(original.id, " ".into()).is_err());
        assert_eq!(m.list().unwrap()[0].spec.name, "New name");
    }
    #[test]
    fn failed_status_and_queued_start_do_not_block_other_devices() {
        let dir = tempfile::tempdir().unwrap();
        let mut m = Manager::open(dir.path(), Fake::default()).unwrap();
        let a = m.create(crate::model::sample()).unwrap();
        let b = m.create(crate::model::sample()).unwrap();
        let c = m.create(crate::model::sample()).unwrap();
        let d = m.create(crate::model::sample()).unwrap();
        m.start(a.id).unwrap();
        m.start(b.id).unwrap();
        assert_eq!(m.start(c.id).unwrap().state, DeviceState::Queued);
        assert_eq!(m.start(d.id).unwrap().state, DeviceState::Queued);
        m.engine.fail_start.insert(c.id);
        m.engine.fail_status.insert(b.id);
        m.stop(a.id).unwrap();
        let statuses = m.tick().unwrap();
        assert!(statuses
            .iter()
            .any(|s| s.id == b.id && s.diagnostic.is_some()));
        assert!(statuses
            .iter()
            .any(|s| s.id == c.id && s.diagnostic.is_some()));
        assert!(statuses
            .iter()
            .any(|s| s.id == d.id && s.state == DeviceState::Ready));
        assert!(m.status(c.id).unwrap().diagnostic.is_some());
        assert!(!m.queue.contains(&c.id));
    }
    #[test]
    fn explicit_failed_retry_is_removed_from_queue() {
        let dir = tempfile::tempdir().unwrap();
        let mut m = Manager::open(dir.path(), Fake::default()).unwrap();
        let a = m.create(crate::model::sample()).unwrap();
        let b = m.create(crate::model::sample()).unwrap();
        let c = m.create(crate::model::sample()).unwrap();
        m.start(a.id).unwrap();
        m.start(b.id).unwrap();
        assert_eq!(m.start(c.id).unwrap().state, DeviceState::Queued);
        m.engine.fail_start.insert(c.id);
        assert!(m.start(c.id).is_err());
        assert!(!m.queue.contains(&c.id));
        assert!(m.status(c.id).unwrap().diagnostic.is_some());
        m.stop(a.id).unwrap();
        m.engine.fail_start.remove(&c.id);
        m.tick().unwrap();
        assert!(!m.engine.active.contains_key(&c.id));
        assert_eq!(m.start(c.id).unwrap().state, DeviceState::Ready);
    }
}
