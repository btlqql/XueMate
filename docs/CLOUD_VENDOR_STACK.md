# XueMate Cloud Vendor Stack

XueMate Cloud 现在采用轻量云端网络栈：去掉 Crawl4AI 重型浏览器镜像，保留搜索聚合、云端编排、网页正文抽取、资源评分和指标。

```txt
XueMate Electron
  -> XueMate Cloud Gateway (:8787)
      -> SearXNG (:8080) 搜索聚合
      -> Gateway Direct Fetch 网页正文抽取/清洗
      -> XueMate Scorer 适龄性/可信度/可读性评分
```

## 已保留的开源模块

| 模块 | 路径 | 作用 | 协议 |
|---|---|---|---|
| SearXNG | `/Users/wangyue/wangyue/XueMate/cloud/services/search/searxng` | 元搜索/多搜索源聚合源码；运行时用官方镜像快速启动 | AGPL-3.0 |

## 为什么删除 Crawl4AI

Crawl4AI 官方镜像会携带浏览器/Playwright/Chromium/Python 依赖，首次拉取和启动都偏重。比赛演示优先要求稳定，所以当前版本改成：

1. SearXNG 负责云端搜索聚合。
2. Gateway 直接抓取网页 HTML 并做正文清洗。
3. Scorer 进行相关度、适龄性、可信度、可读性、广告噪声评分。
4. Electron 端展示云端模式、TaskId、阶段流水和评分。

## 本地启动

```bash
cd /Users/wangyue/wangyue/XueMate
npm run cloud:docker
```

健康检查：

```bash
curl http://127.0.0.1:8787/health
curl 'http://127.0.0.1:8080/search?q=小学生冒泡排序&format=json'
```

资源搜索：

```bash
curl -X POST http://127.0.0.1:8787/api/resource/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"小学生冒泡排序动画讲解","limit":4}'
```

## 服务器部署

服务器资源更充足时使用全量模式，额外启用 Crawl4AI basic-amd64 浏览器抽取服务：

```bash
cd /home/wzu/xuemate-cloud
docker compose -f docker-compose.yml -f docker-compose.full.yml -f docker-compose.server.yml up -d
```

当前服务器目标：

```txt
100.70.188.115:8787  -> XueMate Cloud Gateway
100.70.188.115:8080  -> SearXNG
100.70.188.115:11235 -> Crawl4AI
```

Electron 主进程通过环境变量连接 Cloud Gateway：

```bash
XUEMATE_CLOUD_URL=http://100.70.188.115:8787
```

如果云端不可用，`/Users/wangyue/wangyue/XueMate/src/main/services/quickSearch.ts` 会自动回退到本地 `searchAndFetch()`。


## 搜索稳定性优化

服务器上 SearXNG 的免费搜索源可能被上游搜索引擎限流。Gateway 已做三层兜底：

1. 查询改写：例如“小学生 Python 冒泡排序 动画课程”会改写为“Python 冒泡排序”。
2. 搜索回退：SearXNG 无结果时回退到直接搜索结果页抓取。
3. 编程学习种子源：识别 Python/排序/冒泡场景时加入菜鸟教程、博客园、慕课、SegmentFault 等候选源，再统一交给 Crawl4AI 抽取和 Scorer 评分。

## 2026-06-05 快搜优化

原问题：全量云端查找慢，主要来自 SearXNG 上游搜索源限流/超时，以及 Crawl4AI 同步抽网页逐个执行。

当前优化：

1. `XUEMATE_CLOUD_FAST_MODE=true`：默认开启快搜模式。
2. 编程学习场景优先走稳定候选源：Python/冒泡排序会直接加入菜鸟教程、博客园、慕课、SegmentFault 等候选。
3. SearXNG 单次超时压到 `2500ms`，避免被上游搜索源拖慢。
4. Crawl4AI 超时压到 `6500ms`。
5. 网页正文抽取从串行改为并发，默认并发度 `4`。
6. Gateway 缓存命中后通常几十毫秒返回。

实测服务器 `100.70.188.115`：

| 查询 | 优化前 | 优化后首查 | 缓存命中 |
|---|---:|---:|---:|
| 小学生 Python 冒泡排序 动画课程 | 34-75s | 约 2.2s | 约 30ms |
