<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({
  data: { type: Object, required: true },
  title: { type: String, default: '' }
})

const currentStep = ref(-1)
const isPlaying = ref(false)
let playTimer = null

// --- 树布局参数 ---
const NODE_R = 20
const LEVEL_H = 65
const CANVAS_W = 560
const CANVAS_H = 380
const PAD_TOP = 35

const steps = computed(() => props.data?.steps || [])
const totalSteps = computed(() => steps.value.length)

// 解析初始树结构
function parseInitialTree() {
  const nodes = props.data?.nodes || props.data?.tree || []
  if (!nodes.length) return []
  // nodes 可以是数组（按层序排列）或 edges 列表
  if (Array.isArray(nodes) && typeof nodes[0] === 'object' && nodes[0].v != null) {
    return nodes
  }
  // 简单数组 → 层序构建节点列表 { v, left?, right? }
  return nodes.map((v, i) => {
    if (v == null) return null
    const left = 2 * i + 1 < nodes.length && nodes[2 * i + 1] != null ? 2 * i + 1 : null
    const right = 2 * i + 2 < nodes.length && nodes[2 * i + 2] != null ? 2 * i + 2 : null
    return { v, left, right }
  })
}

// 计算树在每一步的节点集合和边
function treeAtStep(stepIdx) {
  const initial = parseInitialTree()
  if (!initial.length) return { nodes: [], edges: [], highlights: {} }

  // 累积操作到当前步骤
  const nodes = initial.map((n) => (n ? { ...n } : null))
  const highlights = {} // index -> color

  for (let s = 0; s <= stepIdx && s < steps.value.length; s++) {
    const step = steps.value[s]
    const color = stepColor(step.a)
    if (step.a === 'visit' || step.a === 'highlight') {
      const idx = findNodeIndex(nodes, step.node ?? step.v)
      if (idx != null) highlights[idx] = color
    }
    if (step.a === 'compare') {
      const idx = findNodeIndex(nodes, step.node ?? step.v)
      if (idx != null) highlights[idx] = color
      if (step.parent ?? step.p) {
        const pi = findNodeIndex(nodes, step.parent ?? step.p)
        if (pi != null) highlights[pi] = '#FF9800'
      }
    }
    if (step.a === 'insert') {
      const val = step.node ?? step.v
      const parentVal = step.parent ?? step.p
      const side = step.side ?? (val < parentVal ? 'left' : 'right')
      // 找到 parent 的 index
      const pi = findNodeIndex(nodes, parentVal)
      if (pi != null) {
        const newIdx = side === 'left' ? 2 * pi + 1 : 2 * pi + 2
        // 扩展数组
        while (nodes.length <= newIdx) nodes.push(null)
        nodes[newIdx] = { v: val, left: null, right: null }
        if (side === 'left') nodes[pi].left = newIdx
        else nodes[pi].right = newIdx
        highlights[newIdx] = color
        highlights[pi] = '#FF9800'
      }
    }
    if (step.a === 'found') {
      const idx = findNodeIndex(nodes, step.node ?? step.v)
      if (idx != null) highlights[idx] = color
    }
    if (step.a === 'notfound') {
      // 无节点高亮，只是描述
    }
    if (step.a === 'swap') {
      const i1 = findNodeIndex(nodes, step.i ?? step.v1)
      const i2 = findNodeIndex(nodes, step.j ?? step.v2)
      if (i1 != null) highlights[i1] = color
      if (i2 != null) highlights[i2] = color
      // 交换值
      if (i1 != null && i2 != null) {
        const tmp = nodes[i1].v
        nodes[i1] = { ...nodes[i1], v: nodes[i2].v }
        nodes[i2] = { ...nodes[i2], v: tmp }
      }
    }
    if (step.a === 'delete') {
      const idx = findNodeIndex(nodes, step.node ?? step.v)
      if (idx != null) {
        highlights[idx] = color
        // 简单删除：置空（实际 BST 删除更复杂，这里做基本可视化）
        nodes[idx] = null
        // 清理父节点引用
        for (let k = 0; k < nodes.length; k++) {
          if (nodes[k]) {
            if (nodes[k].left === idx) nodes[k] = { ...nodes[k], left: null }
            if (nodes[k].right === idx) nodes[k] = { ...nodes[k], right: null }
          }
        }
      }
    }
    if (step.a === 'traverse') {
      // 高亮遍历路径中的所有节点
      const path = step.path || step.nodes || []
      path.forEach((v) => {
        const idx = findNodeIndex(nodes, v)
        if (idx != null) highlights[idx] = color
      })
    }
    if (step.a === 'done') {
      // 全部标记为完成
      nodes.forEach((n, i) => {
        if (n) highlights[i] = '#4CAF50'
      })
    }
  }

  // 构建边列表
  const edges = []
  nodes.forEach((n, i) => {
    if (!n) return
    if (n.left != null && nodes[n.left]) {
      edges.push({ from: i, to: n.left })
    }
    if (n.right != null && nodes[n.right]) {
      edges.push({ from: i, to: n.right })
    }
  })

  return { nodes, edges, highlights }
}

