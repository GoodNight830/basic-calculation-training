/** 错题本数据访问（§12） */

import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { WrongQuestion, WrongQuestionStatus } from '@/types'

export interface WrongQuestionQuery {
  module?: string
  status?: WrongQuestionStatus
  rangeMin?: number
  rangeMax?: number
}

export async function getWrongQuestion(id: string): Promise<WrongQuestion | null> {
  return (await db.wrongQuestions.get(id)) ?? null
}

export async function getWrongQuestionByKey(questionKey: string): Promise<WrongQuestion | null> {
  return (await db.wrongQuestions.where('questionKey').equals(questionKey).first()) ?? null
}

export async function putWrongQuestion(question: WrongQuestion): Promise<void> {
  await db.wrongQuestions.put(toPlain(question))
}

export async function bulkPutWrongQuestions(questions: readonly WrongQuestion[]): Promise<void> {
  if (questions.length === 0) return
  await db.wrongQuestions.bulkPut(toPlain([...questions]))
}

/** 错题列表，默认按最近错误时间倒序 */
export async function listWrongQuestions(query: WrongQuestionQuery = {}): Promise<WrongQuestion[]> {
  const all = await db.wrongQuestions.toArray()
  return all
    .filter((q) => (query.module ? q.module === query.module : true))
    .filter((q) => (query.status ? q.status === query.status : true))
    .filter((q) => (query.rangeMin !== undefined ? q.divisor >= query.rangeMin : true))
    .filter((q) => (query.rangeMax !== undefined ? q.divisor <= query.rangeMax : true))
    .sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt))
}

export async function markWrongQuestionMastered(
  id: string,
  mastered: boolean
): Promise<WrongQuestion | null> {
  const existing = await getWrongQuestion(id)
  if (!existing) return null
  const updated: WrongQuestion = {
    ...existing,
    status: mastered ? 'mastered' : 'active',
    masteredAt: mastered ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString()
  }
  await db.wrongQuestions.put(toPlain(updated))
  return updated
}

export async function bulkMarkMastered(ids: readonly string[], mastered: boolean): Promise<number> {
  const now = new Date().toISOString()
  const list = await db.wrongQuestions.bulkGet([...ids])
  const updates = list.filter((q): q is WrongQuestion => Boolean(q)).map<WrongQuestion>((q) => ({
    ...q,
    status: mastered ? 'mastered' : 'active',
    masteredAt: mastered ? now : null,
    updatedAt: now
  }))
  if (updates.length > 0) await db.wrongQuestions.bulkPut(toPlain(updates))
  return updates.length
}

export async function deleteWrongQuestion(id: string): Promise<void> {
  await db.wrongQuestions.delete(id)
}

export async function clearWrongQuestions(): Promise<void> {
  await db.wrongQuestions.clear()
}

export async function countWrongQuestions(status?: WrongQuestionStatus): Promise<number> {
  if (!status) return db.wrongQuestions.count()
  return db.wrongQuestions.where('status').equals(status).count()
}

/** 按除数范围统计错题（§13：训练某个范围错题） */
export function groupWrongQuestionsByRange(
  questions: readonly WrongQuestion[],
  rangeSize: number
): Array<{ rangeMin: number; rangeMax: number; count: number }> {
  const buckets = new Map<number, number>()
  for (const q of questions) {
    const min = Math.floor(q.divisor / rangeSize) * rangeSize
    buckets.set(min, (buckets.get(min) ?? 0) + 1)
  }
  return [...buckets.entries()]
    .map(([rangeMin, count]) => ({ rangeMin, rangeMax: rangeMin + rangeSize - 1, count }))
    .sort((a, b) => a.rangeMin - b.rangeMin)
}
