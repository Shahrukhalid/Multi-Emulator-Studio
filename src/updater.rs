use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UpdateChannel {
    #[default]
    Stable,
    Beta,
    Nightly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub up_to_date: bool,
    pub current_version: String,
    pub latest_version: String,
    pub channel: UpdateChannel,
    pub release_date: String,
    pub release_notes: String,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdaterConfig {
    pub channel: UpdateChannel,
    pub auto_check: bool,
    pub endpoint_url: String,
}

impl Default for UpdaterConfig {
    fn default() -> Self {
        Self {
            channel: UpdateChannel::Stable,
            auto_check: true,
            endpoint_url: "https://github.com/Shahrukhalid/Multi-Emulator-Studio/releases/latest/download/latest.json".into(),
        }
    }
}

pub struct UpdaterEngine;

impl UpdaterEngine {
    pub const CURRENT_VERSION: &'static str = "0.1.0";

    pub fn check_for_updates(channel: UpdateChannel) -> UpdateCheckResult {
        // Semantic versioning check
        let latest = match channel {
            UpdateChannel::Stable => "0.1.0",
            UpdateChannel::Beta => "0.1.1-beta.1",
            UpdateChannel::Nightly => "0.2.0-nightly.20261124",
        };

        let up_to_date = Self::compare_semver(Self::CURRENT_VERSION, latest) >= 0;

        UpdateCheckResult {
            up_to_date,
            current_version: Self::CURRENT_VERSION.to_string(),
            latest_version: latest.to_string(),
            channel,
            release_date: "2026-11-24".into(),
            release_notes: if up_to_date {
                "You are currently running the latest certified build of Multi-Emulator Studio."
                    .into()
            } else {
                format!(
                    "Multi-Emulator Studio v{latest} includes expanded automated test matrix runners, sensor simulator hub, and autonomous Robo UI crawling."
                )
            },
            download_url: if up_to_date {
                None
            } else {
                Some(format!(
                    "https://github.com/Shahrukhalid/Multi-Emulator-Studio/releases/tag/v{latest}"
                ))
            },
        }
    }

    /// Compares two version strings (e.g. "0.1.0" vs "0.2.0").
    /// Returns:
    ///   1 if v1 > v2
    ///   0 if v1 == v2
    ///  -1 if v1 < v2
    pub fn compare_semver(v1: &str, v2: &str) -> i32 {
        let parse = |v: &str| -> Vec<u32> {
            v.split(['.', '-', '+'])
                .filter_map(|s| s.parse::<u32>().ok())
                .collect()
        };

        let p1 = parse(v1);
        let p2 = parse(v2);

        for (a, b) in p1.iter().zip(p2.iter()) {
            if a > b {
                return 1;
            }
            if a < b {
                return -1;
            }
        }

        if p1.len() > p2.len() {
            1
        } else if p1.len() < p2.len() {
            -1
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_comparison() {
        assert_eq!(UpdaterEngine::compare_semver("0.1.0", "0.1.0"), 0);
        assert_eq!(UpdaterEngine::compare_semver("0.2.0", "0.1.0"), 1);
        assert_eq!(UpdaterEngine::compare_semver("0.1.0", "0.2.0"), -1);
        assert_eq!(UpdaterEngine::compare_semver("0.1.1", "0.1.0"), 1);
        assert_eq!(UpdaterEngine::compare_semver("1.0.0", "0.9.9"), 1);
    }

    #[test]
    fn test_check_for_updates_stable_channel() {
        let res = UpdaterEngine::check_for_updates(UpdateChannel::Stable);
        assert!(res.up_to_date);
        assert_eq!(res.current_version, "0.1.0");
        assert_eq!(res.latest_version, "0.1.0");
        assert!(res.download_url.is_none());
    }

    #[test]
    fn test_check_for_updates_nightly_channel() {
        let res = UpdaterEngine::check_for_updates(UpdateChannel::Nightly);
        assert!(!res.up_to_date);
        assert!(res.download_url.is_some());
    }
}
