/**
 * 统计计算（§17 / §34 statistics）。
 *
 * 注意：正确率仅用于统计分析，绝不参与 优秀/良好/合格 等级计算（§10.1）。
 * 本文件为纯函数，不依赖浏览器 API 与数据库。
 */

import type { DailySummary, QuestionRecord, StatsSummary, TrainingSession } from '@/types'
import { isInRange, localDateKey, type TimeRange } from './format'

/** 正确率（%）；无题目时返回 0 */
export function accuracyOf(correctCount: number, questionCount: number): number {
  if (questionCount <= 0) return 0
  return (correctCount / questionCount) * 100
}

export function emptySummary(): StatsSummary {
  return {
    sessionCount: 0,
    questionCount: 0,
    correctCount: 0,
    wrongCount: 0,
    accuracy: 0,
    totalElapsedMs: 0,
    avgElapsedMs: 0
  }
}

/** 基于题目级原始数据统计（最精确） */
export function summarizeQuestions(records: readonly QuestionRecord[]): StatsSummary {
  const questionCount = records.length
  const correctCount = records.filter((r) => r.correct).length
  const totalElapsedMs = records.reduce((sum, r) => sum + (Number.isFinite(r.elapsedMs) ? r.elapsedMs : 0), 0)
  return {
    sessionCount: 0,
    questionCount,
    correctCount,
    wrongCount: questionCount - correctCount,
    accuracy: accuracyOf(correctCount, questionCount),
    totalElapsedMs,
    avgElapsedMs: questionCount > 0 ? totalElapsedMs / questionCount : 0
  }
}

/** 基于训练组记录统计 */
export function summarizeSessions(sessions: readonly TrainingSession[]): StatsSummary {
  const questionCount = sessions.reduce((sum, s) => sum + s.answeredCount, 0)
  const correctCount = sessions.reduce((sum, s) => sum + s.correctCount, 0)
  const totalElapsedMs = sessions.reduce((sum, s) => sum + s.totalElapsedMs, 0)
  return {
    sessionCount: sessions.length,
    questionCount,
    correctCount,
    wrongCount: questionCount - correctCount,
    accuracy: accuracyOf(correctCount, questionCount),
    totalElapsedMs,
    avgElapsedMs: questionCount > 0 ? totalElapsedMs / questionCount : 0
  }
}

/** 综合统计：题目级数据优先，训练组数量单独统计 */
export function summarize(
  sessions: readonly TrainingSession[],
  records: readonly QuestionRecord[]
): StatsSummary {
  if (records.length === 0) return summarizeSessions(sessions)
  const base = summarizeQuestions(records)
  const totalCount = sessions.reduce((sum, s) => sum + s.answeredCount, 0)
  const totalElapsedMs = sessions.reduce((sum, s) => sum + s.totalElapsedMs, 0)
  return {
    ...base,
    sessionCount: sessions.length,
    totalElapsedMs: totalElapsedMs > 0 ? totalElapsedMs : base.totalElapsedMs,
    avgElapsedMs: totalCount > 0 ? totalElapsedMs / totalCount : base.avgElapsedMs
  }
}

/** 过滤统计：按时间范围 */
export function summarizeRange(
  sessions: readonly TrainingSession[],
  records: readonly QuestionRecord[],
  range: TimeRange,
  now: Date = new Date()
): StatsSummary {
  if (range === 'all') return summarize(sessions, records)
  return summarize(
    sessions.filter((s) => isInRange(s.startedAt, range, now)),
    records.filter((r) => isInRange(r.submittedAt || r.createdAt, range, now))
  )
}

/** 按天聚合训练组（§27 历史页面） */
export function buildDailySummaries(
  sessions: readonly TrainingSession[],
  range: TimeRange = 'all',
  now: Date = new Date()
): DailySummary[] {
  const filtered = sessions.filter((s) => isInRange(s.startedAt, range, now))
  const groups = new Map<string, TrainingSession[]>()

  for (const session of filtered) {
    const key = localDateKey(session.startedAt)
    const list = groups.get(key)
    if (list) list.push(session)
    else groups.set(key, [session])
  }

  return [...groups.entries()]
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      const summary = summarizeSessions(sorted)
      return {
        date,
        sessionCount: summary.sessionCount,
        questionCount: summary.questionCount,
        correctCount: summary.correctCount,
        wrongCount: summary.wrongCount,
        accuracy: summary.accuracy,
        totalElapsedMs: summary.totalElapsedMs,
        avgElapsedMs: summary.avgElapsedMs,
        sessions: sorted
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** 平均单题用时（仅正确题 / 仅错误题），用于薄弱点页面辅助展示 */
export function averageElapsedByCorrectness(
  records: readonly QuestionRecord[],
  correct: boolean
): number | null {
  const filtered = records.filter((r) => r.correct === correct)
  if (filtered.length === 0) return null
  return filtered.reduce((sum, r) => sum + r.elapsedMs, 0) / filtered.length
}

/** 最近 N 道题的错误率（%），用于趋势展示 */
export function recentErrorRate(records: readonly QuestionRecord[], windowSize: number): number {
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const recent = sorted.slice(Math.max(0, sorted.length - windowSize))
  if (recent.length === 0) return 0
  const wrong = recent.filter((r) => !r.correct).length
  return accuracyOf(wrong, recent.length)
}
