import 'dotenv/config'
import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, readdirSync, statSync, renameSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { parseTask, tutorCode, organizeFiles, generateReview, judgeCode, generateProblems, checkFormat, chat } from './services/llm'
import { runAgent } from './services/agent'
import { SANDBOX_DIR } from './services/sandbox'
import { destroyWebView, setHostWindow, showBrowserAtHeight, hideBrowser } from './services/web'
import { PDFParse } from 'pdf-parse'
import * as chatStore from './services/chatStore'
import { getMemory, saveMemory, buildSystemPrompt, extractMemory } from './services/memory'

let agentRunning = false
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

  // 资料整理
  ipcMain.handle('llm:organizeFiles', async (_event, fileNames: string[]) => {
    try {
      const result = await organizeFiles(fileNames)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 刷题判题
  ipcMain.handle('llm:judgeCode', async (_event, problem: string, code: string, language: string) => {
    console.log('[Main] llm:judgeCode called')
    try {
      const result = await judgeCode(problem, code, language)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

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
      const buffer = readFileSync(filePath)
      const parser = new PDFParse({ data: buffer })
      const pdfData = await parser.getText()
      const fileName = filePath.split('/').pop() || filePath
      const text = pdfData.text || ''
      const formatResult = await checkFormat(text, fileName)
      return {
        success: true,
        data: JSON.stringify({
          fileName,
          pageCount: pdfData.pages ? pdfData.pages.length : 1,
          textLength: text.length,
          preview: text.slice(0, 500),
          formatCheck: JSON.parse(formatResult)
        })
      }
    } catch (error: any) {
      console.error('[Main] checkPDF error:', error.message)
      return { success: false, error: error.message }
    }
  })

  // 扫描目录文件
  ipcMain.handle('file:scanDir', async (_event, dirPath?: string) => {
    console.log('[Main] file:scanDir called:', dirPath)
    try {
      const dir = dirPath || SANDBOX_DIR
      const entries = readdirSync(dir)
      const files = entries
        .filter(name => !name.startsWith('.'))
        .map(name => {
          const fullPath = join(dir, name)
          const stat = statSync(fullPath)
          return {
            name,
            path: fullPath,
            isDir: stat.isDirectory(),
            size: stat.size,
            ext: name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
          }
        })
        .filter(f => !f.isDir) // 只返回文件，不包括目录
      return { success: true, data: files }
    } catch (error: any) {
      console.error('[Main] scanDir error:', error.message)
      return { success: false, error: error.message }
    }
  })

  // LLM 分类文件
  ipcMain.handle('file:organize', async (_event, fileNames: string[]) => {
    console.log('[Main] file:organize called, files:', fileNames.length)
    try {
      const result = await organizeFiles(fileNames)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 批量重命名文件
  ipcMain.handle('file:renameBatch', async (_event, operations: { from: string; to: string }[]) => {
    console.log('[Main] file:renameBatch called, ops:', operations.length)
    try {
      const results: { from: string; to: string; success: boolean; error?: string }[] = []
      for (const op of operations) {
        try {
          renameSync(op.from, op.to)
          results.push({ from: op.from, to: op.to, success: true })
        } catch (e: any) {
          results.push({ from: op.from, to: op.to, success: false, error: e.message })
        }
      }
      return { success: true, data: results }
    } catch (error: any) {
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
    hideBrowser() // 任务结束隐藏浏览器
    return { success: result.success, error: result.error }
  })

  // 智能助手 - 停止
  ipcMain.handle('agent:stop', async () => {
    agentRunning = false
    if (confirmResolve) {
      confirmResolve(false)
      confirmResolve = null
    }
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

  ipcMain.handle('chat:sendMessage', async (_event, convId: string, content: string) => {
    console.log('[Main] chat:sendMessage called, convId:', convId)
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
        ? conv.messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
        : [{ role: 'user' as const, content }]

      // 4. 调用 LLM
      const reply = await chat({
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages
        ],
        temperature: 0.7,
        maxTokens: 2048
      })

      // 5. 保存 AI 回复
      const assistantMsg: chatStore.ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now()
      }
      chatStore.addMessage(convId, assistantMsg)

      // 6. 后台异步提取记忆（fire-and-forget）
      extractMemory(recentMessages, memory).then(updated => {
        saveMemory(updated)
      }).catch(e => console.error('[Memory] 后台提取失败:', e))

      return { success: true, data: reply }
    } catch (error: any) {
      console.error('[Main] chat:sendMessage error:', error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('chat:getMemory', async () => {
    try {
      const memory = getMemory()
      return { success: true, data: memory }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.xuemate')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerLLMHandlers()
  createWindow()

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
