<script setup>
import { ref } from 'vue'

const scanPath = ref('~/Desktop')
const files = ref([])
const scanning = ref(false)
const organized = ref(false)

const sampleFiles = [
  { name: '数据结构_实验3_报告.pdf', type: 'report', course: '数据结构', week: 3 },
  { name: '第5章习题答案.docx', type: 'homework', course: '数据结构', week: 5 },
  { name: '课件_排序算法.pptx', type: 'slides', course: '数据结构', week: 4 },
  { name: '算法导论_参考.pdf', type: 'reference', course: '数据结构', week: 0 },
  { name: '实验指导书_实验4.pdf', type: 'guide', course: '数据结构', week: 4 },
  { name: '小组项目_分工表.xlsx', type: 'project', course: '软件工程', week: 0 },
  { name: '未命名文档.docx', type: 'unknown', course: '未知', week: 0 },
  { name: 'IMG_20240315.jpg', type: 'image', course: '未知', week: 0 }
]

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

const scanFiles = () => {
  scanning.value = true
  setTimeout(() => {
    files.value = sampleFiles
    scanning.value = false
  }, 1500)
}

const organizeFiles = () => { organized.value = true }

const getNewName = (file) => {
  if (file.course === '未知') return file.name
  const week = file.week > 0 ? `_W${file.week}` : ''
  return `${file.course}${week}_${typeLabels[file.type].label}_${file.name}`
}
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">资料整理</h1>
      <p class="page-desc">扫描课程文件夹，自动分类归档</p>
    </div>

    <div class="card">
      <h2 class="section-title">扫描目录</h2>
      <div class="scan-bar">
        <input v-model="scanPath" class="input" placeholder="输入目录路径，如 ~/Desktop" />
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
        <div v-for="file in files" :key="file.name" class="file-item">
          <div class="file-icon">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#777" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
          </div>
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">
              <span :class="['tag', typeLabels[file.type].tag]">{{ typeLabels[file.type].label }}</span>
              <span class="tag" v-if="file.course !== '未知'">{{ file.course }}</span>
              <span class="tag" v-if="file.week > 0">W{{ file.week }}</span>
            </div>
          </div>
          <div class="file-new-name" v-if="organized && file.course !== '未知'">
            <span class="arrow">→</span>
            <span class="new-name">{{ getNewName(file) }}</span>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <button class="btn btn-primary" @click="organizeFiles" v-if="!organized">一键整理</button>
        <span class="tag tag-green" v-else>整理完成，文件将按课程/周次/类型归档</span>
      </div>
    </div>

    <div class="card" v-if="files.length === 0">
      <h2 class="section-title">使用说明</h2>
      <div class="steps">
        <div class="step"><span class="step-num">1</span><div><strong>选择目录</strong><p>输入课程文件夹路径</p></div></div>
        <div class="step"><span class="step-num">2</span><div><strong>扫描文件</strong><p>自动识别文件类型</p></div></div>
        <div class="step"><span class="step-num">3</span><div><strong>一键整理</strong><p>按课程/周次/类型归档</p></div></div>
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
  text-align: center;
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
