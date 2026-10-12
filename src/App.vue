<script setup lang="ts">
/**
 * 应用外壳（§24 响应式设计）：
 * - 手机 / 平板：底部导航，单手可操作
 * - PC：左侧导航 + 更宽内容区
 * - §9：启动时检测未完成训练，提示继续或放弃
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { mobileNavigation, navigationRoutes } from '@/app/router'
import { useTrainingStore } from '@/app/stores/training'
import { formatDuration } from '@/services/format'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import type { ActiveSession } from '@/types'

const route = useRoute()
const router = useRouter()
const trainingStore = useTrainingStore()

const focusMode = computed(() => route.name === 'training')
const resumeCandidate = ref<ActiveSession | null>(null)
const showResumeDialog = ref(false)
const resuming = ref(false)

const unfinishedSummary = computed(() => {
  const session = resumeCandidate.value
  if (!session) return ''
  const modeLabel = session.mode === 'speed' ? '竞速模式' : '训练模式'
  return `${modeLabel} · 已完成 ${session.answers.length} 题`
})

onMounted(async () => {
  const found = await trainingStore.detectUnfinished()
  if (found) {
    resumeCandidate.value = found
    showResumeDialog.value = true
  }
})

async function continueTraining(): Promise<void> {
  if (!resumeCandidate.value) return
  resuming.value = true
  try {
    await trainingStore.resume(resumeCandidate.value)
    showResumeDialog.value = false
    resumeCandidate.value = null
    if (route.name !== 'training') {
      await router.push({ name: 'training' })
    }
  } finally {
    resuming.value = false
  }
}

async function discardTraining(): Promise<void> {
  await trainingStore.discardUnfinished()
  // 若训练页面已经恢复了该训练组，这里一并对齐，避免“页面在训练、数据库已丢弃”的不一致
  if (trainingStore.hasActiveSession) {
    await trainingStore.abandon()
  }
  showResumeDialog.value = false
  resumeCandidate.value = null
}

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell-focus': focusMode }">
    <aside v-if="!focusMode" class="app-sidebar desktop-only">
      <div class="app-brand">基础计算训练</div>
      <nav class="nav">
        <RouterLink
          v-for="item in navigationRoutes"
          :key="item.name"
          class="nav-link"
          :class="{ active: isActive(item.path) }"
          :to="item.path"
        >
          <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="app-main">
      <RouterView />
    </main>

    <nav v-if="!focusMode" class="nav mobile-only">
      <RouterLink
        v-for="item in mobileNavigation"
        :key="item.name"
        class="nav-link"
        :class="{ active: isActive(item.path) }"
        :to="item.path"
      >
        <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <ConfirmDialog
      :open="showResumeDialog"
      title="检测到未完成训练"
      :message="`${unfinishedSummary}\n是否继续上次训练？`"
      confirm-text="继续训练"
      cancel-text="放弃本次训练"
      :busy="resuming"
      @confirm="continueTraining"
      @cancel="discardTraining"
    />

    <div v-if="showResumeDialog" class="text-xs text-muted text-center" style="position: fixed; bottom: 8px; left: 0; right: 0; z-index: 70">
      <span v-if="resumeCandidate">
        已训练用时约 {{ formatDuration(resumeCandidate.accumulatedElapsedMs) }}
      </span>
    </div>
  </div>
</template>