function findNodeIndex(nodes, val) {
  if (val == null) return null
  return nodes.findIndex((n) => n && n.v === val)
}

function stepColor(action) {
  const map = {
    visit: '#2196F3',
    highlight: '#2196F3',
    compare: '#2196F3',
    insert: '#FF9800',
    found: '#4CAF50',
    notfound: '#f44336',
    swap: '#FF5722',
    delete: '#f44336',
    traverse: '#9C27B0',
    done: '#4CAF50'
  }
  return map[action] || '#2196F3'
}

// --- 布局计算 ---
function layoutPositions(nodes) {
  if (!nodes.length) return []
  // 根节点被删除时，找到第一个非空节点作为虚拟根
  const rootIdx = nodes.findIndex((n) => n != null)
  if (rootIdx < 0) return []
  const positions = new Array(nodes.length).fill(null)
  const widthMap = new Map()

  // 递归计算子树宽度
  function subtreeWidth(idx) {
    if (idx == null || idx >= nodes.length || !nodes[idx]) return 0
    if (widthMap.has(idx)) return widthMap.get(idx)
    const n = nodes[idx]
    const lw = subtreeWidth(n.left)
    const rw = subtreeWidth(n.right)
    const w = Math.max(NODE_R * 3, lw + rw + 10)
    widthMap.set(idx, w)
    return w
  }

  // 递归分配位置
  function assign(idx, cx, cy) {
    if (idx == null || idx >= nodes.length || !nodes[idx]) return
    positions[idx] = { x: cx, y: cy }
    const n = nodes[idx]
    const lw = subtreeWidth(n.left)
    const rw = subtreeWidth(n.right)
    if (n.left != null) assign(n.left, cx - rw / 2 - 5, cy + LEVEL_H)
    if (n.right != null) assign(n.right, cx + lw / 2 + 5, cy + LEVEL_H)
  }

  const totalW = subtreeWidth(rootIdx)
  const offsetX = (CANVAS_W - totalW) / 2
  assign(rootIdx, offsetX + totalW / 2, PAD_TOP)
  return positions
}

const currentTree = computed(() => treeAtStep(currentStep.value))
const positions = computed(() => layoutPositions(currentTree.value.nodes))
const stepDesc = computed(() => {
  if (currentStep.value < 0 || currentStep.value >= steps.value.length) return ''
  return steps.value[currentStep.value]?.d || steps.value[currentStep.value]?.desc || ''
})

// 遍历序列（如果 step.a === 'traverse' 或 'done' 时展示）
const traverseOrder = computed(() => {
  const result = []
  for (let s = 0; s <= currentStep.value && s < steps.value.length; s++) {
    const step = steps.value[s]
    if (step.a === 'traverse' && step.path) {
      result.push(...step.path)
    } else if (step.a === 'visit' || step.a === 'found') {
      result.push(step.node ?? step.v)
    }
  }
  return [...new Set(result)]
})

// --- 控制 ---
function nextStep() {
  if (currentStep.value < totalSteps.value - 1) currentStep.value++
}
function prevStep() {
  if (currentStep.value >= 0) currentStep.value--
}
function reset() {
  currentStep.value = -1
  isPlaying.value = false
  clearInterval(playTimer)
  playTimer = null
}
function togglePlay() {
  if (isPlaying.value) {
    isPlaying.value = false
    clearInterval(playTimer)
    playTimer = null
    return
  }
  if (currentStep.value >= totalSteps.value - 1) currentStep.value = -1
  isPlaying.value = true
  playTimer = setInterval(() => {
    if (currentStep.value >= totalSteps.value - 1) {
      isPlaying.value = false
      clearInterval(playTimer)
      playTimer = null
      return
    }
    nextStep()
  }, 900)
}

