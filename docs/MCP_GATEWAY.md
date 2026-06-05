# XueMate Rust MCP Gateway

XueMate 的 Rust MCP 层采用“协议网关”设计：不重写 RAG、知识图谱、记忆或 Computer Use，只把现有 Electron 主进程能力通过 MCP tools/resources 暴露给外部 Agent。

```txt
MCP Client / Agent
  -> Rust stdio MCP Gateway
  -> http://127.0.0.1:8788 Electron rendererBridge
  -> RAG / LearningGraph / Memory / QuickSearch
```

## 为什么这样接

- 现有业务逻辑已经在 Electron main service 中：SQLite、RAG 检索、图谱生成、记忆系统、网页搜索。
- Rust 直接读 `~/.xuemate/xuemate.db` 会绕过业务逻辑，也会引入 SQLite 并发/锁风险。
- MCP Gateway 只做标准协议层、超时/编排层，复杂度可控。

## 已落地内容

### Rust MCP Gateway

路径：

```txt
/Users/wangyue/wangyue/XueMate/mcp-gateway-rs
```

启动方式：

```bash
npm run mcp:build
XUEMATE_RENDERER_BRIDGE_URL=http://127.0.0.1:8788 \
  ./mcp-gateway-rs/target/release/xuemate-mcp-gateway
```

当前是 stdio MCP server。stdout 只输出 JSON-RPC/MCP 响应，日志走 stderr。

### 调用缓存

Gateway 内置进程内 TTL 缓存，用来复用短时间内重复的只读工具调用：

```txt
默认 TTL：15000ms
默认最大条目：128
关闭缓存：XUEMATE_MCP_CACHE=off
调整 TTL：XUEMATE_MCP_CACHE_TTL_MS=30000
调整容量：XUEMATE_MCP_CACHE_MAX_ENTRIES=256
单次跳过：tool arguments 传 noCache=true
```

当前缓存这些只读能力：

```txt
xuemate.rag.collections
xuemate.rag.documents
xuemate.rag.stats
xuemate.rag.retrieve
xuemate.learningGraph.get
xuemate.memory.get
resources/read
```

`xuemate.quickSearch.run` 默认不缓存，因为它依赖实时网络搜索。

### Electron bridge 新增接口

文件：

```txt
/Users/wangyue/wangyue/XueMate/src/main/services/rendererBridge.ts
```

已有：

```txt
GET  /health
GET  /api/rag/collections
GET  /api/rag/documents?collectionId=...
GET  /api/rag/stats?collectionId=...
GET  /api/rag/learningGraph?collectionId=...
```

新增：

```txt
POST /api/rag/retrieve
GET  /api/memory
GET  /api/memory/archive?module=topics|weak|strong
POST /api/quick-search/run
```

### MCP tools

```txt
xuemate.bridge.health
xuemate.rag.collections
xuemate.rag.documents
xuemate.rag.stats
xuemate.rag.retrieve
xuemate.learningGraph.get
xuemate.memory.get
xuemate.quickSearch.run
```

### MCP resources

```txt
xuemate://bridge/health
xuemate://rag/collections
xuemate://learning-graph/all
xuemate://memory/profile
xuemate://memory/archive/topics
```

## 真实链路 benchmark

脚本：

```txt
/Users/wangyue/wangyue/XueMate/scripts/bench-mcp-layer.mjs
```

运行前需要先启动 XueMate：

```bash
npm run dev
```

另一个终端运行：

```bash
npm run bench:mcp
```

输出：

```txt
/Users/wangyue/wangyue/XueMate/docs/reports/mcp-benchmark-latest.json
/Users/wangyue/wangyue/XueMate/docs/reports/mcp-benchmark-latest.md
```

对比口径：

- Direct HTTP：benchmark 直接请求 Electron `rendererBridge`。
- MCP cold：benchmark 通过 stdio JSON-RPC 调 Rust MCP Gateway，并传 `noCache=true` 跳过 Gateway 缓存。
- MCP cached：同一个 Gateway 进程内重复调用同一 tool，命中 TTL 缓存。
- 不使用 mock，读取本地真实 SQLite、真实 RAG、真实图谱服务。

## 结论

Rust MCP 单次工具调用会多一跳，通常不会让单个 HTTP 请求更快；它的收益主要是：

- 外部 Agent 标准化接入；
- 工具 schema 固定，减少 prompt 和 UI 状态依赖；
- 后续可在 Rust 层做并发编排、超时、重试、动作队列；
- Computer Use 第二阶段可把 `observe -> act -> wait -> observe` 做成串行安全队列。
