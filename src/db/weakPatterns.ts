/** 薄弱点数据访问（§21） */

import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { WeakPattern } from '@/types'

export async function listWeakPatterns(module?: string): Promise<WeakPattern[]> {
  const all = module
    ? await db.weakPatterns.where('module').equals(module).toArray()
    : await db.weakPatterns.toArray()
  return all.sort((a, b) => b.reinforcementWeight - a.reinforcementWeight || a.rangeMin - b.rangeMin)
}

/**
 * 用最新分析结果替换指定模块的薄弱点记录。
 * 历史题目原始数据不受影响（§2.2），只有分析结果被覆盖。
 */
export async function replaceWeakPatterns(patterns: readonly WeakPattern[], module?: string): Promise<void> {
  await db.transaction('rw', db.weakPatterns, async () => {
    if (module) {
      await db.weakPatterns.where('module').equals(module).delete()
    } else {
      await db.weakPatterns.clear()
    }
    if (patterns.length > 0) await db.weakPatterns.bulkPut(toPlain([...patterns]))
  })
}

export async function bulkPutWeakPatterns(patterns: readonly WeakPattern[]): Promise<void> {
  if (patterns.length === 0) return
  await db.weakPatterns.bulkPut(toPlain([...patterns]))
}

export async function clearWeakPatterns(module?: string): Promise<void> {
  if (module) {
    await db.weakPatterns.where('module').equals(module).delete()
    return
  }
  await db.weakPatterns.clear()
}
