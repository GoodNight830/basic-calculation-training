<script setup lang="ts">
/**
 * 个人薄弱点页面（§14 / §15 / §16 / §28）
 *
 * - §14：基于历史错误自动发现更易出错的除数百位范围，样本不足不判定
 * - §15：V1 按除数百位范围分析（100–199 / 200–299 …）
 * - §16：薄弱范围定向强化，比例受配置上限约束，改善后权重自动降低
 * - §28：展示错误率、总体错误率、样本、状态、最近趋势
 *
 * 页面不自己生成题目：点击「训练薄弱范围」直接开始训练，强化出题由题目生成器完成。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import StatCard from '@/components/common/StatCard.vue'
import { useSettingsStore } from '@/app/stores/settings'
import { useTrainingStore, type StartTrainingOptions } from '@/app/stores/training'
import { useWeakPatternStore } from '@/app/stores/weakPatterns'
import { formatPercent } from '@/services/format'
import { loadDataCounts, loadWrongQuestions } from '@/services/queries'
import { weakPatternSuggestion } from '@/services/weakPattern'
import type { WeakPattern, WeakPatternStatus } from '@/types'

type TabKey = 'all' | 'active' | 'resolved'
type DataCounts = Awaited<ReturnType<typeof loadDataCounts>>

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '强化中' },
  { key: 'resolved', label: '已解决' }
]

const STATUS_META: Record<WeakPatternStatus, { label: string; badgeClass: string }> = {
  active: { label: '强化中', badgeClass: 'badge-warning' },
  improving: { label: '改善中', badgeClass: '' },
  resolved: { label: '已解决', badgeClass: 'badge-success' }
}

const router = useRouter()
const weakStore = useWeakPatternStore()
const settingsStore = useSettingsStore()
const trainingStore = useTrainingStore()

const tab = ref<TabKey>('all')
const counts = ref<DataCounts | null>(null)
const initializing = ref(true)
const startingId = ref('')
const errorText = ref('')

const weakConfig = computed(() => settingsStore.weakConfig)
const reinforcementRatio = computed(() => weakStore.reinforcementRatio() * 100)
const reinforcementCap = computed(() => weakConfig.value.maxReinforcementRatio * 100)

const visiblePatterns = computed<WeakPattern[]>(() => {
  if (tab.value === 'active') return weakStore.activePatterns
  if (tab.value === 'resolved') return weakStore.resolvedPatterns
  return weakStore.patterns
})

const isEmpty = computed(
  () => !initializing.value && !weakStore.loading && weakStore.patterns.length === 0
)
const isTabEmpty = computed(
  () =>
    !initializing.value &&
    !weakStore.loading &&
    weakStore.patterns.length > 0 &&
    visiblePatterns.value.length === 0
)

const emptyDescription = computed(
  () =>
    `完成至少 ${weakConfig.value.minSampleCount} 道同范围题目（且错误达到 ${weakConfig.value.minErrorCount} 题）后，系统才会开始分析。`
)

function tabLabel(key: TabKey, label: string): string {
  const count =
    key === 'all'
      ? weakStore.patterns.length
      : key === 'active'
        ? weakStore.activePatterns.length
        : weakStore.resolvedPatterns.length
  return `${label}（${count}）`
}

function selectTab(key: TabKey): void {
  tab.value = key
}

function statusMeta(status: WeakPatternStatus): { label: string; badgeClass: string } {
  return STATUS_META[status]
}

function trendArrow(trend: WeakPattern['trend']): string {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return '→'
}

function trendClass(trend: WeakPattern['trend']): string {
  if (trend === 'up') return 'text-danger'
  if (trend === 'down') return 'text-success'
  return 'text-muted'
}

function trendLabel(trend: WeakPattern['trend']): string {
  if (trend === 'up') return '错误率上升'
  if (trend === 'down') return '错误率下降'
  return '基本持平'
}

async function reload(): Promise<void> {
  initializing.value = true
  try {
    await Promise.all([weakStore.load(), settingsStore.ensureLoaded()])
    counts.value = await loadDataCounts()
  } finally {
    initializing.value = false
  }
}

async function refresh(): Promise<void> {
  errorText.value = ''
  try {
    await weakStore.refresh()
    counts.value = await loadDataCounts()
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '重新分析失败，请稍后重试'
  }
}

/** 训练薄弱范围（§16）：优先练习该范围的现有错题，其余由题目生成器按权重强化 */
async function trainRange(pattern: WeakPattern): Promise<void> {
  if (startingId.value !== '') return
  startingId.value = pattern.id
  errorText.value = ''
  try {
    const wrongInRange = await loadWrongQuestions({
      status: 'active',
      rangeMin: pattern.rangeMin,
      rangeMax: pattern.rangeMax
    })
    const options: StartTrainingOptions = {
      module: pattern.module,
      mode: 'training',
      allowedErrorRate: settingsStore.settings.defaultAllowedErrorRate
    }
    if (wrongInRange.length > 0) {
      options.source = 'wrongQuestions'
      options.wrongQuestions = wrongInRange
    }
    await trainingStore.start(options)
    await router.push({ name: 'training' })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '开始训练失败，请稍后重试'
  } finally {
    startingId.value = ''
  }
}

