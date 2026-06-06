use anyhow::{anyhow, Result};
use std::env;
use std::net::{SocketAddr, UdpSocket};

#[derive(Debug, Clone)]
pub struct Config {
    pub node_id: String,
    pub group: String,
    pub bind_addr: SocketAddr,
    pub public_base_url: String,
    pub bridge_url: String,
    pub seeds: Vec<String>,
    pub discovery_mode: String,
    pub mdns_service_type: String,
    pub mdns_port: u16,
    pub mdns_allow_loopback: bool,
    pub request_timeout_ms: u64,
    pub fanout_limit: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let port = env_u16("XUEMATE_PEEREDGE_PORT", 18888);
        let bind_host =
            env::var("XUEMATE_PEEREDGE_BIND").unwrap_or_else(|_| "127.0.0.1".to_string());
        let bind_addr: SocketAddr = format!("{bind_host}:{port}")
            .parse()
            .map_err(|error| anyhow!("invalid XUEMATE_PEEREDGE_BIND/PORT: {error}"))?;

        let node_id = env::var("XUEMATE_PEEREDGE_NODE_ID")
            .unwrap_or_else(|_| format!("peeredge-{}", std::process::id()));
        let group = env::var("XUEMATE_PEEREDGE_GROUP").unwrap_or_else(|_| "class-demo".to_string());
        let bridge_url = env::var("XUEMATE_RENDERER_BRIDGE_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8788".to_string())
            .trim_end_matches('/')
            .to_string();
        let public_base_url = env::var("XUEMATE_PEEREDGE_PUBLIC_URL")
            .ok()
            .filter(|value| !value.trim().is_empty() && value.trim().to_lowercase() != "auto")
            .unwrap_or_else(|| format!("http://{}:{port}", default_public_host(&bind_host)))
            .trim_end_matches('/')
            .to_string();
        let seeds = env::var("XUEMATE_PEEREDGE_SEEDS")
            .unwrap_or_default()
            .split(',')
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();

        Ok(Self {
            node_id,
            group,
            bind_addr,
            public_base_url,
            bridge_url,
            seeds,
            discovery_mode: env::var("XUEMATE_PEEREDGE_DISCOVERY")
                .unwrap_or_else(|_| "auto".to_string())
                .trim()
                .to_lowercase(),
            mdns_service_type: env::var("XUEMATE_PEEREDGE_MDNS_SERVICE")
                .unwrap_or_else(|_| "_xm-edge._tcp.local.".to_string()),
            mdns_port: env_u16("XUEMATE_PEEREDGE_MDNS_PORT", 5353),
            mdns_allow_loopback: env_bool("XUEMATE_PEEREDGE_MDNS_ALLOW_LOOPBACK", false),
            request_timeout_ms: env_u64("XUEMATE_PEEREDGE_TIMEOUT_MS", 650),
            fanout_limit: env_usize("XUEMATE_PEEREDGE_FANOUT", 4).max(1),
        })
    }
}

impl Config {
    pub fn discovery_uses_mdns(&self) -> bool {
        matches!(
            self.discovery_mode.as_str(),
            "auto" | "mdns" | "mdns,seed" | "seed,mdns"
        )
    }

    pub fn discovery_uses_seeds(&self) -> bool {
        matches!(
            self.discovery_mode.as_str(),
            "auto" | "seed" | "mdns,seed" | "seed,mdns"
        )
    }
}

fn env_u16(key: &str, fallback: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(fallback)
}

fn env_u64(key: &str, fallback: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(fallback)
}

fn env_usize(key: &str, fallback: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(fallback)
}

fn env_bool(key: &str, fallback: bool) -> bool {
    env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(fallback)
}

fn default_public_host(bind_host: &str) -> String {
    match bind_host {
        "0.0.0.0" | "::" | "[::]" => detect_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string()),
        "localhost" => "127.0.0.1".to_string(),
        host => host.to_string(),
    }
}

fn detect_lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    // UDP connect chooses the outbound interface without sending application data.
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip();
    if ip.is_loopback() {
        None
    } else {
        Some(ip.to_string())
    }
}
