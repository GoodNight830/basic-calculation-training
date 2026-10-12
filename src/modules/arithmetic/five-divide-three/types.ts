/** 五除三模块的类型与常量定义（§5.1） */

import type { QuestionGenerator } from '../types'

export type { QuestionGenerator }

/** 被除数：五位数 */
export const DIVIDEND_MIN = 10_000
export const DIVIDEND_MAX = 99_999

/** 除数：三位数（且不为 0） */
export const DIVISOR_MIN = 100
export const DIVISOR_MAX = 999

/** 展示与存储的小数位数 */
export const ANSWER_DECIMALS = 2

/** 答案判定结果 */
export interface AnswerCheck {
  /** 用户原始输入 */
  raw: string
  /** 解析后的数值；非法输入或空输入为 null */
  userAnswer: number | null
  correctAnswer: number
  /** 误差百分比；无法计算时为 null */
  errorRate: number | null
  correct: boolean
  /** 判定原因，便于 UI 提示 */
  reason: 'ok' | 'empty' | 'invalid' | 'out_of_tolerance'
}
