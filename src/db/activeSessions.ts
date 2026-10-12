/** 活动训练数据访问（§6.9 / §9）：实时保存，支持刷新、关闭、崩溃后恢复 */

import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { ActiveSession } from '@/types'

export async function getActiveSession(module?: string): Promise<ActiveSession | null> {
  const all = await db.activeSessions.toArray()
  const scoped = module ? all.filter((s) => s.module === module) : all
  if (scoped.length === 0) return null
  return scoped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  const all = await db.activeSessions.toArray()
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function putActiveSession(session: ActiveSession): Promise<void> {
  await db.activeSessions.put(toPlain({ ...session, updatedAt: new Date().toISOString() }))
}

export async function clearActiveSession(id: string): Promise<void> {
  await db.activeSessions.delete(id)
}

export async function clearAllActiveSessions(): Promise<void> {
  await db.activeSessions.clear()
}
