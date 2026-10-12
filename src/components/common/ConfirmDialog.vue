<script setup lang="ts">
/** 通用确认弹窗 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    confirmText?: string
    cancelText?: string
    busy?: boolean
    danger?: boolean
  }>(),
  {
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    busy: false,
    danger: false
  }
)

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'cancel'): void
}>()
</script>

<template>
  <div v-if="props.open" class="modal-mask" role="dialog" aria-modal="true">
    <div class="modal">
      <h2 class="modal-title">{{ props.title }}</h2>
      <p v-if="props.message" class="text-sm text-muted" style="white-space: pre-line; margin: 0">
        {{ props.message }}
      </p>
      <slot />
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" :disabled="props.busy" @click="emit('cancel')">
          {{ props.cancelText }}
        </button>
        <button
          type="button"
          class="btn"
          :class="props.danger ? 'btn-danger' : 'btn-primary'"
          :disabled="props.busy"
          @click="emit('confirm')"
        >
          {{ props.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
