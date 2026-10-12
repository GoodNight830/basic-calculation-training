/** 训练组数据访问（§19） */

import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { SessionStatus, TrainingMode, TrainingSession } from '@/types'

export interface SessionQuery {
  module?: string
  mode?: TrainingMode
  status?: SessionStatus
  since?: string
  until?: string
  limit?: number
  offset?: number
}

export async function putSession(session: TrainingSession): Promise<void> {
  await db.sessions.put(toPlain(session))
}

export async function getSession(id: string): Promise<TrainingSession | null> {
  const session = await db.sessions.get(id)
  return session ?? null
}

/** 查询训练组，默认按开始时间倒序 */
export async function listSessions(query: SessionQuery = {}): Promise<TrainingSession[]> {
  const all = await db.sessions.toArray()
  const filtered = all
    .filter((s) => (query.module ? s.module === query.module : true))
    .filter((s) => (query.mode ? s.mode === query.mode : true))
    .filter((s) => (query.status ? s.status === query.status : true))
    .filter((s) => (query.since ? s.startedAt >= query.since : true))
    .filter((s) => (query.until ? s.startedAt <= query.until : true))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  const offset = query.offset ?? 0
  const limit = query.limit ?? filtered.length
  return filtered.slice(offset, offset + limit)
}

/** 已完成（正式计入统计）的训练组 */
export async function listFinishedSessions(module?: string): Promise<TrainingSession[]> {
  return listSessions({ module, status: 'finished' })
}

export async function countSessions(module?: string): Promise<number> {
  if (!module) return db.sessions.count()
  return db.sessions.where('module').equals(module).count()
}

/** 删除某个进行中的训练组（放弃训练时清理） */
export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id)
}

export async function deleteAllSessions(): Promise<void> {
  await db.sessions.clear()
}
