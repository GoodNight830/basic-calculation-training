<script setup lang="ts">
/** 分类占位页：未开放的分类统一跳到这里，避免用户面对空白页。 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const title = computed(() => {
  const value = route.query.title
  return typeof value === 'string' && value.trim() ? value : '该分类'
})
</script>

<template>
  <div class="page">
    <div class="empty">
      <h2 class="section-title">{{ title }} · 即将上线</h2>
      <p class="text-sm text-muted">这个分类正在开发中，先从「基础计算」开始训练吧。</p>
      <div class="btn-row" style="justify-content: center; margin-top: 12px">
        <button type="button" class="btn btn-primary" @click="router.push({ name: 'basic' })">去基础计算</button>
        <button type="button" class="btn btn-outline" @click="router.push({ name: 'home' })">返回首页</button>
      </div>
    </div>
  </div>
</template>
