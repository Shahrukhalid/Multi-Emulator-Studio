use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DevToolsTarget {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub target_type: String,
    pub url: String,
    #[serde(default)]
    pub devtools_frontend_url: String,
    #[serde(default)]
    pub web_socket_debugger_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DevToolsBridgeConfig {
    pub device_id: String,
    pub local_port: u16,
    pub remote_socket: String,
}

pub struct DevToolsBridge;

impl DevToolsBridge {
    pub fn default_port() -> u16 {
        9222
    }

    pub fn default_socket() -> &'static str {
        "chrome_devtools_remote"
    }

    pub fn build_forward_args(local_port: u16, remote_socket: &str) -> Vec<String> {
        vec![
            "forward".to_string(),
            format!("tcp:{}", local_port),
            format!("localabstract:{}", remote_socket),
        ]
    }

    pub fn build_remove_forward_args(local_port: u16) -> Vec<String> {
        vec![
            "forward".to_string(),
            "--remove".to_string(),
            format!("tcp:{}", local_port),
        ]
    }

    pub fn parse_targets(json_str: &str, local_port: u16) -> Result<Vec<DevToolsTarget>, String> {
        #[derive(Deserialize)]
        struct RawTarget {
            id: Option<String>,
            title: Option<String>,
            #[serde(rename = "type")]
            target_type: Option<String>,
            url: Option<String>,
            #[serde(rename = "devtoolsFrontendUrl")]
            devtools_frontend_url: Option<String>,
            #[serde(rename = "webSocketDebuggerUrl")]
            web_socket_debugger_url: Option<String>,
        }

        let raw_list: Vec<RawTarget> =
            serde_json::from_str(json_str).map_err(|e| format!("Invalid JSON targets: {e}"))?;

        let targets = raw_list
            .into_iter()
            .enumerate()
            .map(|(idx, raw)| {
                let id = raw.id.unwrap_or_else(|| format!("target-{idx}"));
                let title = raw.title.unwrap_or_else(|| "WebView Page".into());
                let target_type = raw.target_type.unwrap_or_else(|| "page".into());
                let url = raw.url.unwrap_or_else(|| "about:blank".into());
                let ws_url = raw
                    .web_socket_debugger_url
                    .unwrap_or_else(|| format!("ws://127.0.0.1:{local_port}/devtools/page/{id}"));

                let frontend_url = raw.devtools_frontend_url.unwrap_or_else(|| {
                    format!(
                        "devtools://devtools/bundled/inspector.html?ws=127.0.0.1:{local_port}/devtools/page/{id}"
                    )
                });

                DevToolsTarget {
                    id,
                    title,
                    target_type,
                    url,
                    devtools_frontend_url: frontend_url,
                    web_socket_debugger_url: ws_url,
                }
            })
            .collect();

        Ok(targets)
    }

    pub fn mock_targets(local_port: u16) -> Vec<DevToolsTarget> {
        vec![
            DevToolsTarget {
                id: "webview-main-window".into(),
                title: "Mobile App Web Container — Checkout Activity".into(),
                target_type: "page".into(),
                url: "https://shop.example.com/mobile/checkout".into(),
                devtools_frontend_url: format!(
                    "devtools://devtools/bundled/inspector.html?ws=127.0.0.1:{local_port}/devtools/page/webview-main-window"
                ),
                web_socket_debugger_url: format!(
                    "ws://127.0.0.1:{local_port}/devtools/page/webview-main-window"
                ),
            },
            DevToolsTarget {
                id: "webview-auth-widget".into(),
                title: "OAuth2 Consent & Passkey Biometric Dialog".into(),
                target_type: "iframe".into(),
                url: "https://auth.example.com/oauth2/dialog".into(),
                devtools_frontend_url: format!(
                    "devtools://devtools/bundled/inspector.html?ws=127.0.0.1:{local_port}/devtools/page/webview-auth-widget"
                ),
                web_socket_debugger_url: format!(
                    "ws://127.0.0.1:{local_port}/devtools/page/webview-auth-widget"
                ),
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_forward_args() {
        let args = DevToolsBridge::build_forward_args(9222, "chrome_devtools_remote");
        assert_eq!(
            args,
            vec![
                "forward",
                "tcp:9222",
                "localabstract:chrome_devtools_remote"
            ]
        );

        let rm_args = DevToolsBridge::build_remove_forward_args(9222);
        assert_eq!(rm_args, vec!["forward", "--remove", "tcp:9222"]);
    }

    #[test]
    fn test_parse_targets_json() {
        let json_data = r#"[
            {
                "id": "page-1",
                "title": "Flutter InAppWebView",
                "type": "page",
                "url": "https://flutter.dev",
                "devtoolsFrontendUrl": "/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/page-1",
                "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/page-1"
            }
        ]"#;

        let targets = DevToolsBridge::parse_targets(json_data, 9222).unwrap();
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].id, "page-1");
        assert_eq!(targets[0].title, "Flutter InAppWebView");
        assert_eq!(targets[0].target_type, "page");
        assert_eq!(targets[0].url, "https://flutter.dev");
        assert!(targets[0]
            .devtools_frontend_url
            .contains("127.0.0.1:9222/devtools/page/page-1"));
    }

    #[test]
    fn test_mock_targets() {
        let targets = DevToolsBridge::mock_targets(9222);
        assert_eq!(targets.len(), 2);
        assert_eq!(targets[0].id, "webview-main-window");
        assert_eq!(targets[1].id, "webview-auth-widget");
    }
}
