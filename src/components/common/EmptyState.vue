<script setup lang="ts">
/** 空状态 */
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
  }>(),
  { description: '' }
)
</script>

<template>
  <div class="empty">
    <p class="bold" style="margin: 0 0 6px">{{ props.title }}</p>
    <p v-if="props.description" class="text-sm" style="margin: 0 0 12px">{{ props.description }}</p>
    <slot />
  </div>
</template>
