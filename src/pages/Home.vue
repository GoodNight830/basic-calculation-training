<script setup lang="ts">
/**
 * 首页（信息架构 v3）：一级分类入口。
 * - 支持「列表 / 图标」两种展示样式切换
 * - 支持拖拽排序（桌面端）与上下移动（移动端编辑态）
 * - 排序持久化到 localStorage
 * - 底部补充「今日概览」摘要，减少页面空白
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatCard from '@/components/common/StatCard.vue'
import { loadOverview } from '@/services/queries'
import { formatMs, formatPercent } from '@/services/format'

const router = useRouter()

interface Category {
  key: string
  icon: string
  title: string
  description: string
  available: boolean
}

const DEFAULT_CATEGORIES: Category[] = [
  { key: 'basic', icon: '🧮', title: '基础计算', description: '加减乘除基本功，打好数资基础', available: true },
  { key: 'assist', icon: '🧩', title: '计算辅助', description: '计算练习的辅助针对性训练', available: false },
  { key: 'quantity', icon: '🔢', title: '数量关系专项', description: '提高对数字的敏感性', available: false },
  { key: 'material', icon: '📊', title: '资料分析专项', description: '常用公式的专项练习', available: false }
]

const STORAGE_KEY = 'home-category-order'
const VIEW_KEY = 'home-view-mode'

type ViewMode = 'grid' | 'list'
const viewMode = ref<ViewMode>('grid')
const categories = ref<Category[]>([])

const overview = ref<Awaited<ReturnType<typeof loadOverview>> | null>(null)
const dragIndex = ref<number | null>(null)

const today = computed(() => overview.value?.today ?? null)
const todayAccuracy = computed(() => {
  const s = today.value
  return s && s.questionCount > 0 ? formatPercent(s.accuracy) : '—'
})
const todayAvg = computed(() => {
  const s = today.value
  return s && s.questionCount > 0 ? formatMs(s.avgElapsedMs) : '—'
})

function loadOrder(): Category[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const keys = JSON.parse(saved) as string[]
      const byKey = new Map(DEFAULT_CATEGORIES.map((c) => [c.key, c]))
      const ordered = keys.map((k) => byKey.get(k)).filter((c): c is Category => Boolean(c))
      // 补上新增加的分类
      for (const c of DEFAULT_CATEGORIES) if (!ordered.some((o) => o.key === c.key)) ordered.push(c)
      return ordered
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_CATEGORIES]
}

function persistOrder(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories.value.map((c) => c.key)))
  } catch {
    /* ignore */
  }
}

function setView(mode: ViewMode): void {
  viewMode.value = mode
  try {
    localStorage.setItem(VIEW_KEY, mode)
  } catch {
    /* ignore */
  }
}

function open(category: Category): void {
  if (category.available) void router.push({ name: 'basic' })
  else void router.push({ name: 'coming-soon', query: { title: category.title } })
}

/* ---- 拖拽排序 ---- */
function onDragStart(index: number): void {
  dragIndex.value = index
}
function onDragOver(event: DragEvent): void {
  event.preventDefault()
}
function onDrop(index: number): void {
  if (dragIndex.value === null || dragIndex.value === index) return
  const list = [...categories.value]
  const [moved] = list.splice(dragIndex.value, 1)
  list.splice(index, 0, moved)
  categories.value = list
  dragIndex.value = null
  persistOrder()
}
function onDragEnd(): void {
  dragIndex.value = null
}

/* ---- 移动端上下移动 ---- */
function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= categories.value.length) return
  const list = [...categories.value]
  const [moved] = list.splice(index, 1)
  list.splice(target, 0, moved)
  categories.value = list
  persistOrder()
}

/* ---- 移动端长按拖拽排序（touch） ---- */
const LONG_PRESS_MS = 450
const MOVE_THRESHOLD = 10
const touchDragIndex = ref<number | null>(null)
const touchDragging = ref(false)
let touchTimer: ReturnType<typeof setTimeout> | null = null
let touchStartX = 0
let touchStartY = 0
let touchActive = false

function onTouchStart(index: number, event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch) return
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  touchActive = true
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = setTimeout(() => {
    touchDragIndex.value = index
    touchDragging.value = true
  }, LONG_PRESS_MS)
}

