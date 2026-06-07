# Internal Agent MCP Benchmark

- Date: 2026-06-07T12:50:31.259Z
- Bridge: `http://127.0.0.1:8788`
- MCP Gateway: `/Users/wangyue/wangyue/XueMate/mcp-gateway-rs/target/release/xuemate-mcp-gateway`
- Query: 函数单调性和导数有什么关系？
- Collection: all
- Samples: 16, warmup: 3

| Scenario | Avg | P50 | P95 | Min | Max | Last result count |
|---|---:|---:|---:|---:|---:|---:|
| direct cold | 533.19ms | 481.95ms | 859.18ms | 320.42ms | 859.18ms | 4 |
| direct cached | 1.49ms | 1.41ms | 2ms | 1.16ms | 2ms | 4 |
| internal MCP cold | 465.12ms | 440.76ms | 987.29ms | 289.05ms | 987.29ms | 4 |
| internal MCP cached | 0.95ms | 0.91ms | 1.24ms | 0.8ms | 1.24ms | 4 |

## Interpretation

- MCP cached vs direct cached avg delta: 0.54ms (MCP faster)
- MCP gateway cache saved avg: 464.17ms compared with MCP cold.
- cold 场景每轮会清 Electron bridge cache；cached 场景保留 bridge + gateway cache，模拟内部 agent 对同一学习上下文的重复工具调用。
- direct 场景代表旧的 bridge/direct 工具调用路径；internal MCP 场景代表现在内部 agent 走 MCP 工具层。
