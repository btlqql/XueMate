import 'dotenv/config'
import './services/app/consolePipeGuard'
import { app, shell, BrowserWindow, ipcMain, dialog, Notification } from 'electron'
import { randomUUID } from 'crypto'
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
} from './services/ai/llm'
import { runAgent } from './services/agent/agent'
import { quickSearch } from './services/quickSearch/quickSearch'
import {
  destroyWebView,
  setHostWindow,
  showBrowserAtHeight,
  hideBrowser
} from './services/browser/webRuntime'
import * as chatStore from './services/chat/chatStore'
import {
  getMemory,
  saveMemory,
  buildSystemPrompt,
  extractMemory,
  compressMemoryIfNeeded
} from './services/memory/memory'
import * as rag from './services/rag/rag'
import { buildLearningGraph } from './services/rag/learningGraph'
import { startRendererBridge, stopRendererBridge } from './services/bridge/rendererBridge'
import { startPeerEdgeRuntime, stopPeerEdgeRuntime } from './services/peerEdge/peerEdgeRuntime'
import { buildPeerEdgeContext, retrievePeerEvidence } from './services/peerEdge/peerEdge'
import { registerLearningSignalIpc } from './modules/learningSignals/learningSignal.ipc'
import { registerWebAssistantIpc } from './modules/webAssistant/webAssistant.ipc'
import { extractAndSaveLearningSignals } from './modules/learningSignals/learningSignalExtractor.agent'
import * as taskStore from './services/task/taskStore'
import * as quickSearchStore from './services/quickSearch/quickSearchStore'
import { ensureEnoughText, extractTextFromFile } from './services/document/document'
import type { NewTask, TaskEditableFields } from './domain/task'
import type { QuickSearchFilters } from './domain/quickSearch'

// 启动时自动迁移旧数据
let agentRunning = false
let confirmResolve: ((approved: boolean) => void) | null = null

type ChatStreamEventType = 'token' | 'done' | 'error'

interface ChatStreamEvent<T = unknown> {
  requestId: string
  convId: string
  source: 'chat'
  type: ChatStreamEventType
  payload: T
  ts: number
}

function createChatRequestId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function createQuickSearchRunId(): string {
  return `qsrun_${Date.now()}_${randomUUID()}`
}

function sendChatStreamEvent<T>(
  win: BrowserWindow | null,
  event: Omit<ChatStreamEvent<T>, 'source' | 'ts'>
): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send('chat:stream-event', {
    ...event,
    source: 'chat',
    ts: Date.now()
  } satisfies ChatStreamEvent<T>)
}

