/**
 * 结算评分（§10 / §35）。
 *
 * 这是本项目最重要的规则之一：
 * 评分只根据「是否全对 + 总用时」，正确率不参与等级计算。
 *
 * correctCount !== totalCount → encourage
 * totalElapsedMs <= 60s       → excellent
 * totalElapsedMs <= 75s       → good
 * totalElapsedMs <= 90s       → pass
 * 否则                        → encourage
 */

import { GRADE_THRESHOLDS_MS } from '@/config/trainingConfig'
import type { Grade } from '@/types'

/** 独立评分函数（§35 签名要求） */
export function gradeSession(
  totalElapsedMs: number,
  correctCount: number,
  totalCount: number
): Grade {
  if (totalCount <= 0) return 'encourage'
  if (correctCount !== totalCount) return 'encourage'
  if (totalElapsedMs <= GRADE_THRESHOLDS_MS.excellent) return 'excellent'
  if (totalElapsedMs <= GRADE_THRESHOLDS_MS.good) return 'good'
  if (totalElapsedMs <= GRADE_THRESHOLDS_MS.pass) return 'pass'
  return 'encourage'
}

/** 等级中文名 */
export const GRADE_LABELS: Record<Grade, string> = {
  excellent: '优秀',
  good: '良好',
  pass: '合格',
  encourage: '加油'
}

export function gradeLabel(grade: Grade): string {
  return GRADE_LABELS[grade] ?? '加油'
}

/** 等级说明，用于结算页展示规则来源 */
export function gradeDescription(grade: Grade): string {
  switch (grade) {
    case 'excellent':
      return '全部正确且总用时不超过 60 秒'
    case 'good':
      return '全部正确且总用时不超过 75 秒'
    case 'pass':
      return '全部正确且总用时不超过 90 秒'
    default:
      return '存在错误题，或总用时超过 90 秒'
  }
}

/** 是否达到“优秀”标准（趋势统计等场景使用） */
export function isExcellentGrade(grade: Grade): boolean {
  return grade === 'excellent'
}
