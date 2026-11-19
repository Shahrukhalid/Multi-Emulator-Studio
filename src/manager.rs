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
        let mut statuses = Vec::new();
        for d in self.store.list()? {
            if !self.queue.contains(&d.id) {
                statuses.push(self.engine.status(&d)?);
            }
        }
        while let Some(id) = self.queue.front().copied() {
            let s = self.start(id)?;
            let queued = s.state == DeviceState::Queued;
            statuses.push(s);
            if queued {
                break;
            }
        }
        Ok(statuses)
    }
}
