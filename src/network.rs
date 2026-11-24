use crate::model::Status;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NetworkProfile {
    pub id: String,
    pub name: String,
    pub speed_preset: String,
    pub delay_preset: String,
    pub download_kbps: u32,
    pub upload_kbps: u32,
    pub latency_ms: u32,
    pub description: String,
}

pub fn standard_network_profiles() -> Vec<NetworkProfile> {
    vec![
        NetworkProfile {
            id: "full".into(),
            name: "5G / Unthrottled Fiber".into(),
            speed_preset: "full".into(),
            delay_preset: "none".into(),
            download_kbps: 100_000,
            upload_kbps: 50_000,
            latency_ms: 5,
            description: "Zero latency and unthrottled maximum bandwidth".into(),
        },
        NetworkProfile {
            id: "lte".into(),
            name: "4G LTE Mobile".into(),
            speed_preset: "lte".into(),
            delay_preset: "lte".into(),
            download_kbps: 30_000,
            upload_kbps: 15_000,
            latency_ms: 30,
            description: "High-speed 4G LTE cellular connection".into(),
        },
        NetworkProfile {
            id: "umts".into(),
            name: "3G / Slow Mobile (UMTS)".into(),
            speed_preset: "umts".into(),
            delay_preset: "umts".into(),
            download_kbps: 2_000,
            upload_kbps: 500,
            latency_ms: 150,
            description: "Medium latency and constrained bandwidth".into(),
        },
        NetworkProfile {
            id: "edge".into(),
            name: "2G / Constrained (EDGE)".into(),
            speed_preset: "edge".into(),
            delay_preset: "edge".into(),
            download_kbps: 250,
            upload_kbps: 64,
            latency_ms: 400,
            description: "Severe packet delay and limited bitrate".into(),
        },
        NetworkProfile {
            id: "offline".into(),
            name: "Offline / Flight Mode".into(),
            speed_preset: "offline".into(),
            delay_preset: "none".into(),
            download_kbps: 0,
            upload_kbps: 0,
            latency_ms: 0,
            description: "Simulate disconnected network to test offline resilience".into(),
        },
    ]
}

pub fn find_profile(id: &str) -> Option<NetworkProfile> {
    standard_network_profiles().into_iter().find(|p| p.id == id)
}

#[derive(Debug, Serialize)]
pub struct AddressOverlap {
    pub address: String,
    pub devices: Vec<Uuid>,
}
/// Addresses are guest-interface observations, not a claim of routable LAN/public identity.
pub fn overlaps(statuses: &[Status]) -> Vec<AddressOverlap> {
    let mut by_addr: BTreeMap<String, Vec<Uuid>> = BTreeMap::new();
    for s in statuses {
        for a in &s.addresses {
            if let Ok(ip) = a
                .split('/')
                .next()
                .unwrap_or_default()
                .parse::<std::net::IpAddr>()
            {
                if ip.is_loopback() {
                    continue;
                }
                let list = by_addr.entry(ip.to_string()).or_default();
                if !list.contains(&s.id) {
                    list.push(s.id);
                }
            }
        }
    }
    by_addr
        .into_iter()
        .filter_map(|(address, devices)| {
            if devices.len() > 1 {
                Some(AddressOverlap { address, devices })
            } else {
                None
            }
        })
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::DeviceState;
    #[test]
    fn reports_duplicate_guest_ip_without_claiming_collision() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let status = |id, port| Status {
            id,
            state: DeviceState::Ready,
            pid: Some(u32::from(port)),
            console_port: Some(port),
            addresses: vec![
                "10.0.2.15/24".into(),
                "10.0.2.15/16".into(),
                "127.0.0.1/8".into(),
            ],
            diagnostic: None,
        };
        let matches = overlaps(&[status(a, 5554), status(b, 5556)]);
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].devices.len(), 2);
    }

    #[test]
    fn test_network_profiles_catalog_and_lookup() {
        let profiles = standard_network_profiles();
        assert_eq!(profiles.len(), 5);
        assert!(profiles.iter().any(|p| p.id == "full" && p.latency_ms == 5));
        assert!(profiles
            .iter()
            .any(|p| p.id == "offline" && p.download_kbps == 0));

        let lte = find_profile("lte").unwrap();
        assert_eq!(lte.speed_preset, "lte");
        assert_eq!(lte.latency_ms, 30);

        assert!(find_profile("nonexistent").is_none());
    }
}
