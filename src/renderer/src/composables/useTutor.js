import { computed, ref, watch } from 'vue'
import { parseLLMJson } from '../utils/llmJson'

const sampleCode = `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr

print(bubble_sort([64, 34, 25, 12, 22, 11, 90]))`

const LANGUAGE_PRESETS = [
  {
    value: 'Python',
    aliases: ['python', 'py', 'pip', 'def ', 'import ', 'print(', '列表', '字典', '元组']
  },
  {
    value: 'JavaScript',
    aliases: ['javascript', 'js', 'node', 'npm', 'console.log', 'function ', 'const ', 'let ']
  },
  {
    value: 'TypeScript',
    aliases: ['typescript', 'ts', 'interface ', 'type ', 'tsx', '泛型']
  },
  {
    value: 'Java',
    aliases: ['java', 'public class', 'system.out.println', 'spring', 'jvm']
  },
  {
    value: 'C++',
    aliases: ['c++', 'cpp', '#include <iostream>', 'std::', 'cout', 'cin']
  },
  {
    value: 'C',
    aliases: ['c语言', 'c language', '#include <stdio.h>', 'printf(', 'scanf(']
  },
  {
    value: 'Arduino C++',
    aliases: ['arduino', 'setup()', 'loop()', 'digitalwrite', 'pinmode', 'eeprom']
  },
  {
    value: 'Scratch',
    aliases: ['scratch', '积木', '图形化编程', '少儿编程']
  },
  {
    value: 'HTML/CSS',
    aliases: ['html', 'css', '<div', '<script', 'display:', 'flex', '网页']
  },
  {
    value: 'Blockly',
    aliases: ['blockly', '代码块', '可视化编程']
  }
]

function normalizeLanguageLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)
}

