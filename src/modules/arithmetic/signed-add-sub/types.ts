/** 正负运算模块的类型与常量定义（两位数加减，含正负数） */

import type { QuestionGenerator } from '../types'

export type { QuestionGenerator }

/** 操作数范围：-99 ~ 99 的整数，且不为 0（避免 +0/-0 歧义题） */
export const OPERAND_MIN = -99
export const OPERAND_MAX = 99

/** 运算符 */
export type SignedOperator = '+' | '-'
