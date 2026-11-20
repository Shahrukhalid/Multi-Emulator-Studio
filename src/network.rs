use crate::model::Status;
use serde::Serialize;
use std::collections::BTreeMap;
use uuid::Uuid;

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
}
