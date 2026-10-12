/**
 * 个人薄弱点分析（§14 / §15 / §16 / §34 weakPattern）。
 *
 * 设计要点：
 * - 不采用传统难度系统，而是基于用户历史错误情况发现薄弱数字范围（§2.1）；
 * - 样本不足时绝不判定薄弱（§14.2：sampleCount >= 10，且 errorCount >= 3）；
 * - 与个人整体错误率比较（§14.3：rangeErrorRate / overallErrorRate）；
 * - 所有阈值来自 WeakPatternConfig，不写死在 UI 中；
 * - 薄弱点改善后自动降低强化权重，直至恢复普通随机训练（§16.2）。
 */

import { DEFAULT_WEAK_PATTERN_CONFIG, type WeakPatternConfig } from '@/config/trainingConfig'
import type { QuestionRecord, WeakPattern, WeakPatternStatus, WeakTarget } from '@/types'
import { roundTo } from '@/modules/arithmetic/five-divide-three/calculator'

/** 除数所属范围（默认按百位划分：100-199 / 200-299 ...） */
export function divisorRangeOf(divisor: number, rangeSize: number): { min: number; max: number } {
  const min = Math.floor(divisor / rangeSize) * rangeSize
  return { min, max: min + rangeSize - 1 }
}

export function patternIdFor(moduleId: string, dimension: string, min: number, max: number): string {
  return `${moduleId}:${dimension}:${min}-${max}`
}

export interface RangeStat {
  rangeMin: number
  rangeMax: number
  sampleCount: number
  errorCount: number
  errorRate: number
}

/** 整体错误率（%） */
export function overallErrorRateOf(records: readonly QuestionRecord[]): number {
  if (records.length === 0) return 0
  const errors = records.filter((r) => !r.correct).length
  return (errors / records.length) * 100
}

/** 按除数范围分桶统计 */
export function buildRangeStats(
  records: readonly QuestionRecord[],
  rangeSize: number = DEFAULT_WEAK_PATTERN_CONFIG.rangeSize
): RangeStat[] {
  const buckets = new Map<string, RangeStat>()

  for (const record of records) {
    if (!Number.isFinite(record.divisor) || record.divisor <= 0) continue
    const { min, max } = divisorRangeOf(record.divisor, rangeSize)
    const key = `${min}-${max}`
    const bucket = buckets.get(key) ?? { rangeMin: min, rangeMax: max, sampleCount: 0, errorCount: 0, errorRate: 0 }
    bucket.sampleCount += 1
    if (!record.correct) bucket.errorCount += 1
    buckets.set(key, bucket)
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      errorRate: bucket.sampleCount > 0 ? (bucket.errorCount / bucket.sampleCount) * 100 : 0
    }))
    .sort((a, b) => a.rangeMin - b.rangeMin)
}

/** 强化权重：以整体错误率（或不低于基线值）为基准归一化（§16） */
export function computeReinforcementWeight(
  rangeErrorRate: number,
  overallErrorRate: number,
  config: WeakPatternConfig = DEFAULT_WEAK_PATTERN_CONFIG
): number {
  if (!(rangeErrorRate > 0)) return 0
  const baseline = Math.max(overallErrorRate, config.minBaselineErrorRate)
  if (baseline <= 0) return config.maxReinforcementWeight
  const ratio = rangeErrorRate / baseline
  if (ratio <= 1) return 0
  const span = Math.max(config.strongRatio - 1, 1e-6)
  const normalized = Math.min(1, Math.max(0, (ratio - 1) / span))
  return roundTo(config.maxReinforcementWeight * normalized, 4)
}

/** 判定某范围是否构成薄弱点（样本阈值 + 错误数阈值 + 相对整体错误率倍数） */
export function isWeakCandidate(
  stat: RangeStat,
  overallErrorRate: number,
  config: WeakPatternConfig = DEFAULT_WEAK_PATTERN_CONFIG
): boolean {
  if (stat.sampleCount < config.minSampleCount) return false
  if (stat.errorCount < config.minErrorCount) return false
  const baseline = Math.max(overallErrorRate, config.minBaselineErrorRate)
  if (baseline <= 0) return stat.errorRate > 0
  return stat.errorRate / baseline >= config.ratioThreshold
}

/**
 * 分析薄弱点。
 *
 * @param records 全部题目级原始数据（可包含多个模块，函数内部按 moduleId 过滤）
 * @param previousPatterns 上次分析结果，用于趋势与权重衰减
 * @param config 可配置阈值
 * @param moduleId 模块标识
 */
