/** 正负运算模块的计算与格式化（两位数加减，含正负数） */

import type { SignedOperator } from './types'

/** 计算 a op b 的结果 */
export function computeResult(a: number, b: number, op: SignedOperator): number {
  return op === '+' ? a + b : a - b
}

/**
 * 生成题目文本。
 * 负数用括号包裹避免歧义，例如 "(-37) + 25"、"18 - (-42)"。
 * 单个正数不加括号："18 + (-42)"、"(-37) - 25"。
 */
export function buildQuestionText(a: number, b: number, op: SignedOperator): string {
  const left = a < 0 ? `(${a})` : String(a)
  const right = b < 0 ? `(${b})` : String(b)
  return `${left} ${op} ${right}`
}

/** 格式化操作数用于展示（与题目文本一致） */
export function formatOperand(value: number): string {
  return value < 0 ? `(${value})` : String(value)
}
