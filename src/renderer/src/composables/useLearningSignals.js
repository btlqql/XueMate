import { computed, ref, watch } from 'vue'

export const learningSignalTypeOptions = [
  { id: 'weak_point', label: '可能薄弱', tone: 'weak' },
  { id: 'todo', label: '待处理', tone: 'todo' },
  { id: 'material_gap', label: '需要补资料', tone: 'gap' }
]

function getTypeMeta(type) {
  return learningSignalTypeOptions.find((item) => item.id === type) || learningSignalTypeOptions[0]
}

function normalizeTitle(value) {
  return String(value || '')
    .replace(/[`*_#>\-[\](){}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

function getLearningSignalsApi() {
  return typeof window === 'undefined' ? null : window.learningSignals
}

export function useLearningSignals(props) {
  const adding = ref(false)
  const draftTitle = ref('')
  const draftType = ref('weak_point')
  const panelOpen = ref(false)
  const loadingSignals = ref(false)
  const signals = ref([])

  const visibleSignals = computed(() =>
    signals.value
      .filter((signal) => signal.status !== 'dismissed' && signal.status !== 'resolved')
      .map((signal) => ({ ...signal, meta: getTypeMeta(signal.type) }))
      .slice(0, 8)
  )

  const signalCount = computed(() => visibleSignals.value.length)

  async function refreshSignals() {
    const conversationId = String(props.activeId || '').trim()
    const api = getLearningSignalsApi()
    if (!conversationId || !api?.list) {
      signals.value = []
      return
    }

    loadingSignals.value = true
    try {
      const result = await api.list(conversationId)
      if (result.success) {
        signals.value = Array.isArray(result.data) ? result.data : []
      }
    } catch (error) {
      console.error('[LearningSignals] load failed:', error)
    } finally {
      loadingSignals.value = false
    }
  }

  async function setSignalStatus(signal, status) {
    const api = getLearningSignalsApi()
    if (!api?.update) return
    try {
      const result = await api.update(signal.id, { status })
      if (result.success) await refreshSignals()
    } catch (error) {
      console.error('[LearningSignals] update failed:', error)
    }
  }

  async function addSignal() {
    const conversationId = String(props.activeId || '').trim()
    const title = normalizeTitle(draftTitle.value)
    const api = getLearningSignalsApi()
    if (!conversationId || !title || !api?.add) return

    try {
      const result = await api.add(conversationId, {
        type: draftType.value,
        title,
        reason: '手动添加',
        source: 'manual'
      })
      if (result.success) {
        signals.value = Array.isArray(result.data) ? result.data : signals.value
        draftTitle.value = ''
        adding.value = false
        panelOpen.value = true
      }
    } catch (error) {
      console.error('[LearningSignals] add failed:', error)
    }
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value
  }

  watch(() => props.activeId, refreshSignals, { immediate: true })
  watch(() => props.refreshKey, refreshSignals)

  return {
    adding,
    draftTitle,
    draftType,
    loadingSignals,
    panelOpen,
    signalCount,
    typeOptions: learningSignalTypeOptions,
    visibleSignals,
    addSignal,
    refreshSignals,
    setSignalStatus,
    togglePanel
  }
}
