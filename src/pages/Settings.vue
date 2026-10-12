<script setup lang="ts">
/**
 * 设置页面（§7 / §14.3 / §16 / §26 / §30 / §31 / §32）
 *
 * - 训练默认参数：默认题目数量 / 默认允许误差
 * - 薄弱点分析参数：全部来自 WeakPatternConfig，不在 UI 中写死阈值（§14.3 / §34）
 * - 数据导出（JSON / CSV）、数据导入、数据管理
 */
import { onMounted, reactive, ref } from 'vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import StatCard from '@/components/common/StatCard.vue'
import AiSettingsPanel from '@/components/settings/AiSettingsPanel.vue'
import { useSettingsStore } from '@/app/stores/settings'
import { useWeakPatternStore } from '@/app/stores/weakPatterns'
import { ALLOWED_ERROR_RATE, QUESTION_COUNT } from '@/config/trainingConfig'
import { clearAllData } from '@/services/training'
import { loadDataCounts, refreshWeakPatterns } from '@/services/queries'
import {
  buildFullJsonExport,
  buildQuestionsCsvExport,
  buildWrongQuestionsCsvExport,
  buildWrongQuestionsJsonExport,
  importFromJsonText,
  type ExportFile,
  type ImportConflictPolicy,
  type ImportResult
} from '@/services/export'
import { downloadTextFile, readTextFile } from '@/services/download'
import type { TrainingMode } from '@/types'

const settingsStore = useSettingsStore()
const weakPatternStore = useWeakPatternStore()

const loading = ref(true)

/* ---------- 训练默认参数 ---------- */
const defaultMode = ref<TrainingMode>('training')
const defaultQuestionCountText = ref(String(QUESTION_COUNT.default))
const defaultAllowedErrorRateText = ref(String(ALLOWED_ERROR_RATE.default))
const defaultsSaving = ref(false)
const defaultsMessage = ref('')
const defaultsError = ref('')

/* ---------- 薄弱点分析参数 ---------- */
const weakForm = reactive({
  minSampleCount: '',
  minErrorCount: '',
  ratioThreshold: '',
  maxReinforcementRatio: '',
  maxReinforcementWeight: '',
  rangeSize: '100',
  enableReinforcement: true
})
const weakSaving = ref(false)
const weakResetting = ref(false)
const weakMessage = ref('')
const weakError = ref('')

const RANGE_SIZE_OPTIONS = [
  { value: '100', label: '100（百位：100–199 / 200–299 …）' },
  { value: '50', label: '50（50 为一档：100–149 …）' },
  { value: '10', label: '10（十位：100–109 …）' },
  { value: '1', label: '1（精确到单个除数）' }
] as const

/* ---------- 数据导出 ---------- */
const exportOptions: ReadonlyArray<{ key: string; label: string; build: () => Promise<ExportFile> }> = [
  { key: 'full-json', label: '导出全部数据（JSON）', build: () => buildFullJsonExport() },
  { key: 'wrong-json', label: '导出错题（JSON）', build: () => buildWrongQuestionsJsonExport() },
  { key: 'questions-csv', label: '导出题目记录（CSV）', build: () => buildQuestionsCsvExport() },
  { key: 'wrong-csv', label: '导出错题（CSV）', build: () => buildWrongQuestionsCsvExport() }
]
const exporting = ref('')
const exportMessage = ref('')
const exportError = ref('')

/* ---------- 数据导入 ---------- */
const importInput = ref<HTMLInputElement | null>(null)
const importFile = ref<File | null>(null)
const importPolicy = ref<ImportConflictPolicy>('skip')
const importing = ref(false)
const importMessage = ref('')
const importError = ref('')