onMounted(() => {
  void reload()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">个人薄弱点</h1>
        <p class="page-subtitle">系统按除数百位范围自动分析你的错误率，并定向强化薄弱范围</p>
      </div>
      <button
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="weakStore.loading"
        @click="refresh"
      >
        {{ weakStore.loading ? '分析中…' : '重新分析' }}
      </button>
    </div>

    <div class="alert alert-info section">
      系统按除数百位范围（如 800–899）分析错误率；样本不足（默认少于
      {{ weakConfig.minSampleCount }} 题或错误少于 {{ weakConfig.minErrorCount }} 题）时不会判定为薄弱点。
      范围错误率明显高于个人整体水平才会进入强化，且强化出题占比不超过配置上限
      {{ formatPercent(reinforcementCap, 0) }}；薄弱点改善后会自动降低强化权重，直至恢复普通随机训练。
      当前强化出题占比 {{ formatPercent(reinforcementRatio) }}。
    </div>

    <div v-if="errorText" class="alert alert-danger section">{{ errorText }}</div>

    <div class="tabs">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        class="tab"
        :class="{ active: tab === item.key }"
        @click="selectTab(item.key)"
      >
        {{ tabLabel(item.key, item.label) }}
      </button>
    </div>

    <div v-if="initializing && weakStore.patterns.length === 0" class="empty">
      正在分析薄弱点…
    </div>

    <EmptyState
      v-else-if="isEmpty"
      title="暂无薄弱点数据"
      :description="emptyDescription"
    >
      <p v-if="counts" class="text-sm" style="margin: 0 0 12px">
        当前已有 {{ counts.sessions }} 组训练 / {{ counts.questions }} 道题目 /
        {{ counts.wrongQuestions }} 道错题
      </p>
      <div class="btn-row" style="justify-content: center">
        <button
          type="button"
          class="btn btn-primary"
          @click="router.push({ name: 'five-divide-three' })"
        >
          开始训练
        </button>
        <button
          type="button"
          class="btn btn-outline"
          :disabled="weakStore.loading"
          @click="refresh"
        >
          重新分析
        </button>
      </div>
    </EmptyState>

    <div v-else-if="isTabEmpty" class="empty">当前分类下没有薄弱点记录。</div>

    <div v-else class="col">
      <div v-for="pattern in visiblePatterns" :key="pattern.id" class="card">
        <div class="row-between">
          <span class="card-title">除数 {{ pattern.rangeMin }}–{{ pattern.rangeMax }}</span>
          <span class="badge" :class="statusMeta(pattern.status).badgeClass">
            {{ statusMeta(pattern.status).label }}
          </span>
        </div>

        <div class="stat-grid" style="margin-top: 10px">
          <StatCard label="错误率" :value="formatPercent(pattern.errorRate)" small />
          <StatCard label="总体错误率" :value="formatPercent(pattern.overallErrorRate)" small />
          <StatCard
            label="样本"
            :value="`${pattern.sampleCount} 题`"
            :hint="`错误 ${pattern.errorCount} 题`"
            small
          />
          <StatCard
            label="强化权重"
            :value="formatPercent(pattern.reinforcementWeight * 100)"
            :hint="`权重 ${pattern.reinforcementWeight.toFixed(2)}`"
            small
          />
        </div>

        <div class="divider" />

        <div class="row-between text-sm">
          <span class="text-muted">最近趋势</span>
          <span class="bold" :class="trendClass(pattern.trend)">
            {{ trendArrow(pattern.trend) }} {{ trendLabel(pattern.trend) }}
          </span>
        </div>
        <div class="row-between text-sm" style="margin-top: 6px">
          <span class="text-muted">最近窗口错误率</span>
          <span class="mono">
            {{ formatPercent(pattern.recentErrorRate) }}（最近 {{ pattern.recentSampleCount }} 题）
          </span>
        </div>

        <p class="text-sm text-muted" style="margin: 10px 0 0">{{ weakPatternSuggestion(pattern) }}</p>

        <div class="btn-row" style="margin-top: 12px">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="startingId !== ''"
            @click="trainRange(pattern)"
          >
            {{ startingId === pattern.id ? '正在开始…' : '训练薄弱范围' }}
          </button>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            @click="router.push({ name: 'wrong' })"
          >
            查看错题
          </button>
        </div>
        <p class="field-hint">
          薄弱范围强化由题目生成器自动完成，强化题占比不超过
          {{ formatPercent(reinforcementCap, 0) }}（可在设置中调整）。
        </p>
      </div>
    </div>
  </div>
</template>
