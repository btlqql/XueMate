<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import ChatSidebar from '../components/ChatSidebar.vue'
import ChatMessages from '../components/ChatMessages.vue'
import ChatInput from '../components/ChatInput.vue'
import LearningSignalsPanel from '../components/LearningSignalsPanel.vue'

const props = defineProps({
  currentRoute: { type: [String, Object], default: '' },
  routePayload: { type: Object, default: null }
})

const conversations = ref([])
const activeId = ref(null)
const messages = ref([])
const loading = ref(false)
const sidebarCollapsed = ref(false)
const streamingContent = ref('')
const ragCollections = ref([])
const ragCollectionId = ref('all')
const chatDraft = ref('')
const signalRefreshKey = ref(0)
const emit = defineEmits(['navigate'])

// 流式监听器 cleanup
let cleanupStreamEvent = null
let signalRefreshTimers = []

function cleanupStreamListeners() {
  cleanupStreamEvent?.()
  cleanupStreamEvent = null
}

function clearSignalRefreshTimers() {
  for (const timer of signalRefreshTimers) {
    clearTimeout(timer)
  }
  signalRefreshTimers = []
}

function refreshSignalsNow() {
  signalRefreshKey.value += 1
}

function scheduleSignalRefreshes() {
  clearSignalRefreshTimers()
  signalRefreshTimers = [1200, 3600, 7200, 12000, 18000].map((delay) =>
    setTimeout(() => {
      refreshSignalsNow()
    }, delay)
  )
}

const openEntry = (view) => {
  emit('navigate', view)
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const getRoutePayload = () => {
  if (isRecord(props.routePayload)) return props.routePayload
  if (isRecord(props.currentRoute) && isRecord(props.currentRoute.payload)) {
    return props.currentRoute.payload
  }
  return null
}

const normalizeConversationId = (value) => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim()
  }
  return ''
}

const applyRoutePayload = async () => {
  const payload = getRoutePayload()
  if (!payload) return

  if (typeof payload.collectionId === 'string' && payload.collectionId.trim()) {
    ragCollectionId.value = payload.collectionId.trim()
  }

  if (typeof payload.draftPrompt === 'string') {
    chatDraft.value = payload.draftPrompt
  }

  const conversationId = normalizeConversationId(payload.conversationId)
  if (conversationId && normalizeConversationId(activeId.value) !== conversationId) {
    activeId.value = conversationId
    await loadMessages(conversationId)
  }
}

const getRecentUserQuestion = () => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index]
    if (message?.role === 'user' && typeof message.content === 'string') {
      const content = message.content.trim()
      if (content) return content
    }
  }
  return ''
}

const openWebSearchEntry = () => {
  emit('navigate', {
    view: 'agent',
    mode: 'search',
    payload: {
      draftPrompt: chatDraft.value.trim() || getRecentUserQuestion(),
      conversationId: activeId.value
    }
  })
}

const openSignalSearch = (query) => {
  emit('navigate', {
    view: 'agent',
    mode: 'search',
    payload: {
      draftPrompt: query,
      conversationId: activeId.value
    }
  })
}

// 加载会话列表
const loadConversations = async () => {
  try {
    const result = await window.chat.getConversations()
    if (result.success) {
      conversations.value = result.data || []
    }
  } catch (e) {
    console.error('[Chat] loadConversations 失败:', e)
  }
}

// 加载资料夹
const loadRagCollections = async () => {
  try {
    const result = await window.rag.collections()
    if (result.success) {
      ragCollections.value = result.data || []
    }
  } catch (e) {
    console.error('[Chat] loadCollections 失败:', e)
  }
}

// 加载某个会话的消息
const loadMessages = async (id) => {
  try {
    const result = await window.chat.getConversation(id)
    if (result.success && result.data) {
      messages.value = result.data.messages || []
    }
  } catch (e) {
    console.error('[Chat] loadMessages 失败:', e)
  }
}

// 新建对话
const newConversation = async () => {
  const result = await window.chat.createConversation()
  if (result.success) {
    activeId.value = result.data
    messages.value = []
    await loadConversations()
    refreshSignalsNow()
  }
}

// 切换会话
const selectConversation = async (id) => {
  activeId.value = id
  await loadMessages(id)
  refreshSignalsNow()
}

// 删除会话
const deleteConversation = async (id) => {
  const deletingActiveStream = activeId.value === id && loading.value
  try {
    await window.chat.deleteConversation(id)
  } catch (e) {
    console.error('[Chat] deleteConversation 失败:', e)
  }
  conversations.value = conversations.value.filter((c) => c.id !== id)
  if (activeId.value === id) {
    if (deletingActiveStream) {
      cleanupStreamListeners()
      loading.value = false
      streamingContent.value = ''
    }
    activeId.value = null
    messages.value = []
  }
}

