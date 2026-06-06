use crate::types::{now_ms, EvidenceCard};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone)]
pub struct EvidenceCache {
    inner: Arc<Mutex<HashMap<String, CacheEntry>>>,
    ttl_ms: u64,
    max_entries: usize,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    expires_at: u64,
    value: Vec<EvidenceCard>,
}

impl EvidenceCache {
    pub fn new(ttl_ms: u64, max_entries: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            ttl_ms,
            max_entries: max_entries.max(1),
        }
    }

    pub async fn get(&self, key: &str) -> Option<Vec<EvidenceCard>> {
        let now = now_ms();
        let mut guard = self.inner.lock().await;
        let entry = guard.get(key)?;
        if entry.expires_at < now {
            guard.remove(key);
            return None;
        }
        Some(entry.value.clone())
    }

    pub async fn put(&self, key: String, value: Vec<EvidenceCard>) {
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
        guard.insert(
            key,
            CacheEntry {
                expires_at: now_ms() + self.ttl_ms,
                value,
            },
        );
    }
}
