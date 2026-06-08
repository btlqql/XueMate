# Internal Agent MCP Benchmark

- Date: 2026-06-07T14:23:27.142Z
- Bridge: `http://127.0.0.1:8788`
- MCP Gateway: `/Users/wangyue/wangyue/XueMate/mcp-gateway-rs/target/release/xuemate-mcp-gateway`
- Query: 函数单调性和导数有什么关系？
- Collection: all
- Samples: 16, warmup: 3

| Scenario | Avg | P50 | P95 | Min | Max | Last result count |
|---|---:|---:|---:|---:|---:|---:|
| direct cold | 467.75ms | 415.96ms | 1108.9ms | 287.01ms | 1108.9ms | 4 |
| direct cached | 1.48ms | 1.44ms | 2.16ms | 1.02ms | 2.16ms | 4 |
| internal MCP cold | 523.66ms | 455.05ms | 949.34ms | 278.67ms | 949.34ms | 4 |
| internal MCP cached | 0.1ms | 0.09ms | 0.27ms | 0.07ms | 0.27ms | 4 |

## Interpretation

- MCP cached vs direct cached avg delta: 1.38ms (MCP faster)
- MCP gateway cache saved avg: 523.56ms compared with MCP cold.
- cold 场景每轮会清 Electron bridge cache；cached 场景保留 bridge + gateway cache，模拟内部 agent 对同一学习上下文的重复工具调用。
- direct 场景代表旧的 bridge/direct 两步工具调用路径；internal MCP 场景代表现在内部 agent 走 RS compound MCP 工具 `xuemate.agent.ragContext`。