/* ---------- 数据管理 ---------- */
const counts = ref({ sessions: 0, questions: 0, wrongQuestions: 0, weakPatterns: 0 })
const countsLoading = ref(false)
const countsError = ref('')
const analyzing = ref(false)
const analyzeMessage = ref('')
const analyzeError = ref('')
const showClearDialog = ref(false)
const clearing = ref(false)
const clearMessage = ref('')

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseNumber(text: string, fallback: number): number {
  const trimmed = text.trim()
  if (trimmed === '') return fallback
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 用当前设置回填表单（加载、保存、恢复默认、导入后调用） */
function syncForms(): void {
  const settings = settingsStore.settings
  defaultMode.value = settings.defaultMode
  defaultQuestionCountText.value = String(settings.defaultQuestionCount)
  defaultAllowedErrorRateText.value = String(settings.defaultAllowedErrorRate)

  const weak = settings.weakPattern
  weakForm.minSampleCount = String(weak.minSampleCount)
  weakForm.minErrorCount = String(weak.minErrorCount)
  weakForm.ratioThreshold = String(weak.ratioThreshold)
  weakForm.maxReinforcementRatio = String(weak.maxReinforcementRatio)
  weakForm.maxReinforcementWeight = String(weak.maxReinforcementWeight)
  weakForm.rangeSize = String(weak.rangeSize)
  weakForm.enableReinforcement = weak.enableReinforcement
}

async function refreshCounts(): Promise<void> {
  countsLoading.value = true
  countsError.value = ''
  try {
    counts.value = await loadDataCounts()
  } catch (error) {
    countsError.value = errorText(error)
  } finally {
    countsLoading.value = false
  }
}

async function saveDefaults(): Promise<void> {
  defaultsSaving.value = true
  defaultsMessage.value = ''
  defaultsError.value = ''
  try {
    const current = settingsStore.settings
    await settingsStore.updateDefaults({
      defaultMode: defaultMode.value,
      defaultQuestionCount: Math.round(
        clamp(
          parseNumber(defaultQuestionCountText.value, current.defaultQuestionCount),
          QUESTION_COUNT.min,
          QUESTION_COUNT.max
        )
      ),
      defaultAllowedErrorRate: clamp(
        parseNumber(defaultAllowedErrorRateText.value, current.defaultAllowedErrorRate),
        ALLOWED_ERROR_RATE.min,
        ALLOWED_ERROR_RATE.max
      )
    })
    syncForms()
    defaultsMessage.value = '训练默认参数已保存'
  } catch (error) {
    defaultsError.value = errorText(error)
  } finally {
    defaultsSaving.value = false
  }
}

async function saveWeakConfig(): Promise<void> {
  weakSaving.value = true
  weakMessage.value = ''
  weakError.value = ''
  try {
    const current = settingsStore.weakConfig
    await settingsStore.updateWeakPattern({
      minSampleCount: Math.round(
        clamp(parseNumber(weakForm.minSampleCount, current.minSampleCount), 1, 1000)
      ),
      minErrorCount: Math.round(
        clamp(parseNumber(weakForm.minErrorCount, current.minErrorCount), 1, 1000)
      ),
      ratioThreshold: clamp(parseNumber(weakForm.ratioThreshold, current.ratioThreshold), 1, 100),
      maxReinforcementRatio: clamp(
        parseNumber(weakForm.maxReinforcementRatio, current.maxReinforcementRatio),
        0,
        0.9
      ),
      maxReinforcementWeight: clamp(
        parseNumber(weakForm.maxReinforcementWeight, current.maxReinforcementWeight),
        0,
        1
      ),
      rangeSize: parseNumber(weakForm.rangeSize, current.rangeSize),
      enableReinforcement: weakForm.enableReinforcement
    })
    syncForms()
    weakMessage.value = '薄弱点分析参数已保存，将在下次训练时生效'
  } catch (error) {
    weakError.value = errorText(error)
  } finally {
    weakSaving.value = false
  }
}

async function restoreDefaults(): Promise<void> {
  weakResetting.value = true
  weakMessage.value = ''
  weakError.value = ''
  try {
    await settingsStore.reset()
    syncForms()
    weakMessage.value = '已恢复默认设置'
  } catch (error) {
    weakError.value = errorText(error)
  } finally {
    weakResetting.value = false
  }
}

async function runExport(item: { key: string; build: () => Promise<ExportFile> }): Promise<void> {
  exporting.value = item.key
  exportMessage.value = ''
  exportError.value = ''
  try {
    const file = await item.build()
    downloadTextFile(file.filename, file.content, file.mime)
    exportMessage.value = `已导出 ${file.filename}`
  } catch (error) {
    exportError.value = errorText(error)
  } finally {
    exporting.value = ''
  }
}

function onImportFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const files = target.files
  importFile.value = files && files.length > 0 ? files[0] : null
  importMessage.value = ''
  importError.value = ''
}

