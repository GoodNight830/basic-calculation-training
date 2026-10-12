/**
 * 数据持久化与训练流程集成测试（§35.3 / §35.4 / §9 / §12 / §13 / §30 / §31）
 *
 * 使用 fake-indexeddb 模拟浏览器 IndexedDB，覆盖：
 * - 创建训练 → 数据落库 → 重新读取（等价于刷新/重新打开应用）
 * - 错题自动入库、再次做对不删除历史、标记已掌握
 * - 放弃训练不计入正式统计
 * - 薄弱点分析结果落库
 * - JSON 导出 → 清空 → 导入恢复；非法数据被拒绝
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import * as settingsRepo from '@/db/settings'
import * as wrongQuestionsRepo from '@/db/wrongQuestions'
import * as activeSessionsRepo from '@/db/activeSessions'
import { listQuestionsBySession } from '@/db/questions'
import {
  abandonSession,
  beginSession,
  currentQuestion,
  finishSession,
  loadSessionAnalysisData,
  recomputeWeakPatterns,
  submitAnswer,
  clearAllData
} from '@/services/training'
import {
  buildFullJsonExport,
  checkImportPayload,
  importFromJsonText
} from '@/services/export'
import { DEFAULT_WEAK_PATTERN_CONFIG, SCHEMA_VERSION } from '@/config/trainingConfig'
import { newId } from '@/utils/id'
import { makeQuestion, makeQuestionRecord, makeSession } from './fixtures'

const MODULE = 'five-divide-three'
const ELAPSED = 1500

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.sessions.clear(),
    db.questions.clear(),
    db.wrongQuestions.clear(),
    db.weakPatterns.clear(),
    db.settings.clear(),
    db.activeSessions.clear()
  ])
}

/** 用给定题目精确开始一次训练（可控制题目内容） */
async function beginWithQuestions(
  presetQuestions: ReturnType<typeof makeQuestion>[],
  mode: 'training' | 'speed' = 'training',
  allowedErrorRate = 3
): Promise<Awaited<ReturnType<typeof beginSession>>> {
  return beginSession({
    module: MODULE,
    mode,
    questionCount: mode === 'speed' ? presetQuestions.length : 0,
    allowedErrorRate,
    presetQuestions
  })
}

/** 用正确/错误答案作答当前题目 */
async function answerCurrent(
  active: Awaited<ReturnType<typeof beginSession>>,
  correct: boolean
): Promise<Awaited<ReturnType<typeof submitAnswer>>> {
  const question = currentQuestion(active)
  if (!question) throw new Error('没有当前题目')
  const raw = correct ? question.correctAnswer.toFixed(2) : '1'
  return submitAnswer(active, raw, ELAPSED, new Date().toISOString())
}

beforeEach(async () => {
  await clearDatabase()
})

