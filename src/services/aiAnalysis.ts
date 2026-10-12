import type { AiFinding, AiReport, LocalDiagnosis } from '@/types'
import type { AiSettings } from '@/config/trainingConfig'

const PROMPT_VERSION = 'diagnosis-v1'
const FORBIDDEN = ['肯定', '一定', '绝对', '完全掌握', '绝对没问题', '你就是粗心', '非常优秀', '天赋']
const UNSAFE_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/完全掌握/g, '目前表现稳定'],
  [/绝对没问题/g, '当前未发现明显问题'],
  [/你就是粗心/g, '可能存在作答偏差'],
  [/非常优秀/g, '表现较好'],
  [/天赋/g, '当前表现'],
  [/肯定/g, '目前数据显示'],
  [/一定/g, '可能'],
  [/绝对/g, '目前']
]
const REPORT_TERM_LABELS: ReadonlyArray<[RegExp, string]> = [
  [/\bempty\b/gi, '空答案'],
  [/\binvalid\b/gi, '无效输入'],
  [/\banswer_too_large\b/gi, '答案偏大'],
  [/\banswer_too_small\b/gi, '答案偏小'],
  [/\bslow_correct\b/gi, '答对但用时较长'],
  [/\bslow_wrong\b/gi, '答错且用时较长'],
  [/\brepeat_wrong\b/gi, '重复答错'],
  [/\bout_of_tolerance\b/gi, '超出允许误差'],
  [/\binsufficient_data\b/gi, '数据不足'],
  [/\brecent30\b/gi, '最近30天'],
  [/\brecent7\b/gi, '最近7天'],
  [/\bprevious7\b/gi, '前7天'],
  [/\blifetime\b/gi, '长期'],
  [/\bsampleCount\b/gi, '样本数'],
  [/\berrorCount\b/gi, '错误数'],
  [/\berrorRate\b/gi, '错误率'],
  [/\bmedianElapsedMs\b/gi, '中位用时'],
  [/\bp75ElapsedMs\b/gi, '较慢用时水平'],
  [/\bquestionCountSinceLastAi\b/gi, '上次分析后新增题数'],
  [/\berrorPatterns\b/gi, '错误类型分布'],
  [/\brangeMin\b/gi, '范围下限'],
  [/\brangeMax\b/gi, '范围上限'],
  [/\branges\b/gi, '除数范围'],
  [/\baccuracy\b/gi, '正确率'],
  [/\bcount\b/gi, '数量'],
  [/\btrend\b/gi, '趋势'],
  [/\bconfidence\b/gi, '可信度'],
  [/\binsufficient\b/gi, '数据不足'],
  [/\bstrength\b/gi, '优势'],
  [/\bweakness\b/gi, '薄弱项'],
  [/\blow\b/gi, '低'],
  [/\bmedium\b/gi, '中'],
  [/\bhigh\b/gi, '高'],
  [/\bschemaVersion\b/gi, '数据版本'],
  [/\bgeneratedAt\b/gi, '生成时间'],
  [/\bdataHash\b/gi, '数据摘要'],
  [/\bmodule\b/gi, '训练模块'],
  [/\bimproving\b/gi, '正在改善'],
  [/\bworsening\b/gi, '近期恶化'],
  [/\bstable\b/gi, '基本稳定']
]

function localizeReportText(value: string): string {
  return REPORT_TERM_LABELS.reduce((text, [pattern, label]) => text.replace(pattern, label), value)
}

export function formatAiReportText(value: string): string {
  return sanitizeReportText(localizeReportText(value))
}

function sanitizeReportText(value: string): string {
  return UNSAFE_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
}

const REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'findings', 'nextPlan', 'uncertainty'],
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['type', 'title', 'evidence', 'sampleCount', 'confidence', 'limitation', 'rangeMin', 'rangeMax', 'recommendation'],
        properties: {
          type: { type: 'string', enum: ['strength', 'weakness', 'improving', 'worsening', 'insufficient_data'] },
          title: { type: 'string' }, evidence: { type: 'string' }, sampleCount: { type: 'integer', minimum: 0 },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] }, limitation: { type: 'string' },
          rangeMin: { type: ['integer', 'null'] }, rangeMax: { type: ['integer', 'null'] }, recommendation: { type: ['string', 'null'] }
        }
      }
    },
    nextPlan: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['action', 'rangeMin', 'rangeMax', 'suggestedQuestionCount', 'suggestedRatio', 'reevaluateAfterQuestions'],
        properties: {
          action: { type: 'string' }, rangeMin: { type: ['integer', 'null'] }, rangeMax: { type: ['integer', 'null'] },
          suggestedQuestionCount: { type: ['integer', 'null'] }, suggestedRatio: { type: ['number', 'null'], maximum: 0.35 },
          reevaluateAfterQuestions: { type: ['integer', 'null'] }
        }
      }
    },
    uncertainty: { type: 'array', maxItems: 5, items: { type: 'string' } }
  }
} as const

