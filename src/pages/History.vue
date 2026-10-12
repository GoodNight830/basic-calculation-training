<script setup lang="ts">
/**
 * 训练记录页面（§17 / §27）
 *
 * - §17.2：时间范围 今天 / 近7天 / 近30天 / 全部
 * - §27：按天分组展示「训练 N 组 / 共 M 题」「正确率」「平均单题」，并列出当天的训练组
 * - 正确率只用于统计分析，不参与优秀 / 良好 / 合格等级计算（§17.3）
 * - 数据只通过 @/services/queries 读取，页面不直接访问 IndexedDB
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import GradeBadge from '@/components/common/GradeBadge.vue'
import StatCard from '@/components/common/StatCard.vue'
import {
  TIME_RANGE_LABELS,
  formatDateTime,
  formatDuration,
  formatMs,
  formatPercent,
  relativeDayLabel,
  type TimeRange
} from '@/services/format'
import { loadHistory, type HistoryData } from '@/services/queries'

const RANGE_KEYS: readonly TimeRange[] = ['today', '7d', '30d', 'all']

const router = useRouter()

const range = ref<TimeRange>('7d')
const data = ref<HistoryData | null>(null)
const loading = ref(true)

const summary = computed(() => data.value?.summary ?? null)
const daily = computed(() => data.value?.daily ?? [])
const hasRecords = computed(() => daily.value.length > 0)
const accuracyLabel = computed(() => {
  const current = summary.value
  if (!current || current.questionCount === 0) return '—'
  return formatPercent(current.accuracy)
})

async function reload(): Promise<void> {
  loading.value = true
  try {
    data.value = await loadHistory(range.value)
  } finally {
    loading.value = false
  }
}

function selectRange(key: TimeRange): void {
  if (range.value === key) return
  range.value = key
}

function openSession(sessionId: string): void {
  void router.push({ name: 'result', params: { sessionId } })
}

function modeLabel(mode: 'training' | 'speed'): string {
  return mode === 'speed' ? '竞速模式' : '训练模式'
}

watch(range, () => {
  void reload()
})

onMounted(() => {
  void reload()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">训练记录</h1>
        <p class="page-subtitle">正确率仅用于统计分析，不参与优秀 / 良好 / 合格等级计算</p>
      </div>
    </div>

    <div class="tabs">
      <button
        v-for="key in RANGE_KEYS"
        :key="key"
        type="button"
        class="tab"
        :class="{ active: range === key }"
        @click="selectRange(key)"
      >
        {{ TIME_RANGE_LABELS[key] }}
      </button>
    </div>

    <div v-if="loading" class="empty">正在加载训练记录…</div>

    <template v-else-if="hasRecords && summary">
      <div class="section">
        <h2 class="section-title">统计概览 · {{ TIME_RANGE_LABELS[range] }}</h2>
        <div class="stat-grid">
          <StatCard label="训练组数" :value="summary.sessionCount" />
          <StatCard label="题目数" :value="summary.questionCount" />
          <StatCard label="正确率" :value="accuracyLabel" small />
          <StatCard label="平均单题用时" :value="formatMs(summary.avgElapsedMs)" small />
          <StatCard label="总训练时间" :value="formatDuration(summary.totalElapsedMs)" small />
          <StatCard label="错误题数" :value="summary.wrongCount" />
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">按天记录</h2>

        <div v-for="day in daily" :key="day.date" class="card">
          <div class="row-between">
            <span class="card-title">{{ relativeDayLabel(day.date) }}</span>
            <span class="text-xs text-muted mono">{{ day.date }}</span>
          </div>
          <p class="card-subtitle">训练 {{ day.sessionCount }} 组 / 共 {{ day.questionCount }} 题</p>
          <div class="row row-wrap text-sm" style="margin-top: 8px; gap: 14px">
            <span>
              正确率
              <span class="bold mono">{{ formatPercent(day.accuracy) }}</span>
            </span>
            <span>
              平均单题
              <span class="bold mono">{{ formatMs(day.avgElapsedMs) }}</span>
            </span>
          </div>

          <div class="divider" />

          <div class="list">
            <button
              v-for="session in day.sessions"
              :key="session.id"
              type="button"
              class="list-item card-interactive"
              @click="openSession(session.id)"
            >
              <div class="list-item-main">
                <span class="row" style="gap: 8px">
                  <GradeBadge v-if="session.mode === 'speed'" :grade="session.grade" />
                  <span v-else class="badge badge-muted">训练模式</span>
                  <span class="mono text-sm">{{ formatDuration(session.totalElapsedMs) }}</span>
                </span>
                <span class="mono text-sm">
                  {{ session.correctCount }} / {{ session.answeredCount }}
                </span>
              </div>
              <div class="list-item-meta">
                {{ modeLabel(session.mode) }} · {{ formatDateTime(session.startedAt) }}
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>

    <EmptyState
      v-else
      title="还没有训练记录"
      description="完成一组训练后，这里会按天显示训练组数、题目数与正确率"
    >
      <button
        type="button"
        class="btn btn-primary"
        @click="router.push({ name: 'five-divide-three' })"
      >
        开始训练
      </button>
    </EmptyState>
  </div>
</template>
