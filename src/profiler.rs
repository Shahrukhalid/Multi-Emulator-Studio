use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PerformanceSample {
    pub timestamp_ms: u64,
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_dalvik_mb: u64,
    pub ram_native_mb: u64,
    pub ram_graphics_mb: u64,
    pub fps: f32,
    pub jank_frames: u32,
    pub battery_temp_c: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PerformanceProfileReport {
    pub device_id: String,
    pub samples: Vec<PerformanceSample>,
    pub avg_cpu_percent: f32,
    pub peak_cpu_percent: f32,
    pub avg_fps: f32,
    pub total_jank_frames: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Default, Clone)]
pub struct ProfilerEngine {
    // Stores the last 120 samples per device (e.g. 2 minutes at 1 Hz)
    buffer: Arc<Mutex<HashMap<String, Vec<PerformanceSample>>>>,
}

impl ProfilerEngine {
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn record_sample(&self, device_id: &str, sample: PerformanceSample) {
        let mut map = self.buffer.lock().unwrap_or_else(|e| e.into_inner());
        let list = map.entry(device_id.to_string()).or_default();
        list.push(sample);
        if list.len() > 120 {
            list.remove(0);
        }
    }

    pub fn get_samples(&self, device_id: &str) -> Vec<PerformanceSample> {
        let map = self.buffer.lock().unwrap_or_else(|e| e.into_inner());
        map.get(device_id).cloned().unwrap_or_default()
    }

    pub fn get_report(&self, device_id: &str) -> PerformanceProfileReport {
        let samples = self.get_samples(device_id);
        if samples.is_empty() {
            return PerformanceProfileReport {
                device_id: device_id.to_string(),
                samples: Vec::new(),
                avg_cpu_percent: 0.0,
                peak_cpu_percent: 0.0,
                avg_fps: 60.0,
                total_jank_frames: 0,
                duration_ms: 0,
            };
        }

        let mut sum_cpu = 0.0;
        let mut peak_cpu: f32 = 0.0;
        let mut sum_fps = 0.0;
        let mut total_jank = 0;

        for s in &samples {
            sum_cpu += s.cpu_percent;
            if s.cpu_percent > peak_cpu {
                peak_cpu = s.cpu_percent;
            }
            sum_fps += s.fps;
            total_jank += s.jank_frames;
        }

        let n = samples.len() as f32;
        let first = samples.first().map(|s| s.timestamp_ms).unwrap_or(0);
        let last = samples.last().map(|s| s.timestamp_ms).unwrap_or(0);
        let duration = last.saturating_sub(first);

        PerformanceProfileReport {
            device_id: device_id.to_string(),
            samples,
            avg_cpu_percent: sum_cpu / n,
            peak_cpu_percent: peak_cpu,
            avg_fps: sum_fps / n,
            total_jank_frames: total_jank,
            duration_ms: duration,
        }
    }

    pub fn export_csv(&self, device_id: &str) -> String {
        let samples = self.get_samples(device_id);
        let mut csv = String::from(
            "timestamp_ms,cpu_percent,ram_used_mb,ram_total_mb,ram_dalvik_mb,ram_native_mb,ram_graphics_mb,fps,jank_frames,battery_temp_c\n"
        );
        for s in samples {
            csv.push_str(&format!(
                "{},{:.2},{},{},{},{},{},{:.1},{},{:.1}\n",
                s.timestamp_ms,
                s.cpu_percent,
                s.ram_used_mb,
                s.ram_total_mb,
                s.ram_dalvik_mb,
                s.ram_native_mb,
                s.ram_graphics_mb,
                s.fps,
                s.jank_frames,
                s.battery_temp_c
            ));
        }
        csv
    }

