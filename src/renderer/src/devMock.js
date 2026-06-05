const now = Date.now()

function ok(data) {
  return Promise.resolve({ success: true, data })
}

function fail(error) {
  return Promise.resolve({ success: false, error })
}

function installBrowserPreviewMocks() {
  if (window.electron || window.__XUEMATE_BROWSER_PREVIEW__) return
  window.__XUEMATE_BROWSER_PREVIEW__ = true

  const conversations = [
    {
      id: 'preview-chat',
      title: '浏览器预览对话',
      createdAt: now,
      updatedAt: now
    }
  ]
  const messages = {
    'preview-chat': [
      {
        id: 'm1',
        role: 'assistant',
        content: '这是前端浏览器预览模式。完整聊天、资料导入和网页控制需要在 Electron 应用里运行。',
        timestamp: now
      }
    ]
  }

  const collections = [
    {
      id: 'default',
      name: '默认资料库',
      description: '浏览器预览数据',
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
    error: new Set()
  }

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
    createCollection: (name) =>
      ok({
        id: `preview-${Date.now()}`,
        name,
        description: '浏览器预览资料夹',
        docCount: 0,
        chunkCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }),
    selectAndImport: () => fail('浏览器预览不能读取本地文件，请在 Electron 应用中导入资料'),
    importFile: () => fail('浏览器预览不能读取本地文件，请在 Electron 应用中导入资料'),
    documents: () => ok(docs),
    delete: () => fail('浏览器预览不会删除真实资料'),
    stats: () => ok({ docCount: docs.length, chunkCount: 8 }),
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
      conversations.unshift({ id, title: '新预览对话', createdAt: Date.now(), updatedAt: Date.now() })
      messages[id] = []
      return ok(id)
    },
    deleteConversation: (id) => {
      const idx = conversations.findIndex((item) => item.id === id)
      if (idx >= 0) conversations.splice(idx, 1)
      delete messages[id]
      return ok(true)
    },
    sendMessage: (convId, content) => {
      const reply = `浏览器预览已收到：“${content}”。真实 AI 回复需要 Electron 主进程和模型密钥。`
      messages[convId] = messages[convId] || []
      messages[convId].push({ id: `u-${Date.now()}`, role: 'user', content, timestamp: Date.now() })
      messages[convId].push({ id: `a-${Date.now()}`, role: 'assistant', content: reply, timestamp: Date.now() })
      setTimeout(() => {
        streamListeners.token.forEach((fn) => fn(reply))
        streamListeners.done.forEach((fn) => fn(reply))
      }, 120)
      return ok(true)
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
    }
  }

  window.task = {
    getAll: () => ok([]),
    add: (tasks) =>
      ok(
        tasks.map((task, index) => ({
          id: `preview-task-${Date.now()}-${index}`,
          ...task,
          createdAt: Date.now()
        }))
      ),
    update: () => ok(true),
    delete: () => ok(true),
    toggle: () => ok(true)
  }

  window.llm = {
    parseTask: () =>
      ok(
        JSON.stringify({
          tasks: [
            {
              title: '预览任务',
              deadline: '无',
              deadlineDate: '',
              format: '不限',
              naming: '',
              note: '浏览器预览不会调用真实模型'
            }
          ],
          checklist: ['在 Electron 应用中运行可获得真实解析结果']
        })
      ),
    tutorCode: () =>
      ok(
        JSON.stringify({
          errors: [],
          suggestions: ['这是浏览器预览结果，真实辅导需要模型接口。'],
          tips: ['先确认完整 Electron 应用能启动。']
        })
      ),
    generateReview: () =>
      ok(
        JSON.stringify({
          course: '浏览器预览课程',
          chapters: [
            { title: '核心概念', freq: 5, points: ['定义', '应用场景', '常见误区'] },
            { title: '例题训练', freq: 4, points: ['基础题', '变式题', '错题复盘'] },
            { title: '综合复习', freq: 3, points: ['知识串联', '限时练习'] }
          ],
          tips: ['真实复习提纲需要 Electron 主进程调用模型生成。', '现在展示的是浏览器预览数据。']
        })
      ),
    judgeCode: () => ok(JSON.stringify({ passed: false, feedback: '浏览器预览不会执行真实判题。' })),
    generateProblems: () => ok(JSON.stringify({ problems: ['预览练习题'] }))
  }

  window.file = {
    selectPDF: () => fail('浏览器预览不能打开系统文件选择器'),
    checkPDF: () => fail('浏览器预览不能解析本地 PDF')
  }

  window.quickSearch = {
    run: (query) =>
      ok({
        query,
        mode: 'local',
        summary:
          '这是浏览器预览结果。真实运行时，XueMate 会调用本地或云端搜索服务，把网页资料整理成适合学生阅读的总结。',
        sources: [
          {
            title: '预览资料源',
            url: 'https://example.com/xuemate-preview',
            level: '预览',
            scores: {
              level: '预览',
              overall: 0
            }
          }
        ],
        stages: [
          {
            name: '浏览器预览',
            status: 'done',
            detail: `已接收查询：${query}`,
            at: new Date().toISOString()
          }
        ]
      })
  }

  window.webAssistant = {
    start: () => fail('浏览器预览不能控制 Electron 内置网页'),
    stop: () => ok(true),
    setLiveBounds: () => ok(true),
    onUpdate: () => () => {}
  }
}

installBrowserPreviewMocks()
