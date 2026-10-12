/**
 * 计时工具（§8.2）。
 *
 * 需求：必须使用高精度单调计时机制（performance.now()），
 * 不能单纯依赖系统时间差，因为系统时间可能被修改。
 * 这里统一封装，便于单元测试注入。
 */

type NowFn = () => number

let monotonicNow: NowFn = () => {
  const perf = globalThis.performance
  if (perf && typeof perf.now === 'function') return perf.now()
  return Date.now()
}

/** 获取单调时钟当前值（毫秒） */
export function now(): number {
  return monotonicNow()
}

/** 计算两个单调时钟值之间经过的毫秒数（不会为负） */
export function elapsedSince(startMonotonic: number): number {
  return Math.max(0, Math.round(now() - startMonotonic))
}

/** 测试用：注入自定义时钟 */
export function __setNowFnForTest(fn: NowFn | null): void {
  if (fn) {
    monotonicNow = fn
  } else {
    monotonicNow = () => {
      const perf = globalThis.performance
      if (perf && typeof perf.now === 'function') return perf.now()
      return Date.now()
    }
  }
}
