# Google Vertex 多模态理解接入 Computer Use

目标不是生图，而是让 Computer Use 用 Vertex AI 做“看截图、读 DOM 提示、返回下一步动作 JSON”。

## 调用链

```txt
computerUse.runWebAssistant()
  -> captureBrowserState() 截图 + DOM 候选
  -> visionJson()
  -> Vertex Gemini generateContent(TEXT only output)
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
GOOGLE_VERTEX_VISION_MODEL=gemini-3.5-flash
GOOGLE_VERTEX_VISION_FALLBACK_MODELS=gemini-3.1-pro-preview,gemini-3.1-flash-lite,gemini-2.5-flash
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

- `gemini-3.5-flash`：最新 Flash，实测可做截图/文本理解并返回 JSON。
- `gemini-3.1-pro-preview` / `gemini-3.1-flash-lite` / `gemini-2.5-flash`：作为兜底。
- `gemini-2.5-flash-image` / `gemini-3-pro-image-preview`：TEXT-only JSON 请求会被 Vertex 拒绝；它们需要 `responseModalities: ["TEXT", "IMAGE"]`。

## 凭证优先级

1. `GOOGLE_VERTEX_ACCESS_TOKEN`
2. `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
3. 本机 `gcloud auth print-access-token`
4. Cloud Run / GCE metadata server token

不要把 service account JSON、access token、refresh token 提交进仓库。

## 改动文件

```txt
/Users/wangyue/wangyue/XueMate/src/main/services/googleVertexVision.ts
/Users/wangyue/wangyue/XueMate/src/main/services/vision.ts
```
