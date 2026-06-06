<script setup>
import { ref } from 'vue'
import { parseLLMJson } from '../utils/llmJson'

const courseName = ref('')
const generating = ref(false)
const outline = ref(null)
const error = ref('')

const generateOutline = async () => {
  if (!courseName.value.trim()) return
  generating.value = true
  error.value = ''
  outline.value = null

  try {
    const result = await window.llm.generateReview(courseName.value)

    if (result.success) {
      try {
        outline.value = parseLLMJson(result.data)
      } catch {
        error.value = '解析结果格式异常，请重试'
      }
    } else {
      error.value = result.error || '请求失败'
    }
  } catch (e) {
    error.value = '调用失败: ' + (e.message || '未知错误')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">复习计划</h1>
      <p class="page-desc">先把课程内容拆成复习提纲，后续接入学伴记录的薄弱点</p>
    </div>

    <div class="card">
      <h2 class="section-title">课程信息</h2>
      <div class="input-bar">
        <input v-model="courseName" class="input" placeholder="输入课程名称，如：数据结构" />
        <button class="btn btn-primary" @click="generateOutline" :disabled="generating">
          {{ generating ? '整理中...' : '整理提纲' }}
        </button>
      </div>
      <div class="error-msg" v-if="error">{{ error }}</div>
    </div>

    <template v-if="outline">
      <div class="outline-layout">
        <div class="card">
          <h2 class="section-title">{{ outline.course }} 复习提纲</h2>
          <div class="chapter-list">
            <div v-for="(ch, i) in outline.chapters" :key="i" class="chapter-item">
              <div class="chapter-header">
                <span class="chapter-title">{{ ch.title }}</span>
                <span class="freq">
                  <span
                    v-for="n in 5"
                    :key="n"
                    class="freq-dot"
                    :class="{ active: n <= ch.freq }"
                  ></span>
                </span>
              </div>
              <div class="points">
                <span v-for="(p, j) in ch.points" :key="j" class="point-tag">{{ p }}</span>
              </div>
            </div>
          </div>

          <h3 class="result-label">复习建议</h3>
          <div class="tips-list">
            <div v-for="(tip, i) in outline.tips" :key="i" class="tip-item">{{ tip }}</div>
          </div>
        </div>

        <div class="card">
          <h2 class="section-title">7天复习计划</h2>
          <div class="plan-list">
            <div class="plan-item">
              <span class="plan-day">1-2</span><span>基础概念 + 简单题</span>
            </div>
            <div class="plan-item">
              <span class="plan-day">3-4</span><span>重点章节 + 习题</span>
            </div>
            <div class="plan-item">
              <span class="plan-day">5-6</span><span>综合练习 + 真题</span>
            </div>
            <div class="plan-item highlight">
              <span class="plan-day">7</span><span>查漏补缺 + 考前回顾</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="card" v-if="!outline">
      <h2 class="section-title">可以整理这些内容</h2>
      <div class="feature-grid">
        <div class="feature">
          <strong>章节提纲</strong>
          <p>把课程拆成几块内容来看</p>
        </div>
        <div class="feature">
          <strong>重点标记</strong>
          <p>标注各章节考试频率</p>
        </div>
        <div class="feature">
          <strong>复习安排</strong>
          <p>按天排出大致复习节奏</p>
        </div>
        <div class="feature">
          <strong>查漏补缺</strong>
          <p>把容易漏掉的地方单独列出来</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-bar {
  display: flex;
  gap: 8px;
}
.input-bar .input {
  flex: 1;
}

.outline-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-top: 16px;
}

.chapter-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chapter-item {
  padding: 10px 12px;
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
}

.chapter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.chapter-title {
  font-weight: 700;
  font-size: 14px;
}

.freq {
  display: flex;
  gap: 3px;
}
.freq-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--xm-border);
}
.freq-dot.active {
  background: var(--xm-green);
}

.points {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.point-tag {
  padding: 2px 10px;
  background: white;
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-pill);
  font-size: 12px;
  font-weight: 600;
}

.result-label {
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 20px 0 10px;
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tip-item {
  padding: 8px 12px;
  background: var(--xm-info-bg);
  border: 1px solid rgba(29, 78, 216, 0.12);
  border-radius: var(--xm-radius-sm);
  font-size: 13px;
  font-weight: 600;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.plan-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
  font-size: 14px;
  font-weight: 600;
}
.plan-item.highlight {
  background: var(--xm-success-bg);
  border-color: var(--xm-green);
}
.plan-day {
  width: 32px;
  height: 32px;
  background: var(--xm-green);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  flex-shrink: 0;
}

.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.feature {
  padding: 12px;
  background: var(--xm-surface-soft);
  border: 1px solid var(--xm-border);
  border-radius: var(--xm-radius-sm);
}
.feature strong {
  font-size: 14px;
  display: block;
  margin-bottom: 2px;
}
.feature p {
  font-size: 13px;
  color: var(--xm-text-light);
}

@media (max-width: 800px) {
  .outline-layout {
    grid-template-columns: 1fr;
  }
  .feature-grid {
    grid-template-columns: 1fr;
  }
}

.error-msg {
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--xm-danger-bg);
  color: var(--xm-danger-text);
  border-radius: var(--xm-radius-sm);
  font-size: 14px;
  font-weight: 600;
}
</style>
