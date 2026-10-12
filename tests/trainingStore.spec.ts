/**
 * 训练 store 与输入组件的集成回归测试。
 *
 * 背景（真实 BUG 回归）：
 * Pinia/Vue 的 state 是响应式 Proxy，而 IndexedDB 的结构化克隆无法克隆 Proxy，
 * 曾经导致「提交答案后抛出 DataCloneError，界面停在第 1 题且没有任何提示」。
 * 这里用真实 store（而不是纯函数）走完整流程，确保该类问题不再出现。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { db } from '@/db/database'
import { useTrainingStore } from '@/app/stores/training'
import Training from '@/pages/Training.vue'
import { listQuestionsBySession } from '@/db/questions'
import * as activeSessionsRepo from '@/db/activeSessions'
import AnswerInput from '@/components/training/AnswerInput.vue'
import NumericKeypad from '@/components/training/NumericKeypad.vue'
import {
  appendAnswerKey,
  backspaceAnswer,
  sanitizeAnswerInput
} from '@/composables/useAnswerInput'

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.sessions.clear(),
    db.questions.clear(),
    db.wrongQuestions.clear(),
    db.weakPatterns.clear(),
    db.settings.clear(),
    db.activeSessions.clear()
  ])
}

function mountComponent(render: () => unknown): { unmount: () => void; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp({ render: render as () => ReturnType<typeof h> })
  app.mount(container)
  return { unmount: () => app.unmount(), container }
}

function clickByText(container: HTMLElement, text: string): void {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text
  )
  if (!button) throw new Error(`未找到按钮：${text}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

beforeEach(async () => {
  await clearDatabase()
  setActivePinia(createPinia())
})

describe('训练流程推进（回归：响应式对象写入 IndexedDB）', () => {
  it('训练模式：提交后进入下一题，且题目记录落库', async () => {
    const store = useTrainingStore()
    await store.start({ mode: 'training', questionCount: 10, allowedErrorRate: 3 })

    const first = store.question
    expect(first).not.toBeNull()

    const outcome = await store.submit('123')
    store.stopTimer()

    expect(outcome).toBe('answered')
    expect(store.answeredCount).toBe(1)
    expect(store.errorMessage).toBe('')

    // 题目必须换新
    const second = store.question
    expect(second).not.toBeNull()
    expect(second!.id).not.toBe(first!.id)

    // 原始数据落库（含 correctAnswer），并且能被重新读出
    const records = await listQuestionsBySession(store.active!.sessionId)
    expect(records).toHaveLength(1)
    expect(records[0].correctAnswer).toBeCloseTo(first!.correctAnswer, 12)
    expect(records[0].questionIndex).toBe(1)

    // 活动训练可恢复（写入的也是纯对象）
    const active = await activeSessionsRepo.getActiveSession('five-divide-three')
    expect(active).not.toBeNull()
    expect(active!.answers).toHaveLength(1)
  })

  it('竞速模式：提交后进入下一题且不显示任何反馈', async () => {
    const store = useTrainingStore()
    await store.start({ mode: 'speed', questionCount: 3, allowedErrorRate: 3 })
    const first = store.question

    const outcome = await store.submit('999')
    store.stopTimer()

    expect(outcome).toBe('answered')
    expect(store.feedback).toBeNull()
    expect(store.awaitingContinue).toBe(false)
    expect(store.question!.id).not.toBe(first!.id)
  })

  it('训练模式答错：给出反馈并等待用户继续，继续后进入下一题', async () => {
    const store = useTrainingStore()
    await store.start({ mode: 'training', questionCount: 10, allowedErrorRate: 3 })
    const first = store.question

    await store.submit('1')
    expect(store.feedback?.correct).toBe(false)
    expect(store.awaitingContinue).toBe(true)

    store.continueNext()
    store.stopTimer()
    expect(store.awaitingContinue).toBe(false)
    expect(store.question!.id).not.toBe(first!.id)
  })

  it('连续提交 12 题不会中断（每题都换新并落库）', async () => {
    const store = useTrainingStore()
    await store.start({ mode: 'training', questionCount: 10, allowedErrorRate: 3 })
    const seen = new Set<string>()

    for (let index = 0; index < 12; index += 1) {
      const question = store.question
      expect(question).not.toBeNull()
      seen.add(question!.id)
      const outcome = await store.submit(String(index))
      expect(outcome).toBe('answered')
      store.continueNext()
    }
    store.stopTimer()

    expect(store.answeredCount).toBe(12)
    expect(seen.size).toBe(12)
    const records = await listQuestionsBySession(store.active!.sessionId)
    expect(records).toHaveLength(12)
  })

  it('错题重练（题目来自 store 状态）同样可以正常提交与落库', async () => {
    const store = useTrainingStore()
    await store.start({ mode: 'training', questionCount: 10, allowedErrorRate: 3 })
    const question = store.question!

    // 先答错，制造错题
    await store.submit('1')
    await store.finish()
    const wrongList = await db.wrongQuestions.toArray()
    expect(wrongList).toHaveLength(1)

    // 用 store 里的错题对象（响应式代理）开始重练
    const retryStore = useTrainingStore()
    await retryStore.start({
      mode: 'training',
      source: 'wrongQuestions',
      wrongQuestions: wrongList
    })
    expect(retryStore.isFromWrongQuestions).toBe(true)
    expect(retryStore.question!.dividend).toBe(question.dividend)
    expect(retryStore.question!.divisor).toBe(question.divisor)

    const outcome = await retryStore.submit('1')
    retryStore.stopTimer()
    expect(outcome).toBe('answered')
    expect(retryStore.question!.id).not.toBe(question.id)
  })
})

describe('训练页布局（题目固定 + 键盘贴底，回归：下滑看不到题目）', () => {
  async function mountTrainingPage(): Promise<{ container: HTMLElement; unmount: () => void }> {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useTrainingStore()
    await store.start({ mode: 'training', questionCount: 10, allowedErrorRate: 3 })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { render: () => h('div') } },
        {
          path: '/five-divide-three',
          name: 'five-divide-three',
          component: { render: () => h('div') }
        },
        { path: '/training', name: 'training', component: Training },
        {
          path: '/result/:sessionId',
          name: 'result',
          component: { render: () => h('div') }
        }
      ]
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp({ render: () => h(RouterView) })
    app.use(pinia)
    app.use(router)
    app.mount(container)

    await router.push({ name: 'training' })
    await router.isReady()
    await nextTick()
    await nextTick()
    store.stopTimer()

    return { container, unmount: () => app.unmount() }
  }

  it('三个区域顺序固定：题目区 → 弹性信息区 → 底部键盘区', async () => {
    const { container, unmount } = await mountTrainingPage()

    const panel = container.querySelector('.training-panel')
    expect(panel).not.toBeNull()

    const zones = [...panel!.children].map((child) =>
      [...child.classList].find((name) => name.startsWith('training-'))
    )
    expect(zones).toEqual(['training-head', 'training-extras', 'training-keypad'])
    unmount()
  })

  it('题目与答案在不可滚动的顶部区，不会随中间区域滚动而被推走', async () => {
    const { container, unmount } = await mountTrainingPage()

    const head = container.querySelector('.training-head')!
    const extras = container.querySelector('.training-extras')!
    const question = container.querySelector('.training-question')!
    const answerInput = container.querySelector('.answer-line')!

    // 题目与答案都固定在顶部区
    expect(head.contains(question)).toBe(true)
    expect(head.contains(answerInput)).toBe(true)
    // 中间弹性区不包含题目
    expect(extras.contains(question)).toBe(false)
    // 题目文本与当前题目一致
    const store = useTrainingStore()
    expect(question.textContent).toContain(String(store.question!.dividend))
    expect(question.textContent).toContain(String(store.question!.divisor))
    unmount()
  })

  it('底部键盘区在最后，并包含完整键位', async () => {
    const { container, unmount } = await mountTrainingPage()

    const keypadZone = container.querySelector('.training-keypad')
    expect(keypadZone).not.toBeNull()
    expect(keypadZone!.querySelectorAll('.keypad-key').length).toBe(15)

    const panelChildren = [...container.querySelector('.training-panel')!.children]
    expect(panelChildren[panelChildren.length - 1]).toBe(keypadZone)
    unmount()
  })

  it('顶部区显示允许误差与等级用时速查（不写死阈值）', async () => {
    const { container, unmount } = await mountTrainingPage()
    const head = container.querySelector('.training-head')!.textContent ?? ''

    expect(head).toContain('允许误差')
    expect(head).toContain('±3%')
    expect(head).toContain('合格：90S')
    expect(head).toContain('良好：75S')
    expect(head).toContain('优秀：60S')
    unmount()
  })
})

describe('数字键盘组件事件链路（§41）', () => {
  it('NumericKeypad：布局与参考键盘一致（重开/清空/退格 在第一行，确认在最后一行）', async () => {
    const { container, unmount } = mountComponent(() => h(NumericKeypad, {}))
    await nextTick()

    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels).toEqual([
      '重开',
      '清空',
      '退格',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '.',
      '0',
      '确认'
    ])
    unmount()
  })

  it('NumericKeypad：数字键与确认键都会派发事件', async () => {
    const keys: string[] = []
    let submitted = 0
    const { container, unmount } = mountComponent(() =>
      h(NumericKeypad, {
        onKey: (value: string) => keys.push(value),
        onSubmit: () => {
          submitted += 1
        }
      })
    )
    await nextTick()

    clickByText(container, '5')
    clickByText(container, '确认')
    await nextTick()

    expect(keys).toEqual(['5'])
    expect(submitted).toBe(1)
    unmount()
  })

  it('NumericKeypad：清空 / 重开 / 退格 分别派发对应事件', async () => {
    const events: string[] = []
    const { container, unmount } = mountComponent(() =>
      h(NumericKeypad, {
        onBackspace: () => events.push('backspace'),
        onClear: () => events.push('clear'),
        onRestart: () => events.push('restart')
      })
    )
    await nextTick()

    clickByText(container, '退格')
    clickByText(container, '清空')
    clickByText(container, '重开')
    await nextTick()

    expect(events).toEqual(['backspace', 'clear', 'restart'])
    unmount()
  })

  it('useAnswerInput：数字 / 小数点 / 退格 / 清空 的逻辑', () => {
    expect(appendAnswerKey('', '1')).toBe('1')
    expect(appendAnswerKey('1', '8')).toBe('18')
    expect(appendAnswerKey('18', '.')).toBe('18.')
    expect(appendAnswerKey('18.', '5')).toBe('18.5')
    expect(appendAnswerKey('18.5', '.')).toBe('18.5') // 小数点只允许一个
    expect(appendAnswerKey('', '.')).toBe('0.') // 空输入按小数点自动补 0
    expect(appendAnswerKey('1234567', '8')).toBe('1234567') // 整数最多 7 位
    expect(appendAnswerKey('1.234', '5')).toBe('1.234') // 小数最多 3 位
    expect(backspaceAnswer('18.5')).toBe('18.')
    expect(backspaceAnswer('')).toBe('')
  })

  it('useAnswerInput：非法输入被清洗，全角数字自动转半角', () => {
    expect(sanitizeAnswerInput('１８３．７')).toBe('183.7')
    expect(sanitizeAnswerInput('12a3')).toBe('123')
    expect(sanitizeAnswerInput('1.2.3')).toBe('1.23')
    expect(sanitizeAnswerInput('12345678901')).toBe('1234567') // 超长整数截断
    expect(sanitizeAnswerInput('1.23456')).toBe('1.234') // 超长小数截断
    expect(sanitizeAnswerInput('.')).toBe('0.')
    expect(sanitizeAnswerInput('   ')).toBe('')
  })

  it('AnswerInput：填空线输入会被过滤并更新 v-model，Enter 提交', async () => {
    const value = ref('')
    let submitted = 0
    const { container, unmount } = mountComponent(() =>
      h(AnswerInput, {
        modelValue: value.value,
        'onUpdate:modelValue': (next: string) => {
          value.value = next
        },
        onSubmit: () => {
          submitted += 1
        }
      })
    )
    await nextTick()

    const input = container.querySelector('input')
    expect(input).not.toBeNull()

    input!.value = '18..5'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(value.value).toBe('18.5')

    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(submitted).toBe(1)
    unmount()
  })

  it('NumericKeypad：连续点击小数点不会产生两个小数点', async () => {
    const value = ref('')
    const { container, unmount } = mountComponent(() =>
      h(NumericKeypad, {
        onKey: (key: string) => {
          value.value = appendAnswerKey(value.value, key)
        }
      })
    )
    await nextTick()

    clickByText(container, '3')
    await nextTick()
    clickByText(container, '.')
    await nextTick()
    clickByText(container, '.')
    await nextTick()
    expect(value.value).toBe('3.')
    unmount()
  })
})
