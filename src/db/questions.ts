/** 题目记录数据访问（§20）：题目级原始数据，永不删除（除用户主动清空数据） */

import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { QuestionRecord } from '@/types'

export async function putQuestion(record: QuestionRecord): Promise<void> {
  await db.questions.put(toPlain(record))
}

export async function bulkPutQuestions(records: readonly QuestionRecord[]): Promise<void> {
  if (records.length === 0) return
  await db.questions.bulkPut(toPlain([...records]))
}

export async function getQuestion(id: string): Promise<QuestionRecord | null> {
  return (await db.questions.get(id)) ?? null
}

export async function listQuestionsBySession(sessionId: string): Promise<QuestionRecord[]> {
  const list = await db.questions.where('sessionId').equals(sessionId).toArray()
  return list.sort((a, b) => a.questionIndex - b.questionIndex)
}

export interface QuestionQuery {
  module?: string
  since?: string
  until?: string
}

/** 题目级原始数据查询（薄弱点分析、统计、导出使用） */
export async function listQuestions(query: QuestionQuery = {}): Promise<QuestionRecord[]> {
  const all = query.module
    ? await db.questions.where('module').equals(query.module).toArray()
    : await db.questions.toArray()

  return all
    .filter((q) => (query.since ? q.createdAt >= query.since : true))
    .filter((q) => (query.until ? q.createdAt <= query.until : true))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** 最近 N 道题目的 “被除数:除数” 键集合，用于避免连续重复出题 */
export async function recentQuestionKeys(module: string, limit = 100): Promise<Set<string>> {
  const list = await db.questions.where('module').equals(module).toArray()
  const keys = list
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((q) => `${q.dividend}:${q.divisor}`)
  return new Set(keys)
}

export async function countQuestions(module?: string): Promise<number> {
  if (!module) return db.questions.count()
  return db.questions.where('module').equals(module).count()
}

export async function deleteQuestion(id: string): Promise<void> {
  await db.questions.delete(id)
}

export async function deleteAllQuestions(): Promise<void> {
  await db.questions.clear()
}
