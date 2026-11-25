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

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    #[serde(default)]
    pub channel: Option<UpdateChannel>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

pub struct UpdaterEngine;

impl UpdaterEngine {
    pub const CURRENT_VERSION: &'static str = "0.1.0";

    /// Checks the local build against known release metadata without fabricating remote releases.
    pub fn check_for_updates(channel: UpdateChannel) -> UpdateCheckResult {
        UpdateCheckResult {
            up_to_date: true,
            current_version: Self::CURRENT_VERSION.to_string(),
            latest_version: Self::CURRENT_VERSION.to_string(),
            channel,
            release_date: "Current local build".into(),
            release_notes: match channel {
                UpdateChannel::Stable => {
                    "You are running Multi-Emulator Studio v0.1.0 (Stable). No offline update is staged."
                        .into()
                }
                UpdateChannel::Beta => {
                    "Beta channel selected for Multi-Emulator Studio v0.1.0. Connect to a release feed to evaluate beta manifests."
                        .into()
                }
                UpdateChannel::Nightly => {
                    "Nightly channel selected for Multi-Emulator Studio v0.1.0. Connect to a release feed to evaluate nightly manifests."
                        .into()
                }
            },
            download_url: None,
        }
    }

    /// Evaluates a fetched remote release manifest against the running version.
    pub fn evaluate_manifest(
        current_version: &str,
        channel: UpdateChannel,
        manifest_json: &str,
    ) -> Result<UpdateCheckResult, String> {
        let manifest: UpdateManifest = serde_json::from_str(manifest_json)
            .map_err(|e| format!("Invalid update manifest JSON: {e}"))?;
        let latest = manifest.version.trim().trim_start_matches('v').to_string();
        if latest.is_empty() {
            return Err("Update manifest is missing version".into());
        }
        let up_to_date = Self::compare_semver(current_version, &latest) >= 0;
        let download_url = if up_to_date {
            None
        } else {
            manifest.url.filter(|u| !u.trim().is_empty()).or_else(|| {
                Some(format!(
                    "https://github.com/Shahrukhalid/Multi-Emulator-Studio/releases/tag/v{latest}"
                ))
            })
        };

        Ok(UpdateCheckResult {
            up_to_date,
            current_version: current_version.to_string(),
            latest_version: latest.clone(),
            channel: manifest.channel.unwrap_or(channel),
            release_date: manifest
                .release_date
                .unwrap_or_else(|| "Unspecified".to_string()),
            release_notes: manifest.notes.unwrap_or_else(|| {
                if up_to_date {
                    format!("Up to date on v{current_version}.")
                } else {
                    format!("Update available: v{latest}.")
                }
            }),
            download_url,
        })
    }

    /// Compares two semantic version strings (e.g. "0.1.0" vs "0.2.0-beta.1").
    /// Returns:
    ///   1 if v1 > v2
    ///   0 if v1 == v2
    ///  -1 if v1 < v2
    pub fn compare_semver(v1: &str, v2: &str) -> i32 {
        let split_pre = |v: &str| -> (Vec<u32>, Option<String>) {
            let core_and_build = v
                .trim()
                .trim_start_matches('v')
                .split('+')
                .next()
                .unwrap_or("");
            let mut parts = core_and_build.splitn(2, '-');
            let core = parts
                .next()
                .unwrap_or("")
                .split('.')
                .filter_map(|s| s.parse::<u32>().ok())
                .collect::<Vec<_>>();
            let pre = parts.next().map(|s| s.to_string());
            (core, pre)
        };

        let (c1, pre1) = split_pre(v1);
        let (c2, pre2) = split_pre(v2);
        let max_len = c1.len().max(c2.len());
        for i in 0..max_len {
            let a = c1.get(i).copied().unwrap_or(0);
            let b = c2.get(i).copied().unwrap_or(0);
            if a > b {
                return 1;
            }
            if a < b {
                return -1;
            }
        }

        match (pre1, pre2) {
            (None, None) => 0,
            (None, Some(_)) => 1,
            (Some(_), None) => -1,
            (Some(a), Some(b)) => match a.cmp(&b) {
                std::cmp::Ordering::Greater => 1,
                std::cmp::Ordering::Less => -1,
                std::cmp::Ordering::Equal => 0,
            },
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
        assert_eq!(UpdaterEngine::compare_semver("0.2.0", "0.2.0-beta.1"), 1);
        assert_eq!(UpdaterEngine::compare_semver("0.2.0-beta.1", "0.2.0"), -1);
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
    fn test_check_for_updates_does_not_fabricate_offline_nightly() {
        let res = UpdaterEngine::check_for_updates(UpdateChannel::Nightly);
        assert!(res.up_to_date);
        assert_eq!(res.latest_version, UpdaterEngine::CURRENT_VERSION);
        assert!(res.download_url.is_none());
    }

    #[test]
    fn test_evaluate_manifest_detects_newer_release() {
        let json = r#"{
            "version": "v0.2.0-nightly.20261125",
            "channel": "nightly",
            "release_date": "2026-11-25",
            "notes": "Nightly build"
        }"#;
        let res = UpdaterEngine::evaluate_manifest("0.1.0", UpdateChannel::Nightly, json).unwrap();
        assert!(!res.up_to_date);
        assert_eq!(res.latest_version, "0.2.0-nightly.20261125");
        assert_eq!(
            res.download_url.as_deref(),
            Some("https://github.com/Shahrukhalid/Multi-Emulator-Studio/releases/tag/v0.2.0-nightly.20261125")
        );
    }
}
