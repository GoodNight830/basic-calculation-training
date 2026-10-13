import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLocalDiagnosis } from '@/services/diagnosis'
import { formatAiReportText, requestAiReport, validateAiReport } from '@/services/aiAnalysis'
import type { QuestionRecord } from '@/types'
import { normalizeSettings } from '@/db/settings'
import { DEFAULT_APP_SETTINGS } from '@/config/trainingConfig'

afterEach(() => vi.unstubAllGlobals())

function record(index: number, divisor: number, correct: boolean, daysAgo: number, now: Date): QuestionRecord {
  const createdAt = new Date(now.getTime() - daysAgo * 86_400_000).toISOString()
  return {
    id: `q-${index}`, sessionId: 's', module: 'five-divide-three', mode: 'training', question: `10000 / ${divisor}`,
    questionIndex: index, dividend: 10000, divisor, correctAnswer: 10000 / divisor,
    rawAnswer: correct ? '1' : '999', userAnswer: correct ? 10000 / divisor : 999,
    errorRate: correct ? 0 : 99, correct, elapsedMs: 2000 + index,
    startedAt: createdAt, submittedAt: createdAt, origin: 'normal', weakRange: null, createdAt
  }
}

describe('local diagnosis', () => {
  it('keeps lifetime context while detecting a recent range shift', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const records: QuestionRecord[] = []
    for (let i = 0; i < 20; i += 1) records.push(record(i, 150, i < 14, 2, now))
    for (let i = 0; i < 20; i += 1) records.push(record(20 + i, 150, i < 4, 9, now))
    for (let i = 0; i < 20; i += 1) records.push(record(40 + i, 250, i < 6, 2, now))
    for (let i = 0; i < 20; i += 1) records.push(record(60 + i, 250, i < 16, 9, now))
    const result = buildLocalDiagnosis(records, 'five-divide-three', { now })
    expect(result.ranges.find((r) => r.rangeMin === 100)?.trend).toBe('improving')
    expect(result.ranges.find((r) => r.rangeMin === 200)?.trend).toBe('worsening')
    expect(result.lifetime.sampleCount).toBe(80)
  })

  it('does not claim a trend below ten recent samples', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const result = buildLocalDiagnosis([record(1, 434, false, 1, now)], 'five-divide-three', { now })
    expect(result.ranges[0]?.trend).toBe('insufficient_data')
    expect(result.ranges[0]?.confidence).toBe('insufficient')
  })

  it('cross-tabulates error types by divisor range', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const records = [
      record(1, 210, false, 1, now), record(2, 220, false, 2, now), record(3, 220, false, 3, now),
      record(4, 430, false, 1, now), record(5, 440, true, 1, now)
    ]
    const result = buildLocalDiagnosis(records, 'five-divide-three', { now })
    const range200 = result.ranges.find((range) => range.rangeMin === 200)
    const range400 = result.ranges.find((range) => range.rangeMin === 400)
    const large200 = range200?.errorPatterns.find((pattern) => pattern.type === 'answer_too_large')
    const large400 = range400?.errorPatterns.find((pattern) => pattern.type === 'answer_too_large')
    expect(large200).toMatchObject({ count: 3, recent7Count: 3, recent30Count: 3, topDivisors: [220, 210] })
    expect(large200?.rate).toBe(100)
    expect(large400?.count).toBe(1)
  })
})

