import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { AiAnalysisSnapshot } from '@/types'

export async function latestAiAnalysis(module: string): Promise<AiAnalysisSnapshot | null> {
  const rows = await db.aiAnalysisSnapshots.where('module').equals(module).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

export async function saveAiAnalysis(snapshot: AiAnalysisSnapshot): Promise<void> {
  await db.aiAnalysisSnapshots.put(toPlain(snapshot))
}

export async function clearAiAnalyses(): Promise<void> {
  await db.aiAnalysisSnapshots.clear()
}
