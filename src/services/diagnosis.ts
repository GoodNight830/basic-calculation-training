import { divisorRangeOf } from './weakPattern'
import type { DiagnosisConfidence, DiagnosisRange, DiagnosisTrend, DiagnosisWindow, ErrorPatternCount, LocalDiagnosis, QuestionRecord } from '@/types'

const DAY = 86_400_000

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? null
}

function windowOf(records: readonly QuestionRecord[]): DiagnosisWindow {
  const errorCount = records.filter((r) => !r.correct).length
  return {
    sampleCount: records.length,
    errorCount,
    errorRate: records.length ? round(errorCount / records.length * 100) : 0,
    accuracy: records.length ? round((records.length - errorCount) / records.length * 100) : 0,
    medianElapsedMs: percentile(records.map((r) => r.elapsedMs), 0.5),
    p75ElapsedMs: percentile(records.map((r) => r.elapsedMs), 0.75)
  }
}

function confidenceOf(sampleCount: number): DiagnosisConfidence {
  if (sampleCount < 10) return 'insufficient'
  if (sampleCount < 30) return 'low'
  if (sampleCount < 60) return 'medium'
  return 'high'
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function since(records: readonly QuestionRecord[], start: number, end = Infinity): QuestionRecord[] {
  return records.filter((r) => {
    const time = Date.parse(r.submittedAt || r.createdAt)
    return Number.isFinite(time) && time >= start && time < end
  })
}

function hashText(text: string): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function errorPatterns(records: readonly QuestionRecord[]): ErrorPatternCount[] {
  const counts = new Map<ErrorPatternCount['type'], number>()
  const add = (type: ErrorPatternCount['type']) => counts.set(type, (counts.get(type) ?? 0) + 1)
  const slowThreshold = percentile(records.map((r) => r.elapsedMs), 0.75) ?? Infinity
  const wrongKeys = new Map<string, number>()
  for (const record of records) {
    if (record.rawAnswer.trim() === '') add('empty')
    else if (record.userAnswer === null) add('invalid')
    else if (!record.correct && record.userAnswer > record.correctAnswer) add('answer_too_large')
    else if (!record.correct && record.userAnswer < record.correctAnswer) add('answer_too_small')
    if (record.elapsedMs > slowThreshold) add(record.correct ? 'slow_correct' : 'slow_wrong')
    if (!record.correct) {
      const key = `${record.dividend}:${record.divisor}`
      wrongKeys.set(key, (wrongKeys.get(key) ?? 0) + 1)
    }
  }
  for (const count of wrongKeys.values()) if (count > 1) counts.set('repeat_wrong', (counts.get('repeat_wrong') ?? 0) + count)
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
}

export function buildLocalDiagnosis(
  records: readonly QuestionRecord[],
  module: string,
  options: { now?: Date; rangeSize?: number; lastAiQuestionCount?: number } = {}
): LocalDiagnosis {
  const now = options.now ?? new Date()
  const nowMs = now.getTime()
  const scoped = records.filter((r) => r.module === module)
  const recent7Records = since(scoped, nowMs - 7 * DAY)
  const previous7Records = since(scoped, nowMs - 14 * DAY, nowMs - 7 * DAY)
  const recent30Records = since(scoped, nowMs - 30 * DAY)
  const rangeSize = options.rangeSize ?? 100
  const ranges = new Map<number, QuestionRecord[]>()
  for (const record of scoped) {
    const range = divisorRangeOf(record.divisor, rangeSize)
    const list = ranges.get(range.min) ?? []
    list.push(record)
    ranges.set(range.min, list)
  }
  const rangeRows: DiagnosisRange[] = [...ranges.entries()].map(([rangeMin, all]) => {
    const recent7 = windowOf(since(all, nowMs - 7 * DAY))
    const previous7 = windowOf(since(all, nowMs - 14 * DAY, nowMs - 7 * DAY))
    const delta = recent7.errorRate - previous7.errorRate
    const trend: DiagnosisTrend = recent7.sampleCount < 10 || previous7.sampleCount < 10 ? 'insufficient_data' : delta <= -10 ? 'improving' : delta >= 10 ? 'worsening' : 'stable'
    return {
      rangeMin,
      rangeMax: rangeMin + rangeSize - 1,
      lifetime: windowOf(all),
      recent30: windowOf(since(all, nowMs - 30 * DAY)),
      recent7,
      previous7,
      trend,
      confidence: confidenceOf(recent7.sampleCount)
    }
  }).sort((a, b) => {
    const priority = { worsening: 3, stable: 2, improving: 1, insufficient_data: 0 }
    return priority[b.trend] - priority[a.trend] || b.recent7.errorRate - a.recent7.errorRate
  })
  const hashSource = JSON.stringify({
    count: scoped.length,
    lifetime: windowOf(scoped),
    recent7: windowOf(recent7Records),
    ranges: rangeRows.map((r) => [r.rangeMin, r.lifetime.sampleCount, r.lifetime.errorCount, r.recent7.sampleCount, r.recent7.errorCount])
  })
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    module,
    lifetime: windowOf(scoped),
    recent30: windowOf(recent30Records),
    recent7: windowOf(recent7Records),
    previous7: windowOf(previous7Records),
    ranges: rangeRows,
    errorPatterns: errorPatterns(scoped),
    questionCountSinceLastAi: Math.max(0, scoped.length - (options.lastAiQuestionCount ?? 0)),
    dataHash: hashText(hashSource)
  }
}
