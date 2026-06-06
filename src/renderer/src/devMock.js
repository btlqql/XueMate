const now = Date.now()

function ok(data) {
  return Promise.resolve({ success: true, data })
}

function fail(error) {
  return Promise.resolve({ success: false, error })
}

function success(extra = {}) {
  return Promise.resolve({ success: true, ...extra })
}

function installBrowserPreviewMocks() {
  if (window.electron || window.__XUEMATE_BROWSER_PREVIEW__) return
  window.__XUEMATE_BROWSER_PREVIEW__ = true

  const conversations = [
    {
      id: 'preview-chat',
      title: '试用对话',
      createdAt: now,
      updatedAt: now
    }
  ]
  const messages = {
    'preview-chat': [
      {
        id: 'm1',
        role: 'assistant',
        content:
          '这里是试用模式，可以先看看页面和基本流程。完整的软件窗口里可以使用资料导入、聊天和网页查看。',
        timestamp: now
      }
    ]
  }

  const collections = [
    {
      id: 'default',
      name: '默认资料库',
      description: '试用数据',
      docCount: 2,
      chunkCount: 8,
      createdAt: now,
      updatedAt: now
    }
  ]

  const docs = [
    {
      id: 'doc-1',
      collectionId: 'default',
      fileName: 'Python循环与列表.pdf',
      chunkCount: 5,
      createdAt: now
    },
    {
      id: 'doc-2',
      collectionId: 'default',
      fileName: '冒泡排序课堂笔记.md',
      chunkCount: 3,
      createdAt: now - 1000 * 60 * 60
    }
  ]

  const streamListeners = {
    token: new Set(),
    done: new Set(),
    error: new Set(),
    event: new Set()
  }
  const tasksList = []

  const resolveDocuments = (collectionId) =>
    collectionId && collectionId !== 'all'
      ? docs.filter((doc) => doc.collectionId === collectionId)
      : docs

  const refreshCollectionStats = () => {
    collections.forEach((collection) => {
      const collectionDocs = docs.filter((doc) => doc.collectionId === collection.id)
      collection.docCount = collectionDocs.length
      collection.chunkCount = collectionDocs.reduce(
        (sum, doc) => sum + Number(doc.chunkCount || 0),
        0
      )
      collection.updatedAt = collection.updatedAt || now
    })
  }

  const emitChatEvent = (event) => {
    streamListeners.event.forEach((fn) => fn(event))
    if (event.type === 'token')
      streamListeners.token.forEach((fn) => fn(String(event.payload || '')))
    if (event.type === 'done') streamListeners.done.forEach((fn) => fn(String(event.payload || '')))
    if (event.type === 'error')
      streamListeners.error.forEach((fn) => fn(String(event.payload || '')))
  }

  refreshCollectionStats()

  window.electron = {
    process: {
      versions: {
        electron: 'preview',
        chrome: 'preview',
        node: 'preview'
      }
    }
  }

  window.rag = {
    collections: () => ok(collections),
    createCollection: (name) => {
      const newCollection = {
        id: `preview-${Date.now()}`,
        name,
        description: '试用资料夹',
        docCount: 0,
        chunkCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      collections.push(newCollection)
      return ok(newCollection)
    },
    selectAndImport: () => fail('试用模式暂时不能读取本地文件，请在完整软件窗口中导入资料。'),
    importFile: () => fail('试用模式暂时不能读取本地文件，请在完整软件窗口中导入资料。'),
    documents: (collectionId) => ok(resolveDocuments(collectionId)),
    delete: () => fail('试用模式不会删除资料。'),
    stats: (collectionId) => {
      const filteredDocs = resolveDocuments(collectionId)
      return ok({
        docCount: filteredDocs.length,
        chunkCount: filteredDocs.reduce((sum, doc) => sum + Number(doc.chunkCount || 0), 0)
      })
    },
    learningGraph: () =>
      ok({
        nodes: [
          { id: 'default', label: '默认资料库', type: 'collection', size: 12 },
          { id: 'doc-1', label: 'Python循环与列表.pdf', type: 'document', size: 9 },
          { id: 'doc-2', label: '冒泡排序课堂笔记.md', type: 'document', size: 9 },
          { id: 'topic-loop', label: '循环', type: 'topic', size: 10 },
          { id: 'topic-index', label: '列表索引', type: 'topic', size: 10 }
        ],
        edges: [
          { id: 'e1', source: 'default', target: 'doc-1' },
          { id: 'e2', source: 'default', target: 'doc-2' },
          { id: 'e3', source: 'doc-1', target: 'topic-loop' },
          { id: 'e4', source: 'doc-2', target: 'topic-index' }
        ]
      })
  }

  window.chat = {
    getConversations: () => ok(conversations),
    getConversation: (id) => ok({ id, messages: messages[id] || [] }),
    createConversation: () => {
      const id = `preview-${Date.now()}`
      conversations.unshift({ id, title: '新对话', createdAt: Date.now(), updatedAt: Date.now() })
      messages[id] = []
      return ok(id)
    },
    deleteConversation: (id) => {
      const idx = conversations.findIndex((item) => item.id === id)
      if (idx >= 0) conversations.splice(idx, 1)
      delete messages[id]
      return ok(true)
    },
    sendMessage: (convId, content, options = {}) => {
      const requestId = options?.requestId || `preview-chat-${Date.now()}`
      const reply = `已收到：“${content}”。试用模式只展示流程，完整软件窗口里会继续给出详细回复。`
      const timestamp = Date.now()
      messages[convId] = messages[convId] || []
      messages[convId].push({ id: `u-${timestamp}`, role: 'user', content, timestamp })
      messages[convId].push({ id: `a-${timestamp}`, role: 'assistant', content: reply, timestamp })

      const conversation = conversations.find((item) => item.id === convId)
      if (conversation) {
        conversation.title = String(content || '').slice(0, 18) || conversation.title
        conversation.updatedAt = timestamp
      }

      setTimeout(() => {
        emitChatEvent({
          requestId,
          convId,
          source: 'chat',
          type: 'token',
          payload: reply,
          ts: Date.now()
        })
        emitChatEvent({
          requestId,
          convId,
          source: 'chat',
          type: 'done',
          payload: reply,
          ts: Date.now()
        })
      }, 120)
      return success({ streaming: true, requestId })
    },
    getMemory: () => ok({ profile: {}, atoms: [] }),
    onStreamToken: (callback) => {
      streamListeners.token.add(callback)
      return () => streamListeners.token.delete(callback)
    },
    onStreamDone: (callback) => {
      streamListeners.done.add(callback)
      return () => streamListeners.done.delete(callback)
    },
    onStreamError: (callback) => {
      streamListeners.error.add(callback)
      return () => streamListeners.error.delete(callback)
    },
    onStreamEvent: (callback) => {
      streamListeners.event.add(callback)
      return () => streamListeners.event.delete(callback)
    }
  }

  window.task = {
    getAll: () => ok(tasksList),
    add: (tasks) => {
      const timestamp = Date.now()
      const newTasks = tasks.map((task, index) => ({
        id: `preview-task-${timestamp}-${index}`,
        ...task,
        createdAt: timestamp
      }))
      tasksList.push(...newTasks)
      return ok(tasksList)
    },
    update: (id, fields = {}) => {
      const task = tasksList.find((item) => item.id === id)
      if (task) Object.assign(task, fields)
      return ok(true)
    },
    delete: (id) => {
      const index = tasksList.findIndex((task) => task.id === id)
      if (index >= 0) tasksList.splice(index, 1)
      return ok(true)
    },
    toggle: (id) => {
      const task = tasksList.find((item) => item.id === id)
      if (task) task.status = task.status === 'done' ? 'pending' : 'done'
      return ok(true)
    }
  }

  window.llm = {
    parseTask: () =>
      ok(
        JSON.stringify({
          tasks: [
            {
              title: '整理作业通知',
              deadline: '无',
              deadlineDate: '',
              format: '不限',
              naming: '',
              note: '试用模式示例'
            }
          ],
          checklist: ['确认提交格式', '检查文件命名', '留意截止时间']
        })
      ),
    tutorCode: () =>
      ok(
        JSON.stringify({
          errors: [],
          suggestions: ['先看循环范围，再检查边界条件。'],
          tips: ['把容易出错的地方单独写成一条检查项。']
        })
      ),
    generateReview: () =>
      ok(
        JSON.stringify({
          course: '数据结构',
          chapters: [
            { title: '核心概念', freq: 5, points: ['定义', '应用场景', '常见误区'] },
            { title: '例题训练', freq: 4, points: ['基础题', '变式题', '错题复盘'] },
            { title: '综合复习', freq: 3, points: ['知识串联', '限时练习'] }
          ],
          tips: ['先把概念过一遍，再集中做错题。', '每天留十分钟回看前一天的薄弱点。']
        })
      ),
    judgeCode: () => ok(JSON.stringify({ passed: false, feedback: '试用模式下只展示提交流程。' })),
    generateProblems: () => ok(JSON.stringify({ problems: ['两数之和练习题'] }))
  }

  window.file = {
    selectPDF: () => fail('试用模式暂时不能选择本地文件。'),
    checkPDF: () => fail('试用模式暂时不能检查本地 PDF。')
  }

  window.quickSearch = {
    history: () => ok([]),
    onBackgroundUpdate: () => () => {},
    run: (query) =>
      ok({
        query,
        mode: 'local',
        summary:
          '先给你一版整理结果：可以从题型、知识点和练习材料三个方向看。完整软件窗口里会继续补充来源和细节。',
        sources: [
          {
            title: '示例资料来源',
            url: 'https://example.com/xuemate-preview',
            level: '示例',
            scores: {
              level: '示例',
              overall: 0
            }
          }
        ],
        stages: [
          {
            name: '试用模式',
            status: 'done',
            detail: `已接收查询：${query}`,
            at: new Date().toISOString()
          }
        ]
      })
  }

  window.webAssistant = {
    isPreview: true,
    start: () => fail('试用模式暂时不能打开内置网页，请在完整软件窗口中使用。'),
    stop: () => ok(true),
    setLiveBounds: () => ok(true),
    onUpdate: () => () => {}
  }
}

installBrowserPreviewMocks()
