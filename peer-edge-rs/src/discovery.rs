use crate::config::Config;
use crate::types::{now_ms, PeerNode};
use anyhow::{anyhow, Result};
use mdns_sd::{DaemonEvent, ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

const PEEREDGE_PROTO: &str = "peeredge-v1";
const PEEREDGE_CAPS: &str = "rag-snippet,sketch";

#[derive(Clone)]
pub struct Discovery {
    config: Config,
    directory: Arc<RwLock<HashMap<String, PeerNode>>>,
    mdns: Arc<Mutex<Option<ServiceDaemon>>>,
}

impl Discovery {
    pub fn new(config: Config) -> Self {
        Self {
            config,
            directory: Arc::new(RwLock::new(HashMap::new())),
            mdns: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(&self) -> Result<()> {
        if !self.config.discovery_uses_mdns() {
            eprintln!(
                "[xuemate-peer-edge] discovery mode={} (mDNS disabled)",
                self.config.discovery_mode
            );
            return Ok(());
        }

        let daemon = ServiceDaemon::new_with_port(self.config.mdns_port)
            .map_err(|error| anyhow!("mDNS daemon init failed: {error}"))?;

        self.start_monitor(daemon.clone());
        self.start_browse(daemon.clone())?;

        if self.can_register_mdns() {
            self.register_self(&daemon)?;
        } else {
            eprintln!(
                "[xuemate-peer-edge] mDNS browse enabled, registration skipped because publicBaseUrl={} is loopback; set XUEMATE_PEEREDGE_BIND=0.0.0.0 or XUEMATE_PEEREDGE_PUBLIC_URL for LAN advertising",
                self.config.public_base_url
            );
        }

        *self
            .mdns
            .lock()
            .map_err(|_| anyhow!("mDNS mutex poisoned"))? = Some(daemon);
        Ok(())
    }

    pub async fn peers(&self) -> Vec<PeerNode> {
        let now = now_ms();
        let mut merged = HashMap::<String, PeerNode>::new();

        if self.config.discovery_uses_seeds() {
            for base_url in self
                .config
                .seeds
                .iter()
                .filter(|base_url| *base_url != &self.config.public_base_url)
            {
                merged.insert(
                    base_url.clone(),
                    PeerNode {
                        node_id: format!("seed:{}", base_url),
                        group: self.config.group.clone(),
                        base_url: base_url.clone(),
                        source: "env-seed".to_string(),
                        last_seen_ms: now,
                        sketch_digest: String::new(),
                    },
                );
            }
        }

        {
            let mut directory = self.directory.write().await;
            let ttl_ms = self.config.peer_ttl_ms.max(10_000);
            directory.retain(|_, peer| {
                let fresh = now.saturating_sub(peer.last_seen_ms) <= ttl_ms;
                if !fresh {
                    eprintln!(
                        "[xuemate-peer-edge] peer expired from directory: {} ({})",
                        peer.node_id, peer.base_url
                    );
                }
                fresh
            });

            for peer in directory.values() {
                if peer.base_url == self.config.public_base_url {
                    continue;
                }
                merged.insert(peer.base_url.clone(), peer.clone());
            }
        }

        let mut peers = merged.into_values().collect::<Vec<_>>();
        peers.sort_by(|a, b| b.last_seen_ms.cmp(&a.last_seen_ms));
        peers
    }

    fn start_monitor(&self, daemon: ServiceDaemon) {
        match daemon.monitor() {
            Ok(receiver) => {
                tokio::spawn(async move {
                    while let Ok(event) = receiver.recv_async().await {
                        if let DaemonEvent::Error(error) = event {
                            eprintln!("[xuemate-peer-edge] mDNS daemon error: {error}");
                        }
                    }
                });
            }
            Err(error) => {
                eprintln!("[xuemate-peer-edge] mDNS monitor unavailable: {error}");
            }
        }
    }

    fn start_browse(&self, daemon: ServiceDaemon) -> Result<()> {
        let receiver = daemon.browse(&self.config.mdns_service_type)?;
        let directory = self.directory.clone();
        let config = self.config.clone();

        tokio::spawn(async move {
            while let Ok(event) = receiver.recv_async().await {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        if let Some(peer) = peer_from_resolved(&config, &info) {
                            let mut guard = directory.write().await;
                            guard.insert(peer.node_id.clone(), peer);
                        }
                    }
                    ServiceEvent::ServiceRemoved(_service_type, fullname) => {
                        let mut guard = directory.write().await;
                        guard.retain(|_, peer| !peer.source.ends_with(&fullname));
                    }
                    _ => {}
                }
            }
        });

        eprintln!(
            "[xuemate-peer-edge] mDNS browsing {} on udp/{}",
            self.config.mdns_service_type, self.config.mdns_port
        );
        Ok(())
    }

    fn register_self(&self, daemon: &ServiceDaemon) -> Result<()> {
        let instance = safe_dns_label(&self.config.node_id);
        let hostname = format!("{instance}.local.");
        let port = self.config.bind_addr.port();
        let public_ip = public_ip_for_mdns(&self.config.public_base_url)
            .ok_or_else(|| anyhow!("publicBaseUrl host is not an IP address"))?;

        let properties = HashMap::from([
            ("proto".to_string(), PEEREDGE_PROTO.to_string()),
            ("node".to_string(), self.config.node_id.clone()),
            ("group".to_string(), self.config.group.clone()),
            ("public".to_string(), self.config.public_base_url.clone()),
            ("caps".to_string(), PEEREDGE_CAPS.to_string()),
            ("sketch".to_string(), "todo".to_string()),
        ]);

        let service = ServiceInfo::new(
            &self.config.mdns_service_type,
            &instance,
            &hostname,
            public_ip.to_string(),
            port,
            properties,
        )?;

        daemon.register(service)?;
        eprintln!(
            "[xuemate-peer-edge] mDNS registered {} as {}",
            self.config.mdns_service_type, self.config.public_base_url
        );
        Ok(())
    }

    fn can_register_mdns(&self) -> bool {
        if self.config.mdns_allow_loopback {
            return true;
        }
        public_ip_for_mdns(&self.config.public_base_url)
            .map(|ip| !ip.is_loopback())
            .unwrap_or(false)
    }
}

fn peer_from_resolved(config: &Config, info: &mdns_sd::ResolvedService) -> Option<PeerNode> {
    if info.get_property_val_str("proto") != Some(PEEREDGE_PROTO) {
        return None;
    }
    if info.get_property_val_str("group") != Some(config.group.as_str()) {
        return None;
    }

    let node_id = info.get_property_val_str("node")?.to_string();
    if node_id == config.node_id {
        return None;
    }

    let base_url = info
        .get_property_val_str("public")
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| fallback_base_url(info));
    let base_url = base_url?;
    if base_url == config.public_base_url {
        return None;
    }

    Some(PeerNode {
        node_id,
        group: config.group.clone(),
        base_url,
        source: format!("mdns:{}", info.get_fullname()),
        last_seen_ms: now_ms(),
        sketch_digest: info
            .get_property_val_str("sketch")
            .unwrap_or_default()
            .to_string(),
    })
}

fn fallback_base_url(info: &mdns_sd::ResolvedService) -> Option<String> {
    let ipv4 = info.get_addresses_v4().into_iter().next()?;
    Some(format!("http://{}:{}", ipv4, info.get_port()))
}

fn public_ip_for_mdns(public_base_url: &str) -> Option<IpAddr> {
    let host = public_base_url
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or_default()
        .trim_start_matches('[')
        .split(']')
        .next()
        .unwrap_or_default()
        .split(':')
        .next()
        .unwrap_or_default();
    host.parse::<IpAddr>().ok()
}

fn safe_dns_label(value: &str) -> String {
    let mut output = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    while output.contains("--") {
        output = output.replace("--", "-");
    }
    output = output.trim_matches('-').to_string();
    if output.is_empty() {
        "xuemate-peer".to_string()
    } else {
        output.chars().take(48).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_public_ip() {
        assert_eq!(
            public_ip_for_mdns("http://192.168.1.23:18888")
                .unwrap()
                .to_string(),
            "192.168.1.23"
        );
    }

    #[test]
    fn sanitizes_dns_label() {
        assert_eq!(safe_dns_label("PeerEdge:01_x"), "peeredge-01-x");
    }
}