function getErrorMessage(error: unknown, fallback = '未知错误'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function getPeerEdgeChatDecision(args: {
  collectionId: string
  localCount: number
  localTopScore: number
}): { enabled: boolean; reason: string } {
  const flag = (process.env.XUEMATE_PEEREDGE_CHAT || 'auto').trim().toLowerCase()
  if (['0', 'false', 'off', 'no'].includes(flag)) {
    return { enabled: false, reason: 'disabled by XUEMATE_PEEREDGE_CHAT' }
  }
  if (['1', 'true', 'on', 'yes', 'always', 'force'].includes(flag)) {
    return { enabled: true, reason: `forced by XUEMATE_PEEREDGE_CHAT=${flag}` }
  }
  if (args.collectionId === rag.RAG_OFF_ID) {
    return { enabled: false, reason: 'RAG is off for this chat' }
  }
  // 本机资料命中很强时不打扰 PeerEdge，避免增加延迟；其余情况让班级边缘资料补充。
  if (args.localCount >= 3 && args.localTopScore >= 0.42) {
    return {
      enabled: false,
      reason: `local RAG is strong: count=${args.localCount}, topScore=${args.localTopScore.toFixed(3)}`
    }
  }
  return {
    enabled: true,
    reason: `local RAG weak enough: count=${args.localCount}, topScore=${args.localTopScore.toFixed(3)}`
  }
}

function peerEdgeChatTimeoutMs(): number {
  const parsed = Number(process.env.XUEMATE_PEEREDGE_CHAT_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) return 900
  return Math.max(250, Math.min(parsed, 3000))
}

function peerEdgeChatFanout(): number {
  const parsed = Number(process.env.XUEMATE_PEEREDGE_CHAT_FANOUT)
  if (!Number.isFinite(parsed)) return 4
  return Math.max(1, Math.min(parsed, 8))
}

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
    } catch (error) {
      console.error('[Main] parseTask error:', getErrorMessage(error))
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 学习辅导
  ipcMain.handle('llm:tutorCode', async (_event, code: string, type: 'code' | 'report') => {
    try {
      const result = await tutorCode(code, type)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
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
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  // 生成练习题
  ipcMain.handle('llm:generateProblems', async (_event, topic: string, count: number) => {
    console.log('[Main] llm:generateProblems called')
    try {
      const result = await generateProblems(topic, count)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
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
    } catch (error) {
      console.error('[Main] checkPDF error:', getErrorMessage(error))
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // 复习总结
  ipcMain.handle('llm:generateReview', async (_event, courseName: string) => {
    try {
      const result = await generateReview(courseName)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
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

  ipcMain.handle('quickSearch:run', async (event, query: string) => {
    const runId = createQuickSearchRunId()
    try {
      const data = await quickSearch(query)
      const foregroundRecord = quickSearchStore.saveResult({
        runId,
        query: data.query,
        kind: 'foreground',
        result: data
      })
      return { success: true, data, runId, recordId: foregroundRecord.id }
    } catch (error) {
      return { success: false, error: getErrorMessage(error), runId }
    }
  })

  ipcMain.handle('quickSearch:history', async (_event, filters?: QuickSearchFilters) => {
    try {
      return { success: true, data: quickSearchStore.list(filters || { limit: 5 }) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('quickSearch:get', async (_event, id: string) => {
    try {
      return { success: true, data: quickSearchStore.get(id) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('quickSearch:delete', async (_event, id: string) => {
    try {
      return { success: true, data: quickSearchStore.deleteRecord(id) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // ===== Chat 对话系统 =====

  ipcMain.handle('chat:getConversations', async () => {
    try {
      const conversations = chatStore.getConversations()
      return { success: true, data: conversations }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('chat:getConversation', async (_event, id: string) => {
    try {
      const conv = chatStore.getConversation(id)
      return { success: true, data: conv }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('chat:createConversation', async () => {
    try {
      const id = chatStore.createConversation()
      return { success: true, data: id }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('chat:deleteConversation', async (_event, id: string) => {
    try {
      const ok = chatStore.deleteConversation(id)
      return { success: ok }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(
    'chat:sendMessage',
    async (
      event,
      convId: string,
      content: string,
      options?: { collectionId?: string; requestId?: string }
    ) => {
      console.log('[Main] chat:sendMessage called, convId:', convId, 'model:', MODEL)
      const win = BrowserWindow.fromWebContents(event.sender)
      const requestId = options?.requestId || createChatRequestId()

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

        // 4. RAG 检索（如果有知识库）+ PeerEdge 边缘补充（后台隐藏）
        let ragContext = ''
        let peerEdgeContext = ''
        let localRagCount = 0
        let localRagTopScore = 0
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
            localRagCount = results.length
            localRagTopScore = results[0]?.score || 0
            if (results.length > 0 && results[0].score > 0.24) {
              ragContext = rag.buildRagContext(results, {
                title: '以下是用户课程资料中的相关内容'
              })
            }
          } catch (e) {
            console.error('[RAG] 检索失败:', e)
          }
        }

        const peerEdgeDecision = getPeerEdgeChatDecision({
          collectionId: ragCollectionId,
          localCount: localRagCount,
          localTopScore: localRagTopScore
        })
        console.log(
          `[PeerEdge] chat decision: ${peerEdgeDecision.enabled ? 'use' : 'skip'} (${peerEdgeDecision.reason})`
        )

        if (peerEdgeDecision.enabled) {
          try {
            const peerResult = await retrievePeerEvidence(content, {
              topK: 4,
              collectionId:
                ragCollectionId === rag.RAG_OFF_ID ? rag.ALL_COLLECTIONS_ID : ragCollectionId,
              timeoutMs: peerEdgeChatTimeoutMs(),
              peerLimit: peerEdgeChatFanout()
            })
            if (peerResult.count > 0) {
              peerEdgeContext = buildPeerEdgeContext(peerResult.evidence, {
                maxChars: 2200,
                title: '以下是班级边缘网络补充检索到的相关内容'
              })
              console.log(
                `[PeerEdge] chat context injected, evidence=${peerResult.count}, elapsed=${peerResult.elapsedMs}ms`
              )
            } else if (peerResult.running && peerResult.errors.length > 0) {
              console.log(
                `[PeerEdge] chat context empty, errors=${peerResult.errors
                  .slice(0, 2)
                  .map((item) => item.error)
                  .join('; ')}`
              )
            }
          } catch (e) {
            console.error('[PeerEdge] 聊天补充检索失败:', getErrorMessage(e))
          }
        }

        // 5. 流式调用 LLM（立即返回，token 通过 IPC 推送）
        chatStream({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt + ragContext + peerEdgeContext },
            ...recentMessages
          ],
          temperature: 0.7,
          maxTokens: 4096,
          onToken(token) {
            sendChatStreamEvent(win, {
              requestId,
              convId,
              type: 'token',
              payload: token
            })
          },
          onDone(fullContent) {
            // 保存 AI 回复
            const assistantMsg: chatStore.ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: fullContent,
              timestamp: Date.now()
            }
            try {
              if (chatStore.getConversation(convId)) {
                chatStore.addMessage(convId, assistantMsg)
              }
            } catch (e) {
              console.error('[Chat] 保存流式回复失败:', e)
            }
            sendChatStreamEvent(win, {
              requestId,
              convId,
              type: 'done',
              payload: fullContent
            })
            // 后台异步提取记忆 → 压缩归档（fire-and-forget）
            extractMemory(recentMessages, memory)
              .then((updated) => {
                saveMemory(updated)
                return compressMemoryIfNeeded(updated)
              })
              .catch((e) => console.error('[Memory] 后台处理失败:', e))
            extractAndSaveLearningSignals(convId, [
              ...recentMessages,
              { role: 'assistant', content: fullContent }
            ]).catch((e) => console.error('[LearningSignals] 后台抽取失败:', e))
          },
          onError(error) {
            sendChatStreamEvent(win, {
              requestId,
              convId,
              type: 'error',
              payload: error
            })
          }
        }).catch((error: unknown) => {
          sendChatStreamEvent(win, {
            requestId,
            convId,
            type: 'error',
            payload: getErrorMessage(error)
          })
        })

        // 立即返回，不等待 LLM 完成
        return { success: true, streaming: true, requestId }
      } catch (error) {
        console.error('[Main] chat:sendMessage error:', getErrorMessage(error))
        sendChatStreamEvent(win, {
          requestId,
          convId,
          type: 'error',
          payload: getErrorMessage(error, '发送消息失败')
        })
        return { success: false, error: getErrorMessage(error), requestId }
      }
    }
  )

  ipcMain.handle('chat:getMemory', async () => {
    try {
      const memory = getMemory()
      return { success: true, data: memory }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // ===== RAG 知识库 =====

  ipcMain.handle('rag:collections', async () => {
    try {
      return { success: true, data: rag.getCollections() }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('rag:createCollection', async (_event, name: string, description = '') => {
    try {
      return { success: true, data: rag.createCollection(name, description) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
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
    } catch (error) {
      console.error('[Main] rag:importFile error:', getErrorMessage(error))
      return { success: false, error: getErrorMessage(error) }
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
      } catch (e) {
        errors.push(`${basename(filePath)}: ${getErrorMessage(e)}`)
      }
    }

    return { success: true, data: { imported, errors } }
  })

  ipcMain.handle('rag:documents', async (_event, collectionId?: string) => {
    try {
      return { success: true, data: rag.getDocuments(collectionId) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('rag:delete', async (_event, docId: string) => {
    try {
      const ok = rag.deleteDocument(docId)
      return { success: ok }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('rag:stats', async (_event, collectionId?: string) => {
    try {
      return { success: true, data: rag.getStats(collectionId) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('rag:learningGraph', async (_event, collectionId?: string) => {
    try {
      return { success: true, data: buildLearningGraph(collectionId) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  // ===== Tasks 任务管理 =====

  ipcMain.handle('task:getAll', async () => {
    try {
      return { success: true, data: taskStore.getTasks() }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('task:add', async (_event, tasks: NewTask[]) => {
    try {
      return { success: true, data: taskStore.addTasks(tasks) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('task:update', async (_event, id: string, fields: Partial<TaskEditableFields>) => {
    try {
      return { success: true, data: taskStore.updateTask(id, fields) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('task:delete', async (_event, id: string) => {
    try {
      return { success: true, data: taskStore.deleteTask(id) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle('task:toggle', async (_event, id: string) => {
    try {
      return { success: true, data: taskStore.toggleTask(id) }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
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
  registerLearningSignalIpc(ipcMain)
  registerWebAssistantIpc(ipcMain)
  startRendererBridge(Number(process.env.XUEMATE_RENDERER_BRIDGE_PORT || 8788))
  const peerEdgeStatus = startPeerEdgeRuntime()
  if (peerEdgeStatus.running) {
    console.log(
      `[PeerEdge] hidden runtime ready on ${peerEdgeStatus.bind}:${peerEdgeStatus.port}, group=${peerEdgeStatus.group}`
    )
  } else {
    console.log(`[PeerEdge] hidden runtime inactive: ${peerEdgeStatus.reason}`)
  }
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

app.on('before-quit', () => {
  stopPeerEdgeRuntime()
})

app.on('window-all-closed', () => {
  destroyWebView()
  stopPeerEdgeRuntime()
  stopRendererBridge()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
