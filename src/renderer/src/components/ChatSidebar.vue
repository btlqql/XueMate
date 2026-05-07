<script setup>
const props = defineProps({
  conversations: { type: Array, default: () => [] },
  activeId: String,
  collapsed: Boolean
})

const emit = defineEmits(['new', 'select', 'delete', 'toggle'])

const relativeTime = (ts) => {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return new Date(ts).toLocaleDateString('zh-CN')
}

const lastMsg = (conv) => {
  if (!conv.messages || conv.messages.length === 0) return '暂无消息'
  const last = conv.messages[conv.messages.length - 1]
  const text = last.content.slice(0, 40)
  return text.length < last.content.length ? text + '...' : text
}
</script>

<template>
  <div class="chat-sidebar" :class="{ collapsed }">
    <!-- 收起状态 -->
    <div class="collapsed-bar" v-if="collapsed">
      <button class="icon-btn" @click="emit('toggle')" title="展开">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <button class="icon-btn" @click="emit('new')" title="新建对话">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <div class="collapsed-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="collapsed-item"
          :class="{ active: conv.id === activeId }"
          @click="emit('select', conv.id)"
          :title="conv.title || '新对话'"
        >
          {{ (conv.title || '新')[0] }}
        </div>
      </div>
    </div>

    <!-- 展开状态 -->
    <template v-if="!collapsed">
      <div class="sidebar-header">
        <button class="toggle-btn" @click="emit('toggle')" title="收起">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <button class="new-chat-btn" @click="emit('new')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          新建对话
        </button>
      </div>

      <div class="conv-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conv-item"
          :class="{ active: conv.id === activeId }"
          @click="emit('select', conv.id)"
        >
          <div class="conv-title">{{ conv.title || '新对话' }}</div>
          <div class="conv-preview">{{ lastMsg(conv) }}</div>
          <div class="conv-footer">
            <span class="conv-time">{{ relativeTime(conv.updatedAt) }}</span>
            <button class="conv-delete" @click.stop="emit('delete', conv.id)" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="conv-empty" v-if="conversations.length === 0">
          <p>暂无对话</p>
          <p class="conv-empty-hint">点击上方按钮开始</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--xm-border);
  background: #fafafa;
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: width 0.2s ease;
}

.chat-sidebar.collapsed {
  width: 48px;
}

/* 收起状态 */
.collapsed-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
  height: 100%;
}

.collapsed-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
  width: 100%;
  align-items: center;
}

.collapsed-item {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #666;
  background: #eee;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.collapsed-item:hover {
  background: #e0e0e0;
}

.collapsed-item.active {
  background: var(--xm-green);
  color: white;
}

/* 通用图标按钮 */
.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  flex-shrink: 0;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: #e8e8e8;
  color: #333;
}

/* 展开状态 */
.sidebar-header {
  padding: 12px 12px 12px 8px;
  border-bottom: 1px solid var(--xm-border);
  display: flex;
  gap: 8px;
  align-items: center;
}

.toggle-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  flex-shrink: 0;
  transition: all 0.15s;
}

.toggle-btn:hover {
  background: #eee;
  color: #333;
}

.new-chat-btn {
  flex: 1;
  padding: 8px 12px;
  border: 2px dashed #d1d5db;
  border-radius: 10px;
  background: white;
  color: #555;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--xm-font);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  border-color: var(--xm-green);
  color: var(--xm-green);
  background: #f0fdf4;
}

.conv-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.conv-item {
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
  position: relative;
}

.conv-item:hover {
  background: #f0f0f0;
}

.conv-item.active {
  background: #dcfce7;
  border-left: 3px solid var(--xm-green);
}

.conv-title {
  font-size: 14px;
  font-weight: 700;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.conv-preview {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
}

.conv-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.conv-time {
  font-size: 11px;
  color: #bbb;
}

.conv-delete {
  background: none;
  border: none;
  color: #ccc;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s;
}

.conv-item:hover .conv-delete {
  opacity: 1;
}

.conv-delete:hover {
  color: var(--xm-red);
  background: #fee2e2;
}

.conv-empty {
  text-align: center;
  padding: 40px 20px;
  color: #ccc;
}

.conv-empty p { margin: 0; }
.conv-empty-hint { font-size: 12px; margin-top: 4px !important; }
</style>
