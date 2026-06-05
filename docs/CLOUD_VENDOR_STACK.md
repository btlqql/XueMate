# XueMate Cloud Vendor Stack

XueMate Cloud 采用“开源微服务内置 + 自研 Gateway 编排”的方式：

```txt
XueMate Electron
  -> XueMate Cloud Gateway (:8787)
      -> SearXNG (:8080) 搜索聚合
      -> Crawl4AI (:11235) 网页抽取/Markdown 清洗
      -> XueMate Scorer 适龄性/可信度/可读性评分
```

## 已搬入的开源仓库

| 模块 | 路径 | 作用 | 协议 |
|---|---|---|---|
| Crawl4AI | `/Users/wangyue/wangyue/XueMate/cloud/services/crawler/crawl4ai` | 网页抓取、正文抽取、Markdown 化、JS 页面处理 | Apache-2.0 |
| SearXNG | `/Users/wangyue/wangyue/XueMate/cloud/services/search/searxng` | 元搜索/多搜索源聚合源码；运行时可用官方镜像快速启动 | AGPL-3.0 |

## Vendor 精简策略

已经删除上游仓库中与运行无关的内容：

- README / docs / changelog / sponsor / roadmap 等说明文档。
- tests / CI / .github / .vscode / devcontainer 等开发辅助目录。
- 示例测试文件、站点文档构建配置、无关隐藏配置。

保留内容：

- `cloud/third_party_licenses/`：保留开源协议来源。
- 运行源码：`crawl4ai/`、`searx/`、`searxng_extra/`。
- Docker/服务配置：`Dockerfile`、`container/`、`deploy/docker/`。
- Python 依赖和包元数据：`requirements*.txt`、`pyproject.toml`、`setup.py`、`uv.lock`。

精简后 cloud 目录保留两类源码：Crawl4AI 最小可构建源码、SearXNG 搜索服务核心源码；删除文档/测试/CI 等无关文件。运行时为了启动速度，docker-compose 默认使用 SearXNG 官方镜像，但项目内仍保留源码，便于答辩展示和后续二次开发。

## 为什么 SearXNG 仍默认用镜像启动

项目里已经保留 SearXNG 核心源码：

- `/Users/wangyue/wangyue/XueMate/cloud/services/search/searxng/searx`
- `/Users/wangyue/wangyue/XueMate/cloud/services/search/searxng/searxng_extra`
- `/Users/wangyue/wangyue/XueMate/cloud/services/search/searxng/container`

但本地演示时使用官方镜像启动更快、更稳定。答辩口径是：

> XueMate Cloud 内置了开源搜索聚合服务源码，并通过 Gateway 进行教育场景编排；演示环境使用容器镜像快速部署，后续可以直接基于本地源码裁剪搜索引擎和排序策略。

## 本地启动

```bash
cd /Users/wangyue/wangyue/XueMate/cloud
docker compose up --build
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8080/search?q=小学生冒泡排序&format=json
curl http://127.0.0.1:11235/health
```

资源搜索：

```bash
curl -X POST http://127.0.0.1:8787/api/resource/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"小学生冒泡排序动画讲解","limit":4}'
```

## 比赛表达

这不是普通后端，而是“云端网络资源智能调度层”：

1. SearXNG 负责开放网络学习资源聚合。
2. Crawl4AI 负责网页正文抽取和噪声过滤。
3. XueMate Gateway 负责任务编排、质量评分、缓存和指标。
4. Electron 端保留学生本地资料和学习画像，形成云边协同。

## Electron 端如何连接云端

Electron 主进程通过环境变量连接 Cloud Gateway：

```bash
XUEMATE_CLOUD_URL=http://127.0.0.1:8787
```

当前已接入的链路：

```txt
前端 快速查资料
  -> window.quickSearch.run(query)
  -> ipcMain quickSearch:run
  -> /Users/wangyue/wangyue/XueMate/src/main/services/quickSearch.ts
  -> /Users/wangyue/wangyue/XueMate/src/main/services/cloud.ts
  -> XueMate Cloud Gateway /api/resource/search
  -> SearXNG 搜索聚合
  -> Crawl4AI 网页抽取
  -> XueMate 资源评分
  -> 前端显示云端模式、TaskId、阶段、评分
```

如果云端没有启动，`quickSearch.ts` 会自动回退到本地 `searchAndFetch()`，所以不会影响普通演示。

### 启动顺序

1. 启动云端：

```bash
cd /Users/wangyue/wangyue/XueMate
npm run cloud:docker
```

2. 另开一个终端启动 Electron：

```bash
cd /Users/wangyue/wangyue/XueMate
npm run dev
```

3. 打开 `小实验 -> 快速查资料`，搜索：

```txt
小学生冒泡排序动画讲解
```

看到 `云端网络资源分析` 标签，就说明已经走云端。
