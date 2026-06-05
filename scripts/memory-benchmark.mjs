#!/usr/bin/env node

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 4, 29)

const observations = [
  { t: now - 180 * DAY, category: 'profile', key: 'grade', value: '三年级', confidence: 0.9, importance: 0.8, evidence: '用户说我三年级' },
  { t: now - 2 * DAY, category: 'profile', key: 'grade', value: '四年级', confidence: 0.92, importance: 0.9, evidence: '用户说现在四年级' },
  { t: now - 35 * DAY, category: 'preference', key: 'style', value: '喜欢动画解释', confidence: 0.72, importance: 0.66, evidence: '用户多次要求动画' },
  { t: now - 3 * DAY, category: 'preference', key: 'style', value: '喜欢一步一步讲', confidence: 0.8, importance: 0.68, evidence: '用户说慢一点讲' },
  { t: now - 1 * DAY, category: 'topic', key: '分数加法', value: '最近学习分数加法', confidence: 0.74, importance: 0.52, evidence: '询问分数加法练习题' },
  { t: now - 1 * DAY, category: 'weak_point', key: '异分母通分', value: '异分母通分不熟', confidence: 0.82, importance: 0.9, evidence: '问异分母先做什么' },
  { t: now - 1 * DAY, category: 'weak_point', key: '异分母通分', value: '异分母通分容易忘', confidence: 0.78, importance: 0.88, evidence: '同一问题重复提问' },
  { t: now - 4 * DAY, category: 'weak_point', key: '约分化简', value: '计算后经常忘记约分', confidence: 0.75, importance: 0.82, evidence: '练习反馈忘记化简' },
  { t: now - 8 * DAY, category: 'weak_point', key: '英语自然拼读', value: '自然拼读规则不稳定', confidence: 0.7, importance: 0.72, evidence: '问单词记忆方法' },
  { t: now - 9 * DAY, category: 'weak_point', key: '英语自然拼读', value: '自然拼读需要复习', confidence: 0.7, importance: 0.72, evidence: '再次问背单词' },
  { t: now - 12 * DAY, category: 'strong_point', key: '冒泡排序流程', value: '能理解冒泡排序基本流程', confidence: 0.76, importance: 0.5, evidence: '完成动画学习' },
  { t: now - 10 * DAY, category: 'strong_point', key: '同分母分数加法', value: '同分母分数加法掌握较好', confidence: 0.74, importance: 0.6, evidence: '练习正确' },
  { t: now - 120 * DAY, category: 'topic', key: '二次方程', value: '曾学过二次方程', confidence: 0.5, importance: 0.4, evidence: '旧对话' },
  { t: now - 75 * DAY, category: 'weak_point', key: '拼音声调', value: '以前拼音声调不稳', confidence: 0.58, importance: 0.45, evidence: '旧对话' },
  { t: now - 2 * DAY, category: 'goal', key: '提高数学计算正确率', value: '希望提高数学计算正确率', confidence: 0.84, importance: 0.92, evidence: '用户表达目标' },
  { t: now - 5 * DAY, category: 'behavior', key: '需要慢速讲解', value: '复杂步骤需要慢速拆解', confidence: 0.78, importance: 0.76, evidence: '用户觉得操作太快' },
  { t: now - 6 * DAY, category: 'misconception', key: '分母相加', value: '可能误以为分数加法分母也相加', confidence: 0.68, importance: 0.86, evidence: '错误草稿里分母相加' },
  { t: now - 6 * DAY, category: 'misconception', key: '分母相加', value: '分数加法误区：分母相加', confidence: 0.7, importance: 0.86, evidence: '订正时出现同样错误' }
]

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ').trim()
}

function halfLife(category) {
  return ({ profile: 365, preference: 365, goal: 120, weak_point: 45, misconception: 45, strong_point: 70, behavior: 50, topic: 30 }[category] || 30)
}

function decay(obs) {
  const age = Math.max(0, (now - obs.t) / DAY)
  return obs.confidence * Math.pow(0.5, age / (halfLife(obs.category) * (0.7 + obs.importance * 0.8)))
}

function buildBaseline() {
  return observations.map((obs) => ({ ...obs, active: true, score: obs.confidence }))
}

