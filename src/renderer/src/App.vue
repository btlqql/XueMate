<script setup>
import { computed, ref, markRaw } from 'vue'
import TodayView from './views/TodayView.vue'
import ChatView from './views/ChatView.vue'
import ToolView from './views/ToolView.vue'
import AgentView from './views/AgentView.vue'
import KnowledgeView from './views/KnowledgeView.vue'

const viewMap = {
  today: markRaw(TodayView),
  chat: markRaw(ChatView),
  tools: markRaw(ToolView),
  knowledge: markRaw(KnowledgeView),
  agent: markRaw(AgentView)
}

const navItems = [
  {
    id: 'today',
    label: '今日学习',
    icon: 'M8 2v3M16 2v3M3.5 9.5h17M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 9h3v3H8v-3Zm5 0h3v3h-3v-3Z'
  },
  {
    id: 'chat',
    label: '问学伴',
    icon: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z'
  },
  {
    id: 'knowledge',
    label: '资料库',
    icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z'
  }
]

const secondaryItems = [
  {
    id: 'tools',
    label: '代码作业辅导',
    target: { view: 'tools', tool: 'tutor' }
  },
  {
    id: 'agent',
    label: '学习助手',
    target: { view: 'agent', mode: 'search' }
  }
]

const isBrowserPreview = typeof window !== 'undefined' && window.__XUEMATE_BROWSER_PREVIEW__
const defaultView = 'today'
const routeViewIds = new Set(Object.keys(viewMap))
const currentRoute = ref(createRoute({ view: defaultView }))

const currentView = computed(() => currentRoute.value.view)
const currentComponent = computed(() => viewMap[currentView.value] || viewMap[defaultView])
const routePayload = computed(() => currentRoute.value.payload)

function isRouteObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasRouteKey(route, key) {
  return Object.prototype.hasOwnProperty.call(route, key)
}

function resolveView(view, fallbackView = defaultView) {
  return typeof view === 'string' && routeViewIds.has(view) ? view : fallbackView
}

function resolveTextSlot(route, key, fallbackValue) {
  if (!hasRouteKey(route, key)) return fallbackValue
  const value = route[key]
  return typeof value === 'string' ? value : null
}

function resolvePayload(route, fallbackValue) {
  return hasRouteKey(route, 'payload') ? route.payload : fallbackValue
}

function createRoute(route) {
  return {
    view: resolveView(route.view),
    tool: resolveTextSlot(route, 'tool', null),
    mode: resolveTextSlot(route, 'mode', null),
    payload: resolvePayload(route, null)
  }
}

function normalizeRouteTarget(target) {
  if (typeof target === 'string') {
    return createRoute({ view: target })
  }

  if (!isRouteObject(target)) {
    return currentRoute.value
  }

  const hasExplicitView = hasRouteKey(target, 'view')
  const fallbackView = hasExplicitView ? defaultView : currentRoute.value.view
  const nextView = resolveView(target.view, fallbackView)
  const fallbackTool = hasExplicitView ? null : currentRoute.value.tool
  const fallbackMode = hasExplicitView ? null : currentRoute.value.mode
  const fallbackPayload = hasExplicitView ? null : currentRoute.value.payload

  return {
    view: nextView,
    tool: resolveTextSlot(target, 'tool', fallbackTool),
    mode: resolveTextSlot(target, 'mode', fallbackMode),
    payload: resolvePayload(target, fallbackPayload)
  }
}

function navigate(target) {
  currentRoute.value = normalizeRouteTarget(target)
}
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
        <p class="app-tagline">资料驱动学伴</p>
      </div>

      <nav class="nav-list">
        <a
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: currentView === item.id }"
          @click="navigate(item.id)"
        >
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="item.icon" />
            </svg>
          </span>
          <span>{{ item.label }}</span>
        </a>

        <div class="nav-secondary">
          <p class="nav-secondary-title">更多能力</p>
          <button
            v-for="item in secondaryItems"
            :key="item.id"
            class="nav-subitem"
            :class="{ active: currentView === item.id }"
            type="button"
            @click="navigate(item.target)"
          >
            {{ item.label }}
          </button>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div v-if="isBrowserPreview" class="preview-pill">试用模式</div>
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
      <component
        :is="currentComponent"
        :current-route="currentRoute"
        :route-payload="routePayload"
        @navigate="navigate"
      />
    </main>
  </div>
</template>

<style>
@import './assets/xuemate.css';
</style>
