<script setup lang="ts">
/**
 * 训练页面（§6.6 / §6.7 / §8）
 *
 * 布局对齐用户提供的参考 App 截图：
 *   顶部：模式/进度 → 题目「65776 ÷ 301 =」→ 答案填空线 → 允许误差 / 用时 / 等级用时速查
 *   底部：应用自带数字键盘（重开 清空 退格 / 1-9 / . 0 确认）贴在屏幕底部
 *
 * - 训练模式：答错立即提示（正确答案 / 误差），确认后进入下一题；答对显示极短 ✓ 反馈后自动进入下一题
 * - 竞速模式：提交后不显示任何正确/错误信息，直接进入下一题（§6.3.1）
 * - 计时使用单调时钟（§8.2），并同时记录单题用时与总用时（§6.3.2）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import AnswerInput from '@/components/training/AnswerInput.vue'
import NumericKeypad from '@/components/training/NumericKeypad.vue'
import FeedbackPanel from '@/components/training/FeedbackPanel.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { GRADE_THRESHOLDS_MS } from '@/config/trainingConfig'
import { useTrainingStore } from '@/app/stores/training'
import { formatMs, formatDuration } from '@/services/format'
import { formatNumber } from '@/modules/arithmetic/five-divide-three/calculator'
import { MODULE_SIGNED_ADD_SUB } from '@/config/trainingConfig'
import { useAnswerInput } from '@/composables/useAnswerInput'

const router = useRouter()
const trainingStore = useTrainingStore()

const answer = ref('')
const answerInput = ref<InstanceType<typeof AnswerInput> | null>(null)
const showAbandonDialog = ref(false)
const submitting = ref(false)
const briefCorrect = ref(false)
const restartNotice = ref(false)

/** 当前是否为正负运算模块（整数精确作答，无误差容忍） */
const isSignedModule = computed(() => trainingStore.active?.module === MODULE_SIGNED_ADD_SUB)

const { pressKey, backspace, clear, toggleSign } = useAnswerInput(answer, isSignedModule)

const question = computed(() => trainingStore.question)
const isTrainingMode = computed(() => trainingStore.isTraining)
const isSpeedMode = computed(() => trainingStore.isSpeed)
const awaitingContinue = computed(() => trainingStore.awaitingContinue)
const feedback = computed(() => trainingStore.feedback)
const allowedErrorRate = computed(() => trainingStore.active?.allowedErrorRate ?? 3)
const inputLocked = computed(() => submitting.value || !question.value || awaitingContinue.value)

/** 正确答案展示：正负运算显示整数，五除三显示两位小数 */
const correctAnswerLabel = computed(() => {
  const value = feedback.value?.correctAnswer
  if (value === null || value === undefined) return '—'
  return isSignedModule.value ? String(value) : formatNumber(value)
})

const progressLabel = computed(() => {
  if (isSpeedMode.value) {
    const current = Math.min(trainingStore.answeredCount + 1, trainingStore.questionCount)
    return `${String(current).padStart(2, '0')} / ${String(trainingStore.questionCount).padStart(2, '0')}`
  }
  return `第 ${trainingStore.answeredCount + 1} 题`
})

/** 等级用时速查（与 §10.1 保持一致，阈值取自配置，不写死） */
const legendTitle = computed(() =>
  isSpeedMode.value ? `${trainingStore.questionCount}题用时` : '全对时用时'
)
const legendItems = computed(() => [
  { label: '合格', seconds: GRADE_THRESHOLDS_MS.pass / 1000 },
  { label: '良好', seconds: GRADE_THRESHOLDS_MS.good / 1000 },
  { label: '优秀', seconds: GRADE_THRESHOLDS_MS.excellent / 1000 }
])

const questionTimerLabel = computed(() => formatMs(trainingStore.liveElapsedMs))
const totalTimerLabel = computed(() => formatDuration(trainingStore.totalElapsedMs))

