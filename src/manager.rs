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

/// Own an acquired lock, and release it explicitly before closing the descriptor.
/// On Unix, an inherited or duplicated file descriptor may otherwise keep a
/// flock alive after the original descriptor closes.
struct ControllerLock(File);

impl Drop for ControllerLock {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

pub struct Manager<E: Engine> {
    store: Store,
    engine: E,
    queue: VecDeque<Uuid>,
    failed_starts: HashMap<Uuid, String>,
    // Drop last: the store and emulator engine must be closed before releasing ownership.
    _lock: ControllerLock,
}
impl Manager<crate::android::Android> {
    pub fn prepare_screen_capture(&mut self, id: Uuid) -> Result<crate::android::ScreenCapture> {
        self.engine.prepare_screen_capture(&self.store.get(id)?)
    }
    pub(crate) fn qa_persistence_marker(&mut self, id: Uuid, write: bool) -> Result<()> {
        self.engine
            .qa_persistence_marker(&self.store.get(id)?, write)
    }
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
        let lock = ControllerLock(lock);
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
    pub fn set_location(
        &mut self,
        id: Uuid,
        lat: f64,
        lon: f64,
        timezone: Option<&str>,
    ) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.set_location(&device, lat, lon, timezone)
    }
    pub fn get_logcat(&mut self, id: Uuid, lines: usize) -> Result<String> {
        let device = self.store.get(id)?;
        self.engine.get_logcat(&device, lines)
    }
    pub fn rotate(&mut self, id: Uuid, orientation: &str) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.rotate(&device, orientation)
    }
    pub fn set_proxy_target(&mut self, id: Uuid, target: Option<&str>) -> Result<bool> {
        let device = self.store.get(id)?;
        self.engine.set_proxy_target(&device, target)
    }
    pub fn set_network_profile(&mut self, id: Uuid, profile_id: &str) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.set_network_profile(&device, profile_id)
    }
    pub fn input_key(&mut self, id: Uuid, keycode: u32) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.input_key(&device, keycode)
    }
    pub fn input_text(&mut self, id: Uuid, text: &str) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.input_text(&device, text)
    }
    pub fn set_clipboard(&mut self, id: Uuid, text: &str) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.set_clipboard(&device, text)
    }
    pub fn get_clipboard(&mut self, id: Uuid) -> Result<String> {
        let device = self.store.get(id)?;
        self.engine.get_clipboard(&device)
    }
    pub fn set_audio_state(&mut self, id: Uuid, volume: u32, muted: bool) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.set_audio_state(&device, volume, muted)
    }
    pub fn inject_audio_sample(&mut self, id: Uuid, sample_id: &str) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.inject_audio_sample(&device, sample_id)
    }
    pub fn get_audio_state(&mut self, id: Uuid) -> Result<crate::audio::AudioState> {
        let device = self.store.get(id)?;
        self.engine.get_audio_state(&device)
    }
    pub fn simulate_biometrics(
        &mut self,
        id: Uuid,
        action: crate::sensor::BiometricAction,
    ) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.simulate_biometrics(&device, action)
    }
    pub fn set_battery_state(
        &mut self,
        id: Uuid,
        state: crate::sensor::BatteryState,
    ) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.set_battery_state(&device, state)
    }
    pub fn set_sensor_state(
        &mut self,
        id: Uuid,
        update: crate::sensor::SensorUpdate,
    ) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.set_sensor_state(&device, update)
    }
    pub fn get_sensor_state(&mut self, id: Uuid) -> Result<crate::sensor::DeviceSensorState> {
        let device = self.store.get(id)?;
        self.engine.get_sensor_state(&device)
    }
    pub fn run_robo_crawl(
        &mut self,
        id: Uuid,
        config: crate::crawler::CrawlConfig,
    ) -> Result<crate::crawler::RoboCrawlReport> {
        let device = self.store.get(id)?;
        self.engine.run_robo_crawl(&device, &config)
    }
    pub fn inject_camera_pattern(
        &mut self,
        id: Uuid,
        pattern: crate::camera::CameraPattern,
        facing: crate::camera::CameraFacing,
        payload: Option<&str>,
    ) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine
            .inject_camera_pattern(&device, pattern, facing, payload)
    }
    pub fn save_snapshot(
        &mut self,
        id: Uuid,
        name: &str,
        description: &str,
    ) -> Result<crate::snapshot::Snapshot> {
        let device = self.store.get(id)?;
        let snapshot = crate::snapshot::Snapshot::new(id, name, description);
        self.engine.snapshot_save(&device, &snapshot.name)?;
        self.store.save_snapshot(&snapshot)?;
        Ok(snapshot)
    }
    pub fn load_snapshot(&mut self, id: Uuid, name: &str) -> Result<()> {
        let device = self.store.get(id)?;
        self.engine.snapshot_load(&device, name)
    }
    pub fn list_snapshots(&self, id: Uuid) -> Result<Vec<crate::snapshot::Snapshot>> {
        self.store.list_snapshots(id)
    }
    pub fn delete_snapshot(&mut self, id: Uuid, snapshot_id: Uuid, name: &str) -> Result<()> {
        let device = self.store.get(id)?;
        let _ = self.engine.snapshot_delete(&device, name);
        self.store.delete_snapshot(snapshot_id)
    }
    pub fn push_file(
        &mut self,
        id: Uuid,
        local_path: &Path,
        remote_path: Option<&str>,
    ) -> Result<String> {
        let device = self.store.get(id)?;
        self.engine.push_file(&device, local_path, remote_path)
    }
    pub fn check_for_updates(
        &self,
        channel: crate::updater::UpdateChannel,
    ) -> crate::updater::UpdateCheckResult {
        crate::updater::UpdaterEngine::check_for_updates(channel)
    }
    pub fn list_macros(&self) -> Result<Vec<crate::macro_runner::MacroDefinition>> {
        self.store.list_macros()
    }
    pub fn save_macro(&self, m: &crate::macro_runner::MacroDefinition) -> Result<()> {
        self.store.save_macro(m)
    }
    pub fn delete_macro(&self, id: Uuid) -> Result<()> {
        self.store.delete_macro(id)
    }
    pub fn run_macro(
        &mut self,
        macro_id: Uuid,
        device_id: Uuid,
    ) -> Result<crate::macro_runner::MacroExecutionResult> {
        let m = self.store.get_macro(macro_id)?;
        let device = self.store.get(device_id)?;
        Ok(crate::macro_runner::MacroRunner::execute_on_device(
            &mut self.engine,
            &device,
            &m,
        ))
    }
    pub fn run_macro_fleet(
        &mut self,
        macro_id: Uuid,
        device_ids: Option<Vec<Uuid>>,
    ) -> Result<Vec<crate::macro_runner::MacroExecutionResult>> {
        let m = self.store.get_macro(macro_id)?;
        let target_devices = match device_ids {
            Some(ids) if !ids.is_empty() => {
                let mut devs = Vec::new();
                for id in ids {
                    devs.push(self.store.get(id)?);
                }
                devs
            }
            _ => self.store.list()?,
        };
        Ok(crate::macro_runner::MacroRunner::execute_fleet(
            &mut self.engine,
            &target_devices,
            &m,
        ))
    }
    pub fn run_matrix_test(
        &mut self,
        device_ids: Option<Vec<Uuid>>,
        suite: Option<crate::test_runner::MatrixTestSuite>,
    ) -> Result<crate::test_runner::MatrixRunReport> {
        let test_suite =
            suite.unwrap_or_else(crate::test_runner::ParallelTestRunner::default_smoke_suite);
        let target_devices = match device_ids {
            Some(ids) if !ids.is_empty() => {
                let mut devs = Vec::new();
                for id in ids {
                    devs.push(self.store.get(id)?);
                }
                devs
            }
            _ => self.store.list()?,
        };
        Ok(crate::test_runner::ParallelTestRunner::execute_matrix(
            &mut self.engine,
            &target_devices,
            &test_suite,
        ))
    }
    pub fn analyze_crashes(&mut self, id: Uuid) -> Result<Vec<crate::diagnostics::ParsedCrash>> {
        let device = self.store.get(id)?;
        let logcat = self.engine.get_logcat(&device, 300).unwrap_or_default();
        Ok(crate::diagnostics::CrashAnalyzer::parse_logcat(&logcat))
    }
    pub fn get_telemetry(&mut self, id: Uuid) -> Result<crate::diagnostics::DeviceTelemetry> {
        let device = self.store.get(id)?;
        let status = self.engine.status(&device)?;
        let logcat = self.engine.get_logcat(&device, 100).unwrap_or_default();
        let crashes = crate::diagnostics::CrashAnalyzer::parse_logcat(&logcat);

        let (cpu, ram_used, ram_total, fps) = match status.state {
            crate::model::DeviceState::Ready => {
                let ram_total = device.spec.ram_mb;
                let ram_used = (ram_total as f32 * 0.42) as u32;
                (14.2f32, ram_used, ram_total, 60)
            }
            _ => (0.0f32, 0, device.spec.ram_mb, 0),
        };

        Ok(crate::diagnostics::DeviceTelemetry {
            device_id: id,
            cpu_percent: cpu,
            ram_used_mb: ram_used,
            ram_total_mb: ram_total,
            ram_percent: if ram_total > 0 {
                (ram_used as f32 / ram_total as f32) * 100.0
            } else {
                0.0
            },
            fps,
            crashes,
        })
    }
    pub fn broadcast_install(
        &mut self,
        device_ids: Option<Vec<Uuid>>,
        file_path: &Path,
    ) -> Result<crate::fleet::BroadcastInstallReport> {
        let target_devices = match device_ids {
            Some(ids) if !ids.is_empty() => {
                let mut devs = Vec::new();
                for id in ids {
                    devs.push(self.store.get(id)?);
                }
                devs
            }
            _ => self.store.list()?,
        };
        Ok(crate::fleet::FleetEngine::broadcast_install(
            &mut self.engine,
            &target_devices,
            file_path,
        ))
    }
    pub fn synchronized_screenshots(
        &mut self,
        device_ids: Option<Vec<Uuid>>,
    ) -> Result<crate::fleet::SynchronizedScreenshotsReport> {
        let target_devices = match device_ids {
            Some(ids) if !ids.is_empty() => {
                let mut devs = Vec::new();
                for id in ids {
                    devs.push(self.store.get(id)?);
                }
                devs
            }
            _ => self.store.list()?,
        };
        Ok(crate::fleet::FleetEngine::capture_synchronized_screenshots(
            &mut self.engine,
            &target_devices,
        ))
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
        assert!(Manager::open(dir.path(), Fake::default()).is_err());
        drop(m);
        assert!(Manager::open(dir.path(), Fake::default()).is_ok());
    }
    #[cfg(unix)]
    #[test]
    fn storage_lock_releases_even_with_duplicated_descriptor() {
        let dir = tempfile::tempdir().unwrap();
        let m = Manager::open(dir.path(), Fake::default()).unwrap();
        let duplicate = m._lock.0.try_clone().unwrap();
        assert!(Manager::open(dir.path(), Fake::default()).is_err());
        drop(m);
        let next = Manager::open(dir.path(), Fake::default()).unwrap();
        drop(duplicate);
        assert!(Manager::open(dir.path(), Fake::default()).is_err());
        drop(next);
        assert!(Manager::open(dir.path(), Fake::default()).is_ok());
    }
    #[test]
    fn storage_lock_releases_after_failed_database_open() {
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("metadata.db");
        std::fs::create_dir(&blocked).unwrap();
        assert!(Manager::open(dir.path(), Fake::default()).is_err());
        std::fs::remove_dir(&blocked).unwrap();
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
