<script setup>
import { ref } from 'vue'
import AnimationRenderer from './animation/AnimationRenderer.vue'
import { quickEntries, suggestions, useChatMessages } from '../composables/useChatMessages'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  loading: Boolean
})

defineEmits(['send', 'open-entry'])

const listRef = ref(null)

const {
  hasAssistantPlaceholder,
  renderMd,
  getStreamingHtml,
  hasAnimBlock,
  splitMessage,
  relativeTime
} = useChatMessages(props, listRef)
</script>

<template>
  <div class="chat-messages" ref="listRef">
    <!-- 空状态 -->
    <div class="chat-welcome" v-if="messages.length === 0 && !loading">
      <div class="welcome-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--xm-green)"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" />
          <path d="M13 3h4.5A2.5 2.5 0 0 1 20 5.5v12a2.5 2.5 0 0 1-2.5 2.5H13V3Z" />
          <path d="M7 7h2" />
          <path d="M15 7h2" />
        </svg>
      </div>
      <h2 class="welcome-title">你好，同学！</h2>
      <p class="welcome-desc">我是你的学习小帮手，想先做什么？</p>
      <div class="suggestions">
        <button v-for="s in suggestions" :key="s" class="suggestion-btn" @click="$emit('send', s)">
          {{ s }}
        </button>
      </div>

      <div class="quick-entry-wrap">
        <div class="quick-entry-title">先从这里开始</div>
        <div class="quick-entries">
          <button
            v-for="entry in quickEntries"
            :key="entry.view"
            class="quick-entry"
            @click="$emit('open-entry', entry.view)"
          >
            <span class="quick-icon">{{ entry.icon }}</span>
            <span class="quick-text">
              <strong>{{ entry.title }}</strong>
              <small>{{ entry.desc }}</small>
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- 消息列表 -->
    <div v-for="msg in messages" :key="msg.id" class="msg-row" :class="'msg-' + msg.role">
      <!-- AI 头像 -->
      <div class="msg-avatar" v-if="msg.role === 'assistant'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path
            d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"
          />
        </svg>
      </div>

      <div class="msg-bubble">
        <!-- 用户消息纯文本 -->
        <div v-if="msg.role === 'user'" class="msg-text">{{ msg.content }}</div>
        <!-- AI 消息：检测是否有组件动画 JSON 块 -->
        <template v-else-if="hasAnimBlock(msg.content)">
          <template v-for="(part, pi) in splitMessage(msg.content)" :key="pi">
            <div v-if="part.type === 'text'" class="msg-md" v-html="renderMd(part.content)"></div>
            <AnimationRenderer v-else-if="part.type === 'anim'" :data="part.data" />
          </template>
        </template>
        <!-- AI 消息纯 Markdown -->
        <div
          v-else-if="
            loading && msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id
          "
          class="msg-md"
          v-html="getStreamingHtml(msg)"
        ></div>
        <div v-else class="msg-md" v-html="renderMd(msg.content, msg.id)"></div>
        <div class="msg-time">{{ relativeTime(msg.timestamp) }}</div>
      </div>
    </div>

    <!-- 打字指示器：仅在还没有 AI 占位消息时显示 -->
    <div class="msg-row msg-assistant" v-if="loading && !hasAssistantPlaceholder">
      <div class="msg-avatar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path
            d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"
          />
        </svg>
      </div>
      <div class="msg-bubble typing-bubble">
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px 10px;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.9), rgba(255, 255, 255, 0.96) 42%),
    white;
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
  background: linear-gradient(135deg, #f0fdf4, #ddf4ff);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 22px;
  font-weight: 800;
  color: var(--xm-text);
  margin: 0 0 8px;
}

.welcome-desc {
  font-size: 14px;
  color: var(--xm-text-muted);
  margin: 0 0 24px;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 520px;
}

.suggestion-btn {
  padding: 8px 16px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-pill);
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

.quick-entry-wrap {
  width: min(680px, 100%);
  margin-top: 28px;
}

.quick-entry-title {
  margin-bottom: 10px;
  color: var(--xm-text-muted);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.quick-entries {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 74px;
  padding: 14px;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  background: white;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.quick-entry:hover {
  border-color: var(--xm-green);
  background: #f0fdf4;
  transform: translateY(-1px);
  box-shadow: var(--xm-shadow-sm);
}

.quick-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--xm-radius);
  background: var(--xm-surface-soft);
  font-size: 20px;
  flex-shrink: 0;
}

.quick-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.quick-text strong {
  color: var(--xm-text);
  font-size: 14px;
  font-weight: 900;
}

.quick-text small {
  color: var(--xm-text-muted);
  font-size: 12px;
  line-height: 1.3;
}

@media (max-width: 760px) {
  .quick-entries {
    grid-template-columns: 1fr;
  }
}

/* 消息行 */
.msg-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  max-width: min(760px, 85%);
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
  background: linear-gradient(135deg, var(--xm-green), var(--xm-blue));
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
  box-shadow: 0 8px 18px rgba(88, 204, 2, 0.14);
}

.msg-assistant .msg-bubble {
  background: white;
  color: var(--xm-text);
  border-radius: 16px 16px 16px 4px;
  padding: 10px 14px;
  border: 1px solid var(--xm-border);
  box-shadow: var(--xm-shadow-sm);
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
  color: rgba(255, 255, 255, 0.7);
}

/* Markdown 内容 */
.msg-md :deep(h1),
.msg-md :deep(h2),
.msg-md :deep(h3) {
  margin: 8px 0 4px;
  font-weight: 700;
}
.msg-md :deep(h1) {
  font-size: 18px;
}
.msg-md :deep(h2) {
  font-size: 16px;
}
.msg-md :deep(h3) {
  font-size: 14px;
}

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
  background: var(--xm-surface-muted);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: var(--xm-font-mono);
  font-size: 13px;
}

.msg-md :deep(pre) {
  background: #172033;
  color: #e0e0e0;
  padding: 12px;
  border-radius: var(--xm-radius-sm);
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
  color: var(--xm-text-light);
}

.msg-md :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
}

.msg-md :deep(th),
.msg-md :deep(td) {
  border: 1px solid var(--xm-border);
  padding: 6px 10px;
}

.msg-md :deep(th) {
  background: var(--xm-surface-soft);
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

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-6px);
  }
}
</style>
