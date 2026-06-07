use crate::sketch::PeerEdgeSketch;
use crate::types::now_ms;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone)]
pub struct SketchCache {
    inner: Arc<Mutex<HashMap<String, CacheEntry>>>,
    fallback_ttl_ms: u64,
    max_entries: usize,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    digest: String,
    expires_at: u64,
    value: PeerEdgeSketch,
}

impl SketchCache {
    pub fn new(fallback_ttl_ms: u64, max_entries: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            fallback_ttl_ms,
            max_entries: max_entries.max(1),
        }
    }

    pub async fn get(&self, base_url: &str, expected_digest: &str) -> Option<PeerEdgeSketch> {
        let key = normalize_base_url(base_url);
        let now = now_ms();
        let mut guard = self.inner.lock().await;
        let entry = guard.get(&key)?;

        if !expected_digest.is_empty() && entry.digest != expected_digest {
            guard.remove(&key);
            return None;
        }
        if entry.expires_at < now {
            guard.remove(&key);
            return None;
        }

        Some(entry.value.clone())
    }

    pub async fn put(&self, base_url: &str, sketch: PeerEdgeSketch) {
        let key = normalize_base_url(base_url);
        let mut guard = self.inner.lock().await;
        if guard.len() >= self.max_entries {
            if let Some(oldest_key) = guard
                .iter()
                .min_by_key(|(_, entry)| entry.expires_at)
                .map(|(key, _)| key.clone())
            {
                guard.remove(&oldest_key);
            }
        }

        let ttl = if sketch.ttl_ms == 0 {
            self.fallback_ttl_ms
        } else {
            sketch.ttl_ms.min(self.fallback_ttl_ms.max(sketch.ttl_ms))
        };
        guard.insert(
            key,
            CacheEntry {
                digest: sketch.digest.clone(),
                expires_at: now_ms() + ttl,
                value: sketch,
            },
        );
    }
}

fn normalize_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sketch(digest: &str) -> PeerEdgeSketch {
        PeerEdgeSketch {
            version: "peeredge-sketch-v1".to_string(),
            node_id: "n".to_string(),
            group: "g".to_string(),
            salt_version: "s".to_string(),
            m: 8,
            k: 1,
            lexical_bloom: "AA==".to_string(),
            subject_bloom: "AA==".to_string(),
            concept_bloom: "AA==".to_string(),
            doc_count_bucket: "0".to_string(),
            chunk_count_bucket: "0".to_string(),
            digest: digest.to_string(),
            updated_at: now_ms(),
            ttl_ms: 60_000,
        }
    }

    #[tokio::test]
    async fn invalidates_when_digest_changes() {
        let cache = SketchCache::new(60_000, 8);
        cache.put("http://a/", sketch("old")).await;
        assert!(cache.get("http://a", "old").await.is_some());
        assert!(cache.get("http://a", "new").await.is_none());
    }
}
