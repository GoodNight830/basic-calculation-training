/** 设置数据访问（§7 / §32） */

import { db } from './database'
import { toPlain } from '@/utils/plain'
import { ALLOWED_ERROR_RATE, DEFAULT_AI_SETTINGS, DEFAULT_APP_SETTINGS, DEFAULT_WEAK_PATTERN_CONFIG, QUESTION_COUNT, type AiAutoAnalysis, type AiReportDetail, type AppSettings, type LearningGoal, type WeakPatternConfig } from '@/config/trainingConfig'
import type { SettingRow } from '@/types'

const SETTINGS_KEY = 'app-settings'

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 合并默认值并做范围校验，避免非法数值进入数据库（§42） */
export function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const raw = input ?? {}
  const weakRaw: Partial<WeakPatternConfig> = raw.weakPattern ?? {}
  const weak: WeakPatternConfig = {
    ...DEFAULT_WEAK_PATTERN_CONFIG,
    ...weakRaw,
    minSampleCount: clamp(
      Number(weakRaw.minSampleCount ?? DEFAULT_WEAK_PATTERN_CONFIG.minSampleCount),
      1,
      1000,
      DEFAULT_WEAK_PATTERN_CONFIG.minSampleCount
    ),
    minErrorCount: clamp(
      Number(weakRaw.minErrorCount ?? DEFAULT_WEAK_PATTERN_CONFIG.minErrorCount),
      1,
      1000,
      DEFAULT_WEAK_PATTERN_CONFIG.minErrorCount
    ),
    ratioThreshold: clamp(
      Number(weakRaw.ratioThreshold ?? DEFAULT_WEAK_PATTERN_CONFIG.ratioThreshold),
      1,
      100,
      DEFAULT_WEAK_PATTERN_CONFIG.ratioThreshold
    ),
    maxReinforcementRatio: clamp(
      Number(weakRaw.maxReinforcementRatio ?? DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementRatio),
      0,
      0.9,
      DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementRatio
    ),
    maxReinforcementWeight: clamp(
      Number(weakRaw.maxReinforcementWeight ?? DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementWeight),
      0,
      1,
      DEFAULT_WEAK_PATTERN_CONFIG.maxReinforcementWeight
    ),
    rangeSize: [100, 50, 10, 1].includes(Number(weakRaw.rangeSize))
      ? Number(weakRaw.rangeSize)
      : DEFAULT_WEAK_PATTERN_CONFIG.rangeSize,
    enableReinforcement: weakRaw.enableReinforcement !== false
  }
  const aiRaw = raw.ai ?? DEFAULT_AI_SETTINGS
  const normalizedAiBaseUrl = normalizeBaseUrl(String(aiRaw.baseUrl ?? DEFAULT_AI_SETTINGS.baseUrl))
  const knownResponsesProvider = /(^|\.)fastaitoken\.com$/i.test(safeHostname(normalizedAiBaseUrl))
  const autoOptions: AiAutoAnalysis[] = ['off', 'daily', 'weekly', 'after_30_questions']
  const detailOptions: AiReportDetail[] = ['short', 'standard', 'detailed']
  const goalOptions: LearningGoal[] = ['accuracy', 'speed', 'exam', 'maintenance']

  return {
    defaultMode: raw.defaultMode === 'speed' ? 'speed' : 'training',
    defaultQuestionCount: clamp(
      Number(raw.defaultQuestionCount ?? DEFAULT_APP_SETTINGS.defaultQuestionCount),
      QUESTION_COUNT.min,
      QUESTION_COUNT.max,
      DEFAULT_APP_SETTINGS.defaultQuestionCount
    ),
    defaultAllowedErrorRate: clamp(
      Number(raw.defaultAllowedErrorRate ?? DEFAULT_APP_SETTINGS.defaultAllowedErrorRate),
      ALLOWED_ERROR_RATE.min,
      ALLOWED_ERROR_RATE.max,
      DEFAULT_APP_SETTINGS.defaultAllowedErrorRate
    ),
    weakPattern: weak,
    ai: {
      ...DEFAULT_AI_SETTINGS,
      ...aiRaw,
      enabled: aiRaw.enabled === true,
      consentToUpload: aiRaw.consentToUpload === true,
      provider: String(aiRaw.provider ?? DEFAULT_AI_SETTINGS.provider).slice(0, 80),
      baseUrl: normalizedAiBaseUrl,
      apiKey: String(aiRaw.apiKey ?? '').trim(),
      model: String(aiRaw.model ?? '').trim().slice(0, 200),
      wireApi: knownResponsesProvider || aiRaw.wireApi === 'responses' ? 'responses' : 'chat_completions',
      transport: aiRaw.transport === 'direct' ? 'direct' : 'local_proxy',
      reasoningEffort: ['low', 'medium', 'high'].includes(String(aiRaw.reasoningEffort))
        ? aiRaw.reasoningEffort as 'low' | 'medium' | 'high'
        : 'medium',
      autoAnalysis: autoOptions.includes(aiRaw.autoAnalysis as AiAutoAnalysis) ? aiRaw.autoAnalysis as AiAutoAnalysis : 'off',
      reportDetail: detailOptions.includes(aiRaw.reportDetail as AiReportDetail) ? aiRaw.reportDetail as AiReportDetail : 'standard',
      learningGoal: goalOptions.includes(aiRaw.learningGoal as LearningGoal) ? aiRaw.learningGoal as LearningGoal : 'accuracy',
      maxOutputTokens: Math.round(clamp(Number(aiRaw.maxOutputTokens ?? 1200), 300, 4000, 1200))
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  const markdownUrl = trimmed.match(/\]\((https?:\/\/[^)]+)\)/i)?.[1]
  const plainUrl = trimmed.match(/https?:\/\/[^\s\])]+/i)?.[0]
  return (markdownUrl ?? plainUrl ?? trimmed).replace(/\/$/, '')
}

function safeHostname(value: string): string {
  try { return new URL(value).hostname }
  catch { return '' }
}

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get(SETTINGS_KEY)
  return normalizeSettings((row?.value as Partial<AppSettings> | undefined) ?? null)
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const normalized = normalizeSettings(settings)
  const row: SettingRow<AppSettings> = {
    key: SETTINGS_KEY,
    value: normalized,
    updatedAt: new Date().toISOString()
  }
  await db.settings.put(toPlain(row))
  return normalized
}

export async function resetSettings(): Promise<AppSettings> {
  await db.settings.delete(SETTINGS_KEY)
  return { ...DEFAULT_APP_SETTINGS, weakPattern: { ...DEFAULT_WEAK_PATTERN_CONFIG }, ai: { ...DEFAULT_AI_SETTINGS } }
}
