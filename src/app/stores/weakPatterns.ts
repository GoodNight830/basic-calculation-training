/** 薄弱点 store（§14 / §15 / §16） */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { MODULE_FIVE_DIVIDE_THREE } from '@/config/trainingConfig'
import * as weakPatternsRepo from '@/db/weakPatterns'
import { recomputeWeakPatterns } from '@/services/training'
import { reinforcementTargets, totalReinforcementRatio } from '@/services/weakPattern'
import { useSettingsStore } from './settings'
import type { WeakPattern, WeakTarget } from '@/types'

export const useWeakPatternStore = defineStore('weakPatterns', () => {
  const patterns = ref<WeakPattern[]>([])
  const loading = ref(false)
  const module = ref(MODULE_FIVE_DIVIDE_THREE)

  const activePatterns = computed(() =>
    patterns.value.filter((p) => p.status === 'active' || p.status === 'improving')
  )
  const resolvedPatterns = computed(() => patterns.value.filter((p) => p.status === 'resolved'))

  async function load(moduleId: string = module.value): Promise<WeakPattern[]> {
    module.value = moduleId
    loading.value = true
    try {
      patterns.value = await weakPatternsRepo.listWeakPatterns(moduleId)
      return patterns.value
    } finally {
      loading.value = false
    }
  }

  /** 重新分析：基于全部正式训练数据重算薄弱点并落库 */
  async function refresh(moduleId: string = module.value): Promise<WeakPattern[]> {
    const settingsStore = useSettingsStore()
    const config = await settingsStore.ensureLoaded()
    loading.value = true
    try {
      patterns.value = await recomputeWeakPatterns(moduleId, config.weakPattern)
      return patterns.value
    } finally {
      loading.value = false
    }
  }

  /** 当前强化出题目标，供题目生成器使用（§16） */
  function buildTargets(config = useSettingsStore().weakConfig): WeakTarget[] {
    return reinforcementTargets(patterns.value, config)
  }

  function reinforcementRatio(): number {
    return totalReinforcementRatio(patterns.value)
  }

  async function clear(moduleId: string = module.value): Promise<void> {
    await weakPatternsRepo.clearWeakPatterns(moduleId)
    patterns.value = []
  }

  return {
    patterns,
    loading,
    module,
    activePatterns,
    resolvedPatterns,
    load,
    refresh,
    buildTargets,
    reinforcementRatio,
    clear
  }
})
