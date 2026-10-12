/**
 * 薄弱点分析测试（§14 / §15 / §16）
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeWeakPatterns,
  buildRangeStats,
  computeReinforcementWeight,
  divisorRangeOf,
  hasActiveReinforcement,
  isWeakCandidate,
  overallErrorRateOf,
  reinforcementTargets,
  totalReinforcementRatio,
  weakPatternSuggestion
} from '@/services/weakPattern'
import { DEFAULT_WEAK_PATTERN_CONFIG } from '@/config/trainingConfig'
import { makeQuestionRecord } from './fixtures'
import type { QuestionRecord, WeakPattern } from '@/types'

const config = DEFAULT_WEAK_PATTERN_CONFIG

/**
 * 生成 N 道指定除数范围的题目，其中 errors 道错误。
 * 错误题放在序列末尾（即“最近”的题目），便于验证近期趋势判定。
 */
function rangeRecords(
  rangeMin: number,
  rangeMax: number,
  count: number,
  errors: number,
  sessionId = 'session-1'
): QuestionRecord[] {
  return Array.from({ length: count }, (_, index) =>
    makeQuestionRecord({
      divisor: Math.min(rangeMin + (index % (rangeMax - rangeMin + 1)), rangeMax),
      correct: index < count - errors,
      sessionId
    })
  )
}

describe('除数范围划分（§15）', () => {
  it('默认按百位划分', () => {
    expect(divisorRangeOf(317, 100)).toEqual({ min: 300, max: 399 })
    expect(divisorRangeOf(800, 100)).toEqual({ min: 800, max: 899 })
    expect(divisorRangeOf(999, 100)).toEqual({ min: 900, max: 999 })
  })

  it('按范围分桶统计', () => {
    const records = [
      makeQuestionRecord({ divisor: 123, correct: true }),
      makeQuestionRecord({ divisor: 145, correct: false }),
      makeQuestionRecord({ divisor: 876, correct: false })
    ]
    const stats = buildRangeStats(records, 100)
    expect(stats).toHaveLength(2)
    expect(stats[0]).toMatchObject({ rangeMin: 100, rangeMax: 199, sampleCount: 2, errorCount: 1, errorRate: 50 })
    expect(stats[1]).toMatchObject({ rangeMin: 800, rangeMax: 899, sampleCount: 1, errorCount: 1, errorRate: 100 })
  })

  it('整体错误率', () => {
    const records = rangeRecords(300, 399, 10, 2)
    expect(overallErrorRateOf(records)).toBeCloseTo(20, 6)
  })
})

describe('不允许过早判定（§14.2）', () => {
  it('样本数量 < 10 时不判定为薄弱点', () => {
    const records = rangeRecords(800, 899, 9, 5)
    const patterns = analyzeWeakPatterns(records, [], config)
    expect(patterns).toHaveLength(0)
  })

  it('错误数量 < 3 时不判定为薄弱点', () => {
    const records = rangeRecords(800, 899, 20, 2)
    const patterns = analyzeWeakPatterns(records, [], config)
    expect(patterns).toHaveLength(0)
  })

  it('isWeakCandidate 需要同时满足样本数、错误数与相对倍数', () => {
    const stat = { rangeMin: 800, rangeMax: 899, sampleCount: 10, errorCount: 3, errorRate: 30 }
    expect(isWeakCandidate(stat, 4, config)).toBe(true)
    expect(isWeakCandidate({ ...stat, sampleCount: 9 }, 4, config)).toBe(false)
    expect(isWeakCandidate({ ...stat, errorCount: 2 }, 4, config)).toBe(false)
    expect(isWeakCandidate({ ...stat, errorRate: 5 }, 4, config)).toBe(false)
  })
})

describe('薄弱点发现与比较（§14.1 / §14.3）', () => {
  it('能发现明显高于整体错误率的范围', () => {
    const records = [
      ...rangeRecords(300, 399, 60, 2), // 3.3%
      ...rangeRecords(800, 899, 31, 3) // 9.7%
    ]
    const patterns = analyzeWeakPatterns(records, [], config)
    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toMatchObject({
      rangeMin: 800,
      rangeMax: 899,
      sampleCount: 31,
      errorCount: 3,
      status: 'active'
    })
    expect(patterns[0].errorRate).toBeCloseTo(9.68, 1)
    expect(patterns[0].reinforcementWeight).toBeGreaterThan(0)
    expect(patterns[0].reinforcementWeight).toBeLessThanOrEqual(config.maxReinforcementWeight)
  })

  it('错误率与整体持平时不判定为薄弱点', () => {
    const records = [...rangeRecords(300, 399, 20, 2), ...rangeRecords(800, 899, 20, 2)]
    const patterns = analyzeWeakPatterns(records, [], config)
    expect(patterns).toHaveLength(0)
  })

  it('强化权重随错误率倍数增长并封顶', () => {
    const low = computeReinforcementWeight(4, 4, config)
    const mid = computeReinforcementWeight(8, 4, config)
    const high = computeReinforcementWeight(50, 4, config)
    expect(low).toBe(0)
    expect(mid).toBeGreaterThan(0)
    expect(high).toBe(config.maxReinforcementWeight)
    expect(mid).toBeLessThan(high)
  })

  it('生成建议文案', () => {
    const records = [...rangeRecords(300, 399, 60, 2), ...rangeRecords(800, 899, 31, 3)]
    const [pattern] = analyzeWeakPatterns(records, [], config)
    expect(weakPatternSuggestion(pattern)).toContain('800–899')
    expect(weakPatternSuggestion(pattern)).toContain('建议')
  })
})

