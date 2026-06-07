import type { BrowserAction } from './webAssistant.browser'

export type WebAssistantState =
  | 'idle'
  | 'opening'
  | 'looking'
  | 'observing'
  | 'thinking'
  | 'acting'
  | 'settling'
  | 'cancelling'
  | 'done'
  | 'error'
  | 'stopped'
  | 'cancelled'
  | 'timed_out'
  | 'blocked'

export interface WebAssistantStep {
  id: number
  thought: string
  actionLabel: string
  status: 'running' | 'thinking' | 'done' | 'error' | 'cancelled'
}

export interface WebAssistantDomCandidate {
  id: string
  role: string
  tag: string
  label: string
  score: number
  center: { x: number; y: number }
  size: { width: number; height: number }
  flags: string[]
  href?: string
  domain?: string
}

export interface WebAssistantUpdate {
  state: WebAssistantState
  terminal?: boolean
  step: number
  maxSteps: number
  steps: WebAssistantStep[]
  screenshot?: string
  screenshotMime?: string
  url?: string
  title?: string
  thought?: string
  action?: BrowserAction
  answer?: string
  error?: string
  domElementCount?: number
  domCandidates?: WebAssistantDomCandidate[]
}

export interface WebAssistantRunResult {
  success: boolean
  answer?: string
  steps: WebAssistantStep[]
  error?: string
}
