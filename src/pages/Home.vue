<script setup lang="ts">
/**
 * 首页（信息架构 v2）：只放一级分类入口，保持层级清晰。
 * - 一级：训练分类（本页）
 * - 二级：基础计算题型与工具（/basic）
 * - 三级：具体训练页（/five-divide-three → /training）
 */
import { useRouter } from 'vue-router'

const router = useRouter()

interface Category {
  key: string
  title: string
  description: string
  available: boolean
}

const categories: Category[] = [
  { key: 'basic', title: '基础计算', description: '训练最基本的加减乘除，打好数资基础', available: true },
  { key: 'assist', title: '计算辅助', description: '提供计算练习的辅助针对性训练', available: false },
  { key: 'quantity', title: '数量关系专项', description: '通过大量训练提高对数字的敏感性', available: false },
  { key: 'material', title: '资料分析专项', description: '提供实际做题中常用公式的专项练习', available: false }
]

function open(category: Category): void {
  if (category.available) {
    void router.push({ name: 'basic' })
  } else {
    void router.push({ name: 'coming-soon', query: { title: category.title } })
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">训练分类</h1>
        <p class="page-subtitle">选择一个分类开始</p>
      </div>
    </div>

    <div class="list">
      <button
        v-for="category in categories"
        :key="category.key"
        type="button"
        class="list-item card-interactive"
        @click="open(category)"
      >
        <span class="list-item-main">
          <span class="bold">
            {{ category.title }}
            <span v-if="!category.available" class="badge">敬请期待</span>
          </span>
          <span class="text-sm text-muted">{{ category.description }}</span>
        </span>
      </button>
    </div>

    <p class="text-xs text-muted" style="margin-top: 12px">本地优先 · 训练数据仅保存在本机</p>
  </div>
</template>
