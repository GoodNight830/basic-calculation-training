/**
 * 领域数据模型（需求规格书 §18 - §21）。
 *
 * 原则：
 * - 题目级原始数据必须完整保存（§2.2）；
 * - `correctAnswer` 必须落库，不允许运行时重新计算（§20）；
 * - 训练模式与竞速模式使用统一数据模型（§6.4）。
 */

/** 训练模式：训练模式 / 竞速模式 */
export type TrainingMode = 'training' | 'speed'

/** 结算等级（§35） */
export type Grade = 'excellent' | 'good' | 'pass' | 'encourage'

/** 训练组状态：进行中 / 已完成 / 已放弃 */
export type SessionStatus = 'active' | 'finished' | 'abandoned'

/** 错题状态（§12.1） */
export type WrongQuestionStatus = 'active' | 'mastered'

/** 薄弱点维度（§21 / §15） */
export type WeakDimension = 'divisor_range' | 'specific_number'

/** 薄弱点状态（§21 / §16.2） */
export type WeakPatternStatus = 'active' | 'improving' | 'resolved'

/** 题目来源：普通随机 / 薄弱点强化 */
export type QuestionOrigin = 'normal' | 'weak'

/** 生成出来的题目（尚未作答） */
export interface GeneratedQuestion {
  id: string
  module: string
  dividend: number
  divisor: number
  /** 精确商，必须随题目一起保存（§20） */
  correctAnswer: number
  /** 题目文本，例如 "58231 ÷ 317" */
  text: string
  origin: QuestionOrigin
  /** 若来自薄弱点强化，记录来源范围 */
  weakRange: { min: number; max: number } | null
  createdAt: string
}

/** 训练组（§19） */
export interface TrainingSession {
  id: string
  module: string
  mode: TrainingMode
  /** 计划题目数量：竞速模式为固定题数；训练模式为 0（不设上限） */
  questionCount: number
  /** 本组采用的允许误差（%），随记录保存以保证历史可复现（§7.3） */
  allowedErrorRate: number

  startedAt: string
  finishedAt: string
  totalElapsedMs: number

  /** 实际作答题数 */
  answeredCount: number
  correctCount: number
  wrongCount: number

  grade: Grade
  status: SessionStatus

  createdAt: string
}

/** 题目记录（§20），题目级原始数据 */
export interface QuestionRecord {
  id: string
  sessionId: string

  module: string
  mode: TrainingMode

  /** 题目文本，例如 "58231 ÷ 317" */
  question: string
  /** 题目在训练组中的序号，从 1 开始 */
  questionIndex: number

  dividend: number
  divisor: number
  /** 精确商 */
  correctAnswer: number

  /** 用户原始输入（字符串，便于还原非法输入场景） */
  rawAnswer: string
  userAnswer: number | null
  /** 误差百分比，非法/空输入为 null（§7.3） */
  errorRate: number | null

  correct: boolean
  elapsedMs: number

  startedAt: string
  submittedAt: string

  /** 是否为薄弱点强化题 */
  origin: QuestionOrigin
  weakRange: { min: number; max: number } | null

  createdAt: string
}

/** 错题（§12.1）：同一道题（被除数+除数）聚合为一条记录 */
export interface WrongQuestion {
  id: string
  /** `${dividend}:${divisor}`，唯一键 */
  questionKey: string
  module: string

  question: string
  dividend: number
  divisor: number
  correctAnswer: number

  /** 最近一次错误时的用户答案 */
  userAnswer: number | null
  rawAnswer: string
  errorRate: number | null
  elapsedMs: number

  /** 累计错误次数 */
  wrongCount: number
  /** 累计正确作答次数（用于“再次做对”场景，不删除历史） */
  correctCount: number

  createdAt: string
  lastWrongAt: string
  lastCorrectAt: string | null

  /** 产生该错题的最近一次训练组 */
  trainingSessionId: string
  /** 首次产生该错题的训练组 */
  firstSessionId: string

  status: WrongQuestionStatus
  masteredAt: string | null
  updatedAt: string
}

/** 薄弱点（§21） */
export interface WeakPattern {
  id: string

  module: string

  dimension: WeakDimension

  rangeMin: number
  rangeMax: number

  sampleCount: number
  errorCount: number
  errorRate: number

  overallErrorRate: number
  reinforcementWeight: number

  status: WeakPatternStatus

  /** 最近窗口内的样本与错误率（§16.2 趋势判定） */
  recentSampleCount: number
  recentErrorRate: number
  /** 上一次分析的错误率，用于趋势展示 */
  previousErrorRate: number | null
  /** 错误率变化方向 */
  trend: 'up' | 'down' | 'flat'

  updatedAt: string
}

/** 设置表行 */
export interface SettingRow<T = unknown> {
  key: string
  value: T
  updatedAt: string
}

/** 进行中的题目计时状态（仅内存） */
export interface ActiveQuestionTimer {
  questionIndex: number
  startedAtIso: string
  /** 单调时钟起点（performance.now()），不落库 */
  startedAtMonotonic: number
}

