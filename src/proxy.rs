use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Duration;

/// Dynamic local loopback forwarder for Android guest emulator networking.
/// Allows transparent, zero-restart hot switching of network egress proxies.
pub struct DynamicProxyRouter {
    port: u16,
    target: Arc<RwLock<Option<String>>>,
    running: Arc<AtomicBool>,
}

impl DynamicProxyRouter {
    /// Bind to an ephemeral port on 127.0.0.1 and start the forwarder loop.
    pub fn start(initial_target: Option<String>) -> crate::Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| {
            crate::Error::Runtime(format!("Failed to bind local loopback proxy: {e}"))
        })?;
        let port = listener
            .local_addr()
            .map_err(|e| {
                crate::Error::Runtime(format!("Failed to retrieve proxy local port: {e}"))
            })?
            .port();

        let target = Arc::new(RwLock::new(initial_target));
        let running = Arc::new(AtomicBool::new(true));

        let thread_target = Arc::clone(&target);
        let thread_running = Arc::clone(&running);

        thread::Builder::new()
            .name("proxy-router-loop".into())
            .spawn(move || {
                // Set non-blocking or short read timeout so we can exit on stop()
                let _ = listener.set_nonblocking(false);
                while thread_running.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((client, _)) => {
                            let current_target = thread_target
                                .read()
                                .unwrap_or_else(|poisoned| poisoned.into_inner())
                                .clone();
                            let conn_running = Arc::clone(&thread_running);
                            thread::spawn(move || {
                                if !conn_running.load(Ordering::SeqCst) {
                                    return;
                                }
                                let _ = Self::handle_connection(client, current_target);
                            });
                        }
                        Err(_) => {
                            if !thread_running.load(Ordering::SeqCst) {
                                break;
                            }
                            thread::sleep(Duration::from_millis(50));
                        }
                    }
                }
            })
            .map_err(|e| crate::Error::Runtime(format!("Failed to spawn proxy thread: {e}")))?;

        Ok(Self {
            port,
            target,
            running,
        })
    }

    /// Bound port passed to Android emulator via `-http-proxy 127.0.0.1:<port>`.
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Dynamically update the upstream proxy target without rebooting the emulator.
    pub fn set_target(&self, new_target: Option<String>) {
        if let Ok(mut t) = self.target.write() {
            *t = new_target;
        }
    }

    /// Retrieve currently active upstream target proxy (if any).
    pub fn get_target(&self) -> Option<String> {
        self.target.read().ok().and_then(|t| t.clone())
    }

    /// Gracefully stop the forwarder.
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        // Wake up listener if blocked in accept()
        if let Ok(loopback) = format!("127.0.0.1:{}", self.port).parse::<std::net::SocketAddr>() {
            let _ = TcpStream::connect_timeout(&loopback, Duration::from_millis(100));
        }
    }

    fn handle_connection(mut client: TcpStream, target: Option<String>) -> std::io::Result<()> {
        let _ = client.set_read_timeout(Some(Duration::from_secs(15)));
        let _ = client.set_write_timeout(Some(Duration::from_secs(15)));

        let mut buf = [0u8; 4096];
        let bytes_read = client.read(&mut buf)?;
        if bytes_read == 0 {
            return Ok(());
        }

        let initial_payload = &buf[..bytes_read];

        if let Some(upstream_addr) = target {
            // Forward to configured upstream proxy (e.g. US, UK, Germany nodes)
            let socket_addr = Self::resolve_socket_addr(&upstream_addr)?;
            let mut upstream =
                match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5)) {
                    Ok(u) => u,
                    Err(e) => {
                        let _ = client.write_all(b"HTTP/1.1 502 Bad Gateway\r\n\r\n");
                        return Err(e);
                    }
                };

            upstream.write_all(initial_payload)?;
            Self::bi_directional_pipe(client, upstream);
            Ok(())
        } else {
            // Direct Passthrough mode
            let req_str = String::from_utf8_lossy(initial_payload);
            if req_str.starts_with("CONNECT ") {
                // HTTPS Tunnel
                let host_port = req_str.split_whitespace().nth(1).unwrap_or("").to_string();

                if host_port.is_empty() {
                    let _ = client.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n");
                    return Ok(());
                }

                let socket_addr = match Self::resolve_socket_addr(&host_port) {
                    Ok(addr) => addr,
                    Err(e) => {
                        let _ = client.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n");
                        return Err(e);
                    }
                };

                match TcpStream::connect_timeout(&socket_addr, Duration::from_secs(5)) {
                    Ok(server) => {
                        client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")?;
                        Self::bi_directional_pipe(client, server);
                        Ok(())
                    }
                    Err(e) => {
                        let _ = client.write_all(b"HTTP/1.1 504 Gateway Timeout\r\n\r\n");
                        Err(e)
                    }
                }
            } else {
                // Plain HTTP
                let _ = client.write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nDirect proxy active",
                );
                Ok(())
            }
        }
    }

    fn bi_directional_pipe(mut a: TcpStream, mut b: TcpStream) {
        let mut a_clone = match a.try_clone() {
            Ok(s) => s,
            Err(_) => return,
        };
        let mut b_clone = match b.try_clone() {
            Ok(s) => s,
            Err(_) => return,
        };

        let t1 = thread::spawn(move || {
            let mut buf = [0u8; 8192];
            while let Ok(n) = a.read(&mut buf) {
                if n == 0 || b.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
        });

        let t2 = thread::spawn(move || {
            let mut buf = [0u8; 8192];
            while let Ok(n) = b_clone.read(&mut buf) {
                if n == 0 || a_clone.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
        });

        let _ = t1.join();
        let _ = t2.join();
    }

    /// Resolves `host:port` (or `http://host:port/...`) into a concrete socket address.
    pub fn resolve_socket_addr(raw: &str) -> std::io::Result<std::net::SocketAddr> {
        use std::net::ToSocketAddrs;

        let trimmed = raw.trim();
        let without_scheme = ["http://", "https://", "socks5://", "socks4://"]
            .iter()
            .find_map(|prefix| {
                let lower = trimmed.to_ascii_lowercase();
                if lower.starts_with(prefix) {
                    Some(&trimmed[prefix.len()..])
                } else {
                    None
                }
            })
            .unwrap_or(trimmed);
        let authority = without_scheme.split('/').next().unwrap_or("").trim();
        if authority.is_empty() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Empty proxy or target host address",
            ));
        }

        if let Ok(addr) = authority.parse::<std::net::SocketAddr>() {
            return Ok(addr);
        }

        let mut addrs = authority.to_socket_addrs().map_err(|e| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Invalid proxy or host address '{authority}': {e}"),
            )
        })?;
        addrs.next().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::AddrNotAvailable,
                format!("Could not resolve host address '{authority}'"),
            )
        })
    }
}

impl Drop for DynamicProxyRouter {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_router_allocates_port_and_switches_target() {
        let router = DynamicProxyRouter::start(Some("127.0.0.1:8080".into())).unwrap();
        assert!(router.port() > 0);
        assert_eq!(router.get_target(), Some("127.0.0.1:8080".into()));

        // Hot switch
        router.set_target(Some("198.51.100.1:3128".into()));
        assert_eq!(router.get_target(), Some("198.51.100.1:3128".into()));

        // Switch to direct
        router.set_target(None);
        assert_eq!(router.get_target(), None);

        router.stop();
    }

    #[test]
    fn resolve_socket_addr_supports_schemes_and_hostnames() {
        let bare = DynamicProxyRouter::resolve_socket_addr("127.0.0.1:8080").unwrap();
        assert_eq!(bare.port(), 8080);

        let with_scheme =
            DynamicProxyRouter::resolve_socket_addr("http://127.0.0.1:8888/proxy").unwrap();
        assert_eq!(with_scheme.port(), 8888);

        let loopback_host = DynamicProxyRouter::resolve_socket_addr("localhost:9090").unwrap();
        assert_eq!(loopback_host.port(), 9090);

        assert!(DynamicProxyRouter::resolve_socket_addr("").is_err());
    }
}
