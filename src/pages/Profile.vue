<script setup lang="ts">
/**
 * 个人数据页（信息架构 v3）：
 * - 概览卡（图标化）：总题数 / 训练组 / 正确率 / 收藏 / 错题 / 已掌握
 * - 模块分布饼状图：自动读取所有有做题记录的模块
 * - 训练记录：模块下拉 + 时间范围 + 按天分组，可展开到题目级（支持收藏/笔记）
 * - 收藏列表：已收藏题目与笔记
 *
 * 数据一律通过 @/services/queries 读取，不直接访问 IndexedDB（§34）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import StatCard from '@/components/common/StatCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import GradeBadge from '@/components/common/GradeBadge.vue'
import BookmarkButton from '@/components/common/BookmarkButton.vue'
import {
  loadProfileData,
  loadHistory,
  loadSessionRecords,
  loadBookmarks,
  type HistoryData,
  type ModuleStat,
  type ProfileData
} from '@/services/queries'
import { findArithmeticModule } from '@/modules/arithmetic/registry'
import {
  TIME_RANGE_LABELS,
  formatDateTime,
  formatDuration,
  formatMs,
  formatPercent,
  relativeDayLabel,
  type TimeRange
} from '@/services/format'
import type { QuestionRecord, Bookmark } from '@/types'

const RANGE_KEYS: readonly TimeRange[] = ['today', '7d', '30d', 'all']
/** 饼状图配色（按模块顺序取用） */
const PIE_COLORS = ['#4f7cff', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b']

const loading = ref(true)
const profile = ref<ProfileData | null>(null)
const history = ref<HistoryData | null>(null)
const historyLoading = ref(false)
const moduleFilter = ref<string>('')
const range = ref<TimeRange>('7d')
const expandedSession = ref<string | null>(null)
const sessionRecords = ref<Record<string, QuestionRecord[]>>({})
const bookmarks = ref<Bookmark[]>([])
const errorText = ref('')

const total = computed(() => profile.value?.total ?? null)
const modules = computed<ModuleStat[]>(() => profile.value?.modules ?? [])
const summary = computed(() => history.value?.summary ?? null)
const daily = computed(() => history.value?.daily ?? [])
const hasRecords = computed(() => daily.value.length > 0)

/** 模块下拉选项：全部 + 各模块 */
const moduleOptions = computed(() => {
  const list = modules.value.map((m) => ({ value: m.module, label: moduleLabel(m.module) }))
  return [{ value: '', label: '全部模块' }, ...list]
})

function moduleLabel(moduleId: string): string {
  return findArithmeticModule(moduleId)?.meta.title ?? moduleId
}

/** 饼状图 SVG：按题目数占比绘制扇区 */
const pieSegments = computed(() => {
  const list = modules.value
  const totalCount = list.reduce((sum, m) => sum + m.questionCount, 0)
  if (totalCount === 0) return []
  let acc = 0
  return list.map((m, i) => {
    const start = (acc / totalCount) * 360
    acc += m.questionCount
    const end = (acc / totalCount) * 360
    return {
      module: m.module,
      label: moduleLabel(m.module),
      questionCount: m.questionCount,
      percent: (m.questionCount / totalCount) * 100,
      color: PIE_COLORS[i % PIE_COLORS.length],
      start,
      end
    }
  })
})

function piePath(start: number, end: number, r: number): string {
  // 从圆心出发的扇区路径
  const a = ((start - 90) * Math.PI) / 180
  const b = ((end - 90) * Math.PI) / 180
  const x1 = 100 + r * Math.cos(a)
  const y1 = 100 + r * Math.sin(a)
  const x2 = 100 + r * Math.cos(b)
  const y2 = 100 + r * Math.sin(b)
  const largeArc = end - start > 180 ? 1 : 0
  return `M 100 100 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

async function reloadProfile(): Promise<void> {
  try {
    const [profileData, bookmarkList] = await Promise.all([loadProfileData(), loadBookmarks()])
    profile.value = profileData
    bookmarks.value = bookmarkList
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '个人数据加载失败'
  }
}

async function reloadHistory(): Promise<void> {
  historyLoading.value = true
  try {
    history.value = await loadHistory(range.value, moduleFilter.value || undefined)
    expandedSession.value = null
  } finally {
    historyLoading.value = false
  }
}

async function toggleSession(sessionId: string): Promise<void> {
  if (expandedSession.value === sessionId) {
    expandedSession.value = null
    return
  }
  expandedSession.value = sessionId
  if (!sessionRecords.value[sessionId]) {
    sessionRecords.value[sessionId] = await loadSessionRecords(sessionId)
  }
}

function selectModule(value: string): void {
  moduleFilter.value = value
}

function selectRange(key: TimeRange): void {
  if (range.value === key) return
  range.value = key
}

function modeLabel(mode: 'training' | 'speed'): string {
  return mode === 'speed' ? '竞速模式' : '训练模式'
}

watch([range, moduleFilter], () => {
  void reloadHistory()
})

onMounted(async () => {
  loading.value = true
  await reloadProfile()
  await reloadHistory()
  loading.value = false
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">个人数据</h1>
        <p class="page-subtitle">你的训练全景：模块分布、历史记录与收藏</p>
      </div>
    </div>

    <div v-if="errorText" class="alert alert-danger section">{{ errorText }}</div>
    <div v-if="loading" class="empty">正在整理个人数据…</div>

    <template v-else>
      <!-- 概览卡 -->
      <section class="section">
        <h2 class="section-title">概览</h2>
        <div class="stat-grid">
          <StatCard label="📝 总题数" :value="total ? total.questionCount : '—'" />
          <StatCard label="🏁 训练组" :value="total ? total.sessionCount : '—'" />
          <StatCard label="🎯 正确率" :value="total && total.questionCount ? formatPercent(total.accuracy) : '—'" small />
          <StatCard label="⏱ 训练时长" :value="total ? formatDuration(total.totalElapsedMs) : '—'" small />
          <StatCard label="⭐ 收藏" :value="profile?.bookmarkCount ?? 0" />
          <StatCard label="📕 错题" :value="profile?.wrongQuestionCount ?? 0" :hint="`已掌握 ${profile?.masteredWrongCount ?? 0}`" />
        </div>
      </section>

      <!-- 模块分布饼状图 -->
      <section class="section">
        <h2 class="section-title">模块训练分布</h2>
        <div v-if="pieSegments.length === 0" class="alert alert-info">还没有训练记录，完成一组训练后这里会显示各模块占比。</div>
        <div v-else class="card" style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap">
          <svg width="180" height="180" viewBox="0 0 200 200" role="img" aria-label="模块训练分布饼状图">
            <circle cx="100" cy="100" r="88" fill="#eef1f6" />
            <path
              v-for="seg in pieSegments"
              :key="seg.module"
              :d="piePath(seg.start, seg.end, 88)"
              :fill="seg.color"
            >
              <title>{{ seg.label }}：{{ seg.questionCount }} 题（{{ formatPercent(seg.percent) }}）</title>
            </path>
          </svg>
          <div class="list" style="flex: 1; min-width: 180px">
            <div v-for="seg in pieSegments" :key="seg.module" class="list-item">
              <div class="list-item-main">
                <span class="row" style="gap: 8px; align-items: center">
                  <span class="pie-dot" :style="{ background: seg.color }" />
                  <span class="bold">{{ seg.label }}</span>
                </span>
                <span class="mono text-sm text-muted">
                  {{ seg.questionCount }} 题 · {{ formatPercent(seg.percent) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 训练记录 -->
      <section class="section">
        <div class="row-between">
          <h2 class="section-title" style="margin: 0">训练记录</h2>
        </div>

        <div class="field" style="margin-top: 10px">
          <label class="field-label" for="profile-module">模块</label>
          <select id="profile-module" class="select" :value="moduleFilter" @change="selectModule(($event.target as HTMLSelectElement).value)">
            <option v-for="opt in moduleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <div class="tabs" style="margin-top: 10px">
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

        <div v-if="historyLoading" class="empty">正在加载训练记录…</div>
        <EmptyState
          v-else-if="!hasRecords"
          title="还没有训练记录"
          description="完成一组训练后，这里会按天显示训练组数、题目数与正确率"
        />

        <template v-else>
          <div class="section">
            <div class="stat-grid">
              <StatCard label="训练组数" :value="summary ? summary.sessionCount : '—'" />
              <StatCard label="题目数" :value="summary ? summary.questionCount : '—'" />
              <StatCard label="正确率" :value="summary && summary.questionCount ? formatPercent(summary.accuracy) : '—'" small />
              <StatCard label="平均单题" :value="summary ? formatMs(summary.avgElapsedMs) : '—'" small />
            </div>
          </div>

          <div v-for="day in daily" :key="day.date" class="card section">
            <div class="row-between">
              <span class="card-title">{{ relativeDayLabel(day.date) }}</span>
              <span class="text-xs text-muted mono">{{ day.date }}</span>
            </div>
            <p class="card-subtitle">训练 {{ day.sessionCount }} 组 / 共 {{ day.questionCount }} 题 · 正确率 {{ formatPercent(day.accuracy) }}</p>

            <div class="list" style="margin-top: 10px">
              <div v-for="session in day.sessions" :key="session.id" class="list-item">
                <button
                  type="button"
                  class="list-item-main card-interactive"
                  style="text-align: left; background: none; border: none; padding: 0; cursor: pointer"
                  @click="toggleSession(session.id)"
                >
                  <span class="row" style="gap: 8px">
                    <GradeBadge v-if="session.mode === 'speed'" :grade="session.grade" />
                    <span v-else class="badge badge-muted">训练模式</span>
                    <span class="mono text-sm">{{ formatDuration(session.totalElapsedMs) }}</span>
                    <span class="mono text-sm text-muted">{{ session.correctCount }}/{{ session.answeredCount }}</span>
                  </span>
                  <span class="list-item-meta">
                    {{ modeLabel(session.mode) }} · {{ formatDateTime(session.startedAt) }}
                    <span class="text-muted">{{ expandedSession === session.id ? ' ▴ 收起' : ' ▾ 展开题目' }}</span>
                  </span>
                </button>

                <div v-if="expandedSession === session.id" class="question-detail" style="margin-top: 8px; padding-left: 8px">
                  <div v-if="!sessionRecords[session.id]" class="text-xs text-muted">加载题目…</div>
                  <div v-else class="list">
                    <div v-for="record in sessionRecords[session.id]" :key="record.id" class="list-item">
                      <div class="list-item-main">
                        <span class="question-text">{{ record.question }}</span>
                        <span :class="record.correct ? 'text-success bold' : 'text-danger bold'">
                          {{ record.correct ? '✓' : '✕' }}
                        </span>
                      </div>
                      <div v-if="!record.correct" class="list-item-meta mono">
                        答案 {{ record.userAnswer ?? '—' }} → {{ record.correctAnswer }}
                      </div>
                      <div class="list-item-meta" style="margin-top: 4px">
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
              </div>
            </div>
          </div>
        </template>
      </section>

      <!-- 收藏列表 -->
      <section class="section">
        <div class="row-between">
          <h2 class="section-title" style="margin: 0">我的收藏</h2>
          <span class="text-xs text-muted">{{ bookmarks.length }} 题</span>
        </div>
        <div v-if="bookmarks.length === 0" class="alert alert-info" style="margin-top: 10px">
          还没有收藏题目。在训练结果或训练记录的题目里点「☆ 收藏」即可收藏。
        </div>
        <div v-else class="list" style="margin-top: 10px">
          <div v-for="b in bookmarks" :key="b.id" class="list-item">
            <div class="list-item-main">
              <span class="question-text">{{ b.question }}</span>
              <span class="badge badge-muted">{{ moduleLabel(b.module) }}</span>
            </div>
            <div v-if="b.note" class="list-item-meta">📝 {{ b.note }}</div>
            <div class="list-item-meta" style="margin-top: 4px">
              <BookmarkButton
                :module="b.module"
                :question="b.question"
                :dividend="b.dividend"
                :divisor="b.divisor"
                :correct-answer="b.correctAnswer"
              />
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