function nodeColor(idx) {
  return currentTree.value.highlights[idx] || '#e0e0e0'
}

function nodeTextColor(idx) {
  const bg = nodeColor(idx)
  if (bg === '#e0e0e0') return '#555'
  return '#fff'
}

onUnmounted(() => {
  if (playTimer) clearInterval(playTimer)
})
</script>

<template>
  <div class="tree-animator">
    <div class="anim-title" v-if="title">{{ title }}</div>
    <div class="anim-desc" v-if="stepDesc">{{ stepDesc }}</div>

    <svg :viewBox="`0 0 ${CANVAS_W} ${CANVAS_H}`" class="anim-svg">
      <!-- 边 -->
      <line
        v-for="(edge, i) in currentTree.edges"
        :key="'e' + i"
        :x1="positions[edge.from]?.x"
        :y1="positions[edge.from]?.y"
        :x2="positions[edge.to]?.x"
        :y2="positions[edge.to]?.y"
        stroke="#bbb"
        stroke-width="2"
      />
      <!-- 节点 -->
      <g v-for="(pos, i) in positions" :key="'n' + i">
        <template v-if="pos && currentTree.nodes[i]">
          <circle
            :cx="pos.x"
            :cy="pos.y"
            :r="NODE_R"
            :fill="nodeColor(i)"
            :stroke="nodeColor(i) === '#e0e0e0' ? '#ccc' : nodeColor(i)"
            stroke-width="2"
          />
          <text
            :x="pos.x"
            :y="pos.y + 5"
            text-anchor="middle"
            font-size="14"
            font-weight="700"
            :fill="nodeTextColor(i)"
          >
            {{ currentTree.nodes[i].v }}
          </text>
        </template>
      </g>
    </svg>

    <!-- 遍历序列 -->
    <div class="traverse-bar" v-if="traverseOrder.length > 0">
      <span class="traverse-label">遍历顺序：</span>
      <span
        v-for="(v, i) in traverseOrder"
        :key="i"
        class="traverse-node"
      >
        {{ v }}
      </span>
    </div>

    <div class="anim-controls">
      <button class="ctrl-btn" @click="reset" title="重置">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
      <button class="ctrl-btn" @click="prevStep" :disabled="currentStep < 0" title="上一步">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button class="ctrl-btn play-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
        <svg v-if="!isPlaying" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      </button>
      <button class="ctrl-btn" @click="nextStep" :disabled="currentStep >= totalSteps - 1" title="下一步">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <span class="step-indicator">{{ currentStep + 1 }} / {{ totalSteps }}</span>
    </div>
  </div>
</template>

<style scoped>
.tree-animator {
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius);
  overflow: hidden;
  margin: 8px 0;
}
.anim-title {
  padding: 10px 16px 0;
  font-weight: 700;
  font-size: 15px;
  color: var(--xm-text);
}
.anim-desc {
  padding: 4px 16px 0;
  font-size: 13px;
  color: #666;
  min-height: 20px;
}
.anim-svg {
  display: block;
  width: 100%;
  height: auto;
  padding: 8px;
}
.traverse-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 16px;
  background: white;
  border-top: 1px solid var(--xm-border);
}
.traverse-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--xm-text-muted);
}
.traverse-node {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  border-radius: 12px;
  background: var(--xm-green);
  color: white;
  font-size: 12px;
  font-weight: 700;
  padding: 0 6px;
}
.anim-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border-top: 1px solid var(--xm-border);
}
.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #ddd;
  border-radius: var(--xm-radius-sm);
  background: white;
  cursor: pointer;
  color: #555;
  transition: all 0.15s;
}
.ctrl-btn:hover:not(:disabled) {
  border-color: var(--xm-green);
  color: var(--xm-green);
  background: #f0fdf4;
}
.ctrl-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.play-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--xm-green);
  border: none;
  color: white;
}
.play-btn:hover:not(:disabled) {
  background: #16a34a;
  color: white;
}
.step-indicator {
  font-size: 12px;
  color: var(--xm-text-muted);
  font-weight: 600;
  margin-left: 8px;
  min-width: 40px;
  text-align: center;
}
</style>