let autoContinueHandle: ReturnType<typeof setTimeout> | null = null
let restartNoticeHandle: ReturnType<typeof setTimeout> | null = null

function clearAutoContinue(): void {
  if (autoContinueHandle !== null) {
    clearTimeout(autoContinueHandle)
    autoContinueHandle = null
  }
}

async function focusInput(): Promise<void> {
  await nextTick()
  answerInput.value?.focus()
}

async function submitAnswer(): Promise<void> {
  if (submitting.value || awaitingContinue.value || !question.value) return
  const raw = answer.value
  submitting.value = true
  trainingStore.errorMessage = ''
  try {
    const outcome = await trainingStore.submit(raw)
    answer.value = ''
    if (outcome === 'finished') {
      const session = trainingStore.lastResult
      if (session) {
        await router.push({ name: 'result', params: { sessionId: session.id } })
      }
      return
    }
    if (outcome === 'answered' && isTrainingMode.value && feedback.value?.correct) {
      // 答对：极短的正确反馈后直接进入下一题（§6.2.1）
      briefCorrect.value = true
      clearAutoContinue()
      autoContinueHandle = setTimeout(() => {
        briefCorrect.value = false
        trainingStore.continueNext()
        void focusInput()
      }, 400)
    } else {
      await focusInput()
    }
  } catch (error) {
    // 提交失败必须显式告诉用户，避免出现“界面卡住但没有任何提示”的情况
    trainingStore.errorMessage = `提交失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    submitting.value = false
  }
}

async function continueNext(): Promise<void> {
  clearAutoContinue()
  briefCorrect.value = false
  trainingStore.continueNext()
  await focusInput()
}

/** 重开：清空输入并重新计时（不记录成绩，用于算错后重做本题） */
async function restartQuestion(): Promise<void> {
  clearAutoContinue()
  briefCorrect.value = false
  answer.value = ''
  trainingStore.restartQuestion()
  restartNotice.value = true
  if (restartNoticeHandle !== null) clearTimeout(restartNoticeHandle)
  restartNoticeHandle = setTimeout(() => {
    restartNotice.value = false
    restartNoticeHandle = null
  }, 900)
  await focusInput()
}

async function endTraining(): Promise<void> {
  const session = await trainingStore.endTraining()
  if (session) {
    await router.push({ name: 'result', params: { sessionId: session.id } })
  } else {
    await router.push({ name: 'home' })
  }
}

async function abandonTraining(): Promise<void> {
  await trainingStore.abandon()
  showAbandonDialog.value = false
  await router.push({ name: 'home' })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  if (awaitingContinue.value) {
    event.preventDefault()
    void continueNext()
  }
}

watch(
  () => trainingStore.awaitingContinue,
  (value) => {
    if (value) {
      clearAutoContinue()
    }
  }
)

onMounted(async () => {
  if (!trainingStore.hasActiveSession) {
    const found = await trainingStore.detectUnfinished()
    if (found) {
      await trainingStore.resume(found)
    } else {
      await router.replace({ name: 'five-divide-three' })
      return
    }
  }
  await trainingStore.settleIfComplete()
  window.addEventListener('keydown', onKeydown)
  await focusInput()
})

onBeforeUnmount(() => {
  clearAutoContinue()
  window.removeEventListener('keydown', onKeydown)
  trainingStore.stopTimer()
  if (restartNoticeHandle !== null) clearTimeout(restartNoticeHandle)
})

/** 训练过程中不能切换模式或离开（§6.8） */
onBeforeRouteLeave(() => {
  if (trainingStore.hasActiveSession) {
    showAbandonDialog.value = true
    return false
  }
  return true
})
</script>

<template>
  <div class="training-screen">
    <div class="training-panel">
      <!-- 顶部信息区：模式/进度、题目、答案、参数与用时 -->
      <div class="training-head">
        <div class="training-progress">
          {{ isSpeedMode ? '竞速模式' : '训练模式' }}
          <span class="text-muted"> · </span>
          {{ progressLabel }}
        </div>

        <div v-if="question" class="training-question">
          {{ question.text }} =
        </div>
        <div v-else class="text-muted">正在准备题目…</div>

        <AnswerInput
          ref="answerInput"
          v-model="answer"
          :disabled="inputLocked"
          :autofocus="!awaitingContinue"
          :allow-negative="isSignedModule"
          @submit="submitAnswer"
        />

        <div class="training-meta">
          <span v-if="isSignedModule">精确作答</span>
          <span v-else>允许误差 ±{{ allowedErrorRate }}%</span>
        </div>
      </div>

      <!-- 中间弹性区：反馈 / 提示 / 状态；空间不足时只有它内部滚动 -->
      <div class="training-extras">
        <div v-if="trainingStore.errorMessage" class="alert alert-danger" style="width: min(460px, 96vw)">
          <p style="margin: 0 0 8px">{{ trainingStore.errorMessage }}</p>
          <button type="button" class="btn btn-outline btn-sm" @click="trainingStore.errorMessage = ''">
            知道了
          </button>
        </div>

        <div v-if="briefCorrect" class="feedback-panel feedback-correct" style="width: auto; padding: 14px 24px">
          <span class="bold text-success" style="font-size: 1.35rem">✓ 正确</span>
        </div>

        <div v-else-if="restartNotice" class="training-restart-notice" role="status" aria-live="polite">
          本题已重开，计时已归零
        </div>

        <FeedbackPanel
          v-else-if="awaitingContinue && feedback"
          :check="feedback"
          :module="trainingStore.active?.module"
          @continue="continueNext"
        />

        <div v-if="question && question.origin === 'weak'" class="badge badge-warning">
          薄弱点强化
          <template v-if="question.weakRange">
            {{ question.weakRange.min }}–{{ question.weakRange.max }}
          </template>
        </div>
        <div v-if="trainingStore.isFromWrongQuestions" class="badge badge-muted">错题重练</div>

        <div v-if="trainingStore.answeredCount > 0" class="text-xs text-muted">
          已答对 {{ trainingStore.correctCount }} 题 / 已作答 {{ trainingStore.answeredCount }} 题
          <template v-if="feedback && !feedback.correct && awaitingContinue">
            · 正确答案 {{ correctAnswerLabel }}
          </template>
        </div>
      </div>

      <!-- 底部键盘区：固定在可见区域底部；答错反馈时该位置变成「继续」大按钮 -->
      <div class="training-keypad">
        <template v-if="awaitingContinue">
          <button
            type="button"
            class="btn btn-primary btn-lg btn-block training-continue"
            @click="continueNext"
          >
            继续（Enter）
          </button>
        </template>
        <template v-else>
          <NumericKeypad
            :disabled="inputLocked"
            :allow-negative="isSignedModule"
            @key="pressKey"
            @backspace="backspace"
            @clear="clear"
            @restart="restartQuestion"
            @submit="submitAnswer"
            @toggle-sign="toggleSign"
          />
          <p class="text-xs text-muted training-keypad-hint" style="margin: 0">
            重开 = 清空并重新计时（不计入成绩） · 退格删除一位 · 确认提交
          </p>
        </template>

        <div v-if="isSpeedMode" class="text-xs text-muted training-keypad-hint">
          竞速模式：训练过程中不显示正确 / 错误，完成后统一结算（正确率不参与等级评定）
        </div>
        <div v-else-if="!awaitingContinue" class="text-xs text-muted">
          已训练 {{ trainingStore.answeredCount }} 题 ·
          <button type="button" class="btn btn-outline btn-sm" @click="endTraining">结束训练</button>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    :open="showAbandonDialog"
    title="训练尚未结束"
    message="训练过程中不能切换模式或离开页面。是否放弃本次训练？（放弃后不计入正式训练统计）"
    confirm-text="放弃本次训练"
    cancel-text="继续训练"
    danger
    @confirm="abandonTraining"
    @cancel="showAbandonDialog = false"
  />
</template>
