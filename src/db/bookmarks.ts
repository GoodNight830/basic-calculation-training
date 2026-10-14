/** 收藏仓库（§21.1）：按「被除数:除数」聚合，同一道题只收藏一次 */

import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { Bookmark } from '@/types'

export function bookmarkKeyOf(dividend: number, divisor: number): string {
  return `${dividend}:${divisor}`
}

export async function getBookmarkByKey(questionKey: string): Promise<Bookmark | null> {
  return (await db.bookmarks.where('questionKey').equals(questionKey).first()) ?? null
}

export async function listBookmarks(module?: string): Promise<Bookmark[]> {
  const all = module
    ? await db.bookmarks.where('module').equals(module).toArray()
    : await db.bookmarks.toArray()
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function putBookmark(bookmark: Bookmark): Promise<void> {
  await db.bookmarks.put(toPlain(bookmark))
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.bookmarks.delete(id)
}

export async function countBookmarks(): Promise<number> {
  return db.bookmarks.count()
}
