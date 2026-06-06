# Google Vertex 多模态理解接入 Computer Use

目标不是生图，而是让 Computer Use 用 Vertex AI 做“看截图、读 DOM 提示、返回下一步动作 JSON”。

## 当前结论（必须记住）

XueMate 的 Computer Use **默认视觉模型链路是 gcloud / Google Vertex**：

- Renderer 只负责显示任务、状态、实时 BrowserView 区域。
- Electron Main 调用 `runWebAssistant()`。
- `visionJson()` 在 `VISION_PROVIDER=google-vertex` 时转到 `googleVertexVision.ts`。
- `googleVertexVision.ts` 通过 Google Vertex `generateContent` 做多模态理解。
- 认证优先使用本机 `gcloud auth print-access-token`，不是必须配置 `VISION_API_KEY`。

因此排查 Computer Use 时，不要把“没有 VISION_API_KEY”误判成视觉模型不存在。只有在不使用 Vertex 的 OpenAI-compatible 路线时，才需要 `VISION_API_KEY`。

## 调用链

```txt
computerUse.runWebAssistant()
  -> captureBrowserState() 截图 + DOM 候选
  -> visionJson()
  -> googleVertexVision.vertexVisionJson()
  -> gcloud / service account / metadata server 获取 access token
  -> Vertex Gemini generateContent(TEXT-only output)
  -> JSON action
  -> performBrowserAction()
```

## 启用方式

本机：

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

`.env`：

```bash
VISION_PROVIDER=google-vertex
GOOGLE_VERTEX_PROJECT=YOUR_PROJECT_ID
GOOGLE_VERTEX_LOCATION=global
GOOGLE_VERTEX_VISION_MODEL=gemini-2.5-flash-lite
GOOGLE_VERTEX_VISION_FALLBACK_MODELS=gemini-2.5-flash,gemini-3.1-flash-lite,gemini-3.1-pro-preview
```

然后重启：

```bash
npm run dev
```

## 为什么不用图片生成模型

Computer Use 需要输出动作 JSON：

```json
{ "thought": "...", "action": { "type": "click", "elementId": "e1" } }
```

所以要用“多模态理解模型”。`gemini-2.5-flash-image` / `gemini-3-pro-image-preview` 这类 Vertex 图片模型主要用于输出图片，适合学习配图/卡片插图，不适合直接替代 Computer Use 的动作决策模型。

本机实测：

- `gemini-2.5-flash-lite`：当前建议主模型，启动快，JSON 动作输出稳定。
- `gemini-2.5-flash` / `gemini-3.1-flash-lite` / `gemini-3.1-pro-preview`：作为兜底。
- `gemini-3.5-flash`：可以测试，但本机小图 JSON 探测出现过空文本 / `MAX_TOKENS`，不建议作为比赛演示的第一优先级。
- `gemini-2.5-flash-image` / `gemini-3-pro-image-preview`：TEXT-only JSON 请求会被 Vertex 拒绝；它们需要 `responseModalities: ["TEXT", "IMAGE"]`。

## 凭证优先级

1. `GOOGLE_VERTEX_ACCESS_TOKEN`
2. `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
3. 本机 `gcloud auth print-access-token`
4. Cloud Run / GCE metadata server token

不要把 service account JSON、access token、refresh token 提交进仓库。

## 本地排查清单

如果 Computer Use 一开始就进入错误态，先按这个顺序查：

1. 确认是在 Electron 桌面窗口里测试，不是在 `http://localhost:5174` 普通浏览器预览里测试。普通浏览器预览没有 BrowserView，只能看 UI。
2. 确认 `.env` 里有：
   - `VISION_PROVIDER=google-vertex`
   - `GOOGLE_VERTEX_PROJECT=...`
   - `GOOGLE_VERTEX_LOCATION=global`
   - `GOOGLE_VERTEX_VISION_MODEL=...`
3. 确认本机 gcloud 可取 token：

   ```bash
   gcloud auth print-access-token
   gcloud config get-value project
   ```

4. Vertex provider 下优先读取 `GOOGLE_VERTEX_VISION_MODEL` / `GOOGLE_VERTEX_VISION_FALLBACK_MODELS`，不会再被通用 `VISION_MODEL` 抢优先级。
5. 如果模型名不可用，`vision.ts` 会尝试 `GOOGLE_VERTEX_VISION_FALLBACK_MODELS` 和默认 fallback；仍失败再检查 Vertex 模型名称/权限。
6. 如果 UI 显示“正在启动/观察/思考”，不是卡住；只有出现具体错误提示才按上面配置排查。

## 改动文件

```txt
/Users/wangyue/wangyue/XueMate/src/main/services/googleVertexVision.ts
/Users/wangyue/wangyue/XueMate/src/main/services/vision.ts
/Users/wangyue/wangyue/XueMate/src/main/services/computerUse.ts
/Users/wangyue/wangyue/XueMate/src/renderer/src/composables/useWebAssistant.js
/Users/wangyue/wangyue/XueMate/src/renderer/src/components/agent/WebAssistantPanel.vue
```
