/**
 * 题目生成器测试（§7.1 / §7.2 / §16）
 */
import { describe, expect, it } from 'vitest'
import { FiveDivideThreeGenerator } from '@/modules/arithmetic/five-divide-three/generator'
import { createSeededRng } from '@/modules/arithmetic/random'
import { DIVIDEND_MAX, DIVIDEND_MIN, DIVISOR_MAX, DIVISOR_MIN } from '@/modules/arithmetic/five-divide-three/types'
import { exactQuotient } from '@/modules/arithmetic/five-divide-three/calculator'

const generator = new FiveDivideThreeGenerator()

describe('五除三题目生成（§7.1）', () => {
  it('被除数必须是五位数、除数必须是三位数', () => {
    const questions = generator.generate({ count: 500, rng: createSeededRng(20260923) })
    expect(questions).toHaveLength(500)
    for (const question of questions) {
      expect(question.dividend).toBeGreaterThanOrEqual(DIVIDEND_MIN)
      expect(question.dividend).toBeLessThanOrEqual(DIVIDEND_MAX)
      expect(question.divisor).toBeGreaterThanOrEqual(DIVISOR_MIN)
      expect(question.divisor).toBeLessThanOrEqual(DIVISOR_MAX)
      expect(question.divisor).not.toBe(0)
      expect(Number.isInteger(question.dividend)).toBe(true)
      expect(Number.isInteger(question.divisor)).toBe(true)
    }
  })

  it('正确答案等于精确商并随题目保存（§20）', () => {
    const [question] = generator.generate({ count: 1, rng: createSeededRng(1) })
    expect(question.correctAnswer).toBeCloseTo(exactQuotient(question.dividend, question.divisor), 12)
    expect(question.text).toBe(`${question.dividend} ÷ ${question.divisor}`)
  })

  it('同一训练组内不出现完全重复题目', () => {
    const questions = generator.generate({ count: 300, rng: createSeededRng(7) })
    const keys = new Set(questions.map((q) => `${q.dividend}:${q.divisor}`))
    expect(keys.size).toBe(questions.length)
  })

  it('避免与 excludeKeys 中的历史题目重复', () => {
    const first = generator.generate({ count: 50, rng: createSeededRng(11) })
    const exclude = new Set(first.map((q) => `${q.dividend}:${q.divisor}`))
    const second = generator.generate({ count: 50, rng: createSeededRng(12), excludeKeys: exclude })
    for (const question of second) {
      expect(exclude.has(`${question.dividend}:${question.divisor}`)).toBe(false)
    }
  })

  it('随机种子可复现', () => {
    const a = generator.generate({ count: 20, rngSeed: 42 })
    const b = generator.generate({ count: 20, rngSeed: 42 })
    expect(a.map((q) => q.text)).toEqual(b.map((q) => q.text))
  })

  it('count 为 0 或负数时返回空数组', () => {
    expect(generator.generate({ count: 0 })).toHaveLength(0)
    expect(generator.generate({ count: -5 })).toHaveLength(0)
  })
})

describe('薄弱点定向强化（§16）', () => {
  const target = { patternId: 'p1', rangeMin: 800, rangeMax: 899, weight: 0.35 }

  it('薄弱范围内生成的除数落在强化范围内', () => {
    const questions = generator.generate({
      count: 300,
      rng: createSeededRng(99),
      weakTargets: [target],
      maxWeakRatio: 1
    })
    const weak = questions.filter((q) => q.origin === 'weak')
    expect(weak.length).toBeGreaterThan(0)
    for (const question of weak) {
      expect(question.divisor).toBeGreaterThanOrEqual(800)
      expect(question.divisor).toBeLessThanOrEqual(899)
      expect(question.weakRange).toEqual({ min: 800, max: 899 })
    }
  })

  it('不允许 100% 都是薄弱题（§16.1）', () => {
    const questions = generator.generate({
      count: 2000,
      rng: createSeededRng(2026),
      weakTargets: [target],
      maxWeakRatio: 0.35
    })
    const weakRatio = questions.filter((q) => q.origin === 'weak').length / questions.length
    expect(weakRatio).toBeGreaterThan(0.2)
    expect(weakRatio).toBeLessThan(0.5)
    // 普通随机题目仍然存在
    expect(questions.some((q) => q.origin === 'normal')).toBe(true)
  })

  it('maxWeakRatio 为 0 时不生成薄弱题', () => {
    const questions = generator.generate({
      count: 200,
      rng: createSeededRng(5),
      weakTargets: [target],
      maxWeakRatio: 0
    })
    expect(questions.every((q) => q.origin === 'normal')).toBe(true)
  })

  it('没有薄弱点时全部为普通随机题', () => {
    const questions = generator.generate({ count: 100, rng: createSeededRng(3) })
    expect(questions.every((q) => q.origin === 'normal' && q.weakRange === null)).toBe(true)
  })

  it('权重为 0 的薄弱目标被忽略', () => {
    const questions = generator.generate({
      count: 100,
      rng: createSeededRng(4),
      weakTargets: [{ patternId: 'p', rangeMin: 800, rangeMax: 899, weight: 0 }],
      maxWeakRatio: 1
    })
    expect(questions.every((q) => q.origin === 'normal')).toBe(true)
  })
})
