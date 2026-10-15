<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import { useSettingsStore } from '@/app/stores/settings'
import { useTrainingStore } from '@/app/stores/training'
import { loadDiagnosis, loadWrongQuestions } from '@/services/queries'
import { formatAiReportText, requestAiReport, PROMPT_VERSION } from '@/services/aiAnalysis'
import { saveAiAnalysis } from '@/db/aiAnalysisSnapshots'
import { scheduleHostSync } from '@/services/hostSync'
import { newId } from '@/utils/id'
import { formatPercent, formatDateTime } from '@/services/format'
import type {
  AiAnalysisSnapshot,
  AiTrainingAction,
  DiagnosisRange,
  ErrorPatternCount,
  LocalDiagnosis
} from '@/types'

const router = useRouter()
const settingsStore = useSettingsStore()
const trainingStore = useTrainingStore()
const loading = ref(true)
const generating = ref(false)
const analysisElapsedSeconds = ref(0)
const errorText = ref('')
const diagnosis = ref<LocalDiagnosis | null>(null)
const latestAi = ref<AiAnalysisSnapshot | null>(null)
const aiHistory = ref<AiAnalysisSnapshot[]>([])
const startingPlan = ref(false)
let analysisController: AbortController | null = null
let analysisTimer: ReturnType<typeof setInterval> | null = null

const focusRanges = computed(() => diagnosis.value?.ranges.filter((r) => r.recent7.sampleCount >= 10).slice(0, 3) ?? [])
const improvedRanges = computed(() => diagnosis.value?.ranges.filter((r) => r.trend === 'improving') ?? [])
const canAnalyze = computed(() => settingsStore.settings.ai.enabled && settingsStore.settings.ai.consentToUpload && Boolean(settingsStore.settings.ai.model))

/** 上一份报告（用于与最新报告做历史对比） */
const previousAi = computed(() => aiHistory.value[1] ?? null)
/** 本次报告相对上次新增的题目数 */
const questionDelta = computed(() => {
  if (!latestAi.value || !previousAi.value) return null
  return latestAi.value.questionCount - previousAi.value.questionCount
})

/** 展开中的历史报告 id（用于历史列表内联查看） */
const expandedHistoryId = ref<string | null>(null)

function toggleHistory(id: string): void {
  expandedHistoryId.value = expandedHistoryId.value === id ? null : id
}

/* ---- 折叠状态：默认只展示核心结论，细节按需展开（手机端省空间） ---- */
const aiDetailExpanded = ref(false)
const focusExpanded = ref(false)
const historyExpanded = ref(false)

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

/** 把一条 AI 计划动作格式化为可读文本 */
function planText(action: AiTrainingAction): string {
  const range = action.rangeMin !== undefined && action.rangeMax !== undefined
    ? `（除数 ${action.rangeMin}–${action.rangeMax}）`
    : ''
  const count = action.suggestedQuestionCount !== undefined ? `，建议 ${action.suggestedQuestionCount} 题` : ''
  const ratio = action.suggestedRatio !== undefined ? `，强化占比 ${Math.round(action.suggestedRatio * 100)}%` : ''
  const reeval = action.reevaluateAfterQuestions !== undefined ? `，做完 ${action.reevaluateAfterQuestions} 题后复评` : ''
  return `${formatAiReportText(action.action)}${range}${count}${ratio}${reeval}`
}

async function reload(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    await settingsStore.ensureLoaded()
    const result = await loadDiagnosis()
    diagnosis.value = result.diagnosis
    latestAi.value = result.latestAi
    aiHistory.value = result.aiHistory
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '诊断加载失败'
  } finally { loading.value = false }
}
async function generateAi(): Promise<void> {
  if (!diagnosis.value || generating.value) return
  generating.value = true
  analysisElapsedSeconds.value = 0
  analysisController = new AbortController()
  analysisTimer = setInterval(() => { analysisElapsedSeconds.value += 1 }, 1000)
  errorText.value = ''
  if (latestAi.value?.dataHash === diagnosis.value.dataHash) { finishGenerating(); return }
  let report
  try {
    report = await requestAiReport(settingsStore.settings.ai, diagnosis.value, analysisController.signal)
  } catch (error) {
    errorText.value = `模型调用或报告校验失败：${describeError(error)}；已保留本地诊断。`
    finishGenerating()
    return
  }
  try {
    const snapshot: AiAnalysisSnapshot = {
      id: newId(), module: diagnosis.value.module, createdAt: new Date().toISOString(),
      dataHash: diagnosis.value.dataHash, questionCount: diagnosis.value.lifetime.sampleCount,
      model: settingsStore.settings.ai.model, promptVersion: PROMPT_VERSION, report
    }
    await saveAiAnalysis(snapshot)
    scheduleHostSync()
    latestAi.value = snapshot
    aiHistory.value = [snapshot, ...aiHistory.value]
  } catch (error) {
    errorText.value = `报告保存失败：${describeError(error)}；AI 已返回，但报告未写入本地数据库。`
  } finally { finishGenerating() }
}

