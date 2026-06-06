mod cache;
mod client;
mod config;
mod discovery;
mod fanout;
mod server;
mod types;

use anyhow::{Context, Result};
use cache::EvidenceCache;
use client::PeerEdgeClient;
use config::Config;
use discovery::Discovery;
use fanout::FanoutService;
use server::{router, AppState};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::from_env()?;
    let discovery = Discovery::new(config.clone());
    if let Err(error) = discovery.start().await {
        eprintln!("[xuemate-peer-edge] discovery startup skipped: {error}");
    }
    let client = PeerEdgeClient::new(config.clone())?;
    let cache = EvidenceCache::new(30_000, 256);
    let fanout = FanoutService::new(config.clone(), discovery.clone(), client.clone(), cache);

    let state = AppState {
        config: config.clone(),
        discovery,
        client,
        fanout,
    };

    let listener = TcpListener::bind(config.bind_addr)
        .await
        .with_context(|| format!("failed to bind PeerEdge daemon on {}", config.bind_addr))?;

    eprintln!(
        "[xuemate-peer-edge] listening on http://{} node={} group={} bridge={} seeds={}",
        config.bind_addr,
        config.node_id,
        config.group,
        config.bridge_url,
        config.seeds.len()
    );

    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("PeerEdge daemon stopped unexpectedly")?;

    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
