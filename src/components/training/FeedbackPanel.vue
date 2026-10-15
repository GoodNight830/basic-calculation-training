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
import { MODULE_SIGNED_ADD_SUB } from '@/config/trainingConfig'
import type { AnswerCheck } from '@/modules/arithmetic/five-divide-three/types'

const props = defineProps<{
  check: AnswerCheck
  module?: string
}>()

const isSigned = computed(() => props.module === MODULE_SIGNED_ADD_SUB)

/** 答案展示：正负运算显示整数，五除三显示两位小数 */
function answerLabel(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return isSigned.value ? String(value) : formatNumber(value)
}

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
      <span>你的答案：{{ answerLabel(props.check.userAnswer) }}</span>
      <span>正确答案：{{ answerLabel(props.check.correctAnswer) }}</span>
      <span v-if="!isSigned">误差：{{ formatErrorRate(props.check.errorRate) }}</span>
    </div>
    <p v-if="reasonText" class="text-xs" style="margin: 4px 0 0">{{ reasonText }}</p>
  </div>
</template>
