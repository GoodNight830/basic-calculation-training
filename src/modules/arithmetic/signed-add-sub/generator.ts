/**
 * 正负运算题目生成器（两位数加减，含正负数）。
 *
 * 生成规则：
 * - 两个操作数均为 -99 ~ 99 的整数，且不为 0（避免 +0/-0 歧义）
 * - 排除「两个正数直接相加」（即 a > 0 且 b > 0 且 op = '+'）的组合
 * - 其余组合全覆盖：正+负、负+正、负+负、正-正、正-负、负-正、负-负
 * - 同一训练组内不出现完全重复题目
 * - 不支持薄弱点强化（reinforcementSupported = false，由 registry 声明）
 *
 * 该生成器不依赖浏览器 API，可在任何 JS 环境运行（§45）。
 */

import { createSeededRng, randomInt, type Rng } from '../random'
import type { GenerateOptions, GeneratedQuestion, QuestionGenerator } from '../types'
import { buildQuestionText, computeResult } from './calculator'
import { ABS_MIN, ABS_MAX, type SignedOperator } from './types'
import { MODULE_SIGNED_ADD_SUB } from '@/config/trainingConfig'
import { newId } from '@/utils/id'

/** 避免重复题目的最大尝试次数 */
const MAX_DEDUPE_ATTEMPTS = 40

/** 合法符号组合（排除 a>0 且 b>0 且 op='+'） */
const VALID_COMBINATIONS: Array<{ aSign: 1 | -1; bSign: 1 | -1; op: SignedOperator }> = [
  { aSign: 1, bSign: -1, op: '+' },   // 正 + 负
  { aSign: -1, bSign: 1, op: '+' },   // 负 + 正
  { aSign: -1, bSign: -1, op: '+' },  // 负 + 负
  { aSign: 1, bSign: 1, op: '-' },    // 正 - 正
  { aSign: 1, bSign: -1, op: '-' },   // 正 - 负
  { aSign: -1, bSign: 1, op: '-' },   // 负 - 正
  { aSign: -1, bSign: -1, op: '-' }   // 负 - 负
]

export class SignedAddSubGenerator implements QuestionGenerator {
  readonly moduleId = MODULE_SIGNED_ADD_SUB
  readonly title = '正负运算'

  generate(options: GenerateOptions): GeneratedQuestion[] {
    const count = Math.max(0, Math.floor(options.count))
    const rng: Rng = options.rng ?? (options.rngSeed !== undefined ? createSeededRng(options.rngSeed) : Math.random)
    const usedKeys = new Set<string>(options.excludeKeys ?? [])
    const questions: GeneratedQuestion[] = []

    for (let index = 0; index < count; index += 1) {
      const question = this.createQuestion(rng, usedKeys)
      usedKeys.add(questionKey(question.dividend, question.divisor))
      questions.push(question)
    }
    return questions
  }

  private createQuestion(rng: Rng, usedKeys: Set<string>): GeneratedQuestion {
    let a = 0
    let b = 0
    let op: SignedOperator = '+'

    for (let attempt = 0; attempt < MAX_DEDUPE_ATTEMPTS; attempt += 1) {
      const combo = VALID_COMBINATIONS[randomInt(0, VALID_COMBINATIONS.length - 1, rng)]
      op = combo.op
      const absA = randomInt(1, 99, rng)
      const absB = randomInt(1, 99, rng)
      a = combo.aSign * absA
      b = combo.bSign * absB
      if (!usedKeys.has(questionKey(a, b))) break
    }

    return {
      id: newId(),
      module: this.moduleId,
      dividend: a,
      divisor: b,
      correctAnswer: computeResult(a, b, op),
      text: buildQuestionText(a, b, op),
      origin: 'normal',
      weakRange: null,
      createdAt: new Date().toISOString()
    }
  }
}

function questionKey(a: number, b: number): string {
  return `${a}:${b}`
}

/** 单例，供 registry 复用 */
export const signedAddSubGenerator = new SignedAddSubGenerator()
