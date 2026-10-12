/** 五除三计算与格式化（§34 calculator） */

import { ANSWER_DECIMALS } from './types'

/** 精确商 */
export function exactQuotient(dividend: number, divisor: number): number {
  if (!Number.isFinite(dividend) || !Number.isFinite(divisor) || divisor === 0) return Number.NaN
  return dividend / divisor
}

/** 四舍五入到指定小数位 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor
}

/** 格式化为固定小数位字符串 */
export function formatNumber(value: number | null, decimals = ANSWER_DECIMALS): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toFixed(decimals)
}

/** 题目文本 */
export function buildQuestionText(dividend: number, divisor: number): string {
  return `${dividend} ÷ ${divisor}`
}

/** 误差百分比格式化，例如 0.08% */
export function formatErrorRate(errorRate: number | null, decimals = 2): string {
  if (errorRate === null || !Number.isFinite(errorRate)) return '—'
  return `${errorRate.toFixed(decimals)}%`
}
