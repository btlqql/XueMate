<script setup>
import { ref, markRaw } from 'vue'
import ChatView from './views/ChatView.vue'
import ToolView from './views/ToolView.vue'
import AgentView from './views/AgentView.vue'
import KnowledgeView from './views/KnowledgeView.vue'

const currentView = ref('knowledge')

const viewMap = {
  chat: markRaw(ChatView),
  tools: markRaw(ToolView),
  knowledge: markRaw(KnowledgeView),
  agent: markRaw(AgentView)
}

const navItems = [
  {
    id: 'chat',
    label: '问学伴',
    icon: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z'
  },
  {
    id: 'tools',
    label: '工具箱',
    icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-5.6 5.6a2.1 2.1 0 0 1-3-3l5.6-5.6a6 6 0 0 1 7.9-7.9l-3.1 3.1Z'
  },
  {
    id: 'knowledge',
    label: '我的资料',
    icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z'
  },
  {
    id: 'agent',
    label: '小实验',
    icon: 'M10 2v7.3L5.2 18A2.7 2.7 0 0 0 7.6 22h8.8a2.7 2.7 0 0 0 2.4-4L14 9.3V2M8 2h8M8.5 15h7'
  }
]

const isBrowserPreview = typeof window !== 'undefined' && window.__XUEMATE_BROWSER_PREVIEW__
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="logo-section">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24">
            <path
              d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"
            />
          </svg>
        </div>
        <h1 class="app-name">XueMate</h1>
        <p class="app-tagline">学伴助手</p>
      </div>

      <nav class="nav-list">
        <a
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: currentView === item.id }"
          @click="currentView = item.id"
        >
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="item.icon" />
            </svg>
          </span>
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div v-if="isBrowserPreview" class="preview-pill">浏览器预览</div>
        <div class="user-info">
          <div class="avatar">
            <svg viewBox="0 0 120 120" width="40" height="40">
              <!-- 背景圆 -->
              <circle cx="60" cy="60" r="58" fill="#FFB6C1" />
              <!-- 左耳 -->
              <ellipse
                cx="28"
                cy="22"
                rx="14"
                ry="16"
                fill="#FF69B4"
                transform="rotate(-15 28 22)"
              />
              <ellipse
                cx="28"
                cy="22"
                rx="9"
                ry="11"
                fill="#FFB6C1"
                transform="rotate(-15 28 22)"
              />
              <!-- 右耳 -->
              <ellipse
                cx="92"
                cy="22"
                rx="14"
                ry="16"
                fill="#FF69B4"
                transform="rotate(15 92 22)"
              />
              <ellipse cx="92" cy="22" rx="9" ry="11" fill="#FFB6C1" transform="rotate(15 92 22)" />
              <!-- 脸 -->
              <circle cx="60" cy="62" r="40" fill="#FFB6C1" />
              <!-- 左眼 -->
              <ellipse cx="45" cy="52" rx="5" ry="6" fill="#333" />
              <ellipse cx="46.5" cy="50.5" rx="2" ry="2.5" fill="white" />
              <!-- 右眼 -->
              <ellipse cx="75" cy="52" rx="5" ry="6" fill="#333" />
              <ellipse cx="76.5" cy="50.5" rx="2" ry="2.5" fill="white" />
              <!-- 腮红 -->
              <ellipse cx="35" cy="68" rx="8" ry="5" fill="#FF69B4" opacity="0.35" />
              <ellipse cx="85" cy="68" rx="8" ry="5" fill="#FF69B4" opacity="0.35" />
              <!-- 鼻子 -->
              <ellipse cx="60" cy="70" rx="12" ry="9" fill="#FF69B4" />
              <ellipse cx="55" cy="70" rx="3" ry="2.5" fill="#E75480" />
              <ellipse cx="65" cy="70" rx="3" ry="2.5" fill="#E75480" />
              <!-- 嘴巴 -->
              <path
                d="M52 80 Q60 88 68 80"
                stroke="#E75480"
                stroke-width="2.5"
                fill="none"
                stroke-linecap="round"
              />
            </svg>
          </div>
          <div>
            <div class="user-name">同学你好</div>
            <div class="user-status">学习中</div>
          </div>
        </div>
      </div>
    </aside>

    <main class="main-content" :class="{ 'chat-mode': currentView === 'chat' }">
      <component :is="viewMap[currentView]" @navigate="currentView = $event" />
    </main>
  </div>
</template>

<style>
@import './assets/xuemate.css';
</style>
