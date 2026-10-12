<script setup lang="ts">
/**
 * 答案输入框（§41 无障碍和输入）
 *
 * 布局对齐参考 App：答案跟在题目下方，是一条「填空线」（下划线样式），
 * 数字键盘固定在屏幕底部，因此这里只负责输入框本身。
 *
 * - 手机不弹系统键盘（inputmode="none"），由底部自带键盘输入
 * - 电脑端物理键盘仍可用：数字、小数点、Backspace、Enter 提交
 * - 直接键入的非法字符会被过滤（全角数字自动转半角）
 */
import { onMounted, ref } from 'vue'
import { sanitizeAnswerInput } from '@/composables/useAnswerInput'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    autofocus?: boolean
    placeholder?: string
  }>(),
  {
    disabled: false,
    autofocus: true,
    placeholder: '计算结果'
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const sanitized = sanitizeAnswerInput(target.value)
  if (sanitized !== target.value) target.value = sanitized
  emit('update:modelValue', sanitized)
}

function focus(): void {
  inputRef.value?.focus()
}

function blur(): void {
  inputRef.value?.blur()
}

onMounted(() => {
  if (props.autofocus) {
    focus()
    setTimeout(focus, 80)
  }
})

defineExpose({ focus, blur })
</script>

<template>
  <input
    ref="inputRef"
    class="answer-line"
    type="text"
    inputmode="none"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
    :value="props.modelValue"
    :disabled="props.disabled"
    :placeholder="props.placeholder"
    aria-label="答案输入框"
    @input="onInput"
    @keydown.enter.prevent="emit('submit')"
  />
</template>
