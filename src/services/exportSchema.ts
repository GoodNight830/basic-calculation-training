/**
 * 导入数据结构校验（§31 / §32 / §42）。
 *
 * 原则：
 * - 白名单重建对象，不把外部数据原样写库；
 * - 非法数值（NaN / Infinity / 0 除数 / 负用时）一律拒绝；
 * - 版本号高于当前应用时拒绝导入，避免误读未来结构；
 * - 不使用 eval，不执行任何来自文件的代码。
 */

import { normalizeSettings } from '@/db/settings'
import { SCHEMA_VERSION, type AppSettings } from '@/config/trainingConfig'
import type {
  ActiveSession,
  AnswerEntry,
  GeneratedQuestion,
  Grade,
  QuestionRecord,
  SessionStatus,
  TrainingMode,
  TrainingSession,
  WeakDimension,
  WeakPattern,
  WeakPatternStatus,
  WrongQuestion,
  WrongQuestionStatus
} from '@/types'

export interface ExportPayload {
  schemaVersion: number
  exportedAt: string
  app: string
  data: {
    sessions: TrainingSession[]
    questions: QuestionRecord[]
    wrongQuestions: WrongQuestion[]
    weakPatterns: WeakPattern[]
    activeSessions: ActiveSession[]
    settings: AppSettings[]
  }
}

export class ExportValidationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(errors.join('\n'))
    this.name = 'ExportValidationError'
    this.errors = errors
  }
}

const MAX_REPORTED_ERRORS = 20

class ErrorCollector {
  private readonly list: string[] = []

  add(path: string, message: string): void {
    if (this.list.length < MAX_REPORTED_ERRORS) this.list.push(`${path}: ${message}`)
  }

  get errors(): string[] {
    return this.list
  }

