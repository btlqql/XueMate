#!/usr/bin/env node
import { performance } from 'node:perf_hooks'

const HYBRID_WEIGHTS = { dense: 0.62, lexical: 0.28, structure: 0.1 }
const MMR_LAMBDA = 0.74

const corpus = [
  { id: 'math-fraction-1', doc: '三年级数学分数.pdf', section: '分数加法步骤', topic: 'math', text: '分数加法先看分母是否相同。同分母分数相加时，分母不变，分子相加，最后能约分就约分。例题：1/4 + 2/4 = 3/4。' },
  { id: 'math-fraction-2', doc: '三年级数学分数.pdf', section: '异分母通分', topic: 'math', text: '异分母分数相加要先通分，把两个分数变成相同分母，再把分子相加。计算后要化成最简分数。' },
  { id: 'math-fraction-dup', doc: '三年级数学分数.pdf', section: '分数加法练习', topic: 'math', text: '分数加法练习：同分母分数分母不变，分子相加。异分母分数需要先通分，然后相加并约分。' },
  { id: 'math-decimal-1', doc: '四年级小数.pdf', section: '小数加法', topic: 'math', text: '小数加法要把小数点对齐，从低位加起，得数的小数点也要和加数的小数点对齐。' },
  { id: 'math-geometry-1', doc: '图形面积.pdf', section: '长方形面积', topic: 'math', text: '长方形面积等于长乘宽。正方形面积等于边长乘边长。解决面积问题要先统一单位。' },
  { id: 'english-words-1', doc: '小学英语单词记忆.md', section: '自然拼读', topic: 'english', text: '小学生记英语单词可以用自然拼读法，把字母组合和发音对应起来，先会读，再拼写，最后用句子复习。' },
  { id: 'english-words-2', doc: '小学英语单词记忆.md', section: '分类记忆', topic: 'english', text: '英语单词可以按主题分类记忆，例如动物、水果、颜色、家庭成员。分类后配合图片和闪卡复习效果更好。' },
  { id: 'english-words-dup', doc: '小学英语单词记忆.md', section: '复习节奏', topic: 'english', text: '背英语单词不要只死记硬背。可以用自然拼读、分类记忆、联想记忆和间隔复习来提高记忆效率。' },
  { id: 'english-grammar-1', doc: '英语一般现在时.md', section: '第三人称单数', topic: 'english', text: '一般现在时中，主语是第三人称单数时，动词通常要加 s 或 es，例如 he likes apples。' },
  { id: 'science-plant-1', doc: '五年级科学实验.pdf', section: '植物蒸腾实验', topic: 'science', text: '植物蒸腾作用实验可以把透明塑料袋套在叶片上，过一段时间观察袋内水珠，说明叶片会散失水分。' },
  { id: 'science-filter-1', doc: '五年级科学实验.pdf', section: '过滤实验', topic: 'science', text: '过滤实验需要漏斗、滤纸和烧杯。把泥水倒入滤纸，固体颗粒留在滤纸上，液体流入烧杯。' },
  { id: 'science-magnet-1', doc: '磁铁实验.md', section: '磁极', topic: 'science', text: '磁铁有南北两极，同极相斥，异极相吸。可以用回形针观察磁力强弱和距离的关系。' },
  { id: 'writing-report-1', doc: '语文作文方法.md', section: '观察作文', topic: 'writing', text: '写观察作文要按照顺序描写，可以从整体到局部，也可以按时间顺序记录变化，最后写自己的感受。' },
  { id: 'task-format-1', doc: '作业提交规范.md', section: '命名规范', topic: 'task', text: '提交作业文件名建议包含班级、姓名、科目和日期，例如三年级一班_张三_数学作业_0529.pdf。' },
  { id: 'task-format-2', doc: '作业提交规范.md', section: 'PDF 格式', topic: 'task', text: 'PDF 作业要保证页面清晰、方向正确、题号完整。上传前检查文件能否打开，避免空白页。' },
  { id: 'coding-loop-1', doc: 'Python入门.md', section: 'for 循环', topic: 'coding', text: 'Python for 循环可以遍历列表、字符串和 range。循环体要缩进，常用于重复执行相同操作。' },
  { id: 'coding-list-1', doc: 'Python入门.md', section: '列表推导式', topic: 'coding', text: '列表推导式可以用简洁语法生成新列表，例如 [x*x for x in nums if x > 0]。' }
]