function cleanBaseUrl(value: string): string {
  const trimmed = value.trim()
  const markdownUrl = trimmed.match(/\]\((https?:\/\/[^)]+)\)/i)?.[1]
  const plainUrl = trimmed.match(/https?:\/\/[^\s\])]+/i)?.[0]
  const cleaned = (markdownUrl ?? plainUrl ?? trimmed).replace(/\/$/, '')
  try {
    return new URL(cleaned).toString().replace(/\/$/, '')
  } catch (error) {
    throw new Error('接口地址格式无效，请只填写完整的 http:// 或 https:// 地址', { cause: error })
  }
}

function cleanApiKey(value: string): string {
  let cleaned = value.trim()
  cleaned = cleaned.replace(/^OPENAI_API_KEY\s*=\s*/i, '').trim()
  cleaned = cleaned.replace(/^Bearer\s+/i, '').trim()
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim()
  }
  if (/[^\x21-\x7e]/.test(cleaned)) {
    throw new Error('API Key 包含空格、换行或非英文字符，请只粘贴 Key 本身')
  }
  return cleaned
}

function wireApiFor(baseUrl: string, configured: AiSettings['wireApi']): AiSettings['wireApi'] {
  const hostname = new URL(cleanBaseUrl(baseUrl)).hostname
  return /(^|\.)fastaitoken\.com$/i.test(hostname) ? 'responses' : configured
}

function endpoints(baseUrl: string, wireApi: AiSettings['wireApi']): string[] {
  const base = cleanBaseUrl(baseUrl)
  const parsed = new URL(base)
  const effectiveWireApi = wireApiFor(baseUrl, wireApi)
  if (effectiveWireApi === 'responses') {
    if (base.endsWith('/responses')) return [base]
    if (parsed.hostname === 'www.fastaitoken.com' && (parsed.pathname === '/' || parsed.pathname === '')) {
      return [`${base}/v1/responses`, `${base}/responses`]
    }
    return [`${base}/responses`]
  }
  return [base.endsWith('/chat/completions') ? base : `${base}/chat/completions`]
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const externalSignal = init.signal
  const abortFromExternal = () => controller.abort('user_cancelled')
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError' && externalSignal?.aborted) {
      throw new Error('已取消 AI 分析', { cause: error })
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`连接超时（${Math.round(timeoutMs / 1000)} 秒），请检查接口地址或中转站状态`, { cause: error })
    }
    if (error instanceof TypeError) {
      throw new Error('无法连接接口。请检查地址、网络，以及中转站是否允许浏览器跨域访问（CORS）', { cause: error })
    }
    throw error
  } finally {
    window.clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }
}

function requestTarget(settings: AiSettings, target: string): { url: string; headers: Record<string, string> } {
  if (settings.transport === 'local_proxy') {
    return { url: '/api/ai-proxy', headers: { 'X-AI-Target': target } }
  }
  return { url: target, headers: {} }
}

function systemPrompt(): string {
  return `你是计算训练数据分析器。只依据输入的聚合数据生成中文报告，并严格返回 JSON。
事实、判断、建议必须分离。样本少于10不得判断；10-29仅低置信度；30-59最高中置信度；60以上才可高置信度。
禁止编造数值、心理归因、绝对化表述和无证据恭维。鼓励只能引用真实改善。每条结论必须写限制。
所有面向用户的文字必须使用自然中文，不得出现 answer_too_large、recent30、sampleCount 等内部字段名。
输出字段：summary, findings, nextPlan, uncertainty。findings字段严格使用 type,title,evidence,sampleCount,confidence,limitation,rangeMin,rangeMax,recommendation。nextPlan使用 action,rangeMin,rangeMax,suggestedQuestionCount,suggestedRatio,reevaluateAfterQuestions。`
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`AI 返回缺少 ${field}`)
}

async function responseError(response: Response, prefix: string): Promise<Error> {
  let detail = ''
  try {
    const text = await response.text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string | { message?: string }; code?: string }
        detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message ?? parsed.code ?? ''
      } catch {
        detail = text.slice(0, 300)
      }
    }
  } catch {
    // Status code remains useful when the upstream body is unreadable.
  }
  return new Error(`${prefix}（${response.status}）${detail ? `：${detail}` : ''}`)
}

