use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeepLinkRequest {
    pub device_id: String,
    pub uri: String,
    pub package: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IntentExtra {
    pub key: String,
    pub value_type: String, // "string", "int", "bool", "float"
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IntentRequest {
    pub device_id: String,
    pub action: String,
    pub data_uri: Option<String>,
    pub mime_type: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub extras: Vec<IntentExtra>,
    #[serde(default)]
    pub flags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NotificationSimulationRequest {
    pub device_id: String,
    pub title: String,
    pub body: String,
    pub channel_id: Option<String>,
    pub priority: Option<String>,
    pub tag: Option<String>,
    pub notification_id: Option<u32>,
}

pub struct IntentDispatcher;

impl IntentDispatcher {
    pub fn build_deep_link_args(req: &DeepLinkRequest) -> Vec<String> {
        let mut args = vec![
            "shell".to_string(),
            "am".to_string(),
            "start".to_string(),
            "-a".to_string(),
            "android.intent.action.VIEW".to_string(),
            "-d".to_string(),
            req.uri.clone(),
        ];
        if let Some(pkg) = &req.package {
            if !pkg.trim().is_empty() {
                args.push("-p".to_string());
                args.push(pkg.clone());
            }
        }
        args
    }

    pub fn build_intent_args(req: &IntentRequest) -> Vec<String> {
        let mut args = vec![
            "shell".to_string(),
            "am".to_string(),
            "start".to_string(),
            "-a".to_string(),
            req.action.clone(),
        ];

        if let Some(uri) = &req.data_uri {
            if !uri.trim().is_empty() {
                args.push("-d".to_string());
                args.push(uri.clone());
            }
        }

        if let Some(mime) = &req.mime_type {
            if !mime.trim().is_empty() {
                args.push("-t".to_string());
                args.push(mime.clone());
            }
        }

        for cat in &req.categories {
            if !cat.trim().is_empty() {
                args.push("-c".to_string());
                args.push(cat.clone());
            }
        }

        for extra in &req.extras {
            let key = &extra.key;
            if key.trim().is_empty() {
                continue;
            }
            match extra.value_type.to_lowercase().as_str() {
                "int" | "integer" => {
                    args.push("--ei".to_string());
                    args.push(key.clone());
                    args.push(extra.value.clone());
                }
                "bool" | "boolean" => {
                    args.push("--ez".to_string());
                    args.push(key.clone());
                    args.push(extra.value.clone());
                }
                "float" => {
                    args.push("--ef".to_string());
                    args.push(key.clone());
                    args.push(extra.value.clone());
                }
                _ => {
                    // Default to string extra
                    args.push("--es".to_string());
                    args.push(key.clone());
                    args.push(extra.value.clone());
                }
            }
        }

        for flag in &req.flags {
            if !flag.trim().is_empty() {
                args.push("-f".to_string());
                args.push(flag.clone());
            }
        }

        args
    }

    pub fn build_notification_args(req: &NotificationSimulationRequest) -> Vec<String> {
        let tag = req
            .tag
            .as_deref()
            .unwrap_or("mes_notification_simulation")
            .to_string();
        let notif_id = req.notification_id.unwrap_or(1001).to_string();

        vec![
            "shell".to_string(),
            "cmd".to_string(),
            "notification".to_string(),
            "post".to_string(),
            "-S".to_string(),
            "bigtext".to_string(),
            "-t".to_string(),
            req.title.clone(),
            tag,
            notif_id,
            req.body.clone(),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_deep_link_args() {
        let req = DeepLinkRequest {
            device_id: "dev-1".into(),
            uri: "myapp://checkout?item=123".into(),
            package: Some("com.example.app".into()),
        };
        let args = IntentDispatcher::build_deep_link_args(&req);
        assert_eq!(
            args,
            vec![
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                "myapp://checkout?item=123",
                "-p",
                "com.example.app"
            ]
        );
    }

    #[test]
    fn test_build_intent_args_with_typed_extras() {
        let req = IntentRequest {
            device_id: "dev-1".into(),
            action: "android.intent.action.SEND".into(),
            data_uri: None,
            mime_type: Some("text/plain".into()),
            categories: vec!["android.intent.category.DEFAULT".into()],
            extras: vec![
                IntentExtra {
                    key: "android.intent.extra.TEXT".into(),
                    value_type: "string".into(),
                    value: "Hello World".into(),
                },
                IntentExtra {
                    key: "user_id".into(),
                    value_type: "int".into(),
                    value: "42".into(),
                },
                IntentExtra {
                    key: "is_verified".into(),
                    value_type: "bool".into(),
                    value: "true".into(),
                },
            ],
            flags: vec!["0x10000000".into()],
        };
        let args = IntentDispatcher::build_intent_args(&req);
        assert_eq!(
            args,
            vec![
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.SEND",
                "-t",
                "text/plain",
                "-c",
                "android.intent.category.DEFAULT",
                "--es",
                "android.intent.extra.TEXT",
                "Hello World",
                "--ei",
                "user_id",
                "42",
                "--ez",
                "is_verified",
                "true",
                "-f",
                "0x10000000"
            ]
        );
    }

    #[test]
    fn test_build_notification_args() {
        let req = NotificationSimulationRequest {
            device_id: "dev-1".into(),
            title: "Flash Sale Alert".into(),
            body: "Get 50% discount on all items today!".into(),
            channel_id: Some("promo".into()),
            priority: Some("high".into()),
            tag: Some("sale_2026".into()),
            notification_id: Some(5001),
        };
        let args = IntentDispatcher::build_notification_args(&req);
        assert_eq!(
            args,
            vec![
                "shell",
                "cmd",
                "notification",
                "post",
                "-S",
                "bigtext",
                "-t",
                "Flash Sale Alert",
                "sale_2026",
                "5001",
                "Get 50% discount on all items today!"
            ]
        );
    }
}
