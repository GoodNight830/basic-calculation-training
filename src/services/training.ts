/**
 * 训练流程编排（§6 / §8 / §9 / §10 / §12 / §16）。
 *
 * 这一层把「纯领域逻辑」与「本地数据库」连接起来：
 * - 生成题目（调用注册表中的 QuestionGenerator）
 * - 判定答案（调用注册表中的 validator）
 * - 保存训练组 / 题目记录 / 错题 / 活动训练
 * - 结算并触发薄弱点重算
 *
 * Vue 组件与 Pinia store 只调用本文件，不直接访问 IndexedDB（§48.7）。
 */

import { QUESTION_COUNT, type WeakPatternConfig } from '@/config/trainingConfig'
import { getArithmeticModule } from '@/modules/arithmetic/registry'
import { buildQuestionText, exactQuotient } from '@/modules/arithmetic/five-divide-three/calculator'
import {
  analyzeWeakPatterns,
  divisorRangeOf,
  reinforcementTargets
} from './weakPattern'
import { checkAnswer } from '@/modules/arithmetic/five-divide-three/validator'
import * as activeSessionsRepo from '@/db/activeSessions'
import * as questionsRepo from '@/db/questions'
import * as sessionsRepo from '@/db/sessions'
import * as weakPatternsRepo from '@/db/weakPatterns'
import * as wrongQuestionsRepo from '@/db/wrongQuestions'
import * as aiSnapshotsRepo from '@/db/aiAnalysisSnapshots'
import { scheduleHostSync } from './hostSync'
import {
  buildQuestionRecord,
  computeTotals,
  createSessionRecord,
  finalizeSession,
  mergeWrongQuestion,
  toAnswerEntry
} from './trainingSession'
import { newId, questionKeyOf } from '@/utils/id'
import type { AnswerCheck } from '@/modules/arithmetic/five-divide-three/types'
import type {
  ActiveSession,
  GeneratedQuestion,
  QuestionRecord,
  SessionSource,
  TrainingMode,
  TrainingSession,
  WeakPattern,
  WrongQuestion
} from '@/types'

export interface BeginSessionInput {
  module: string
  mode: TrainingMode
  /** 竞速模式题目数量；训练模式忽略（不设上限） */
  questionCount: number
  allowedErrorRate: number
  weakPatterns?: readonly WeakPattern[]
  weakConfig?: WeakPatternConfig
  /** 训练题源；错题重练时传 wrongQuestions */
  source?: SessionSource
  /** 错题重练题目池 */
  presetQuestions?: readonly GeneratedQuestion[]
  /** 生成题目时避免与最近 N 题重复 */
  avoidRecentCount?: number
}

export interface SubmitAnswerResult {
  active: ActiveSession
  record: QuestionRecord
  check: AnswerCheck
  /** 竞速模式是否已全部完成 */
  isComplete: boolean
}

export interface SessionAnalysisData {
  sessions: TrainingSession[]
  /** 仅包含正式完成训练组的题目记录（放弃的训练组不计入统计，§9） */
  records: QuestionRecord[]
}

const DEFAULT_AVOID_RECENT = 60

function nowIso(): string {
  return new Date().toISOString()
}

function clampQuestionCount(value: number): number {
  if (!Number.isFinite(value)) return QUESTION_COUNT.default
  return Math.min(QUESTION_COUNT.max, Math.max(QUESTION_COUNT.min, Math.floor(value)))
}

/** 生成一批题目（带薄弱点强化与去重） */
async function generateQuestions(
  module: string,
  count: number,
  active: Pick<ActiveSession, 'questionList' | 'queuedQuestions'>,
  weakPatterns: readonly WeakPattern[] = [],
  weakConfig?: WeakPatternConfig,
  avoidRecentCount = DEFAULT_AVOID_RECENT
): Promise<GeneratedQuestion[]> {
  const mod = getArithmeticModule(module)
  const excludeKeys = new Set<string>(
    active.questionList.map((q) => questionKeyOf(q.dividend, q.divisor))
  )
  for (const key of await questionsRepo.recentQuestionKeys(module, avoidRecentCount)) {
    excludeKeys.add(key)
  }

  // 不支持薄弱点强化的模块（如正负运算）不注入强化目标
  const weakTargets = mod.reinforcementSupported
    ? reinforcementTargets(weakPatterns, weakConfig)
    : []

  return mod.generator.generate({
    count,
    weakTargets,
    maxWeakRatio: weakConfig?.maxReinforcementRatio,
    excludeKeys
  })
}

