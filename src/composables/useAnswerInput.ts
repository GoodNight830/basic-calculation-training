/**
 * 答案输入逻辑（供训练页面与应用自带数字键盘共用）。
 *
 * 与布局无关的纯逻辑集中在这里，方便单元测试（§45：核心逻辑与 UI 分离）：
 * - 只允许数字与一个小数点，其余字符直接丢弃
 * - 超过「7 位整数 + 3 位小数」的部分自动截断
 * - 支持全角数字（手机输入法直接键入时也能识别）
 * - 只输入一个小数点时视为「0.」
 */

import { normalizeAnswerInput } from '@/modules/arithmetic/five-divide-three/validator'
import { unref, type Ref } from 'vue'

/** 整数部分最多 7 位，小数部分最多 3 位 */
export const ANSWER_MAX_INT_DIGITS = 7
export const ANSWER_MAX_DECIMALS = 3

/** 提取合法符号位（仅在 allowNegative 时保留开头的负号） */
function signPart(raw: string, allowNegative: boolean): string {
  if (!allowNegative) return ''
  const trimmed = raw ?? ''
  return trimmed.startsWith('-') ? '-' : ''
}

/**
 * 清洗任意输入为合法答案（非法字符丢弃，超长部分截断）。
 * allowNegative 为 true 时保留开头的负号（正负运算模块）。
 */
export function sanitizeAnswerInput(raw: string, allowNegative = false): string {
  const sign = signPart(raw, allowNegative)
  const body = normalizeAnswerInput(raw ?? '').replace(/[^\d.]/g, '')
  if (body === '') return sign === '-' ? '-' : ''

  const firstDot = body.indexOf('.')
  const intPart = (firstDot === -1 ? body : body.slice(0, firstDot)).slice(
    0,
    ANSWER_MAX_INT_DIGITS
  )

  if (firstDot === -1) return sign + intPart

  const decPart = body
    .slice(firstDot + 1)
    .replace(/\./g, '')
    .slice(0, ANSWER_MAX_DECIMALS)

  return `${sign}${intPart === '' ? '0' : intPart}.${decPart}`
}

/** 追加一个数字或小数点（结果始终是合法答案，小数点只保留一个） */
export function appendAnswerKey(current: string, key: string, allowNegative = false): string {
  return sanitizeAnswerInput(`${current}${key}`, allowNegative)
}

/** 切换正负号（正负运算模块使用） */
export function toggleAnswerSign(current: string): string {
  return current.startsWith('-') ? current.slice(1) : `-${current}`
}

/** 删除最后一位 */
export function backspaceAnswer(current: string): string {
  return current.slice(0, -1)
}

export function useAnswerInput(value: Ref<string>, allowNegative = false) {
  function setFromInput(raw: string): void {
    value.value = sanitizeAnswerInput(raw, allowNegative)
  }

  function pressKey(key: string): void {
    value.value = appendAnswerKey(value.value, key, allowNegative)
  }

  function toggleSign(): void {
    value.value = toggleAnswerSign(value.value)
  }

  function backspace(): void {
    value.value = backspaceAnswer(value.value)
  }

  function clear(): void {
    value.value = ''
  }

  return { setFromInput, pressKey, toggleSign, backspace, clear }
}
