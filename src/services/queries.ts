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
import { accuracyOf, buildDailySummaries, summarizeRange, summarize } from './statistics'
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
import type { LocalDiagnosis, AiAnalysisSnapshot, Bookmark } from '@/types'
import { scheduleHostSync } from './hostSync'
import { newId } from '@/utils/id'
import * as bookmarksRepo from '@/db/bookmarks'

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
  const result = await wrongQuestionsRepo.markWrongQuestionMastered(id, mastered)
  scheduleHostSync()
  return result
}

export async function setManyWrongQuestionsMastered(
  ids: readonly string[],
  mastered: boolean
): Promise<number> {
  const result = await wrongQuestionsRepo.bulkMarkMastered(ids, mastered)
  scheduleHostSync()
  return result
}

export async function removeWrongQuestion(id: string): Promise<void> {
  await wrongQuestionsRepo.deleteWrongQuestion(id)
  scheduleHostSync(true)
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

export interface DiagnosisBundle {
  diagnosis: LocalDiagnosis
  latestAi: AiAnalysisSnapshot | null
  /** 该模块的全部 AI 报告快照，按时间倒序（用于历史对比） */
  aiHistory: AiAnalysisSnapshot[]
}

export async function loadDiagnosis(module: string = MODULE_FIVE_DIVIDE_THREE): Promise<DiagnosisBundle> {
  const [analysis, aiHistory] = await Promise.all([
    loadSessionAnalysisData(module),
    aiSnapshotsRepo.listAiAnalyses(module)
  ])
  const latestAi = aiHistory[0] ?? null
  return {
    diagnosis: buildLocalDiagnosis(analysis.records, module, {
      lastAiQuestionCount: latestAi?.questionCount ?? 0
    }),
    latestAi,
    aiHistory
  }
}

/* ---------- 收藏与笔记（§21.1） ---------- */

export async function loadBookmarks(module?: string): Promise<Bookmark[]> {
  return bookmarksRepo.listBookmarks(module)
}

export interface BookmarkTarget {
  module: string
  question: string
  dividend: number
  divisor: number
  correctAnswer: number
}

/** 收藏或取消收藏一道题（按「被除数:除数」聚合）；返回最新收藏列表与本次是否收藏 */
export async function toggleBookmark(target: BookmarkTarget): Promise<{ bookmarks: Bookmark[]; bookmarked: boolean }> {
  const questionKey = `${target.dividend}:${target.divisor}`
  const existing = await bookmarksRepo.getBookmarkByKey(questionKey)
  if (existing) {
    await bookmarksRepo.deleteBookmark(existing.id)
    return { bookmarks: await bookmarksRepo.listBookmarks(), bookmarked: false }
  }
  const now = new Date().toISOString()
  const bookmark: Bookmark = {
    id: newId(),
    module: target.module,
    questionKey,
    question: target.question,
    dividend: target.dividend,
    divisor: target.divisor,
    correctAnswer: target.correctAnswer,
    note: '',
    createdAt: now,
    updatedAt: now
  }
  await bookmarksRepo.putBookmark(bookmark)
  return { bookmarks: await bookmarksRepo.listBookmarks(), bookmarked: true }
}

export async function updateBookmarkNote(id: string, note: string): Promise<Bookmark | null> {
  const existing = await bookmarksRepo.listBookmarks()
  const found = existing.find((b) => b.id === id)
  if (!found) return null
  const updated: Bookmark = { ...found, note, updatedAt: new Date().toISOString() }
  await bookmarksRepo.putBookmark(updated)
  return updated
}

/* ---------- 个人数据概览（跨模块聚合） ---------- */

export interface ModuleStat {
  module: string
  sessionCount: number
  questionCount: number
  correctCount: number
  accuracy: number
  totalElapsedMs: number
}

export interface ProfileData {
  total: StatsSummary
  modules: ModuleStat[]
  bookmarkCount: number
  wrongQuestionCount: number
  masteredWrongCount: number
}

/** 跨模块聚合个人数据：总览 + 各模块占比（用于个人数据页的饼状图与概览卡） */
export async function loadProfileData(): Promise<ProfileData> {
  const [analysis, bookmarks, wrongQuestions] = await Promise.all([
    loadSessionAnalysisData(),
    bookmarksRepo.listBookmarks(),
    wrongQuestionsRepo.listWrongQuestions({})
  ])

  // 按模块分组聚合（自动覆盖所有有做题记录的模块）
  const moduleMap = new Map<string, ModuleStat>()
  for (const record of analysis.records) {
    const entry = moduleMap.get(record.module) ?? {
      module: record.module,
      sessionCount: 0,
      questionCount: 0,
      correctCount: 0,
      accuracy: 0,
      totalElapsedMs: 0
    }
    entry.questionCount += 1
    entry.correctCount += record.correct ? 1 : 0
    entry.totalElapsedMs += Number.isFinite(record.elapsedMs) ? record.elapsedMs : 0
    moduleMap.set(record.module, entry)
  }
  for (const session of analysis.sessions) {
    const entry = moduleMap.get(session.module)
    if (entry) entry.sessionCount += 1
  }
  for (const entry of moduleMap.values()) {
    entry.accuracy = accuracyOf(entry.correctCount, entry.questionCount)
  }
  const modules = [...moduleMap.values()].sort((a, b) => b.questionCount - a.questionCount)

  return {
    total: summarize(analysis.sessions, analysis.records),
    modules,
    bookmarkCount: bookmarks.length,
    wrongQuestionCount: wrongQuestions.length,
    masteredWrongCount: wrongQuestions.filter((q) => q.status === 'mastered').length
  }
}
