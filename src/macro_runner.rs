use crate::{
    model::Device,
    runtime::{Engine, NavigationKey, TouchInput},
    Result,
};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MacroAction {
    Tap {
        x: u32,
        y: u32,
    },
    Swipe {
        x: u32,
        y: u32,
        end_x: u32,
        end_y: u32,
        #[serde(default = "default_swipe_duration")]
        duration_ms: u64,
    },
    Text {
        text: String,
    },
    Key {
        keycode: u32,
        name: Option<String>,
    },
    Navigation {
        key: NavigationKey,
    },
    Sleep {
        duration_ms: u64,
    },
    LaunchApp {
        package: String,
    },
    Screenshot {
        label: String,
    },
}

fn default_swipe_duration() -> u64 {
    250
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroStep {
    pub step_number: usize,
    #[serde(flatten)]
    pub action: MacroAction,
    #[serde(default)]
    pub delay_after_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MacroDefinition {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub steps: Vec<MacroStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroExecutionResult {
    pub macro_id: Uuid,
    pub macro_name: String,
    pub device_id: Uuid,
    pub device_name: String,
    pub status: String,
    pub steps_completed: usize,
    pub total_steps: usize,
    pub duration_ms: u64,
    pub failure_reason: Option<String>,
}

pub struct MacroRunner;

impl MacroRunner {
    pub fn default_macros() -> Vec<MacroDefinition> {
        vec![
            MacroDefinition {
                id: Uuid::from_u128(0x00000000_0000_0000_0000_000000000001),
                name: "App Cold Launch Smoke".into(),
                description: "Launches settings app, waits for render, captures screenshot, and returns home.".into(),
                created_at: "2026-11-24T00:00:00Z".into(),
                steps: vec![
                    MacroStep {
                        step_number: 1,
                        action: MacroAction::LaunchApp { package: "com.android.settings".into() },
                        delay_after_ms: 1200,
                    },
                    MacroStep {
                        step_number: 2,
                        action: MacroAction::Screenshot { label: "App Loaded".into() },
                        delay_after_ms: 300,
                    },
                    MacroStep {
                        step_number: 3,
                        action: MacroAction::Navigation { key: NavigationKey::Home },
                        delay_after_ms: 500,
                    },
                ],
            },
            MacroDefinition {
                id: Uuid::from_u128(0x00000000_0000_0000_0000_000000000002),
                name: "Vertical Feed Infinite Scroll".into(),
                description: "Simulates user scrolling a social or e-commerce feed downward three times.".into(),
                created_at: "2026-11-24T00:00:00Z".into(),
                steps: vec![
                    MacroStep {
                        step_number: 1,
                        action: MacroAction::Swipe { x: 500, y: 1500, end_x: 500, end_y: 500, duration_ms: 250 },
                        delay_after_ms: 600,
                    },
                    MacroStep {
                        step_number: 2,
                        action: MacroAction::Swipe { x: 500, y: 1500, end_x: 500, end_y: 500, duration_ms: 250 },
                        delay_after_ms: 600,
                    },
                    MacroStep {
                        step_number: 3,
                        action: MacroAction::Swipe { x: 500, y: 1500, end_x: 500, end_y: 500, duration_ms: 250 },
                        delay_after_ms: 600,
                    },
                    MacroStep {
                        step_number: 4,
                        action: MacroAction::Screenshot { label: "Scrolled Feed".into() },
                        delay_after_ms: 200,
                    },
                ],
            },
            MacroDefinition {
                id: Uuid::from_u128(0x00000000_0000_0000_0000_000000000003),
                name: "Form Autofill & Submit Sequence".into(),
                description: "Taps form field, inputs text string, and triggers Enter keyevent.".into(),
                created_at: "2026-11-24T00:00:00Z".into(),
                steps: vec![
                    MacroStep {
                        step_number: 1,
                        action: MacroAction::Tap { x: 540, y: 800 },
                        delay_after_ms: 300,
                    },
                    MacroStep {
                        step_number: 2,
                        action: MacroAction::Text { text: "studio_automation@local.test".into() },
                        delay_after_ms: 400,
                    },
                    MacroStep {
                        step_number: 3,
                        action: MacroAction::Key { keycode: 66, name: Some("KEYCODE_ENTER".into()) },
                        delay_after_ms: 600,
                    },
                    MacroStep {
                        step_number: 4,
                        action: MacroAction::Screenshot { label: "Form Submitted".into() },
                        delay_after_ms: 200,
                    },
                ],
            },
        ]
    }

    pub fn execute_on_device<E: Engine>(
        engine: &mut E,
        device: &Device,
        macro_def: &MacroDefinition,
    ) -> MacroExecutionResult {
        let start = Instant::now();
        let total = macro_def.steps.len();
        let mut completed = 0;

        for step in &macro_def.steps {
            let res: Result<()> = match &step.action {
                MacroAction::Tap { x, y } => engine.touch(device, TouchInput::Tap { x: *x, y: *y }),
                MacroAction::Swipe {
                    x, y, end_x, end_y, ..
                } => engine.touch(
                    device,
                    TouchInput::Swipe {
                        x: *x,
                        y: *y,
                        end_x: *end_x,
                        end_y: *end_y,
                    },
                ),
                MacroAction::Text { text } => engine.input_text(device, text),
                MacroAction::Key { keycode, .. } => engine.input_key(device, *keycode),
                MacroAction::Navigation { key } => engine.navigate(device, key.clone()),
                MacroAction::Sleep { duration_ms } => {
                    std::thread::sleep(Duration::from_millis(*duration_ms));
                    Ok(())
                }
                MacroAction::LaunchApp { package } => engine.launch_app(device, package),
                MacroAction::Screenshot { .. } => {
                    let _ = engine.screen_png(device);
                    Ok(())
                }
            };

            if let Err(err) = res {
                return MacroExecutionResult {
                    macro_id: macro_def.id,
                    macro_name: macro_def.name.clone(),
                    device_id: device.id,
                    device_name: device.spec.name.clone(),
                    status: "failed".into(),
                    steps_completed: completed,
                    total_steps: total,
                    duration_ms: start.elapsed().as_millis() as u64,
                    failure_reason: Some(format!("Step {} failed: {}", step.step_number, err)),
                };
            }

            completed += 1;
            if step.delay_after_ms > 0 {
                std::thread::sleep(Duration::from_millis(step.delay_after_ms));
            }
        }

        MacroExecutionResult {
            macro_id: macro_def.id,
            macro_name: macro_def.name.clone(),
            device_id: device.id,
            device_name: device.spec.name.clone(),
            status: "passed".into(),
            steps_completed: completed,
            total_steps: total,
            duration_ms: start.elapsed().as_millis() as u64,
            failure_reason: None,
        }
    }

    pub fn execute_fleet<E: Engine>(
        engine: &mut E,
        devices: &[Device],
        macro_def: &MacroDefinition,
    ) -> Vec<MacroExecutionResult> {
        let mut results = Vec::new();
        for device in devices {
            results.push(Self::execute_on_device(engine, device, macro_def));
        }
        results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_macros_are_well_formed() {
        let list = MacroRunner::default_macros();
        assert_eq!(list.len(), 3);
        for m in list {
            assert!(!m.name.is_empty());
            assert!(!m.steps.is_empty());
            let json = serde_json::to_string(&m).unwrap();
            let parsed: MacroDefinition = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed.id, m.id);
        }
    }

    #[test]
    fn macro_action_json_serialization_roundtrip() {
        let step = MacroStep {
            step_number: 1,
            action: MacroAction::Tap { x: 100, y: 200 },
            delay_after_ms: 150,
        };
        let json = serde_json::to_string(&step).unwrap();
        assert!(json.contains("\"type\":\"tap\""));
        assert!(json.contains("\"x\":100"));
        let parsed: MacroStep = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, step);
    }
}
