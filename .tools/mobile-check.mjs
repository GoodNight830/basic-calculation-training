/**
 * 手机端布局自动检查（真实浏览器渲染，无需人眼看图）。
 *
 * 用法：
 *   1. 先启动开发服务器（npm run dev，默认 http://127.0.0.1:5173）
 *   2. node .tools/mobile-check.mjs [--base http://127.0.0.1:5173]
 *
 * 原理：
 *   - 启动一个本地 HTTP 服务接收测量结果；
 *   - 用 Edge/Chrome 无头模式，按各机型尺寸把应用放进同源 iframe 打开
 *     （.tools/mobile-check.html），页面内读取真实排版数值后回传；
 *   - 校验手机端关键不变量：题目/答案可见、键盘贴底不被切、训练页不滚动、
 *     无横向溢出、触控目标够大、点按键盘能真正输入。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
]

const baseIndex = process.argv.indexOf('--base')
const BASE = baseIndex !== -1 ? process.argv[baseIndex + 1] : 'http://127.0.0.1:5173'
const CASE_TIMEOUT_MS = 45_000

/** 机型：宽 × 可见高（已按手机浏览器底部工具栏扣除常见高度） */
const DEVICES = [
  { label: 'iPhone SE(1)  320x568', w: 320, h: 568 },
  { label: 'Android 小屏   360x600', w: 360, h: 600 },
  { label: 'iPhone SE(2)  375x623', w: 375, h: 623 },
  { label: 'iPhone 14     390x744', w: 390, h: 744 },
  { label: 'Pixel 7       412x815', w: 412, h: 815 },
  { label: '横屏          844x330', w: 844, h: 330 }
]

const MIN_TOUCH_TARGET = 40

function findBrowser() {
  for (const candidate of EDGE_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('未找到 Edge/Chrome，可执行文件不存在')
}

/** 启动接收测量结果的本地服务，返回 { url, waitForReport, close } */
function startReportServer() {
  let resolveReport = null
  const pending = new Promise((resolve) => {
    resolveReport = resolve
  })

  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }
    if (req.method === 'POST' && req.url?.startsWith('/report')) {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
        res.end()
        resolveReport(body)
      })
      return
    }
    res.writeHead(404)
    res.end()
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        url: `http://127.0.0.1:${port}/report`,
        waitForReport: () => pending,
        close: () => server.close()
      })
    })
  })
}

