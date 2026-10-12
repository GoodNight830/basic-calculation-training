/**
 * 移动端视口高度跟踪测试。
 *
 * 背景（真实问题回归）：手机浏览器的地址栏/底部工具栏会遮住页面底部，
 * 训练页键盘首次打开时被挡住。这里验证：
 * - 优先使用 visualViewport.height（真正的可见高度）
 * - 没有 visualViewport 时回退到 window.innerHeight
 * - 结果写入 CSS 变量 --app-viewport-height，并在视口变化时更新
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyViewportHeight,
  installViewportHeightTracking,
  readViewportHeight
} from '@/utils/viewport'

const CSS_VAR = '--app-viewport-height'

function setVisualViewport(height: number | null): void {
  if (height === null) {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    return
  }
  Object.defineProperty(window, 'visualViewport', {
    value: {
      height,
      width: 390,
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    configurable: true
  })
}

function setInnerHeight(height: number): void {
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

afterEach(() => {
  document.documentElement.style.removeProperty(CSS_VAR)
  setVisualViewport(null)
})

describe('视口高度跟踪（移动端键盘被浏览器工具栏遮挡的问题）', () => {
  it('优先使用 visualViewport.height（可见区域，不含浏览器工具栏）', () => {
    setInnerHeight(900)
    setVisualViewport(812)
    expect(readViewportHeight()).toBe(812)

    const applied = applyViewportHeight()
    expect(applied).toBe(812)
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('812px')
  })

  it('没有 visualViewport 时回退到 window.innerHeight', () => {
    setVisualViewport(null)
    setInnerHeight(844)
    expect(readViewportHeight()).toBe(844)
    applyViewportHeight()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('844px')
  })

  it('地址栏收起时高度变大，CSS 变量随之更新', () => {
    setVisualViewport(700)
    applyViewportHeight()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('700px')

    setVisualViewport(760)
    applyViewportHeight()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('760px')
  })

  it('返回的取消函数不会抛错（可反复安装/卸载）', () => {
    const uninstall = installViewportHeightTracking()
    expect(typeof uninstall).toBe('function')
    expect(() => uninstall()).not.toThrow()
  })
})