  get ok(): boolean {
    return this.list.length === 0
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function isMode(value: unknown): value is TrainingMode {
  return value === 'training' || value === 'speed'
}

function isGrade(value: unknown): value is Grade {
  return value === 'excellent' || value === 'good' || value === 'pass' || value === 'encourage'
}

function isSessionStatus(value: unknown): value is SessionStatus {
  return value === 'active' || value === 'finished' || value === 'abandoned'
}

function isWrongStatus(value: unknown): value is WrongQuestionStatus {
  return value === 'active' || value === 'mastered'
}

function isWeakStatus(value: unknown): value is WeakPatternStatus {
  return value === 'active' || value === 'improving' || value === 'resolved'
}

function isWeakDimension(value: unknown): value is WeakDimension {
  return value === 'divisor_range' || value === 'specific_number'
}

function num(value: unknown, fallback = 0): number {
  return isFiniteNumber(value) ? value : fallback
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function nullableNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null
}

function weakRangeOf(value: unknown): { min: number; max: number } | null {
  if (!isRecord(value)) return null
  if (!isFiniteNumber(value.min) || !isFiniteNumber(value.max)) return null
  return { min: value.min, max: value.max }
}

function validateQuestionItem(raw: unknown, path: string, errors: ErrorCollector): GeneratedQuestion | null {
  if (!isRecord(raw)) {
    errors.add(path, '题目不是对象')
    return null
  }
  if (!isNonEmptyString(raw.id)) errors.add(`${path}.id`, '缺少题目 ID')
  if (!isInteger(raw.dividend)) errors.add(`${path}.dividend`, '被除数必须是整数')
  if (!isInteger(raw.divisor) || raw.divisor === 0) errors.add(`${path}.divisor`, '除数必须是合法非零整数')
  if (!isFiniteNumber(raw.correctAnswer)) errors.add(`${path}.correctAnswer`, '正确答案必须是有限数值')
  if (errors.ok === false) return null

  return {
    id: str(raw.id),
    module: str(raw.module, 'five-divide-three'),
    dividend: raw.dividend as number,
    divisor: raw.divisor as number,
    correctAnswer: raw.correctAnswer as number,
    text: str(raw.text),
    origin: raw.origin === 'weak' ? 'weak' : 'normal',
    weakRange: weakRangeOf(raw.weakRange),
    createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : new Date().toISOString()
  }
}

function validateAnswerEntry(raw: unknown): AnswerEntry | null {
  if (!isRecord(raw)) return null
  if (!isNonEmptyString(raw.questionId)) return null
  return {
    questionId: raw.questionId,
    questionIndex: num(raw.questionIndex, 0),
    rawAnswer: str(raw.rawAnswer),
    userAnswer: nullableNumber(raw.userAnswer),
    errorRate: nullableNumber(raw.errorRate),
    correct: raw.correct === true,
    elapsedMs: Math.max(0, num(raw.elapsedMs, 0)),
    startedAt: str(raw.startedAt),
    submittedAt: str(raw.submittedAt)
  }
}

/** 校验训练组 */
function validateSession(raw: unknown, path: string, errors: ErrorCollector): TrainingSession | null {
  if (!isRecord(raw)) {
    errors.add(path, '训练组不是对象')
    return null
  }
  if (!isNonEmptyString(raw.id)) {
    errors.add(`${path}.id`, '缺少训练组 ID')
    return null
  }
  if (!isMode(raw.mode)) errors.add(`${path}.mode`, 'mode 必须是 training 或 speed')
  if (!isIsoDate(raw.startedAt)) errors.add(`${path}.startedAt`, 'startedAt 必须是合法时间')
  if (isFiniteNumber(raw.totalElapsedMs) && raw.totalElapsedMs < 0) {
    errors.add(`${path}.totalElapsedMs`, '总用时不能为负')
  }
  if (!errors.ok) return null

  return {
    id: str(raw.id),
    module: str(raw.module, 'five-divide-three'),
    mode: raw.mode as TrainingMode,
    questionCount: Math.max(0, num(raw.questionCount, 0)),
    allowedErrorRate: Math.max(0, num(raw.allowedErrorRate, 3)),
    startedAt: raw.startedAt as string,
    finishedAt: isIsoDate(raw.finishedAt) ? raw.finishedAt : '',
    totalElapsedMs: Math.max(0, num(raw.totalElapsedMs, 0)),
    answeredCount: Math.max(0, num(raw.answeredCount, 0)),
    correctCount: Math.max(0, num(raw.correctCount, 0)),
    wrongCount: Math.max(0, num(raw.wrongCount, 0)),
    grade: isGrade(raw.grade) ? raw.grade : 'encourage',
    status: isSessionStatus(raw.status) ? raw.status : 'finished',
    createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : (raw.startedAt as string)
  }
}

/** 校验题目记录 */
function validateQuestionRecord(raw: unknown, path: string, errors: ErrorCollector): QuestionRecord | null {
  if (!isRecord(raw)) {
    errors.add(path, '题目记录不是对象')
    return null
  }
  if (!isNonEmptyString(raw.id)) errors.add(`${path}.id`, '缺少题目记录 ID')
  if (!isNonEmptyString(raw.sessionId)) errors.add(`${path}.sessionId`, '缺少训练组 ID')
  if (!isMode(raw.mode)) errors.add(`${path}.mode`, 'mode 必须是 training 或 speed')
  if (!isInteger(raw.dividend)) errors.add(`${path}.dividend`, '被除数必须是整数')
  if (!isInteger(raw.divisor) || raw.divisor === 0) errors.add(`${path}.divisor`, '除数必须是合法非零整数')
  if (!isFiniteNumber(raw.correctAnswer)) errors.add(`${path}.correctAnswer`, '正确答案必须是有限数值')
  if (isFiniteNumber(raw.elapsedMs) && raw.elapsedMs < 0) errors.add(`${path}.elapsedMs`, '单题用时不能为负')
  if (!errors.ok) return null

  const dividend = raw.dividend as number
  const divisor = raw.divisor as number

  return {
    id: str(raw.id),
    sessionId: raw.sessionId as string,
    module: str(raw.module, 'five-divide-three'),
    mode: raw.mode as TrainingMode,
    question: str(raw.question, `${dividend} ÷ ${divisor}`),
    questionIndex: Math.max(1, num(raw.questionIndex, 1)),
    dividend,
    divisor,
    correctAnswer: raw.correctAnswer as number,
    rawAnswer: str(raw.rawAnswer, raw.userAnswer === null || raw.userAnswer === undefined ? '' : String(raw.userAnswer)),
    userAnswer: nullableNumber(raw.userAnswer),
    errorRate: nullableNumber(raw.errorRate),
    correct: raw.correct === true,
    elapsedMs: Math.max(0, num(raw.elapsedMs, 0)),
    startedAt: str(raw.startedAt),
    submittedAt: str(raw.submittedAt),
    origin: raw.origin === 'weak' ? 'weak' : 'normal',
    weakRange: weakRangeOf(raw.weakRange),
    createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : str(raw.submittedAt)
  }
}

/** 校验错题 */
function validateWrongQuestion(raw: unknown, path: string, errors: ErrorCollector): WrongQuestion | null {
  if (!isRecord(raw)) {
    errors.add(path, '错题记录不是对象')
    return null
  }
  if (!isNonEmptyString(raw.id)) errors.add(`${path}.id`, '缺少错题 ID')
  if (!isInteger(raw.dividend)) errors.add(`${path}.dividend`, '被除数必须是整数')
  if (!isInteger(raw.divisor) || raw.divisor === 0) errors.add(`${path}.divisor`, '除数必须是合法非零整数')
  if (!isFiniteNumber(raw.correctAnswer)) errors.add(`${path}.correctAnswer`, '正确答案必须是有限数值')
  if (!errors.ok) return null

  const dividend = raw.dividend as number
  const divisor = raw.divisor as number

  return {
    id: str(raw.id),
    questionKey: isNonEmptyString(raw.questionKey) ? raw.questionKey : `${dividend}:${divisor}`,
    module: str(raw.module, 'five-divide-three'),
    question: str(raw.question, `${dividend} ÷ ${divisor}`),
    dividend,
    divisor,
    correctAnswer: raw.correctAnswer as number,
    userAnswer: nullableNumber(raw.userAnswer),
    rawAnswer: str(raw.rawAnswer),
    errorRate: nullableNumber(raw.errorRate),
    elapsedMs: Math.max(0, num(raw.elapsedMs, 0)),
    wrongCount: Math.max(1, num(raw.wrongCount, 1)),
    correctCount: Math.max(0, num(raw.correctCount, 0)),
    createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    lastWrongAt: isIsoDate(raw.lastWrongAt) ? raw.lastWrongAt : new Date().toISOString(),
    lastCorrectAt: isIsoDate(raw.lastCorrectAt) ? raw.lastCorrectAt : null,
    trainingSessionId: str(raw.trainingSessionId),
    firstSessionId: str(raw.firstSessionId, str(raw.trainingSessionId)),
    status: isWrongStatus(raw.status) ? raw.status : 'active',
    masteredAt: isIsoDate(raw.masteredAt) ? raw.masteredAt : null,
    updatedAt: isIsoDate(raw.updatedAt) ? raw.updatedAt : new Date().toISOString()
  }
}

/** 校验薄弱点 */
function validateWeakPattern(raw: unknown, path: string, errors: ErrorCollector): WeakPattern | null {
  if (!isRecord(raw)) {
    errors.add(path, '薄弱点记录不是对象')
    return null
  }
  if (!isNonEmptyString(raw.id)) errors.add(`${path}.id`, '缺少薄弱点 ID')
  if (!isFiniteNumber(raw.rangeMin) || !isFiniteNumber(raw.rangeMax)) {
    errors.add(`${path}.rangeMin`, '范围必须是数值')
  }
  if (!errors.ok) return null

  return {
    id: str(raw.id),
    module: str(raw.module, 'five-divide-three'),
    dimension: isWeakDimension(raw.dimension) ? raw.dimension : 'divisor_range',
    rangeMin: raw.rangeMin as number,
    rangeMax: raw.rangeMax as number,
    sampleCount: Math.max(0, num(raw.sampleCount, 0)),
    errorCount: Math.max(0, num(raw.errorCount, 0)),
    errorRate: Math.max(0, num(raw.errorRate, 0)),
    overallErrorRate: Math.max(0, num(raw.overallErrorRate, 0)),
    reinforcementWeight: Math.min(1, Math.max(0, num(raw.reinforcementWeight, 0))),
    status: isWeakStatus(raw.status) ? raw.status : 'active',
    recentSampleCount: Math.max(0, num(raw.recentSampleCount, 0)),
    recentErrorRate: Math.max(0, num(raw.recentErrorRate, 0)),
    previousErrorRate: nullableNumber(raw.previousErrorRate),
    trend: raw.trend === 'up' || raw.trend === 'down' ? raw.trend : 'flat',
    updatedAt: isIsoDate(raw.updatedAt) ? raw.updatedAt : new Date().toISOString()
  }
}

/** 校验未完成训练（activeSession） */
function validateActiveSession(
  raw: unknown,
  path: string,
  errors: ErrorCollector
): ActiveSession | null {
  if (!isRecord(raw)) {
    errors.add(path, '未完成训练记录不是对象')
    return null
  }
  if (!isNonEmptyString(raw.id) && !isNonEmptyString(raw.sessionId)) {
    errors.add(`${path}.id`, '缺少训练组 ID')
  }
  if (!isMode(raw.mode)) errors.add(`${path}.mode`, 'mode 必须是 training 或 speed')
  if (!Array.isArray(raw.questionList)) errors.add(`${path}.questionList`, 'questionList 必须是数组')
  if (!Array.isArray(raw.answers)) errors.add(`${path}.answers`, 'answers 必须是数组')
  if (!errors.ok) return null

  const questionList = (raw.questionList as unknown[])
    .map((item, index) => validateQuestionItem(item, `${path}.questionList[${index}]`, errors))
    .filter((item): item is GeneratedQuestion => item !== null)
  const queuedSource = Array.isArray(raw.queuedQuestions) ? (raw.queuedQuestions as unknown[]) : []
  const queuedQuestions = queuedSource
    .map((item, index) => validateQuestionItem(item, `${path}.queuedQuestions[${index}]`, errors))
    .filter((item): item is GeneratedQuestion => item !== null)
  const answers = (raw.answers as unknown[])
    .map((item) => validateAnswerEntry(item))
    .filter((item): item is AnswerEntry => item !== null)

  if (!errors.ok) return null

  const sessionId = isNonEmptyString(raw.sessionId) ? raw.sessionId : (raw.id as string)

  return {
    id: isNonEmptyString(raw.id) ? raw.id : sessionId,
    sessionId,
    module: str(raw.module, 'five-divide-three'),
    mode: raw.mode as TrainingMode,
    questionCount: Math.max(0, num(raw.questionCount, 0)),
    allowedErrorRate: Math.max(0, num(raw.allowedErrorRate, 3)),
    currentQuestionIndex: Math.max(0, num(raw.currentQuestionIndex, answers.length)),
    questionList,
    queuedQuestions,
    source: raw.source === 'wrongQuestions' ? 'wrongQuestions' : 'random',
    answers,
    startTime: isIsoDate(raw.startTime) ? raw.startTime : new Date().toISOString(),
    accumulatedElapsedMs: Math.max(0, num(raw.accumulatedElapsedMs, 0)),
    createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
    updatedAt: isIsoDate(raw.updatedAt) ? raw.updatedAt : new Date().toISOString()
  }
}

/** 校验完整导出载荷；任何非法结构都会抛出 ExportValidationError */
export function validateExportPayload(raw: unknown): ExportPayload {
  const errors = new ErrorCollector()

  if (!isRecord(raw)) {
    throw new ExportValidationError(['导入失败：文件内容必须是 JSON 对象'])
  }

  const version = raw.schemaVersion
  if (!isInteger(version) || version < 1) {
    errors.add('schemaVersion', '缺少或非法的数据版本号')
  } else if (version > SCHEMA_VERSION) {
    errors.add(
      'schemaVersion',
      `文件版本 ${version} 高于当前应用支持的版本 ${SCHEMA_VERSION}，请升级应用后再导入`
    )
  }

  if (typeof raw.app === 'string' && raw.app !== 'basic-calculation-training') {
    errors.add('app', `导入文件来源不是本应用（app = ${raw.app}）`)
  }

  if (!isRecord(raw.data)) {
    errors.add('data', '缺少 data 字段')
    throw new ExportValidationError(errors.errors)
  }

  const data = raw.data
  const arrayFields = ['sessions', 'questions', 'wrongQuestions', 'weakPatterns'] as const
  for (const field of arrayFields) {
    if (data[field] !== undefined && !Array.isArray(data[field])) {
      errors.add(`data.${field}`, '必须是数组')
    }
  }
  if (errors.ok === false) throw new ExportValidationError(errors.errors)

  const sessions = ((data.sessions as unknown[]) ?? [])
    .map((item, index) => validateSession(item, `data.sessions[${index}]`, errors))
    .filter((item): item is TrainingSession => item !== null)
  const questions = ((data.questions as unknown[]) ?? [])
    .map((item, index) => validateQuestionRecord(item, `data.questions[${index}]`, errors))
    .filter((item): item is QuestionRecord => item !== null)
  const wrongQuestions = ((data.wrongQuestions as unknown[]) ?? [])
    .map((item, index) => validateWrongQuestion(item, `data.wrongQuestions[${index}]`, errors))
    .filter((item): item is WrongQuestion => item !== null)
  const weakPatterns = ((data.weakPatterns as unknown[]) ?? [])
    .map((item, index) => validateWeakPattern(item, `data.weakPatterns[${index}]`, errors))
    .filter((item): item is WeakPattern => item !== null)
  const activeSessions = ((data.activeSessions as unknown[]) ?? [])
    .map((item, index) => validateActiveSession(item, `data.activeSessions[${index}]`, errors))
    .filter((item): item is ActiveSession => item !== null)

  const settingsRaw = (data.settings as unknown[]) ?? []
  const settings: AppSettings[] = settingsRaw
    .filter((item) => isRecord(item))
    .map((item) => normalizeSettings(item as Partial<AppSettings>))

  if (!errors.ok) throw new ExportValidationError(errors.errors)

  return {
    schemaVersion: version as number,
    exportedAt: isIsoDate(raw.exportedAt) ? raw.exportedAt : new Date().toISOString(),
    app: str(raw.app, 'basic-calculation-training'),
    data: {
      sessions,
      questions,
      wrongQuestions,
      weakPatterns,
      activeSessions,
      settings
    }
  }
}