/** 按 AI 计划开始训练：优先练该范围的错题，无错题则回退普通随机训练 */
async function startPlan(): Promise<void> {
  if (!latestAi.value || startingPlan.value) return
  const plan = latestAi.value.report.nextPlan[0]
  if (!plan) return
  startingPlan.value = true
  errorText.value = ''
  try {
    const settings = await settingsStore.ensureLoaded()
    const hasRange = plan.rangeMin !== undefined && plan.rangeMax !== undefined
    let wrongQuestions: Awaited<ReturnType<typeof loadWrongQuestions>> = []
    if (hasRange) {
      wrongQuestions = await loadWrongQuestions({ rangeMin: plan.rangeMin, rangeMax: plan.rangeMax })
    }
    if (wrongQuestions.length > 0) {
      await trainingStore.start({ mode: 'training', source: 'wrongQuestions', wrongQuestions })
    } else {
      await trainingStore.start({
        mode: settings.defaultMode,
        questionCount: plan.suggestedQuestionCount ?? settings.defaultQuestionCount,
        allowedErrorRate: settings.defaultAllowedErrorRate
      })
    }
    await router.push({ name: 'training' })
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '开始训练失败，请稍后重试'
  } finally { startingPlan.value = false }
}

function cancelAnalysis(): void {
  analysisController?.abort()
}