export function analyzeWeakPatterns(
  records: readonly QuestionRecord[],
  previousPatterns: readonly WeakPattern[] = [],
  config: WeakPatternConfig = DEFAULT_WEAK_PATTERN_CONFIG,
  moduleId = 'five-divide-three'
): WeakPattern[] {
  const scoped = records.filter((r) => r.module === moduleId)
  const overallErrorRate = overallErrorRateOf(scoped)
  const stats = buildRangeStats(scoped, config.rangeSize)
  const previousById = new Map(previousPatterns.map((p) => [p.id, p]))
  const nowIso = new Date().toISOString()
  const result: WeakPattern[] = []

  for (const stat of stats) {
    const id = patternIdFor(moduleId, 'divisor_range', stat.rangeMin, stat.rangeMax)
    const previous = previousById.get(id) ?? null
    const recent = recentRecordsInRange(scoped, stat.rangeMin, stat.rangeMax, config.recentWindowSize)
    const recentSampleCount = recent.length
    const recentErrorRate =
      recentSampleCount > 0
        ? (recent.filter((r) => !r.correct).length / recentSampleCount) * 100
        : 0

    const qualified = isWeakCandidate(stat, overallErrorRate, config)

    let status: WeakPatternStatus
    let weight: number

    if (qualified) {
      status = 'active'
      weight = computeReinforcementWeight(stat.errorRate, overallErrorRate, config)
      const improvedRecently =
        recentSampleCount > 0 && recentErrorRate < stat.errorRate * config.improvingDropRatio
      if (improvedRecently) {
        status = 'improving'
        weight = roundTo(weight * config.improvingWeightFactor, 4)
      }
    } else if (previous && previous.status !== 'resolved') {
      const resolvedNow =
        stat.sampleCount >= config.minSampleCount &&
        recentSampleCount > 0 &&
        recentErrorRate <= overallErrorRate
      if (resolvedNow) {
        status = 'resolved'
        weight = 0
      } else {
        status = 'improving'
        weight = roundTo(
          Math.min(previous.reinforcementWeight * config.improvingWeightFactor, config.maxReinforcementWeight),
          4
        )
      }
    } else {
      // 样本不足或错误率与整体持平：不构成薄弱点，也不产生记录
      continue
    }

    result.push({
      id,
      module: moduleId,
      dimension: 'divisor_range',
      rangeMin: stat.rangeMin,
      rangeMax: stat.rangeMax,
      sampleCount: stat.sampleCount,
      errorCount: stat.errorCount,
      errorRate: roundTo(stat.errorRate, 2),
      overallErrorRate: roundTo(overallErrorRate, 2),
      reinforcementWeight: weight,
      status,
      recentSampleCount,
      recentErrorRate: roundTo(recentErrorRate, 2),
      previousErrorRate: previous ? previous.errorRate : null,
      trend: resolveTrend(previous, stat.errorRate),
      updatedAt: nowIso
    })
  }

  return result.sort((a, b) => b.reinforcementWeight - a.reinforcementWeight || a.rangeMin - b.rangeMin)
}

function recentRecordsInRange(
  records: readonly QuestionRecord[],
  rangeMin: number,
  rangeMax: number,
  windowSize: number
): QuestionRecord[] {
  return records
    .filter((r) => r.divisor >= rangeMin && r.divisor <= rangeMax)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-Math.max(1, windowSize))
}

function resolveTrend(previous: WeakPattern | null, currentErrorRate: number): 'up' | 'down' | 'flat' {
  if (!previous) return 'flat'
  const delta = currentErrorRate - previous.errorRate
  if (delta <= -0.5) return 'down'
  if (delta >= 0.5) return 'up'
  return 'flat'
}

/**
 * 生成强化出题目标（§16）。
 * 只返回仍处于强化状态且权重 > 0 的薄弱点；启用开关关闭时返回空数组。
 */
export function reinforcementTargets(
  patterns: readonly WeakPattern[],
  config: WeakPatternConfig = DEFAULT_WEAK_PATTERN_CONFIG
): WeakTarget[] {
  if (!config.enableReinforcement) return []
  return patterns
    .filter((p) => p.status !== 'resolved' && p.reinforcementWeight > 0)
    .map((p) => ({
      patternId: p.id,
      rangeMin: p.rangeMin,
      rangeMax: p.rangeMax,
      weight: Math.min(p.reinforcementWeight, config.maxReinforcementWeight)
    }))
}

/** 薄弱点合计出题占比（受 §16.1 约束，最高 maxReinforcementRatio） */
export function totalReinforcementRatio(
  patterns: readonly WeakPattern[],
  config: WeakPatternConfig = DEFAULT_WEAK_PATTERN_CONFIG
): number {
  const total = reinforcementTargets(patterns, config).reduce((sum, t) => sum + t.weight, 0)
  return Math.min(total, config.maxReinforcementRatio)
}

/** 是否处于定向强化状态（设置页与首页提示用） */
export function hasActiveReinforcement(
  patterns: readonly WeakPattern[],
  config: WeakPatternConfig = DEFAULT_WEAK_PATTERN_CONFIG
): boolean {
  return reinforcementTargets(patterns, config).length > 0
}

/** 生成薄弱点建议文案（§14.1） */
export function weakPatternSuggestion(pattern: WeakPattern): string {
  if (pattern.status === 'resolved') {
    return `${pattern.rangeMin}–${pattern.rangeMax} 除数错误率已回落到整体水平，已停止强化。`
  }
  if (pattern.status === 'improving') {
    return `${pattern.rangeMin}–${pattern.rangeMax} 除数错误率正在改善，强化权重已降低。`
  }
  return `你的 ${pattern.rangeMin}–${pattern.rangeMax} 除数题错误率明显高于整体水平（${pattern.errorRate.toFixed(
    1
  )}% vs ${pattern.overallErrorRate.toFixed(1)}%），建议近期增加该范围训练。`
}
