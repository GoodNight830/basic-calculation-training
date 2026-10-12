/**
 * 题目生成器抽象（§7.2 / §34 / §45）。
 *
 * 训练页面只依赖 QuestionGenerator 接口与 registry，
 * 因此未来增加 “四除二”“百分数”“分数” 等模块时无需改动训练页面核心逻辑。
 */
import type { GeneratedQuestion, WeakTarget } from '@/types'

/** 便于各计算模块直接复用领域类型 */
export type { GeneratedQuestion, WeakTarget }

export interface GenerateOptions {
  /** 生成题目数量 */
  count: number
  /** 随机源，默认 Math.random；传入可复现的随机源便于测试 */
  rng?: () => number
  /** 随机种子；仅在未提供 rng 时生效，便于复现（§7.1） */
  rngSeed?: number
  /** 薄弱点强化目标（§16） */
  weakTargets?: WeakTarget[]
  /** 薄弱题合计占比上限（§16.1：不允许 100% 薄弱题） */
  maxWeakRatio?: number
  /** 需要避免重复的题目键集合（同一训练组内不出现完全重复题目） */
  excludeKeys?: Set<string>
}

export interface QuestionGenerator {
  readonly moduleId: string
  readonly title: string
  /** 生成题目；返回的 correctAnswer 必须落库（§20） */
  generate(options: GenerateOptions): GeneratedQuestion[]
}

export interface ModuleMeta {
  id: string
  title: string
  subtitle: string
  description: string
  enabled: boolean
}