function runBrowser(browser, url, onStderr) {
  const profile = mkdtempSync(join(tmpdir(), 'mobile-check-'))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profile}`,
    '--window-size=1400,1200',
    url
  ]
  const child = spawn(browser, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  child.stderr.on('data', (chunk) => onStderr?.(String(chunk)))
  return child
}

function check(device, report) {
  const failures = []
  const notes = []
  const vh = report.viewport?.visualHeight ?? device.h
  const r = report.rects ?? {}

  if (report.errors.length > 0) failures.push(`页面内报错：${report.errors.join('; ')}`)

  for (const key of ['question', 'answer', 'keypad', 'keypadZone', 'head']) {
    if (!r[key]) failures.push(`缺少元素：${key}`)
  }
  if (failures.length > 0) return { failures, notes }

  // 1. 题目与答案完整可见
  if (r.question.top < -0.5) failures.push(`题目被裁掉顶部（top=${r.question.top}）`)
  if (r.question.bottom > vh + 0.5) {
    failures.push(`题目超出可见区（bottom=${r.question.bottom} > ${vh}）`)
  }
  if (r.answer.bottom > vh + 0.5) failures.push(`答案行超出可见区（bottom=${r.answer.bottom}）`)

  // 2. 键盘贴底且完整可见
  if (r.keypad.bottom > vh + 0.5) {
    failures.push(`键盘被切掉（bottom=${r.keypad.bottom} > 可见高 ${vh}）`)
  }
  if (r.keypadZone.top < r.head.bottom - 1) failures.push('键盘区与顶部信息区重叠')
  const bottomGap = +(vh - r.keypad.bottom).toFixed(1)
  if (bottomGap > 40) notes.push(`键盘距底部还有 ${bottomGap}px`)

  // 3. 训练页不产生滚动（否则下滑时题目会消失）
  if (report.appMain && report.appMain.scrollHeight > report.appMain.clientHeight + 2) {
    failures.push(
      `训练页出现滚动（scrollHeight=${report.appMain.scrollHeight} > clientHeight=${report.appMain.clientHeight}）`
    )
  }

  // 4. 无横向溢出
  if (report.viewport.scrollWidth > report.viewport.clientWidth + 1) {
    failures.push(
      `横向溢出（scrollWidth=${report.viewport.scrollWidth} > clientWidth=${report.viewport.clientWidth}）`
    )
  }

  // 5. 键位齐全 + 触控目标够大
  if (report.keys.length !== 15) failures.push(`键位数量异常：${report.keys.length}`)
  const small = report.keys.filter(
    (key) => key.width < MIN_TOUCH_TARGET || key.height < MIN_TOUCH_TARGET
  )
  if (small.length > 0) {
    failures.push(
      `触控目标过小：${small.map((k) => `${k.label}(${k.width}x${k.height})`).join(', ')}`
    )
  }

  // 6. 点按键盘能真正输入
  if (report.answerAfterTap !== '1') {
    failures.push(`点按数字键后答案未生效（得到 ${JSON.stringify(report.answerAfterTap)}）`)
  }

  // 7. 可见高度变量已生效（用于避开浏览器工具栏）
  if (!report.viewport.cssVar) failures.push('--app-viewport-height 未写入')

  // 8. 答错反馈出现时：反馈详情无需滚动即可看完，底部是「继续」大按钮
  const wrong = report.afterWrong
  if (!wrong) {
    failures.push('未取到答错反馈状态')
  } else {
    if (!wrong.feedbackShown) failures.push('答错后没有出现反馈面板')
    if (wrong.continueButton && wrong.continueButton.bottom > vh + 0.5) {
      failures.push(`「继续」按钮被切掉（bottom=${wrong.continueButton.bottom} > ${vh}）`)
    }
    if (wrong.continueButton && wrong.continueButton.height < 44) {
      failures.push(`「继续」按钮过小（高=${wrong.continueButton.height}）`)
    }
    if (wrong.feedback && wrong.feedback.bottom > vh + 0.5) {
      failures.push(`反馈详情超出可见区（bottom=${wrong.feedback.bottom} > ${vh}）`)
    }
    if (wrong.extras && wrong.extras.scrollHeight > wrong.extras.clientHeight + 2) {
      failures.push(
        `反馈详情需要滚动才能看完（内容 ${wrong.extras.scrollHeight} > 可视 ${wrong.extras.clientHeight}）`
      )
    }
    if (wrong.question && wrong.question.top < -0.5) {
      failures.push('答错反馈时题目被推出屏幕')
    }
    if (wrong.extras && wrong.extras.height <= 1) {
      failures.push('答错反馈区高度为 0，反馈看不到')
    }
    if (wrong.keypad) {
      failures.push('答错反馈时数字键盘仍然存在（应与「继续」按钮切换）')
    }
  }

  // 9. 继续之后回到输入状态，题目与键盘仍在
  const afterContinue = report.afterContinue
  if (!afterContinue) {
    failures.push('未取到「继续」之后的状态')
  } else {
    if (afterContinue.feedbackShown) failures.push('点「继续」后反馈未消失')
    if (!afterContinue.keypad) {
      failures.push('「继续」之后数字键盘没有恢复')
    } else if (afterContinue.keypad.bottom > vh + 0.5) {
      failures.push('「继续」之后键盘被切掉')
    }
  }

  // 10. 全站页面巡检：横向溢出 + 触控目标
  const pages = report.pages ?? []
  const expectedPages = ['home', 'setup', 'wrong', 'history', 'weak', 'settings']
  for (const name of expectedPages) {
    if (!pages.some((page) => page.name === name)) failures.push(`未巡检到页面：${name}`)
  }
  for (const page of pages) {
    if (page.scrollWidth > page.clientWidth + 1) {
      failures.push(
        `${page.name} 页面横向溢出（${page.scrollWidth} > ${page.clientWidth}）` +
          (page.overflowing.length > 0 ? `：${page.overflowing.join(', ')}` : '')
      )
    }
    const smallTargets = (page.targets ?? []).filter(
      (target) => target.height < MIN_TOUCH_TARGET || target.width < MIN_TOUCH_TARGET
    )
    if (smallTargets.length > 0) {
      failures.push(
        `${page.name} 触控目标过小：${smallTargets
          .slice(0, 4)
          .map((t) => `${t.label}(${Math.round(t.width)}x${Math.round(t.height)})`)
          .join(', ')}`
      )
    }
  }

  notes.push(
    `题目 ${r.question.top}~${r.question.bottom} · 键盘 ${r.keypad.top}~${r.keypad.bottom} · 可见高 ${vh}`
  )
  notes.push(
    `单键 ${report.keys[0]?.width}x${report.keys[0]?.height} · 顶部区高 ${r.head.height} · 弹性区高 ${r.extras?.height ?? '—'}`
  )
  if (wrong?.feedback) {
    notes.push(
      `答错反馈 ${wrong.feedback.top}~${wrong.feedback.bottom} · 键盘 top=${wrong.keypad?.top ?? '—'} · 继续键 bottom=${wrong.continueButton?.bottom ?? '—'}`
    )
  }
  if (pages.length > 0) {
    notes.push(
      `巡检页面：${pages.map((p) => `${p.name}(${p.targets.length}控件)`).join(' ')}`
    )
  }
  return { failures, notes }
}

const browser = findBrowser()
console.log(`浏览器：${browser}`)
console.log(`应用地址：${BASE}\n`)

let failed = 0
for (const device of DEVICES) {
  const server = await startReportServer()
  let stderr = ''
  const url =
    `${BASE}/.tools/mobile-check.html?w=${device.w}&h=${device.h}` +
    `&label=${encodeURIComponent(device.label)}&report=${encodeURIComponent(server.url)}`
  const child = runBrowser(browser, url, (text) => {
    stderr += text
  })

  let raw
  try {
    raw = await Promise.race([
      server.waitForReport(),
      new Promise((resolve) => setTimeout(() => resolve(null), CASE_TIMEOUT_MS))
    ])
  } finally {
    child.kill()
    server.close()
  }

  if (!raw) {
    console.log(`✗ ${device.label}\n    未在 ${CASE_TIMEOUT_MS / 1000}s 内收到测量结果`)
    const tail = stderr.trim().split('\n').slice(-3).join(' | ')
    if (tail) console.log(`    stderr: ${tail}`)
    failed += 1
    continue
  }

  let report
  try {
    report = JSON.parse(raw)
  } catch {
    console.log(`✗ ${device.label}\n    测量结果不是合法 JSON`)
    failed += 1
    continue
  }

  const { failures, notes } = check(device, report)
  if (failures.length === 0) {
    console.log(`✓ ${device.label}`)
  } else {
    console.log(`✗ ${device.label}`)
    for (const failure of failures) console.log(`    ! ${failure}`)
    failed += 1
  }
  for (const note of notes) console.log(`    · ${note}`)
}

console.log(`\n${DEVICES.length - failed}/${DEVICES.length} 个机型通过`)
process.exit(failed === 0 ? 0 : 1)
