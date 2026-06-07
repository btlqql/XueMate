use crate::cache::EvidenceCache;
use crate::client::PeerEdgeClient;
use crate::config::Config;
use crate::discovery::Discovery;
use crate::sketch::score_peer;
use crate::sketch_cache::SketchCache;
use crate::types::{
    now_ms, EvidenceCard, FanoutPeerError, FanoutRetrieveData, FanoutRetrieveRequest,
    FanoutRetrieveResponse, PeerNode, PeerRetrieveRequest,
};
use std::cmp::Ordering;
use std::time::Instant;
use tokio::task::JoinSet;

const MAX_ROUTE_CANDIDATES: usize = 64;

#[derive(Clone)]
pub struct FanoutService {
    config: Config,
    discovery: Discovery,
    client: PeerEdgeClient,
    cache: EvidenceCache,
    sketch_cache: SketchCache,
}

impl FanoutService {
    pub fn new(
        config: Config,
        discovery: Discovery,
        client: PeerEdgeClient,
        cache: EvidenceCache,
        sketch_cache: SketchCache,
    ) -> Self {
        Self {
            config,
            discovery,
            client,
            cache,
            sketch_cache,
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
        let selected = self
            .select_peers(peers, &query, peer_limit, timeout_ms)
            .await;
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

    async fn select_peers(
        &self,
        peers: Vec<PeerNode>,
        query: &str,
        limit: usize,
        timeout_ms: u64,
    ) -> Vec<PeerNode> {
        if peers.is_empty() {
            return Vec::new();
        }

        let query_sketch = match self.client.build_query_sketch(query).await {
            Ok(sketch) => sketch,
            Err(error) => {
                eprintln!(
                    "[xuemate-peer-edge] query sketch unavailable, fallback to peer order: {error}"
                );
                return peers.into_iter().take(limit).collect();
            }
        };

        let candidates = peers
            .into_iter()
            .take(MAX_ROUTE_CANDIDATES)
            .enumerate()
            .collect::<Vec<_>>();
        let mut join_set = JoinSet::new();

        for (index, peer) in candidates {
            let client = self.client.clone();
            let sketch_cache = self.sketch_cache.clone();
            join_set.spawn(async move {
                if let Some(sketch) = sketch_cache.get(&peer.base_url, &peer.sketch_digest).await {
                    return (index, peer, Ok((sketch, true)));
                }

                let result = client
                    .fetch_peer_sketch(&peer.base_url, timeout_ms)
                    .await
                    .map(|sketch| (sketch, false));
                if let Ok((sketch, _)) = &result {
                    sketch_cache.put(&peer.base_url, sketch.clone()).await;
                }
                (index, peer, result)
            });
        }

        let mut scored = Vec::<(usize, PeerNode, f64)>::new();
        let mut fetched = 0usize;
        let mut cache_hits = 0usize;
        let now = now_ms();

        while let Some(joined) = join_set.join_next().await {
            match joined {
                Ok((index, peer, Ok((peer_sketch, cache_hit)))) => {
                    if cache_hit {
                        cache_hits += 1;
                    } else {
                        fetched += 1;
                    }
                    let score = score_peer(&query_sketch, &peer_sketch, now).total;
                    scored.push((index, peer, score));
                }
                Ok((index, peer, Err(error))) => {
                    eprintln!(
                        "[xuemate-peer-edge] peer sketch unavailable for {}: {}",
                        peer.base_url, error
                    );
                    scored.push((index, peer, 0.0));
                }
                Err(error) => {
                    eprintln!("[xuemate-peer-edge] peer sketch task failed: {error}");
                }
            }
        }

        scored.sort_by(|a, b| {
            b.2.partial_cmp(&a.2)
                .unwrap_or(Ordering::Equal)
                .then_with(|| a.0.cmp(&b.0))
        });

        let selected = scored
            .into_iter()
            .take(limit)
            .map(|(_, peer, score)| (peer, score))
            .collect::<Vec<_>>();

        if !selected.is_empty() {
            let summary = selected
                .iter()
                .map(|(peer, score)| format!("{}={:.3}", peer.node_id, score))
                .collect::<Vec<_>>()
                .join(", ");
            eprintln!(
                "[xuemate-peer-edge] route selected {} peer(s), sketchFetched={}, sketchCacheHit={}: {}",
                selected.len(),
                fetched,
                cache_hits,
                summary
            );
        }

        selected.into_iter().map(|(peer, _)| peer).collect()
    }
}
