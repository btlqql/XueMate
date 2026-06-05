# XueMate Rust MCP Gateway 真实链路对比测试

- 时间：2026-06-05T14:42:00.645Z
- Bridge：`http://127.0.0.1:8788`
- 样本：warmup=2, samples=8
- Rust binary：`/Users/wangyue/wangyue/XueMate/mcp-gateway-rs/target/release/xuemate-mcp-gateway`

## 结果

| 场景 | Direct HTTP avg | MCP avg | MCP额外耗时 | p95 Direct | p95 MCP |
|---|---:|---:|---:|---:|---:|
| health | 0.38ms | 0.24ms | -0.14ms (-36.8%) | 0.65ms | 0.34ms |
| rag.collections | 0.27ms | 0.21ms | -0.06ms (-22.2%) | 0.42ms | 0.3ms |
| learningGraph.default | 11.99ms | 12.79ms | 0.8ms (6.7%) | 14.92ms | 17.55ms |
| rag.retrieve | 691.79ms | 597.56ms | -94.23ms (-13.6%) | 979.94ms | 992.51ms |

## 结论口径

- Direct HTTP：Node benchmark 直接请求 Electron `rendererBridge`。
- MCP：Node benchmark 通过 stdio JSON-RPC 调 Rust MCP Gateway，再由 Gateway 请求同一个 Electron `rendererBridge`。
- 这个测试不使用 mock；要求本地 XueMate dev app 和真实 SQLite/服务已启动。
- MCP 路径多一跳，单次延迟通常略高；它的价值在工具标准化、外部 Agent 接入、并发编排和动作队列。