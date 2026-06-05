# XueMate Rust MCP Gateway 真实链路对比测试

- 时间：2026-06-05T15:21:01.287Z
- Bridge：`http://127.0.0.1:8788`
- 样本：warmup=2, samples=8
- Rust binary：`/Users/wangyue/wangyue/XueMate/mcp-gateway-rs/target/release/xuemate-mcp-gateway`
- Electron bridge 缓存：TTL 30000ms，可用 `XUEMATE_BRIDGE_CACHE=off` 关闭。
- MCP 缓存：进程内 TTL 缓存，默认 15000ms，可用 `XUEMATE_MCP_CACHE=off` 关闭。

## 结果

| 场景                  | Direct cold avg | Direct bridge cached avg | MCP cold avg | MCP cached avg |       MCP额外耗时 |   Bridge缓存节省 |      MCP缓存节省 | p95 Direct cold | p95 MCP cold |
| --------------------- | --------------: | -----------------------: | -----------: | -------------: | ----------------: | ---------------: | ---------------: | --------------: | -----------: |
| health                |           0.4ms |                        - |       0.24ms |              - |    -0.16ms (-40%) |                - |                - |          0.71ms |       0.38ms |
| rag.collections       |          0.21ms |                   0.26ms |       0.19ms |         0.05ms |   -0.02ms (-9.5%) | -0.05ms (-23.8%) |   0.14ms (73.7%) |          0.25ms |       0.23ms |
| learningGraph.default |         11.93ms |                   0.74ms |      12.75ms |         0.73ms |     0.82ms (6.9%) |  11.19ms (93.8%) |  12.02ms (94.3%) |         14.32ms |      20.77ms |
| rag.retrieve          |        724.06ms |                   0.94ms |     642.18ms |         0.83ms | -81.88ms (-11.3%) | 723.12ms (99.9%) | 641.35ms (99.9%) |        965.66ms |     945.41ms |

## 结论口径

- Direct cold：Node benchmark 直接请求 Electron `rendererBridge`，并传 `noCache=true` 跳过 bridge 缓存。
- Direct bridge cached：Node benchmark 直接请求 Electron `rendererBridge`，命中 bridge 二级缓存。
- MCP cold：Node benchmark 通过 stdio JSON-RPC 调 Rust MCP Gateway，并传 `noCache=true` 跳过 Gateway 与 bridge 缓存。
- MCP cached：同一个 Rust MCP Gateway 进程内重复调用同一 tool，命中 Gateway TTL 缓存。
- 这个测试不使用 mock；要求本地 XueMate dev app 和真实 SQLite/服务已启动。
- 缓存适合 RAG 检索、知识图谱、资料夹/记忆等短时间重复调用；写操作和 quickSearch 默认不缓存。