const queries = [
  { q: '三年级分数加法怎么做', relevant: ['math-fraction-1', 'math-fraction-2', 'math-fraction-dup'] },
  { q: '异分母分数相加要先做什么', relevant: ['math-fraction-2', 'math-fraction-dup'] },
  { q: '小学生英语单词记忆方法', relevant: ['english-words-1', 'english-words-2', 'english-words-dup'] },
  { q: '自然拼读背单词有什么用', relevant: ['english-words-1', 'english-words-dup'] },
  { q: '五年级科学过滤实验需要什么材料', relevant: ['science-filter-1'] },
  { q: '植物蒸腾实验怎么观察水珠', relevant: ['science-plant-1'] },
  { q: '提交作业文件怎么命名', relevant: ['task-format-1'] },
  { q: 'PDF 作业上传前要检查什么', relevant: ['task-format-2'] },
  { q: 'Python 列表推导式例子', relevant: ['coding-list-1'] },
  { q: '观察作文怎么写', relevant: ['writing-report-1'] }
]

function tokenize(text) {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ').trim()
  const out = []
  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    if (/[\u4e00-\u9fff]/.test(token)) {
      const chars = [...token]
      if (chars.length <= 2) out.push(token)
      else {
        for (let i = 0; i < chars.length - 1; i++) out.push(chars.slice(i, i + 2).join(''))
        for (let i = 0; i < chars.length - 2; i++) out.push(chars.slice(i, i + 3).join(''))
      }
    } else if (token.length >= 2) out.push(token)
  }
  return [...new Set(out)].filter((t) => !['这个', '那个', '什么', '怎么', '如何', '资料'].includes(t))
}

function lexicalScore(q, text) {
  const qTokens = tokenize(q)
  const textLower = text.toLowerCase()
  const textTokens = new Set(tokenize(textLower))
  if (!qTokens.length) return 0
  let hit = 0
  let max = 0
  for (const token of qTokens) {
    const weight = Math.min(2.2, 0.7 + token.length / 4)
    max += weight
    if (textTokens.has(token) || textLower.includes(token)) hit += weight
  }
  return hit / max
}

function structureScore(q, item) {
  const tokens = tokenize(q)
  const head = `${item.doc} ${item.section}`.toLowerCase()
  let s = 0
  for (const token of tokens) if (head.includes(token)) s += 0.18
  if (/步骤|方法|实验|规范|例子|记忆/.test(item.section)) s += 0.18
  return Math.min(1, s)
}

function denseScore(q, item) {
  // Deterministic pseudo dense retriever: old vector-only behavior is good at broad topic,
  // but can confuse near-by chunks inside the same course. Hybrid retrieval should recover
  // the exact learning objective with lexical/structure signals.
  const topicHints = {
    math: /分数|小数|面积|数学|通分|加法/,
    english: /英语|单词|拼读|语法|记忆/,
    science: /科学|实验|植物|过滤|磁铁|蒸腾/,
    task: /作业|提交|命名|pdf|上传/,
    coding: /python|列表|循环|代码/,
    writing: /作文|观察|语文|描写/
  }
  const topicHit = topicHints[item.topic]?.test(q.toLowerCase()) ? 0.62 : 0.22
  const noise = ((hash(`${item.id}:${q}`) % 31) - 15) / 100
  return Math.max(0, Math.min(1, topicHit + noise))
}

function hash(s) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

function similarity(a, b) {
  const aa = new Set(tokenize(a.text))
  const bb = new Set(tokenize(b.text))
  let inter = 0
  for (const t of aa) if (bb.has(t)) inter++
  const jac = inter / Math.max(1, aa.size + bb.size - inter)
  const sameDoc = a.doc === b.doc ? 0.12 : 0
  return Math.min(1, jac + sameDoc)
}

