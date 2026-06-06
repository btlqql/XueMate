# XueMate Local Web Search

XueMate 快速查资料当前只保留本地网页查询链路。外部 cloud 搜索网关、Docker 搜索栈、SearXNG vendor 源码和 Crawl4AI vendor 源码已经删除，比赛演示时不需要额外服务器。

```txt
学生输入问题
  -> Electron 主进程 quickSearch()
  -> 安全检查 checkSearchSafety()
  -> 本地隐藏 BrowserWindow 打开 Bing 搜索页
  -> 抽取结果页链接并抓取正文
  -> summarizeResults() 生成适合小学生阅读的摘要
  -> SQLite 保存最近整理记录
  -> 前端展示摘要、参考网页和耗时
```

## 为什么删除外部搜索栈

1. 外部搜索网关会增加 Docker、网络、端口和部署说明，比赛现场容易出问题。
2. Crawl4AI / SearXNG vendor 目录体积大，维护成本高，和 XueMate 主场景关系弱。
3. 小学生学习助手更需要稳定、可解释、可本机演示的流程。
4. Computer Use 已负责“操作网页”，快速查资料只保留“查网页并总结”这一条清晰能力。

## 当前代码入口

| 模块     | 文件                                                                                    | 说明                                               |
| -------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 查询编排 | `/Users/wangyue/wangyue/XueMate/src/main/services/quickSearch.ts`                       | 校验问题、调用网页抓取、生成摘要、返回本地结果     |
| 网页抓取 | `/Users/wangyue/wangyue/XueMate/src/main/services/web.ts`                               | 使用 Electron BrowserWindow / net 抓搜索结果和正文 |
| 历史记录 | `/Users/wangyue/wangyue/XueMate/src/main/services/quickSearchStore.ts`                  | 保存最近整理记录，供前端展示                       |
| 前端面板 | `/Users/wangyue/wangyue/XueMate/src/renderer/src/components/agent/QuickSearchPanel.vue` | 展示搜索框、摘要、参考网页和本机历史               |

## 运行方式

```bash
cd /Users/wangyue/wangyue/XueMate
npm run dev
```

无需运行外部搜索网关脚本或额外 Docker 服务。

## 验证点

- `package.json` 不再包含外部搜索网关 scripts。
- `.env.example` 不再包含外部搜索网关环境变量。
- `/Users/wangyue/wangyue/XueMate/cloud/` 已删除。
- 快速查资料结果统一返回 `mode: 'local'`。
