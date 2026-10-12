<script setup lang="ts">
/**
 * 五除三 入口页面（需求规格书 §6.5 / §13 / §26 —— 按用户要求调整）
 *
 * 调整说明：
 * - 题目数量、允许误差等参数统一在「设置」中配置，本页不再有输入项，也不再弹出设置界面；
 * - 点击「开始训练模式 / 开始竞速模式」立即开始并跳转训练页面；
 * - §6.5 要求的两种模式差异仍然一眼可见（独立卡片 + 说明文字）；
 * - §13 错题重练入口保留。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/app/stores/settings'
import { useTrainingStore } from '@/app/stores/training'
import { useWeakPatternStore } from '@/app/stores/weakPatterns'
import { loadWrongQuestions } from '@/services/queries'
import { formatPercent } from '@/services/format'
import type { TrainingMode, WrongQuestion } from '@/types'

const router = useRouter()
const settingsStore = useSettingsStore()
const weakPatternStore = useWeakPatternStore()
const trainingStore = useTrainingStore()

const loading = ref(true)
const startingMode = ref<TrainingMode | ''>('')
const retrying = ref(false)
const wrongQuestions = ref<WrongQuestion[]>([])
const errorMessage = ref('')

const settings = computed(() => settingsStore.settings)
const unmasteredCount = computed(() => wrongQuestions.value.length)
const weakRanges = computed(() =>
  weakPatternStore.activePatterns.filter((pattern) => pattern.reinforcementWeight > 0)
)
const hasReinforcement = computed(
  () => settings.value.weakPattern.enableReinforcement && weakRanges.value.length > 0
)

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    await Promise.all([settingsStore.ensureLoaded(), weakPatternStore.load()])
    wrongQuestions.value = await loadWrongQuestions({ status: 'active' })
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    loading.value = false
  }
}

/** 立即开始：使用「设置」中的默认参数（不再弹出设置界面） */
async function start(mode: TrainingMode): Promise<void> {
  startingMode.value = mode
  errorMessage.value = ''
  try {
    const current = await settingsStore.ensureLoaded()
    await trainingStore.start({
      mode,
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
    await trainingStore.start({
      mode: 'training',
      source: 'wrongQuestions',
      wrongQuestions: wrongQuestions.value
    })
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
        <h1 class="page-title">五除三</h1>
        <p class="page-subtitle">五位数 ÷ 三位数 · 点击即开始，参数在设置中配置</p>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger section">{{ errorMessage }}</div>

    <div v-if="loading" class="empty">正在加载…</div>

    <template v-else>
      <div class="card section">
        <div class="row-between">
          <span class="card-title">当前配置</span>
          <button type="button" class="btn btn-ghost btn-sm" @click="router.push({ name: 'settings' })">
            修改设置
          </button>
        </div>
        <div class="stat-grid" style="margin-top: 10px">
          <div class="stat">
            <div class="stat-label">默认模式</div>
            <div class="stat-value stat-value-sm">
              {{ settings.defaultMode === 'speed' ? '竞速模式' : '训练模式' }}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">题目数量</div>
            <div class="stat-value stat-value-sm">{{ settings.defaultQuestionCount }} 题</div>
          </div>
          <div class="stat">
            <div class="stat-label">允许误差</div>
            <div class="stat-value stat-value-sm">{{ settings.defaultAllowedErrorRate }}%</div>
          </div>
          <div class="stat">
            <div class="stat-label">出题来源</div>
            <div class="stat-value stat-value-sm">
              {{ hasReinforcement ? '普通 + 薄弱强化' : '普通训练' }}
            </div>
          </div>
        </div>
      </div>

      <div class="card section">
        <h2 class="card-title">训练模式</h2>
        <p class="card-subtitle">无限练习 · 即时纠错 · 用户主动结束</p>
        <button
          type="button"
          class="btn btn-primary btn-lg btn-block"
          style="margin-top: 12px"
          :disabled="startingMode !== ''"
          @click="start('training')"
        >
          {{ startingMode === 'training' ? '正在开始…' : '开始训练模式' }}
        </button>
      </div>

      <div class="card section">
        <h2 class="card-title">竞速模式</h2>
        <p class="card-subtitle">
          {{ settings.defaultQuestionCount }} 题 · 完成后结算 · 训练过程中不提示正确 / 错误
        </p>
        <button
          type="button"
          class="btn btn-primary btn-lg btn-block"
          style="margin-top: 12px"
          :disabled="startingMode !== ''"
          @click="start('speed')"
        >
          {{ startingMode === 'speed' ? '正在开始…' : '开始竞速模式' }}
        </button>
        <p class="field-hint">
          等级只由「是否全对 + 总用时」决定，正确率仅用于统计分析。
        </p>
      </div>

      <div v-if="hasReinforcement" class="card section">
        <h2 class="card-title">个人薄弱点强化</h2>
        <p class="card-subtitle">
          系统会自动提高以下除数范围的出题比例（合计不超过
          {{ formatPercent(settings.weakPattern.maxReinforcementRatio * 100, 0) }}）：
        </p>
        <div class="list" style="margin-top: 10px">
          <div v-for="pattern in weakRanges" :key="pattern.id" class="list-item">
            <div class="list-item-main">
              <span class="question-text">除数 {{ pattern.rangeMin }}–{{ pattern.rangeMax }}</span>
              <span class="badge badge-warning">错误率 {{ formatPercent(pattern.errorRate) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="unmasteredCount > 0" class="card section">
        <h2 class="card-title">错题重练</h2>
        <p class="card-subtitle">
          当前有 {{ unmasteredCount }} 道未掌握错题，重练会新建训练组并记录新的训练数据。
        </p>
        <button
          type="button"
          class="btn btn-secondary btn-block"
          style="margin-top: 12px"
          :disabled="retrying"
          @click="startWrongReview"
        >
          {{ retrying ? '正在准备…' : `开始错题重练（${unmasteredCount} 题）` }}
        </button>
      </div>
    </template>
  </div>
</template>
