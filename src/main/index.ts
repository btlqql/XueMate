import 'dotenv/config'
import { app, shell, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { join, basename } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  parseTask,
  tutorCode,
  generateReview,
  judgeCode,
  generateProblems,
  checkFormat,
  chat,
  chatStream,
  MODEL,
  PRO_MODEL
} from './services/llm'
import { runAgent } from './services/agent'
import { runWebAssistant } from './services/computerUse'
import { quickSearch } from './services/quickSearch'
import {
  destroyWebView,
  setHostWindow,
  showBrowserAtHeight,
  hideBrowser,
  setLiveBrowserBounds
} from './services/web'
import * as chatStore from './services/chatStore'
import {
  getMemory,
  saveMemory,
  buildSystemPrompt,
  extractMemory,
  compressMemoryIfNeeded
} from './services/memory'
import * as rag from './services/rag'
import { buildLearningGraph } from './services/learningGraph'
import * as taskStore from './services/taskStore'
import { migrateFromJson } from './services/migrate'
import { ensureEnoughText, extractTextFromFile } from './services/document'

// 启动时自动迁移旧数据
migrateFromJson()

let agentRunning = false
let webAssistantRunning = false

let confirmResolve: ((approved: boolean) => void) | null = null

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 设置 web 模块的宿主窗口
  setHostWindow(mainWindow)
}