function describeImportResult(result: ImportResult): string {
  const { imported } = result
  return [
    `导入完成：训练组 ${imported.sessions} 条、题目记录 ${imported.questions} 条、` +
      `错题 ${imported.wrongQuestions} 条、薄弱点 ${imported.weakPatterns} 条、` +
      `未完成训练 ${imported.activeSessions} 条、设置 ${imported.settings} 条`,
    `跳过重复数据 ${result.skipped} 条`
  ].join('\n')
}

async function runImport(): Promise<void> {
  const file = importFile.value
  if (!file) {
    importError.value = '请先选择要导入的 JSON 文件'
    return
  }
  importing.value = true
  importMessage.value = ''
  importError.value = ''
  try {
    const text = await readTextFile(file)
    const result = await importFromJsonText(text, importPolicy.value)
    importMessage.value = describeImportResult(result)
    if (result.errors.length > 0) {
      importError.value = result.errors.join('\n')
    }
    importFile.value = null
    if (importInput.value) importInput.value.value = ''
    await settingsStore.load()
    syncForms()
    await Promise.all([refreshCounts(), weakPatternStore.load()])
  } catch (error) {
    importError.value = errorText(error)
  } finally {
    importing.value = false
  }
}

/** 手动重新分析薄弱点（§28）：使用当前设置中的阈值 */
async function reanalyzeWeakPatterns(): Promise<void> {
  analyzing.value = true
  analyzeMessage.value = ''
  analyzeError.value = ''
  try {
    const patterns = await refreshWeakPatterns(settingsStore.weakConfig)
    await weakPatternStore.load()
    analyzeMessage.value = `重新分析完成，共得到 ${patterns.length} 个薄弱点范围`
    await refreshCounts()
  } catch (error) {
    analyzeError.value = errorText(error)
  } finally {
    analyzing.value = false
  }
}

async function confirmClearAll(): Promise<void> {
  clearing.value = true
  clearMessage.value = ''
  try {
    await clearAllData()
    await Promise.all([refreshCounts(), weakPatternStore.load()])
    showClearDialog.value = false
    clearMessage.value = '已清空全部训练数据（个人设置保留）'
  } catch (error) {
    countsError.value = errorText(error)
    showClearDialog.value = false
  } finally {
    clearing.value = false
  }
}

