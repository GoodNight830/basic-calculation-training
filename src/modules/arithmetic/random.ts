/**
 * 随机数工具。
 *
 * 提供可注入的随机源（mulberry32），既能保证正常运行时的随机性，
 * 也能让单元测试完全可复现（§7.1：支持随机种子或保存完整题目数据）。
 */

export type Rng = () => number

/** 生成 [0, 1) 的随机数 */
export function defaultRng(): Rng {
  return Math.random
}

/** 可复现的伪随机数生成器 */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 闭区间随机整数 [min, max] */
export function randomInt(min: number, max: number, rng: Rng): number {
  if (max < min) return min
  return min + Math.floor(rng() * (max - min + 1))
}

/** 按权重挑选一项，权重全为 0 时返回第一项 */
export function pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng): T | null {
  if (items.length === 0) return null
  const total = items.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0)
  if (total <= 0) return items[0]
  let ticket = rng() * total
  for (const item of items) {
    ticket -= Math.max(0, weightOf(item))
    if (ticket <= 0) return item
  }
  return items[items.length - 1]
}
