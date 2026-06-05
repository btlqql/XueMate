<script setup>
import { useTutor } from '../composables/useTutor'

const {
  inputCode,
  inputType,
  analyzing,
  results,
  error,
  selectedFile,
  getFileName,
  checking,
  formatResult,
  practiceTopic,
  practiceProblems,
  selectedProblem,
  practiceCode,
  practiceLang,
  practiceLanguageOptions,
  detectedPracticeLanguage,
  judging,
  judgeResult,
  generatingProblems,
  loadSample,
  switchTab,
  backToProblemList,
  analyze,
  genProblems,
  selectProblem,
  submitCode,
  loadPracticeSample,
  selectPDF,
  checkPDF
} = useTutor()
</script>

<template>
  <div class="fade-in">
    <div class="page-header">
      <h1 class="page-title">学习辅导</h1>
      <p class="page-desc">代码分析、作业批改、刷题练习</p>
    </div>

    <div class="tutor-layout">
      <!-- Tab 切换 -->
      <div class="type-tabs">
        <button class="tab" :class="{ active: inputType === 'code' }" @click="switchTab('code')">
          代码分析
        </button>
        <button
          class="tab"
          :class="{ active: inputType === 'report' }"
          @click="switchTab('report')"
        >
          作业批改
        </button>
        <button
          class="tab"
          :class="{ active: inputType === 'practice' }"
          @click="switchTab('practice')"
        >
          刷题练习
        </button>
      </div>

      <!-- 代码分析 -->
      <template v-if="inputType === 'code'">
        <div class="card">
          <h2 class="section-title">粘贴代码</h2>
          <textarea
            v-model="inputCode"
            class="input textarea code-font"
            placeholder="粘贴你的代码..."
            rows="10"
          ></textarea>
          <div class="button-group">
            <button class="btn btn-primary" @click="analyze" :disabled="analyzing">
              {{ analyzing ? '分析中...' : '开始分析' }}
            </button>
            <button class="btn btn-outline" @click="loadSample">示例</button>
          </div>
          <div class="error-msg" v-if="error">{{ error }}</div>
        </div>

        <div class="card" v-if="results">
          <h2 class="section-title">分析结果</h2>
          <div class="result-block" v-if="results.errors && results.errors.length > 0">
            <h3 class="result-label">发现的问题</h3>
            <div class="error-list">
              <div v-for="(err, i) in results.errors" :key="i" class="error-item">
                <div class="error-header">
                  <span :class="['tag', err.level === 'error' ? 'tag-red' : 'tag-yellow']">
                    {{ err.level === 'error' ? '错误' : '警告' }}
                  </span>
                  <span class="error-line">第 {{ err.line }} 行</span>
                </div>
                <div class="error-text">{{ err.message }}</div>
                <div class="error-hint" v-if="err.hint">{{ err.hint }}</div>
              </div>
            </div>
          </div>
          <div class="result-block">
            <h3 class="result-label">改进建议</h3>
            <ul class="suggestion-list">
              <li v-for="(s, i) in results.suggestions" :key="i">{{ s }}</li>
            </ul>
          </div>
          <div class="result-block">
            <h3 class="result-label">学习提示</h3>
            <div class="tips-list">
              <div v-for="(tip, i) in results.tips" :key="i" class="tip-item">{{ tip }}</div>
            </div>
          </div>
          <div class="disclaimer">
            <span class="tag tag-blue">以上是引导性建议，思考后再改进效果更好</span>
          </div>
        </div>
      </template>

      <!-- 作业批改 - 格式规范检查 -->
      <template v-if="inputType === 'report'">
        <div class="card">
          <h2 class="section-title">选择作业文件</h2>
          <div class="upload-area" @click="selectPDF" :class="{ 'has-file': selectedFile }">
            <div class="upload-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="#aaa">
                <path
                  d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z"
                />
                <path d="M8 15h8v2H8zm0-3h8v2H8z" />
              </svg>
            </div>
            <p class="upload-text" v-if="!selectedFile">点击选择 PDF 作业文件</p>
            <p class="upload-text file-name" v-else>{{ getFileName(selectedFile) }}</p>
          </div>
          <div class="button-group">
            <button class="btn btn-primary" @click="checkPDF" :disabled="!selectedFile || checking">
              {{ checking ? '检查中...' : '开始检查' }}
            </button>
            <button class="btn btn-outline" @click="selectPDF">重新选择</button>
          </div>
          <div class="error-msg" v-if="error">{{ error }}</div>
        </div>

        <!-- 检查结果 -->
        <div class="card" v-if="formatResult">
          <h2 class="section-title">格式检查报告</h2>

          <!-- 识别信息 -->
          <div class="info-bar">
            <div class="info-item" v-if="formatResult.formatCheck.studentName">
              <span class="info-label">姓名</span>
              <span class="info-value">{{ formatResult.formatCheck.studentName }}</span>
            </div>
            <div class="info-item" v-if="formatResult.formatCheck.className">
              <span class="info-label">班级</span>
              <span class="info-value">{{ formatResult.formatCheck.className }}</span>
            </div>
            <div class="info-item" v-if="formatResult.formatCheck.assignmentTitle">
              <span class="info-label">标题</span>
              <span class="info-value">{{ formatResult.formatCheck.assignmentTitle }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">页数</span>
              <span class="info-value">{{ formatResult.pageCount }}页</span>
            </div>
          </div>

          <!-- 格式分 -->
          <div
            class="score-bar"
            :class="
              formatResult.formatCheck.score >= 80
                ? 'score-good'
                : formatResult.formatCheck.score >= 60
                  ? 'score-ok'
                  : 'score-bad'
            "
          >
            <span class="score-text">格式规范分</span>
            <span class="score-num">{{ formatResult.formatCheck.score }}</span>
          </div>

          <!-- 检查项 -->
          <div class="check-list">
            <div
              v-for="(item, i) in formatResult.formatCheck.items"
              :key="i"
              class="check-row"
              :class="{ 'check-pass': item.pass, 'check-fail': !item.pass }"
            >
              <span class="check-icon">{{ item.pass ? '✓' : '✗' }}</span>
              <span class="check-name">{{ item.name }}</span>
              <span class="check-detail">{{ item.detail }}</span>
            </div>
          </div>

          <!-- 总评 -->
          <div class="summary-box">
            <strong>总评：</strong>{{ formatResult.formatCheck.summary }}
          </div>

          <!-- 内容预览 -->
          <details class="preview-section">
            <summary class="result-label">文档内容预览（前500字）</summary>
            <pre class="preview-text">{{ formatResult.preview }}</pre>
          </details>
        </div>
      </template>

      <!-- 刷题练习 -->
      <template v-if="inputType === 'practice'">
        <div class="card">
          <h2 class="section-title">选择题目方向</h2>
          <div class="input-bar">
            <input
              v-model="practiceTopic"
              class="input"
              placeholder="如：Python排序算法、链表、二叉树..."
            />
            <button class="btn btn-primary" @click="genProblems" :disabled="generatingProblems">
              {{ generatingProblems ? '生成中...' : '生成题目' }}
            </button>
          </div>
          <div class="button-group">
            <button class="btn btn-outline btn-sm" @click="loadPracticeSample">示例</button>
            <div class="lang-field">
              <input
                v-model="practiceLang"
                class="lang-select"
                list="practice-language-options"
                placeholder="自动识别语言"
              />
              <datalist id="practice-language-options">
                <option
                  v-for="item in practiceLanguageOptions"
                  :key="item.value"
                  :value="item.value"
                />
              </datalist>
              <span v-if="detectedPracticeLanguage" class="lang-hint">
                自动识别：{{ detectedPracticeLanguage }}
              </span>
            </div>
          </div>
          <div class="error-msg" v-if="error">{{ error }}</div>
        </div>

        <!-- 题目列表 -->
        <div class="card" v-if="practiceProblems.length > 0 && !selectedProblem">
          <h2 class="section-title">选择题目</h2>
          <div class="problem-list">
            <div
              v-for="p in practiceProblems"
              :key="p.id"
              class="problem-card"
              @click="selectProblem(p)"
            >
              <div class="problem-top">
                <span class="problem-title">{{ p.title }}</span>
                <span
                  :class="[
                    'tag',
                    p.difficulty === '简单'
                      ? 'tag-green'
                      : p.difficulty === '中等'
                        ? 'tag-yellow'
                        : 'tag-red'
                  ]"
                >
                  {{ p.difficulty }}
                </span>
              </div>
              <div class="problem-desc">{{ p.description }}</div>
            </div>
          </div>
        </div>

        <!-- 答题区 -->
        <div class="card" v-if="selectedProblem">
          <div class="problem-header-bar">
            <button class="btn btn-outline btn-sm" @click="backToProblemList">返回题目列表</button>
            <span
              :class="[
                'tag',
                selectedProblem.difficulty === '简单'
                  ? 'tag-green'
                  : selectedProblem.difficulty === '中等'
                    ? 'tag-yellow'
                    : 'tag-red'
              ]"
            >
              {{ selectedProblem.difficulty }}
            </span>
          </div>
          <h2 class="section-title">{{ selectedProblem.title }}</h2>
          <div class="problem-full-desc">
            <p>{{ selectedProblem.description }}</p>
            <div class="problem-example" v-if="selectedProblem.example">
              <strong>示例：</strong>
              <pre>{{ selectedProblem.example }}</pre>
            </div>
            <div class="problem-hint" v-if="selectedProblem.hints">
              <strong>提示：</strong> {{ selectedProblem.hints }}
            </div>
          </div>

          <h3 class="result-label">你的代码</h3>
          <textarea
            v-model="practiceCode"
            class="input textarea code-font"
            placeholder="在此编写你的代码..."
            rows="12"
          ></textarea>
          <div class="button-group">
            <button class="btn btn-primary" @click="submitCode" :disabled="judging">
              {{ judging ? '判题中...' : '提交代码' }}
            </button>
          </div>
        </div>

        <!-- 判题结果 -->
        <div class="card" v-if="judgeResult">
          <h2 class="section-title">判题结果</h2>
          <div
            class="verdict-bar"
            :class="
              judgeResult.verdict === '正确'
                ? 'verdict-pass'
                : judgeResult.verdict === '部分正确'
                  ? 'verdict-partial'
                  : 'verdict-fail'
            "
          >
            <span class="verdict-icon">{{
              judgeResult.verdict === '正确' ? '✓' : judgeResult.verdict === '部分正确' ? '◐' : '✗'
            }}</span>
            <span class="verdict-text">{{ judgeResult.verdict }}</span>
            <span class="verdict-score">{{ judgeResult.score }}分</span>
          </div>

          <div class="result-block" v-if="judgeResult.output">
            <h3 class="result-label">预期输出</h3>
            <pre class="output-block">{{ judgeResult.output }}</pre>
          </div>

          <div class="result-block" v-if="judgeResult.errors && judgeResult.errors.length > 0">
            <h3 class="result-label">错误分析</h3>
            <div class="tips-list">
              <div v-for="(err, i) in judgeResult.errors" :key="i" class="tip-item error-tip">
                {{ err }}
              </div>
            </div>
          </div>

          <div class="result-block" v-if="judgeResult.hints && judgeResult.hints.length > 0">
            <h3 class="result-label">提示</h3>
            <div class="tips-list">
              <div v-for="(h, i) in judgeResult.hints" :key="i" class="tip-item">{{ h }}</div>
            </div>
          </div>

          <div class="result-block" v-if="judgeResult.explanation">
            <h3 class="result-label">解题思路</h3>
            <div class="explanation-box">{{ judgeResult.explanation }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tutor-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.type-tabs {
  display: flex;
  gap: 6px;
}

.tab {
  padding: 10px 22px;
  border: 2px solid #e5e5e5;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 15px;
  font-family: var(--xm-font);
  transition: all 0.15s;
}

.tab.active {
  border-color: var(--xm-green);
  background: #dcfce7;
  color: var(--xm-green-dark);
}

.code-font {
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 14px;
  line-height: 1.6;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  align-items: center;
}

.input-bar {
  display: flex;
  gap: 8px;
}
.input-bar .input {
  flex: 1;
}

.lang-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.lang-select {
  padding: 6px 14px;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  font-family: var(--xm-font);
  font-weight: 700;
  font-size: 14px;
  background: white;
  min-width: 150px;
}

.lang-hint {
  color: var(--xm-green-dark);
  background: #e6f7d9;
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 800;
}

/* 题目列表 */
.problem-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.problem-card {
  padding: 18px 20px;
  background: #f7f7f7;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  border: 2px solid transparent;
}

.problem-card:hover {
  border-color: var(--xm-green);
  background: #effcf4;
}

.problem-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.problem-title {
  font-weight: 800;
  font-size: 17px;
}

.problem-desc {
  color: #777;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 答题区 */
.problem-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.problem-full-desc {
  padding: 16px;
  background: #f7f7f7;
  border-radius: 10px;
  margin-bottom: 16px;
  font-size: 15px;
  line-height: 1.6;
  font-weight: 600;
}

.problem-full-desc p {
  margin-bottom: 10px;
}

.problem-example {
  margin-top: 10px;
}

.problem-example pre {
  margin-top: 6px;
  padding: 10px;
  background: white;
  border-radius: 6px;
  font-family: 'SF Mono', monospace;
  font-size: 13px;
  border: 1px solid #e5e5e5;
}

.problem-hint {
  margin-top: 10px;
  color: #777;
  font-size: 14px;
}

/* 判题结果 */
.verdict-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-radius: 12px;
  margin-bottom: 20px;
  font-weight: 800;
  font-size: 18px;
}

.verdict-pass {
  background: #dcfce7;
  color: #166534;
}

.verdict-partial {
  background: #fef9c3;
  color: #854d0e;
}

.verdict-fail {
  background: #fee2e2;
  color: #991b1b;
}

.verdict-icon {
  font-size: 24px;
}
.verdict-text {
  flex: 1;
}
.verdict-score {
  font-size: 16px;
}

.output-block {
  padding: 12px;
  background: #f7f7f7;
  border-radius: 8px;
  font-family: 'SF Mono', monospace;
  font-size: 14px;
  overflow-x: auto;
}

/* 通用结果块 */
.result-block {
  margin-bottom: 20px;
}
.result-block:last-of-type {
  margin-bottom: 0;
}

.result-label {
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  color: var(--xm-text);
}

.error-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.error-item {
  padding: 14px 16px;
  background: #f7f7f7;
  border-radius: 10px;
  border-left: 4px solid var(--xm-orange);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.error-line {
  font-size: 13px;
  color: #777;
}
.error-text {
  font-weight: 700;
  font-size: 16px;
}
.error-hint {
  margin-top: 6px;
  color: #777;
  font-size: 14px;
}

.suggestion-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggestion-list li {
  padding: 12px 16px;
  background: #f7f7f7;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
}

.suggestion-list li::before {
  content: '\2192 ';
  color: var(--xm-green);
  font-weight: 800;
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tip-item {
  padding: 12px 16px;
  background: #dbeafe;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}

.error-tip {
  background: #fee2e2;
  color: #991b1b;
}

.explanation-box {
  padding: 16px;
  background: #f0fdf4;
  border: 2px solid var(--xm-green);
  border-radius: 10px;
  font-size: 15px;
  line-height: 1.6;
  font-weight: 600;
}

.disclaimer {
  margin-top: 20px;
  text-align: center;
}

/* 上传区域 */
.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  border: 3px dashed #e5e5e5;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fafafa;
}

.upload-area:hover {
  border-color: var(--xm-green);
  background: #f0fdf4;
}

.upload-area.has-file {
  border-color: var(--xm-green);
  border-style: solid;
  background: #f0fdf4;
}

.upload-icon {
  margin-bottom: 10px;
  opacity: 0.6;
}
.upload-area:hover .upload-icon {
  opacity: 1;
}

.upload-text {
  font-weight: 700;
  font-size: 15px;
  color: #999;
}

.upload-text.file-name {
  color: var(--xm-text);
  font-size: 16px;
}

/* 检查结果 */
.info-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #f7f7f7;
  border-radius: 8px;
}

.info-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  color: #999;
  letter-spacing: 0.5px;
}

.info-value {
  font-weight: 700;
  font-size: 14px;
}

.score-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-radius: 12px;
  margin-bottom: 16px;
  font-weight: 800;
  font-size: 16px;
}

.score-good {
  background: #dcfce7;
  color: #166534;
}
.score-ok {
  background: #fef9c3;
  color: #854d0e;
}
.score-bad {
  background: #fee2e2;
  color: #991b1b;
}

.score-num {
  font-size: 28px;
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: #f7f7f7;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
}

.check-pass .check-icon {
  color: #16a34a;
  font-weight: 900;
  font-size: 18px;
}

.check-fail .check-icon {
  color: #dc2626;
  font-weight: 900;
  font-size: 18px;
}

.check-fail {
  background: #fef2f2;
}

.check-name {
  min-width: 100px;
  font-weight: 700;
}

.check-detail {
  color: #777;
  font-size: 14px;
  flex: 1;
}

.summary-box {
  padding: 14px 16px;
  background: #dbeafe;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}

.preview-section {
  margin-top: 10px;
}

.preview-section summary {
  cursor: pointer;
  user-select: none;
}

.preview-text {
  margin-top: 10px;
  padding: 14px;
  background: #f7f7f7;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.error-msg {
  margin-top: 12px;
  padding: 10px 14px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}
</style>
