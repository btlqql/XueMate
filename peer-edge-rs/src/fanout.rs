use crate::cache::EvidenceCache;
use crate::client::PeerEdgeClient;
use crate::config::Config;
use crate::discovery::Discovery;
use crate::types::{
    EvidenceCard, FanoutPeerError, FanoutRetrieveData, FanoutRetrieveRequest,
    FanoutRetrieveResponse, PeerRetrieveRequest,
};
use std::cmp::Ordering;
use std::time::Instant;
use tokio::task::JoinSet;

#[derive(Clone)]
pub struct FanoutService {
    config: Config,
    discovery: Discovery,
    client: PeerEdgeClient,
    cache: EvidenceCache,
}

impl FanoutService {
    pub fn new(
        config: Config,
        discovery: Discovery,
        client: PeerEdgeClient,
        cache: EvidenceCache,
    ) -> Self {
        Self {
            config,
            discovery,
            client,
            cache,
        }
    }

    pub async fn retrieve(&self, request: FanoutRetrieveRequest) -> FanoutRetrieveResponse {
        let started = Instant::now();
        let query = request.query.trim().to_string();
        let top_k = request.top_k.unwrap_or(5).clamp(1, 16);
        let peer_limit = request
            .peer_limit
            .unwrap_or(self.config.fanout_limit)
            .clamp(1, self.config.fanout_limit.max(1));
        let timeout_ms = request
            .timeout_ms
            .unwrap_or(self.config.request_timeout_ms)
            .clamp(100, 5_000);
        let cache_key = format!(
            "{}|{}|{}|{}",
            self.config.group,
            request
                .collection_id
                .clone()
                .unwrap_or_else(|| "all".to_string()),
            top_k,
            query
        );

        if let Some(evidence) = self.cache.get(&cache_key).await {
            return FanoutRetrieveResponse {
                success: true,
                data: FanoutRetrieveData {
                    node_id: self.config.node_id.clone(),
                    group: self.config.group.clone(),
                    query,
                    peers_queried: 0,
                    count: evidence.len(),
                    evidence,
                    errors: Vec::new(),
                    elapsed_ms: started.elapsed().as_millis() as u64,
                },
            };
        }

        let peers = self.discovery.peers().await;
        let selected = peers.into_iter().take(peer_limit).collect::<Vec<_>>();
        let peers_queried = selected.len();
        let mut join_set = JoinSet::new();

        for peer in selected {
            let client = self.client.clone();
            let config = self.config.clone();
            let collection_id = request.collection_id.clone();
            let peer_query = query.clone();
            join_set.spawn(async move {
                let peer_request = PeerRetrieveRequest {
                    query: peer_query,
                    top_k: Some(top_k),
                    collection_id,
                    timeout_ms: Some(timeout_ms),
                    requester_id: Some(config.node_id.clone()),
                    group: Some(config.group.clone()),
                };
                let base_url = peer.base_url.clone();
                let result = client
                    .retrieve_from_peer(&base_url, peer_request, timeout_ms)
                    .await;
                (base_url, result)
            });
        }

        let mut evidence = Vec::<EvidenceCard>::new();
        let mut errors = Vec::<FanoutPeerError>::new();

        while let Some(joined) = join_set.join_next().await {
            match joined {
                Ok((_base_url, Ok(response))) => evidence.extend(response.data.evidence),
                Ok((base_url, Err(error))) => errors.push(FanoutPeerError {
                    base_url,
                    error: error.to_string(),
                }),
                Err(error) => errors.push(FanoutPeerError {
                    base_url: "unknown".to_string(),
                    error: error.to_string(),
                }),
            }
        }

        evidence.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
        evidence.truncate(top_k);
        if !evidence.is_empty() {
            self.cache.put(cache_key, evidence.clone()).await;
        }

        FanoutRetrieveResponse {
            success: true,
            data: FanoutRetrieveData {
                node_id: self.config.node_id.clone(),
                group: self.config.group.clone(),
                query,
                peers_queried,
                count: evidence.len(),
                evidence,
                errors,
                elapsed_ms: started.elapsed().as_millis() as u64,
            },
        }
    }
}
