const BRIDGE_BASE = 'http://127.0.0.1:8788/api/rag'

function ipcRag() {
  return window.rag && typeof window.rag.collections === 'function' ? window.rag : null
}

function withQuery(path, params = {}) {
  const url = new URL(`${BRIDGE_BASE}/${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }
  return url.toString()
}

async function bridgeGet(path, params) {
  const response = await fetch(withQuery(path, params))
  if (!response.ok) {
    return { success: false, error: `本地真实接口失败：${response.status}` }
  }
  return response.json()
}

export const ragClient = {
  collections() {
    const api = ipcRag()
    return api ? api.collections() : bridgeGet('collections')
  },

  createCollection(name, description = '') {
    const api = ipcRag()
    return api
      ? api.createCollection(name, description)
      : Promise.resolve({ success: false, error: '请在 Electron 软件窗口中新建资料夹' })
  },

  importFile(filePath, collectionId) {
    const api = ipcRag()
    return api
      ? api.importFile(filePath, collectionId)
      : Promise.resolve({ success: false, error: '请在 Electron 软件窗口中导入资料' })
  },

  selectAndImport(collectionId) {
    const api = ipcRag()
    return api
      ? api.selectAndImport(collectionId)
      : Promise.resolve({ success: false, error: '请在 Electron 软件窗口中导入资料' })
  },

  documents(collectionId) {
    const api = ipcRag()
    return api ? api.documents(collectionId) : bridgeGet('documents', { collectionId })
  },

  delete(docId) {
    const api = ipcRag()
    return api
      ? api.delete(docId)
      : Promise.resolve({ success: false, error: '请在 Electron 软件窗口中删除资料' })
  },

  stats(collectionId) {
    const api = ipcRag()
    return api ? api.stats(collectionId) : bridgeGet('stats', { collectionId })
  },

  learningGraph(collectionId) {
    const api = ipcRag()
    return api ? api.learningGraph(collectionId) : bridgeGet('learningGraph', { collectionId })
  }
}