// 发送消息（流式）
const sendMessage = async (text) => {
  if (loading.value) return
  if (!activeId.value) {
    try {
      await newConversation()
    } catch (e) {
      console.error('[Chat] newConversation 失败:', e)
      return
    }
  }

  // 记录发送时的会话 ID，用于回调中校验
  const sentConvId = activeId.value

  // 立即显示用户消息
  const userMsgId = 'u-' + Date.now()
  messages.value.push({
    id: userMsgId,
    role: 'user',
    content: text,
    timestamp: Date.now()
  })

  loading.value = true
  streamingContent.value = ''

  // 添加一个空的 AI 消息占位（流式填充）
  const aiMsgId = 'ai-' + Date.now()
  messages.value.push({
    id: aiMsgId,
    role: 'assistant',
    content: '',
    timestamp: Date.now()
  })

  const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  // 注册流式监听器
  cleanupStreamListeners()

  cleanupStreamEvent = window.chat.onStreamEvent(async (event) => {
    if (!event || event.requestId !== requestId || event.convId !== sentConvId) return

    if (event.type === 'token') {
      // 会话已切换，忽略旧流的 token
      if (activeId.value !== sentConvId) return
      streamingContent.value += String(event.payload || '')
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.id === aiMsgId) {
        lastMsg.content = streamingContent.value
      }
      return
    }

    if (event.type === 'done') {
      cleanupStreamListeners()
      streamingContent.value = ''
      loading.value = false
      // 会话已切换，只刷新侧边栏，不碰 messages
      if (activeId.value !== sentConvId) {
        await loadConversations()
        return
      }
      await loadConversations()
      scheduleSignalRefreshes()
      return
    }

    if (event.type === 'error') {
      cleanupStreamListeners()
      streamingContent.value = ''
      loading.value = false
      if (activeId.value !== sentConvId) return
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.id === aiMsgId) {
        lastMsg.content = '抱歉，出现了错误：' + (event.payload || '未知错误')
      }
    }
  })

  // 调用 IPC（现在立即返回，不等待 LLM 完成）
  try {
    const result = await window.chat.sendMessage(sentConvId, text, {
      collectionId: ragCollectionId.value,
      requestId
    })
    if (!result.success) {
      cleanupStreamListeners()
      loading.value = false
      streamingContent.value = ''
      if (activeId.value !== sentConvId) return
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.id === aiMsgId) {
        lastMsg.content = '抱歉，出现了错误：' + (result.error || '未知错误')
      }
    }
  } catch (e) {
    cleanupStreamListeners()
    loading.value = false
    streamingContent.value = ''
    if (activeId.value !== sentConvId) return
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg && lastMsg.id === aiMsgId) {
      lastMsg.content = '请求失败：' + (e.message || '未知错误')
    }
  }
}

onMounted(() => {
  loadConversations()
  loadRagCollections()
})
onUnmounted(() => {
  cleanupStreamListeners()
  clearSignalRefreshTimers()
})

watch(() => [props.currentRoute, props.routePayload], applyRoutePayload, {
  immediate: true,
  deep: true
})
</script>

<template>
  <div class="chat-view">
    <ChatSidebar
      :conversations="conversations"
      :active-id="activeId"
      :collapsed="sidebarCollapsed"
      @new="newConversation"
      @select="selectConversation"
      @delete="deleteConversation"
      @toggle="sidebarCollapsed = !sidebarCollapsed"
    />
    <div class="chat-area">
      <div class="chat-toolbar">
        <div class="source-picker">
          <span class="source-icon">📚</span>
          <span class="source-label">用哪些资料回答</span>
          <select v-model="ragCollectionId" class="source-select" :disabled="loading">
            <option value="all">全部资料</option>
            <option value="off">不用资料</option>
            <option
              v-for="collection in ragCollections"
              :key="collection.id"
              :value="collection.id"
            >
              {{ collection.name }}资料（{{ collection.docCount }}）
            </option>
          </select>
        </div>
        <div class="toolbar-actions">
          <button class="entry-secondary" @click="openWebSearchEntry">资料不够？查网页资料</button>
          <button class="entry-primary" @click="openEntry('knowledge')">导入资料</button>
        </div>
      </div>
      <ChatMessages
        :messages="messages"
        :loading="loading"
        @send="sendMessage"
        @open-entry="openEntry"
      />
      <ChatInput v-model="chatDraft" :disabled="loading" @send="sendMessage" />
    </div>
    <LearningSignalsPanel
      :active-id="activeId || ''"
      :refresh-key="signalRefreshKey"
      :loading="loading"
      @ask="sendMessage"
      @search="openSignalSearch"
    />
  </div>
</template>

<style scoped>
.chat-view {
  position: relative;
  display: flex;
  height: 100%;
  overflow: hidden;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: white;
}

.chat-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #eee;
  background: #fbfbfb;
}

.source-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.source-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #eef9e8;
  font-size: 16px;
  flex-shrink: 0;
}

.source-label {
  font-size: 13px;
  font-weight: 900;
  color: #555;
  white-space: nowrap;
}

.source-select {
  border: 1px solid #ddd;
  border-radius: 999px;
  padding: 6px 30px 6px 12px;
  background: white;
  color: #333;
  font-size: 13px;
  font-weight: 800;
  outline: none;
  max-width: 220px;
}

.source-select:focus {
  border-color: var(--xm-green);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.entry-secondary,
.entry-primary {
  border: none;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.entry-secondary {
  border: 1px solid #d6ead0;
  background: #f4fbf1;
  color: #2f7a12;
}

.entry-secondary:hover {
  border-color: var(--xm-green);
  background: #eef9e8;
  transform: translateY(-1px);
}

.entry-primary {
  background: var(--xm-green);
  color: white;
  box-shadow: 0 2px 0 var(--xm-green-dark);
}

.entry-primary:hover {
  transform: translateY(-1px);
  background: #61d60a;
}

@media (max-width: 760px) {
  .chat-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }
}
</style>
