<script setup lang="ts">
/**
 * 收藏 / 笔记按钮（§21.1）：用于题目列表（成果展示、历史记录等）。
 * 按「被除数:除数」聚合，同一道题只收藏一次；已收藏可编辑笔记。
 */
import { computed, onMounted, ref } from 'vue'
import { loadBookmarks, toggleBookmark, updateBookmarkNote } from '@/services/queries'
import type { Bookmark } from '@/types'

const props = defineProps<{
  module: string
  question: string
  dividend: number
  divisor: number
  correctAnswer: number
}>()

const bookmarks = ref<Bookmark[]>([])
const busy = ref(false)
const editing = ref(false)
const noteDraft = ref('')
const errorText = ref('')

const current = computed(() =>
  bookmarks.value.find((b) => b.questionKey === `${props.dividend}:${props.divisor}`) ?? null
)
const bookmarked = computed(() => current.value !== null)

onMounted(async () => {
  try {
    bookmarks.value = await loadBookmarks()
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '收藏加载失败'
  }
})

async function toggle(): Promise<void> {
  if (busy.value) return
  busy.value = true
  errorText.value = ''
  try {
    const result = await toggleBookmark({
      module: props.module,
      question: props.question,
      dividend: props.dividend,
      divisor: props.divisor,
      correctAnswer: props.correctAnswer
    })
    bookmarks.value = result.bookmarks
    if (!result.bookmarked) editing.value = false
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    busy.value = false
  }
}

function startEdit(): void {
  noteDraft.value = current.value?.note ?? ''
  editing.value = true
}

async function saveNote(): Promise<void> {
  if (!current.value || busy.value) return
  busy.value = true
  errorText.value = ''
  try {
    const updated = await updateBookmarkNote(current.value.id, noteDraft.value)
    if (updated) {
      const idx = bookmarks.value.findIndex((b) => b.id === updated.id)
      if (idx >= 0) bookmarks.value[idx] = updated
    }
    editing.value = false
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '笔记保存失败'
  } finally {
    busy.value = false
  }
}

function cancelEdit(): void {
  editing.value = false
}
</script>

<template>
  <div class="bookmark-wrap">
    <div class="row" style="gap: 6px; align-items: center">
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        :class="{ 'bookmarked': bookmarked }"
        :disabled="busy"
        :title="bookmarked ? '取消收藏' : '收藏此题'"
        @click="toggle"
      >
        {{ bookmarked ? '★ 已收藏' : '☆ 收藏' }}
      </button>
      <button
        v-if="bookmarked && !editing"
        type="button"
        class="btn btn-ghost btn-sm"
        :disabled="busy"
        @click="startEdit"
      >
        {{ current?.note ? '📝 编辑笔记' : '📝 记笔记' }}
      </button>
    </div>

    <div v-if="editing" class="bookmark-note" style="margin-top: 6px">
      <textarea
        v-model="noteDraft"
        class="input"
        rows="2"
        placeholder="写下这道题的笔记，例如：进位容易算错，注意估商…"
      />
      <div class="btn-row" style="margin-top: 6px">
        <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="saveNote">
          {{ busy ? '保存中…' : '保存笔记' }}
        </button>
        <button type="button" class="btn btn-outline btn-sm" @click="cancelEdit">取消</button>
      </div>
    </div>
    <div v-else-if="current?.note" class="text-xs text-muted" style="margin-top: 4px">
      笔记：{{ current.note }}
    </div>

    <div v-if="errorText" class="text-xs text-danger" style="margin-top: 4px">{{ errorText }}</div>
  </div>
</template>
