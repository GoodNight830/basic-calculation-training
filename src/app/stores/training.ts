/**
 * 当前训练 store（§6 / §8 / §9）。
 *
 * 负责：
 * - 训练组生命周期：开始 / 作答 / 继续 / 结束 / 放弃 / 中断恢复
 * - 单题计时与总计时（单调时钟，§8.2 / §8.3）
 * - 与 services/training 协作完成持久化（页面不直接访问 IndexedDB）
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { MODULE_FIVE_DIVIDE_THREE } from '@/config/trainingConfig'
import * as activeSessionsRepo from '@/db/activeSessions'
import * as questionsRepo from '@/db/questions'
import { loadSession } from '@/services/queries'
import { elapsedSince, now } from '@/services/timer'
import {
  abandonSession,
  beginSession,
  currentQuestion,
  finishSession,
  sessionFromActive,
  submitAnswer,
  wrongQuestionsToQuestions
} from '@/services/training'
import { useSettingsStore } from './settings'
import { useWeakPatternStore } from './weakPatterns'
import { getArithmeticModule } from '@/modules/arithmetic/registry'
import type { AnswerCheck } from '@/modules/arithmetic/five-divide-three/types'
import type {
  ActiveSession,
  GeneratedQuestion,
  QuestionRecord,
  SessionSource,
  TrainingMode,
  TrainingSession,
  WrongQuestion
} from '@/types'

const TIMER_INTERVAL_MS = 100

export interface StartTrainingOptions {
  module?: string
  mode: TrainingMode
  questionCount?: number
  allowedErrorRate?: number
  source?: SessionSource
  wrongQuestions?: WrongQuestion[]
}

export type SubmitOutcome = 'answered' | 'finished' | 'ignored'

export const useTrainingStore = defineStore('training', () => {
  const active = ref<ActiveSession | null>(null)
  const feedback = ref<AnswerCheck | null>(null)
  const awaitingContinue = ref(false)
  const liveElapsedMs = ref(0)
  const lastResult = ref<TrainingSession | null>(null)
  const lastRecords = ref<QuestionRecord[]>([])
  const pendingResume = ref<ActiveSession | null>(null)
  const busy = ref(false)
  const errorMessage = ref('')

  let timerHandle: ReturnType<typeof setInterval> | null = null
  let questionStartMonotonic = 0
  let questionStartIso = ''

  const question = computed<GeneratedQuestion | null>(() =>
    active.value ? currentQuestion(active.value) : null
  )
  const isTraining = computed(() => active.value?.mode === 'training')
  const isSpeed = computed(() => active.value?.mode === 'speed')
  const answeredCount = computed(() => active.value?.answers.length ?? 0)
  const correctCount = computed(
    () => active.value?.answers.filter((a) => a.correct).length ?? 0
  )
  const wrongCount = computed(() => answeredCount.value - correctCount.value)
  const questionCount = computed(() => active.value?.questionCount ?? 0)
  const totalElapsedMs = computed(
    () => (active.value?.accumulatedElapsedMs ?? 0) + liveElapsedMs.value
  )
  const displayIndex = computed(() =>
    active.value ? Math.min(active.value.currentQuestionIndex + 1, Math.max(active.value.questionCount, 1)) : 0
  )
  const isLastQuestion = computed(
    () => isSpeed.value && answeredCount.value + 1 >= questionCount.value
  )
  const hasActiveSession = computed(() => active.value !== null)
  const isFromWrongQuestions = computed(() => active.value?.source === 'wrongQuestions')

  function startTimer(): void {
    stopTimer()
    questionStartMonotonic = now()
    questionStartIso = new Date().toISOString()
    liveElapsedMs.value = 0
    timerHandle = setInterval(() => {
      liveElapsedMs.value = elapsedSince(questionStartMonotonic)
    }, TIMER_INTERVAL_MS)
  }

  function stopTimer(): void {
    if (timerHandle !== null) {
      clearInterval(timerHandle)
      timerHandle = null
    }
  }

  /** 开始训练（§6.2 / §6.3） */
  async function start(options: StartTrainingOptions): Promise<ActiveSession> {
    const settingsStore = useSettingsStore()
    const weakStore = useWeakPatternStore()
    const settings = await settingsStore.ensureLoaded()
    const module = options.module ?? MODULE_FIVE_DIVIDE_THREE

    busy.value = true
    errorMessage.value = ''
    try {
      if (weakStore.patterns.length === 0) {
        await weakStore.load(module)
      }

      const started = await beginSession({
        module,
        mode: options.mode,
        questionCount: options.questionCount ?? settings.defaultQuestionCount,
        allowedErrorRate: options.allowedErrorRate ?? settings.defaultAllowedErrorRate,
        weakPatterns: weakStore.patterns,
        weakConfig: settings.weakPattern,
        source: options.source ?? 'random',
        presetQuestions: options.wrongQuestions ? wrongQuestionsToQuestions(options.wrongQuestions) : []
      })

      active.value = started
      feedback.value = null
      awaitingContinue.value = false
      pendingResume.value = null
      startTimer()
      return started
    } finally {
      busy.value = false
    }
  }

  /** 提交答案（§8.4） */
  async function submit(raw: string): Promise<SubmitOutcome> {
    if (!active.value || !question.value) return 'ignored'
    const settingsStore = useSettingsStore()
    const weakStore = useWeakPatternStore()
    const settings = await settingsStore.ensureLoaded()

    const elapsedMs = Math.max(1, elapsedSince(questionStartMonotonic))
    const startedAtIso = questionStartIso || new Date().toISOString()
    stopTimer()
    liveElapsedMs.value = elapsedMs

    const result = await submitAnswer(active.value, raw, elapsedMs, startedAtIso, {
      weakPatterns: weakStore.patterns,
      weakConfig: settings.weakPattern
    })

    active.value = result.active
    feedback.value = result.check

    if (result.isComplete) {
      await finish()
      return 'finished'
    }

    if (result.active.mode === 'speed') {
      // 竞速模式：训练过程中不提示任何正确/错误信息（§6.3.1）
      feedback.value = null
      startTimer()
    } else {
      // 训练模式：显示反馈，等待用户继续（§6.2.2）
      awaitingContinue.value = true
    }
    return 'answered'
  }

  /** 继续下一题（训练模式错误提示后） */
  function continueNext(): void {
    if (!active.value) return
    feedback.value = null
    awaitingContinue.value = false
    startTimer()
  }

  /** 重开本题：清空本题计时并重新开始，不产生任何作答记录 */
  function restartQuestion(): void {
    if (!active.value) return
    startTimer()
  }

  /** 结束训练并结算（训练模式主动结束 / 竞速模式全部完成） */
  async function finish(): Promise<TrainingSession | null> {
    const current = active.value
    if (!current) return null
    stopTimer()
    busy.value = true
    try {
      const session = await finishSession(current)
      lastResult.value = session
      lastRecords.value = await questionsRepo.listQuestionsBySession(session.id)
      active.value = null
      feedback.value = null
      awaitingContinue.value = false
      liveElapsedMs.value = 0
      await useWeakPatternStore().refresh(session.module)
      return session
    } finally {
      busy.value = false
    }
  }

  /** 主动结束训练（§6.2）；未作答任何题目时视为放弃 */
  async function endTraining(): Promise<TrainingSession | null> {
    if (!active.value) return null
    if (active.value.answers.length === 0) {
      await abandon()
      return null
    }
    return finish()
  }

  /** 放弃训练（§9）：删除活动训练，不计入正式统计 */
  async function abandon(): Promise<void> {
    const current = active.value
    stopTimer()
    if (current) {
      await abandonSession(current)
    }
    active.value = null
    feedback.value = null
    awaitingContinue.value = false
    liveElapsedMs.value = 0
  }

  /** 检测未完成训练（§9） */
  async function detectUnfinished(module: string = MODULE_FIVE_DIVIDE_THREE): Promise<ActiveSession | null> {
    const found = await activeSessionsRepo.getActiveSession(module)
    pendingResume.value = found
    return found
  }

  /** 继续未完成训练 */
  async function resume(session?: ActiveSession): Promise<ActiveSession | null> {
    const target = session ?? pendingResume.value
    if (!target) return null
    active.value = target
    pendingResume.value = null
    feedback.value = null
    awaitingContinue.value = false
    startTimer()
    return target
  }

  /** 丢弃未完成训练（§9：删除 activeSession，不计入正式统计） */
  async function discardUnfinished(): Promise<void> {
    const target = pendingResume.value
    if (target) {
      await activeSessionsRepo.clearActiveSession(target.id)
    }
    pendingResume.value = null
  }

  /** 若活动训练已满足完成条件则直接结算（例如竞速最后一题后关闭页面） */
  async function settleIfComplete(): Promise<TrainingSession | null> {
    const current = active.value
    if (!current) return null
    if (current.mode === 'speed' && current.answers.length >= current.questionCount) {
      return finish()
    }
    return null
  }

  /** 读取历史训练组结果（结算页面刷新后仍可查看） */
  async function loadResult(sessionId: string): Promise<TrainingSession | null> {
    const session = await loadSession(sessionId)
    if (!session) return null
    lastResult.value = session
    lastRecords.value = await questionsRepo.listQuestionsBySession(sessionId)
    return session
  }

  /** 仅用于测试/调试：当前训练组的实时记录快照 */
  function snapshotSession(): TrainingSession | null {
    return active.value ? sessionFromActive(active.value, 'active') : null
  }

  return {
    active,
    question,
    feedback,
    awaitingContinue,
    liveElapsedMs,
    lastResult,
    lastRecords,
    pendingResume,
    busy,
    errorMessage,
    isTraining,
    isSpeed,
    answeredCount,
    correctCount,
    wrongCount,
    questionCount,
    totalElapsedMs,
    displayIndex,
    isLastQuestion,
    hasActiveSession,
    isFromWrongQuestions,
    start,
    submit,
    continueNext,
    restartQuestion,
    finish,
    endTraining,
    abandon,
    detectUnfinished,
    resume,
    discardUnfinished,
    settleIfComplete,
    loadResult,
    snapshotSession,
    stopTimer
  }
})
