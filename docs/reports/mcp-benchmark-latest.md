# XueMate Rust MCP Gateway 真实链路对比测试

- 时间：2026-06-05T14:50:42.820Z
- Bridge：`http://127.0.0.1:8788`
- 样本：warmup=2, samples=8
- Rust binary：`/Users/wangyue/wangyue/XueMate/mcp-gateway-rs/target/release/xuemate-mcp-gateway`
- MCP 缓存：进程内 TTL 缓存，默认 15000ms，可用 `XUEMATE_MCP_CACHE=off` 关闭。

## 结果

| 场景 | Direct HTTP avg | MCP cold avg | MCP cached avg | MCP额外耗时 | 缓存节省 | p95 Direct | p95 MCP cold |
|---|---:|---:|---:|---:|---:|---:|---:|
| health | 0.41ms | 0.24ms | - | -0.17ms (-41.5%) | - | 0.63ms | 0.42ms |
| rag.collections | 0.3ms | 0.26ms | 0.06ms | -0.04ms (-13.3%) | 0.2ms (76.9%) | 0.44ms | 0.4ms |
| learningGraph.default | 12.27ms | 13.5ms | 0.73ms | 1.23ms (10%) | 12.77ms (94.6%) | 15.67ms | 19.98ms |
| rag.retrieve | 471.62ms | 428.9ms | 1.35ms | -42.72ms (-9.1%) | 427.55ms (99.7%) | 545.16ms | 563.14ms |

## 结论口径

- Direct HTTP：Node benchmark 直接请求 Electron `rendererBridge`。
- MCP cold：Node benchmark 通过 stdio JSON-RPC 调 Rust MCP Gateway，并传 `noCache=true` 跳过 Gateway 缓存。
- MCP cached：同一个 Rust MCP Gateway 进程内重复调用同一 tool，命中 TTL 缓存。
- 这个测试不使用 mock；要求本地 XueMate dev app 和真实 SQLite/服务已启动。
- 缓存适合 RAG 检索、知识图谱、资料夹/记忆等短时间重复调用；写操作和 quickSearch 默认不缓存。