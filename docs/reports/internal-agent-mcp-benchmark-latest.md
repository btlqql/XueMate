# Internal Agent MCP Benchmark

- Date: 2026-06-07T12:25:38.528Z
- Bridge: `http://127.0.0.1:8788`
- MCP Gateway: `/Users/wangyue/wangyue/XueMate/mcp-gateway-rs/target/release/xuemate-mcp-gateway`
- Query: 函数单调性和导数有什么关系？
- Collection: all
- Samples: 16, warmup: 3

| Scenario | Avg | P50 | P95 | Min | Max | Last result count |
|---|---:|---:|---:|---:|---:|---:|
| direct cold | 414.17ms | 439.48ms | 623.13ms | 288.51ms | 623.13ms | 4 |
| direct cached | 1.11ms | 1.07ms | 1.29ms | 0.92ms | 1.29ms | 4 |
| internal MCP cold | 384.96ms | 341.15ms | 614.19ms | 289.77ms | 614.19ms | 4 |
| internal MCP cached | 0.99ms | 0.94ms | 1.59ms | 0.8ms | 1.59ms | 4 |

## Interpretation

- MCP cached vs direct cached avg delta: 0.12ms (MCP faster)
- MCP gateway cache saved avg: 383.97ms compared with MCP cold.
- cold 场景每轮会清 Electron bridge cache；cached 场景保留 bridge + gateway cache，模拟内部 agent 对同一学习上下文的重复工具调用。
- direct 场景代表旧的 bridge/direct 工具调用路径；internal MCP 场景代表现在内部 agent 走 MCP 工具层。
