<script setup lang="ts">
/**
 * 数字键盘（由本应用提供，不依赖手机系统键盘）
 *
 * 布局对齐参考 App 的键盘（用户提供的截图）：
 *
 *   重开   清空   退格
 *    1      2      3
 *    4      5      6
 *    7      8      9
 *    .      0     确认
 *
 * - 重开：清空输入并重新计时（不记录成绩，可用于算错后重做本题）
 * - 清空：清空当前输入
 * - 退格：删除最后一位
 * - 确认：提交答案（等同回车）
 *
 * 大触摸目标，适合单手操作（§24.1）；按钮使用 @mousedown.prevent，
 * 点击时不会抢走输入框焦点，因此电脑端物理键盘仍可正常输入（§41）。
 */
const props = withDefaults(
  defineProps<{
    disabled?: boolean
    /** 是否显示「确认」按键（反馈展示期间隐藏） */
    showSubmit?: boolean
  }>(),
  { disabled: false, showSubmit: true }
)

const emit = defineEmits<{
  (event: 'key', value: string): void
  (event: 'backspace'): void
  (event: 'clear'): void
  (event: 'restart'): void
  (event: 'submit'): void
}>()

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9']
] as const

function guarded(action: () => void): void {
  if (props.disabled) return
  action()
}

const pressDigit = (value: string): void => guarded(() => emit('key', value))
const pressBackspace = (): void => guarded(() => emit('backspace'))
const pressClear = (): void => guarded(() => emit('clear'))
const pressRestart = (): void => guarded(() => emit('restart'))
const pressSubmit = (): void => guarded(() => emit('submit'))
</script>

<template>
  <div class="keypad" role="group" aria-label="数字键盘">
    <!-- 第一行：重开 / 清空 / 退格 -->
    <button
      type="button"
      class="keypad-key keypad-key-fn"
      :disabled="props.disabled"
      title="重开：清空输入并重新计时（不计入成绩）"
      @mousedown.prevent
      @click="pressRestart"
    >
      重开
    </button>
    <button
      type="button"
      class="keypad-key keypad-key-fn"
      :disabled="props.disabled"
      title="清空：清除当前输入的答案"
      @mousedown.prevent
      @click="pressClear"
    >
      清空
    </button>
    <button
      type="button"
      class="keypad-key keypad-key-fn"
      :disabled="props.disabled"
      aria-label="退格"
      title="退格：删除最后一位"
      @mousedown.prevent
      @click="pressBackspace"
    >
      退格
    </button>

    <!-- 数字区 -->
    <template v-for="(row, rowIndex) in DIGIT_ROWS" :key="rowIndex">
      <button
        v-for="digit in row"
        :key="digit"
        type="button"
        class="keypad-key"
        :disabled="props.disabled"
        :aria-label="`数字 ${digit}`"
        @mousedown.prevent
        @click="pressDigit(digit)"
      >
        {{ digit }}
      </button>
    </template>

    <!-- 最后一行：小数点 / 0 / 确认 -->
    <button
      type="button"
      class="keypad-key"
      :disabled="props.disabled"
      aria-label="小数点"
      @mousedown.prevent
      @click="pressDigit('.')"
    >
      .
    </button>
    <button
      type="button"
      class="keypad-key"
      :disabled="props.disabled"
      aria-label="数字 0"
      @mousedown.prevent
      @click="pressDigit('0')"
    >
      0
    </button>
    <button
      v-if="props.showSubmit"
      type="button"
      class="keypad-key keypad-key-submit"
      :disabled="props.disabled"
      title="确认：提交答案（Enter）"
      @mousedown.prevent
      @click="pressSubmit"
    >
      确认
    </button>
  </div>
</template>
