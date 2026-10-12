/** 应用设置 store（§7 / §26） */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEFAULT_AI_SETTINGS, DEFAULT_APP_SETTINGS, type AiSettings, type AppSettings, type WeakPatternConfig } from '@/config/trainingConfig'
import * as settingsRepo from '@/db/settings'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_APP_SETTINGS, weakPattern: { ...DEFAULT_APP_SETTINGS.weakPattern }, ai: { ...DEFAULT_AI_SETTINGS } })
  const loaded = ref(false)
  const saving = ref(false)

  const weakConfig = computed<WeakPatternConfig>(() => settings.value.weakPattern)

  async function load(): Promise<AppSettings> {
    settings.value = await settingsRepo.getSettings()
    loaded.value = true
    return settings.value
  }

  async function ensureLoaded(): Promise<AppSettings> {
    if (!loaded.value) return load()
    return settings.value
  }

  async function save(next: AppSettings): Promise<AppSettings> {
    saving.value = true
    try {
      settings.value = await settingsRepo.saveSettings(next)
      return settings.value
    } finally {
      saving.value = false
    }
  }

  async function updateWeakPattern(patch: Partial<WeakPatternConfig>): Promise<AppSettings> {
    return save({ ...settings.value, weakPattern: { ...settings.value.weakPattern, ...patch } })
  }

  async function updateDefaults(
    patch: Partial<Pick<AppSettings, 'defaultMode' | 'defaultQuestionCount' | 'defaultAllowedErrorRate'>>
  ): Promise<AppSettings> {
    return save({ ...settings.value, ...patch })
  }

  async function updateAi(patch: Partial<AiSettings>): Promise<AppSettings> {
    return save({ ...settings.value, ai: { ...settings.value.ai, ...patch } })
  }

  async function reset(): Promise<AppSettings> {
    settings.value = await settingsRepo.resetSettings()
    return settings.value
  }

  return {
    settings,
    loaded,
    saving,
    weakConfig,
    load,
    ensureLoaded,
    save,
    updateWeakPattern,
    updateDefaults,
    updateAi,
    reset
  }
})
