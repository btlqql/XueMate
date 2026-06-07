import { randomUUID } from 'crypto'
import db from '../../services/infrastructure/db'
import type {
  LearningSignal,
  LearningSignalDraft,
  LearningSignalRow,
  LearningSignalStatus,
  LearningSignalUpdate
} from './learningSignal.domain'

function normalizeTitle(value: string): string {
  return value
    .replace(/[`*_#>\-[\](){}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 80)
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 60)
}

function mapRow(row: LearningSignalRow): LearningSignal {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    type: row.type,
    title: row.title,
    normalizedTitle: row.normalized_title,
    reason: row.reason || '',
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const insertStmt = db.prepare(`
  INSERT INTO learning_signals (
    id, conversation_id, type, title, normalized_title, reason, status, source, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(conversation_id, type, normalized_title) DO UPDATE SET
    title = excluded.title,
    reason = excluded.reason,
    source = excluded.source,
    updated_at = excluded.updated_at
  WHERE learning_signals.status IN ('suggested', 'confirmed')
`)

const listStmt = db.prepare(`
  SELECT * FROM learning_signals
  WHERE conversation_id = ?
  ORDER BY
    CASE status WHEN 'suggested' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
    updated_at DESC
  LIMIT ?
`)

const updateStmt = db.prepare(`
  UPDATE learning_signals
  SET status = COALESCE(?, status),
      title = COALESCE(?, title),
      normalized_title = COALESCE(?, normalized_title),
      reason = COALESCE(?, reason),
      updated_at = ?
  WHERE id = ?
`)

const getStmt = db.prepare('SELECT * FROM learning_signals WHERE id = ?')

export function listLearningSignals(conversationId: string, limit = 20): LearningSignal[] {
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit) || 20), 50))
  return (listStmt.all(conversationId, safeLimit) as LearningSignalRow[]).map(mapRow)
}

export function upsertLearningSignals(
  conversationId: string,
  drafts: LearningSignalDraft[]
): LearningSignal[] {
  const now = Date.now()
  const seen = new Set<string>()
  const insertedKeys: string[] = []

  const transaction = db.transaction(() => {
    for (const draft of drafts) {
      const title = cleanTitle(draft.title)
      const normalizedTitle = normalizeTitle(title)
      if (!title || !normalizedTitle) continue
      const key = `${draft.type}:${normalizedTitle}`
      if (seen.has(key)) continue
      seen.add(key)
      insertedKeys.push(key)
      insertStmt.run(
        randomUUID(),
        conversationId,
        draft.type,
        title,
        normalizedTitle,
        cleanTitle(draft.reason || ''),
        'suggested',
        draft.source || 'agent',
        now,
        now
      )
    }
  })

  transaction()
  if (insertedKeys.length === 0) return []
  return listLearningSignals(conversationId, 20)
}

export function addLearningSignal(
  conversationId: string,
  draft: LearningSignalDraft
): LearningSignal[] {
  return upsertLearningSignals(conversationId, [{ ...draft, source: draft.source || 'manual' }])
}

export function updateLearningSignal(
  id: string,
  fields: LearningSignalUpdate
): LearningSignal | null {
  const title = typeof fields.title === 'string' ? cleanTitle(fields.title) : null
  const normalizedTitle = title ? normalizeTitle(title) : null
  const reason = typeof fields.reason === 'string' ? cleanTitle(fields.reason) : null
  const status = normalizeStatus(fields.status)
  updateStmt.run(status, title, normalizedTitle, reason, Date.now(), id)
  const row = getStmt.get(id) as LearningSignalRow | undefined
  return row ? mapRow(row) : null
}

function normalizeStatus(value: unknown): LearningSignalStatus | null {
  return value === 'suggested' ||
    value === 'confirmed' ||
    value === 'resolved' ||
    value === 'dismissed'
    ? value
    : null
}