// 注册 LLM 相关的 IPC 处理器
function registerLLMHandlers(): void {
  // 任务解析
  ipcMain.handle('llm:parseTask', async (_event, text: string) => {
    console.log('[Main] llm:parseTask called, text length:', text.length)
    try {
      const result = await parseTask(text)
      console.log('[Main] parseTask success, length:', result.length)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[Main] parseTask error:', error.message)
      return { success: false, error: error.message }
    }
  })

  // 学习辅导
  ipcMain.handle('llm:tutorCode', async (_event, code: string, type: 'code' | 'report') => {
    try {
      const result = await tutorCode(code, type)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 刷题判题
  ipcMain.handle(
    'llm:judgeCode',
    async (_event, problem: string, code: string, language: string) => {
      console.log('[Main] llm:judgeCode called')
      try {
        const result = await judgeCode(problem, code, language)
        return { success: true, data: result }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 生成练习题
  ipcMain.handle('llm:generateProblems', async (_event, topic: string, count: number) => {
    console.log('[Main] llm:generateProblems called')
    try {
      const result = await generateProblems(topic, count)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 选择PDF文件
  ipcMain.handle('file:selectPDF', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: '无窗口' }
    const result = await dialog.showOpenDialog(win, {
      title: '选择作业文件',
      filters: [
        { name: 'PDF文件', extensions: ['pdf'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消' }
    }
    return { success: true, data: result.filePaths[0] }
  })

  // 解析PDF并检查格式
  ipcMain.handle('file:checkPDF', async (_event, filePath: string) => {
    console.log('[Main] file:checkPDF called:', filePath)
    try {
      const extracted = await extractTextFromFile(filePath)
      if (extracted.ext !== 'pdf') {
        return { success: false, error: `请选择 PDF 文件，当前格式为 .${extracted.ext}` }
      }
      const formatResult = await checkFormat(extracted.text, extracted.fileName)
      return {
        success: true,
        data: JSON.stringify({
          fileName: extracted.fileName,
          pageCount: extracted.pageCount || 1,
          textLength: extracted.textLength,
          preview: extracted.preview,
          formatCheck: JSON.parse(formatResult)
        })
      }
    } catch (error: any) {
      console.error('[Main] checkPDF error:', error.message)
      return { success: false, error: error.message }
    }
  })

  // 复习总结
  ipcMain.handle('llm:generateReview', async (_event, courseName: string) => {
    try {
      const result = await generateReview(courseName)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 智能助手 - 启动
  ipcMain.handle('agent:start', async (event, task: string) => {
    if (agentRunning) return { success: false, error: '已有任务在执行' }
    agentRunning = true
    console.log('[Main] agent:start:', task)

    const win = BrowserWindow.fromWebContents(event.sender)

    const result = await runAgent(
      task,
      (data) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('agent:update', data)
        }
      },
      (command, reason) => {
        // 发确认请求给前端，等待用户操作
        return new Promise<boolean>((resolve) => {
          confirmResolve = resolve
          if (win && !win.isDestroyed()) {
            win.webContents.send('agent:confirm', { command, reason })
          }
          // 30秒超时自动拒绝
          setTimeout(() => {
            if (confirmResolve === resolve) {
              confirmResolve = null
              resolve(false)
            }
          }, 30000)
        })
      },
      () => !agentRunning
    )

    agentRunning = false
    confirmResolve = null
    destroyWebView() // 任务结束销毁浏览器，释放内存
    return { success: result.success, error: result.error }
  })

  // 智能助手 - 停止
  ipcMain.handle('agent:stop', async () => {
    agentRunning = false
    if (confirmResolve) {
      confirmResolve(false)
      confirmResolve = null
    }
    destroyWebView() // 停止时也销毁浏览器
    return { success: true }
  })

  // 智能助手 - 用户确认结果
  ipcMain.handle('agent:confirmResult', async (_event, approved: boolean) => {
    if (confirmResolve) {
      confirmResolve(approved)
      confirmResolve = null
    }
    return { success: true }
  })

  // 浏览器显示/隐藏
  ipcMain.handle('agent:showBrowser', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    showBrowserAtHeight()
    return { success: true }
  })

  ipcMain.handle('agent:hideBrowser', async () => {
    hideBrowser()
    return { success: true }
  })

  // 网页小助手：普通多模态模型看截图，然后控制内置浏览器
  ipcMain.handle('webAssistant:start', async (event, goal: string) => {
    if (webAssistantRunning) return { success: false, error: '网页小助手正在执行' }
    webAssistantRunning = true
    const win = BrowserWindow.fromWebContents(event.sender)

    const result = await runWebAssistant(
      goal,
      (data) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('webAssistant:update', data)
        }
      },
      () => !webAssistantRunning
    )

    webAssistantRunning = false
    return result
  })

  ipcMain.handle('webAssistant:stop', async () => {
    webAssistantRunning = false
    return { success: true }
  })

  ipcMain.handle('webAssistant:setLiveBounds', async (_event, bounds) => {
    setLiveBrowserBounds(bounds || null)
    return { success: true }
  })

  ipcMain.handle('quickSearch:run', async (_event, query: string) => {
    try {
      return { success: true, data: await quickSearch(query) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ===== Chat 对话系统 =====

  ipcMain.handle('chat:getConversations', async () => {
    try {
      const conversations = chatStore.getConversations()
      return { success: true, data: conversations }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:getConversation', async (_event, id: string) => {
    try {
      const conv = chatStore.getConversation(id)
      return { success: true, data: conv }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:createConversation', async () => {
    try {
      const id = chatStore.createConversation()
      return { success: true, data: id }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:deleteConversation', async (_event, id: string) => {
    try {
      const ok = chatStore.deleteConversation(id)
      return { success: ok }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(
    'chat:sendMessage',
    async (event, convId: string, content: string, options?: { collectionId?: string }) => {
      console.log('[Main] chat:sendMessage called, convId:', convId, 'model:', MODEL)
      const win = BrowserWindow.fromWebContents(event.sender)

      try {
        // 1. 保存用户消息
        const userMsg: chatStore.ChatMessage = {
          id: Date.now().toString(),
          role: 'user',
          content,
          timestamp: Date.now()
        }
        chatStore.addMessage(convId, userMsg)

        // 2. 加载记忆，构建系统提示词
        const memory = getMemory()
        const systemPrompt = buildSystemPrompt(memory)

        // 3. 取最近 20 条消息作为上下文
        const conv = chatStore.getConversation(convId)
        const recentMessages = conv
          ? conv.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }))
          : [{ role: 'user' as const, content }]

        // 4. RAG 检索（如果有知识库）
        let ragContext = ''
        const ragCollectionId = options?.collectionId || rag.ALL_COLLECTIONS_ID
        const stats =
          ragCollectionId === rag.RAG_OFF_ID
            ? { docCount: 0, chunkCount: 0 }
            : rag.getStats(ragCollectionId)
        if (stats.chunkCount > 0) {
          try {
            const results = await rag.retrieve(content, {
              topK: 4,
              candidateK: 48,
              minScore: 0.16,
              collectionId: ragCollectionId
            })
            if (results.length > 0 && results[0].score > 0.24) {
              ragContext = rag.buildRagContext(results, {
                title: '以下是用户课程资料中的相关内容'
              })
            }
          } catch (e) {
            console.error('[RAG] 检索失败:', e)
          }
        }

        // 5. 流式调用 LLM（立即返回，token 通过 IPC 推送）
        chatStream({
          model: MODEL,
          messages: [{ role: 'system', content: systemPrompt + ragContext }, ...recentMessages],
          temperature: 0.7,
          maxTokens: 4096,
          onToken(token) {
            if (win && !win.isDestroyed()) {
              win.webContents.send('chat:stream-token', token)
            }
          },
          onDone(fullContent) {
            // 保存 AI 回复
            const assistantMsg: chatStore.ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: fullContent,
              timestamp: Date.now()
            }
            chatStore.addMessage(convId, assistantMsg)
            if (win && !win.isDestroyed()) {
              win.webContents.send('chat:stream-done', fullContent)
            }
            // 后台异步提取记忆 → 压缩归档（fire-and-forget）
            extractMemory(recentMessages, memory)
              .then((updated) => {
                saveMemory(updated)
                return compressMemoryIfNeeded(updated)
              })
              .catch((e) => console.error('[Memory] 后台处理失败:', e))
          },
          onError(error) {
            if (win && !win.isDestroyed()) {
              win.webContents.send('chat:stream-error', error)
            }
          }
        })

        // 立即返回，不等待 LLM 完成
        return { success: true, streaming: true }
      } catch (error: any) {
        console.error('[Main] chat:sendMessage error:', error.message)
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle('chat:getMemory', async () => {
    try {
      const memory = getMemory()
      return { success: true, data: memory }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ===== RAG 知识库 =====

  ipcMain.handle('rag:collections', async () => {
    try {
      return { success: true, data: rag.getCollections() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rag:createCollection', async (_event, name: string, description = '') => {
    try {
      return { success: true, data: rag.createCollection(name, description) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rag:importFile', async (_event, filePath: string, collectionId?: string) => {
    console.log('[Main] rag:importFile called:', filePath, 'collection:', collectionId)
    try {
      const { fileName, text } = await extractTextFromFile(filePath)
      ensureEnoughText(text)
      const doc = await rag.importDocument(
        fileName,
        text,
        undefined,
        collectionId || rag.DEFAULT_COLLECTION_ID
      )
      return { success: true, data: doc }
    } catch (error: any) {
      console.error('[Main] rag:importFile error:', error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rag:selectAndImport', async (event, collectionId?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: '无窗口' }

    const targetCollectionId = collectionId || rag.DEFAULT_COLLECTION_ID

    const result = await dialog.showOpenDialog(win, {
      title: '选择课程资料',
      filters: [
        { name: '文档', extensions: ['pdf', 'txt', 'md'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消' }
    }

    const imported = []
    const errors = []

    for (const filePath of result.filePaths) {
      try {
        const { fileName, text } = await extractTextFromFile(filePath)
        ensureEnoughText(text)

        // 多文件导入时给 GC 时间回收上一个文件的内存
        if (result.filePaths.length > 1) {
          await new Promise((r) => setTimeout(r, 50))
        }

        const doc = await rag.importDocument(fileName, text, undefined, targetCollectionId)
        imported.push(doc)
      } catch (e: any) {
        errors.push(`${basename(filePath)}: ${e.message}`)
      }
    }

    return { success: true, data: { imported, errors } }
  })

  ipcMain.handle('rag:documents', async (_event, collectionId?: string) => {
    try {
      return { success: true, data: rag.getDocuments(collectionId) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rag:delete', async (_event, docId: string) => {
    try {
      const ok = rag.deleteDocument(docId)
      return { success: ok }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rag:stats', async (_event, collectionId?: string) => {
    try {
      return { success: true, data: rag.getStats(collectionId) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('rag:learningGraph', async (_event, collectionId?: string) => {
    try {
      return { success: true, data: buildLearningGraph(collectionId) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ===== Tasks 任务管理 =====

  ipcMain.handle('task:getAll', async () => {
    try {
      return { success: true, data: taskStore.getTasks() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('task:add', async (_event, tasks: any[]) => {
    try {
      return { success: true, data: taskStore.addTasks(tasks) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('task:update', async (_event, id: string, fields: Record<string, any>) => {
    try {
      return { success: true, data: taskStore.updateTask(id, fields) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('task:delete', async (_event, id: string) => {
    try {
      return { success: true, data: taskStore.deleteTask(id) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('task:toggle', async (_event, id: string) => {
    try {
      return { success: true, data: taskStore.toggleTask(id) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

// 限制 V8 堆内存上限，防止 OOM 导致整个系统卡死
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.xuemate')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerLLMHandlers()
  createWindow()

  // 截止日期提醒：每 10 分钟检查一次
  function checkDeadlines() {
    try {
      const tasks = taskStore.getTasksForReminder()
      const now = Date.now()
      for (const task of tasks) {
        const diff = task.deadlineTs - now
        const hoursLeft = diff / (1000 * 60 * 60)

        // 已过期
        if (diff < 0) continue

        if (!Notification.isSupported()) continue

        // 1 小时内优先提醒，避免刚进入 1 小时窗口时只收到普通 24 小时提醒
        if (hoursLeft <= 1 && !task.reminded1h) {
          new Notification({
            title: '紧急！作业即将截止',
            body: `"${task.title}" 将在 ${Math.max(1, Math.ceil(hoursLeft * 60))} 分钟后截止`
          }).show()
          taskStore.markReminded(task.id, true, true)
        }
        // 24 小时内提醒
        else if (hoursLeft <= 24 && !task.reminded24h) {
          new Notification({
            title: '作业截止提醒',
            body: `"${task.title}" 将在 ${Math.ceil(hoursLeft)} 小时后截止`
          }).show()
          taskStore.markReminded(task.id, true, task.reminded1h)
        }
      }
    } catch (e) {
      console.error('[Reminder] 检查截止日期失败:', e)
    }
  }

  // 启动后 30 秒检查一次，之后每 10 分钟检查
  setTimeout(checkDeadlines, 30000)
  setInterval(checkDeadlines, 10 * 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  destroyWebView()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
