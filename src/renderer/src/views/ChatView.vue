<script setup>
import { ref, onMounted } from 'vue'
import ChatSidebar from '../components/ChatSidebar.vue'
import ChatMessages from '../components/ChatMessages.vue'
import ChatInput from '../components/ChatInput.vue'

const conversations = ref([])
const activeId = ref(null)
const messages = ref([])
const loading = ref(false)
const sidebarCollapsed = ref(false)

// 加载会话列表
const loadConversations = async () => {
  const result = await window.chat.getConversations()
  if (result.success) {
    conversations.value = result.data || []
  }
}

// 加载某个会话的消息
const loadMessages = async (id) => {
  const result = await window.chat.getConversation(id)
  if (result.success && result.data) {
    messages.value = result.data.messages || []
  }
}

// 新建对话
const newConversation = async () => {
  const result = await window.chat.createConversation()
  if (result.success) {
    activeId.value = result.data
    messages.value = []
    await loadConversations()
  }
}

// 切换会话
const selectConversation = async (id) => {
  activeId.value = id
  await loadMessages(id)
}

// 删除会话
const deleteConversation = async (id) => {
  try {
    await window.chat.deleteConversation(id)
  } catch {}
  conversations.value = conversations.value.filter(c => c.id !== id)
  if (activeId.value === id) {
    activeId.value = null
    messages.value = []
  }
}

// 发送消息
const sendMessage = async (text) => {
  if (!activeId.value) {
    await newConversation()
  }

  loading.value = true

  try {
    const result = await window.chat.sendMessage(activeId.value, text)
    if (result.success) {
      // 从后端重新加载完整消息列表，避免重复
      await loadMessages(activeId.value)
      await loadConversations()
    } else {
      messages.value.push({
        id: 'e-' + Date.now(),
        role: 'assistant',
        content: '抱歉，出现了错误：' + (result.error || '未知错误'),
        timestamp: Date.now()
      })
    }
  } catch (e) {
    messages.value.push({
      id: 'e-' + Date.now(),
      role: 'assistant',
      content: '请求失败：' + (e.message || '未知错误'),
      timestamp: Date.now()
    })
  }

  loading.value = false
}

onMounted(loadConversations)
</script>

<template>
  <div class="chat-view">
    <ChatSidebar
      :conversations="conversations"
      :activeId="activeId"
      :collapsed="sidebarCollapsed"
      @new="newConversation"
      @select="selectConversation"
      @delete="deleteConversation"
      @toggle="sidebarCollapsed = !sidebarCollapsed"
    />
    <div class="chat-area">
      <ChatMessages
        :messages="messages"
        :loading="loading"
        @send="sendMessage"
      />
      <ChatInput
        :disabled="loading"
        @send="sendMessage"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-view {
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
</style>