function cloneAsRetryQuestion(question: WrongQuestion): GeneratedQuestion {
  const mod = findArithmeticModule(question.module)
  const reinforcementSupported = mod?.reinforcementSupported ?? false
  const { min, max } = divisorRangeOf(question.divisor, 100)
  return {
    id: newId(),
    module: question.module,
    dividend: question.dividend,
    divisor: question.divisor,
    // 直接用错题记录里已保存的正确答案（§20），避免对正负运算等模块误用除法重算
    correctAnswer: question.correctAnswer,
    text: question.question || buildQuestionText(question.dividend, question.divisor),
    origin: 'weak',
    weakRange: reinforcementSupported ? { min, max } : null,
    createdAt: nowIso()
  }
}

/** 错题 → 重练题目池（§13） */
export function wrongQuestionsToQuestions(list: readonly WrongQuestion[]): GeneratedQuestion[] {
  return list.map(cloneAsRetryQuestion)
}

/** 由活动训练推导出训练组记录（实时保存进度） */
export function sessionFromActive(active: ActiveSession, status: TrainingSession['status']): TrainingSession {
  const totals = computeTotals(active.answers)
  return {
    id: active.sessionId,
    module: active.module,
    mode: active.mode,
    questionCount: active.questionCount,
    allowedErrorRate: active.allowedErrorRate,
    startedAt: active.startTime,
    finishedAt: '',
    totalElapsedMs: totals.totalElapsedMs,
    answeredCount: totals.answeredCount,
    correctCount: totals.correctCount,
    wrongCount: totals.wrongCount,
    grade: 'encourage',
    status,
    createdAt: active.createdAt
  }
}

/** 开始一次训练（§6.2 / §6.3 / §6.9） */
export async function beginSession(input: BeginSessionInput): Promise<ActiveSession> {
  const startedAt = nowIso()
  const sessionId = newId()
  const source: SessionSource = input.source ?? 'random'
  const preset = [...(input.presetQuestions ?? [])]
  const isSpeed = input.mode === 'speed'
  const questionCount = isSpeed ? clampQuestionCount(input.questionCount) : 0

  const base: Pick<ActiveSession, 'questionList' | 'queuedQuestions'> = {
    questionList: [],
    queuedQuestions: []
  }

  let initialQuestions: GeneratedQuestion[]
  if (isSpeed) {
    // 竞速模式：题目一次性生成，但错题重练池优先
    const fromPreset = preset.splice(0, questionCount)
    const remaining = questionCount - fromPreset.length
    const generated =
      remaining > 0
        ? await generateQuestions(
            input.module,
            remaining,
            { questionList: fromPreset, queuedQuestions: [] },
            input.weakPatterns,
            input.weakConfig,
            input.avoidRecentCount
          )
        : []
    initialQuestions = [...fromPreset, ...generated]
  } else {
    // 训练模式：逐题生成；错题重练时先消耗重练池
    const first = preset.shift()
    initialQuestions = first
      ? [first]
      : await generateQuestions(input.module, 1, base, input.weakPatterns, input.weakConfig, input.avoidRecentCount)
  }

  const active: ActiveSession = {
    id: sessionId,
    sessionId,
    module: input.module,
    mode: input.mode,
    questionCount,
    allowedErrorRate: input.allowedErrorRate,
    currentQuestionIndex: 0,
    questionList: initialQuestions,
    queuedQuestions: preset,
    source,
    answers: [],
    startTime: startedAt,
    accumulatedElapsedMs: 0,
    createdAt: startedAt,
    updatedAt: startedAt
  }

  await sessionsRepo.putSession({
    ...createSessionRecord({
      id: sessionId,
      module: input.module,
      mode: input.mode,
      questionCount,
      allowedErrorRate: input.allowedErrorRate,
      startedAt
    }),
    status: 'active'
  })
  await activeSessionsRepo.putActiveSession(active)
  scheduleHostSync()
  return active
}

/** 当前待作答题目 */
export function currentQuestion(active: ActiveSession): GeneratedQuestion | null {
  return active.questionList[active.currentQuestionIndex] ?? null
}

