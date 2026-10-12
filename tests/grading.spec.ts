/**
 * 评分测试（§35.1 / §10.1）
 *
 * 规则：评分只根据「是否全对 + 总用时」，正确率不参与等级计算。
 */
import { describe, expect, it } from 'vitest'
import { gradeDescription, gradeLabel, gradeSession } from '@/services/grading'
import { GRADE_THRESHOLDS_MS } from '@/config/trainingConfig'

const seconds = (value: number): number => Math.round(value * 1000)

describe('gradeSession 边界（§35.1）', () => {
  it('10/10 + 59.99s → 优秀', () => {
    expect(gradeSession(seconds(59.99), 10, 10)).toBe('excellent')
  })

  it('10/10 + 60.00s → 优秀', () => {
    expect(gradeSession(seconds(60), 10, 10)).toBe('excellent')
  })

  it('10/10 + 60.01s → 良好', () => {
    expect(gradeSession(seconds(60.01), 10, 10)).toBe('good')
  })

  it('10/10 + 75.00s → 良好', () => {
    expect(gradeSession(seconds(75), 10, 10)).toBe('good')
  })

  it('10/10 + 75.01s → 合格', () => {
    expect(gradeSession(seconds(75.01), 10, 10)).toBe('pass')
  })

  it('10/10 + 90.00s → 合格', () => {
    expect(gradeSession(seconds(90), 10, 10)).toBe('pass')
  })

  it('10/10 + 90.01s → 加油', () => {
    expect(gradeSession(seconds(90.01), 10, 10)).toBe('encourage')
  })

  it('9/10 + 30s → 加油（存在错误题）', () => {
    expect(gradeSession(seconds(30), 9, 10)).toBe('encourage')
  })
})

describe('gradeSession 规则（§10.1）', () => {
  it('任意一道错误题一律加油，即使速度很快', () => {
    expect(gradeSession(seconds(20), 19, 20)).toBe('encourage')
    expect(gradeSession(seconds(50), 9, 10)).toBe('encourage')
    expect(gradeSession(seconds(70), 8, 10)).toBe('encourage')
  })

  it('全部正确时只由总用时决定等级', () => {
    expect(gradeSession(seconds(58.4), 10, 10)).toBe('excellent')
    expect(gradeSession(seconds(70), 10, 10)).toBe('good')
    expect(gradeSession(seconds(88), 10, 10)).toBe('pass')
    expect(gradeSession(seconds(95), 10, 10)).toBe('encourage')
  })

  it('正确率不参与等级计算：全对即按用时评级，与题量无关', () => {
    // 5/5 与 100/100 都是“全对”，等级只由用时决定
    expect(gradeSession(seconds(30), 5, 5)).toBe('excellent')
    expect(gradeSession(seconds(30), 100, 100)).toBe('excellent')
  })

  it('正确率 90% / 80% 不会被评为良好或合格', () => {
    expect(gradeSession(seconds(30), 9, 10)).toBe('encourage')
    expect(gradeSession(seconds(30), 8, 10)).toBe('encourage')
  })

  it('阈值常量与需求一致', () => {
    expect(GRADE_THRESHOLDS_MS).toEqual({ excellent: 60_000, good: 75_000, pass: 90_000 })
  })

  it('没有题目时不产生等级', () => {
    expect(gradeSession(0, 0, 0)).toBe('encourage')
  })

  it('等级文案', () => {
    expect(gradeLabel('excellent')).toBe('优秀')
    expect(gradeLabel('good')).toBe('良好')
    expect(gradeLabel('pass')).toBe('合格')
    expect(gradeLabel('encourage')).toBe('加油')
    expect(gradeDescription('excellent')).toContain('60 秒')
  })
})
