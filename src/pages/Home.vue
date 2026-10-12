<script setup lang="ts">
/**
 * 首页（§25）
 *
 * - 训练模块入口（五除三）
 * - 今日统计（训练组数 / 题目数 / 正确率 / 平均单题用时）
 * - 薄弱点提示与快捷入口
 *
 * 数据一律通过 @/services/queries 读取，不直接访问 IndexedDB（§34 / §48.7）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatCard from '@/components/common/StatCard.vue'
import { useSettingsStore } from '@/app/stores/settings'
import { useTrainingStore } from '@/app/stores/training'
import { loadOverview, loadWrongQuestions, type Overview } from '@/services/queries'
import { weakPatternSuggestion } from '@/services/weakPattern'
import { formatMs, formatPercent } from '@/services/format'
import type { TrainingMode } from '@/types'

const router = useRouter()
const settingsStore = useSettingsStore()
const trainingStore = useTrainingStore()

const overview = ref<Overview | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const retrying = ref(false)
const startingMode = ref<TrainingMode | ''>('')

const today = computed(() => overview.value?.today ?? null)
const unmasteredWrongCount = computed(() => overview.value?.unmasteredWrongCount ?? 0)
const settings = computed(() => settingsStore.settings)
const defaultModeLabel = computed(() =>
  settings.value.defaultMode === 'speed' ? '竞速模式' : '训练模式'
)

/** 今日平均单题用时：没有题目时显示占位符，避免出现误导性的 0.0s */
const todayAvgElapsed = computed(() => {
  const summary = today.value
  if (!summary || summary.questionCount === 0) return '—'
  return formatMs(summary.avgElapsedMs)
})

const todayAccuracy = computed(() => {
  const summary = today.value
  if (!summary || summary.questionCount === 0) return '—'
  return formatPercent(summary.accuracy)
})

/** 首页只提示权重最高的一条未解决薄弱点（§14.1 / §28） */
const weakHint = computed(() => {
  const patterns = overview.value?.weakPatterns ?? []
  const pattern = patterns.find((item) => item.status !== 'resolved' && item.reinforcementWeight > 0)
  return pattern ? weakPatternSuggestion(pattern) : ''
})

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    await settingsStore.ensureLoaded()
    overview.value = await loadOverview()
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    loading.value = false
  }
}

/**
 * 直接开始练习（§26 的调整版）：
 * 题目数量、允许误差等参数在「设置」中配置，点击练习后立即开始，不再弹出设置界面。
 */
async function startPractice(mode?: TrainingMode): Promise<void> {
  const target: TrainingMode = mode ?? settingsStore.settings.defaultMode
  startingMode.value = target
  errorMessage.value = ''
  try {
    const current = await settingsStore.ensureLoaded()
    await trainingStore.start({
      mode: target,
      questionCount: current.defaultQuestionCount,
      allowedErrorRate: current.defaultAllowedErrorRate
    })
    await router.push({ name: 'training' })
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    startingMode.value = ''
  }
}

/** 错题重练（§13）：新建训练组记录新数据，不修改旧记录 */
async function startWrongReview(): Promise<void> {
  retrying.value = true
  errorMessage.value = ''
  try {
    const wrongQuestions = await loadWrongQuestions({ status: 'active' })
    await trainingStore.start({ mode: 'training', source: 'wrongQuestions', wrongQuestions })
    await router.push({ name: 'training' })
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    retrying.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">基础计算</h1>
        <p class="page-subtitle">本地优先 · 训练数据仅保存在本机</p>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger section">{{ errorMessage }}</div>

    <div class="section">
      <h2 class="section-title">训练模块</h2>
      <div class="card">
        <div class="row-between">
          <div>
            <div class="card-title">五除三</div>
            <p class="card-subtitle">五位数 ÷ 三位数</p>
          </div>
          <span class="badge">默认 {{ defaultModeLabel }}</span>
        </div>

        <div class="row-between row-wrap" style="margin-top: 10px">
          <p class="text-sm text-muted" style="margin: 0">
            当前配置：{{ defaultModeLabel }} · {{ settings.defaultQuestionCount }} 题 · 允许误差
            {{ settings.defaultAllowedErrorRate }}%
          </p>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            @click="router.push({ name: 'settings' })"
          >
            去设置修改
          </button>
        </div>

        <div class="btn-row" style="margin-top: 12px">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="startingMode !== ''"
            @click="startPractice()"
          >
            {{ startingMode ? '正在开始…' : '开始练习' }}
          </button>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="startingMode !== ''"
            @click="startPractice('training')"
          >
            训练模式
          </button>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="startingMode !== ''"
            @click="startPractice('speed')"
          >
            竞速模式
          </button>
        </div>
        <p class="field-hint">点击后立即开始，不再弹出设置界面。</p>
      </div>
      <p class="text-xs text-muted" style="margin: 10px 0 0">
        更多模块（四除二、百分数…）将在后续版本提供
      </p>
    </div>

    <div class="section">
      <h2 class="section-title">今日统计</h2>
      <div v-if="loading" class="empty">正在加载数据…</div>
      <div v-else class="stat-grid">
        <StatCard label="今日训练组数" :value="today ? today.sessionCount : '—'" />
        <StatCard label="今日题目数" :value="today ? today.questionCount : '—'" />
        <StatCard label="今日正确率" :value="todayAccuracy" small />
        <StatCard label="今日平均单题用时" :value="todayAvgElapsed" small />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">薄弱点提示</h2>
      <div v-if="weakHint" class="card">
        <p class="text-sm" style="margin: 0 0 12px">{{ weakHint }}</p>
        <button type="button" class="btn btn-secondary btn-sm" @click="router.push({ name: 'weak' })">
          查看薄弱点
        </button>
      </div>
      <div v-else class="alert alert-info">暂无薄弱点，系统会持续分析你的错误分布</div>
    </div>

    <div class="section">
      <h2 class="section-title">快捷入口</h2>
      <div class="list">
        <button
          type="button"
          class="list-item card-interactive"
          @click="router.push({ name: 'wrong' })"
        >
          <span class="list-item-main">
            <span class="bold">📕 错题</span>
            <span class="text-sm text-muted">未掌握 {{ unmasteredWrongCount }} 题</span>
          </span>
        </button>
        <button
          type="button"
          class="list-item card-interactive"
          @click="router.push({ name: 'history' })"
        >
          <span class="list-item-main">
            <span class="bold">📈 训练记录</span>
            <span class="text-sm text-muted">查看历史统计与每日趋势</span>
          </span>
        </button>
        <button
          type="button"
          class="list-item card-interactive"
          @click="router.push({ name: 'weak' })"
        >
          <span class="list-item-main">
            <span class="bold">🎯 薄弱点</span>
            <span class="text-sm text-muted">查看个人薄弱除数范围</span>
          </span>
        </button>
        <button
          type="button"
          class="list-item card-interactive"
          @click="router.push({ name: 'settings' })"
        >
          <span class="list-item-main">
            <span class="bold">⚙️ 设置</span>
            <span class="text-sm text-muted">默认参数 · 导入导出 · 数据管理</span>
          </span>
        </button>
      </div>
    </div>

    <div v-if="unmasteredWrongCount > 0" class="section">
      <button
        type="button"
        class="btn btn-primary btn-block"
        :disabled="retrying"
        @click="startWrongReview"
      >
        {{ retrying ? '正在准备…' : `错题重练（${unmasteredWrongCount} 题）` }}
      </button>
      <p class="field-hint">错题重练会新建训练组并记录新的训练数据，不会修改历史记录。</p>
    </div>
  </div>
</template>
