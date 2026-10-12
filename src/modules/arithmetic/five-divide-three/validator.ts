/**
 * 答案校验与误差计算（§7.3 / §34 validator）。
 *
 * errorRate = |userAnswer - correctAnswer| / |correctAnswer| × 100%
 * errorRate <= allowedErrorRate  → correct = true
 *
 * 说明：
 * - 空输入、非法输入一律判定为错误，errorRate 记为 null；
 * - 浮点边界（例如刚好 3%）使用极小容差比较，保证 “误差刚好等于允许误差” 判定正确。
 */

import { roundTo } from './calculator'
import type { AnswerCheck } from './types'

/** 误差比较容差 */
const EPSILON = 1e-9

/** 误差百分比的存储精度 */
const ERROR_RATE_DECIMALS = 4

/** 全角字符转半角，便于手机输入法输入 */
export function normalizeAnswerInput(raw: string): string {
  return raw
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\uFF0E/g, '.')
    .replace(/\u3002/g, '.')
    .replace(/\uFF0D/g, '-')
    .replace(/[\s\u00A0\u3000]/g, '')
}

/**
 * 解析用户输入。
 * 合法：可选正负号的整数或小数；其余（空、含字母、多个小数点等）返回 null。
 */
export function parseUserAnswer(raw: string): number | null {
  if (typeof raw !== 'string') return null
  const normalized = normalizeAnswerInput(raw)
  if (normalized === '') return null
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return value
}

/** 误差百分比；correctAnswer 为 0 时，只要用户答案非 0 则视为无穷大误差 */
export function computeErrorRate(userAnswer: number, correctAnswer: number): number {
  if (!Number.isFinite(userAnswer) || !Number.isFinite(correctAnswer)) return Number.NaN
  if (correctAnswer === 0) return userAnswer === 0 ? 0 : Number.POSITIVE_INFINITY
  return (Math.abs(userAnswer - correctAnswer) / Math.abs(correctAnswer)) * 100
}

/** 误差是否在允许范围内 */
export function isWithinTolerance(errorRate: number | null, allowedErrorRate: number): boolean {
  if (errorRate === null || Number.isNaN(errorRate)) return false
  if (!Number.isFinite(errorRate)) return false
  return errorRate <= allowedErrorRate + EPSILON
}

/** 完整判定：解析 → 计算误差 → 判定正确性 */
export function checkAnswer(
  raw: string,
  correctAnswer: number,
  allowedErrorRate: number
): AnswerCheck {
  const normalized = normalizeAnswerInput(raw ?? '')
  const userAnswer = parseUserAnswer(raw ?? '')

  if (normalized === '') {
    return {
      raw: raw ?? '',
      userAnswer: null,
      correctAnswer,
      errorRate: null,
      correct: false,
      reason: 'empty'
    }
  }

  if (userAnswer === null) {
    return {
      raw: raw ?? '',
      userAnswer: null,
      correctAnswer,
      errorRate: null,
      correct: false,
      reason: 'invalid'
    }
  }

  const errorRate = roundTo(computeErrorRate(userAnswer, correctAnswer), ERROR_RATE_DECIMALS)
  const correct = isWithinTolerance(errorRate, allowedErrorRate)

  return {
    raw: raw ?? '',
    userAnswer,
    correctAnswer,
    errorRate,
    correct,
    reason: correct ? 'ok' : 'out_of_tolerance'
  }
}
