<script setup lang="ts">
/**
 * 错题页面（§12 / §13）
 *
 * - §12.2：每条错题显示题目、错误次数、最近错误时间、平均用时，可展开查看答案与误差
 * - §12.3：「标记已掌握」只改变状态，原始历史数据保留
 * - §13：训练全部错题 / 训练未掌握错题 / 训练某个范围错题；错题重练会新建训练组记录新数据
 *
 * 数据只通过 @/services/queries 与 @/app/stores/training 读写，页面不直接访问 IndexedDB。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { useTrainingStore } from '@/app/stores/training'
import { formatMs, relativeDayLabel } from '@/services/format'
import { formatErrorRate, formatNumber } from '@/modules/arithmetic/five-divide-three/calculator'
import {
  loadWrongQuestionRanges,
  loadWrongQuestions,
  setManyWrongQuestionsMastered,
  setWrongQuestionMastered
} from '@/services/queries'
import type { WrongQuestion, WrongQuestionStatus } from '@/types'

type TabKey = 'all' | 'active' | 'mastered'

interface RangeOption {
  rangeMin: number
  rangeMax: number
  count: number
}

const TABS: ReadonlyArray<{ key: TabKey; label: string; status?: WrongQuestionStatus }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '未掌握', status: 'active' },
  { key: 'mastered', label: '已掌握', status: 'mastered' }
]

const router = useRouter()
const trainingStore = useTrainingStore()

const tab = ref<TabKey>('active')
const items = ref<WrongQuestion[]>([])
const ranges = ref<RangeOption[]>([])
const expandedIds = ref<string[]>([])
const selectedIds = ref<string[]>([])
const selectedRangeKey = ref('')
const loading = ref(true)
const busy = ref(false)
const errorText = ref('')

const isEmpty = computed(() => !loading.value && items.value.length === 0)
const emptyTitle = computed(() => {
  if (tab.value === 'active') return '没有未掌握的错题'
  if (tab.value === 'mastered') return '还没有已掌握的错题'
  return '还没有错题'
})
const emptyDescription = computed(() => {
  if (tab.value === 'active') return '当前错题都已标记为已掌握，可切换到「已掌握」查看'
  if (tab.value === 'mastered') return '错题答对或手动标记为已掌握后会显示在这里'
  return '答错的题目会自动进入错题本，之后可以在这里重新训练'
})
const selectedCount = computed(() => selectedIds.value.length)
const allSelected = computed(
  () => items.value.length > 0 && selectedIds.value.length === items.value.length
)
const selectedRange = computed(
  () => ranges.value.find((range) => rangeKey(range) === selectedRangeKey.value) ?? null
)

function rangeKey(range: { rangeMin: number; rangeMax: number }): string {
  return `${range.rangeMin}-${range.rangeMax}`
}

async function reload(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    const status = TABS.find((item) => item.key === tab.value)?.status
    const [list, rangeList] = await Promise.all([
      loadWrongQuestions(status ? { status } : {}),
      loadWrongQuestionRanges()
    ])
    items.value = list
    ranges.value = rangeList
    const idSet = new Set(list.map((question) => question.id))
    selectedIds.value = selectedIds.value.filter((id) => idSet.has(id))
    expandedIds.value = expandedIds.value.filter((id) => idSet.has(id))
    if (!rangeList.some((range) => rangeKey(range) === selectedRangeKey.value)) {
      selectedRangeKey.value = ''
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '错题加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function selectTab(key: TabKey): void {
  if (tab.value === key) return
  tab.value = key
  selectedIds.value = []
  void reload()
}

function selectRange(key: string): void {
  selectedRangeKey.value = selectedRangeKey.value === key ? '' : key
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id)
}

function isExpanded(id: string): boolean {
  return expandedIds.value.includes(id)
}

function toggleSelect(id: string): void {
  selectedIds.value = isSelected(id)
    ? selectedIds.value.filter((value) => value !== id)
    : [...selectedIds.value, id]
}

function toggleSelectAll(): void {
  selectedIds.value = allSelected.value ? [] : items.value.map((question) => question.id)
}

function toggleExpanded(id: string): void {
  expandedIds.value = isExpanded(id)
    ? expandedIds.value.filter((value) => value !== id)
    : [...expandedIds.value, id]
}

/** 开始错题重练（§13）：新训练组、新记录，不修改旧数据 */
async function startTraining(list: readonly WrongQuestion[]): Promise<void> {
  if (busy.value || list.length === 0) return
  busy.value = true
  errorText.value = ''
  try {
    await trainingStore.start({
      mode: 'training',
      source: 'wrongQuestions',
      wrongQuestions: [...list]
    })
    await router.push({ name: 'training' })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '开始训练失败，请稍后重试'
  } finally {
    busy.value = false
  }
}

async function trainAll(): Promise<void> {
  await startTraining(await loadWrongQuestions({}))
}

