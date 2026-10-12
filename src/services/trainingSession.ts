/**
 * 训练组领域逻辑（纯函数，§8 / §10 / §12 / §19 / §20）。
 *
 * 这些函数不接触数据库、不接触 DOM，因此可以被单元测试完整覆盖（§45）。
 */

import { gradeSession } from './grading'
import { buildQuestionText } from '@/modules/arithmetic/five-divide-three/calculator'
import { questionKeyOf } from '@/utils/id'
import type { AnswerCheck } from '@/modules/arithmetic/five-divide-three/types'
import type {
  AnswerEntry,
  GeneratedQuestion,
  Grade,
  QuestionRecord,
  TrainingMode,
  TrainingSession,
  WrongQuestion
} from '@/types'

export interface SessionDraft {
  id: string
  module: string
  mode: TrainingMode
  questionCount: number
  allowedErrorRate: number
  startedAt: string
}

/** 创建训练组记录（进行中状态） */
export function createSessionRecord(draft: SessionDraft): TrainingSession {
  return {
    id: draft.id,
    module: draft.module,
    mode: draft.mode,
    questionCount: draft.questionCount,
    allowedErrorRate: draft.allowedErrorRate,
    startedAt: draft.startedAt,
    finishedAt: '',
    totalElapsedMs: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    grade: 'encourage',
    status: 'active',
    createdAt: new Date().toISOString()
  }
}

export interface QuestionRecordInput {
  sessionId: string
  module: string
  mode: TrainingMode
  questionIndex: number
  question: GeneratedQuestion
  check: AnswerCheck
  elapsedMs: number
  startedAt: string
  submittedAt: string
  recordId?: string
  createdAt?: string
}

/** 由一次作答生成题目记录（必须保存 correctAnswer，§20） */
export function buildQuestionRecord(input: QuestionRecordInput): QuestionRecord {
  const { question, check } = input
  return {
    id: input.recordId ?? question.id,
    sessionId: input.sessionId,
    module: input.module,
    mode: input.mode,
    question: question.text || buildQuestionText(question.dividend, question.divisor),
    questionIndex: input.questionIndex,
    dividend: question.dividend,
    divisor: question.divisor,
    correctAnswer: question.correctAnswer,
    rawAnswer: check.raw,
    userAnswer: check.userAnswer,
    errorRate: check.errorRate,
    correct: check.correct,
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    startedAt: input.startedAt,
    submittedAt: input.submittedAt,
    origin: question.origin,
    // 复制为纯对象：题目可能来自 Vue 响应式状态，代理对象无法写入 IndexedDB
    weakRange: question.weakRange ? { min: question.weakRange.min, max: question.weakRange.max } : null,
    createdAt: input.createdAt ?? new Date().toISOString()
  }
}

/** 答案快照（写入 activeSession，用于中断恢复，§6.9） */
export function toAnswerEntry(record: QuestionRecord): AnswerEntry {
  return {
    questionId: record.id,
    questionIndex: record.questionIndex,
    rawAnswer: record.rawAnswer,
    userAnswer: record.userAnswer,
    errorRate: record.errorRate,
    correct: record.correct,
    elapsedMs: record.elapsedMs,
    startedAt: record.startedAt,
    submittedAt: record.submittedAt
  }
}

export interface SessionTotals {
  answeredCount: number
  correctCount: number
  wrongCount: number
  totalElapsedMs: number
}

/** 汇总训练组成绩 */
export function computeTotals(answers: readonly AnswerEntry[]): SessionTotals {
  const answeredCount = answers.length
  const correctCount = answers.filter((a) => a.correct).length
  const totalElapsedMs = answers.reduce((sum, a) => sum + (Number.isFinite(a.elapsedMs) ? a.elapsedMs : 0), 0)
  return {
    answeredCount,
    correctCount,
    wrongCount: answeredCount - correctCount,
    totalElapsedMs
  }
}

/**
 * 结算训练组（§10）。
 * 评分只依据「是否全对 + 总用时」，正确率不参与等级计算。
 */
export function finalizeSession(
  session: TrainingSession,
  answers: readonly AnswerEntry[],
  finishedAt: string
): TrainingSession {
  const totals = computeTotals(answers)
  const grade: Grade = gradeSession(totals.totalElapsedMs, totals.correctCount, totals.answeredCount)
  return {
    ...session,
    finishedAt,
    totalElapsedMs: totals.totalElapsedMs,
    answeredCount: totals.answeredCount,
    correctCount: totals.correctCount,
    wrongCount: totals.wrongCount,
    grade,
    status: 'finished'
  }
}

/** 由错题记录生成/更新错题本条目（§12.1） */
export function mergeWrongQuestion(
  record: QuestionRecord,
  existing: WrongQuestion | null
): WrongQuestion {
  const now = new Date().toISOString()
  const base: WrongQuestion = existing ?? {
    id: record.id,
    questionKey: questionKeyOf(record.dividend, record.divisor),
    module: record.module,
    question: record.question,
    dividend: record.dividend,
    divisor: record.divisor,
    correctAnswer: record.correctAnswer,
    userAnswer: record.userAnswer,
    rawAnswer: record.rawAnswer,
    errorRate: record.errorRate,
    elapsedMs: record.elapsedMs,
    wrongCount: 0,
    correctCount: 0,
    createdAt: record.createdAt,
    lastWrongAt: record.submittedAt,
    lastCorrectAt: null,
    trainingSessionId: record.sessionId,
    firstSessionId: record.sessionId,
    status: 'active',
    masteredAt: null,
    updatedAt: now
  }

  if (record.correct) {
    // 再次做对：不删除历史错误数据（§35.4），只记录正确次数与时间
    return {
      ...base,
      correctCount: base.correctCount + 1,
      lastCorrectAt: record.submittedAt,
      userAnswer: record.userAnswer,
      rawAnswer: record.rawAnswer,
      errorRate: record.errorRate,
      elapsedMs: record.elapsedMs,
      question: record.question,
      correctAnswer: record.correctAnswer,
      updatedAt: now
    }
  }

  return {
    ...base,
    question: record.question,
    correctAnswer: record.correctAnswer,
    userAnswer: record.userAnswer,
    rawAnswer: record.rawAnswer,
    errorRate: record.errorRate,
    elapsedMs: record.elapsedMs,
    wrongCount: base.wrongCount + 1,
    lastWrongAt: record.submittedAt,
    trainingSessionId: record.sessionId,
    updatedAt: now
  }
}