function detectPracticeLanguages(parts) {
  const text = parts
    .map((item) => String(item || ''))
    .join('\n')
    .toLowerCase()
  if (!text.trim()) return []

  return LANGUAGE_PRESETS.map((preset) => {
    const score = preset.aliases.reduce((sum, alias) => {
      const normalized = alias.toLowerCase()
      if (!normalized) return sum
      return text.includes(normalized) ? sum + Math.max(1, Math.min(4, normalized.length / 4)) : sum
    }, 0)
    return { value: preset.value, label: preset.value, source: 'detected', score }
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
}

function buildPracticeLanguageOptions(parts, currentLanguage) {
  const detected = detectPracticeLanguages(parts)
  const seen = new Set()
  const options = []
  const push = (value, source = 'common') => {
    const label = normalizeLanguageLabel(value)
    if (!label || seen.has(label.toLowerCase())) return
    seen.add(label.toLowerCase())
    options.push({ value: label, label, source })
  }

  for (const item of detected) push(item.value, 'detected')
  push(currentLanguage, 'current')
  for (const item of LANGUAGE_PRESETS) push(item.value, 'common')

  return options
}

export function useTutor() {
  const inputCode = ref('')
  const inputType = ref('code')
  const analyzing = ref(false)
  const results = ref(null)
  const error = ref('')

  const selectedFile = ref('')
  const checking = ref(false)
  const formatResult = ref(null)

  const practiceTopic = ref('')
  const practiceProblems = ref([])
  const selectedProblem = ref(null)
  const practiceCode = ref('')
  const practiceLang = ref('')
  const judging = ref(false)
  const judgeResult = ref(null)
  const generatingProblems = ref(false)
  const lastAutoLanguage = ref('')

  const practiceLanguageParts = computed(() => [
    practiceTopic.value,
    selectedProblem.value?.title,
    selectedProblem.value?.description,
    practiceCode.value
  ])

  const detectedPracticeLanguages = computed(() => detectPracticeLanguages(practiceLanguageParts.value))
  const detectedPracticeLanguage = computed(() => detectedPracticeLanguages.value[0]?.value || '')
  const practiceLanguageOptions = computed(() =>
    buildPracticeLanguageOptions(practiceLanguageParts.value, practiceLang.value)
  )

  const getFileName = (filePath) => filePath.replace(/\\/g, '/').split('/').pop() || filePath

  const loadSample = () => {
    inputCode.value = sampleCode
  }

  const switchTab = (tab) => {
    inputType.value = tab
    error.value = ''
    if (tab === 'code') results.value = null
    if (tab === 'report') formatResult.value = null
  }

  const backToProblemList = () => {
    selectedProblem.value = null
    judgeResult.value = null
  }

  const analyze = async () => {
    if (analyzing.value || !inputCode.value.trim()) return
    analyzing.value = true
    error.value = ''
    results.value = null

    try {
      const result = await window.llm.tutorCode(inputCode.value, inputType.value)
      if (result.success) {
        results.value = parseLLMJson(result.data)
      } else {
        error.value = result.error || '请求失败'
      }
    } catch (e) {
      error.value = '调用失败: ' + (e.message || '未知错误')
    } finally {
      analyzing.value = false
    }
  }

  const genProblems = async () => {
    if (generatingProblems.value || !practiceTopic.value.trim()) return
    generatingProblems.value = true
    error.value = ''
    practiceProblems.value = []
    selectedProblem.value = null
    judgeResult.value = null

    try {
      const language = resolvePracticeLanguage()
      const topicPrompt =
        language && language !== '自动识别' && !practiceTopic.value.toLowerCase().includes(language.toLowerCase())
          ? `${practiceTopic.value}（编程语言：${language}）`
          : practiceTopic.value
      const result = await window.llm.generateProblems(topicPrompt, 3)
      if (result.success) {
        practiceProblems.value = parseLLMJson(result.data).problems || []
      } else {
        error.value = result.error || '生成失败'
      }
    } catch (e) {
      error.value = '调用失败: ' + (e.message || '未知错误')
    } finally {
      generatingProblems.value = false
    }
  }

  const selectProblem = (problem) => {
    selectedProblem.value = problem
    practiceCode.value = ''
    judgeResult.value = null
  }

  const submitCode = async () => {
    if (judging.value || !selectedProblem.value || !practiceCode.value.trim()) return
    judging.value = true
    judgeResult.value = null
    error.value = ''

    try {
      const result = await window.llm.judgeCode(
        selectedProblem.value.description,
        practiceCode.value,
        resolvePracticeLanguage()
      )
      if (result.success) {
        judgeResult.value = parseLLMJson(result.data)
      } else {
        error.value = result.error || '判题失败'
      }
    } catch (e) {
      error.value = '调用失败: ' + (e.message || '未知错误')
    } finally {
      judging.value = false
    }
  }

  const loadPracticeSample = () => {
    practiceTopic.value = 'Python排序算法'
  }

  const resolvePracticeLanguage = () =>
    normalizeLanguageLabel(practiceLang.value) ||
    normalizeLanguageLabel(detectedPracticeLanguage.value) ||
    '自动识别'

  watch(
    detectedPracticeLanguage,
    (nextLanguage) => {
      if (!nextLanguage) return
      if (!practiceLang.value || practiceLang.value === lastAutoLanguage.value) {
        practiceLang.value = nextLanguage
        lastAutoLanguage.value = nextLanguage
      }
    },
    { immediate: true }
  )

  const selectPDF = async () => {
    error.value = ''
    formatResult.value = null
    try {
      const result = await window.file.selectPDF()
      if (result.success) {
        selectedFile.value = result.data
      }
    } catch (e) {
      error.value = '选择文件失败: ' + e.message
    }
  }

  const checkPDF = async () => {
    if (checking.value || !selectedFile.value) return
    checking.value = true
    error.value = ''
    formatResult.value = null

    try {
      const result = await window.file.checkPDF(selectedFile.value)
      if (result.success) {
        formatResult.value = JSON.parse(result.data)
      } else {
        error.value = result.error || '检查失败'
      }
    } catch (e) {
      error.value = '检查失败: ' + (e.message || '未知错误')
    } finally {
      checking.value = false
    }
  }

  return {
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
  }
}
