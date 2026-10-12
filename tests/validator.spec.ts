/**
 * 误差与答案校验测试（§35.2 / §7.3）
 */
import { describe, expect, it } from 'vitest'
import {
  checkAnswer,
  computeErrorRate,
  isWithinTolerance,
  normalizeAnswerInput,
  parseUserAnswer
} from '@/modules/arithmetic/five-divide-three/validator'
import { formatErrorRate } from '@/modules/arithmetic/five-divide-three/calculator'

describe('误差计算（§7.3）', () => {
  it('使用 |用户答案-正确答案| / |正确答案| × 100%', () => {
    expect(computeErrorRate(60.6, 60.65)).toBeCloseTo(0.0824, 4)
    expect(computeErrorRate(100, 100)).toBe(0)
    expect(computeErrorRate(97, 100)).toBeCloseTo(3, 10)
    expect(computeErrorRate(103, 100)).toBeCloseTo(3, 10)
  })

  it('误差格式化展示为百分比', () => {
    expect(formatErrorRate(0.0824)).toBe('0.08%')
    expect(formatErrorRate(null)).toBe('—')
  })

  it('correctAnswer 为 0 时的边界处理', () => {
    expect(computeErrorRate(0, 0)).toBe(0)
    expect(computeErrorRate(1, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('误差判定边界（§35.2）', () => {
  it('误差刚好等于允许误差 → 判定正确', () => {
    expect(isWithinTolerance(3, 3)).toBe(true)
    expect(checkAnswer('97', 100, 3).correct).toBe(true)
  })

  it('误差小于允许误差 → 判定正确', () => {
    expect(checkAnswer('98', 100, 3).correct).toBe(true)
    expect(checkAnswer('99.5', 100, 3).correct).toBe(true)
  })

  it('误差大于允许误差 → 判定错误', () => {
    expect(checkAnswer('96', 100, 3).correct).toBe(false)
    expect(checkAnswer('104', 100, 3).correct).toBe(false)
  })

  it('默认允许误差 3% 的实际题目判定', () => {
    const correctAnswer = 58231 / 317 // 183.6940...
    expect(checkAnswer('183.69', correctAnswer, 3).correct).toBe(true)
    expect(checkAnswer('183.7', correctAnswer, 3).correct).toBe(true)
    expect(checkAnswer('150', correctAnswer, 3).correct).toBe(false)
  })

  it('正数与小数均可正常判定', () => {
    expect(checkAnswer('60.65', 60.65, 3).correct).toBe(true)
    expect(checkAnswer('0.5', 0.5, 3).correct).toBe(true)
    expect(checkAnswer('+100', 100, 3).correct).toBe(true)
  })
})

describe('输入解析（§35.2 空输入 / 非法输入）', () => {
  it('空输入判定为错误且误差为 null', () => {
    const result = checkAnswer('', 100, 3)
    expect(result.correct).toBe(false)
    expect(result.errorRate).toBeNull()
    expect(result.userAnswer).toBeNull()
    expect(result.reason).toBe('empty')
  })

  it('只有空格的输入视为空输入', () => {
    expect(checkAnswer('   ', 100, 3).reason).toBe('empty')
  })

  it('非法输入判定为错误且误差为 null', () => {
    for (const raw of ['abc', '1.2.3', '--5', '3/4', '1,000', 'NaN', 'Infinity', 'E5']) {
      const result = checkAnswer(raw, 100, 3)
      expect(result.correct, `输入 ${raw} 应判定为错误`).toBe(false)
      expect(result.errorRate, `输入 ${raw} 的误差应为 null`).toBeNull()
      expect(result.reason).toBe('invalid')
    }
  })

  it('全角数字与全角小数点可被识别（手机输入法）', () => {
    expect(normalizeAnswerInput('１２３．５')).toBe('123.5')
    expect(parseUserAnswer('１２３．５')).toBe(123.5)
    expect(checkAnswer('１００', 100, 3).correct).toBe(true)
  })

  it('parseUserAnswer 基本行为', () => {
    expect(parseUserAnswer('')).toBeNull()
    expect(parseUserAnswer('0')).toBe(0)
    expect(parseUserAnswer('-5')).toBe(-5)
    expect(parseUserAnswer('.5')).toBe(0.5)
    expect(parseUserAnswer('12.')).toBe(12)
  })
})
