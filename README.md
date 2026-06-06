# xuemate-app

An Electron application with Vue

## Focused Delivery Scenario

XueMate 的最终定位是：**面向小学生的全面学习助手**。

它不是单纯的编程产品，也不是泛泛的聊天机器人。它覆盖小学学习中的：

- 资料问答
- 作业辅导
- 动画讲解
- 长期学习画像
- 复习队列
- 网页资料辅助

答辩/demo 为了避免太散，选择一个代表性内容：**小学编程启蒙中的冒泡排序**。

核心 demo：

```txt
学生不理解 Python 冒泡排序
-> XueMate 读取老师课件和作业要求
-> 结合学生长期薄弱点
-> 用动画解释算法过程
-> 给代码修改提示但不直接代写
-> 自动寻找教学网页
-> 把循环/索引问题写入复习队列
```

交付口径：

> XueMate 是面向小学生的全面学习助手。答辩中用“编程启蒙/冒泡排序”作为代表场景，展示资料问答、长期记忆、动画讲解、代码辅导和网页资料辅助如何形成完整学习闭环。

Detailed scenario script:

- `docs/FOCUSED_SCENARIO.md`

## Competition Positioning

XueMate 当前建议参赛口径：**中国高校计算机大赛-网络技术挑战赛 创意（A）普通 A 赛项**。

参赛包装不要讲成单纯“小学生 AI 聊天助手”，而要讲成：

> 面向小学学习场景的云边协同智能学习网络平台。

对应网络技术方向：网络智能、云边协同、边缘 RAG、网络数据分析、多模态网页智能体。

Detailed competition analysis:

- `docs/COMPETITION_POSITIONING.md`

## Expert Review Notes

### Learning graph upgrade

XueMate 已接入 Sigma.js + Graphology，新增类似 Obsidian Graph 的「学习网络」：

- 把资料夹、文档、chunk、知识点、Memory Atom、复习任务组织成关系图。
- Sigma.js 负责 WebGL 图谱渲染，Graphology 负责图数据结构。
- 支持节点搜索、类型过滤、点击查看关联证据。
- 答辩口径：个性化学习知识图谱 / 学习资源网络可解释面板。

入口：

- `我的资料 -> 学习网络`

### RAG retrieval upgrade

XueMate 的资料问答已经从简单的「向量 TopK」升级为专家版 Hybrid RAG：

- 语义向量召回：理解学生的自然语言问题。
- 关键词召回：提升公式、专有名词、原文概念命中率。
- 章节结构信号：利用文件名、章节标题、重点/难点/例题等结构信息。
- MMR 多样性去重：避免多个重复片段占满上下文。
- 结构化引用：回答时可使用 `[资料1]` 这种可解释引用。

内部可复现 benchmark 数据：

| Metric                             | Dense TopK Baseline |        Hybrid RAG |   Lift |
| ---------------------------------- | ------------------: | ----------------: | -----: |
| Recall@K                           |              93.33% |            96.67% | +3.57% |
| Precision@K                        |              46.67% |            50.00% | +7.14% |
| nDCG@K                             |              89.40% |            97.04% | +8.55% |
| Context Waste                      |              53.33% |            50.00% | -6.25% |
| MRR                                |              95.00% |           100.00% | +5.26% |
| Context Compression vs full corpus |                   - | 82.14% less input |      - |

Run the benchmark:

```bash
npm run --silent bench:rag
```

Detailed design and methodology:

- `docs/RAG_METRICS.md`
- `docs/benchmarks/rag-benchmark-2026-05-29.json`
- `docs/benchmarks/expert-metrics-2026-05-29.json`

### Memory system upgrade

XueMate 的长期记忆系统也升级为专家版 Memory Atom 架构：

- 分层记忆：profile / preference / topic / weak_point / strong_point / goal / behavior / misconception。
- 每条记忆都有 confidence、importance、evidence、hits、firstSeen、lastSeen。
- 支持时间衰减，旧信息会自然降权。
- 自动生成学习画像 Learning Profile 和复习队列 Review Queue。
- Prompt 注入只选择高价值、未过期、有证据的记忆，减少上下文浪费。

内部可复现 benchmark 数据：

| Metric                | Flat Memory Baseline | Atom Memory |    Lift |
| --------------------- | -------------------: | ----------: | ------: |
| Prompt items          |                   18 |          11 | -38.89% |
| Prompt chars          |                  531 |         333 | -37.29% |
| Duplicate facts       |                    5 |           0 |   -100% |
| Stale facts           |                    2 |           0 |   -100% |
| Review queue coverage |                   0% |        100% |   +100% |

Run the benchmark:

```bash
npm run --silent bench:memory
```

Detailed design and methodology:

- `docs/MEMORY_SYSTEM.md`
- `docs/benchmarks/memory-benchmark-2026-05-29.json`
- `docs/benchmarks/expert-metrics-2026-05-29.json`

## XueMate Local Web Search

快速查资料已收敛为本地网页查询链路，不再维护外部搜索网关、Docker 搜索栈或 Crawl4AI vendor 目录：

- Electron 主进程通过 `/Users/wangyue/wangyue/XueMate/src/main/services/web.ts` 打开搜索页并抓取正文。
- `/Users/wangyue/wangyue/XueMate/src/main/services/quickSearch.ts` 做安全检查、网页摘要和本机 SQLite 历史记录写入。
- `.env.example` 只保留 `XUEMATE_QUICK_SEARCH_MODE=local`，演示部署不需要额外 cloud/search 服务。

详细说明：

- `/Users/wangyue/wangyue/XueMate/docs/WEB_SEARCH_VENDOR_STACK.md`

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
