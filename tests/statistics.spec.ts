/** 统计计算测试（§17 / §27） */
import { describe, expect, it } from 'vitest'
import {
  accuracyOf,
  averageElapsedByCorrectness,
  buildDailySummaries,
  emptySummary,
  recentErrorRate,
  summarize,
  summarizeQuestions,
  summarizeRange,
  summarizeSessions
} from '@/services/statistics'
import { isInRange, localDateKey, rangeStartDate } from '@/services/format'
import { makeQuestionRecord, makeSession } from './fixtures'

const dateIso = (year: number, month: number, day: number, hour = 12): string =>
  new Date(year, month - 1, day, hour).toISOString()

describe('基础统计（§17.1）', () => {
  it('正确率计算', () => {
    expect(accuracyOf(9, 10)).toBeCloseTo(90, 6)
    expect(accuracyOf(0, 0)).toBe(0)
    expect(accuracyOf(3, 4)).toBeCloseTo(75, 6)
  })

  it('题目级统计包含题数 / 正确数 / 错误数 / 平均单题用时', () => {
    const records = [
      makeQuestionRecord({ divisor: 300, correct: true, elapsedMs: 4000 }),
      makeQuestionRecord({ divisor: 301, correct: false, elapsedMs: 8000 }),
      makeQuestionRecord({ divisor: 302, correct: true, elapsedMs: 6000 })
    ]
    const summary = summarizeQuestions(records)
    expect(summary).toMatchObject({
      questionCount: 3,
      correctCount: 2,
      wrongCount: 1,
      totalElapsedMs: 18000
    })
    expect(summary.accuracy).toBeCloseTo(66.67, 1)
    expect(summary.avgElapsedMs).toBeCloseTo(6000, 6)
  })

  it('训练组级统计', () => {
    const sessions = [
      makeSession({ answeredCount: 10, correctCount: 10, totalElapsedMs: 58_000 }),
      makeSession({ answeredCount: 10, correctCount: 9, totalElapsedMs: 70_000, grade: 'encourage' })
    ]
    const summary = summarizeSessions(sessions)
    expect(summary.sessionCount).toBe(2)
    expect(summary.questionCount).toBe(20)
    expect(summary.correctCount).toBe(19)
    expect(summary.accuracy).toBeCloseTo(95, 6)
    expect(summary.avgElapsedMs).toBeCloseTo(6400, 6)
  })

  it('综合统计优先使用题目级原始数据', () => {
    const sessions = [makeSession({ answeredCount: 2, correctCount: 1, totalElapsedMs: 12_000 })]
    const records = [
      makeQuestionRecord({ divisor: 300, correct: true, elapsedMs: 5000 }),
      makeQuestionRecord({ divisor: 301, correct: false, elapsedMs: 7000 })
    ]
    const summary = summarize(sessions, records)
    expect(summary.sessionCount).toBe(1)
    expect(summary.questionCount).toBe(2)
    expect(summary.accuracy).toBeCloseTo(50, 6)
  })

  it('空数据返回空摘要', () => {
    expect(emptySummary()).toMatchObject({ sessionCount: 0, questionCount: 0, accuracy: 0 })
  })

  it('按正确性统计平均用时', () => {
    const records = [
      makeQuestionRecord({ divisor: 300, correct: true, elapsedMs: 4000 }),
      makeQuestionRecord({ divisor: 301, correct: true, elapsedMs: 6000 }),
      makeQuestionRecord({ divisor: 302, correct: false, elapsedMs: 9000 })
    ]
    expect(averageElapsedByCorrectness(records, true)).toBeCloseTo(5000, 6)
    expect(averageElapsedByCorrectness(records, false)).toBeCloseTo(9000, 6)
  })

  it('最近窗口错误率', () => {
    const records = [
      makeQuestionRecord({ divisor: 300, correct: false }),
      makeQuestionRecord({ divisor: 301, correct: true }),
      makeQuestionRecord({ divisor: 302, correct: true })
    ]
    expect(recentErrorRate(records, 2)).toBeCloseTo(0, 6)
    expect(recentErrorRate(records, 3)).toBeCloseTo(33.33, 1)
  })
})

describe('时间范围与历史（§17.2 / §27）', () => {
  const now = new Date(2026, 8, 23, 15, 0, 0) // 2026-09-23

  it('范围起点', () => {
    expect(localDateKey(rangeStartDate('today', now)!)).toBe('2026-09-23')
    expect(localDateKey(rangeStartDate('7d', now)!)).toBe('2026-09-17')
    expect(localDateKey(rangeStartDate('30d', now)!)).toBe('2026-08-25')
    expect(rangeStartDate('all', now)).toBeNull()
  })

  it('范围过滤', () => {
    expect(isInRange(dateIso(2026, 9, 23, 9), 'today', now)).toBe(true)
    expect(isInRange(dateIso(2026, 9, 22, 9), 'today', now)).toBe(false)
    expect(isInRange(dateIso(2026, 9, 22, 9), '7d', now)).toBe(true)
    expect(isInRange(dateIso(2026, 7, 1, 9), '30d', now)).toBe(false)
    expect(isInRange(dateIso(2020, 1, 1, 9), 'all', now)).toBe(true)
  })

  it('按天聚合训练组并倒序排列', () => {
    const sessions = [
      makeSession({ startedAt: dateIso(2026, 9, 23, 10), answeredCount: 10, correctCount: 10 }),
      makeSession({ startedAt: dateIso(2026, 9, 23, 20), answeredCount: 10, correctCount: 9 }),
      makeSession({ startedAt: dateIso(2026, 9, 21, 20), answeredCount: 5, correctCount: 5 })
    ]
    const daily = buildDailySummaries(sessions, 'all', now)
    expect(daily).toHaveLength(2)
    expect(daily[0].date).toBe('2026-09-23')
    expect(daily[0].sessionCount).toBe(2)
    expect(daily[0].questionCount).toBe(20)
    expect(daily[1].date).toBe('2026-09-21')
  })

  it('按范围汇总统计', () => {
    const sessions = [
      makeSession({ startedAt: dateIso(2026, 9, 23, 10), answeredCount: 10, correctCount: 10 }),
      makeSession({ startedAt: dateIso(2026, 8, 1, 10), answeredCount: 10, correctCount: 5 })
    ]
    const records = [
      makeQuestionRecord({ divisor: 300, correct: true, createdAt: dateIso(2026, 9, 23, 10) }),
      makeQuestionRecord({ divisor: 301, correct: false, createdAt: dateIso(2026, 8, 1, 10) })
    ]
    const today = summarizeRange(sessions, records, 'today', now)
    expect(today.sessionCount).toBe(1)
    expect(today.questionCount).toBe(1)
    expect(today.accuracy).toBeCloseTo(100, 6)

    const all = summarizeRange(sessions, records, 'all', now)
    expect(all.sessionCount).toBe(2)
    expect(all.accuracy).toBeCloseTo(50, 6)
  })
})
