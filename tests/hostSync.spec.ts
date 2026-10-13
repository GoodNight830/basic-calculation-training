import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/database'
import { flushHostSync, initializeHostSync, scheduleHostSync } from '@/services/hostSync'
import type { TrainingSession } from '@/types'

const session: TrainingSession = {
  id: 'host-session', module: 'five-divide-three', mode: 'training', questionCount: 1,
  allowedErrorRate: 3, startedAt: '2026-10-12T10:00:00.000Z', finishedAt: '2026-10-12T10:01:00.000Z',
  totalElapsedMs: 60000, answeredCount: 1, correctCount: 1, wrongCount: 0,
  grade: 'excellent', status: 'finished', createdAt: '2026-10-12T10:00:00.000Z'
}

describe('host data sync', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.sessions.clear(), db.questions.clear(), db.wrongQuestions.clear(), db.weakPatterns.clear(),
      db.activeSessions.clear(), db.aiAnalysisSnapshots.clear(), db.settings.clear()
    ])
    vi.restoreAllMocks()
  })

  it('pulls host business data without changing device-local settings', async () => {
    await db.settings.put({ key: 'app', value: { ai: { apiKey: 'device-secret' } }, updatedAt: new Date().toISOString() } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      snapshot: { revision: 3, updatedAt: '2026-10-12T10:02:00.000Z', data: {
        sessions: [session], questions: [], wrongQuestions: [], weakPatterns: [], activeSessions: [], aiAnalysisSnapshots: []
      } }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await initializeHostSync()

    expect(await db.sessions.get(session.id)).toMatchObject({ id: session.id })
    expect((await db.settings.get('app'))?.value).toEqual({ ai: { apiKey: 'device-secret' } })
  })

  it('never uploads settings or API keys', async () => {
    await db.settings.put({ key: 'app', value: { ai: { apiKey: 'must-not-upload' } }, updatedAt: new Date().toISOString() } as never)
    await db.sessions.put(session)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      snapshot: { revision: 1, updatedAt: '2026-10-12T10:02:00.000Z', data: {
        sessions: [session], questions: [], wrongQuestions: [], weakPatterns: [], activeSessions: [], aiAnalysisSnapshots: []
      } }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    scheduleHostSync()
    await flushHostSync()

    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PUT')
    expect(putCall).toBeTruthy()
    expect(String((putCall?.[1] as RequestInit).body)).not.toContain('must-not-upload')
    expect(String((putCall?.[1] as RequestInit).body)).not.toContain('settings')
  })

  it('migrates existing browser history when the first host snapshot is empty', async () => {
    await db.sessions.put(session)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: {
        revision: 1, updatedAt: '2026-10-12T10:02:00.000Z', data: {
          sessions: [], questions: [], wrongQuestions: [], weakPatterns: [], activeSessions: [], aiAnalysisSnapshots: []
        }
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: {
        revision: 2, updatedAt: '2026-10-12T10:03:00.000Z', data: {
          sessions: [session], questions: [], wrongQuestions: [], weakPatterns: [], activeSessions: [], aiAnalysisSnapshots: []
        }
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await initializeHostSync()

    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PUT')
    expect(String((putCall?.[1] as RequestInit).body)).toContain('host-session')
  })
})