describe('训练数据持久化（§35.3）', () => {
  it('创建的题目记录、正确答案与用时全部落库，重新读取仍在', async () => {
    const questions = [makeQuestion(58231, 317), makeQuestion(53126, 876), makeQuestion(74582, 425)]
    let active = await beginWithQuestions(questions, 'speed')

    for (const _question of questions) {
      const result = await answerCurrent(active, true)
      active = result.active
    }

    const session = await finishSession(active)

    // 活动训练已清理
    expect(await activeSessionsRepo.getActiveSession(MODULE)).toBeNull()

    // 等价于“刷新页面 / 关闭后重新打开”：重新从数据库读取
    const analysis = await loadSessionAnalysisData(MODULE)
    expect(analysis.sessions).toHaveLength(1)
    expect(analysis.records).toHaveLength(3)

    const stored = analysis.sessions[0]
    expect(stored.id).toBe(session.id)
    expect(stored.status).toBe('finished')
    expect(stored.answeredCount).toBe(3)
    expect(stored.correctCount).toBe(3)
    expect(stored.totalElapsedMs).toBe(ELAPSED * 3)
    expect(stored.grade).toBe('excellent')
    expect(stored.allowedErrorRate).toBe(3)

    const records = await listQuestionsBySession(session.id)
    expect(records).toHaveLength(3)
    for (const record of records) {
      const source = questions.find((q) => q.dividend === record.dividend && q.divisor === record.divisor)
      expect(source).toBeDefined()
      // §20：correctAnswer 必须落库
      expect(record.correctAnswer).toBeCloseTo(source!.correctAnswer, 12)
      expect(record.userAnswer).toBeCloseTo(source!.correctAnswer, 2)
      expect(record.correct).toBe(true)
      expect(record.elapsedMs).toBe(ELAPSED)
      expect(record.question).toBe(source!.text)
      expect(record.mode).toBe('speed')
      expect(record.startedAt).toBeTruthy()
      expect(record.submittedAt).toBeTruthy()
    }
  })

  it('错误答案被记录且误差计算正确', async () => {
    const question = makeQuestion(58231, 317, { correctAnswer: 58231 / 317 })
    const active = await beginWithQuestions([question])
    const result = await answerCurrent(active, false)

    expect(result.check.correct).toBe(false)
    expect(result.record.correct).toBe(false)
    expect(result.record.userAnswer).toBe(1)
    expect(result.record.errorRate).toBeGreaterThan(90)

    const [stored] = await listQuestionsBySession(active.sessionId)
    expect(stored.correct).toBe(false)
    expect(stored.errorRate).toBeCloseTo(result.record.errorRate!, 6)
  })

  it('训练模式为无限题目：提交后自动准备下一题', async () => {
    const active = await beginWithQuestions([makeQuestion(58231, 317)])
    const first = await answerCurrent(active, true)
    expect(first.active.questionList.length).toBeGreaterThanOrEqual(2)
    expect(first.isComplete).toBe(false)
    const next = currentQuestion(first.active)
    expect(next).not.toBeNull()
    expect(next!.id).not.toBe(active.questionList[0].id)
  })

  it('竞速模式全部完成后可结算，且题数固定', async () => {
    const questions = [makeQuestion(58231, 317), makeQuestion(53126, 876)]
    let active = await beginWithQuestions(questions, 'speed')
    expect(active.questionList).toHaveLength(2)

    const first = await answerCurrent(active, true)
    active = first.active
    expect(first.isComplete).toBe(false)

    const second = await answerCurrent(active, false)
    expect(second.isComplete).toBe(true)

    const session = await finishSession(second.active)
    expect(session.answeredCount).toBe(2)
    expect(session.correctCount).toBe(1)
    // 存在错误题 → 加油（§10.1）
    expect(session.grade).toBe('encourage')
  })
})

describe('错题系统（§12 / §35.4）', () => {
  it('错误 → 自动进入错题库', async () => {
    const question = makeQuestion(53126, 876)
    const active = await beginWithQuestions([question])
    const result = await answerCurrent(active, false)

    const stored = await wrongQuestionsRepo.getWrongQuestionByKey('53126:876')
    expect(stored).not.toBeNull()
    expect(stored!.wrongCount).toBe(1)
    expect(stored!.correctCount).toBe(0)
    expect(stored!.status).toBe('active')
    expect(stored!.dividend).toBe(53126)
    expect(stored!.divisor).toBe(876)
    expect(stored!.correctAnswer).toBeCloseTo(53126 / 876, 12)
    expect(stored!.trainingSessionId).toBe(result.record.sessionId)
  })

  it('再次做对 → 不删除历史错误数据', async () => {
    const question = makeQuestion(53126, 876)

    const firstActive = await beginWithQuestions([makeQuestion(53126, 876)])
    await answerCurrent(firstActive, false)
    const beforeCorrect = await wrongQuestionsRepo.getWrongQuestionByKey('53126:876')
    expect(beforeCorrect!.wrongCount).toBe(1)

    // 新建一次训练，同一道题做对
    const secondActive = await beginWithQuestions([makeQuestion(53126, 876)])
    await answerCurrent(secondActive, true)

    const afterCorrect = await wrongQuestionsRepo.getWrongQuestionByKey('53126:876')
    expect(afterCorrect).not.toBeNull()
    expect(afterCorrect!.wrongCount).toBe(1) // 错误次数不因做对而减少
    expect(afterCorrect!.correctCount).toBe(1)
    expect(afterCorrect!.lastCorrectAt).toBeTruthy()
    expect(afterCorrect!.question).toBe(question.text)
    // 原始题目记录仍然完整保留
    expect(await listQuestionsBySession(firstActive.sessionId)).toHaveLength(1)
  })

  it('标记已掌握 → 从强化池移除但数据保留', async () => {
    const active = await beginWithQuestions([makeQuestion(74582, 425)])
    await answerCurrent(active, false)
    const stored = await wrongQuestionsRepo.getWrongQuestionByKey('74582:425')
    expect(stored).not.toBeNull()

    const mastered = await wrongQuestionsRepo.markWrongQuestionMastered(stored!.id, true)
    expect(mastered!.status).toBe('mastered')
    expect(mastered!.masteredAt).toBeTruthy()

    const active_ = await wrongQuestionsRepo.listWrongQuestions({ status: 'active' })
    const masteredList = await wrongQuestionsRepo.listWrongQuestions({ status: 'mastered' })
    expect(active_).toHaveLength(0)
    expect(masteredList).toHaveLength(1)
    expect(masteredList[0].wrongCount).toBe(1)
  })

  it('错题重新训练会产生新的训练数据，不修改旧记录', async () => {
    const question = makeQuestion(53126, 876)
    const firstActive = await beginWithQuestions([question])
    const firstResult = await answerCurrent(firstActive, false)
    await finishSession(firstResult.active)

    // 错题重练（§13）
    const retryActive = await beginSession({
      module: MODULE,
      mode: 'training',
      questionCount: 0,
      allowedErrorRate: 3,
      source: 'wrongQuestions',
      presetQuestions: [makeQuestion(53126, 876)]
    })
    const retryResult = await answerCurrent(retryActive, true)
    await finishSession(retryResult.active)

    expect(retryResult.record.id).not.toBe(firstResult.record.id)
    const all = await db.questions.toArray()
    expect(all).toHaveLength(2)
    const [oldRecord] = await listQuestionsBySession(firstResult.record.sessionId)
    expect(oldRecord.correct).toBe(false) // 旧记录未被修改
  })
})

