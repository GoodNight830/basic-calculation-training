<script setup lang="ts">
/**
 * 训练模式错误反馈（§6.2.2）
 *
 * 至少显示：你的答案 / 正确答案 / 误差
 * 移动端优化：信息压缩到两行，避免在矮屏手机上被键盘挤到需要滚动才能看到；
 * 「继续」按钮由训练页放在底部键盘位置（原来的「确认」处），触控目标更大。
 */
import { computed } from 'vue'
import { formatErrorRate, formatNumber } from '@/modules/arithmetic/five-divide-three/calculator'
import type { AnswerCheck } from '@/modules/arithmetic/five-divide-three/types'

const props = defineProps<{
  check: AnswerCheck
}>()

const reasonText = computed(() => {
  if (props.check.reason === 'empty') return '没有输入答案，已记为错误'
  if (props.check.reason === 'invalid') return '输入不是合法的数字，已记为错误'
  return ''
})
</script>

<template>
  <div class="feedback-panel feedback-wrong">
    <p class="bold" style="margin: 0 0 4px">✕ 回答错误</p>
    <div class="mono text-sm feedback-detail">
      <span>你的答案：{{ formatNumber(props.check.userAnswer) }}</span>
      <span>正确答案：{{ formatNumber(props.check.correctAnswer) }}</span>
      <span>误差：{{ formatErrorRate(props.check.errorRate) }}</span>
    </div>
    <p v-if="reasonText" class="text-xs" style="margin: 4px 0 0">{{ reasonText }}</p>
  </div>
</template>