async function trainActive(): Promise<void> {
  await startTraining(await loadWrongQuestions({ status: 'active' }))
}

async function trainSelectedRange(): Promise<void> {
  const range = selectedRange.value
  if (!range) return
  await startTraining(
    await loadWrongQuestions({
      status: 'active',
      rangeMin: range.rangeMin,
      rangeMax: range.rangeMax
    })
  )
}

async function toggleMastered(question: WrongQuestion): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await setWrongQuestionMastered(question.id, question.status !== 'mastered')
    await reload()
  } finally {
    busy.value = false
  }
}

async function markSelected(mastered: boolean): Promise<void> {
  if (busy.value || selectedIds.value.length === 0) return
  busy.value = true
  try {
    await setManyWrongQuestionsMastered(selectedIds.value, mastered)
    selectedIds.value = []
    await reload()
  } finally {
    busy.value = false
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
        <h1 class="page-title">我的错题</h1>
        <p class="page-subtitle">
          当前 {{ items.length }} 道 · 答错的题目会自动进入错题本，原始历史数据不会被删除
        </p>
      </div>
    </div>

    <div class="tabs">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        class="tab"
        :class="{ active: tab === item.key }"
        @click="selectTab(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="errorText" class="alert alert-danger section">{{ errorText }}</div>

    <div v-if="loading" class="empty">正在加载错题…</div>

    <EmptyState v-else-if="isEmpty" :title="emptyTitle" :description="emptyDescription">
      <button
        type="button"
        class="btn btn-primary"
        @click="router.push({ name: 'five-divide-three' })"
      >
        开始训练
      </button>
    </EmptyState>

    <template v-else>
      <div class="card section">
        <h2 class="card-title">批量训练与整理</h2>
        <p class="card-subtitle">
          错题重练会新建训练组并记录新的训练数据，不会修改旧记录。
        </p>

        <div class="btn-row" style="margin-top: 12px">
          <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="trainAll">
            训练全部错题
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="busy"
            @click="trainActive"
          >
            训练未掌握错题
          </button>
        </div>

        <div class="divider" />

        <div class="field-label">训练某个范围错题</div>
        <p v-if="ranges.length === 0" class="field-hint">
          当前没有未掌握错题，暂无除数范围可选。
        </p>
        <template v-else>
          <div class="chip-row">
            <button
              v-for="range in ranges"
              :key="rangeKey(range)"
              type="button"
              class="chip"
              :class="{ active: selectedRangeKey === rangeKey(range) }"
              @click="selectRange(rangeKey(range))"
            >
              {{ range.rangeMin }}–{{ range.rangeMax }}（{{ range.count }}）
            </button>
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            style="margin-top: 10px"
            :disabled="busy || !selectedRange"
            @click="trainSelectedRange"
          >
            训练所选范围错题
          </button>
        </template>

        <div class="divider" />

        <div class="row-between row-wrap">
          <span class="text-sm text-muted">已选 {{ selectedCount }} 道</span>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="items.length === 0"
              @click="toggleSelectAll"
            >
              {{ allSelected ? '取消全选' : '全选当前列表' }}
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="busy || selectedCount === 0"
              @click="markSelected(true)"
            >
              标记已掌握
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="busy || selectedCount === 0"
              @click="markSelected(false)"
            >
              取消掌握
            </button>
          </div>
        </div>
      </div>

      <div class="list">
        <div v-for="question in items" :key="question.id" class="list-item">
          <div class="list-item-main">
            <label class="row" style="gap: 8px; min-width: 0">
              <input
                type="checkbox"
                :checked="isSelected(question.id)"
                @change="toggleSelect(question.id)"
              />
              <span class="question-text">{{ question.question }}</span>
            </label>
            <span
              class="badge"
              :class="question.status === 'mastered' ? 'badge-success' : 'badge-warning'"
            >
              {{ question.status === 'mastered' ? '已掌握' : '未掌握' }}
            </span>
          </div>

          <div class="list-item-meta">
            错误次数：{{ question.wrongCount }} · 最近错误：{{
              relativeDayLabel(question.lastWrongAt)
            }}
            · 平均用时：{{ formatMs(question.elapsedMs) }}
          </div>

          <div class="btn-row" style="margin-top: 8px">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="busy"
              @click="startTraining([question])"
            >
              重新训练
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="busy"
              @click="toggleMastered(question)"
            >
              {{ question.status === 'mastered' ? '取消掌握' : '标记已掌握' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="toggleExpanded(question.id)">
              {{ isExpanded(question.id) ? '收起答案' : '查看答案' }}
            </button>
          </div>

          <div v-if="isExpanded(question.id)" class="list-item-meta mono">
            <div>你的答案：{{ formatNumber(question.userAnswer) }}</div>
            <div>正确答案：{{ formatNumber(question.correctAnswer) }}</div>
            <div>误差：{{ formatErrorRate(question.errorRate) }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
