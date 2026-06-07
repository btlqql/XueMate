use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerEdgeSketch {
    pub version: String,
    pub node_id: String,
    pub group: String,
    pub salt_version: String,
    pub m: usize,
    pub k: usize,
    pub lexical_bloom: String,
    pub subject_bloom: String,
    pub concept_bloom: String,
    #[serde(default)]
    pub doc_count_bucket: String,
    #[serde(default)]
    pub chunk_count_bucket: String,
    pub digest: String,
    pub updated_at: u64,
    pub ttl_ms: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuerySketch {
    pub version: String,
    pub group: String,
    pub salt_version: String,
    pub m: usize,
    pub k: usize,
    pub lexical_bloom: String,
    pub subject_bloom: String,
    pub concept_bloom: String,
    pub digest: String,
    pub updated_at: u64,
    pub ttl_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteScore {
    pub total: f64,
    pub lexical_hit: f64,
    pub concept_hit: f64,
    pub subject_hit: f64,
    pub freshness: f64,
}

pub fn score_peer(query: &QuerySketch, peer: &PeerEdgeSketch, now_ms: u64) -> RouteScore {
    if query.group != peer.group || query.salt_version != peer.salt_version || query.m != peer.m {
        return RouteScore {
            total: 0.0,
            lexical_hit: 0.0,
            concept_hit: 0.0,
            subject_hit: 0.0,
            freshness: 0.0,
        };
    }

    let lexical_hit = bloom_hit(&query.lexical_bloom, &peer.lexical_bloom);
    let concept_hit = bloom_hit(&query.concept_bloom, &peer.concept_bloom);
    let subject_hit = bloom_hit(&query.subject_bloom, &peer.subject_bloom);
    let freshness = freshness_score(peer.updated_at, peer.ttl_ms, now_ms);
    let total =
        clamp01(0.55 * lexical_hit + 0.25 * concept_hit + 0.10 * subject_hit + 0.10 * freshness);

    RouteScore {
        total,
        lexical_hit,
        concept_hit,
        subject_hit,
        freshness,
    }
}

pub fn bloom_hit(query_b64: &str, peer_b64: &str) -> f64 {
    let Ok(query) = STANDARD.decode(query_b64) else {
        return 0.0;
    };
    let Ok(peer) = STANDARD.decode(peer_b64) else {
        return 0.0;
    };

    let mut query_bits = 0u32;
    let mut hit_bits = 0u32;
    for (q, p) in query.iter().zip(peer.iter()) {
        query_bits += q.count_ones();
        hit_bits += (q & p).count_ones();
    }

    if query_bits == 0 {
        0.0
    } else {
        hit_bits as f64 / query_bits as f64
    }
}

fn freshness_score(updated_at: u64, ttl_ms: u64, now_ms: u64) -> f64 {
    if ttl_ms == 0 || updated_at == 0 {
        return 0.5;
    }
    let age = now_ms.saturating_sub(updated_at);
    if age >= ttl_ms {
        0.2
    } else {
        1.0 - (age as f64 / ttl_ms as f64) * 0.5
    }
}

fn clamp01(value: f64) -> f64 {
    value.max(0.0).min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bloom_hit_counts_intersection_over_query_bits() {
        let query = STANDARD.encode([0b0000_1111u8]);
        let peer = STANDARD.encode([0b0000_1010u8]);
        assert!((bloom_hit(&query, &peer) - 0.5).abs() < 0.001);
    }
}
