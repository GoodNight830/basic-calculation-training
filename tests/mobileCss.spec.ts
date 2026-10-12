/**
 * 移动端样式不变量测试。
 *
 * 这些规则都是真实踩过的坑（浏览器工具栏遮挡、训练页滚动导致题目消失、
 * 点按不准、下拉刷新打断训练），用静态断言把它们锁住，
 * 这样即使没有真机、没跑浏览器巡检也能在 npm test 里发现回归。
 *
 * 真实浏览器排版检查见 `npm run test:mobile`（.tools/mobile-check.mjs）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vitest 的工作目录即项目根目录
const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')

/** 取出某个选择器的规则块内容（不含媒体查询内的同名规则） */
function blockOf(selector: string): string {
  const index = css.indexOf(`\n${selector} {`)
  if (index === -1) throw new Error(`未找到样式块：${selector}`)
  const start = css.indexOf('{', index)
  const end = css.indexOf('}', start)
  return css.slice(start + 1, end)
}

/** 取出某个媒体查询块内容 */
function mediaBlock(query: string): string {
  const index = css.indexOf(`@media ${query} {`)
  if (index === -1) throw new Error(`未找到媒体查询：${query}`)
  let depth = 0
  const start = css.indexOf('{', index)
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start + 1, i)
    }
  }
  throw new Error(`媒体查询未闭合：${query}`)
}

describe('移动端视口与滚动', () => {
  it('应用外壳使用动态视口高度，并支持 JS 写入的可见高度变量', () => {
    const shell = blockOf('.app-shell')
    expect(shell).toContain('100dvh')
    expect(shell).toContain('var(--app-viewport-height')
    expect(shell).toContain('overflow: hidden')
  })

  it('训练页不产生整页滚动（否则下滑时题目会消失）', () => {
    const screen = blockOf('.training-screen')
    expect(screen).toContain('overflow: hidden')
    expect(screen).toContain('height: 100%')
    // 中间信息区才是唯一可滚动的区域
    expect(blockOf('.training-extras')).toContain('overflow-y: auto')
  })

  it('内容区阻止滚动穿透（避免训练中触发浏览器下拉刷新）', () => {
    expect(blockOf('.app-main')).toContain('overscroll-behavior: contain')
  })

  it('底部安全区（刘海屏横条）用于键盘区与导航', () => {
    expect(css).toContain('env(safe-area-inset-bottom')
    expect(blockOf('.training-panel')).toContain('env(safe-area-inset-bottom')
    expect(blockOf('.nav')).toContain('env(safe-area-inset-bottom')
  })
})

describe('移动端触控体验', () => {
  it('数字键盘按键具备足够的触控目标与防误触设置', () => {
    const key = blockOf('.keypad-key')
    expect(key).toContain('touch-action: manipulation')
    expect(key).toContain('user-select: none')
    const minHeight = Number(key.match(/min-height:\s*(\d+)px/)?.[1] ?? 0)
    expect(minHeight).toBeGreaterThanOrEqual(44)
  })

  it('按钮与选项卡在移动端放大到 ≥40px，避免点不准', () => {
    const mobile = mediaBlock('(max-width: 899px)')
    expect(mobile).toContain('.btn-sm')
    expect(mobile).toMatch(/min-height:\s*40px/)
    expect(mobile).toMatch(/\.chip[\s\S]*min-height:\s*42px/)
    expect(mobile).toMatch(/\.tab[\s\S]*min-height:\s*42px/)
  })

  it('全局去掉点击高亮块，长按不会弹出系统菜单', () => {
    expect(css).toContain('-webkit-tap-highlight-color: transparent')
  })
})

describe('矮屏 / 横屏自适应', () => {
  it('横屏（≤560px 高）键盘改为 5 列 3 行，保证题目与键盘同屏', () => {
    const short = mediaBlock('(max-height: 560px)')
    expect(short).toContain('repeat(5, minmax(0, 1fr))')
    expect(short).toMatch(/\.keypad-key[\s\S]*min-height:\s*44px/)
    // 反馈面板加宽，避免详情换行后需要滚动
    expect(short).toMatch(/\.feedback-panel[\s\S]*min-width|\.feedback-panel[\s\S]*width:/)
  })

  it('矮屏隐藏次要信息，保留题目/答案/键盘', () => {
    const compact = mediaBlock('(max-height: 680px)')
    expect(compact).toContain('.training-legend')
    expect(compact).toContain('display: none')
  })
})