async function performJsonRequest(settings: AiSettings, requestBody: unknown, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const apiKey = cleanApiKey(settings.apiKey)
  const htmlEndpoints: string[] = []
  for (const apiEndpoint of endpoints(settings.baseUrl, settings.wireApi)) {
    const target = requestTarget(settings, apiEndpoint)
    const response = await fetchWithTimeout(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...target.headers,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(requestBody),
      signal
    }, timeoutMs)
    if (!response.ok) throw await responseError(response, 'AI 服务请求失败')
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    if (contentType.includes('text/html') || /^\s*<!doctype|^\s*<html/i.test(text)) {
      htmlEndpoints.push(apiEndpoint)
      continue
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(`接口返回的不是有效 JSON${contentType ? `（${contentType}）` : ''}`, { cause: error })
    }
  }
  throw new Error(`中转站将 API 请求返回为网页，已尝试：${htmlEndpoints.join('、')}`)
}

export function validateAiReport(raw: unknown, diagnosis: LocalDiagnosis): AiReport {
  if (!raw || typeof raw !== 'object') throw new Error('AI 返回格式不是对象')
  const value = raw as Record<string, unknown>
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    throw new Error(`AI 返回缺少 summary；实际字段：${Object.keys(value).join(', ') || '无'}`)
  }
  if (!Array.isArray(value.findings) || !Array.isArray(value.nextPlan) || !Array.isArray(value.uncertainty)) throw new Error('AI 返回结构不完整')
  const allText = JSON.stringify(raw)
  const hadUnsafeLanguage = FORBIDDEN.some((word) => allText.includes(word))
  const rangeMap = new Map(diagnosis.ranges.map((r) => [`${r.rangeMin}-${r.rangeMax}`, r]))
  let filteredInvalidRange = false
  const findings = value.findings.slice(0, 8).filter((item) => {
    if (!item || typeof item !== 'object') return true
    const candidate = item as { rangeMin?: number | null; rangeMax?: number | null }
    if (candidate.rangeMin == null || candidate.rangeMax == null) return true
    const valid = rangeMap.has(`${candidate.rangeMin}-${candidate.rangeMax}`)
    if (!valid) filteredInvalidRange = true
    return valid
  }).map((item): AiFinding => {
    if (!item || typeof item !== 'object') throw new Error('AI 发现项格式错误')
    const finding = item as unknown as AiFinding
    if (finding.rangeMin === null) finding.rangeMin = undefined
    if (finding.rangeMax === null) finding.rangeMax = undefined
    if (finding.recommendation === null) finding.recommendation = undefined
    assertString(finding.title, 'finding.title')
    assertString(finding.evidence, 'finding.evidence')
    assertString(finding.limitation, 'finding.limitation')
    if (!['strength', 'weakness', 'improving', 'worsening', 'insufficient_data'].includes(finding.type)) throw new Error('AI 发现类型无效')
    const range = finding.rangeMin !== undefined && finding.rangeMax !== undefined ? rangeMap.get(`${finding.rangeMin}-${finding.rangeMax}`) : null
    const actualSamples = range?.recent7.sampleCount ?? diagnosis.recent7.sampleCount
    if (finding.sampleCount !== actualSamples) throw new Error('AI 引用的样本量与本地统计不一致')
    const maximum = actualSamples < 10 ? null : actualSamples < 30 ? 'low' : actualSamples < 60 ? 'medium' : 'high'
    if (maximum === null && finding.type !== 'insufficient_data') throw new Error('AI 在样本不足时下了结论')
    const rank = { low: 1, medium: 2, high: 3 }
    if (maximum && rank[finding.confidence] > rank[maximum]) throw new Error('AI 置信度超过本地规则')
    return {
      ...finding,
      title: sanitizeReportText(localizeReportText(finding.title)),
      evidence: sanitizeReportText(localizeReportText(finding.evidence)),
      limitation: sanitizeReportText(localizeReportText(finding.limitation)),
      recommendation: finding.recommendation ? sanitizeReportText(localizeReportText(finding.recommendation)) : undefined
    }
  })
  const nextPlan = value.nextPlan.slice(0, 5).filter((item) => {
    if (!item || typeof item !== 'object') return true
    const candidate = item as { rangeMin?: number | null; rangeMax?: number | null; suggestedRatio?: number | null }
    const validRange = candidate.rangeMin == null || candidate.rangeMax == null || rangeMap.has(`${candidate.rangeMin}-${candidate.rangeMax}`)
    const validRatio = candidate.suggestedRatio == null || (candidate.suggestedRatio >= 0 && candidate.suggestedRatio <= 0.35)
    if (!validRange || !validRatio) filteredInvalidRange = true
    return validRange && validRatio
  }).map((item) => {
    const plan = item as AiReport['nextPlan'][number]
    if (plan.rangeMin === null) plan.rangeMin = undefined
    if (plan.rangeMax === null) plan.rangeMax = undefined
    if (plan.suggestedQuestionCount === null) plan.suggestedQuestionCount = undefined
    if (plan.suggestedRatio === null) plan.suggestedRatio = undefined
    if (plan.reevaluateAfterQuestions === null) plan.reevaluateAfterQuestions = undefined
    assertString(plan.action, 'plan.action')
    return { ...plan, action: sanitizeReportText(localizeReportText(plan.action)) }
  })
  const uncertainty = value.uncertainty.filter((x): x is string => typeof x === 'string').slice(0, 5).map((text) => sanitizeReportText(localizeReportText(text)))
  if (hadUnsafeLanguage) uncertainty.push('系统已将缺少数据依据的绝对化或恭维措辞改为中性表述。')
  if (filteredInvalidRange) uncertainty.push('系统已移除无法由本地统计验证的范围或训练比例。')
  return { summary: sanitizeReportText(localizeReportText(value.summary)), findings, nextPlan, uncertainty }
}

