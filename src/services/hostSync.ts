import { reactive, readonly } from 'vue'
import { db } from '@/db/database'
import { validateExportPayload } from './exportSchema'
import { SCHEMA_VERSION } from '@/config/trainingConfig'
import type { ActiveSession, AiAnalysisSnapshot, QuestionRecord, TrainingSession, WeakPattern, WrongQuestion } from '@/types'

export interface HostData {
  sessions: TrainingSession[]
  questions: QuestionRecord[]
  wrongQuestions: WrongQuestion[]
  weakPatterns: WeakPattern[]
  activeSessions: ActiveSession[]
  aiAnalysisSnapshots: AiAnalysisSnapshot[]
}

interface HostSnapshot { revision: number; updatedAt: string; data: HostData }
interface HostResponse { snapshot: HostSnapshot | null; error?: string }

export type HostSyncState = 'starting' | 'synced' | 'syncing' | 'pending' | 'error'
const mutableStatus = reactive({ state: 'starting' as HostSyncState, message: '正在读取主机数据', lastSyncedAt: '' })
export const hostSyncStatus = readonly(mutableStatus)

let revision = 0
let running: Promise<void> | null = null
let queued = false
let retryTimer: number | undefined
let initialized = false
const PENDING_KEY = 'xc-host-sync-pending'
const REPLACE_KEY = 'xc-host-sync-replace'

function validateHostData(raw: unknown): HostData {
  if (!raw || typeof raw !== 'object') throw new Error('主机训练数据格式无效')
  const value = raw as Partial<HostData>
  const core = validateExportPayload({
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'basic-calculation-training',
    data: { ...value, settings: [] }
  }).data
  const ai = Array.isArray(value.aiAnalysisSnapshots)
    ? value.aiAnalysisSnapshots.filter((item): item is AiAnalysisSnapshot => Boolean(
        item && typeof item === 'object' && typeof item.id === 'string' && typeof item.module === 'string' &&
        typeof item.createdAt === 'string' && item.report && typeof item.report === 'object'
      ))
    : []
  return { ...core, aiAnalysisSnapshots: ai }
}

async function collectHostData(): Promise<HostData> {
  const [sessions, questions, wrongQuestions, weakPatterns, activeSessions, aiAnalysisSnapshots] = await Promise.all([
    db.sessions.toArray(), db.questions.toArray(), db.wrongQuestions.toArray(), db.weakPatterns.toArray(),
    db.activeSessions.toArray(), db.aiAnalysisSnapshots.toArray()
  ])
  return { sessions, questions, wrongQuestions, weakPatterns, activeSessions, aiAnalysisSnapshots }
}

async function replaceLocalData(data: HostData): Promise<void> {
  await db.transaction('rw', [db.sessions, db.questions, db.wrongQuestions, db.weakPatterns, db.activeSessions, db.aiAnalysisSnapshots], async () => {
    await Promise.all([
      db.sessions.clear(), db.questions.clear(), db.wrongQuestions.clear(), db.weakPatterns.clear(),
      db.activeSessions.clear(), db.aiAnalysisSnapshots.clear()
    ])
    await Promise.all([
      data.sessions.length ? db.sessions.bulkPut(data.sessions) : Promise.resolve(),
      data.questions.length ? db.questions.bulkPut(data.questions) : Promise.resolve(),
      data.wrongQuestions.length ? db.wrongQuestions.bulkPut(data.wrongQuestions) : Promise.resolve(),
      data.weakPatterns.length ? db.weakPatterns.bulkPut(data.weakPatterns) : Promise.resolve(),
      data.activeSessions.length ? db.activeSessions.bulkPut(data.activeSessions) : Promise.resolve(),
      data.aiAnalysisSnapshots.length ? db.aiAnalysisSnapshots.bulkPut(data.aiAnalysisSnapshots) : Promise.resolve()
    ])
  })
}

function mergeById<T extends { id: string }>(remote: T[], local: T[]): T[] {
  return [...new Map([...remote, ...local].map((item) => [item.id, item])).values()]
}

function mergeData(remote: HostData, local: HostData): HostData {
  const sessions = mergeById(remote.sessions, local.sessions)
  const ended = new Set(sessions.filter((item) => item.status !== 'active').map((item) => item.id))
  return {
    sessions,
    questions: mergeById(remote.questions, local.questions),
    wrongQuestions: [...new Map([...remote.wrongQuestions, ...local.wrongQuestions].map((item) => [item.questionKey, item])).values()],
    weakPatterns: mergeById(remote.weakPatterns, local.weakPatterns),
    activeSessions: mergeById(remote.activeSessions, local.activeSessions).filter((item) => !ended.has(item.sessionId)),
    aiAnalysisSnapshots: mergeById(remote.aiAnalysisSnapshots, local.aiAnalysisSnapshots)
  }
}

