# UI 约定与可用 API（供页面实现使用）

本文件是本项目的页面实现约定。**页面组件不得直接访问 IndexedDB / Dexie**（需求规格书 §34 / §48.7），
必须通过 `@/services/*` 与 `@/app/stores/*` 完成数据读写。

## 技术约定

- Vue 3 `<script setup lang="ts">` + TypeScript strict（`noUnusedLocals` / `noUnusedParameters` 开启，不要留未使用变量）。
- 优先复用 `src/styles/main.css` 中的全局类，不引入任何新依赖，不写内联样式表。
- 文案使用简体中文，与需求规格书一致。
- 图标使用 emoji 文本，不引入图标库。
- 时间/百分比/误差展示统一使用 `@/services/format` 与 `@/modules/arithmetic/five-divide-three/calculator` 中的格式化函数。

## 可用全局 CSS 类（src/styles/main.css）

- 布局：`page`、`page-wide`、`page-header`、`page-title`、`page-subtitle`、`section`、`section-title`、`grid-2`
- 卡片：`card`、`card-title`、`card-subtitle`、`card-interactive`
- 按钮：`btn`、`btn-primary`、`btn-secondary`、`btn-outline`、`btn-danger`、`btn-ghost`、`btn-sm`、`btn-lg`、`btn-block`、`btn-row`
- 表单：`field`、`field-label`、`field-hint`、`input`、`select`、`chip-row`、`chip`（选中加 `active`）、`switch`
- 统计：`stat-grid`、`stat`、`stat-label`、`stat-value`（小号加 `stat-value-sm`）
- 列表：`list`、`list-item`、`list-item-main`、`list-item-meta`、`question-text`
- 标签：`badge`、`badge-success`、`badge-danger`、`badge-warning`、`badge-muted`、`badge-lg`
- 选项卡：`tabs`、`tab`（选中加 `active`）
- 工具：`row`、`row-between`、`row-wrap`、`col`、`text-muted`、`text-sm`、`text-xs`、`text-lg`、`text-success`、`text-danger`、`text-warning`、`text-center`、`bold`、`mono`、`divider`、`empty`、`alert`、`alert-info`、`alert-success`、`alert-warning`、`alert-danger`
- 响应式：`desktop-only`（>=900px 显示）、`mobile-only`（<900px 显示）

## 公共组件

- `@/components/common/StatCard.vue`：`label`、`value`、`hint?`、`small?`
- `@/components/common/EmptyState.vue`：`title`、`description?`，默认插槽放操作按钮
- `@/components/common/ConfirmDialog.vue`：`open`、`title`、`message?`、`confirmText?`、`cancelText?`、`busy?`、`danger?`；事件 `confirm` / `cancel`
- `@/components/common/GradeBadge.vue`：`grade`（`excellent | good | pass | encourage`）、`large?`

## Store API

### `useSettingsStore()`（`@/app/stores/settings`）

```
settings: Ref<AppSettings>      // { defaultQuestionCount, defaultAllowedErrorRate, weakPattern }
weakConfig: Computed<WeakPatternConfig>
loaded, saving: Ref<boolean>
load(), ensureLoaded(), save(next), updateWeakPattern(patch), updateDefaults(patch), reset()
```

`WeakPatternConfig` 字段（定义于 `@/config/trainingConfig`）：
`rangeSize, minSampleCount, minErrorCount, ratioThreshold, strongRatio, minBaselineErrorRate,
maxReinforcementWeight, maxReinforcementRatio, recentWindowSize, improvingDropRatio, improvingWeightFactor, enableReinforcement`

### `useWeakPatternStore()`（`@/app/stores/weakPatterns`）

```
patterns, activePatterns, resolvedPatterns: Ref<WeakPattern[]>
loading: Ref<boolean>
load(moduleId?), refresh(moduleId?), buildTargets(), reinforcementRatio(), clear(moduleId?)
```

### `useTrainingStore()`（`@/app/stores/training`）

