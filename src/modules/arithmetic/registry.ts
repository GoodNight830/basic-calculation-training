/**
 * 计算模块注册表（§7.2 / §33）。
 *
 * 未来增加 四除二 / 三除二 / 百分数 / 分数 等模块时，
 * 只需在此注册新的生成器与校验器，训练页面核心逻辑无需修改。
 */

import { fiveDivideThreeGenerator } from './five-divide-three/generator'
import { checkAnswer } from './five-divide-three/validator'
import { signedAddSubGenerator } from './signed-add-sub/generator'
import { checkAnswer as checkSignedAnswer } from './signed-add-sub/validator'
import type { AnswerCheck } from './five-divide-three/types'
import type { ModuleMeta, QuestionGenerator } from './types'
import { MODULE_FIVE_DIVIDE_THREE, MODULE_SIGNED_ADD_SUB, QUESTION_COUNT } from '@/config/trainingConfig'

export interface ArithmeticModule {
  meta: ModuleMeta
  generator: QuestionGenerator
  /** 答案校验函数（§34 validator） */
  validate: (raw: string, correctAnswer: number, allowedErrorRate: number) => AnswerCheck
  /** 生成题目器的名称，用于设置页展示 */
  reinforcementSupported: boolean
}

export const arithmeticModules: ArithmeticModule[] = [
  {
    meta: {
      id: MODULE_FIVE_DIVIDE_THREE,
      title: '五除三',
      subtitle: '五位数 ÷ 三位数',
      description: `例如 58231 ÷ 317，默认 ${QUESTION_COUNT.default} 题，允许误差 3%`,
      enabled: true,
      diagnosisSupported: true,
      aiSupported: true
    },
    generator: fiveDivideThreeGenerator,
    validate: checkAnswer,
    reinforcementSupported: true
  }
]

export function getArithmeticModule(moduleId: string): ArithmeticModule {
  const found = arithmeticModules.find((m) => m.meta.id === moduleId)
  if (!found) {
    throw new Error(`未注册的计算模块：${moduleId}`)
  }
  return found
}

export function findArithmeticModule(moduleId: string): ArithmeticModule | null {
  return arithmeticModules.find((m) => m.meta.id === moduleId) ?? null
}

/** 支持本地能力诊断的模块（按注册顺序） */
export function listDiagnosableModules(): ArithmeticModule[] {
  return arithmeticModules.filter((m) => m.meta.enabled && m.meta.diagnosisSupported)
}

/** 支持 AI 解读的模块（按注册顺序） */
export function listAiModules(): ArithmeticModule[] {
  return arithmeticModules.filter((m) => m.meta.enabled && m.meta.aiSupported)
}