function onTouchMove(event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch) return
  if (!touchDragging.value) {
    // 未进入拖拽态：位移超过阈值则取消长按（避免误触）
    if (Math.abs(touch.clientX - touchStartX) > MOVE_THRESHOLD || Math.abs(touch.clientY - touchStartY) > MOVE_THRESHOLD) {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null }
      touchActive = false
    }
    return
  }
  // 已进入拖拽态：阻止页面滚动，按触摸点命中的卡片实时换位
  event.preventDefault()
  const from = touchDragIndex.value
  if (from === null) return
  const el = document.elementFromPoint(touch.clientX, touch.clientY)
  const targetCard = el?.closest('[data-category-key]') as HTMLElement | null
  if (!targetCard) return
  const targetKey = targetCard.getAttribute('data-category-key')
  const targetIndex = categories.value.findIndex((c) => c.key === targetKey)
  if (targetIndex < 0 || targetIndex === from) return
  const list = [...categories.value]
  const [moved] = list.splice(from, 1)
  list.splice(targetIndex, 0, moved)
  categories.value = list
  touchDragIndex.value = targetIndex
}

function onTouchEnd(): void {
  if (touchTimer) { clearTimeout(touchTimer); touchTimer = null }
  if (touchDragging.value) persistOrder()
  touchDragging.value = false
  touchDragIndex.value = null
  touchActive = false
}

function onTouchCancel(): void {
  onTouchEnd()
}

onMounted(async () => {
  categories.value = loadOrder()
  try {
    const savedView = localStorage.getItem(VIEW_KEY)
    if (savedView === 'list' || savedView === 'grid') viewMode.value = savedView
  } catch {
    /* ignore */
  }
  try {
    overview.value = await loadOverview()
  } catch {
    /* 概览加载失败不阻塞首页 */
  }
})
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">训练分类</h1>
        <p class="page-subtitle">选择一个分类开始训练</p>
      </div>
      <div class="btn-row" style="margin: 0">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :class="{ 'view-active': viewMode === 'grid' }"
          :title="'图标视图'"
          @click="setView('grid')"
        >
          ▦
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :class="{ 'view-active': viewMode === 'list' }"
          :title="'列表视图'"
          @click="setView('list')"
        >
          ☰
        </button>
      </div>
    </div>

    <!-- 图标视图：2 列卡片网格 -->
    <div v-if="viewMode === 'grid'" class="category-grid">
      <div
        v-for="(category, index) in categories"
        :key="category.key"
        class="category-card"
        :class="{ 'category-card-disabled': !category.available, 'is-dragging': dragIndex === index }"
        :draggable="true"
        @dragstart="onDragStart(index)"
        @dragover="onDragOver"
        @drop="onDrop(index)"
        @dragend="onDragEnd"
        @click="open(category)"
      >
        <div class="category-icon">{{ category.icon }}</div>
        <div class="category-title">
          {{ category.title }}
          <span v-if="!category.available" class="badge badge-muted">敬请期待</span>
        </div>
        <div class="category-desc">{{ category.description }}</div>
        <div class="category-move" @click.stop>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="index === 0" @click="move(index, -1)">↑</button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="index === categories.length - 1" @click="move(index, 1)">↓</button>
        </div>
      </div>
    </div>

    <!-- 列表视图：竖排 -->
    <div v-else class="list">
      <div
        v-for="(category, index) in categories"
        :key="category.key"
        class="list-item"
        :class="{ 'is-dragging': dragIndex === index }"
        :draggable="true"
        @dragstart="onDragStart(index)"
        @dragover="onDragOver"
        @drop="onDrop(index)"
        @dragend="onDragEnd"
      >
        <button type="button" class="list-item-main card-interactive" style="background: none; border: none; padding: 0; cursor: pointer" @click="open(category)">
          <span class="bold" style="display: flex; align-items: center; gap: 8px">
            <span>{{ category.icon }}</span>
            {{ category.title }}
            <span v-if="!category.available" class="badge badge-muted">敬请期待</span>
          </span>
          <span class="text-sm text-muted">{{ category.description }}</span>
        </button>
        <div class="row" style="margin-top: 6px; gap: 6px">
          <button type="button" class="btn btn-ghost btn-sm" :disabled="index === 0" @click="move(index, -1)">↑</button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="index === categories.length - 1" @click="move(index, 1)">↓</button>
        </div>
      </div>
    </div>

    <!-- 今日概览（减少空白） -->
    <section class="section" style="margin-top: 20px">
      <h2 class="section-title">今日概览</h2>
      <div v-if="overview" class="stat-grid">
        <StatCard label="今日训练组" :value="today ? today.sessionCount : '—'" />
        <StatCard label="今日题目" :value="today ? today.questionCount : '—'" />
        <StatCard label="今日正确率" :value="todayAccuracy" small />
        <StatCard label="平均单题" :value="todayAvg" small />
      </div>
      <div v-else class="alert alert-info">完成一组训练后，这里会显示今日训练情况。</div>
    </section>

    <p class="text-xs text-muted">长按卡片或使用 ↑↓ 调整顺序 · 本地优先，训练数据仅保存在本机</p>
  </div>
</template>