/** 已作答答案快照（用于 activeSession 恢复，§6.9） */
export interface AnswerEntry {
  questionId: string
  questionIndex: number
  rawAnswer: string
  userAnswer: number | null
  errorRate: number | null
  correct: boolean
  elapsedMs: number
  startedAt: string
  submittedAt: string
}

/** 训练题目来源：普通随机出题 / 错题重练 */
export type SessionSource = 'random' | 'wrongQuestions'

/** 活动训练记录（§6.9 / §9）：实时保存，支持中断恢复 */
export interface ActiveSession {
  id: string
  sessionId: string
  module: string
  mode: TrainingMode

  questionCount: number
  allowedErrorRate: number

  currentQuestionIndex: number
  /** 已生成的题目列表（竞速模式一次性生成；训练模式逐题生成） */
  questionList: GeneratedQuestion[]
  /** 错题重练时的待出题队列（§13）；普通训练为空数组 */
  queuedQuestions: GeneratedQuestion[]
  source: SessionSource
  answers: AnswerEntry[]

  /** 训练组开始时间（ISO） */
  startTime: string
  /** 已累计（已提交题目）用时，用于跨会话恢复总用时（§8.3） */
  accumulatedElapsedMs: number

  createdAt: string
  updatedAt: string
}

/** 统计摘要（§17） */
export interface StatsSummary {
  sessionCount: number
  questionCount: number
  correctCount: number
  wrongCount: number
  /** 正确率（%），无题目时为 0 */
  accuracy: number
  totalElapsedMs: number
  avgElapsedMs: number
}

/** 按天聚合的历史记录（§27） */
export interface DailySummary {
  date: string
  sessionCount: number
  questionCount: number
  correctCount: number
  wrongCount: number
  accuracy: number
  totalElapsedMs: number
  avgElapsedMs: number
  sessions: TrainingSession[]
}

/** 薄弱点强化出题目标（§16） */
export interface WeakTarget {
  patternId: string
  rangeMin: number
  rangeMax: number
  weight: number
}

export type DiagnosisConfidence = 'insufficient' | 'low' | 'medium' | 'high'
export type DiagnosisTrend = 'improving' | 'worsening' | 'stable' | 'insufficient_data'

export interface DiagnosisWindow {
  sampleCount: number
  errorCount: number
  errorRate: number
  accuracy: number
  medianElapsedMs: number | null
  p75ElapsedMs: number | null
}

export interface DiagnosisRange {
  rangeMin: number
  rangeMax: number
  lifetime: DiagnosisWindow
  recent30: DiagnosisWindow
  recent7: DiagnosisWindow
  previous7: DiagnosisWindow
  trend: DiagnosisTrend
  confidence: DiagnosisConfidence
  errorPatterns: ErrorPatternCount[]
}

export interface ErrorPatternCount {
  type: 'empty' | 'invalid' | 'answer_too_large' | 'answer_too_small' | 'slow_correct' | 'slow_wrong' | 'repeat_wrong'
  count: number
  rate: number
  recent7Count: number
  recent30Count: number
  /** 出现该错误类型最多的具体除数，最多 5 个；不包含用户答案。 */
  topDivisors: number[]
}

export interface LocalDiagnosis {
  schemaVersion: 1
  generatedAt: string
  module: string
  lifetime: DiagnosisWindow
  recent30: DiagnosisWindow
  recent7: DiagnosisWindow
  previous7: DiagnosisWindow
  ranges: DiagnosisRange[]
  errorPatterns: ErrorPatternCount[]
  questionCountSinceLastAi: number
  dataHash: string
}

export interface AiFinding {
  type: 'strength' | 'weakness' | 'improving' | 'worsening' | 'insufficient_data'
  title: string
  evidence: string
  sampleCount: number
  confidence: 'low' | 'medium' | 'high'
  limitation: string
  rangeMin?: number
  rangeMax?: number
  recommendation?: string
}

export interface AiTrainingAction {
  action: string
  rangeMin?: number
  rangeMax?: number
  suggestedQuestionCount?: number
  suggestedRatio?: number
  reevaluateAfterQuestions?: number
}

export interface AiReport {
  summary: string
  findings: AiFinding[]
  nextPlan: AiTrainingAction[]
  uncertainty: string[]
}

export interface AiAnalysisSnapshot {
  id: string
  module: string
  createdAt: string
  dataHash: string
  questionCount: number
  model: string
  promptVersion: string
  report: AiReport
}

/** 收藏的题目（§21.1 新增）：按「被除数:除数」聚合，同一道题只收藏一次 */
export interface Bookmark {
  id: string
  module: string
  /** `${dividend}:${divisor}`，唯一键 */
  questionKey: string
  question: string
  dividend: number
  divisor: number
  correctAnswer: number
  /** 用户笔记（可空） */
  note: string
  createdAt: string
  updatedAt: string
}
