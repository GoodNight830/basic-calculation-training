<script setup lang="ts">
/**
 * 基础计算（信息架构 v2 二级页）：
 * - 快速开始：显示用户最近最常使用的子功能（训练模式/竞速模式），一键开始
 * - 题型网格：仅「五位数 ÷ 三位数」可用，其余为占位
 * - 今日概览 / 薄弱点提示 / 训练工具入口（错题、记录、薄弱点、诊断）
 *
 * 数据一律通过 @/services/queries 读取，不直接访问 IndexedDB（§34 / §48.7）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatCard from '@/components/common/StatCard.vue'
import { useSettingsStore } from '@/app/stores/settings'
import { useTrainingStore } from '@/app/stores/training'
import { MODULE_FIVE_DIVIDE_THREE } from '@/config/trainingConfig'
import { loadOverview, loadWrongQuestions, loadHistory, type Overview } from '@/services/queries'
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
const recentMode = ref<TrainingMode>('training')

const today = computed(() => overview.value?.today ?? null)
const unmasteredWrongCount = computed(() => overview.value?.unmasteredWrongCount ?? 0)
const settings = computed(() => settingsStore.settings)
const recentModeLabel = computed(() => (recentMode.value === 'speed' ? '竞速模式' : '训练模式'))

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

/** 只提示权重最高的一条未解决薄弱点（§14.1 / §28） */
const weakHint = computed(() => {
  const patterns = overview.value?.weakPatterns ?? []
  const pattern = patterns.find((item) => item.status !== 'resolved' && item.reinforcementWeight > 0)
  return pattern ? weakPatternSuggestion(pattern) : ''
})

/** 题型清单：仅五除三可用，其余为占位 */
interface Topic {
  key: string
  title: string
  available: boolean
}

const topics: Topic[] = [
  { key: 'five-divide-three', title: '五位数÷三位数', available: true },
  { key: 'three-add', title: '三位数加法', available: false },
  { key: 'three-sub', title: '三位数减法', available: false },
  { key: 'three-add-sub', title: '三位数加减', available: false },
  { key: 'four-add', title: '四位数加法', available: false },
  { key: 'three-mul-one', title: '三位数乘一位数', available: false },
  { key: 'three-div-one', title: '三位数除一位数', available: false },
  { key: 'two-mul-two', title: '两位数乘两位数', available: false },
  { key: 'mul-estimate', title: '乘法估算', available: false }
]

function openTopic(topic: Topic): void {
  if (!topic.available) return
  void router.push({ name: 'five-divide-three', query: { module: MODULE_FIVE_DIVIDE_THREE } })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 统计最近 30 天最常使用的训练模式，作为「常用子功能」 */
function pickRecentMode(): Promise<void> {
  return loadHistory('30d').then((data) => {
    let training = 0
    let speed = 0
    for (const s of data.sessions) {
      if (s.mode === 'speed') speed += 1
      else training += 1
    }
    recentMode.value = speed > training ? 'speed' : 'training'
  })
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    await settingsStore.ensureLoaded()
    const [ov] = await Promise.all([loadOverview(), pickRecentMode()])
    overview.value = ov
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    loading.value = false
  }
}

/** 直接开始练习：使用常用模式（§26） */
async function startPractice(mode?: TrainingMode): Promise<void> {
  const target: TrainingMode = mode ?? recentMode.value
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
        <p class="page-subtitle">选择题型进入训练，或一键快速开始</p>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger section">{{ errorMessage }}</div>

    <div class="section">
      <h2 class="section-title">快速开始</h2>
      <div class="card">
        <div class="row-between">
          <div>
            <div class="card-title">五位数 ÷ 三位数</div>
            <p class="text-sm text-muted" style="margin: 4px 0 0">
              最近常用：{{ recentModeLabel }} · {{ settings.defaultQuestionCount }} 题 · 允许误差 {{ settings.defaultAllowedErrorRate }}%
            </p>
          </div>
        </div>
        <div class="btn-row" style="margin-top: 12px">
          <button type="button" class="btn btn-primary" :disabled="startingMode !== ''" @click="startPractice()">
            {{ startingMode ? '正在开始…' : `开始练习（${recentModeLabel}）` }}
          </button>
          <button type="button" class="btn btn-outline btn-sm" :disabled="startingMode !== ''" @click="startPractice('training')">训练模式</button>
          <button type="button" class="btn btn-outline btn-sm" :disabled="startingMode !== ''" @click="startPractice('speed')">竞速模式</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">全部题型</h2>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px">
        <button
          v-for="topic in topics"
          :key="topic.key"
          type="button"
          class="btn"
          :class="topic.available ? 'btn-primary' : 'btn-outline'"
          :disabled="!topic.available"
          :title="topic.available ? '进入训练' : '即将上线'"
          @click="openTopic(topic)"
        >
          {{ topic.title }}
        </button>
      </div>
      <p class="field-hint" style="margin-top: 8px">灰色题型即将上线，当前版本先开放五位数 ÷ 三位数。</p>
    </div>

    <div class="section">
      <h2 class="section-title">今日概览</h2>
      <div v-if="loading" class="empty">正在加载数据…</div>
      <div v-else class="stat-grid">
        <StatCard label="今日训练组数" :value="today ? today.sessionCount : '—'" />
        <StatCard label="今日题目数" :value="today ? today.questionCount : '—'" />
        <StatCard label="今日正确率" :value="todayAccuracy" small />
        <StatCard label="平均单题用时" :value="todayAvgElapsed" small />
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">薄弱点提示</h2>
      <div v-if="weakHint" class="card">
        <p class="text-sm" style="margin: 0 0 12px">{{ weakHint }}</p>
        <button type="button" class="btn btn-secondary btn-sm" @click="router.push({ name: 'weak' })">查看薄弱点</button>
      </div>
      <div v-else class="alert alert-info">暂无薄弱点，系统会持续分析你的错误分布</div>
    </div>

    <div class="section">
      <h2 class="section-title">训练工具</h2>
      <div class="list">
        <button type="button" class="list-item card-interactive" @click="router.push({ name: 'wrong' })">
          <span class="list-item-main">
            <span class="bold">📕 错题本</span>
            <span class="text-sm text-muted">未掌握 {{ unmasteredWrongCount }} 题</span>
          </span>
        </button>
        <button type="button" class="list-item card-interactive" @click="router.push({ name: 'profile', query: { module: MODULE_FIVE_DIVIDE_THREE } })">
          <span class="list-item-main">
            <span class="bold">📈 训练记录</span>
            <span class="text-sm text-muted">历史统计与每日趋势</span>
          </span>
        </button>

        <button type="button" class="list-item card-interactive" @click="router.push({ name: 'weak' })">
          <span class="list-item-main">
            <span class="bold">🎯 薄弱点</span>
            <span class="text-sm text-muted">个人薄弱除数范围</span>
          </span>
        </button>
        <button type="button" class="list-item card-interactive" @click="router.push({ name: 'diagnosis' })">
          <span class="list-item-main">
            <span class="bold">◉ 能力诊断</span>
            <span class="text-sm text-muted">长期基线、近期变化与 AI 解读</span>
          </span>
        </button>
      </div>
    </div>

    <div v-if="unmasteredWrongCount > 0 && !loading" class="section">
      <button type="button" class="btn btn-primary btn-block" :disabled="retrying" @click="startWrongReview">
        {{ retrying ? '正在准备…' : `错题重练（${unmasteredWrongCount} 题）` }}
      </button>
      <p class="field-hint">错题重练会新建训练组并记录新的训练数据，不会修改历史记录。</p>
    </div>
  </div>
</template>