function baselineRetrieve(q, k = 3) {
  return [...corpus]
    .map((item) => ({ item, score: denseScore(q, item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

function hybridRetrieve(q, k = 3) {
  const candidates = [...corpus]
    .map((item) => ({
      item,
      dense: denseScore(q, item),
      lexical: lexicalScore(q, item.text),
      structure: structureScore(q, item),
    }))
    .map((r) => ({ ...r, score: r.dense * HYBRID_WEIGHTS.dense + r.lexical * HYBRID_WEIGHTS.lexical + r.structure * HYBRID_WEIGHTS.structure }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
  const selected = []
  const rest = [...candidates]
  while (selected.length < k && rest.length) {
    let best = 0
    let bestScore = -Infinity
    for (let i = 0; i < rest.length; i++) {
      const dup = selected.length ? Math.max(...selected.map((s) => similarity(rest[i].item, s.item))) : 0
      const mmr = MMR_LAMBDA * rest[i].score - (1 - MMR_LAMBDA) * dup
      if (mmr > bestScore) {
        bestScore = mmr
        best = i
      }
    }
    selected.push(rest.splice(best, 1)[0])
  }
  return selected
}

function ndcg(results, relevant, k = 4) {
  const gains = results.slice(0, k).map((r, i) => (relevant.includes(r.item.id) ? 1 / Math.log2(i + 2) : 0))
  const dcg = gains.reduce((a, b) => a + b, 0)
  const ideal = Array.from({ length: Math.min(k, relevant.length) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0)
  return ideal ? dcg / ideal : 0
}

function evaluate(name, fn, k) {
  const started = performance.now()
  const rows = queries.map((query) => {
    const results = fn(query.q)
    const selected = results.map((r) => r.item.id)
    const relevantSelected = selected.filter((id) => query.relevant.includes(id)).length
    const duplicateDocs = selected.length - new Set(results.map((r) => r.item.doc)).size
    const firstRelevantRank = selected.findIndex((id) => query.relevant.includes(id)) + 1
    return {
      selected,
      relevantSelected,
      duplicateDocs,
      recall: relevantSelected / query.relevant.length,
      precision: relevantSelected / selected.length,
      waste: (selected.length - relevantSelected) / selected.length,
      hit: relevantSelected > 0 ? 1 : 0,
      mrr: firstRelevantRank > 0 ? 1 / firstRelevantRank : 0,
      ndcg: ndcg(results, query.relevant, k),
      contextChars: results.reduce((sum, r) => sum + r.item.text.length, 0)
    }
  })
  const elapsed = performance.now() - started
  const avg = (field) => rows.reduce((sum, r) => sum + r[field], 0) / rows.length
  return {
    name,
    queryCount: queries.length,
    selectedChunks: k,
    hitAtK: avg('hit'),
    recallAtK: avg('recall'),
    precisionAtK: avg('precision'),
    wasteAtK: avg('waste'),
    mrr: avg('mrr'),
    ndcgAtK: avg('ndcg'),
    duplicateChunksPerQuery: avg('duplicateDocs'),
    avgContextChars: avg('contextChars'),
    p50LatencyMs: elapsed / rows.length,
    rows
  }
}

const baseline = evaluate('baseline_dense_top3', baselineRetrieve, 3)
const hybrid = evaluate('hybrid_dense_lexical_mmr_top3', hybridRetrieve, 3)

const totalCorpusChars = corpus.reduce((sum, item) => sum + item.text.length, 0)
const improvement = {
  recallLiftPct: ((hybrid.recallAtK - baseline.recallAtK) / baseline.recallAtK) * 100,
  precisionLiftPct: ((hybrid.precisionAtK - baseline.precisionAtK) / baseline.precisionAtK) * 100,
  ndcgLiftPct: ((hybrid.ndcgAtK - baseline.ndcgAtK) / baseline.ndcgAtK) * 100,
  duplicateReductionPct: ((baseline.duplicateChunksPerQuery - hybrid.duplicateChunksPerQuery) / Math.max(baseline.duplicateChunksPerQuery, 0.001)) * 100,
  contextWasteReductionPct: ((baseline.wasteAtK - hybrid.wasteAtK) / Math.max(baseline.wasteAtK, 0.001)) * 100,
  contextCompressionVsFullCorpusPct: (1 - hybrid.avgContextChars / totalCorpusChars) * 100
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), corpus: { chunkCount: corpus.length, totalChars: totalCorpusChars }, baseline, hybrid, improvement }, null, 2))
