<script setup lang="ts">
/** 等级徽章（§10 / §35）：优秀 / 良好 / 合格 / 加油 */
import { computed } from 'vue'
import { gradeLabel } from '@/services/grading'
import type { Grade } from '@/types'

const props = withDefaults(
  defineProps<{
    grade: Grade
    large?: boolean
  }>(),
  { large: false }
)

const badgeClass = computed(() => {
  switch (props.grade) {
    case 'excellent':
      return 'badge-success'
    case 'good':
      return ''
    case 'pass':
      return 'badge-warning'
    default:
      return 'badge-danger'
  }
})
</script>

<template>
  <span class="badge" :class="[badgeClass, { 'badge-lg': props.large }]">{{ gradeLabel(props.grade) }}</span>
</template>
