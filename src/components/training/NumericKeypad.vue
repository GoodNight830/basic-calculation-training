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
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    /** 是否显示「确认」按键（反馈展示期间隐藏） */
    showSubmit?: boolean
    /** 是否显示正负号切换键（正负运算模块） */
    allowNegative?: boolean
  }>(),
  { disabled: false, showSubmit: true, allowNegative: false }
)

const emit = defineEmits<{
  (event: 'key', value: string): void
  (event: 'backspace'): void
  (event: 'clear'): void
  (event: 'restart'): void
  (event: 'submit'): void
  (event: 'toggleSign'): void
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

const pressedKey = ref('')
let releaseHandle: ReturnType<typeof setTimeout> | null = null

function beginPress(key: string): void {
  if (props.disabled) return
  if (releaseHandle !== null) clearTimeout(releaseHandle)
  pressedKey.value = key
  if ('vibrate' in navigator) navigator.vibrate(8)
}

function endPress(): void {
  if (releaseHandle !== null) clearTimeout(releaseHandle)
  releaseHandle = setTimeout(() => {
    pressedKey.value = ''
    releaseHandle = null
  }, 120)
}

onBeforeUnmount(() => {
  if (releaseHandle !== null) clearTimeout(releaseHandle)
})

const pressDigit = (value: string): void => guarded(() => emit('key', value))
const pressBackspace = (): void => guarded(() => emit('backspace'))
const pressClear = (): void => guarded(() => emit('clear'))
const pressRestart = (): void => guarded(() => emit('restart'))
const pressSubmit = (): void => guarded(() => emit('submit'))
const pressToggleSign = (): void => guarded(() => emit('toggleSign'))
</script>

<template>
  <div class="keypad" role="group" aria-label="数字键盘">
    <!-- 第一行：重开 / 清空 / 退格 -->
    <button
      type="button"
      class="keypad-key keypad-key-fn"
      :class="{ 'is-pressed': pressedKey === 'restart' }"
      :disabled="props.disabled"
      title="重开：清空输入并重新计时（不计入成绩）"
      @mousedown.prevent
      @pointerdown="beginPress('restart')"
      @pointerup="endPress"
      @pointercancel="endPress"
      @click="pressRestart"
    >
      重开
    </button>
    <button
      type="button"
      class="keypad-key keypad-key-fn"
      :class="{ 'is-pressed': pressedKey === 'clear' }"
      :disabled="props.disabled"
      title="清空：清除当前输入的答案"
      @mousedown.prevent
      @pointerdown="beginPress('clear')"
      @pointerup="endPress"
      @pointercancel="endPress"
      @click="pressClear"
    >
      清空
    </button>
    <button
      type="button"
      class="keypad-key keypad-key-fn"
      :class="{ 'is-pressed': pressedKey === 'backspace' }"
      :disabled="props.disabled"
      aria-label="退格"
      title="退格：删除最后一位"
      @mousedown.prevent
      @pointerdown="beginPress('backspace')"
      @pointerup="endPress"
      @pointercancel="endPress"
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
        :class="{ 'is-pressed': pressedKey === digit }"
        :disabled="props.disabled"
        :aria-label="`数字 ${digit}`"
        @mousedown.prevent
        @pointerdown="beginPress(digit)"
        @pointerup="endPress"
        @pointercancel="endPress"
        @click="pressDigit(digit)"
      >
        {{ digit }}
      </button>
    </template>

    <!-- 最后一行：正负号(可选) / 小数点 / 0 / 确认 -->
    <button
      v-if="props.allowNegative"
      type="button"
      class="keypad-key"
      :class="{ 'is-pressed': pressedKey === 'sign' }"
      :disabled="props.disabled"
      aria-label="正负号切换"
      title="切换正负号"
      @mousedown.prevent
      @pointerdown="beginPress('sign')"
      @pointerup="endPress"
      @pointercancel="endPress"
      @click="pressToggleSign"
    >
      +/−
    </button>
    <button
      type="button"
      class="keypad-key"
      :class="{ 'is-pressed': pressedKey === 'decimal' }"
      :disabled="props.disabled"
      aria-label="小数点"
      @mousedown.prevent
      @pointerdown="beginPress('decimal')"
      @pointerup="endPress"
      @pointercancel="endPress"
      @click="pressDigit('.')"
    >
      .
    </button>
    <button
      type="button"
      class="keypad-key"
      :class="{ 'is-pressed': pressedKey === '0' }"
      :disabled="props.disabled"
      aria-label="数字 0"
      @mousedown.prevent
      @pointerdown="beginPress('0')"
      @pointerup="endPress"
      @pointercancel="endPress"
      @click="pressDigit('0')"
    >
      0
    </button>
    <button
      v-if="props.showSubmit"
      type="button"
      class="keypad-key keypad-key-submit"
      :class="{ 'is-pressed': pressedKey === 'submit' }"
      :disabled="props.disabled"
      title="确认：提交答案（Enter）"
      @mousedown.prevent
      @pointerdown="beginPress('submit')"
      @pointerup="endPress"
      @pointercancel="endPress"
      @click="pressSubmit"
    >
      确认
    </button>
  </div>
</template>
