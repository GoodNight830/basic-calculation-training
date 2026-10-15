/** 格式化工具（纯函数，不依赖浏览器 API） */

export type TimeRange = 'today' | '7d' | '30d' | 'all'

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: '今天',
  '7d': '近7天',
  '30d': '近30天',
  all: '全部'
}

const pad2 = (value: number): string => value.toString().padStart(2, '0')

/** 毫秒 → 秒（保留 1 位小数） */
export function formatSeconds(ms: number, decimals = 1): string {
  if (!Number.isFinite(ms)) return '—'
  return (ms / 1000).toFixed(decimals)
}

/** 毫秒 → "5.2s" */
export function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  return `${formatSeconds(ms)}s`
}

/** 毫秒 → "58.4秒" / "1分02秒"（紧凑，避免移动端换行） */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds - minutes * 60)
  const secText = seconds.toString().padStart(2, '0')
  return `${minutes}分${secText}秒`
}

/** ISO → "2026-09-23" */
export function formatDate(iso: string | null | undefined): string {
  const date = toDate(iso)
  if (!date) return '—'
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** ISO → "2026-09-23 18:07" */
export function formatDateTime(iso: string | null | undefined): string {
  const date = toDate(iso)
  if (!date) return '—'
  return `${formatDate(iso)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 本地日期键 YYYY-MM-DD */
export function localDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? toDate(value) : value
  if (!date) return '—'
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** 相对日期：今天 / 昨天 / YYYY-MM-DD */
export function relativeDayLabel(iso: string | null | undefined, now: Date = new Date()): string {
  const date = toDate(iso)
  if (!date) return '—'
  const key = localDateKey(date)
  if (key === localDateKey(now)) return '今天'
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === localDateKey(yesterday)) return '昨天'
  return key
}

/** 百分比格式化，例如 "92.0%" */
export function formatPercent(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(decimals)}%`
}

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 时间范围过滤起点；'all' 返回 null */
export function rangeStartDate(range: TimeRange, now: Date = new Date()): Date | null {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (range) {
    case 'today':
      return start
    case '7d':
      return new Date(start.getTime() - 6 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(start.getTime() - 29 * 24 * 60 * 60 * 1000)
    default:
      return null
  }
}

/** 判断时间是否落在范围内 */
export function isInRange(iso: string | null | undefined, range: TimeRange, now: Date = new Date()): boolean {
  if (range === 'all') return true
  const date = toDate(iso)
  const start = rangeStartDate(range, now)
  if (!date || !start) return false
  return date.getTime() >= start.getTime()
}