/** 提交答案（§8.4）：判定 → 保存原始数据 → 推进到下一题 */
export async function submitAnswer(
  active: ActiveSession,
  rawAnswer: string,
  elapsedMs: number,
  startedAtIso: string,
  options: {
    weakPatterns?: readonly WeakPattern[]
    weakConfig?: WeakPatternConfig
    avoidRecentCount?: number
  } = {}
): Promise<SubmitAnswerResult> {
  const question = currentQuestion(active)
  if (!question) {
    throw new Error('当前没有可作答的题目')
  }

  const mod = getArithmeticModule(active.module)
  const check = mod.validate(rawAnswer, question.correctAnswer, active.allowedErrorRate)
  const submittedAt = nowIso()

  const record = buildQuestionRecord({
    sessionId: active.sessionId,
    module: active.module,
    mode: active.mode,
    questionIndex: active.currentQuestionIndex + 1,
    question,
    check,
    elapsedMs,
    startedAt: startedAtIso,
    submittedAt
  })

  // 1. 保存题目级原始数据（§2.2）
  await questionsRepo.putQuestion(record)

  // 2. 错题本（§12）：错误自动入库；再次做对也不删除历史
  const key = questionKeyOf(question.dividend, question.divisor)
  const existingWrong = await wrongQuestionsRepo.getWrongQuestionByKey(key)
  if (!check.correct || existingWrong) {
    const merged = mergeWrongQuestion(record, existingWrong)
    await wrongQuestionsRepo.putWrongQuestion(merged)
  }

  // 3. 推进训练状态
  const answers = [...active.answers, toAnswerEntry(record)]
  let next: ActiveSession = {
    ...active,
    answers,
    currentQuestionIndex: active.currentQuestionIndex + 1,
    accumulatedElapsedMs: active.accumulatedElapsedMs + record.elapsedMs,
    updatedAt: nowIso()
  }

  const isComplete = next.mode === 'speed' && answers.length >= next.questionCount

  // 4. 训练模式：立即准备下一题；竞速模式：题目已预先全部生成
  if (!isComplete && next.questionList.length <= next.currentQuestionIndex) {
    const queued = [...next.queuedQuestions]
    const preset = queued.shift()
    const appended = preset
      ? [preset]
      : await generateQuestions(
          next.module,
          1,
          { questionList: next.questionList, queuedQuestions: [] },
          options.weakPatterns,
          options.weakConfig,
          options.avoidRecentCount
        )
    next = {
      ...next,
      queuedQuestions: queued,
      questionList: [...next.questionList, ...appended]
    }
  }

  await activeSessionsRepo.putActiveSession(next)
  await sessionsRepo.putSession(sessionFromActive(next, 'active'))
  scheduleHostSync()

  return { active: next, record, check, isComplete }
}

/** 结算训练组（§10）：写入最终成绩、清理活动训练、重算薄弱点 */
export async function finishSession(active: ActiveSession): Promise<TrainingSession> {
  const finishedAt = nowIso()
  const base = sessionFromActive(active, 'active')
  const finished = finalizeSession(base, active.answers, finishedAt)
  await sessionsRepo.putSession(finished)
  await activeSessionsRepo.clearActiveSession(active.id)
  scheduleHostSync()
  return finished
}

/** 放弃训练（§9）：不计入正式训练统计 */
export async function abandonSession(active: ActiveSession): Promise<void> {
  const base = sessionFromActive(active, 'abandoned')
  await sessionsRepo.putSession({ ...base, status: 'abandoned', finishedAt: nowIso() })
  await activeSessionsRepo.clearActiveSession(active.id)
  scheduleHostSync()
}

/** 读取用于统计/分析的正式数据（只包含已完成训练组，§9） */
export async function loadSessionAnalysisData(module?: string): Promise<SessionAnalysisData> {
  const [sessions, records] = await Promise.all([
    sessionsRepo.listSessions({ module }),
    questionsRepo.listQuestions({ module })
  ])
  const finished = sessions.filter((s) => s.status === 'finished')
  const finishedIds = new Set(finished.map((s) => s.id))
  return {
    sessions: finished,
    records: records.filter((r) => finishedIds.has(r.sessionId))
  }
}

/** 重算并保存薄弱点（§14 / §16） */
export async function recomputeWeakPatterns(
  module: string,
  config: WeakPatternConfig
): Promise<WeakPattern[]> {
  const [previous, analysis] = await Promise.all([
    weakPatternsRepo.listWeakPatterns(module),
    loadSessionAnalysisData(module)
  ])
  const patterns = analyzeWeakPatterns(analysis.records, previous, config, module)
  await weakPatternsRepo.replaceWeakPatterns(patterns, module)
  scheduleHostSync()
  return patterns
}

/** 清空业务数据（设置 → 数据管理） */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    questionsRepo.deleteAllQuestions(),
    sessionsRepo.deleteAllSessions(),
    wrongQuestionsRepo.clearWrongQuestions(),
    weakPatternsRepo.clearWeakPatterns(),
    activeSessionsRepo.clearAllActiveSessions()
    , aiSnapshotsRepo.clearAiAnalyses()
  ])
  scheduleHostSync(true)
}

/** 手动判定单个答案（错题详情、自测等场景复用同一 validator） */
export function validateAnswer(
  module: string,
  raw: string,
  correctAnswer: number,
  allowedErrorRate: number
): AnswerCheck {
  const mod = getArithmeticModule(module)
  return mod.validate(raw, correctAnswer, allowedErrorRate)
}

export { checkAnswer }
