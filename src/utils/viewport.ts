/**
 * 移动端视口高度跟踪。
 *
 * 背景：手机浏览器的地址栏 / 底部工具栏（含返回按钮的那一条）会占用屏幕高度，
 * 而 CSS 的 `100vh` 是「包含这些浏览器 UI 的高度」，因此固定高度的页面
 * （如训练页的键盘）首次打开时会被浏览器工具栏挡住。
 *
 * 解决：
 * 1. 优先使用 `window.visualViewport.height` —— 它表示**真正可见**的区域高度，
 *    浏览器工具栏显示/隐藏、页面缩放时都会变化；
 * 2. 把结果写入 CSS 变量 `--app-viewport-height`，样式里用它给训练页定高；
 * 3. 不支持 visualViewport 的旧浏览器回退到 `window.innerHeight`，
 *    样式里还有 `100dvh` 作为二次回退。
 */

const CSS_VAR = '--app-viewport-height'

/** 读取当前可见视口高度（px） */
export function readViewportHeight(): number {
  if (typeof window === 'undefined') return 0
  const visual = window.visualViewport
  if (visual && Number.isFinite(visual.height) && visual.height > 0) {
    return Math.round(visual.height)
  }
  return Number.isFinite(window.innerHeight) ? Math.round(window.innerHeight) : 0
}

/** 把当前可见高度写入 CSS 变量，返回写入的数值（0 表示未写入） */
export function applyViewportHeight(): number {
  if (typeof document === 'undefined') return 0
  const height = readViewportHeight()
  if (height > 0) {
    document.documentElement.style.setProperty(CSS_VAR, `${height}px`)
  }
  return height
}

/** 开始监听视口变化；返回取消监听的函数 */
export function installViewportHeightTracking(): () => void {
  if (typeof window === 'undefined') return () => {}

  let frame = 0
  const schedule = (): void => {
    if (typeof requestAnimationFrame === 'function') {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        applyViewportHeight()
      })
    } else {
      applyViewportHeight()
    }
  }

  applyViewportHeight()

  const visual = window.visualViewport
  window.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)
  visual?.addEventListener('resize', schedule)
  visual?.addEventListener('scroll', schedule)

  return () => {
    if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    visual?.removeEventListener('resize', schedule)
    visual?.removeEventListener('scroll', schedule)
  }
}
