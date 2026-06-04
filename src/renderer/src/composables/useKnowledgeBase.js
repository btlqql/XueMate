import { computed, onMounted, ref } from 'vue'

export function useKnowledgeBase() {
  const collections = ref([])
  const activeCollectionId = ref('default')
  const documents = ref([])
  const stats = ref({ docCount: 0, chunkCount: 0 })
  const graphData = ref(null)
  const graphLoading = ref(false)
  const graphError = ref('')
  const importing = ref(false)
  const creating = ref(false)
  const error = ref('')
  const newCollectionName = ref('')

  const activeCollection = computed(() =>
    collections.value.find((collection) => collection.id === activeCollectionId.value)
  )

  onMounted(async () => {
    await loadCollections()
    await loadData()
  })

  async function loadCollections() {
    try {
      const result = await window.rag.collections()
      if (result.success) {
        collections.value = result.data || []
        if (!collections.value.some((collection) => collection.id === activeCollectionId.value)) {
          activeCollectionId.value = collections.value[0]?.id || 'default'
        }
      } else {
        error.value = result.error || '加载资料夹失败'
      }
    } catch (e) {
      console.error('[Knowledge] loadCollections 失败:', e)
      error.value = '加载资料夹失败: ' + (e.message || '未知错误')
    }
  }

  async function loadData() {
    try {
      const collectionId = activeCollectionId.value || 'default'
      const [docRes, statsRes] = await Promise.all([
        window.rag.documents(collectionId),
        window.rag.stats(collectionId)
      ])
      if (docRes.success) documents.value = docRes.data || []
      else error.value = docRes.error || '加载文档失败'

      if (statsRes.success) stats.value = statsRes.data || { docCount: 0, chunkCount: 0 }
      else error.value = statsRes.error || '加载统计失败'

      await loadGraph()
    } catch (e) {
      console.error('[Knowledge] loadData 失败:', e)
      error.value = '加载资料失败: ' + (e.message || '未知错误')
    }
  }

  async function loadGraph() {
    graphLoading.value = true
    graphError.value = ''
    try {
      const result = await window.rag.learningGraph(activeCollectionId.value || 'default')
      if (result.success) {
        graphData.value = result.data || null
      } else {
        graphError.value = result.error || '生成学习网络失败'
      }
    } catch (e) {
      console.error('[Knowledge] loadGraph 失败:', e)
      graphError.value = '生成学习网络失败: ' + (e.message || '未知错误')
    } finally {
      graphLoading.value = false
    }
  }

  async function setActiveCollection(id) {
    if (activeCollectionId.value === id) return
    activeCollectionId.value = id
    error.value = ''
    await loadData()
  }

  async function createCollection() {
    const name = newCollectionName.value.trim()
    if (!name || creating.value) return

    creating.value = true
    error.value = ''
    try {
      const result = await window.rag.createCollection(name)
      if (result.success && result.data) {
        activeCollectionId.value = result.data.id
        newCollectionName.value = ''
        await loadCollections()
        await loadData()
      } else {
        error.value = result.error || '创建资料夹失败'
      }
    } catch (e) {
      error.value = '创建资料夹失败: ' + (e.message || '未知错误')
    } finally {
      creating.value = false
    }
  }

  async function selectAndImport() {
    if (importing.value) return
    importing.value = true
    error.value = ''

    try {
      const result = await window.rag.selectAndImport(activeCollectionId.value || 'default')
      if (result.success) {
        const { imported = [], errors = [] } = result.data || {}
        if (errors.length > 0) {
          error.value = errors.join('\n')
        }
        if (imported.length > 0) {
          await loadCollections()
        }
        await loadData()
      } else if (result.error !== '已取消') {
        error.value = result.error
      }
    } catch (e) {
      error.value = '导入失败: ' + (e.message || '未知错误')
    } finally {
      importing.value = false
    }
  }

  async function deleteDoc(doc) {
    if (!confirm(`确定删除 "${doc.fileName}"？`)) return
    try {
      await window.rag.delete(doc.id)
      await loadCollections()
      await loadData()
    } catch (e) {
      error.value = '删除失败: ' + (e.message || '未知错误')
    }
  }

  return {
    collections,
    activeCollectionId,
    activeCollection,
    documents,
    stats,
    graphData,
    graphLoading,
    graphError,
    importing,
    creating,
    error,
    newCollectionName,
    loadGraph,
    setActiveCollection,
    createCollection,
    selectAndImport,
    deleteDoc
  }
}

export function formatKnowledgeDate(ts) {
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