function buildEnhanced() {
  const map = new Map()
  for (const obs of observations) {
    const key = `${obs.category}:${normalizeKey(obs.key)}`
    const existing = map.get(key)
    const item = { ...obs, score: decay(obs), hits: 1, evidence: [obs.evidence] }
    if (!existing) {
      map.set(key, item)
    } else {
      existing.value = obs.t >= existing.t ? obs.value : existing.value
      existing.t = Math.max(existing.t, obs.t)
      existing.score = Math.min(1, existing.score * 0.72 + item.score * 0.35 + 0.04)
      existing.importance = Math.max(existing.importance, obs.importance)
      existing.hits += 1
      existing.evidence = [...new Set([obs.evidence, ...existing.evidence])].slice(0, 3)
    }
  }
  return [...map.values()]
    .filter((item) => item.score >= 0.38)
    .sort((a, b) => (b.score * 0.55 + b.importance * 0.3 + b.hits * 0.018) - (a.score * 0.55 + a.importance * 0.3 + a.hits * 0.018))
}

function promptChars(items) {
  return items.reduce((sum, item) => sum + `${item.category}:${item.value};证据:${Array.isArray(item.evidence) ? item.evidence[0] : item.evidence}`.length, 0)
}

function duplicateCount(items) {
  const keys = items.map((item) => `${item.category}:${normalizeKey(item.key)}`)
  return keys.length - new Set(keys).size
}

const expectedActionableWeak = new Set(['异分母通分', '约分化简', '英语自然拼读', '分母相加'])
function actionableWeakRecall(items) {
  const keys = new Set(items.filter((item) => ['weak_point', 'misconception'].includes(item.category)).map((item) => item.key))
  let hit = 0
  for (const key of expectedActionableWeak) if (keys.has(key)) hit++
  return hit / expectedActionableWeak.size
}

function staleCount(items) {
  return items.filter((item) => now - item.t > 60 * DAY && ['topic', 'weak_point'].includes(item.category)).length
}

function reviewQueue(items) {
  return items
    .filter((item) => ['weak_point', 'misconception'].includes(item.category))
    .sort((a, b) => b.importance * b.score - a.importance * a.score)
    .slice(0, 6)
}

const baseline = buildBaseline()
const enhanced = buildEnhanced()
const baselineChars = promptChars(baseline)
const enhancedChars = promptChars(enhanced)
const baselineDup = duplicateCount(baseline)
const enhancedDup = duplicateCount(enhanced)
const baselineStale = staleCount(baseline)
const enhancedStale = staleCount(enhanced)

function reviewQueueCoverage(items) {
  const queueKeys = new Set(reviewQueue(items).map((item) => item.key))
  let hit = 0
  for (const key of expectedActionableWeak) if (queueKeys.has(key)) hit++
  return hit / expectedActionableWeak.size
}

const result = {
  generatedAt: new Date(now).toISOString(),
  dataset: { observations: observations.length, expectedActionableWeak: expectedActionableWeak.size },
  baseline: {
    name: 'flat_append_memory',
    promptItems: baseline.length,
    promptChars: baselineChars,
    duplicateFacts: baselineDup,
    staleFacts: baselineStale,
    actionableWeakRecall: actionableWeakRecall(baseline),
    reviewQueueSize: 0,
    reviewQueueCoverage: 0
  },
  enhanced: {
    name: 'atom_confidence_decay_review_queue',
    promptItems: enhanced.length,
    promptChars: enhancedChars,
    duplicateFacts: enhancedDup,
    staleFacts: enhancedStale,
    actionableWeakRecall: actionableWeakRecall(enhanced),
    reviewQueueSize: reviewQueue(enhanced).length,
    reviewQueueCoverage: reviewQueueCoverage(enhanced),
    topReviewItems: reviewQueue(enhanced).map((item) => ({ key: item.key, priority: Math.round((item.importance * 0.5 + item.score * 0.5) * 100) }))
  },
  improvement: {
    promptCompressionPct: (1 - enhancedChars / baselineChars) * 100,
    itemCompressionPct: (1 - enhanced.length / baseline.length) * 100,
    duplicateReductionPct: (1 - enhancedDup / Math.max(baselineDup, 1)) * 100,
    staleSuppressionPct: (1 - enhancedStale / Math.max(baselineStale, 1)) * 100,
    reviewQueueCoveragePct: reviewQueueCoverage(enhanced) * 100,
    actionableRecallLiftPct: ((actionableWeakRecall(enhanced) - actionableWeakRecall(baseline)) / Math.max(actionableWeakRecall(baseline), 0.001)) * 100
  }
}

console.log(JSON.stringify(result, null, 2))
