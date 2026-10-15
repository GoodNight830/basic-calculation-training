/**
 * 全局常量与可配置参数。
 *
 * 说明（需求规格书 §14.3 / §16 / §34）：
 * - 阈值、比例等一律集中在本文件，不允许写死在 UI 组件中；
 * - 用户在“设置”页面修改的值会覆盖这里的默认值，并保存到本地数据库。
 */

import type { TrainingMode } from '@/types'

/** 训练模块标识 */
export const MODULE_FIVE_DIVIDE_THREE = 'five-divide-three'
/** 正负运算模块标识（两位数加减，含正负数；不参与 AI/诊断/薄弱点分析） */
export const MODULE_SIGNED_ADD_SUB = 'signed-add-sub'

/** 题目数量限制（规格书 §7.2 建议 V1 上限 100） */
export const QUESTION_COUNT = {
  min: 1,
  max: 100,
  default: 10,
  presets: [5, 10, 20, 30] as const
} as const

/** 允许误差限制，单位为百分比（%） */
export const ALLOWED_ERROR_RATE = {
  min: 0,
  max: 20,
  step: 0.5,
  default: 3,
  presets: [1, 2, 3, 5] as const
} as const

/** 竞速模式结算阈值（规格书 §10.1 / §35） */
export const GRADE_THRESHOLDS_MS = {
  excellent: 60_000,
  good: 75_000,
  pass: 90_000
} as const

/** 薄弱点分析默认配置（规格书 §14.2 / §15 / §16） */
export interface WeakPatternConfig {
  /** 除数范围粒度，默认按“百位”划分：100-199 / 200-299 ... */
  rangeSize: number
  /** 判定薄弱所需最小样本数（规格书 §14.2：建议 >= 10） */
  minSampleCount: number
  /** 判定薄弱所需最小错误数（规格书 §14.2：辅助条件 >= 3） */
  minErrorCount: number
  /** 范围错误率 / 整体错误率 的判定倍数阈值（规格书 §14.3） */
  ratioThreshold: number
  /** 归一化用的“强薄弱”倍数，达到该倍数时权重取满 */
  strongRatio: number
  /** 整体错误率基线，避免整体错误率极小时分母过小 */
  minBaselineErrorRate: number
  /** 单个薄弱范围的最大强化权重（0-1） */
  maxReinforcementWeight: number
  /** 所有薄弱范围合计的最高出题占比（规格书 §16.1：不允许 100% 薄弱题） */
  maxReinforcementRatio: number
  /** 趋势判定窗口：最近 N 道该范围题目 */
  recentWindowSize: number
  /** 近期错误率低于历史错误率的比例，视为“正在改善” */
  improvingDropRatio: number
  /** 处于 improving 状态时权重的折减系数 */
  improvingWeightFactor: number
  /** 是否启用薄弱点定向强化 */
  enableReinforcement: boolean
}

export const DEFAULT_WEAK_PATTERN_CONFIG: WeakPatternConfig = {
  rangeSize: 100,
  minSampleCount: 10,
  minErrorCount: 3,
  ratioThreshold: 1.5,
  strongRatio: 3,
  minBaselineErrorRate: 0.5,
  maxReinforcementWeight: 0.35,
  maxReinforcementRatio: 0.35,
  recentWindowSize: 20,
  improvingDropRatio: 0.7,
  improvingWeightFactor: 0.5,
  enableReinforcement: true
}

/**
 * 默认训练参数（规格书 §7.1）。
 * 练习入口直接使用这里的配置，不再弹出设置界面（题目数量、允许误差在「设置」页配置）。
 */
export interface AppSettings {
  /** 默认训练模式：训练模式（无限练习）/ 竞速模式（固定题数） */
  defaultMode: TrainingMode
  defaultQuestionCount: number
  defaultAllowedErrorRate: number
  weakPattern: WeakPatternConfig
  ai: AiSettings
}

export type AiAutoAnalysis = 'off' | 'daily' | 'weekly' | 'after_30_questions'
export type AiReportDetail = 'short' | 'standard' | 'detailed'
export type LearningGoal = 'accuracy' | 'speed' | 'exam' | 'maintenance'

export interface AiSettings {
  enabled: boolean
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  wireApi: 'chat_completions' | 'responses'
  transport: 'direct' | 'local_proxy'
  reasoningEffort: 'low' | 'medium' | 'high'
  consentToUpload: boolean
  autoAnalysis: AiAutoAnalysis
  reportDetail: AiReportDetail
  learningGoal: LearningGoal
  maxOutputTokens: number
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  wireApi: 'chat_completions',
  transport: 'local_proxy',
  reasoningEffort: 'medium',
  consentToUpload: false,
  autoAnalysis: 'off',
  reportDetail: 'standard',
  learningGoal: 'accuracy',
  maxOutputTokens: 1200
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultMode: 'training',
  defaultQuestionCount: QUESTION_COUNT.default,
  defaultAllowedErrorRate: ALLOWED_ERROR_RATE.default,
  weakPattern: { ...DEFAULT_WEAK_PATTERN_CONFIG },
  ai: { ...DEFAULT_AI_SETTINGS }
}

/** 导出文件格式版本（规格书 §32） */
export const SCHEMA_VERSION = 1

/** IndexedDB 数据库名 */
export const DB_NAME = 'basic-calculation-training'
