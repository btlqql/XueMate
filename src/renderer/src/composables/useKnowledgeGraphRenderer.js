import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch
} from 'vue'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'

export function useKnowledgeGraphRenderer(props) {
  const container = ref(null)
  const searchText = ref('')
  const selectedNode = ref(null)
  const selectedLinks = ref([])
  const activeType = ref('all')
  const graphCanvasReady = ref(false)
  const renderStage = ref('等待渲染')
  const renderError = ref('')

  let graph = null
  let renderer = null
  let renderRetryTimer = null
  let renderFrame = 0
  let resizeObserver = null
  let isActive = false
  let lastRenderedSignature = ''

  const typeConfig = {
    collection: { label: '资料夹', color: '#58cc02', soft: '#e6f7d9' },
    document: { label: '资料', color: '#89d44f', soft: '#f0f8e9' },
    chunk: { label: '片段', color: '#b9d9a2', soft: '#f7fbf3' },
    concept: { label: '知识点', color: '#ffc800', soft: '#fff7d6' },
    memory: { label: '学习画像', color: '#7ac70c', soft: '#edf9df' },
    review: { label: '复习任务', color: '#ff9600', soft: '#fff0d9' }
  }

  const edgeColor = {
    owns: 'rgba(88, 204, 2, 0.35)',
    contains: 'rgba(137, 212, 79, 0.32)',
    mentions: 'rgba(255, 200, 0, 0.48)',
    weak_at: 'rgba(255, 150, 0, 0.58)',
    strong_at: 'rgba(88, 204, 2, 0.55)',
    related_to: 'rgba(122, 199, 12, 0.42)',
    reviews: 'rgba(255, 150, 0, 0.55)'
  }

  const hasGraph = computed(() => (props.graphData?.nodes || []).length > 1)

  const graphStatusText = computed(() => {
    if (props.loading) return '正在生成学习网络...'
    if (props.error) return '生成失败，点刷新重试'
    if (!props.graphData) return '等待资料数据'
    if (!hasGraph.value) return '资料太少，暂时没有形成网络'
    return `${props.graphData.stats?.nodeCount || 0} 个节点 · ${props.graphData.stats?.edgeCount || 0} 条关系`
  })

  const legendItems = computed(() => {
    const stats = new Map()
    for (const node of props.graphData?.nodes || []) {
      stats.set(node.type, (stats.get(node.type) || 0) + 1)
    }
    return Object.entries(typeConfig).map(([type, config]) => ({
      type,
      ...config,
      count: stats.get(type) || 0
    }))
  })

  watch(
    () => props.graphData,
    async () => {
      await nextTick()
      scheduleRender(120)
    },
    { deep: false, immediate: true }
  )

  watch(activeType, () => refreshReducers())
  watch(selectedNode, () => refreshReducers())

  function graphSignature() {
    const nodes = props.graphData?.nodes || []
    const edges = props.graphData?.edges || []
    return `${props.graphData?.generatedAt || 0}:${nodes.length}:${edges.length}`
  }

  function getContainerSize() {
    const el = container.value
    if (!el) return { width: 0, height: 0 }
    const rect = el.getBoundingClientRect()
    return {
      width: Math.max(1, Math.floor(rect.width || el.clientWidth || el.offsetWidth || 0)),
      height: Math.max(1, Math.floor(rect.height || el.clientHeight || el.offsetHeight || 0))
    }
  }

  function isContainerRenderable() {
    const el = container.value
    if (!el || !isActive || !hasGraph.value) return false
    if (!el.isConnected || document.visibilityState === 'hidden') return false
    if (el.getClientRects().length === 0) return false

    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false

    const rect = el.getBoundingClientRect()
    const width = Math.floor(rect.width || el.clientWidth || el.offsetWidth || 0)
    const height = Math.floor(rect.height || el.clientHeight || el.offsetHeight || 0)
    return width >= 120 && height >= 120
  }

  function scheduleRender(delay = 0) {
    if (!isActive || !hasGraph.value) return
    if (renderRetryTimer) window.clearTimeout(renderRetryTimer)
    renderRetryTimer = window.setTimeout(() => {
      if (renderFrame) cancelAnimationFrame(renderFrame)
      renderFrame = requestAnimationFrame(() => {
        renderFrame = requestAnimationFrame(() => {
          renderFrame = 0
          if (!isContainerRenderable()) {
            renderStage.value = '等待画布尺寸稳定'
            scheduleRender(180)
            return
          }
          renderGraph()
        })
      })
    }, delay)
  }

  function handleResize() {
    if (!isActive) return
    if (renderer && isContainerRenderable()) {
      renderer.refresh()
      return
    }
    scheduleRender(120)
  }

  function setupResizeObserver() {
    if (resizeObserver || !container.value) return
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(container.value)
  }

  function teardownResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
  }

  function clearScheduledRender() {
    if (renderRetryTimer) {
      window.clearTimeout(renderRetryTimer)
      renderRetryTimer = null
    }
    if (renderFrame) {
      cancelAnimationFrame(renderFrame)
      renderFrame = 0
    }
  }

  onMounted(() => {
    isActive = true
    window.addEventListener('resize', handleResize)
    nextTick(() => {
      setupResizeObserver()
      scheduleRender(120)
    })
  })

  onActivated(() => {
    isActive = true
    nextTick(() => {
      setupResizeObserver()
      scheduleRender(160)
    })
  })

  onDeactivated(() => {
    isActive = false
    clearScheduledRender()
    teardownResizeObserver()
    destroyGraph()
  })

  onBeforeUnmount(() => {
    isActive = false
    window.removeEventListener('resize', handleResize)
    clearScheduledRender()
    teardownResizeObserver()
    destroyGraph()
  })

  function destroyGraph() {
    if (renderer) {
      renderer.kill()
      renderer = null
    }
    if (container.value) {
      container.value.replaceChildren()
    }
    graph = null
    lastRenderedSignature = ''
    graphCanvasReady.value = false
    renderStage.value = '等待渲染'
    renderError.value = ''
    selectedNode.value = null
    selectedLinks.value = []
  }

  function graphNodePosition(index, total, type) {
    const cluster = {
      collection: { angle: -Math.PI / 2, radius: 0.25 },
      concept: { angle: 0, radius: 0.48 },
      document: { angle: Math.PI, radius: 0.8 },
      chunk: { angle: Math.PI * 0.72, radius: 1.06 },
      memory: { angle: Math.PI * 0.22, radius: 0.92 },
      review: { angle: Math.PI / 2, radius: 0.96 }
    }[type] || { angle: 0, radius: 0.8 }

    const spread = Math.PI * 0.52
    const ratio = total <= 1 ? 0.5 : index / Math.max(1, total - 1)
    const angle = cluster.angle + (ratio - 0.5) * spread
    const jitter = ((index * 9301 + 49297) % 233280) / 233280 - 0.5
    return {
      x: Math.cos(angle) * cluster.radius + jitter * 0.05,
      y: Math.sin(angle) * cluster.radius + jitter * 0.05
    }
  }

  function renderGraph() {
    renderError.value = ''
    renderStage.value = '检查画布尺寸'
    if (!isContainerRenderable()) return

    const { width, height } = getContainerSize()
    if (container.value) {
      container.value.style.width = `${width}px`
      container.value.style.height = `${height}px`
    }

    const signature = graphSignature()
    if (renderer && signature === lastRenderedSignature) {
      renderer.refresh()
      graphCanvasReady.value = true
      return
    }

    if (renderer) {
      renderer.kill()
      renderer = null
    }
    if (container.value) container.value.replaceChildren()

    renderStage.value = `构建 Graphology 图：${width}×${height}`
    graph = new Graph({ type: 'undirected', multi: false })
    const nodes = props.graphData.nodes || []
    const edges = props.graphData.edges || []
    const typeBuckets = nodes.reduce((acc, node) => {
      acc[node.type] ||= []
      acc[node.type].push(node)
      return acc
    }, {})

    for (const node of nodes) {
      const bucket = typeBuckets[node.type] || []
      const pos = graphNodePosition(bucket.indexOf(node), bucket.length, node.type)
      graph.addNode(node.id, {
        x: pos.x,
        y: pos.y,
        label: node.label,
        size: node.size || 8,
        color: typeConfig[node.type]?.color || '#89d44f',
        nodeKind: node.type,
        raw: node,
        zIndex: node.type === 'concept' ? 3 : node.type === 'collection' ? 4 : 1
      })
    }

    for (const edge of edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
      if (graph.hasEdge(edge.source, edge.target)) continue
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        label: edge.label,
        size: Math.max(0.8, Math.sqrt(edge.weight || 1)),
        color: edgeColor[edge.type] || 'rgba(148, 163, 184, 0.35)',
        raw: edge,
        edgeKind: edge.type
      })
    }

    try {
      if (graph.order > 2 && graph.size > 0) {
        forceAtlas2.assign(graph, {
          iterations: Math.min(120, Math.max(45, graph.order * 2)),
          settings: {
            ...forceAtlas2.inferSettings(graph),
            gravity: 0.7,
            scalingRatio: 7,
            slowDown: 8,
            barnesHutOptimize: graph.order > 80
          }
        })
      }
    } catch (e) {
      console.warn('[KnowledgeGraph] force layout failed, keep radial layout:', e)
    }

    try {
      renderStage.value = `初始化 Sigma WebGL：${width}×${height}`
      renderer = new Sigma(graph, container.value, {
        renderEdgeLabels: false,
        labelDensity: 0.12,
        labelGridCellSize: 110,
        labelRenderedSizeThreshold: 9,
        defaultEdgeType: 'line',
        zIndex: true,
        minCameraRatio: 0.08,
        maxCameraRatio: 4
      })

      renderer.on('clickNode', ({ node }) => selectNode(node, true))
      renderer.on('clickStage', () => {
        selectedNode.value = null
        selectedLinks.value = []
      })
      lastRenderedSignature = signature
      graphCanvasReady.value = true
      renderStage.value = '真实图谱已打开'
      requestAnimationFrame(() => {
        if (renderer && isContainerRenderable()) renderer.refresh()
      })
      refreshReducers()
    } catch (error) {
      renderError.value = error?.message || String(error)
      renderStage.value = 'Sigma 初始化失败'
      graphCanvasReady.value = false
      console.error('[KnowledgeGraph] Sigma init failed:', error)
    }
  }

  function refreshReducers() {
    if (!renderer || !graph) return
    const selectedId = selectedNode.value?.id || ''
    const selectedNeighbors = new Set(selectedId ? graph.neighbors(selectedId) : [])
    const filterType = activeType.value

    renderer.setSetting('nodeReducer', (node, data) => {
      const next = { ...data }
      const typeVisible = filterType === 'all' || data.nodeKind === filterType
      if (!typeVisible) {
        next.hidden = true
        return next
      }
      if (selectedId && node !== selectedId && !selectedNeighbors.has(node)) {
        next.color = '#d4d4d8'
        next.label = ''
        next.size = Math.max(3, data.size * 0.62)
        next.zIndex = 0
      }
      if (node === selectedId) {
        next.size = data.size * 1.35
        next.highlighted = true
        next.zIndex = 10
      }
      return next
    })

    renderer.setSetting('edgeReducer', (edge, data) => {
      const extremities = graph.extremities(edge)
      const visibleByType =
        filterType === 'all' ||
        extremities.some((node) => graph.getNodeAttribute(node, 'nodeKind') === filterType)
      if (!visibleByType) return { ...data, hidden: true }
      if (selectedId && !extremities.includes(selectedId)) {
        return { ...data, color: 'rgba(185, 217, 162, 0.24)', size: 0.4 }
      }
      return data
    })

    renderer.refresh()
  }

  function selectNode(nodeId, moveCamera = false) {
    if (!graph || !graph.hasNode(nodeId)) return
    const attrs = graph.getNodeAttributes(nodeId)
    selectedNode.value = attrs.raw
    selectedLinks.value = (props.graphData.edges || [])
      .filter((edge) => edge.source === nodeId || edge.target === nodeId)
      .slice(0, 12)
      .map((edge) => {
        const otherId = edge.source === nodeId ? edge.target : edge.source
        const other = props.graphData.nodes.find((item) => item.id === otherId)
        return { ...edge, otherLabel: other?.label || otherId, otherType: other?.type || 'concept' }
      })

    if (moveCamera && renderer) {
      renderer.getCamera().animate({ x: attrs.x, y: attrs.y, ratio: 0.42 }, { duration: 420 })
    }
  }

  function fitGraph() {
    if (!renderer) return
    renderer.getCamera().animatedReset({ duration: 420 })
  }

  function searchNode() {
    const keyword = searchText.value.trim().toLowerCase()
    if (!keyword || !props.graphData?.nodes?.length) return
    const found = props.graphData.nodes.find((node) => {
      const meta = node.meta ? JSON.stringify(node.meta).toLowerCase() : ''
      return `${node.label} ${meta}`.toLowerCase().includes(keyword)
    })
    if (found) selectNode(found.id, true)
  }

  function formatPercent(value) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) return '-'
    return `${Math.round(Number(value) * 100)}%`
  }

  function formatDate(ts) {
    if (!ts) return '-'
    return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return {
    container,
    searchText,
    selectedNode,
    selectedLinks,
    activeType,
    graphCanvasReady,
    renderStage,
    renderError,
    typeConfig,
    hasGraph,
    graphStatusText,
    legendItems,
    searchNode,
    fitGraph,
    formatPercent,
    formatDate
  }
}
