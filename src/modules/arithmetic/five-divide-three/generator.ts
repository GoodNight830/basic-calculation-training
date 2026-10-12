/**
 * 五除三题目生成器（§7.1 / §7.2 / §16 / §34）。
 *
 * 生成规则：
 * - 被除数：10000 - 99999（五位数）
 * - 除数：100 - 999（三位数，永不为 0）
 * - 同一训练组内不出现完全重复题目
 * - 支持薄弱点定向强化：以配置化比例产出指定除数范围的题目（§16），
 *   且薄弱题占比始终低于 100%（§16.1）
 *
 * 该生成器不依赖任何浏览器 API，可在任何 JS 环境运行（§45）。
 */

import { createSeededRng, pickWeighted, randomInt, type Rng } from '../random'
import type { GenerateOptions, GeneratedQuestion, QuestionGenerator, WeakTarget } from '../types'
import { buildQuestionText, exactQuotient } from './calculator'
import { DIVIDEND_MAX, DIVIDEND_MIN, DIVISOR_MAX, DIVISOR_MIN } from './types'
import { MODULE_FIVE_DIVIDE_THREE } from '@/config/trainingConfig'
import { newId } from '@/utils/id'

/** 避免重复题目的最大尝试次数 */
const MAX_DEDUPE_ATTEMPTS = 40

export interface FiveDivideThreeGenerateOptions extends GenerateOptions {
  /** 薄弱题占比上限，默认取配置中的 maxReinforcementRatio */
  maxWeakRatio?: number
}

export class FiveDivideThreeGenerator implements QuestionGenerator {
  readonly moduleId = MODULE_FIVE_DIVIDE_THREE
  readonly title = '五除三'

  generate(options: FiveDivideThreeGenerateOptions): GeneratedQuestion[] {
    const count = Math.max(0, Math.floor(options.count))
    const rng: Rng = options.rng ?? (options.rngSeed !== undefined ? createSeededRng(options.rngSeed) : Math.random)
    const weakTargets = (options.weakTargets ?? []).filter((t) => t.weight > 0)
    const maxWeakRatio = clamp01(options.maxWeakRatio ?? 0.35)
    const totalWeakWeight = weakTargets.reduce((sum, t) => sum + Math.max(0, t.weight), 0)
    const weakProbability = Math.min(maxWeakRatio, clamp01(totalWeakWeight))

    const usedKeys = new Set<string>(options.excludeKeys ?? [])
    const questions: GeneratedQuestion[] = []

    for (let index = 0; index < count; index += 1) {
      const useWeak = weakTargets.length > 0 && rng() < weakProbability
      const target = useWeak ? pickWeighted(weakTargets, (t) => t.weight, rng) : null
      const question = this.createQuestion(target, rng, usedKeys)
      usedKeys.add(questionKey(question.dividend, question.divisor))
      questions.push(question)
    }

    return questions
  }

  private createQuestion(
    target: WeakTarget | null,
    rng: Rng,
    usedKeys: Set<string>
  ): GeneratedQuestion {
    let dividend = 0
    let divisor = 0

    for (let attempt = 0; attempt < MAX_DEDUPE_ATTEMPTS; attempt += 1) {
      dividend = randomInt(DIVIDEND_MIN, DIVIDEND_MAX, rng)
      divisor = target
        ? randomInt(target.rangeMin, target.rangeMax, rng)
        : randomInt(DIVISOR_MIN, DIVISOR_MAX, rng)
      if (!usedKeys.has(questionKey(dividend, divisor))) break
    }

    // 防御：任何情况下都不允许出现非法除数
    if (divisor < DIVISOR_MIN || divisor > DIVISOR_MAX) {
      divisor = randomInt(DIVISOR_MIN, DIVISOR_MAX, rng)
    }

    return {
      id: newId(),
      module: this.moduleId,
      dividend,
      divisor,
      correctAnswer: exactQuotient(dividend, divisor),
      text: buildQuestionText(dividend, divisor),
      origin: target ? 'weak' : 'normal',
      weakRange: target ? { min: target.rangeMin, max: target.rangeMax } : null,
      createdAt: new Date().toISOString()
    }
  }
}

function questionKey(dividend: number, divisor: number): string {
  return `${dividend}:${divisor}`
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** 单例，供 registry 与页面复用 */
export const fiveDivideThreeGenerator = new FiveDivideThreeGenerator()
