/**
 * 正负运算答案校验。
 *
 * 与五除三不同：正负运算是整数精确结果，不存在误差容忍，
 * 因此正确性只取决于「用户输入是否精确等于结果」。
 * 复用五除三的 AnswerCheck 类型（结构一致），并复用其输入解析逻辑。
 */

import type { AnswerCheck } from '../five-divide-three/types'
import {
  computeErrorRate,
  normalizeAnswerInput,
  parseUserAnswer
} from '../five-divide-three/validator'

/**
 * 判定答案：整数精确匹配。
 * errorRate 直接沿用五除三的误差计算（结果非 0 时等价于相对误差），
 * allowedErrorRate 对本模块无实际意义，但签名保持一致以便注册表统一调用。
 */
export function checkAnswer(
  raw: string,
  correctAnswer: number,
  _allowedErrorRate: number
): AnswerCheck {
  const normalized = normalizeAnswerInput(raw ?? '')
  const userAnswer = parseUserAnswer(raw ?? '')

  if (normalized === '') {
    return { raw: raw ?? '', userAnswer: null, correctAnswer, errorRate: null, correct: false, reason: 'empty' }
  }
  if (userAnswer === null) {
    return { raw: raw ?? '', userAnswer: null, correctAnswer, errorRate: null, correct: false, reason: 'invalid' }
  }

  // 整数精确匹配；结果为 0 且用户答 0 时 errorRate 为 0
  const correct = userAnswer === correctAnswer
  const errorRate = correct ? 0 : computeErrorRate(userAnswer, correctAnswer)

  return { raw: raw ?? '', userAnswer, correctAnswer, errorRate, correct, reason: correct ? 'ok' : 'out_of_tolerance' }
}
