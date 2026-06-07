import type { IpcMain } from 'electron'
import { getErrorMessage } from '../../shared/errors'
import {
  addLearningSignal,
  listLearningSignals,
  updateLearningSignal
} from './learningSignal.store'
import type { LearningSignalDraft, LearningSignalUpdate } from './learningSignal.domain'

export function registerLearningSignalIpc(ipcMain: IpcMain): void {
  ipcMain.handle('learningSignals:list', async (_event, conversationId: string) => {
    try {
      return { success: true, data: listLearningSignals(conversationId || '') }
    } catch (error) {
      return { success: false, error: getErrorMessage(error) }
    }
  })

  ipcMain.handle(
    'learningSignals:add',
    async (_event, conversationId: string, draft: LearningSignalDraft) => {
      try {
        return { success: true, data: addLearningSignal(conversationId || '', draft) }
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )

  ipcMain.handle(
    'learningSignals:update',
    async (_event, id: string, fields: LearningSignalUpdate) => {
      try {
        return { success: true, data: updateLearningSignal(id, fields || {}) }
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    }
  )
}
