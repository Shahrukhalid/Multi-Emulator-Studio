use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BiometricType {
    Fingerprint,
    FaceId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum BiometricAction {
    Match {
        #[serde(default = "default_finger_id")]
        finger_id: u32,
    },
    Unmatch,
    Enroll {
        enrolled: bool,
    },
}

fn default_finger_id() -> u32 {
    1
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatteryState {
    pub capacity: u32, // 0 to 100
    pub charging: bool,
    pub status: String, // "charging", "discharging", "full", "not-charging"
    pub health: String, // "good", "overheat", "dead", "overvoltage"
}

impl Default for BatteryState {
    fn default() -> Self {
        Self {
            capacity: 85,
            charging: true,
            status: "charging".into(),
            health: "good".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "sensor", rename_all = "snake_case")]
pub enum SensorUpdate {
    Accelerometer { x: f32, y: f32, z: f32 },
    Gyroscope { x: f32, y: f32, z: f32 },
    Proximity { distance_cm: f32 },
    Light { lux: f32 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceSensorState {
    pub battery: BatteryState,
    pub accelerometer: (f32, f32, f32),
    pub gyroscope: (f32, f32, f32),
    pub proximity_cm: f32,
    pub light_lux: f32,
    pub fingerprint_enrolled: bool,
}

impl Default for DeviceSensorState {
    fn default() -> Self {
        Self {
            battery: BatteryState::default(),
            accelerometer: (0.0, 9.81, 0.0), // Portrait upright
            gyroscope: (0.0, 0.0, 0.0),
            proximity_cm: 5.0,
            light_lux: 400.0,
            fingerprint_enrolled: true,
        }
    }
}

pub struct SensorSimulator;

impl SensorSimulator {
    /// Accelerometer preset: Phone resting flat on table
    pub fn preset_flat() -> SensorUpdate {
        SensorUpdate::Accelerometer {
            x: 0.0,
            y: 0.0,
            z: 9.81,
        }
    }

    /// Accelerometer preset: Phone held upright in portrait
    pub fn preset_portrait() -> SensorUpdate {
        SensorUpdate::Accelerometer {
            x: 0.0,
            y: 9.81,
            z: 0.0,
        }
    }

    /// Accelerometer preset: Phone tilted horizontally in landscape
    pub fn preset_landscape() -> SensorUpdate {
        SensorUpdate::Accelerometer {
            x: 9.81,
            y: 0.0,
            z: 0.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_battery_state_serialization() {
        let battery = BatteryState {
            capacity: 50,
            charging: false,
            status: "discharging".into(),
            health: "good".into(),
        };
        let json = serde_json::to_string(&battery).unwrap();
        assert!(json.contains("\"capacity\":50"));
        assert!(json.contains("\"charging\":false"));
    }

    #[test]
    fn test_sensor_update_serialization() {
        let sensor = SensorUpdate::Accelerometer {
            x: 1.0,
            y: 2.0,
            z: 9.8,
        };
        let json = serde_json::to_string(&sensor).unwrap();
        assert!(json.contains("\"sensor\":\"accelerometer\""));
        assert!(json.contains("\"z\":9.8"));
    }

    #[test]
    fn test_biometric_action_roundtrip() {
        let action = BiometricAction::Match { finger_id: 2 };
        let json = serde_json::to_string(&action).unwrap();
        assert!(json.contains("\"action\":\"match\""));
        assert!(json.contains("\"finger_id\":2"));
    }
}
