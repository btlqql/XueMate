<script setup>
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  loading: Boolean
})

const listRef = ref(null)

const renderMd = (text) => {
  return marked.parse(text || '', { breaks: true })
}

const scrollToBottom = () => {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.loading, scrollToBottom)

const relativeTime = (ts) => {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return new Date(ts).toLocaleDateString('zh-CN')
}

const suggestions = [
  '帮我复习数据结构',
  '解释 Python 列表推导式',
  '检查我的作业格式',
  '制定一个学习计划'
]
</script>

<template>
  <div class="chat-messages" ref="listRef">
    <!-- 空状态 -->
    <div class="chat-welcome" v-if="messages.length === 0 && !loading">
      <div class="welcome-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--xm-green)" stroke-width="1.5">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
          <line x1="10" y1="22" x2="14" y2="22"/>
        </svg>
      </div>
      <h2 class="welcome-title">你好，同学！</h2>
      <p class="welcome-desc">我是你的 AI 学习助手，有什么可以帮你的？</p>
      <div class="suggestions">
        <button
          v-for="s in suggestions"
          :key="s"
          class="suggestion-btn"
          @click="$emit('send', s)"
        >{{ s }}</button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="'msg-' + msg.role">
      <!-- AI 头像 -->
      <div class="msg-avatar" v-if="msg.role === 'assistant'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
        </svg>
      </div>

      <div class="msg-bubble">
        <!-- 用户消息纯文本 -->
        <div v-if="msg.role === 'user'" class="msg-text">{{ msg.content }}</div>
        <!-- AI 消息 Markdown -->
        <div v-else class="msg-md" v-html="renderMd(msg.content)"></div>
        <div class="msg-time">{{ relativeTime(msg.timestamp) }}</div>
      </div>
    </div>

    <!-- 打字指示器 -->
    <div class="msg-row msg-assistant" v-if="loading">
      <div class="msg-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
        </svg>
      </div>
      <div class="msg-bubble typing-bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 20px 8px;
}

/* 欢迎页 */
.chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 40px 20px;
}

.welcome-icon {
  width: 72px;
  height: 72px;
  background: #dcfce7;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 22px;
  font-weight: 800;
  color: #333;
  margin: 0 0 8px;
}

.welcome-desc {
  font-size: 14px;
  color: #999;
  margin: 0 0 24px;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 400px;
}

.suggestion-btn {
  padding: 8px 16px;
  border: 1px solid var(--xm-border);
  border-radius: 9999px;
  background: white;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--xm-font);
}

.suggestion-btn:hover {
  border-color: var(--xm-green);
  color: var(--xm-green);
  background: #f0fdf4;
}

/* 消息行 */
.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  max-width: 85%;
}

.msg-user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.msg-assistant {
  margin-right: auto;
}

/* 头像 */
.msg-avatar {
  width: 32px;
  height: 32px;
  background: var(--xm-green);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 气泡 */
.msg-bubble {
  max-width: 100%;
}

.msg-user .msg-bubble {
  background: var(--xm-green);
  color: white;
  border-radius: 16px 16px 4px 16px;
  padding: 10px 14px;
}

.msg-assistant .msg-bubble {
  background: #f7f7f7;
  color: #333;
  border-radius: 16px 16px 16px 4px;
  padding: 10px 14px;
}

.msg-text {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-time {
  font-size: 11px;
  color: #bbb;
  margin-top: 4px;
}

.msg-user .msg-time {
  text-align: right;
  color: rgba(255,255,255,0.7);
}

/* Markdown 内容 */
.msg-md :deep(h1),
.msg-md :deep(h2),
.msg-md :deep(h3) {
  margin: 8px 0 4px;
  font-weight: 700;
}
.msg-md :deep(h1) { font-size: 18px; }
.msg-md :deep(h2) { font-size: 16px; }
.msg-md :deep(h3) { font-size: 14px; }

.msg-md :deep(p) {
  margin: 4px 0;
  font-size: 14px;
  line-height: 1.6;
}

.msg-md :deep(ul),
.msg-md :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
  font-size: 14px;
}

.msg-md :deep(li) {
  margin: 2px 0;
}

.msg-md :deep(code) {
  background: #e8e8e8;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 13px;
}

.msg-md :deep(pre) {
  background: #1a1a2e;
  color: #e0e0e0;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.msg-md :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.msg-md :deep(blockquote) {
  border-left: 3px solid var(--xm-green);
  padding-left: 12px;
  margin: 8px 0;
  color: #666;
}

.msg-md :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
}

.msg-md :deep(th),
.msg-md :deep(td) {
  border: 1px solid #ddd;
  padding: 6px 10px;
}

.msg-md :deep(th) {
  background: #f0f0f0;
  font-weight: 700;
}

/* 打字指示器 */
.typing-bubble {
  padding: 12px 18px !important;
}

.typing-dots {
  display: flex;
  gap: 5px;
}

.typing-dots span {
  width: 7px;
  height: 7px;
  background: #aaa;
  border-radius: 50%;
  animation: dot-bounce 1.4s infinite;
}

.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}
</style>
