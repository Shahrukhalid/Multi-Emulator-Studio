//! Bounded in-memory capture from the selected local emulator. No recording files or network listener.
use crate::{Error, Result};
use std::{
    io::Read,
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver, TryRecvError},
    time::{Duration, Instant},
};
use uuid::Uuid;

pub struct Capture {
    pub token: Uuid,
    child: Child,
    chunks: Receiver<Vec<u8>>,
    started: Instant,
    last_read: Instant,
}

impl Capture {
    pub fn start(command: &mut Command) -> Result<Self> {
        let mut child = command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let Some(mut output) = child.stdout.take() else {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::Runtime("Video pipe unavailable".into()));
        };
        let (sender, chunks) = mpsc::sync_channel(16);
        // Do not drop encoded bytes: if the consumer falls behind, end the stream and fall back.
        if let Err(err) = std::thread::Builder::new()
            .name("android-video-reader".into())
            .spawn(move || {
                let mut block = [0u8; 32 * 1024];
                while let Ok(size) = output.read(&mut block) {
                    if size == 0 || sender.try_send(block[..size].to_vec()).is_err() {
                        break;
                    }
                }
            })
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err(err.into());
        }
        Ok(Self {
            token: Uuid::new_v4(),
            child,
            chunks,
            started: Instant::now(),
            last_read: Instant::now(),
        })
    }
    pub fn expired(&self) -> bool {
        self.started.elapsed() > Duration::from_secs(35)
            || self.last_read.elapsed() > Duration::from_secs(5)
    }
    // Protocol: 0 = no data yet, 1 = raw Annex-B bytes following, 2 = end.
    pub fn read(&mut self) -> Vec<u8> {
        if self.expired() {
            return vec![2];
        }
        self.last_read = Instant::now();
        match self.chunks.try_recv() {
            Ok(bytes) => {
                let mut data = Vec::with_capacity(bytes.len() + 1);
                data.push(1);
                data.extend_from_slice(&bytes);
                data
            }
            Err(TryRecvError::Empty) => vec![0],
            Err(TryRecvError::Disconnected) => vec![2],
        }
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(all(test, unix))]
#[test]
fn bounded_capture_delivers_binary_and_end() {
    let mut capture =
        Capture::start(std::process::Command::new("/bin/sh").args(["-c", "printf 'video'"]))
            .unwrap();
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut data = Vec::new();
    loop {
        let chunk = capture.read();
        match chunk[0] {
            1 => data.extend_from_slice(&chunk[1..]),
            2 => break,
            _ => {}
        };
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(5));
    }
    assert_eq!(data, b"video");
}
