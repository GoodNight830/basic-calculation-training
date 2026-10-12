<script setup lang="ts">
/** 统计数字卡片 */
const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    small?: boolean
  }>(),
  { hint: '', small: false }
)
</script>

<template>
  <div class="stat">
    <div class="stat-label">{{ props.label }}</div>
    <div class="stat-value" :class="{ 'stat-value-sm': props.small }">{{ props.value }}</div>
    <div v-if="props.hint" class="text-xs text-muted">{{ props.hint }}</div>
  </div>
</template>
