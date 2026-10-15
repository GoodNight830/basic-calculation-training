<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { useSettingsStore } from '@/app/stores/settings'
import { loadDiagnosis } from '@/services/queries'
import { listDiagnosableModules } from '@/modules/arithmetic/registry'
import { MODULE_FIVE_DIVIDE_THREE } from '@/config/trainingConfig'
import { formatPercent } from '@/services/format'
import type { DiagnosisRange, ErrorPatternCount, LocalDiagnosis } from '@/types'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()

const moduleOptions = computed(() => listDiagnosableModules())
const selectedModule = ref(MODULE_FIVE_DIVIDE_THREE)
const loading = ref(true)
const errorText = ref('')
const diagnosis = ref<LocalDiagnosis | null>(null)

const focusRanges = computed(() => diagnosis.value?.ranges.filter((r) => r.recent7.sampleCount >= 10).slice(0, 3) ?? [])
const improvedRanges = computed(() => diagnosis.value?.ranges.filter((r) => r.trend === 'improving') ?? [])
const canAnalyze = computed(() => settingsStore.settings.ai.enabled && settingsStore.settings.ai.consentToUpload && Boolean(settingsStore.settings.ai.model))

/* ---- 折叠状态：默认只展示核心结论，细节按需展开（手机端省空间） ---- */
const focusExpanded = ref(false)

function confidenceLabel(value: DiagnosisRange['confidence']): string {
  return { insufficient: '数据不足', low: '低', medium: '中', high: '高' }[value]
}
function trendLabel(value: DiagnosisRange['trend']): string {
  return { improving: '近期改善', worsening: '近期恶化', stable: '基本稳定', insufficient_data: '数据不足' }[value]
}
function patternLabel(value: ErrorPatternCount['type']): string {
  return {
    empty: '空答案', invalid: '无效输入', answer_too_large: '答案偏大', answer_too_small: '答案偏小',
    slow_correct: '答对但用时较长', slow_wrong: '答错且用时较长', repeat_wrong: '重复答错'
  }[value]
}

async function reload(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    await settingsStore.ensureLoaded()
    const result = await loadDiagnosis(selectedModule.value)
    diagnosis.value = result.diagnosis
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '诊断加载失败'
  } finally { loading.value = false }
}

/** 跳转到 AI 解读页，并带上当前选中的模块 */
function goAi(): void {
  router.push({ name: 'ai', query: { module: selectedModule.value } })
}

watch(selectedModule, () => void reload())
onMounted(() => {
  const preset = String(route.query.module ?? '')
  if (preset && moduleOptions.value.some((m) => m.meta.id === preset)) {
    selectedModule.value = preset
  }
  void reload()
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1 class="page-title">能力诊断</h1><p class="page-subtitle">长期基线与近期变化分开计算，本地分析无需联网</p></div>
      <button class="btn btn-outline btn-sm" type="button" :disabled="loading" @click="reload">刷新数据</button>
    </div>

    <!-- 模块切换 -->
    <section v-if="moduleOptions.length > 1" class="section">
      <label class="field-label" for="diagnosis-module">诊断模块</label>
      <select id="diagnosis-module" v-model="selectedModule" class="select">
        <option v-for="m in moduleOptions" :key="m.meta.id" :value="m.meta.id">{{ m.meta.title }}（{{ m.meta.subtitle }}）</option>
      </select>
    </section>

    <div v-if="errorText" class="alert alert-danger section">{{ errorText }}</div>
    <div v-if="loading" class="empty">正在整理训练数据…</div>
    <EmptyState v-else-if="!diagnosis || diagnosis.lifetime.sampleCount === 0" title="还没有可诊断的数据" description="完成一组训练后，这里会显示长期与近期能力变化。">
      <button class="btn btn-primary" type="button" @click="router.push({ name: 'five-divide-three' })">开始训练</button>
    </EmptyState>
    <template v-else>
      <section class="section">
        <button type="button" class="collapse-header" @click="focusExpanded = !focusExpanded">
          <span class="collapse-title">薄弱范围</span>
          <span class="collapse-meta"><span class="collapse-chevron" :class="{ open: focusExpanded }" style="display:inline-block" /></span>
        </button>
        <div v-if="focusExpanded" class="collapse-content">
          <p class="text-xs text-muted" style="margin-top:8px">最近7天样本至少10题才下结论</p>
          <div v-if="focusRanges.length" class="list" style="margin-top:12px">
            <div v-for="range in focusRanges" :key="range.rangeMin" class="list-item">
              <div class="list-item-main">
                <span class="bold">除数 {{ range.rangeMin }}–{{ range.rangeMax }}</span>
                <span class="badge" :class="range.trend === 'worsening' ? 'badge-warning' : range.trend === 'improving' ? 'badge-success' : ''">{{ trendLabel(range.trend) }}</span>
              </div>
              <div class="list-item-meta">最近7天错误率 {{ formatPercent(range.recent7.errorRate) }}（{{ range.recent7.sampleCount }}题） · 长期 {{ formatPercent(range.lifetime.errorRate) }} · 可信度 {{ confidenceLabel(range.confidence) }}</div>
              <div v-if="range.errorPatterns.length" class="text-xs text-muted" style="margin-top:6px">
                <span v-for="pattern in range.errorPatterns.slice(0, 3)" :key="pattern.type" style="display:block">
                  {{ patternLabel(pattern.type) }} {{ pattern.count }} 次（占该范围 {{ formatPercent(pattern.rate) }}）
                  <template v-if="pattern.topDivisors.length"> · 常见除数 {{ pattern.topDivisors.join('、') }}</template>
                </span>
              </div>
            </div>
          </div>
          <div v-else class="alert alert-info" style="margin-top:12px">各范围的近期样本尚不足，系统暂不判断薄弱范围。</div>
          <p v-if="improvedRanges.length" class="text-sm text-success">已有 {{ improvedRanges.length }} 个范围呈改善趋势，历史数据仍会保留用于持续验证。</p>
        </template>
      </section>

      <!-- AI 解读入口 -->
      <section class="section card">
        <div class="row-between"><div><h2 class="card-title">AI 解读</h2><p class="card-subtitle">用自然语言解释你的薄弱范围，并给出训练计划</p></div></div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn-primary" type="button" @click="goAi">生成 AI 报告</button>
          <button v-if="!canAnalyze" class="btn btn-outline" type="button" @click="router.push({ name: 'settings', hash: '#ai-settings' })">配置 AI 服务</button>
        </div>
      </section>
    </template>
  </div>
</template>
