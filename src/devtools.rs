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

    /// Queries a forwarded Chrome DevTools JSON endpoint (`http://127.0.0.1:<local_port>/json`).
    pub fn fetch_targets(local_port: u16) -> Result<Vec<DevToolsTarget>, String> {
        use std::io::{Read, Write};
        use std::net::{SocketAddr, TcpStream};
        use std::time::Duration;

        let addr: SocketAddr = format!("127.0.0.1:{local_port}")
            .parse()
            .map_err(|e| format!("Invalid local DevTools port {local_port}: {e}"))?;
        let mut stream =
            TcpStream::connect_timeout(&addr, Duration::from_millis(1500)).map_err(|e| {
                format!("Unable to connect to DevTools endpoint on 127.0.0.1:{local_port}: {e}")
            })?;
        let _ = stream.set_read_timeout(Some(Duration::from_millis(2000)));
        let req = format!(
            "GET /json HTTP/1.1\r\nHost: 127.0.0.1:{local_port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
        );
        stream
            .write_all(req.as_bytes())
            .map_err(|e| format!("Failed sending DevTools HTTP request: {e}"))?;

        let mut response = Vec::new();
        stream
            .read_to_end(&mut response)
            .map_err(|e| format!("Failed reading DevTools HTTP response: {e}"))?;
        let raw = String::from_utf8_lossy(&response);
        let (headers, body) = raw
            .split_once("\r\n\r\n")
            .or_else(|| raw.split_once("\n\n"))
            .ok_or_else(|| "Malformed HTTP response from DevTools endpoint".to_string())?;
        let status_line = headers.lines().next().unwrap_or("");
        if !status_line.contains("200") {
            return Err(format!("DevTools endpoint returned '{status_line}'"));
        }

        let json_body = if headers
            .to_ascii_lowercase()
            .contains("transfer-encoding: chunked")
        {
            Self::decode_chunked_body(body)?
        } else {
            body.trim().to_string()
        };
        Self::parse_targets(&json_body, local_port)
    }

    fn decode_chunked_body(raw: &str) -> Result<String, String> {
        let mut out = String::new();
        let mut rest = raw;
        loop {
            let (size_line, after_size) = rest
                .split_once("\r\n")
                .or_else(|| rest.split_once('\n'))
                .ok_or_else(|| "Truncated chunked DevTools HTTP body".to_string())?;
            let hex = size_line.split(';').next().unwrap_or("").trim();
            let size = usize::from_str_radix(hex, 16)
                .map_err(|_| format!("Invalid chunk length '{hex}' in DevTools response"))?;
            if size == 0 {
                break;
            }
            if after_size.len() < size {
                return Err("Incomplete chunk in DevTools HTTP body".into());
            }
            out.push_str(&after_size[..size]);
            rest = after_size[size..]
                .trim_start_matches('\r')
                .trim_start_matches('\n');
        }
        Ok(out)
    }

    #[cfg(test)]
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

    #[test]
    fn test_fetch_targets_over_http_loopback() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 512];
                let _ = stream.read(&mut buf);
                let payload = format!(
                    r#"[{{"id":"live-tab","title":"Checkout WebView","type":"page","url":"https://app.local","webSocketDebuggerUrl":"ws://127.0.0.1:{port}/devtools/page/live-tab"}}]"#
                );
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    payload.len(),
                    payload
                );
                let _ = stream.write_all(resp.as_bytes());
            }
        });

        let targets = DevToolsBridge::fetch_targets(port).unwrap();
        let _ = server.join();
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].id, "live-tab");
        assert_eq!(targets[0].title, "Checkout WebView");
    }
}