    pub fn create_mock_sample(device_id: &str, ram_total_mb: u64) -> PerformanceSample {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let hash_seed = device_id
            .bytes()
            .fold(0u32, |acc, b| acc.wrapping_add(b as u32));
        let tick = (now_ms / 1000) as u32;

        let cpu = 12.0 + ((hash_seed.wrapping_add(tick * 3)) % 25) as f32;
        let total = if ram_total_mb > 0 { ram_total_mb } else { 4096 };
        let used = (total as f32 * (0.38 + (((tick % 10) as f32) * 0.01))) as u64;
        let dalvik = (used as f32 * 0.42) as u64;
        let native = (used as f32 * 0.35) as u64;
        let graphics = used.saturating_sub(dalvik + native);

        let fps = 58.0 + (((tick % 5) as f32) * 0.5);
        let jank = if tick.is_multiple_of(12) { 1 } else { 0 };
        let temp = 31.5 + (((tick % 6) as f32) * 0.3);

        PerformanceSample {
            timestamp_ms: now_ms,
            cpu_percent: cpu,
            ram_used_mb: used,
            ram_total_mb: total,
            ram_dalvik_mb: dalvik,
            ram_native_mb: native,
            ram_graphics_mb: graphics,
            fps,
            jank_frames: jank,
            battery_temp_c: temp,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_sample_and_report() {
        let engine = ProfilerEngine::new();
        assert_eq!(engine.get_samples("dev-1").len(), 0);

        let sample1 = PerformanceSample {
            timestamp_ms: 1000,
            cpu_percent: 20.0,
            ram_used_mb: 2000,
            ram_total_mb: 4096,
            ram_dalvik_mb: 800,
            ram_native_mb: 700,
            ram_graphics_mb: 500,
            fps: 60.0,
            jank_frames: 0,
            battery_temp_c: 32.0,
        };
        let sample2 = PerformanceSample {
            timestamp_ms: 2000,
            cpu_percent: 40.0,
            ram_used_mb: 2100,
            ram_total_mb: 4096,
            ram_dalvik_mb: 850,
            ram_native_mb: 750,
            ram_graphics_mb: 500,
            fps: 56.0,
            jank_frames: 2,
            battery_temp_c: 32.5,
        };

        engine.record_sample("dev-1", sample1);
        engine.record_sample("dev-1", sample2);

        let report = engine.get_report("dev-1");
        assert_eq!(report.samples.len(), 2);
        assert!((report.avg_cpu_percent - 30.0).abs() < 0.01);
        assert!((report.peak_cpu_percent - 40.0).abs() < 0.01);
        assert!((report.avg_fps - 58.0).abs() < 0.01);
        assert_eq!(report.total_jank_frames, 2);
        assert_eq!(report.duration_ms, 1000);
    }

    #[test]
    fn test_export_csv() {
        let engine = ProfilerEngine::new();
        engine.record_sample(
            "dev-1",
            PerformanceSample {
                timestamp_ms: 1000,
                cpu_percent: 15.5,
                ram_used_mb: 1500,
                ram_total_mb: 4096,
                ram_dalvik_mb: 600,
                ram_native_mb: 500,
                ram_graphics_mb: 400,
                fps: 59.5,
                jank_frames: 1,
                battery_temp_c: 30.5,
            },
        );

        let csv = engine.export_csv("dev-1");
        assert!(csv.starts_with("timestamp_ms,cpu_percent,"));
        assert!(csv.contains("1000,15.50,1500,4096,600,500,400,59.5,1,30.5"));
    }

    #[test]
    fn test_buffer_capacity_limit() {
        let engine = ProfilerEngine::new();
        for i in 0..150 {
            engine.record_sample(
                "dev-overflow",
                PerformanceSample {
                    timestamp_ms: i as u64,
                    cpu_percent: 10.0,
                    ram_used_mb: 1000,
                    ram_total_mb: 4096,
                    ram_dalvik_mb: 400,
                    ram_native_mb: 300,
                    ram_graphics_mb: 300,
                    fps: 60.0,
                    jank_frames: 0,
                    battery_temp_c: 30.0,
                },
            );
        }
        let samples = engine.get_samples("dev-overflow");
        assert_eq!(samples.len(), 120);
        assert_eq!(samples.first().unwrap().timestamp_ms, 30);
        assert_eq!(samples.last().unwrap().timestamp_ms, 149);
    }
}
