/**
 * 数据导出 / 导入（§30 / §31 / §32）。
 *
 * 约定：
 * - 导出的 JSON 必须包含 schemaVersion / exportedAt / data（§32）；
 * - 导入前必须进行结构校验、版本校验、ID 冲突处理，非法数据拒绝（§31 / §42）；
 * - 不使用 eval，不执行任何来自文件的内容（§42）。
 */

import { ExportValidationError, validateExportPayload, type ExportPayload } from './exportSchema'
import { SCHEMA_VERSION, type AppSettings } from '@/config/trainingConfig'
import * as activeSessionsRepo from '@/db/activeSessions'
import * as questionsRepo from '@/db/questions'
import * as sessionsRepo from '@/db/sessions'
import * as settingsRepo from '@/db/settings'
import * as weakPatternsRepo from '@/db/weakPatterns'
import * as wrongQuestionsRepo from '@/db/wrongQuestions'
import type { ActiveSession, QuestionRecord, TrainingSession, WeakPattern, WrongQuestion } from '@/types'

export interface ExportData {
  sessions: TrainingSession[]
  questions: QuestionRecord[]
  wrongQuestions: WrongQuestion[]
  weakPatterns: WeakPattern[]
  activeSessions: ActiveSession[]
  settings: AppSettings[]
}

export interface ExportOptions {
  /** 是否包含未完成训练（默认不导出，避免导入端出现“幽灵”未完成训练） */
  includeActiveSessions?: boolean
  /** 仅导出指定模块 */
  module?: string
}

export interface ExportFile {
  filename: string
  content: string
  mime: string
}

/** 汇总当前数据库中的全部数据 */
export async function collectExportData(options: ExportOptions = {}): Promise<ExportData> {
  const [sessions, questions, wrongQuestions, weakPatterns, activeSessions, settings] = await Promise.all([
    sessionsRepo.listSessions({ module: options.module }),
    questionsRepo.listQuestions({ module: options.module }),
    wrongQuestionsRepo.listWrongQuestions({ module: options.module }),
    weakPatternsRepo.listWeakPatterns(options.module),
    options.includeActiveSessions ? activeSessionsRepo.listActiveSessions() : Promise.resolve([]),
    settingsRepo.getSettings()
  ])

  // API Key is a local secret and must never enter backups.
  const exportableSettings: AppSettings = { ...settings, ai: { ...settings.ai, apiKey: '' } }
  return { sessions, questions, wrongQuestions, weakPatterns, activeSessions, settings: [exportableSettings] }
}

/** 构造导出载荷（§32） */
export async function buildExportPayload(options: ExportOptions = {}): Promise<ExportPayload> {
  const data = await collectExportData(options)
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'basic-calculation-training',
    data: {
      sessions: data.sessions,
      questions: data.questions,
      wrongQuestions: data.wrongQuestions,
      weakPatterns: data.weakPatterns,
      activeSessions: data.activeSessions,
      settings: data.settings
    }
  }
}

function timestampSuffix(): string {
  const now = new Date()
  const pad = (v: number): string => v.toString().padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`
}

/** 导出全部数据（JSON，用于备份与后续分析） */
export async function buildFullJsonExport(options: ExportOptions = {}): Promise<ExportFile> {
  const payload = await buildExportPayload(options)
  return {
    filename: `basic-calculation-training-backup-${timestampSuffix()}.json`,
    content: JSON.stringify(payload, null, 2),
    mime: 'application/json'
  }
}

/** 导出错题（JSON） */
export async function buildWrongQuestionsJsonExport(module?: string): Promise<ExportFile> {
  const wrongQuestions = await wrongQuestionsRepo.listWrongQuestions({ module })
  const payload: ExportPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'basic-calculation-training',
    data: {
      sessions: [],
      questions: [],
      wrongQuestions,
      weakPatterns: [],
      activeSessions: [],
      settings: []
    }
  }
  return {
    filename: `wrong-questions-${timestampSuffix()}.json`,
    content: JSON.stringify(payload, null, 2),
    mime: 'application/json'
  }
}

/** CSV 通用转义：Excel 友好（§29.2） */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const header = columns.map(csvCell).join(',')
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))
  // BOM 便于 Excel 正确识别 UTF-8
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`
}

const QUESTION_CSV_COLUMNS = [
  'id',
  'sessionId',
  'module',
  'mode',
  'questionIndex',
  'question',
  'dividend',
  'divisor',
  'correctAnswer',
  'rawAnswer',
  'userAnswer',
  'errorRate',
  'correct',
  'elapsedMs',
  'startedAt',
  'submittedAt',
  'origin',
  'createdAt'
] as const

const WRONG_CSV_COLUMNS = [
  'id',
  'question',
  'dividend',
  'divisor',
  'correctAnswer',
  'userAnswer',
  'errorRate',
  'elapsedMs',
  'wrongCount',
  'correctCount',
  'createdAt',
  'lastWrongAt',
  'lastCorrectAt',
  'trainingSessionId',
  'status'
] as const

