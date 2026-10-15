/** 正负运算模块的类型与常量定义（两位数加减，含正负数） */

import type { QuestionGenerator } from '../types'

export type { QuestionGenerator }

/** 操作数绝对值的范围：1 ~ 99（不含 0，避免 +0/-0 歧义题） */
export const ABS_MIN = 1
export const ABS_MAX = 99

/** 运算符 */
export type SignedOperator = '+' | '-'