describe('放弃训练（§9）', () => {
  it('放弃后删除活动训练，且不计入正式统计', async () => {
    const questions = [makeQuestion(58231, 317), makeQuestion(53126, 876)]
    const active = await beginWithQuestions(questions, 'speed')
    const submitted = await answerCurrent(active, false)
    await abandonSession(submitted.active)

    expect(await activeSessionsRepo.getActiveSession(MODULE)).toBeNull()
    const analysis = await loadSessionAnalysisData(MODULE)
    expect(analysis.sessions).toHaveLength(0)
    expect(analysis.records).toHaveLength(0)
  })
})

describe('薄弱点分析落库（§14 / §16）', () => {
  it('基于正式训练数据发现薄弱范围并保存', async () => {
    const sessionId = newId()
    await db.sessions.put(
      makeSession({ id: sessionId, status: 'finished', answeredCount: 91, correctCount: 86 })
    )
    const records = [
      ...Array.from({ length: 60 }, (_, index) =>
        makeQuestionRecord({
          sessionId,
          divisor: 300 + (index % 100),
          correct: index < 58
        })
      ),
      ...Array.from({ length: 31 }, (_, index) =>
        makeQuestionRecord({
          sessionId,
          divisor: 800 + (index % 100),
          correct: index < 28
        })
      )
    ]
    await db.questions.bulkPut(records)

    const patterns = await recomputeWeakPatterns(MODULE, DEFAULT_WEAK_PATTERN_CONFIG)
    expect(patterns).toHaveLength(1)
    expect(patterns[0].rangeMin).toBe(800)
    expect(patterns[0].rangeMax).toBe(899)
    expect(patterns[0].status).toBe('active')
    expect(patterns[0].reinforcementWeight).toBeGreaterThan(0)

    const persisted = await db.weakPatterns.toArray()
    expect(persisted).toHaveLength(1)
    expect(persisted[0].id).toBe(patterns[0].id)
  })

  it('样本不足时不产生薄弱点记录', async () => {
    const sessionId = newId()
    await db.sessions.put(makeSession({ id: sessionId, status: 'finished' }))
    await db.questions.bulkPut([
      makeQuestionRecord({ sessionId, divisor: 876, correct: false }),
      makeQuestionRecord({ sessionId, divisor: 877, correct: false })
    ])
    const patterns = await recomputeWeakPatterns(MODULE, DEFAULT_WEAK_PATTERN_CONFIG)
    expect(patterns).toHaveLength(0)
  })
})

