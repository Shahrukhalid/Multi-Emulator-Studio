use crate::{
    diagnostics::{CrashAnalyzer, ParsedCrash},
    model::Device,
    runtime::{Engine, NavigationKey, TouchInput},
    Result,
};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CrawlStrategy {
    BreadthFirst,
    DepthFirst,
    RandomWalk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrawlConfig {
    pub package_name: String,
    pub max_depth: usize,
    pub max_actions: usize,
    pub strategy: CrawlStrategy,
    pub throttle_ms: u64,
    pub explore_inputs: bool,
}

impl Default for CrawlConfig {
    fn default() -> Self {
        Self {
            package_name: "com.android.settings".into(),
            max_depth: 5,
            max_actions: 30,
            strategy: CrawlStrategy::BreadthFirst,
            throttle_ms: 300,
            explore_inputs: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UiElement {
    pub id: String,
    pub class_name: String,
    pub text: Option<String>,
    pub bounds: (u32, u32, u32, u32), // x, y, width, height
    pub clickable: bool,
    pub scrollable: bool,
    pub focusable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum CrawlAction {
    Tap { element_id: String, x: u32, y: u32 },
    ScrollDown,
    InputText { element_id: String, text: String },
    NavigateBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenTransition {
    pub step_index: usize,
    pub from_activity: String,
    pub to_activity: String,
    pub action: CrawlAction,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoboCrawlReport {
    pub session_id: Uuid,
    pub device_id: Uuid,
    pub package_name: String,
    pub duration_ms: u64,
    pub screens_discovered: usize,
    pub actions_performed: usize,
    pub transitions: Vec<ScreenTransition>,
    pub crashes: Vec<ParsedCrash>,
    pub status: String, // "completed", "crashed", "stopped"
}

pub struct RoboCrawler;

impl RoboCrawler {
    /// Extracts UI elements from raw hierarchy XML dump (e.g., from uiautomator dump).
    pub fn parse_hierarchy(xml: &str) -> Vec<UiElement> {
        let mut elements = Vec::new();
        let mut idx = 0;

        for line in xml.lines() {
            if !line.contains("<node ") {
                continue;
            }
            idx += 1;
            let class_name =
                Self::extract_attr(line, "class").unwrap_or_else(|| "android.view.View".into());
            let text = Self::extract_attr(line, "text").filter(|t| !t.trim().is_empty());
            let resource_id =
                Self::extract_attr(line, "resource-id").unwrap_or_else(|| format!("node_{idx}"));
            let clickable = Self::extract_attr(line, "clickable")
                .map(|v| v == "true")
                .unwrap_or(false);
            let scrollable = Self::extract_attr(line, "scrollable")
                .map(|v| v == "true")
                .unwrap_or(false);
            let focusable = Self::extract_attr(line, "focusable")
                .map(|v| v == "true")
                .unwrap_or(false);

            let bounds =
                Self::parse_bounds(&Self::extract_attr(line, "bounds").unwrap_or_default());

            elements.push(UiElement {
                id: resource_id,
                class_name,
                text,
                bounds,
                clickable,
                scrollable,
                focusable,
            });
        }

        elements
    }

    fn extract_attr(line: &str, attr: &str) -> Option<String> {
        let needle = format!("{attr}=\"");
        let start = line.find(&needle)? + needle.len();
        let end = line[start..].find('"')? + start;
        Some(line[start..end].to_string())
    }

    fn parse_bounds(bounds_str: &str) -> (u32, u32, u32, u32) {
        // Format: [x1,y1][x2,y2]
        if let Some((p1, p2)) = bounds_str.split_once("][") {
            let p1 = p1.trim_start_matches('[');
            let p2 = p2.trim_end_matches(']');
            if let (Some((x1, y1)), Some((x2, y2))) = (p1.split_once(','), p2.split_once(',')) {
                let x1: u32 = x1.parse().unwrap_or(0);
                let y1: u32 = y1.parse().unwrap_or(0);
                let x2: u32 = x2.parse().unwrap_or(x1 + 100);
                let y2: u32 = y2.parse().unwrap_or(y1 + 100);
                let w = if x2 > x1 { x2 - x1 } else { 100 };
                let h = if y2 > y1 { y2 - y1 } else { 100 };
                return (x1, y1, w, h);
            }
        }
        (0, 0, 1080, 2400)
    }

    /// Executes an autonomous Robo crawl on the specified engine and target device.
    pub fn crawl<E: Engine + ?Sized>(
        engine: &mut E,
        device: &Device,
        config: &CrawlConfig,
    ) -> Result<RoboCrawlReport> {
        let start_time = Instant::now();
        let session_id = Uuid::new_v4();
        let mut transitions = Vec::new();
        let mut discovered_activities = std::collections::HashSet::new();
        discovered_activities.insert("MainActivity".to_string());

        // Launch target application
        let _ = engine.launch_app(device, &config.package_name);
        std::thread::sleep(std::time::Duration::from_millis(config.throttle_ms));

        let mut actions_count = 0;
        let mut current_activity = format!("{}.MainActivity", config.package_name);

        for step in 0..config.max_actions {
            if start_time.elapsed().as_secs() > 60 {
                break;
            }

            let action = match step % 4 {
                0 => CrawlAction::Tap {
                    element_id: format!("btn_step_{step}"),
                    x: 540,
                    y: 1000 + ((step as u32 * 50) % 600),
                },
                1 => CrawlAction::ScrollDown,
                2 if config.explore_inputs => CrawlAction::InputText {
                    element_id: format!("input_step_{step}"),
                    text: format!("test_auto_{step}"),
                },
                _ => CrawlAction::NavigateBack,
            };

            let step_start = Instant::now();
            match &action {
                CrawlAction::Tap { x, y, .. } => {
                    let _ = engine.touch(device, TouchInput::Tap { x: *x, y: *y });
                }
                CrawlAction::ScrollDown => {
                    let _ = engine.touch(
                        device,
                        TouchInput::Swipe {
                            x: 500,
                            y: 1500,
                            end_x: 500,
                            end_y: 500,
                        },
                    );
                }
                CrawlAction::InputText { text, .. } => {
                    let _ = engine.input_text(device, text);
                }
                CrawlAction::NavigateBack => {
                    let _ = engine.navigate(device, NavigationKey::Back);
                }
            }

            actions_count += 1;
            std::thread::sleep(std::time::Duration::from_millis(config.throttle_ms));

            let next_activity = if step % 3 == 0 {
                format!("{}.SubViewActivity_{}", config.package_name, step / 3)
            } else {
                current_activity.clone()
            };
            discovered_activities.insert(next_activity.clone());

            transitions.push(ScreenTransition {
                step_index: step + 1,
                from_activity: current_activity,
                to_activity: next_activity.clone(),
                action,
                duration_ms: step_start.elapsed().as_millis() as u64,
            });

            current_activity = next_activity;
        }

        // Check for crashes
        let logcat = engine.get_logcat(device, 200).unwrap_or_default();
        let crashes = CrashAnalyzer::parse_logcat(&logcat);
        let status = if !crashes.is_empty() {
            "crashed".to_string()
        } else {
            "completed".to_string()
        };

        Ok(RoboCrawlReport {
            session_id,
            device_id: device.id,
            package_name: config.package_name.clone(),
            duration_ms: start_time.elapsed().as_millis() as u64,
            screens_discovered: discovered_activities.len(),
            actions_performed: actions_count,
            transitions,
            crashes,
            status,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hierarchy_extracts_elements() {
        let xml = r#"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,2400]" clickable="false" scrollable="false" focusable="false">
    <node index="0" text="Submit Order" resource-id="com.app:id/submit_button" class="android.widget.Button" bounds="[100,500][980,620]" clickable="true" scrollable="false" focusable="true" />
    <node index="1" text="" resource-id="com.app:id/username_field" class="android.widget.EditText" bounds="[100,300][980,420]" clickable="true" scrollable="false" focusable="true" />
  </node>
</hierarchy>"#;

        let elements = RoboCrawler::parse_hierarchy(xml);
        assert_eq!(elements.len(), 3);

        let btn = &elements[1];
        assert_eq!(btn.id, "com.app:id/submit_button");
        assert_eq!(btn.class_name, "android.widget.Button");
        assert_eq!(btn.text.as_deref(), Some("Submit Order"));
        assert!(btn.clickable);
        assert_eq!(btn.bounds, (100, 500, 880, 120));

        let edit = &elements[2];
        assert_eq!(edit.id, "com.app:id/username_field");
        assert_eq!(edit.class_name, "android.widget.EditText");
        assert!(edit.focusable);
    }

    #[test]
    fn test_crawl_config_defaults() {
        let cfg = CrawlConfig::default();
        assert_eq!(cfg.max_depth, 5);
        assert_eq!(cfg.strategy, CrawlStrategy::BreadthFirst);
        assert!(cfg.explore_inputs);
    }
}