/** 导出全部题目原始数据（CSV） */
export async function buildQuestionsCsvExport(module?: string): Promise<ExportFile> {
  const questions = await questionsRepo.listQuestions({ module })
  return {
    filename: `questions-${timestampSuffix()}.csv`,
    content: toCsv(QUESTION_CSV_COLUMNS, questions as unknown as Record<string, unknown>[]),
    mime: 'text/csv;charset=utf-8'
  }
}

/** 导出错题（CSV） */
export async function buildWrongQuestionsCsvExport(module?: string): Promise<ExportFile> {
  const wrongQuestions = await wrongQuestionsRepo.listWrongQuestions({ module })
  return {
    filename: `wrong-questions-${timestampSuffix()}.csv`,
    content: toCsv(WRONG_CSV_COLUMNS, wrongQuestions as unknown as Record<string, unknown>[]),
    mime: 'text/csv;charset=utf-8'
  }
}

export type ImportConflictPolicy = 'skip' | 'overwrite'

export interface ImportResult {
  schemaVersion: number
  exportedAt: string
  imported: {
    sessions: number
    questions: number
    wrongQuestions: number
    weakPatterns: number
    activeSessions: number
    settings: number
  }
  skipped: number
  errors: string[]
}

/** 导入前校验（供 UI 预先检查） */
export function checkImportPayload(raw: unknown): { ok: true; payload: ExportPayload } | { ok: false; errors: string[] } {
  try {
    return { ok: true, payload: validateExportPayload(raw) }
  } catch (error) {
    if (error instanceof ExportValidationError) return { ok: false, errors: error.errors }
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
  }
}

/** 解析并导入 JSON 文本（§31） */
export async function importFromJsonText(
  text: string,
  policy: ImportConflictPolicy = 'skip'
): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ExportValidationError(['导入失败：文件不是合法的 JSON'])
  }
  const payload = validateExportPayload(parsed)
  return importPayload(payload, policy)
}

/**
 * 写入导入数据。
 * ID 冲突处理：skip 保留本地已有记录；overwrite 用导入数据覆盖。
 */
export async function importPayload(
  payload: ExportPayload,
  policy: ImportConflictPolicy = 'skip'
): Promise<ImportResult> {
  const errors: string[] = []
  let skipped = 0

  const result: ImportResult = {
    schemaVersion: payload.schemaVersion,
    exportedAt: payload.exportedAt,
    imported: {
      sessions: 0,
      questions: 0,
      wrongQuestions: 0,
      weakPatterns: 0,
      activeSessions: 0,
      settings: 0
    },
    skipped: 0,
    errors
  }

  const persist = async <T extends { id: string }>(
    items: T[],
    existingIds: Set<string>,
    put: (item: T) => Promise<void>
  ): Promise<number> => {
    let count = 0
    for (const item of items) {
      if (policy === 'skip' && existingIds.has(item.id)) {
        skipped += 1
        continue
      }
      await put(item)
      count += 1
    }
    return count
  }

  const [existingSessions, existingQuestions, existingWrong, existingWeak, existingActive] = await Promise.all([
    sessionsRepo.listSessions(),
    questionsRepo.listQuestions(),
    wrongQuestionsRepo.listWrongQuestions(),
    weakPatternsRepo.listWeakPatterns(),
    activeSessionsRepo.listActiveSessions()
  ])

  try {
    result.imported.sessions = await persist(
      payload.data.sessions,
      new Set(existingSessions.map((s) => s.id)),
      (session) => sessionsRepo.putSession(session)
    )
    result.imported.questions = await persist(
      payload.data.questions,
      new Set(existingQuestions.map((q) => q.id)),
      (question) => questionsRepo.putQuestion(question)
    )

    // 错题以 questionKey 唯一，除 ID 外还需检查唯一键冲突
    const existingWrongIds = new Set(existingWrong.map((q) => q.id))
    const existingWrongKeys = new Set(existingWrong.map((q) => q.questionKey))
    for (const item of payload.data.wrongQuestions) {
      if (policy === 'skip' && (existingWrongIds.has(item.id) || existingWrongKeys.has(item.questionKey))) {
        skipped += 1
        continue
      }
      await wrongQuestionsRepo.putWrongQuestion(item)
      result.imported.wrongQuestions += 1
    }

    result.imported.weakPatterns = await persist(
      payload.data.weakPatterns,
      new Set(existingWeak.map((p) => p.id)),
      async (pattern) => {
        await weakPatternsRepo.bulkPutWeakPatterns([pattern])
      }
    )
    result.imported.activeSessions = await persist(
      payload.data.activeSessions,
      new Set(existingActive.map((s) => s.id)),
      (session) => activeSessionsRepo.putActiveSession(session)
    )

    if (payload.data.settings.length > 0) {
      await settingsRepo.saveSettings(payload.data.settings[payload.data.settings.length - 1])
      result.imported.settings = 1
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  result.skipped = skipped
  return result
}

export { ExportValidationError, validateExportPayload }
