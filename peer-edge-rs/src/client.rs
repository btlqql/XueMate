use crate::config::Config;
use crate::sketch::{PeerEdgeSketch, QuerySketch};
use crate::types::{
    now_ms, EvidenceCard, PeerRetrieveRequest, PeerRetrieveResponse, RendererBridgeRetrieveResponse,
};
use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::{Duration, Instant};

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeDataResponse<T> {
    success: bool,
    data: Option<T>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PeerEdgeClient {
    http: Client,
    config: Config,
}

impl PeerEdgeClient {
    pub fn new(config: Config) -> Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_millis(config.request_timeout_ms.max(100)))
            .build()
            .context("failed to build PeerEdge HTTP client")?;
        Ok(Self { http, config })
    }

    pub async fn fetch_local_sketch(&self) -> Result<PeerEdgeSketch> {
        let url = format!("{}/api/peeredge/sketch", self.config.bridge_url);
        let response = self
            .http
            .get(url)
            .send()
            .await
            .context("local renderer bridge sketch request failed")?;
        decode_data_response(response, "local sketch").await
    }

    pub async fn build_query_sketch(&self, query: &str) -> Result<QuerySketch> {
        let url = format!("{}/api/peeredge/query-sketch", self.config.bridge_url);
        let response = self
            .http
            .post(url)
            .json(&json!({ "query": query }))
            .send()
            .await
            .context("local renderer bridge query-sketch request failed")?;
        decode_data_response(response, "query sketch").await
    }

    pub async fn fetch_peer_sketch(
        &self,
        base_url: &str,
        timeout_ms: u64,
    ) -> Result<PeerEdgeSketch> {
        let url = format!("{}/api/peeredge/sketch", base_url.trim_end_matches('/'));
        let response = self
            .http
            .get(url)
            .timeout(Duration::from_millis(timeout_ms.max(100)))
            .send()
            .await
            .with_context(|| format!("peer sketch request failed: {base_url}"))?;
        decode_data_response(response, "peer sketch").await
    }

    pub async fn retrieve_local(
        &self,
        request: &PeerRetrieveRequest,
    ) -> Result<PeerRetrieveResponse> {
        let started = Instant::now();
        let query = request.query.trim();
        if query.is_empty() {
            return Err(anyhow!("query is required"));
        }

        let top_k = request.top_k.unwrap_or(4).clamp(1, 12);
        let timeout_ms = request
            .timeout_ms
            .unwrap_or(self.config.request_timeout_ms)
            .clamp(100, 5_000);
        let bridge_body = json!({
            "query": query,
            "topK": top_k,
            "collectionId": request.collection_id.clone().unwrap_or_else(|| "all".to_string()),
            "includeContext": false,
            "maxChars": 2400,
            "noCache": false
        });

        let bridge_url = format!("{}/api/rag/retrieve", self.config.bridge_url);
        let bridge_response = self
            .http
            .post(bridge_url)
            .timeout(Duration::from_millis(timeout_ms))
            .json(&bridge_body)
            .send()
            .await
            .context("local renderer bridge retrieve failed")?;

        if !bridge_response.status().is_success() {
            return Err(anyhow!(
                "local renderer bridge returned {}",
                bridge_response.status()
            ));
        }

        let payload = bridge_response
            .json::<RendererBridgeRetrieveResponse>()
            .await
            .context("failed to decode local renderer bridge response")?;
        if !payload.success {
            return Err(anyhow!(payload
                .error
                .unwrap_or_else(|| "renderer bridge retrieve failed".to_string())));
        }

        let evidence = sanitize_bridge_results(
            &payload.data,
            &self.config.node_id,
            &self.config.group,
            top_k,
        );

        Ok(PeerRetrieveResponse {
            success: true,
            data: crate::types::PeerRetrieveData {
                node_id: self.config.node_id.clone(),
                group: self.config.group.clone(),
                query: query.to_string(),
                count: evidence.len(),
                evidence,
                elapsed_ms: started.elapsed().as_millis() as u64,
            },
        })
    }

    pub async fn retrieve_from_peer(
        &self,
        base_url: &str,
        request: PeerRetrieveRequest,
        timeout_ms: u64,
    ) -> Result<PeerRetrieveResponse> {
        let url = format!("{}/api/peeredge/retrieve", base_url.trim_end_matches('/'));
        let response = self
            .http
            .post(url)
            .timeout(Duration::from_millis(timeout_ms.max(100)))
            .json(&request)
            .send()
            .await
            .with_context(|| format!("peer request failed: {base_url}"))?;
        if !response.status().is_success() {
            return Err(anyhow!("peer {} returned {}", base_url, response.status()));
        }
        response
            .json::<PeerRetrieveResponse>()
            .await
            .with_context(|| format!("invalid peer response: {base_url}"))
    }
}

fn sanitize_bridge_results(
    data: &Value,
    node_id: &str,
    group: &str,
    top_k: usize,
) -> Vec<EvidenceCard> {
    data.get("results")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .take(top_k)
                .filter_map(|item| sanitize_item(item, node_id, group))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn sanitize_item(item: &Value, node_id: &str, group: &str) -> Option<EvidenceCard> {
    let chunk = item.get("chunk")?;
    let content = chunk
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let snippet = compact_snippet(content, 520);
    if snippet.is_empty() {
        return None;
    }

    let rank_reason = item
        .get("rankReason")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .take(4)
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Some(EvidenceCard {
        source: "peer-rag-snippet".to_string(),
        peer_id: node_id.to_string(),
        group: group.to_string(),
        file_name: chunk
            .get("fileName")
            .or_else(|| chunk.get("file_name"))
            .and_then(Value::as_str)
            .unwrap_or("未知资料")
            .to_string(),
        chunk_id: chunk
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        snippet,
        score: item.get("score").and_then(Value::as_f64).unwrap_or(0.0),
        rank_reason,
        ts: now_ms(),
    })
}

fn compact_snippet(input: &str, max_chars: usize) -> String {
    let normalized = input.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut output = String::new();
    for ch in normalized.chars() {
        if output.chars().count() >= max_chars {
            output.push('…');
            break;
        }
        output.push(ch);
    }
    output
}

async fn decode_data_response<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
    label: &str,
) -> Result<T> {
    if !response.status().is_success() {
        return Err(anyhow!("{} returned {}", label, response.status()));
    }
    let payload = response
        .json::<BridgeDataResponse<T>>()
        .await
        .with_context(|| format!("failed to decode {label} response"))?;
    if !payload.success {
        return Err(anyhow!(payload
            .error
            .unwrap_or_else(|| format!("{label} failed"))));
    }
    payload
        .data
        .ok_or_else(|| anyhow!("{} response missing data", label))
}
