/**
 * 页面读取服务（§34 / §48.7：Vue 页面不直接访问 IndexedDB）。
 *
 * 所有页面只通过本文件与 services/export 读取或修改数据。
 */

import { MODULE_FIVE_DIVIDE_THREE, type WeakPatternConfig } from '@/config/trainingConfig'
import * as activeSessionsRepo from '@/db/activeSessions'
import * as questionsRepo from '@/db/questions'
import * as sessionsRepo from '@/db/sessions'
import * as weakPatternsRepo from '@/db/weakPatterns'
import * as wrongQuestionsRepo from '@/db/wrongQuestions'
import { buildDailySummaries, summarizeRange, summarize } from './statistics'
import { loadSessionAnalysisData, recomputeWeakPatterns } from './training'
import { rangeStartDate, type TimeRange } from './format'
import type {
  DailySummary,
  QuestionRecord,
  StatsSummary,
  TrainingSession,
  WeakPattern,
  WrongQuestion,
  WrongQuestionStatus
} from '@/types'
import { buildLocalDiagnosis } from './diagnosis'
import * as aiSnapshotsRepo from '@/db/aiAnalysisSnapshots'
import type { LocalDiagnosis, AiAnalysisSnapshot } from '@/types'

export interface Overview {
  today: StatsSummary
  total: StatsSummary
  wrongQuestionCount: number
  unmasteredWrongCount: number
  masteredWrongCount: number
  weakPatterns: WeakPattern[]
  hasUnfinishedTraining: boolean
}

/** 首页概览 */
export async function loadOverview(module: string = MODULE_FIVE_DIVIDE_THREE): Promise<Overview> {
  const [analysis, wrongQuestions, weakPatterns, activeSession] = await Promise.all([
    loadSessionAnalysisData(module),
    wrongQuestionsRepo.listWrongQuestions({ module }),
    weakPatternsRepo.listWeakPatterns(module),
    activeSessionsRepo.getActiveSession(module)
  ])

  return {
    today: summarizeRange(analysis.sessions, analysis.records, 'today'),
    total: summarize(analysis.sessions, analysis.records),
    wrongQuestionCount: wrongQuestions.length,
    unmasteredWrongCount: wrongQuestions.filter((q) => q.status === 'active').length,
    masteredWrongCount: wrongQuestions.filter((q) => q.status === 'mastered').length,
    weakPatterns,
    hasUnfinishedTraining: activeSession !== null
  }
}

export interface HistoryData {
  summary: StatsSummary
  daily: DailySummary[]
  sessions: TrainingSession[]
}

/** 历史页面数据（§17 / §27） */
export async function loadHistory(
  range: TimeRange,
  module: string = MODULE_FIVE_DIVIDE_THREE
): Promise<HistoryData> {
  const analysis = await loadSessionAnalysisData(module)
  const now = new Date()
  const since = rangeStartDate(range, now)?.toISOString()
  const sessions = analysis.sessions.filter((s) => (since ? s.startedAt >= since : true))
  const records = analysis.records.filter((r) => (since ? r.createdAt >= since : true))

  return {
    summary: summarize(sessions, records),
    daily: buildDailySummaries(analysis.sessions, range, now),
    sessions
  }
}

/** 某次训练组的所有题目记录 */
export async function loadSessionRecords(sessionId: string): Promise<QuestionRecord[]> {
  return questionsRepo.listQuestionsBySession(sessionId)
}

/** 训练组详情 */
export async function loadSession(sessionId: string): Promise<TrainingSession | null> {
  return sessionsRepo.getSession(sessionId)
}

export interface WrongQuestionFilter {
  module?: string
  status?: WrongQuestionStatus
  rangeMin?: number
  rangeMax?: number
}

export async function loadWrongQuestions(
  filter: WrongQuestionFilter = {}
): Promise<WrongQuestion[]> {
  return wrongQuestionsRepo.listWrongQuestions(filter)
}

export async function setWrongQuestionMastered(
  id: string,
  mastered: boolean
): Promise<WrongQuestion | null> {
  return wrongQuestionsRepo.markWrongQuestionMastered(id, mastered)
}

export async function setManyWrongQuestionsMastered(
  ids: readonly string[],
  mastered: boolean
): Promise<number> {
  return wrongQuestionsRepo.bulkMarkMastered(ids, mastered)
}

export async function removeWrongQuestion(id: string): Promise<void> {
  return wrongQuestionsRepo.deleteWrongQuestion(id)
}

/** 错题除数范围分布（§13：训练某个范围的错题） */
export async function loadWrongQuestionRanges(
  module: string = MODULE_FIVE_DIVIDE_THREE,
  rangeSize = 100
): Promise<Array<{ rangeMin: number; rangeMax: number; count: number }>> {
  const list = await wrongQuestionsRepo.listWrongQuestions({ module, status: 'active' })
  return wrongQuestionsRepo.groupWrongQuestionsByRange(list, rangeSize)
}

export async function loadWrongQuestionById(id: string): Promise<WrongQuestion | null> {
  return wrongQuestionsRepo.getWrongQuestion(id)
}

/** 薄弱点列表（§28） */
export async function loadWeakPatterns(
  module: string = MODULE_FIVE_DIVIDE_THREE
): Promise<WeakPattern[]> {
  return weakPatternsRepo.listWeakPatterns(module)
}

/** 手动重新分析薄弱点 */
export async function refreshWeakPatterns(
  config: WeakPatternConfig,
  module: string = MODULE_FIVE_DIVIDE_THREE
): Promise<WeakPattern[]> {
  return recomputeWeakPatterns(module, config)
}

/** 数据量统计（设置 → 数据管理） */
export async function loadDataCounts(): Promise<{
  sessions: number
  questions: number
  wrongQuestions: number
  weakPatterns: number
}> {
  const [sessions, questions, wrongQuestions, weakPatterns] = await Promise.all([
    sessionsRepo.countSessions(),
    questionsRepo.countQuestions(),
    wrongQuestionsRepo.countWrongQuestions(),
    weakPatternsRepo.listWeakPatterns()
  ])
  return { sessions, questions, wrongQuestions, weakPatterns: weakPatterns.length }
}

export async function loadDiagnosis(module: string = MODULE_FIVE_DIVIDE_THREE): Promise<{ diagnosis: LocalDiagnosis; latestAi: AiAnalysisSnapshot | null }> {
  const [analysis, latestAi] = await Promise.all([loadSessionAnalysisData(module), aiSnapshotsRepo.latestAiAnalysis(module)])
  return {
    diagnosis: buildLocalDiagnosis(analysis.records, module, {
      lastAiQuestionCount: latestAi?.questionCount ?? 0
    }),
    latestAi
  }
}
