<script setup>
import { ref, nextTick, watch } from 'vue'

const props = defineProps({
  disabled: Boolean,
  modelValue: { type: String, default: '' }
})

const emit = defineEmits(['send', 'update:modelValue'])
const input = ref(props.modelValue)
const textareaRef = ref(null)

const autoResize = () => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

watch(
  () => props.modelValue,
  (value) => {
    if (value === input.value) return
    input.value = value || ''
    nextTick(autoResize)
  }
)

watch(input, (value) => {
  emit('update:modelValue', value)
  nextTick(autoResize)
})

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
      <button class="chat-send-btn" :disabled="disabled || !input.trim()" @click="send">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
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
  background: rgba(255, 255, 255, 0.96);
}

.chat-input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  border-radius: 16px;
  padding: 8px 8px 8px 16px;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.chat-input-wrap:focus-within {
  border-color: var(--xm-green);
  background: white;
  box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.12);
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
  color: var(--xm-text);
}

.chat-textarea::placeholder {
  color: var(--xm-text-muted);
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
  box-shadow: 0 3px 0 var(--xm-green-dark);
  transition: opacity 0.2s, transform 0.1s, box-shadow 0.1s;
}

.chat-send-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: scale(1.05);
}

.chat-send-btn:disabled {
  background: #d1d5db;
  box-shadow: none;
  cursor: not-allowed;
}
</style>
