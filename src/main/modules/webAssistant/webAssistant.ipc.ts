import type { BrowserWindow, IpcMain } from 'electron'
import { randomUUID } from 'crypto'
import { BrowserWindow as ElectronBrowserWindow } from 'electron'
import { getErrorMessage } from '../../shared/errors'
import { runWebAssistant } from './webAssistant.runner'
import {
  setLiveBrowserBounds,
  stopActiveBrowserLoading,
  type LiveBrowserBounds
} from './webAssistant.browser'
import type { WebAssistantUpdate } from './webAssistant.domain'

interface ActiveWebAssistantRun {
  id: string
  win: BrowserWindow | null
  stopRequested: boolean
  seq: number
}

let activeRun: ActiveWebAssistantRun | null = null

function createRunId(): string {
  return `warun_${Date.now()}_${randomUUID()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLiveBrowserBounds(value: unknown): LiveBrowserBounds | null {
  if (!isRecord(value)) return null
  const x = Number(value.x)
  const y = Number(value.y)
  const width = Number(value.width)
  const height = Number(value.height)
  if (![x, y, width, height].every(Number.isFinite)) return null
  return { x, y, width, height }
}

function sendRunUpdate(runId: string, data: WebAssistantUpdate): void {
  const run = activeRun
  if (!run || run.id !== runId) return
  run.seq += 1
  if (!run.win || run.win.isDestroyed()) return
  try {
    run.win.webContents.send('webAssistant:update', {
      ...data,
      runId,
      seq: run.seq
    })
  } catch (error) {
    console.warn('[WebAssistant] update 发送失败:', getErrorMessage(error))
  }
}

export function registerWebAssistantIpc(ipcMain: IpcMain): void {
  ipcMain.handle('webAssistant:start', async (event, goal: string) => {
    if (activeRun) {
      return {
        success: false,
        error: activeRun.stopRequested
          ? '网页小助手正在停止，请等它完全结束后再开始'
          : '网页小助手正在执行',
        runId: activeRun.id
      }
    }

    const runId = createRunId()
    activeRun = {
      id: runId,
      win: ElectronBrowserWindow.fromWebContents(event.sender),
      stopRequested: false,
      seq: 0
    }

    try {
      const result = await runWebAssistant(
        goal,
        (data) => sendRunUpdate(runId, data),
        () => !activeRun || activeRun.id !== runId || activeRun.stopRequested
      )
      return { ...result, runId }
    } finally {
      if (activeRun?.id === runId) {
        activeRun = null
      }
    }
  })

  ipcMain.handle('webAssistant:stop', async (_event, runId?: string) => {
    if (!activeRun) return { success: true }
    if (runId && activeRun.id !== runId) {
      return { success: true, ignored: true }
    }

    activeRun.stopRequested = true
    stopActiveBrowserLoading()
    activeRun.seq += 1
    if (activeRun.win && !activeRun.win.isDestroyed()) {
      activeRun.win.webContents.send('webAssistant:update', {
        runId: activeRun.id,
        seq: activeRun.seq,
        state: 'cancelling',
        terminal: false,
        error: ''
      })
    }
    return { success: true }
  })

  ipcMain.handle('webAssistant:setLiveBounds', async (_event, bounds: unknown) => {
    setLiveBrowserBounds(normalizeLiveBrowserBounds(bounds))
    return { success: true }
  })
}
