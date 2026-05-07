<script setup>
import { ref, nextTick, watch } from 'vue'

const props = defineProps({
  disabled: Boolean
})

const emit = defineEmits(['send'])
const input = ref('')
const textareaRef = ref(null)

const autoResize = () => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

watch(input, () => nextTick(autoResize))

const handleKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

const send = () => {
  const text = input.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  input.value = ''
  nextTick(() => {
    if (textareaRef.value) textareaRef.value.style.height = 'auto'
  })
}
</script>

<template>
  <div class="chat-input-bar">
    <div class="chat-input-wrap">
      <textarea
        ref="textareaRef"
        v-model="input"
        class="chat-textarea"
        placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
        rows="1"
        :disabled="disabled"
        @keydown="handleKeydown"
      ></textarea>
      <button
        class="chat-send-btn"
        :disabled="disabled || !input.trim()"
        @click="send"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-input-bar {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--xm-border);
  background: white;
}

.chat-input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: #f7f7f7;
  border: 2px solid #e5e5e5;
  border-radius: 16px;
  padding: 8px 8px 8px 16px;
  transition: border-color 0.2s;
}

.chat-input-wrap:focus-within {
  border-color: var(--xm-green);
}

.chat-textarea {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  font-family: var(--xm-font);
  line-height: 1.5;
  resize: none;
  outline: none;
  max-height: 120px;
  padding: 4px 0;
  color: #333;
}

.chat-textarea::placeholder {
  color: #aaa;
}

.chat-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: none;
  background: var(--xm-green);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.2s, transform 0.1s;
}

.chat-send-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: scale(1.05);
}

.chat-send-btn:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}
</style>
