# PeerEdge TODO：隐私路由与后台网络升级

## P0：保持后台隐藏和解耦

- 前端默认不展示 PeerEdge 页面、IP、节点列表、RAG 图标。
- Electron 只把 PeerEdge 当作可选证据源：失败则降级，不影响本机聊天/RAG。
- Rust sidecar 只负责网络层，不直接操作 UI、不直接读业务 SQLite。

## P1：Bloom Filter / Sketch 隐私路由

现状如果盲目 fan-out 问所有 peer，会浪费网络，也会暴露更多查询意图。下一步要做“概念摘要路由”：节点之间只交换摘要，不交换原文。

### 每个节点后台生成 Resource Sketch

```json
{
  "nodeId": "hash_node_xxx",
  "group": "class_4a_hash",
  "subjectBloom": "base64...",
  "conceptBloom": "base64...",
  "keywordBloom": "base64...",
  "embeddingSketch": [12, -4, 8, 3],
  "gradeBand": "primary",
  "docCountBucket": "10-30",
  "updatedAt": 1780000000000,
  "ttlMs": 300000
}
```

### 查询路由

```txt
学生问题
  → 本机提取 concepts/keywords
  → 构造 Query Sketch
  → 本地 Peer Directory 匹配 Bloom/Sketch
  → 只问 top-m 个可能有资料的节点
  → 返回脱敏 Evidence Cards
```

### 路由评分草案

```txt
RouteScore(peer, query)
= 0.45 * BloomHit(concepts)
+ 0.25 * SketchSimilarity(embeddingSketch)
+ 0.15 * SubjectGradeMatch
+ 0.10 * PeerQuality
+ 0.05 * Freshness
- 0.20 * PrivacyRisk
```

### 隐私原则

- 不广播原文。
- 不广播完整文件名。
- 不广播学生姓名。
- 不广播完整 embedding。
- Bloom Filter 加 salt；按班级 group 定期轮换。
- embedding sketch 用随机投影 + 低比特量化，只用于粗路由。
- 命中后仍只返回 snippet/evidence，不返回完整资料。

## P2：mDNS / Bonjour 自动发现

状态：基础能力已落地到 `peer-edge-rs/src/discovery.rs`。

- 服务名：`_xm-edge._tcp.local.`
- TXT 只放协议版本、node/group、public URL、caps、sketch digest。
- 已支持 ServiceResolved 后写入内存 Peer Directory。
- 已支持 seed 与 mDNS 合并。
- 下一步：发现后拉取 `/api/peeredge/sketch`，把 sketch 写入 Directory 并参与 RouteScore。

## P3：Peer Directory 和缓存

Rust 内维护：

```txt
Peer Directory
  peerId -> publicBaseUrl/status/lastSeen/sketchDigest
Concept Route Cache
  querySketch -> topPeers
Evidence Cache
  queryHash -> evidence cards
```

## P4：接入聊天/RAG

低置信度触发：

```txt
localRagConfidence < threshold
  → retrievePeerEvidence(query)
  → 合并本机证据 + peer evidence
  → 重新组装回答上下文
```
