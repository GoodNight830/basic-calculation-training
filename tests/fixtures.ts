/** 测试数据工厂 */
import { DEFAULT_APP_SETTINGS } from '@/config/trainingConfig'
import { newId } from '@/utils/id'
import type {
  AnswerEntry,
  GeneratedQuestion,
  QuestionRecord,
  TrainingMode,
  TrainingSession,
  WrongQuestion
} from '@/types'

export const MODULE = 'five-divide-three'

/**
 * 递增时间戳：保证同一测试内创建的数据按创建顺序排序，
 * 便于验证「最近窗口」相关的趋势逻辑。
 */
let isoSequence = 0
export function nextIso(): string {
  isoSequence += 1
  return new Date(Date.UTC(2026, 8, 1, 0, 0, isoSequence)).toISOString()
}

export function makeQuestion(
  dividend: number,
  divisor: number,
  overrides: Partial<GeneratedQuestion> = {}
): GeneratedQuestion {
  return {
    id: newId(),
    module: MODULE,
    dividend,
    divisor,
    correctAnswer: dividend / divisor,
    text: `${dividend} ÷ ${divisor}`,
    origin: 'normal',
    weakRange: null,
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

export interface QuestionRecordOverrides extends Partial<QuestionRecord> {
  divisor: number
  correct: boolean
}

export function makeQuestionRecord(overrides: QuestionRecordOverrides): QuestionRecord {
  const dividend = overrides.dividend ?? 50000 + Math.round(overrides.divisor / 2)
  const correctAnswer = overrides.correctAnswer ?? dividend / overrides.divisor
  const userAnswer = overrides.userAnswer ?? (overrides.correct ? correctAnswer : correctAnswer * 1.2)
  // 时间戳默认按创建顺序递增；显式指定 createdAt 时，提交/开始时间与之保持一致，
  // 避免“时间范围统计”测试中出现两个互相矛盾的时间点
  const createdAt = overrides.createdAt ?? nextIso()
  const base: QuestionRecord = {
    id: newId(),
    sessionId: overrides.sessionId ?? 'session-1',
    module: overrides.module ?? MODULE,
    mode: overrides.mode ?? 'training',
    question: overrides.question ?? `${dividend} ÷ ${overrides.divisor}`,
    questionIndex: overrides.questionIndex ?? 1,
    dividend,
    divisor: overrides.divisor,
    correctAnswer,
    rawAnswer: String(userAnswer.toFixed(2)),
    userAnswer,
    errorRate: overrides.correct ? 0 : 20,
    correct: overrides.correct,
    elapsedMs: overrides.elapsedMs ?? 6000,
    startedAt: overrides.startedAt ?? createdAt,
    submittedAt: overrides.submittedAt ?? createdAt,
    origin: overrides.origin ?? 'normal',
    weakRange: overrides.weakRange ?? null,
    createdAt
  }
  return { ...base, ...overrides }
}

export function makeSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: overrides.id ?? newId(),
    module: overrides.module ?? MODULE,
    mode: (overrides.mode ?? 'training') as TrainingMode,
    questionCount: overrides.questionCount ?? 10,
    allowedErrorRate: overrides.allowedErrorRate ?? DEFAULT_APP_SETTINGS.defaultAllowedErrorRate,
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    finishedAt: overrides.finishedAt ?? new Date().toISOString(),
    totalElapsedMs: overrides.totalElapsedMs ?? 60_000,
    answeredCount: overrides.answeredCount ?? 10,
    correctCount: overrides.correctCount ?? 10,
    wrongCount: overrides.wrongCount ?? 0,
    grade: overrides.grade ?? 'excellent',
    status: overrides.status ?? 'finished',
    createdAt: overrides.createdAt ?? new Date().toISOString()
  }
}

export function makeWrongQuestion(overrides: Partial<WrongQuestion> = {}): WrongQuestion {
  const dividend = overrides.dividend ?? 58231
  const divisor = overrides.divisor ?? 317
  return {
    id: overrides.id ?? newId(),
    questionKey: overrides.questionKey ?? `${dividend}:${divisor}`,
    module: overrides.module ?? MODULE,
    question: overrides.question ?? `${dividend} ÷ ${divisor}`,
    dividend,
    divisor,
    correctAnswer: overrides.correctAnswer ?? dividend / divisor,
    userAnswer: overrides.userAnswer ?? 100,
    rawAnswer: overrides.rawAnswer ?? '100',
    errorRate: overrides.errorRate ?? 45,
    elapsedMs: overrides.elapsedMs ?? 7000,
    wrongCount: overrides.wrongCount ?? 1,
    correctCount: overrides.correctCount ?? 0,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    lastWrongAt: overrides.lastWrongAt ?? new Date().toISOString(),
    lastCorrectAt: overrides.lastCorrectAt ?? null,
    trainingSessionId: overrides.trainingSessionId ?? 'session-1',
    firstSessionId: overrides.firstSessionId ?? 'session-1',
    status: overrides.status ?? 'active',
    masteredAt: overrides.masteredAt ?? null,
    updatedAt: overrides.updatedAt ?? new Date().toISOString()
  }
}

export function makeAnswerEntry(overrides: Partial<AnswerEntry> = {}): AnswerEntry {
  return {
    questionId: overrides.questionId ?? newId(),
    questionIndex: overrides.questionIndex ?? 1,
    rawAnswer: overrides.rawAnswer ?? '100',
    userAnswer: overrides.userAnswer ?? 100,
    errorRate: overrides.errorRate ?? 0,
    correct: overrides.correct ?? true,
    elapsedMs: overrides.elapsedMs ?? 5000,
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    submittedAt: overrides.submittedAt ?? new Date().toISOString()
  }
}
