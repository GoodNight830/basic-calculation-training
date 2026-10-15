<script setup lang="ts">
/**
 * 结算页面（§11 / §6.2.3）
 *
 * - 竞速模式：显示等级（优秀/良好/合格/加油）、用时、正确数、逐题记录
 * - 训练模式：显示本次训练统计，不把等级作为重点
 * - §11：默认只展开错误题的详细信息
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useTrainingStore } from '@/app/stores/training'
import { useSettingsStore } from '@/app/stores/settings'
import BookmarkButton from '@/components/common/BookmarkButton.vue'
import { gradeDescription, gradeLabel } from '@/services/grading'
import { formatDuration, formatMs, formatPercent } from '@/services/format'
import { formatErrorRate, formatNumber } from '@/modules/arithmetic/five-divide-three/calculator'
import { maybeAutoAnalyze } from '@/services/queries'
import type { QuestionRecord } from '@/types'

const props = defineProps<{ sessionId: string }>()

const router = useRouter()
const trainingStore = useTrainingStore()
const settingsStore = useSettingsStore()

const loading = ref(true)
const notFound = ref(false)
const restarting = ref(false)
const showRestartDialog = ref(false)

const session = computed(() => trainingStore.lastResult)
const records = computed<QuestionRecord[]>(() => trainingStore.lastRecords)
const isSpeed = computed(() => session.value?.mode === 'speed')

const wrongRecords = computed(() => records.value.filter((r) => !r.correct))
const accuracy = computed(() => {
  const total = records.value.length
  if (total === 0) return 0
  return (records.value.filter((r) => r.correct).length / total) * 100
})
const avgElapsedMs = computed(() => {
  if (records.value.length === 0) return 0
  return session.value ? session.value.totalElapsedMs / records.value.length : 0
})

const gradeClass = computed(() => {
  switch (session.value?.grade) {
    case 'excellent':
      return 'grade-excellent'
    case 'good':
      return 'grade-good'
    case 'pass':
      return 'grade-pass'
    default:
      return 'grade-encourage'
  }
})

const circleNumber = (index: number): string => {
  const circles = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
  return circles[index - 1] ?? `(${index})`
}

onMounted(async () => {
  await settingsStore.ensureLoaded()
  if (!trainingStore.lastResult || trainingStore.lastResult.id !== props.sessionId) {
    const loaded = await trainingStore.loadResult(props.sessionId)
    if (!loaded) notFound.value = true
  }
  loading.value = false
  // 训练结算后按 AI 自动分析策略判断是否自动生成报告（静默，不阻塞结算页）
  if (session.value) void maybeAutoAnalyze(session.value.module)
})

async function restartSameMode(): Promise<void> {
  const current = session.value
  if (!current) return
  restarting.value = true
  try {
    const settings = settingsStore.settings
    await trainingStore.start({
      module: current.module,
      mode: current.mode,
      questionCount: current.mode === 'speed' ? current.questionCount : settings.defaultQuestionCount,
      allowedErrorRate: current.allowedErrorRate
    })
    showRestartDialog.value = false
    await router.push({ name: 'training' })
  } finally {
    restarting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div v-if="loading" class="empty">正在加载训练结果…</div>

    <EmptyState v-else-if="notFound || !session" title="没有找到这次训练记录">
      <button type="button" class="btn btn-primary" @click="router.push({ name: 'home' })">返回首页</button>
    </EmptyState>

    <template v-else>
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ isSpeed ? '本组完成' : '训练结束' }}</h1>
          <p class="page-subtitle">
            {{ isSpeed ? '竞速模式' : '训练模式' }} · 允许误差 {{ session.allowedErrorRate }}%
          </p>
        </div>
      </div>

      <div class="grade-hero section">
        <template v-if="isSpeed">
          <div class="grade-value" :class="gradeClass">{{ gradeLabel(session.grade) }}</div>
          <p class="text-sm text-muted" style="margin: 6px 0 0">{{ gradeDescription(session.grade) }}</p>
        </template>
        <template v-else>
          <div class="grade-value grade-good">已完成 {{ session.answeredCount }} 题</div>
          <p class="text-sm text-muted" style="margin: 6px 0 0">
            训练模式用于学习与纠错，不以等级作为训练结果
          </p>
        </template>
        <div class="divider" />
        <div class="row" style="justify-content: center; gap: 22px; flex-wrap: wrap">
          <div>
            <div class="text-xs text-muted">总用时</div>
            <div class="text-lg bold mono">{{ formatDuration(session.totalElapsedMs) }}</div>
          </div>
          <div>
            <div class="text-xs text-muted">正确</div>
            <div class="text-lg bold mono">{{ session.correctCount }} / {{ session.answeredCount }}</div>
          </div>
          <div>
            <div class="text-xs text-muted">正确率</div>
            <div class="text-lg bold mono">{{ formatPercent(accuracy) }}</div>
          </div>
          <div>
            <div class="text-xs text-muted">平均单题</div>
            <div class="text-lg bold mono">{{ formatMs(avgElapsedMs) }}</div>
          </div>
        </div>
        <p v-if="isSpeed" class="text-xs text-muted" style="margin: 12px 0 0">
          等级只由「是否全对 + 总用时」决定，正确率仅用于统计分析
        </p>
      </div>

      <div class="section">
        <h2 class="section-title">题目记录</h2>
        <p v-if="wrongRecords.length === 0" class="text-sm text-success">本组没有错误题 🎉</p>
        <div class="list">
          <div v-for="(record, index) in records" :key="record.id" class="list-item">
            <div class="list-item-main">
              <span class="question-text">
                {{ circleNumber(index + 1) }} {{ record.question }}
              </span>
              <span class="row" style="gap: 6px">
                <span class="mono text-sm text-muted">{{ formatMs(record.elapsedMs) }}</span>
                <span :class="record.correct ? 'text-success bold' : 'text-danger bold'">
                  {{ record.correct ? '✓' : '✕' }}
                </span>
              </span>
            </div>
            <div v-if="!record.correct" class="list-item-meta mono">
              <div>你的答案：{{ formatNumber(record.userAnswer) }}</div>
              <div>正确答案：{{ formatNumber(record.correctAnswer) }}</div>
              <div>误差：{{ formatErrorRate(record.errorRate) }}</div>
            </div>
            <div v-else-if="record.origin === 'weak'" class="list-item-meta">
              <span class="badge badge-warning">
                薄弱点强化
                <template v-if="record.weakRange"> {{ record.weakRange.min }}–{{ record.weakRange.max }}</template>
              </span>
            </div>
            <div class="list-item-meta" style="margin-top: 6px">
              <BookmarkButton
                :module="record.module"
                :question="record.question"
                :dividend="record.dividend"
                :divisor="record.divisor"
                :correct-answer="record.correctAnswer"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="btn-row section">
        <button type="button" class="btn btn-primary" :disabled="restarting" @click="restartSameMode">
          再来一组
        </button>
        <button v-if="wrongRecords.length > 0" type="button" class="btn btn-secondary" @click="router.push({ name: 'wrong' })">
          查看错题（{{ wrongRecords.length }}）
        </button>
        <button type="button" class="btn btn-outline" @click="router.push({ name: 'history' })">训练记录</button>
        <button type="button" class="btn btn-ghost" @click="router.push({ name: 'home' })">返回首页</button>
      </div>
    </template>

    <ConfirmDialog
      :open="showRestartDialog"
      title="重新开始"
      message="将开始一组新的训练。"
      confirm-text="开始"
      :busy="restarting"
      @confirm="restartSameMode"
      @cancel="showRestartDialog = false"
    />
  </div>
</template>