describe('薄弱点改善后降低强化（§16.2）', () => {
  it('近期错误率明显下降 → improving 且权重折减', () => {
    const records = [...rangeRecords(300, 399, 60, 2), ...rangeRecords(800, 899, 31, 6)]
    const [initial] = analyzeWeakPatterns(records, [], config)
    expect(initial.status).toBe('active')

    // 最近 20 道该范围题目全部正确 → 近期错误率 0
    const improved = [...records, ...rangeRecords(800, 899, 20, 0, 'session-2')]
    const [next] = analyzeWeakPatterns(improved, [initial], config)
    expect(next.status).toBe('improving')
    expect(next.reinforcementWeight).toBeLessThan(initial.reinforcementWeight)
  })

  it('错误率回落到整体水平 → resolved 且权重为 0', () => {
    const initialRecords = [...rangeRecords(300, 399, 60, 2), ...rangeRecords(800, 899, 31, 6)]
    const [initial] = analyzeWeakPatterns(initialRecords, [], config)
    expect(initial.status).toBe('active')

    // 该范围新增 40 题仅 1 题错误，且最近 20 题全部正确 → 不再构成薄弱点
    const fixed = [...initialRecords, ...rangeRecords(800, 899, 40, 1, 'session-2')]
    const [next] = analyzeWeakPatterns(fixed, [{ ...initial, status: 'improving' }], config)
    expect(next.status).toBe('resolved')
    expect(next.reinforcementWeight).toBe(0)
    expect(reinforcementTargets([next], config)).toHaveLength(0)
  })

  it('resolved 的薄弱点不再参与强化出题', () => {
    const resolved: WeakPattern = {
      id: 'five-divide-three:divisor_range:800-899',
      module: 'five-divide-three',
      dimension: 'divisor_range',
      rangeMin: 800,
      rangeMax: 899,
      sampleCount: 40,
      errorCount: 4,
      errorRate: 10,
      overallErrorRate: 4,
      reinforcementWeight: 0,
      status: 'resolved',
      recentSampleCount: 20,
      recentErrorRate: 0,
      previousErrorRate: 20,
      trend: 'down',
      updatedAt: new Date().toISOString()
    }
    expect(reinforcementTargets([resolved], config)).toHaveLength(0)
    expect(hasActiveReinforcement([resolved], config)).toBe(false)
  })
})

describe('强化出题约束（§16.1）', () => {
  const patterns: WeakPattern[] = [
    {
      id: 'a',
      module: 'five-divide-three',
      dimension: 'divisor_range',
      rangeMin: 800,
      rangeMax: 899,
      sampleCount: 40,
      errorCount: 8,
      errorRate: 20,
      overallErrorRate: 4,
      reinforcementWeight: 0.3,
      status: 'active',
      recentSampleCount: 20,
      recentErrorRate: 20,
      previousErrorRate: 20,
      trend: 'flat',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'b',
      module: 'five-divide-three',
      dimension: 'divisor_range',
      rangeMin: 600,
      rangeMax: 699,
      sampleCount: 40,
      errorCount: 8,
      errorRate: 20,
      overallErrorRate: 4,
      reinforcementWeight: 0.3,
      status: 'active',
      recentSampleCount: 20,
      recentErrorRate: 20,
      previousErrorRate: 20,
      trend: 'flat',
      updatedAt: new Date().toISOString()
    }
  ]

  it('合计强化占比不超过配置上限（绝不允许 100% 薄弱题）', () => {
    expect(totalReinforcementRatio(patterns, config)).toBeLessThanOrEqual(config.maxReinforcementRatio)
    expect(totalReinforcementRatio(patterns, config)).toBeLessThan(1)
  })

  it('关闭强化开关后不再产生强化目标', () => {
    const disabled = { ...config, enableReinforcement: false }
    expect(reinforcementTargets(patterns, disabled)).toHaveLength(0)
    expect(totalReinforcementRatio(patterns, disabled)).toBe(0)
  })

  it('阈值可配置：提高 ratioThreshold 后同一数据不再判定为薄弱', () => {
    const records = [...rangeRecords(300, 399, 60, 2), ...rangeRecords(800, 899, 31, 3)]
    expect(analyzeWeakPatterns(records, [], config)).toHaveLength(1)
    expect(analyzeWeakPatterns(records, [], { ...config, ratioThreshold: 10 })).toHaveLength(0)
  })
})
