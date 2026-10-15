<script setup lang="ts">
/**
 * 正负运算入口页面。
 *
 * 与五除三不同：正负运算不参与 AI 分析 / 能力诊断 / 薄弱点强化，
 * 参数统一在「设置」中配置（题目数量、允许误差），点击即开始。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/app/stores/settings'
import { useTrainingStore } from '@/app/stores/training'
import { MODULE_SIGNED_ADD_SUB } from '@/config/trainingConfig'
import type { TrainingMode } from '@/types'

const router = useRouter()
const settingsStore = useSettingsStore()
const trainingStore = useTrainingStore()

const loading = ref(true)
const startingMode = ref<TrainingMode | ''>('')
const errorMessage = ref('')

const settings = computed(() => settingsStore.settings)

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    await settingsStore.ensureLoaded()
  } catch (error) {
    errorMessage.value = errorText(error)
  } finally {
    loading.value = false
  }
}

async function start(mode: TrainingMode): Promise<void> {
  startingMode.value = mode
  errorMessage.value = ''
  try {
    const current = await settingsStore.ensureLoaded()
    await trainingStore.start({
      module: MODULE_SIGNED_ADD_SUB,
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

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">正负运算</h1>
        <p class="page-subtitle">两位数加减（含正负数）· 点击即开始</p>
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
      </div>

      <div class="alert alert-info section">
        <p class="text-sm" style="margin: 0">本模块为纯练习，不参与 AI 解读与能力诊断。</p>
      </div>
    </template>
  </div>
</template>
