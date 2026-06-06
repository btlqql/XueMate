import { onBeforeUnmount, onMounted, ref } from 'vue'

export const searchSamples = [
  '三年级分数加法练习题',
  '小学生英语单词记忆方法',
  '五年级科学探究资料'
]

export function useQuickSearch(initialPayload = null) {
  const searchInput = ref(normalizeDraftPrompt(initialPayload))
  const searching = ref(false)
  const searchError = ref('')
  const searchResult = ref(null)
  const backgroundOrganizing = ref(false)
  const backgroundMessage = ref('')
  const backgroundError = ref('')
  const backgroundResult = ref(null)
  const quickSearchHistory = ref([])
  const quickSearchHistoryLoading = ref(false)
  let stopBackgroundListener = null
  let pendingBackgroundQuery = ''

  async function loadQuickSearchHistory() {
    if (!window.quickSearch?.history) return
    quickSearchHistoryLoading.value = true
    try {
      const result = await window.quickSearch.history({ limit: 5 })
      if (result.success) {
        quickSearchHistory.value = (result.data || []).slice(0, 5)
      }
    } catch {
      // 历史记录只是辅助信息，失败时不阻塞搜索流程。
    } finally {
      quickSearchHistoryLoading.value = false
    }
  }

  function refreshQuickSearchHistory() {
    loadQuickSearchHistory()
  }

  async function runQuickSearch() {
    const query = normalizeQuery(searchInput.value)
    if (!query || searching.value) return

    pendingBackgroundQuery = query
    searching.value = true
    searchError.value = ''
    searchResult.value = null
    backgroundOrganizing.value = false
    backgroundMessage.value = ''
    backgroundError.value = ''
    backgroundResult.value = null

    try {
      const result = await window.quickSearch.run(query)
      if (result.success) {
        searchResult.value = result.data
        pendingBackgroundQuery = normalizeQuery(result.data?.query) || query
        refreshQuickSearchHistory()
      } else {
        if (pendingBackgroundQuery === query) pendingBackgroundQuery = ''
        searchError.value = result.error || '找网页资料失败'
      }
    } catch (e) {
      if (pendingBackgroundQuery === query) pendingBackgroundQuery = ''
      searchError.value = '找网页资料失败：' + (e.message || '未知错误')
    } finally {
      searching.value = false
    }
  }

  onMounted(() => {
    refreshQuickSearchHistory()
    if (!window.quickSearch?.onBackgroundUpdate) return
    stopBackgroundListener = window.quickSearch.onBackgroundUpdate((update) => {
      if (!isTrackedBackgroundUpdate(update)) return

      if (update.status === 'running') {
        backgroundOrganizing.value = true
        backgroundMessage.value = update.message || '正在后台整理学习资源'
        backgroundError.value = ''
        return
      }

      backgroundOrganizing.value = false

      if (update.status === 'done' && update.result) {
        backgroundResult.value = update.result
        backgroundMessage.value = update.message || '后台学习资源整理完成'
        backgroundError.value = ''
        refreshQuickSearchHistory()
        return
      }

      if (update.status === 'error') {
        backgroundError.value = update.error || '后台学习资源整理失败'
        backgroundMessage.value = ''
        refreshQuickSearchHistory()
        return
      }

      if (update.status === 'skipped') {
        backgroundMessage.value = update.message || ''
        backgroundError.value = ''
        refreshQuickSearchHistory()
      }
    })
  })

  onBeforeUnmount(() => {
    if (stopBackgroundListener) {
      stopBackgroundListener()
      stopBackgroundListener = null
    }
  })

  function loadSearchSample(text) {
    searchInput.value = text
  }

  function setSearchDraftPrompt(payload) {
    const draftPrompt = normalizeDraftPrompt(payload)
    if (draftPrompt && draftPrompt !== searchInput.value) {
      searchInput.value = draftPrompt
    }
  }

  function isTrackedBackgroundUpdate(update) {
    const updateQuery = normalizeQuery(update?.query)
    const activeQuery = normalizeQuery(searchResult.value?.query) || pendingBackgroundQuery
    return Boolean(updateQuery && activeQuery && updateQuery === activeQuery)
  }

  return {
    searchInput,
    searching,
    searchError,
    searchResult,
    backgroundOrganizing,
    backgroundMessage,
    backgroundError,
    backgroundResult,
    quickSearchHistory,
    quickSearchHistoryLoading,
    loadQuickSearchHistory,
    runQuickSearch,
    loadSearchSample,
    setSearchDraftPrompt
  }
}

function normalizeQuery(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDraftPrompt(payload) {
  if (typeof payload === 'string') return payload.trim()
  if (!payload || typeof payload !== 'object') return ''
  return normalizeQuery(payload.draftPrompt)
}
