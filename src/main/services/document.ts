import { readFileSync, statSync } from 'fs'
import { basename } from 'path'
import { PDFParse } from 'pdf-parse'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MIN_TEXT_LENGTH = 10
const SUPPORTED_TEXT_EXTS = new Set(['txt', 'md'])

export interface ExtractedDocumentText {
  fileName: string
  ext: string
  text: string
  pageCount?: number
  textLength: number
  preview: string
}

export function checkFileSize(filePath: string, maxSize = MAX_FILE_SIZE): void {
  const stat = statSync(filePath)
  if (stat.size > maxSize) {
    throw new Error(
      `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，最大支持 ${maxSize / 1024 / 1024}MB`
    )
  }
}

export function getFileExt(fileName: string): string {
  return fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''
}

export async function extractTextFromFile(filePath: string): Promise<ExtractedDocumentText> {
  checkFileSize(filePath)

  const fileName = basename(filePath)
  const ext = getFileExt(fileName)
  let text = ''
  let pageCount: number | undefined

  if (ext === 'pdf') {
    const buffer = readFileSync(filePath)
    const parser = new PDFParse({ data: buffer })
    const pdfData = await parser.getText()
    text = pdfData.text || ''
    pageCount = pdfData.pages ? pdfData.pages.length : 1
  } else if (SUPPORTED_TEXT_EXTS.has(ext)) {
    text = readFileSync(filePath, 'utf-8')
  } else {
    throw new Error(`不支持的文件格式: .${ext || 'unknown'}`)
  }

  return {
    fileName,
    ext,
    text,
    pageCount,
    textLength: text.length,
    preview: text.slice(0, 500)
  }
}

export function ensureEnoughText(text: string, minLength = MIN_TEXT_LENGTH): void {
  if (text.trim().length < minLength) {
    throw new Error('文档内容太少')
  }
}
