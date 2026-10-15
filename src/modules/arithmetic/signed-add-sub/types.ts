/** 正负运算模块的类型与常量定义（两位数加减，含正负数） */

import type { QuestionGenerator } from '../types'

export type { QuestionGenerator }

/** 操作数范围：-99 ~ 99 的整数，且不为 0（避免 +0/-0 歧义题） */
export const OPERAND_MIN = -99
export const OPERAND_MAX = 99

/** 运算符 */
export type SignedOperator = '+' | '-'

/** 答案判定结果（与五除三模块结构一致，复用 AnswerCheck 语义） */
export interface AnswerCheck {
  /** 用户原始输入 */
  raw: string
  /** 解析后的数值；非法输入或空输入为 null */
  userAnswer: number | null
  correctAnswer: number
  /** 误差百分比；整数运算误差为 0 或 null */
  errorRate: number | null
  correct: boolean
  /** 判定原因，便于 UI 提示 */
  reason: 'ok' | 'empty' | 'invalid' | 'out_of_tolerance'
}
