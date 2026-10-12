/**
 * IndexedDB 数据库定义（§18 / §22.3 / §34 database）。
 *
 * 表结构（§18 核心表）：
 * - sessions        → training_sessions
 * - questions       → questions + answers 合并（每道题的原始数据与答案同表保存，
 *                     符合 §18 “可以根据实际实现合并部分表，但必须保证题目级原始数据完整”）
 * - wrongQuestions  → wrong_questions
 * - weakPatterns    → weak_patterns
 * - settings        → settings
 * - activeSessions  → §9 的 activeSession（未完成训练，支持中断恢复）
 *
 * 约定：Vue 页面不得直接操作本文件导出的 db（§34 / §48.7），必须通过 repositories / services。
 */

import Dexie, { type Table } from 'dexie'
import { DB_NAME } from '@/config/trainingConfig'
import type {
  ActiveSession,
  QuestionRecord,
  SettingRow,
  TrainingSession,
  WeakPattern,
  WrongQuestion,
  AiAnalysisSnapshot
} from '@/types'

export class TrainingDatabase extends Dexie {
  sessions!: Table<TrainingSession, string>
  questions!: Table<QuestionRecord, string>
  wrongQuestions!: Table<WrongQuestion, string>
  weakPatterns!: Table<WeakPattern, string>
  settings!: Table<SettingRow, string>
  activeSessions!: Table<ActiveSession, string>
  aiAnalysisSnapshots!: Table<AiAnalysisSnapshot, string>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      sessions: 'id, module, mode, status, startedAt, createdAt',
      questions: 'id, sessionId, module, mode, correct, divisor, createdAt, submittedAt',
      wrongQuestions: 'id, &questionKey, module, status, divisor, createdAt, lastWrongAt',
      weakPatterns: 'id, module, dimension, status, updatedAt',
      settings: 'key, updatedAt',
      activeSessions: 'id, module, mode, updatedAt'
    })
    this.version(2).stores({
      sessions: 'id, module, mode, status, startedAt, createdAt',
      questions: 'id, sessionId, module, mode, correct, divisor, createdAt, submittedAt',
      wrongQuestions: 'id, &questionKey, module, status, divisor, createdAt, lastWrongAt',
      weakPatterns: 'id, module, dimension, status, updatedAt',
      settings: 'key, updatedAt',
      activeSessions: 'id, module, mode, updatedAt',
      aiAnalysisSnapshots: 'id, module, createdAt, dataHash'
    })
  }
}

/** 应用默认数据库实例 */
export const db = new TrainingDatabase()

/** 测试或隔离场景下创建独立数据库 */
export function createDatabase(name: string): TrainingDatabase {
  return new TrainingDatabase(name)
}
