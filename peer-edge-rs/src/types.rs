use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerNode {
    pub node_id: String,
    pub group: String,
    pub base_url: String,
    pub source: String,
    pub last_seen_ms: u64,
    #[serde(default)]
    pub sketch_digest: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub success: bool,
    pub service: String,
    pub version: String,
    pub node_id: String,
    pub group: String,
    pub bind: String,
    pub public_base_url: String,
    pub bridge_url: String,
    pub peer_count: usize,
    pub ts: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FanoutRetrieveRequest {
    pub query: String,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub collection_id: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub peer_limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerRetrieveRequest {
    pub query: String,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub collection_id: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub requester_id: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceCard {
    pub source: String,
    pub peer_id: String,
    pub group: String,
    pub file_name: String,
    pub chunk_id: String,
    pub snippet: String,
    pub score: f64,
    pub rank_reason: Vec<String>,
    pub ts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerRetrieveData {
    pub node_id: String,
    pub group: String,
    pub query: String,
    pub count: usize,
    pub evidence: Vec<EvidenceCard>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerRetrieveResponse {
    pub success: bool,
    pub data: PeerRetrieveData,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FanoutPeerError {
    pub base_url: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FanoutRetrieveData {
    pub node_id: String,
    pub group: String,
    pub query: String,
    pub peers_queried: usize,
    pub count: usize,
    pub evidence: Vec<EvidenceCard>,
    pub errors: Vec<FanoutPeerError>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FanoutRetrieveResponse {
    pub success: bool,
    pub data: FanoutRetrieveData,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RendererBridgeRetrieveResponse {
    pub success: bool,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub error: Option<String>,
}