onMounted(async () => {
  try {
    await settingsStore.ensureLoaded()
    syncForms()
    await refreshCounts()
  } catch (error) {
    countsError.value = errorText(error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">设置</h1>
        <p class="page-subtitle">训练默认参数 · 薄弱点分析 · 数据导入导出</p>
      </div>
    </div>

    <div v-if="loading" class="empty">正在加载设置…</div>

    <template v-else>
      <!-- 训练默认参数 -->
      <div class="card section">
        <h2 class="card-title">训练默认参数</h2>
        <p class="card-subtitle">
          首页与五除三入口点击「开始练习」时会直接使用这里的配置，不再弹出设置界面
        </p>

        <div class="field" style="margin-top: 14px">
          <span class="field-label">默认训练模式</span>
          <div class="chip-row">
            <button
              id="settings-default-mode-training"
              type="button"
              class="chip"
              :class="{ active: defaultMode === 'training' }"
              @click="defaultMode = 'training'"
            >
              训练模式（无限练习）
            </button>
            <button
              id="settings-default-mode-speed"
              type="button"
              class="chip"
              :class="{ active: defaultMode === 'speed' }"
              @click="defaultMode = 'speed'"
            >
              竞速模式（固定题数）
            </button>
          </div>
          <p class="field-hint">「开始练习」按钮使用的模式；两种模式仍可在入口处单独选择。</p>
        </div>

        <div class="field">
          <label class="field-label" for="settings-question-count">默认题目数量</label>
          <div class="chip-row" style="margin-bottom: 10px">
            <button
              v-for="preset in QUESTION_COUNT.presets"
              :key="preset"
              type="button"
              class="chip"
              :class="{ active: defaultQuestionCountText === String(preset) }"
              @click="defaultQuestionCountText = String(preset)"
            >
              {{ preset }} 题
            </button>
          </div>
          <input
            id="settings-question-count"
            v-model="defaultQuestionCountText"
            class="input input-mono"
            type="number"
            inputmode="numeric"
            :min="QUESTION_COUNT.min"
            :max="QUESTION_COUNT.max"
            step="1"
          />
          <p class="field-hint">
            仅用于竞速模式：范围 {{ QUESTION_COUNT.min }}–{{ QUESTION_COUNT.max }} 题，超出范围将自动调整。
          </p>
        </div>

        <div class="field">
          <label class="field-label" for="settings-error-rate">默认允许误差（%）</label>
          <div class="chip-row" style="margin-bottom: 10px">
            <button
              v-for="preset in ALLOWED_ERROR_RATE.presets"
              :key="preset"
              type="button"
              class="chip"
              :class="{ active: defaultAllowedErrorRateText === String(preset) }"
              @click="defaultAllowedErrorRateText = String(preset)"
            >
              {{ preset }}%
            </button>
          </div>
          <input
            id="settings-error-rate"
            v-model="defaultAllowedErrorRateText"
            class="input input-mono"
            type="number"
            inputmode="decimal"
            :min="ALLOWED_ERROR_RATE.min"
            :max="ALLOWED_ERROR_RATE.max"
            :step="ALLOWED_ERROR_RATE.step"
          />
          <p class="field-hint">
            误差 ≤ 该值判定为正确；范围 {{ ALLOWED_ERROR_RATE.min }}–{{ ALLOWED_ERROR_RATE.max }}%。
          </p>
        </div>

        <div class="btn-row">
          <button type="button" class="btn btn-primary" :disabled="defaultsSaving" @click="saveDefaults">
            {{ defaultsSaving ? '保存中…' : '保存默认参数' }}
          </button>
        </div>
        <div v-if="defaultsMessage" class="alert alert-success" style="margin-top: 10px">
          {{ defaultsMessage }}
        </div>
        <div
          v-if="defaultsError"
          class="alert alert-danger"
          style="margin-top: 10px; white-space: pre-line"
        >
          {{ defaultsError }}
        </div>
      </div>

      <!-- 薄弱点分析参数 -->
      <div class="card section">
        <h2 class="card-title">薄弱点分析参数</h2>
        <p class="card-subtitle">用于判断哪些除数范围属于个人薄弱点，以及强化出题的比例</p>

        <div class="field" style="margin-top: 14px">
          <label class="field-label" for="weak-min-sample">最小样本数量</label>
          <input
            id="weak-min-sample"
            v-model="weakForm.minSampleCount"
            class="input input-mono"
            type="number"
            inputmode="numeric"
            min="1"
            max="1000"
            step="1"
          />
          <p class="field-hint">样本数量低于该值不判定为薄弱点（默认 10，避免因为做了 2 题错了 1 题就误判）。</p>
        </div>

        <div class="field">
          <label class="field-label" for="weak-min-error">最小错误数量</label>
          <input
            id="weak-min-error"
            v-model="weakForm.minErrorCount"
            class="input input-mono"
            type="number"
            inputmode="numeric"
            min="1"
            max="1000"
            step="1"
          />
          <p class="field-hint">该范围内的错误数量低于该值不判定为薄弱点（默认 3）。</p>
        </div>

        <div class="field">
          <label class="field-label" for="weak-ratio">错误率倍数阈值</label>
          <input
            id="weak-ratio"
            v-model="weakForm.ratioThreshold"
            class="input input-mono"
            type="number"
            inputmode="decimal"
            min="1"
            max="100"
            step="0.1"
          />
          <p class="field-hint">
            范围错误率 ÷ 整体错误率 ≥ 该倍数时才判定为薄弱点（默认 1.5，即高于个人平均水平 50%）。
          </p>
        </div>

        <div class="field">
          <label class="field-label" for="weak-max-weight">单个范围最大强化权重</label>
          <input
            id="weak-max-weight"
            v-model="weakForm.maxReinforcementWeight"
            class="input input-mono"
            type="number"
            inputmode="decimal"
            min="0"
            max="1"
            step="0.05"
          />
          <p class="field-hint">单个薄弱范围最多占用的出题比例（0–1，默认 0.35，即最多 35%）。</p>
        </div>

        <div class="field">
          <label class="field-label" for="weak-max-ratio">薄弱点合计出题占比上限</label>
          <input
            id="weak-max-ratio"
            v-model="weakForm.maxReinforcementRatio"
            class="input input-mono"
            type="number"
            inputmode="decimal"
            min="0"
            max="0.9"
            step="0.05"
          />
          <p class="field-hint">
            所有薄弱范围合计的最高出题占比（0–0.9，默认 0.35）；不会出现 100% 薄弱题，普通随机题始终保留。
          </p>
        </div>

        <div class="field">
          <label class="field-label" for="weak-range-size">除数范围粒度</label>
          <select id="weak-range-size" v-model="weakForm.rangeSize" class="select">
            <option v-for="option in RANGE_SIZE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <p class="field-hint">决定按照多少位划分除数范围，粒度越细越容易发现具体薄弱除数。</p>
        </div>

        <div class="field">
          <label class="switch">
            <input v-model="weakForm.enableReinforcement" type="checkbox" />
            <span>启用薄弱点定向强化</span>
          </label>
          <p class="field-hint">关闭后仍会分析并展示薄弱点，但训练不再提高薄弱范围的出题比例。</p>
        </div>

        <div class="btn-row">
          <button type="button" class="btn btn-primary" :disabled="weakSaving" @click="saveWeakConfig">
            {{ weakSaving ? '保存中…' : '保存分析参数' }}
          </button>
          <button
            type="button"
            class="btn btn-outline"
            :disabled="weakResetting"
            @click="restoreDefaults"
          >
            {{ weakResetting ? '恢复中…' : '恢复默认' }}
          </button>
        </div>
        <div v-if="weakMessage" class="alert alert-success" style="margin-top: 10px">
          {{ weakMessage }}
        </div>
        <div v-if="weakError" class="alert alert-danger" style="margin-top: 10px; white-space: pre-line">
          {{ weakError }}
        </div>
      </div>

      <AiSettingsPanel />

      <!-- 数据导出 -->
      <div class="card section">
        <h2 class="card-title">数据导出</h2>
        <p class="card-subtitle">JSON 用于完整备份与恢复，CSV 便于用 Excel 查看与分析</p>
        <div class="btn-row" style="margin-top: 14px">
          <button
            v-for="item in exportOptions"
            :key="item.key"
            type="button"
            class="btn btn-outline"
            :disabled="exporting !== ''"
            @click="runExport(item)"
          >
            {{ exporting === item.key ? '导出中…' : item.label }}
          </button>
        </div>
        <div v-if="exportMessage" class="alert alert-success" style="margin-top: 10px">
          {{ exportMessage }}
        </div>
        <div v-if="exportError" class="alert alert-danger" style="margin-top: 10px; white-space: pre-line">
          {{ exportError }}
        </div>
      </div>

      <!-- 数据导入 -->
      <div class="card section">
        <h2 class="card-title">数据导入</h2>
        <p class="card-subtitle">导入本应用导出的 JSON 备份；导入前会校验数据结构与版本</p>

        <div class="field" style="margin-top: 14px">
          <label class="field-label" for="settings-import-file">选择备份文件</label>
          <input
            id="settings-import-file"
            ref="importInput"
            class="input"
            type="file"
            accept=".json,application/json"
            @change="onImportFileChange"
          />
          <p v-if="importFile" class="field-hint">已选择：{{ importFile.name }}</p>
          <p v-else class="field-hint">请选择由本应用导出的 .json 备份文件。</p>
        </div>

        <div class="field">
          <span class="field-label">重复数据（相同 ID）处理</span>
          <div class="chip-row">
            <button
              type="button"
              class="chip"
              :class="{ active: importPolicy === 'skip' }"
              @click="importPolicy = 'skip'"
            >
              跳过重复数据
            </button>
            <button
              type="button"
              class="chip"
              :class="{ active: importPolicy === 'overwrite' }"
              @click="importPolicy = 'overwrite'"
            >
              覆盖重复数据
            </button>
          </div>
          <p class="field-hint">
            跳过：保留本机已有记录，只补充新记录；覆盖：用备份文件中的记录替换本机同 ID 记录。
          </p>
        </div>

        <div class="btn-row">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="importing || !importFile"
            @click="runImport"
          >
            {{ importing ? '导入中…' : '开始导入' }}
          </button>
        </div>
        <div
          v-if="importMessage"
          class="alert alert-success"
          style="margin-top: 10px; white-space: pre-line"
        >
          {{ importMessage }}
        </div>
        <div
          v-if="importError"
          class="alert alert-danger"
          style="margin-top: 10px; white-space: pre-line"
        >
          {{ importError }}
        </div>
      </div>

      <!-- 数据管理 -->
      <div class="card section">
        <h2 class="card-title">数据管理</h2>
        <p class="card-subtitle">当前本机保存的数据量</p>

        <div class="stat-grid" style="margin-top: 14px">
          <StatCard label="训练组" :value="countsLoading ? '…' : counts.sessions" />
          <StatCard label="题目记录" :value="countsLoading ? '…' : counts.questions" />
          <StatCard label="错题" :value="countsLoading ? '…' : counts.wrongQuestions" />
          <StatCard label="薄弱点" :value="countsLoading ? '…' : counts.weakPatterns" />
        </div>

        <div class="btn-row" style="margin-top: 14px">
          <button type="button" class="btn btn-outline" :disabled="analyzing" @click="reanalyzeWeakPatterns">
            {{ analyzing ? '分析中…' : '重新分析薄弱点' }}
          </button>
          <button type="button" class="btn btn-outline" :disabled="countsLoading" @click="refreshCounts">
            {{ countsLoading ? '刷新中…' : '刷新数据量' }}
          </button>
        </div>
        <div v-if="analyzeMessage" class="alert alert-success" style="margin-top: 10px">
          {{ analyzeMessage }}
        </div>
        <div v-if="analyzeError" class="alert alert-danger" style="margin-top: 10px; white-space: pre-line">
          {{ analyzeError }}
        </div>
        <div v-if="countsError" class="alert alert-danger" style="margin-top: 10px; white-space: pre-line">
          {{ countsError }}
        </div>

        <div class="divider" />

        <p class="text-sm text-muted">
          清空全部数据会删除训练组、题目记录、错题、薄弱点与未完成训练，个人设置保留。此操作不可撤销，
          建议先导出备份（§30）。
        </p>
        <div class="btn-row">
          <button type="button" class="btn btn-danger" @click="showClearDialog = true">
            清空全部数据
          </button>
        </div>
        <div v-if="clearMessage" class="alert alert-success" style="margin-top: 10px">
          {{ clearMessage }}
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="showClearDialog"
      title="清空全部数据"
      message="将删除本机全部训练组、题目记录、错题、薄弱点与未完成训练，且无法撤销。个人设置会保留。确定继续吗？"
      confirm-text="确认清空"
      cancel-text="取消"
      danger
      :busy="clearing"
      @confirm="confirmClearAll"
      @cancel="showClearDialog = false"
    />
  </div>
</template>
