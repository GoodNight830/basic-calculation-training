import { db } from './database'
import { toPlain } from '@/utils/plain'
import type { AiAnalysisSnapshot } from '@/types'

/** 按生成时间倒序返回某模块的全部 AI 报告快照（§9.4 历史对比） */
export async function listAiAnalyses(module: string): Promise<AiAnalysisSnapshot[]> {
  const rows = await db.aiAnalysisSnapshots.where('module').equals(module).toArray()
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function latestAiAnalysis(module: string): Promise<AiAnalysisSnapshot | null> {
  const rows = await listAiAnalyses(module)
  return rows[0] ?? null
}

export async function saveAiAnalysis(snapshot: AiAnalysisSnapshot): Promise<void> {
  await db.aiAnalysisSnapshots.put(toPlain(snapshot))
}

export async function clearAiAnalyses(): Promise<void> {
  await db.aiAnalysisSnapshots.clear()
}
