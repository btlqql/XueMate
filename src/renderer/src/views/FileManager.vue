<script setup>
import { ref, onMounted } from 'vue'

const scanPath = ref('')
const sandboxDir = ref('')
const files = ref([])
const scanning = ref(false)
const organizing = ref(false)
const organized = ref(false)
const renaming = ref(false)

const typeLabels = {
  report: { label: '报告', tag: 'tag-green' },
  homework: { label: '作业', tag: 'tag-yellow' },
  slides: { label: '课件', tag: 'tag-blue' },
  reference: { label: '参考', tag: 'tag-blue' },
  guide: { label: '指导', tag: 'tag-green' },
  project: { label: '项目', tag: 'tag-yellow' },
  unknown: { label: '未分类', tag: 'tag-red' },
  image: { label: '图片', tag: 'tag-red' }
}

onMounted(async () => {
  // 扫描沙箱目录获取默认路径
  const result = await window.file.scanDir()
  if (result.success) {
    sandboxDir.value = result.data?.[0]?.path?.split('/').slice(0, -1).join('/') || '~/XueMateSandbox'
  }
  scanPath.value = sandboxDir.value || '~/XueMateSandbox'
})

const scanFiles = async () => {
  scanning.value = true
  files.value = []
  organized.value = false

  const result = await window.file.scanDir(scanPath.value)
  if (result.success) {
    files.value = (result.data || []).map(f => ({
      name: f.name,
      path: f.path,
      size: f.size,
      ext: f.ext,
      type: 'unknown',
      course: '未知',
      week: 0,
      newName: ''
    }))
  }
  scanning.value = false
}

const doOrganize = async () => {
  if (files.value.length === 0) return
  organizing.value = true

  const fileNames = files.value.map(f => f.name)
  const result = await window.file.organize(fileNames)

  if (result.success) {
    try {
      const jsonMatch = result.data.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        // 合并 LLM 分类结果到文件列表
        for (const item of parsed.files || []) {
          const file = files.value.find(f => f.name === item.name)
          if (file) {
            file.type = typeLabels[item.type] ? item.type : 'unknown'
            file.course = item.course || '未知'
            file.week = item.week || 0
            file.newName = item.newName || ''
          }
        }
        organized.value = true
      }
    } catch (e) {
      console.error('解析分类结果失败:', e)
    }
  }
  organizing.value = false
}

const doRename = async () => {
  const ops = files.value
    .filter(f => f.newName && f.newName !== f.name)
    .map(f => ({
      from: f.path,
      to: f.path.replace(f.name, f.newName)
    }))

  if (ops.length === 0) return
  renaming.value = true

  const result = await window.file.renameBatch(ops)
  if (result.success) {
    // 更新文件列表
    for (const op of result.data || []) {
      if (op.success) {
        const file = files.value.find(f => f.path === op.from)
        if (file) {
          file.name = op.to.split('/').pop()
          file.path = op.to
          file.newName = ''
        }
      }
    }
  }
  renaming.value = false
}

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">资料整理</h1>
      <p class="page-desc">扫描课程文件夹，AI 自动分类归档</p>
    </div>

    <div class="card">
      <h2 class="section-title">扫描目录</h2>
      <div class="scan-bar">
        <input v-model="scanPath" class="input" placeholder="输入目录路径" />
        <button class="btn btn-primary" @click="scanFiles" :disabled="scanning">
          {{ scanning ? '扫描中...' : '开始扫描' }}
        </button>
      </div>
    </div>

    <div class="card" v-if="files.length > 0">
      <div class="results-header">
        <h2 class="section-title">扫描结果</h2>
        <div class="stats">
          <span class="tag tag-blue">{{ files.length }} 个文件</span>
          <span class="tag tag-yellow">{{ files.filter(f => f.type === 'unknown').length }} 待分类</span>
        </div>
      </div>

      <div class="file-list">
        <div v-for="file in files" :key="file.path" class="file-item">
          <div class="file-icon">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#777" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
          </div>
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">
              <span :class="['tag', typeLabels[file.type]?.tag || 'tag-red']">{{ typeLabels[file.type]?.label || '未分类' }}</span>
              <span class="tag" v-if="file.course !== '未知'">{{ file.course }}</span>
              <span class="tag" v-if="file.week > 0">W{{ file.week }}</span>
              <span class="tag tag-blue">{{ formatSize(file.size) }}</span>
            </div>
          </div>
          <div class="file-new-name" v-if="organized && file.newName && file.newName !== file.name">
            <span class="arrow">&rarr;</span>
            <span class="new-name">{{ file.newName }}</span>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn btn-primary" @click="doOrganize" v-if="!organized" :disabled="organizing">
          {{ organizing ? 'AI 分析中...' : 'AI 智能分类' }}
        </button>
        <template v-else>
          <button class="btn btn-primary" @click="doRename" :disabled="renaming">
            {{ renaming ? '重命名中...' : '执行重命名' }}
          </button>
          <button class="btn" @click="organized = false; files.forEach(f => { f.type = 'unknown'; f.course = '未知'; f.week = 0; f.newName = '' })">
            重新分类
          </button>
        </template>
      </div>
    </div>

    <div class="card" v-if="files.length === 0 && !scanning">
      <h2 class="section-title">使用说明</h2>
      <div class="steps">
        <div class="step"><span class="step-num">1</span><div><strong>选择目录</strong><p>默认扫描沙箱目录 {{ sandboxDir || '~/XueMateSandbox' }}</p></div></div>
        <div class="step"><span class="step-num">2</span><div><strong>扫描文件</strong><p>读取目录中的所有文件</p></div></div>
        <div class="step"><span class="step-num">3</span><div><strong>AI 分类</strong><p>DeepSeek 自动识别文件类型、课程、周次</p></div></div>
        <div class="step"><span class="step-num">4</span><div><strong>一键重命名</strong><p>按课程/周次/类型规范命名</p></div></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scan-bar {
  display: flex;
  gap: 8px;
}
.scan-bar .input { flex: 1; }

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stats { display: flex; gap: 6px; }

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f7f7f7;
  border-radius: 8px;
}

.file-icon { flex-shrink: 0; }
.file-info { flex: 1; }
.file-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
.file-meta { display: flex; flex-wrap: wrap; gap: 4px; }

.file-new-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--xm-green-dark);
}
.arrow { color: #aaa; }
.new-name {
  background: #dcfce7;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
}

.action-bar {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  justify-content: center;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px;
  background: #f7f7f7;
  border-radius: 8px;
}

.step-num {
  width: 28px;
  height: 28px;
  background: var(--xm-green);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  flex-shrink: 0;
}

.step strong { font-size: 14px; }
.step p { font-size: 13px; color: #777; margin-top: 2px; }
</style>