```
active, pendingResume, lastResult, lastRecords, feedback
isTraining, isSpeed, hasActiveSession, isFromWrongQuestions  // computed
answeredCount, correctCount, wrongCount, questionCount, totalElapsedMs, liveElapsedMs
start({ module?, mode, questionCount?, allowedErrorRate?, source?, wrongQuestions? }) : Promise<ActiveSession>
endTraining(), abandon(), finish()
detectUnfinished(module?), resume(session?), discardUnfinished(), settleIfComplete()
loadResult(sessionId)
```

### 只读服务（`@/services/queries`）

```
loadOverview(module?)            // { today, total, wrongQuestionCount, unmasteredWrongCount, masteredWrongCount, weakPatterns, hasUnfinishedTraining }
loadHistory(range, module?)      // { summary, daily, sessions }   range: 'today' | '7d' | '30d' | 'all'
loadSessionRecords(sessionId)    // QuestionRecord[]
loadSession(sessionId)           // TrainingSession | null
loadWrongQuestions({ module?, status?, rangeMin?, rangeMax? })
setWrongQuestionMastered(id, mastered)
setManyWrongQuestionsMastered(ids, mastered)
removeWrongQuestion(id)
loadWrongQuestionRanges(module?, rangeSize?)   // [{ rangeMin, rangeMax, count }]
loadWeakPatterns(module?)
refreshWeakPatterns(config, module?)
loadDataCounts()
```

### 导出 / 导入（`@/services/export` + `@/services/download`）

```
buildFullJsonExport(options?)         // { filename, content, mime }
buildWrongQuestionsJsonExport(module?)
buildQuestionsCsvExport(module?)
buildWrongQuestionsCsvExport(module?)
importFromJsonText(text, 'skip' | 'overwrite')  // ImportResult
checkImportPayload(raw)
downloadTextFile(filename, content, mime)   // @/services/download
readTextFile(file)                          // @/services/download
clearAllData()                              // @/services/training
```

## 格式化函数

`@/services/format`：`formatMs(ms)`→`5.2s`、`formatDuration(ms)`→`58.4 秒`、`formatPercent(v)`、
`formatDate(iso)`、`formatDateTime(iso)`、`relativeDayLabel(iso)`、`localDateKey(date)`、
`TIME_RANGE_LABELS`、`type TimeRange`

`@/services/grading`：`gradeLabel(grade)`→`优秀/良好/合格/加油`、`gradeDescription(grade)`、`GRADE_THRESHOLDS_MS`

`@/modules/arithmetic/five-divide-three/calculator`：`formatNumber(value, decimals=2)`、`formatErrorRate(rate)`、`buildQuestionText(d, v)`

`@/services/weakPattern`：`weakPatternSuggestion(pattern)`、`hasActiveReinforcement(patterns, config?)`

## 关键业务规则（不得违反）

1. **评分只由「是否全对 + 总用时」决定**（§10.1）：`<=60s 优秀`、`<=75s 良好`、`<=90s 合格`、否则加油；任意一题错误一律加油。
   **正确率只用于统计，绝不能参与等级计算。**
2. 训练模式：题目无限、答错立即提示正确答案与误差、可随时「结束训练」。
3. 竞速模式：固定题数（默认 10，可改，最大 100）、训练过程中不显示任何正确/错误信息，完成后统一结算。
4. 错题重练必须新建训练组记录新数据，不得修改旧记录；「标记已掌握」只是状态变更，历史数据保留。
5. 薄弱点分析样本不足（默认 <10 题或错误 <3 题）时不得判定为薄弱点。
6. 不新增账号、云同步、排行榜、社交、支付等未被要求的功能（§43）。
   **例外**：可选的 AI 能力诊断已被明确要求（`docs/ai-learning-diagnosis-prd.md`，默认关闭）。
   实现它时不得让 AI 影响评分、正确答案、原始记录与离线可用性，API Key 不得写入任何导出文件；
   页面必须先完整提供本地诊断，AI 仅作为增强内容（无配置时功能不可缺失）。
