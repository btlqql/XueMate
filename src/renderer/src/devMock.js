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
      docCount: 5,
      chunkCount: 22,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'english',
      name: '英语',
      description: '试用英语资料',
      docCount: 2,
      chunkCount: 9,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'math',
      name: '数学',
      description: '试用数学资料',
      docCount: 2,
      chunkCount: 10,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'science-code',
      name: '科学编程',
      description: '试用科学编程资料',
      docCount: 2,
      chunkCount: 10,
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
    },
    {
      id: 'doc-3',
      collectionId: 'default',
      fileName: 'XueMate学习助手总览.md',
      chunkCount: 4,
      createdAt: now - 1000 * 60 * 90
    },
    {
      id: 'doc-4',
      collectionId: 'default',
      fileName: '作业任务解析与学习路径.md',
      chunkCount: 4,
      createdAt: now - 1000 * 60 * 120
    },
    {
      id: 'doc-5',
      collectionId: 'default',
      fileName: 'arduino_optimization_notes.md',
      chunkCount: 6,
      createdAt: now - 1000 * 60 * 150
    },
    {
      id: 'doc-6',
      collectionId: 'english',
      fileName: '小学英语单词语法阅读.md',
      chunkCount: 5,
      createdAt: now
    },
    {
      id: 'doc-7',
      collectionId: 'english',
      fileName: '英语口语校园情景.md',
      chunkCount: 4,
      createdAt: now
    },
    {
      id: 'doc-8',
      collectionId: 'math',
      fileName: '四年级数学分数小数面积.md',
      chunkCount: 5,
      createdAt: now
    },
    {
      id: 'doc-9',
      collectionId: 'math',
      fileName: '数学应用题数量关系.md',
      chunkCount: 5,
      createdAt: now
    },
    {
      id: 'doc-10',
      collectionId: 'science-code',
      fileName: '科学实验植物磁铁过滤.md',
      chunkCount: 5,
      createdAt: now
    },
    {
      id: 'doc-11',
      collectionId: 'science-code',
      fileName: 'Scratch_Python少儿编程.md',
      chunkCount: 5,
      createdAt: now
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
          { id: 'concept-loop', label: '循环', type: 'concept', size: 10 },
          { id: 'concept-index', label: '列表索引', type: 'concept', size: 10 },
          { id: 'concept-rag', label: 'RAG', type: 'concept', size: 10 }
        ],
        edges: [
          { id: 'e1', source: 'default', target: 'doc-1' },
          { id: 'e2', source: 'default', target: 'doc-2' },
          { id: 'e3', source: 'doc-1', target: 'concept-loop' },
          { id: 'e4', source: 'doc-2', target: 'concept-index' }
        ],
        stats: {
          nodeCount: 32,
          edgeCount: 48,
          collectionCount: 4,
          documentCount: 11,
          chunkCount: 51,
          conceptCount: 12,
          memoryAtomCount: 0,
          reviewTaskCount: 0,
          weakPointCount: 2,
          density: 0.04
        }
      }),
    learningGraphSummary: () =>
      ok({
        stats: {
          nodeCount: 32,
          edgeCount: 48,
          collectionCount: 4,
          documentCount: 11,
          chunkCount: 51,
          conceptCount: 12,
          memoryAtomCount: 0,
          reviewTaskCount: 0,
          weakPointCount: 2,
          density: 0.04
        },
        topConcepts: ['循环', '列表索引', 'RAG', '分数', '英语口语']
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
        results: [
          {
            score: 0.86,
            denseScore: 0.82,
            lexicalScore: 0.74,
            rankReason: ['关键词命中', '语义接近'],
            chunk: {
              id: 'preview-chunk-1',
              docId: 'doc-1',
              collectionId: 'default',
              fileName: 'Python循环与列表.pdf',
              content:
                '循环适合处理重复步骤，列表适合保存一组有顺序的数据。学习时可以先找变量变化，再看循环停止条件。',
              startPos: 128,
              endPos: 184
            }
          }
        ],
        sources: [
          {
            title: '示例资料来源',
            url: 'https://example.com/xuemate-preview',
            text: '这是一段预览来源内容，用来展示网页摘要、可信度和引用卡片的排版效果。',
            level: '示例',
            scores: {
              relevance: 0.82,
              readability: 0.9,
              ageFit: 0.88,
              trust: 0.76,
              adNoise: 0.1,
              level: '示例',
              overall: 0.84,
              reason: '内容简短，适合先了解基本概念'
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

  const agentUpdateListeners = new Set()
  const agentConfirmListeners = new Set()
  let agentStopped = false

  window.agent = {
    start: (task) => {
      agentStopped = false
      const previewSteps = [
        {
          id: 1,
          thinking: '确认当前资料和学习上下文',
          command: '读取 RAG / 知识图谱 / 学习线索摘要',
          output: '已连接全部资料：11 份资料、51 个片段、12 个知识点、2 个薄弱点。',
          status: 'done',
          level: 'safe'
        },
        {
          id: 2,
          thinking: '检查当前软件入口状态',
          command: '检查聊天页内检查现场抽屉',
          output: '检查现场作为聊天内子功能展开，完成后可以回填到当前输入框。',
          status: 'done',
          level: 'safe'
        }
      ]
      agentUpdateListeners.forEach((listener) =>
        listener({ state: 'thinking', steps: [], stepCount: 0, maxSteps: 24 })
      )
      setTimeout(() => {
        if (agentStopped) return
        agentUpdateListeners.forEach((listener) =>
          listener({ state: 'executing', steps: [previewSteps[0]], stepCount: 1, maxSteps: 24 })
        )
      }, 150)
      setTimeout(() => {
        if (agentStopped) return
        agentUpdateListeners.forEach((listener) =>
          listener({ state: 'executing', steps: previewSteps, stepCount: 2, maxSteps: 24 })
        )
      }, 320)
      return new Promise((resolve) => {
        setTimeout(() => {
          if (agentStopped) {
            resolve({ success: false, error: '用户停止' })
            return
          }
          const finalSummary = `1. 结论：检查现场入口已经接回聊天主回路。\n2. 我检查了什么：已连接 RAG 资料、知识图谱和学习线索；检查结果会回填到当前对话输入框。\n3. 发现的问题：预览模式只模拟执行，完整软件窗口会调用真实 sandbox/多模态检查。\n4. 下一步建议：把回填内容发送给问学伴，让它结合当前资料继续解释。`
          agentUpdateListeners.forEach((listener) =>
            listener({
              state: 'done',
              steps: previewSteps,
              stepCount: 2,
              maxSteps: 24,
              finalSummary
            })
          )
          resolve({ success: true, finalSummary })
        }, 520)
      })
    },
    stop: () => {
      agentStopped = true
      return success()
    },
    confirmResult: () => success(),
    onUpdate: (callback) => {
      agentUpdateListeners.add(callback)
      return () => agentUpdateListeners.delete(callback)
    },
    onConfirm: (callback) => {
      agentConfirmListeners.add(callback)
      return () => agentConfirmListeners.delete(callback)
    }
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
