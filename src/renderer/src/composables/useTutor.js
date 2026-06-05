import { ref } from 'vue'

const sampleCode = `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr

print(bubble_sort([64, 34, 25, 12, 22, 11, 90]))`

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
  const practiceLang = ref('Python')
  const judging = ref(false)
  const judgeResult = ref(null)
  const generatingProblems = ref(false)

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
        results.value = JSON.parse(result.data)
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
      const result = await window.llm.generateProblems(practiceTopic.value, 3)
      if (result.success) {
        practiceProblems.value = JSON.parse(result.data).problems
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
        practiceLang.value
      )
      if (result.success) {
        judgeResult.value = JSON.parse(result.data)
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