function finishGenerating(): void {
  generating.value = false
  analysisController = null
  if (analysisTimer !== null) clearInterval(analysisTimer)
  analysisTimer = null
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause instanceof Error ? ` / 原因：${error.cause.name}: ${error.cause.message}` : ''
  return `${error.name}: ${error.message}${cause}`
}
onMounted(() => void reload())
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1 class="page-title">能力诊断</h1><p class="page-subtitle">长期基线与近期变化分开计算，AI 只解释经过校验的统计事实</p></div>
      <button class="btn btn-outline btn-sm" type="button" :disabled="loading" @click="reload">刷新数据</button>
    </div>
    <div v-if="errorText" class="alert alert-danger section">{{ errorText }}</div>
    <div v-if="loading" class="empty">正在整理训练数据…</div>
    <EmptyState v-else-if="!diagnosis || diagnosis.lifetime.sampleCount === 0" title="还没有可诊断的数据" description="完成一组训练后，这里会显示长期与近期能力变化。">
      <button class="btn btn-primary" type="button" @click="router.push({ name: 'five-divide-three' })">开始训练</button>
    </EmptyState>
    <template v-else>
      <section class="section">
        <button type="button" class="row-between card-interactive" style="background:none;border:none;padding:0;cursor:pointer;width:100%" @click="focusExpanded = !focusExpanded">
          <h2 class="section-title" style="margin:0">薄弱范围</h2>
          <span class="text-xs text-muted">{{ focusExpanded ? '收起 ▴' : '查看 ▾' }}</span>
        </button>
        <template v-if="focusExpanded">
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

      <section class="section card">
        <div class="row-between"><div><h2 class="card-title">AI 解读</h2><p class="card-subtitle">仅发送页面所示聚合数据，不发送逐题答案</p></div><span v-if="latestAi" class="badge">{{ latestAi.model }}</span></div>
        <template v-if="latestAi">
          <p>{{ formatAiReportText(latestAi.report.summary) }}</p>

          <div class="list">
            <div v-for="(finding, index) in latestAi.report.findings" :key="index" class="list-item">
              <div class="bold">{{ formatAiReportText(finding.title) }}</div>
              <div class="text-sm">{{ formatAiReportText(finding.evidence) }}</div>
              <div v-if="finding.recommendation" class="text-sm text-success" style="margin-top:4px">建议：{{ formatAiReportText(finding.recommendation) }}</div>
              <div class="text-xs text-muted">样本 {{ finding.sampleCount }} · 可信度 {{ finding.confidence }} · {{ formatAiReportText(finding.limitation) }}</div>
            </div>
          </div>

          <div v-if="latestAi.report.nextPlan.length" class="card" style="background: var(--surface-2); margin-top:12px">
            <div class="bold" style="margin-bottom:8px">下一步训练计划</div>
            <div class="list">
              <div v-for="(action, index) in latestAi.report.nextPlan" :key="index" class="list-item">
                <div class="text-sm">{{ planText(action) }}</div>
              </div>
            </div>
            <div class="btn-row" style="margin-top:12px">
              <button class="btn btn-primary" type="button" :disabled="startingPlan" @click="startPlan">
                {{ startingPlan ? '正在开始…' : '按计划开始训练' }}
              </button>
            </div>
          </div>

          <div v-if="latestAi.report.uncertainty.length" class="alert alert-info" style="margin-top:12px">
            <div class="bold" style="margin-bottom:4px">系统修正说明</div>
            <div v-for="(note, index) in latestAi.report.uncertainty" :key="index" class="text-sm">{{ formatAiReportText(note) }}</div>
          </div>

          <div v-if="previousAi" class="text-xs text-muted" style="margin-top:12px">
            上次报告 {{ formatDateTime(previousAi.createdAt) }} · 本次较上次新增 {{ questionDelta ?? 0 }} 题，累计 {{ aiHistory.length }} 份报告。
          </div>
          <div v-else class="text-xs text-muted" style="margin-top:12px">这是第一份 AI 报告。</div>
        </template>
        <p v-else class="text-sm text-muted">尚未生成 AI 报告。本地诊断无需模型即可使用。</p>
        <div class="btn-row" style="margin-top:12px">
          <button v-if="canAnalyze" class="btn btn-primary" type="button" :disabled="generating || latestAi?.dataHash === diagnosis.dataHash" @click="generateAi">{{ generating ? `正在分析 ${analysisElapsedSeconds}s` : latestAi?.dataHash === diagnosis.dataHash ? '数据无变化' : '生成 AI 报告' }}</button>
          <button v-if="generating" class="btn btn-outline" type="button" @click="cancelAnalysis">取消分析</button>
          <button v-else class="btn btn-outline" type="button" @click="router.push({ name: 'settings', hash: '#ai-settings' })">配置 AI 服务</button>
        </div>
      </section>

      <section v-if="aiHistory.length" class="section">
        <div class="row-between"><h2 class="section-title" style="margin:0">历史报告</h2><span class="text-xs text-muted">共 {{ aiHistory.length }} 份，点击展开查看</span></div>
        <div class="list" style="margin-top:12px">
          <div v-for="snapshot in aiHistory" :key="snapshot.id" class="list-item" style="align-items:flex-start">
            <button type="button" class="list-item-main card-interactive" style="background:none;border:none;padding:0;cursor:pointer;text-align:left;width:100%" @click="toggleHistory(snapshot.id)">
              <span class="bold" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span>{{ formatDateTime(snapshot.createdAt) }}</span>
                <span v-if="snapshot.id === latestAi?.id" class="badge">最新</span>
                <span class="badge badge-muted">{{ snapshot.model }}</span>
              </span>
              <span class="text-sm text-muted" style="display:block;margin-top:2px">{{ snapshot.questionCount }} 题 · {{ formatAiReportText(snapshot.report.summary).slice(0, 60) }}{{ formatAiReportText(snapshot.report.summary).length > 60 ? '…' : '' }}</span>
            </button>
            <div v-if="expandedHistoryId === snapshot.id" class="text-sm" style="margin-top:8px;padding-left:4px">
              <div v-for="(finding, index) in snapshot.report.findings" :key="index" style="margin-top:6px">
                <span class="bold">{{ formatAiReportText(finding.title) }}</span>
                <span class="text-muted"> · {{ formatAiReportText(finding.evidence) }}</span>
              </div>
              <div v-if="snapshot.report.nextPlan.length" class="text-xs text-muted" style="margin-top:8px">
                计划：{{ snapshot.report.nextPlan.map((a) => formatAiReportText(a.action)).join('；') }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

  </div>
</template>