describe('AI report validation', () => {
  it('retries once with a larger output budget when JSON is truncated', async () => {
    const diagnosis = buildLocalDiagnosis([], 'five-divide-three', { now: new Date('2026-09-27T12:00:00.000Z') })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '{"summary":"未完成"' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: '数据有限', findings: [], nextPlan: [], uncertainty: [] }) } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const report = await requestAiReport({
      ...DEFAULT_APP_SETTINGS.ai,
      enabled: true,
      baseUrl: 'https://example.com/v1',
      model: 'test-model',
      apiKey: 'test-key',
      wireApi: 'chat_completions',
      transport: 'direct',
      consentToUpload: true,
      maxOutputTokens: 1000
    }, diagnosis)

    expect(report.summary).toBe('数据有限')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as { max_tokens: number }
    expect(retryBody.max_tokens).toBe(2000)
  })

  it('localizes internal analysis terms for display', () => {
    const internalTerms = 'empty invalid answer_too_large answer_too_small slow_correct slow_wrong repeat_wrong recent30 recent7 previous7 lifetime sampleCount errorCount errorRate medianElapsedMs p75ElapsedMs questionCountSinceLastAi errorPatterns rangeMin rangeMax ranges accuracy count trend confidence insufficient insufficient_data strength weakness low medium high schemaVersion generatedAt dataHash module improving worsening stable'
    const localized = formatAiReportText(internalTerms)
    for (const term of internalTerms.split(' ')) expect(localized).not.toMatch(new RegExp(`\\b${term}\\b`, 'i'))
    expect(localized).toContain('空答案')
    expect(localized).toContain('无效输入')
    expect(localized).toContain('答案偏大')
    expect(localized).toContain('最近30天')
  })

  it('neutralizes unsafe AI language instead of rejecting the report', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const diagnosis = buildLocalDiagnosis([], 'five-divide-three', { now })
    const report = validateAiReport({ summary: '你一定非常优秀', findings: [], nextPlan: [], uncertainty: [] }, diagnosis)
    expect(report.summary).toBe('你可能表现较好')
    expect(report.uncertainty).toContain('系统已将缺少数据依据的绝对化或恭维措辞改为中性表述。')
  })
  it('downgrades confident claims to insufficient_data when local samples are insufficient', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const diagnosis = buildLocalDiagnosis([record(1, 434, false, 1, now)], 'five-divide-three', { now })
    const report = validateAiReport({
      summary: '存在问题', uncertainty: [], nextPlan: [], findings: [{
        type: 'weakness', title: '范围较弱', evidence: '出现错误', sampleCount: 1,
        confidence: 'high', limitation: '样本有限', rangeMin: 400, rangeMax: 499
      }]
    }, diagnosis)
    expect(report.findings[0]?.type).toBe('insufficient_data')
    expect(report.findings[0]?.confidence).toBe('low')
    expect(report.uncertainty).toContain('系统已按样本量规则校正了部分发现项的可信度或结论类型。')
  })

  it('corrects a mismatched sample count to local statistics instead of failing', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    // 本地只有 1 个样本，但模型填了 30（长期口径）
    const diagnosis = buildLocalDiagnosis([record(1, 434, false, 1, now)], 'five-divide-three', { now })
    const report = validateAiReport({
      summary: '存在问题', uncertainty: [], nextPlan: [], findings: [{
        type: 'weakness', title: '范围较弱', evidence: '出现错误', sampleCount: 30,
        confidence: 'high', limitation: '样本有限', rangeMin: 400, rangeMax: 499
      }]
    }, diagnosis)
    expect(report.findings[0]?.sampleCount).toBe(1)
    expect(report.uncertainty).toContain('系统已按本地统计校正了部分发现项引用的样本量。')
  })

  it('corrects an invalid finding type to a valid enum instead of failing', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const diagnosis = buildLocalDiagnosis([record(1, 434, false, 1, now)], 'five-divide-three', { now })
    const report = validateAiReport({
      summary: '存在问题', uncertainty: [], nextPlan: [], findings: [{
        type: '薄弱', title: '范围较弱', evidence: '出现错误', sampleCount: 1,
        confidence: 'high', limitation: '样本有限', rangeMin: 400, rangeMax: 499
      }]
    }, diagnosis)
    expect(report.findings[0]?.type).toBe('weakness')
    expect(report.uncertainty).toContain('系统已纠正了部分发现项的类型标注。')
  })

  it('neutralizes unsupported flattery and absolute language', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const diagnosis = buildLocalDiagnosis([], 'five-divide-three', { now })
    const report = validateAiReport({ summary: '你非常优秀', uncertainty: [], nextPlan: [], findings: [] }, diagnosis)
    expect(report.summary).toBe('你表现较好')
  })

  it('drops unverifiable plan ranges without discarding the report', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const diagnosis = buildLocalDiagnosis([record(1, 434, false, 1, now)], 'five-divide-three', { now })
    const report = validateAiReport({
      summary: '当前样本有限', findings: [], uncertainty: [],
      nextPlan: [{ action: '训练不存在的范围', rangeMin: 9000, rangeMax: 9999, suggestedQuestionCount: 10, suggestedRatio: 0.2, reevaluateAfterQuestions: 10 }]
    }, diagnosis)
    expect(report.nextPlan).toEqual([])
    expect(report.uncertainty).toContain('系统已移除无法由本地统计验证的范围或训练比例。')
  })
})

describe('AI provider settings', () => {
  it('forces the DeepSeek official endpoint to Chat Completions', () => {
    const settings = normalizeSettings({
      ...DEFAULT_APP_SETTINGS,
      ai: {
        ...DEFAULT_APP_SETTINGS.ai,
        provider: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1/',
        model: 'deepseek-chat',
        wireApi: 'responses'
      }
    })
    expect(settings.ai.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(settings.ai.wireApi).toBe('chat_completions')
  })
})