export async function requestAiReport(settings: AiSettings, diagnosis: LocalDiagnosis, signal?: AbortSignal): Promise<AiReport> {
  if (!settings.enabled || !settings.model || !settings.baseUrl) throw new Error('请先完成 AI 服务配置')
  if (['openai', 'fastaitoken', 'custom'].includes(settings.model.trim().toLowerCase())) throw new Error('模型名称填写的是服务商名称；FastAIToken 配置应填写 gpt-5.5')
  if (!settings.consentToUpload) throw new Error('请先同意发送聚合统计')
  const promptInput = JSON.stringify({ learningGoal: settings.learningGoal, diagnosis })
  const effectiveWireApi = wireApiFor(settings.baseUrl, settings.wireApi)
  const isFastAiToken = /(^|\.)fastaitoken\.com$/i.test(new URL(cleanBaseUrl(settings.baseUrl)).hostname)
  const effectiveEffort = isFastAiToken && settings.reportDetail !== 'detailed' ? 'low' : settings.reasoningEffort
  const effectiveMaxTokens = settings.reportDetail === 'short' ? Math.min(settings.maxOutputTokens, 600) : Math.min(settings.maxOutputTokens, 1000)
  const requestBody = effectiveWireApi === 'responses'
    ? {
        model: settings.model,
        instructions: systemPrompt(),
        input: promptInput,
        max_output_tokens: effectiveMaxTokens,
        reasoning: { effort: effectiveEffort },
        text: { format: { type: 'json_schema', name: 'calculation_diagnosis', strict: true, schema: REPORT_JSON_SCHEMA } },
        store: false
      }
    : {
        model: settings.model,
        temperature: 0.1,
        max_tokens: settings.maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt() }, { role: 'user', content: promptInput }]
      }
  const body = await performJsonRequest(settings, requestBody, 90_000, signal) as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = effectiveWireApi === 'responses'
    ? body.output_text ?? body.output?.flatMap((item) => item.content ?? []).find((item) => typeof item.text === 'string')?.text
    : body.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 服务没有返回报告内容')
  return validateAiReport(extractJson(content), diagnosis)
}

export async function testAiConnection(settings: AiSettings): Promise<void> {
  if (!settings.baseUrl || !settings.model) throw new Error('请填写接口地址和模型名称')
  if (['openai', 'fastaitoken', 'custom'].includes(settings.model.trim().toLowerCase())) throw new Error('模型名称填写的是服务商名称；FastAIToken 配置应填写 gpt-5.5')
  const body = wireApiFor(settings.baseUrl, settings.wireApi) === 'responses'
    ? { model: settings.model, input: '只回复 OK', max_output_tokens: 16, reasoning: { effort: settings.reasoningEffort }, store: false }
    : { model: settings.model, max_tokens: 8, messages: [{ role: 'user', content: '只回复 OK' }] }
  await performJsonRequest(settings, body, 45_000)
}

export { PROMPT_VERSION }