describe('设置持久化（§7 / §32）', () => {
  it('保存后重新读取仍然生效，并且非法数值被钳制', async () => {
    await settingsRepo.saveSettings({
      defaultMode: 'speed',
      defaultQuestionCount: 999,
      defaultAllowedErrorRate: 50,
      weakPattern: { ...DEFAULT_WEAK_PATTERN_CONFIG }
    })
    const loaded = await settingsRepo.getSettings()
    expect(loaded.defaultMode).toBe('speed')
    expect(loaded.defaultQuestionCount).toBe(100)
    expect(loaded.defaultAllowedErrorRate).toBe(20)
  })

  it('默认模式非法时回退为训练模式，缺失时使用默认值', async () => {
    await settingsRepo.saveSettings({
      defaultMode: 'not-a-mode' as never,
      defaultQuestionCount: 10,
      defaultAllowedErrorRate: 3,
      weakPattern: { ...DEFAULT_WEAK_PATTERN_CONFIG }
    })
    const loaded = await settingsRepo.getSettings()
    expect(loaded.defaultMode).toBe('training')
    expect(loaded.defaultQuestionCount).toBe(10)
  })
})

describe('导出 / 导入（§30 / §31 / §32）', () => {
  it('导出 → 清空 → 导入可恢复全部数据', async () => {
    const questions = [makeQuestion(58231, 317), makeQuestion(53126, 876)]
    let active = await beginWithQuestions(questions, 'speed')
    for (const _ of questions) {
      const result = await answerCurrent(active, true)
      active = result.active
    }
    await finishSession(active)
    await settingsRepo.saveSettings({
      defaultMode: 'speed',
      defaultQuestionCount: 20,
      defaultAllowedErrorRate: 2,
      weakPattern: { ...DEFAULT_WEAK_PATTERN_CONFIG }
    })

    const file = await buildFullJsonExport()
    expect(file.filename).toMatch(/\.json$/)
    const parsed = JSON.parse(file.content)
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION)
    expect(parsed.exportedAt).toBeTruthy()
    expect(parsed.data.sessions).toHaveLength(1)
    expect(parsed.data.questions).toHaveLength(2)

    await clearAllData()
    expect(await db.questions.count()).toBe(0)

    const result = await importFromJsonText(file.content)
    expect(result.imported.sessions).toBe(1)
    expect(result.imported.questions).toBe(2)
    expect(result.imported.settings).toBe(1)

    const analysis = await loadSessionAnalysisData(MODULE)
    expect(analysis.sessions).toHaveLength(1)
    expect(analysis.records).toHaveLength(2)
    const settings = await settingsRepo.getSettings()
    expect(settings.defaultQuestionCount).toBe(20)
    expect(settings.defaultAllowedErrorRate).toBe(2)
  })

  it('重复导入默认跳过已存在数据', async () => {
    const active = await beginWithQuestions([makeQuestion(58231, 317)])
    const result = await answerCurrent(active, true)
    await finishSession(result.active)

    const file = await buildFullJsonExport()
    const imported = await importFromJsonText(file.content, 'skip')
    expect(imported.imported.questions).toBe(0)
    expect(imported.skipped).toBeGreaterThan(0)
    expect(await db.questions.count()).toBe(1)
  })

  it('拒绝非法 JSON', async () => {
    await expect(importFromJsonText('{ not json')).rejects.toThrow()
  })

  it('拒绝高于当前版本的 schemaVersion', () => {
    const check = checkImportPayload({
      schemaVersion: SCHEMA_VERSION + 1,
      exportedAt: new Date().toISOString(),
      app: 'basic-calculation-training',
      data: { sessions: [], questions: [], wrongQuestions: [], weakPatterns: [] }
    })
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.errors.join(' ')).toContain('版本')
    }
  })

  it('拒绝非法数值（除数不能为 0 / 用时不能为负）', async () => {
    const sessionId = newId()
    const badDivisor = checkImportPayload({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'basic-calculation-training',
      data: {
        sessions: [makeSession({ id: sessionId })],
        questions: [
          {
            ...makeQuestionRecord({ sessionId, divisor: 100, correct: true }),
            divisor: 0
          }
        ],
        wrongQuestions: [],
        weakPatterns: []
      }
    })
    expect(badDivisor.ok).toBe(false)

    const negativeElapsed = checkImportPayload({
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'basic-calculation-training',
      data: {
        sessions: [makeSession({ id: sessionId, totalElapsedMs: -1 })],
        questions: [],
        wrongQuestions: [],
        weakPatterns: []
      }
    })
    expect(negativeElapsed.ok).toBe(false)
  })

  it('拒绝缺失必要字段的数据', () => {
    const check = checkImportPayload({ schemaVersion: 1, data: { sessions: 'nope' } })
    expect(check.ok).toBe(false)
  })
})
