# XueMate PeerEdge 后台边缘协同网络骨架

PeerEdge 的目标是把“同班学生设备”组织成后台边缘学习网络。前端默认不显示节点、不显示 IP、不显示 RAG/Peer 图标；聊天和学习流程只把它当作一个可选证据来源。

## 设计边界

- Rust sidecar 只做网络层：节点发现、心跳、并发 fan-out、超时隔离、缓存、结果初筛。
- Electron/TypeScript 继续负责：本机 RAG、LLM、Memory、UI、SQLite 业务数据。
- Rust 进程缺失、启动失败、端口冲突时，主应用只记录日志并降级，不影响原有聊天/RAG/Computer Use。

## 进程结构

```txt
Electron Main
  ├─ RendererBridge: http://127.0.0.1:8788
  └─ PeerEdge Runtime: peer-edge-rs/target/*/xuemate-peer-edge
        ├─ 本地控制接口: /health /peers /fanout-retrieve
        └─ 同伴接口: /api/peeredge/health /api/peeredge/retrieve
```

## 地址设计：不要硬编码机器 IP

PeerEdge 分两类地址：

- 本地控制面：Electron 调 Rust daemon，固定走 `127.0.0.1:<port>`，只在本机进程间通信。
- 同伴数据面：给同班节点访问的 `publicBaseUrl`，不能写死；优先读 `XUEMATE_PEEREDGE_PUBLIC_URL`，不填时由 Rust 根据 `XUEMATE_PEEREDGE_BIND` 自动推导。

如果 `XUEMATE_PEEREDGE_BIND=0.0.0.0`，Rust 会尝试自动探测局域网 IP 作为 `publicBaseUrl`；如果探测失败才回退到 `127.0.0.1`。后续 mDNS 广播也应该广播 `publicBaseUrl`，而不是本地 loopback。

Bloom Filter / Sketch 隐私路由已放入 `/Users/wangyue/wangyue/XueMate/docs/PEER_EDGE_TODO.md`。


## mDNS 自动发现

当前 Rust daemon 已落地 mDNS Discovery：

```txt
服务类型：_xm-edge._tcp.local.
协议：peeredge-v1
TXT：proto / node / group / public / caps / sketch
```

发现流程：

```txt
PeerEdge daemon 启动
  → mDNS browse _xm-edge._tcp.local.
  → 如果 publicBaseUrl 不是 loopback，则 register 自己
  → 收到 ServiceResolved
  → 校验 proto=peeredge-v1
  → 校验 group 相同
  → 排除本机 nodeId
  → 写入内存 Peer Directory
```

控制面仍然走 `127.0.0.1:<port>`，只给 Electron 调 Rust；mDNS 广播的是数据面 `publicBaseUrl`。默认不会把 `127.0.0.1` 注册给其他设备，除非设置 `XUEMATE_PEEREDGE_MDNS_ALLOW_LOOPBACK=1` 做本机多节点调试。

可选模式：

```env
XUEMATE_PEEREDGE_DISCOVERY=auto   # mDNS + seed
XUEMATE_PEEREDGE_DISCOVERY=mdns   # 只用 mDNS
XUEMATE_PEEREDGE_DISCOVERY=seed   # 只用 XUEMATE_PEEREDGE_SEEDS
XUEMATE_PEEREDGE_DISCOVERY=off    # 不发现 peer
```

本机双节点 mDNS 调试示例：

```bash
XUEMATE_PEEREDGE_DISCOVERY=mdns \
XUEMATE_PEEREDGE_MDNS_PORT=55353 \
XUEMATE_PEEREDGE_MDNS_ALLOW_LOOPBACK=1 \
XUEMATE_PEEREDGE_NODE_ID=node-a \
XUEMATE_PEEREDGE_GROUP=test-mdns \
XUEMATE_PEEREDGE_PORT=20001 \
XUEMATE_PEEREDGE_PUBLIC_URL=http://127.0.0.1:20001 \
npm run peeredge:dev
```

另开一个节点改成 `node-b` 和 `20002`，然后访问：

```bash
curl http://127.0.0.1:20001/peers
```

应该能看到 `node-b`。

## 当前骨架能力

- `peer-edge-rs`：Rust/Tokio/Axum 后台 daemon。
- `src/main/services/peerEdgeRuntime.ts`：Electron 可选启动/停止 sidecar。
- `src/main/services/peerEdge.ts`：TypeScript 层的解耦 facade，供后续聊天/RAG 在低置信度时调用。
- 默认 `XUEMATE_PEEREDGE=auto`：二进制存在则后台启动；不存在则静默跳过。

## 接口

### 本地控制接口

```txt
GET  /health
GET  /peers
POST /fanout-retrieve
```

`POST /fanout-retrieve`：

```json
{
  "query": "为什么冒泡排序内层循环要 len(arr)-1-i？",
  "topK": 5,
  "collectionId": "all",
  "timeoutMs": 650,
  "peerLimit": 4
}
```

### 同伴接口

```txt
GET  /api/peeredge/health
POST /api/peeredge/retrieve
```

同伴接口只返回脱敏证据卡：

```json
{
  "source": "peer-rag-snippet",
  "peerId": "peeredge-12345",
  "group": "class-demo",
  "fileName": "冒泡排序错题.md",
  "chunkId": "chunk_xxx",
  "snippet": "内层循环到 len(arr)-1-i 是为了避免 j+1 越界……",
  "score": 0.86,
  "rankReason": ["语义相关", "关键词覆盖"]
}
```

不会返回 embedding、完整聊天、完整 Memory、完整文件。

## 多节点本机调试

先构建 Rust：

```bash
npm run peeredge:build
```

节点 A：

```bash
HOME=/tmp/xuemate-a \
XUEMATE_RENDERER_BRIDGE_PORT=8788 \
XUEMATE_PEEREDGE_PORT=18888 \
XUEMATE_PEEREDGE_SEEDS=http://127.0.0.1:18889 \
npm run dev
```

节点 B：

```bash
HOME=/tmp/xuemate-b \
XUEMATE_RENDERER_BRIDGE_PORT=8789 \
XUEMATE_PEEREDGE_PORT=18889 \
XUEMATE_PEEREDGE_SEEDS=http://127.0.0.1:18888 \
npm run dev
```

后续接入 mDNS/Bonjour 时，只替换 `peer-edge-rs/src/discovery.rs`，不动 UI/RAG/LLM 层。