function hasTrainingData(data: HostData): boolean {
  return data.sessions.length > 0 || data.questions.length > 0 || data.wrongQuestions.length > 0 ||
    data.weakPatterns.length > 0 || data.activeSessions.length > 0 || data.aiAnalysisSnapshots.length > 0
}

async function requestHost(method: 'GET' | 'PUT', body?: unknown): Promise<HostResponse> {
  const response = await fetch('/api/host-data', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  })
  const result = await response.json() as HostResponse
  if (!response.ok && response.status !== 409) throw new Error(result.error || `主机同步失败（${response.status}）`)
  return result
}

async function upload(local: HostData, attempt = 0): Promise<void> {
  const response = await fetch('/api/host-data', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRevision: revision, data: local })
  })
  const result = await response.json() as HostResponse
  if (response.status === 409 && result.snapshot && attempt < 2) {
    revision = result.snapshot.revision
    return upload(mergeData(validateHostData(result.snapshot.data), local), attempt + 1)
  }
  if (!response.ok || !result.snapshot) throw new Error(result.error || `主机同步失败（${response.status}）`)
  revision = result.snapshot.revision
  mutableStatus.lastSyncedAt = result.snapshot.updatedAt
}

export async function initializeHostSync(): Promise<void> {
  if (new URLSearchParams(window.location.search).get('hostSync') === 'off') {
    initialized = false
    mutableStatus.state = 'synced'
    mutableStatus.message = '测试模式不连接主机数据'
    return
  }
  try {
    const response = await requestHost('GET')
    if (response.snapshot) {
      revision = response.snapshot.revision
      const remote = validateHostData(response.snapshot.data)
      const local = await collectHostData()
      const firstEmptyHostNeedsMigration = revision === 1 && !hasTrainingData(remote) && hasTrainingData(local)
      if (localStorage.getItem(PENDING_KEY) === '1' || firstEmptyHostNeedsMigration) {
        await upload(localStorage.getItem(REPLACE_KEY) === '1' ? local : mergeData(remote, local))
      } else {
        await replaceLocalData(remote)
      }
      mutableStatus.lastSyncedAt = response.snapshot.updatedAt
    } else {
      await upload(await collectHostData())
    }
    localStorage.removeItem(PENDING_KEY)
    localStorage.removeItem(REPLACE_KEY)
    mutableStatus.state = 'synced'
    mutableStatus.message = '数据已保存到主机'
  } catch (error) {
    mutableStatus.state = 'error'
    mutableStatus.message = `暂时无法连接主机，数据将保存在本机并稍后重试：${error instanceof Error ? error.message : String(error)}`
  }
  initialized = true
  window.addEventListener('online', () => scheduleHostSync())
  window.addEventListener('focus', () => { if (mutableStatus.state !== 'synced') scheduleHostSync() })
}

export function scheduleHostSync(replace = false): void {
  queued = true
  localStorage.setItem(PENDING_KEY, '1')
  if (replace) localStorage.setItem(REPLACE_KEY, '1')
  mutableStatus.state = 'pending'
  mutableStatus.message = '数据等待保存到主机'
  if (!initialized) return
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(() => { void flushHostSync() }, 120)
}

export async function flushHostSync(): Promise<void> {
  if (running) return running
  running = (async () => {
    while (queued) {
      queued = false
      mutableStatus.state = 'syncing'
      mutableStatus.message = '正在保存到主机'
      try {
        await upload(await collectHostData())
        localStorage.removeItem(PENDING_KEY)
        localStorage.removeItem(REPLACE_KEY)
        mutableStatus.state = 'synced'
        mutableStatus.message = '数据已保存到主机'
      } catch (error) {
        queued = true
        mutableStatus.state = 'error'
        mutableStatus.message = `主机同步失败，已保留本机数据：${error instanceof Error ? error.message : String(error)}`
        window.clearTimeout(retryTimer)
        retryTimer = window.setTimeout(() => { void flushHostSync() }, 15_000)
        break
      }
    }
  })().finally(() => { running = null })
  return running
}
