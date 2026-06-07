use crate::client::PeerEdgeClient;
use crate::config::Config;
use crate::discovery::Discovery;
use crate::fanout::FanoutService;
use crate::sketch::PeerEdgeSketch;
use crate::types::{now_ms, FanoutRetrieveRequest, HealthResponse, PeerRetrieveRequest};
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub discovery: Discovery,
    pub client: PeerEdgeClient,
    pub fanout: FanoutService,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/peers", get(peers))
        .route("/fanout-retrieve", post(fanout_retrieve))
        .route("/api/peeredge/health", get(health))
        .route("/api/peeredge/sketch", get(peer_sketch))
        .route("/api/peeredge/retrieve", post(peer_retrieve))
        .with_state(Arc::new(state))
}

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let peers = state.discovery.peers().await;
    Json(HealthResponse {
        success: true,
        service: "xuemate-peer-edge".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        node_id: state.config.node_id.clone(),
        group: state.config.group.clone(),
        bind: state.config.bind_addr.to_string(),
        public_base_url: state.config.public_base_url.clone(),
        bridge_url: state.config.bridge_url.clone(),
        peer_count: peers.len(),
        ts: now_ms(),
    })
}

async fn peers(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let peers = state.discovery.peers().await;
    Json(json!({
        "success": true,
        "data": {
            "nodeId": state.config.node_id,
            "group": state.config.group,
            "count": peers.len(),
            "peers": peers
        }
    }))
}

async fn fanout_retrieve(
    State(state): State<Arc<AppState>>,
    Json(request): Json<FanoutRetrieveRequest>,
) -> Json<crate::types::FanoutRetrieveResponse> {
    Json(state.fanout.retrieve(request).await)
}

async fn peer_sketch(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let sketch: PeerEdgeSketch = state.client.fetch_local_sketch().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "success": false,
                "error": error.to_string()
            })),
        )
    })?;

    Ok(Json(json!({
        "success": true,
        "data": sketch
    })))
}

async fn peer_retrieve(
    State(state): State<Arc<AppState>>,
    Json(request): Json<PeerRetrieveRequest>,
) -> Result<Json<crate::types::PeerRetrieveResponse>, (StatusCode, Json<serde_json::Value>)> {
    if request.group.as_deref() != Some(state.config.group.as_str()) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "success": false,
                "error": "peer group mismatch"
            })),
        ));
    }

    state
        .client
        .retrieve_local(&request)
        .await
        .map(Json)
        .map_err(|error| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "success": false,
                    "error": error.to_string()
                })),
            )
        })
}
