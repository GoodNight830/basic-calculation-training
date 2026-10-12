# 基础计算训练系统（V1）

一个**本地优先（Local-First）、移动端友好**的行测基础计算训练 Web 应用 / PWA。
V1 第一个训练模块为 **五除三（五位数 ÷ 三位数）**，提供 **训练模式** 与 **竞速模式** 两套流程。

实现依据：`基础计算训练系统_完整软件工程需求规格书_v1.0.md`（本项目的唯一主要需求依据）。

---

## 快速开始

### Windows 一键启动（推荐）

双击项目根目录的 **`启动.bat`**：自动检查 Node.js → 缺依赖时自动 `npm install` →
启动开发服务器并打开浏览器（http://localhost:5173）。按 `Ctrl + C` 或关闭窗口即停止。

也可以带参数（例如在终端执行 `启动.bat preview`）：

| 命令 | 作用 |
|---|---|
| `启动.bat` | 开发模式（默认）：热更新，自动打开浏览器 |
| `启动.bat preview` | 生产构建 + 本地预览（http://localhost:4173，更接近真机 / PWA 效果） |
| `启动.bat build` | 只做类型检查 + 生产构建（输出 `dist/`） |
| `启动.bat test` | 运行单元测试（Vitest） |
| `启动.bat check` | 只检查环境：Node 版本、依赖、构建产物、5173 端口占用 |

> 实现：`启动.bat`（纯 ASCII 外壳，负责切码页并转发参数）→ `.tools/start.ps1`（PowerShell，负责环境检查与启动）。
> 维护约定：`启动.bat` 必须保持 **纯 ASCII**，`.tools/start.ps1` 必须以 **UTF-8 带 BOM** 保存；
> 否则 cmd 会错乱解析、Windows PowerShell 5.1 会把中文显示成乱码。

### 命令行方式

```bash
npm install        # 首次安装依赖（缓存目录不可写时改用 --cache ./.npm-cache）
npm start          # 开发：启动并自动打开 http://localhost:5173
npm run dev        # 开发：同上，但不自动打开浏览器
npm run build      # 类型检查 + 生产构建（输出 dist/）
npm run preview    # 预览生产构建
npm test           # 单元测试（Vitest）
npm run lint       # ESLint
npm run typecheck  # 仅类型检查
```

> 环境要求：Node.js >= 20.19（当前验证环境为 Node 24 + npm 11），现代 Chromium / Firefox / Safari 浏览器。
> 若所在环境限制了 npm 缓存目录写入，可用 `npm install --cache ./.npm-cache` 把缓存放在项目内。

---

## V1 功能范围（对应需求规格书 §3 / §47）

| 功能 | 说明 |
|---|---|
| 首页 | 模块入口（点击即开始练习）、今日统计、薄弱点提示、错题重练入口 |
| 五除三 | 被除数 10000–99999，除数 100–999 |
| 训练模式 | 无限题目、答错立即显示正确答案与误差、可随时结束 |
| 竞速模式 | 固定题数（默认 10，最大 100）、全程无正确/错误反馈、完成后统一结算 |
| 数字键盘 | **由应用自带**（不依赖手机系统键盘）：0–9、小数点、退格 ⌫、清空、重开、提交；电脑端物理键盘同样可用 |
| 计时 | 单题用时（`performance.now()` 单调时钟）+ 整组总用时；「重开」可清空并重新计时（不计入成绩） |
| 误差判定 | `errorRate = \|用户答案-正确答案\| / \|正确答案\| × 100%`，默认允许 3% |
| 结算等级 | **只由「是否全对 + 总用时」决定**：≤60s 优秀、≤75s 良好、≤90s 合格、否则加油；任意错误一律加油 |
| 错题库 | 错误自动入库、错误次数 / 最近错误 / 平均用时、标记已掌握、按范围重练 |
| 历史记录 | 今天 / 近7天 / 近30天 / 全部，按天分组，可回看任意训练组 |
| 统计 | 训练组数、题目数、正确数、错误数、正确率、总用时、平均单题用时 |
| 薄弱点分析 | 按除数百位范围分析错误率并与个人整体错误率比较（样本 <10 或错误 <3 不判定） |
| 定向强化 | 按权重提高薄弱范围出题比例，合计上限受配置约束（默认 ≤35%，**绝不允许 100% 薄弱题**），改善后自动降权 |
| 数据导入导出 | 全部数据 JSON、错题 JSON、题目记录 CSV、错题 CSV；JSON 导入含结构 / 版本 / ID 冲突校验 |
| PWA | 可安装到桌面与手机主屏、离线可用（Service Worker + Manifest） |
| 响应式 | 手机（底部导航、大输入框、数字键盘）/ 平板 / PC（左侧导航，更宽内容区） |
| 中断恢复 | 刷新、关闭页面、崩溃后可继续未完成训练（IndexedDB 实时保存 `activeSession`） |

**明确不做**（§43）：账号、注册、云同步、社交、排行榜、AI 对话、广告、支付、会员、复杂后台。

> 「不做在线 API」这一条已放开：**可选的** AI 能力分析（用户自填 API Key / Base URL，默认关闭）已成为明确需求，
> 依据 `docs/ai-learning-diagnosis-prd.md`；详见下文《与规格书的差异》第 5 条。V1 依然不需要任何服务端。

---

## 技术栈（§22）

Vue 3 + TypeScript + Vite + Pinia + Vue Router + Dexie(IndexedDB) + vite-plugin-pwa + Vitest + ESLint

核心算法（题目生成、答案校验、误差计算、评分、薄弱点分析、强化策略、统计）全部是**纯 TypeScript**，
不依赖浏览器 API，便于单元测试与未来迁移到微信小程序（§45）。

---

## 目录结构（§33）

```text
src/
├── app/
│   ├── router/index.ts          # 路由与导航守卫（训练中禁止切换模式，§6.8）
│   └── stores/                  # Pinia：training / settings / weakPatterns
├── components/
│   ├── common/                  # ConfirmDialog / StatCard / EmptyState / GradeBadge
│   └── training/                # AnswerInput / FeedbackPanel
├── config/trainingConfig.ts     # 全部常量与可配置阈值（不允许写死在 UI）
├── db/                          # Dexie 数据库与 repository（页面不得直接访问）
├── modules/arithmetic/
│   ├── registry.ts              # 计算模块注册表（未来可扩展四除二 / 百分数 / 分数）
│   └── five-divide-three/       # generator / validator / calculator / types
├── pages/                       # Home / FiveDivideThreeSetup / Training / Result /
│                                # WrongQuestions / History / WeakPatterns / Settings
├── services/                    # grading / statistics / weakPattern / training /
│                                # export(+ schema 校验) / queries / format / timer / download
├── styles/main.css              # 全局样式（移动优先 + 桌面适配）
├── types/index.ts               # 领域数据模型
└── main.ts
tests/                           # Vitest 单元测试
docs/ui-conventions.md           # 页面实现约定与可用 API
```

---

## 数据模型（§18 – §21）

IndexedDB（Dexie）表：

| 表 | 说明 |
|---|---|
| `sessions` | 训练组（`TrainingSession`），含模式、题数、允许误差、总用时、正确/错误数、等级、状态 |
| `questions` | **题目级原始数据**（`QuestionRecord`），含题目、被除数、除数、正确答案、用户答案、误差、是否正确、用时、时间戳、训练组、模式 |
| `wrongQuestions` | 错题（`WrongQuestion`），按「被除数:除数」聚合，记录错误次数、正确次数、状态 |
| `weakPatterns` | 薄弱点（`WeakPattern`），范围、样本数、错误率、整体错误率、强化权重、状态、趋势 |
| `settings` | 应用设置（默认题目数量、允许误差、薄弱点阈值等） |
| `activeSessions` | 未完成训练（`ActiveSession`），用于中断恢复 |

设计说明：
- 需求规格书 §18 允许「根据实际实现合并部分表」，本实现把 `answers` 合并进 `questions`，
  保证题目级原始数据完整且一一对应。
- `correctAnswer` 一律随题目落库，不在运行时重新计算（§20）。
- **写库前统一剥离 Vue 响应式代理**：Pinia/Vue 的 state 是 Proxy，而 IndexedDB 的结构化克隆
  不能克隆 Proxy（会抛 `DataCloneError`）。所有写操作都经过 `db/repositories`，仓库层调用
  `utils/plain.ts` 的 `toPlain()` 转换，因此调用方传入响应式对象也不会失败；
  该问题有专门的回归测试 `tests/trainingStore.spec.ts`。
- **放弃训练**：删除 `activeSession`，训练组标记为 `abandoned`，所有统计与薄弱点分析只使用
  `status = 'finished'` 的训练组数据（§9：放弃的训练不计入正式训练统计）。
- 错题「标记已掌握」只改变 `status`，**不删除任何历史数据**（§12.3）。

---

## 与规格书的差异（按用户要求调整，已实现或已批准，记录在此）

1. **训练参数改为设置页统一配置**（调整规格书 §7 / §26 的「练习前设置页」）：
   默认模式、默认题目数量、默认允许误差全部在「设置 → 训练默认参数」中配置；
   首页「开始练习」与五除三入口的「开始训练模式 / 开始竞速模式」按钮**点击后立即开始**，不再弹出设置界面。
2. **数字键盘由本应用提供**（调整规格书 §41 的「触发系统数字键盘」）：
   训练页使用自带数字键盘（0–9、小数点、退格、清空、重开、提交），输入框设置 `inputmode="none"`，
   手机不再弹出系统键盘、不会遮挡题目；电脑端物理键盘（数字、Backspace、Enter）仍然可用。
3. **主题色为护眼绿**（规格书未约束配色）：`--color-primary: #2f9e6b`，
   背景 `#f2f6f2`，文字 `#17251c`，PWA `theme_color` 与图标同步为绿色。
4. **训练页布局按用户提供的参考 App 截图对齐**：题目与参数在上半屏、数字键盘贴在屏幕底部
   （不再整体垂直居中）；键盘键位为「重开 清空 退格 / 1-9 / . 0 确认」；
   顶部同时显示「允许误差 ±x%」与「〖N题用时〗合格 90S · 良好 75S · 优秀 60S」速查
   （阈值取自 `GRADE_THRESHOLDS_MS`，不写死）；答案采用题目下方的「填空线」样式。
5. **新增可选的 AI 能力诊断**（依据 `docs/ai-learning-diagnosis-prd.md`；状态：**已批准，按 §16 分阶段实现**）：
   该文档晚于规格书，按它放开规格书的两处条款——§43 的「不做在线 API」与 §38 的「不上传任何数据」，
   但只开**有条件的口子**：
   - AI 分析默认关闭，须用户在设置页显式启用并同意后才会上传；
   - **只上传聚合统计**，逐题原始答案默认不发送（要发需用户再次确认）；
   - API Key 只存本机设置，**永远不进入 JSON / CSV 导出**；清除浏览器数据后允许丢失；
   - 无配置、网络失败、CORS、限流、超时或返回非法 JSON 时，本地诊断与离线训练完整可用；
   - AI 不得修改评分、正确答案、原始记录、错题状态与本地统计。
   实施顺序按其 §16：**Phase 1（本地诊断）不涉及任何网络请求**；
   与旧文档冲突之处，一律以 `docs/ai-learning-diagnosis-prd.md` 为准。

## 关键业务规则（实现要点）

1. **评分函数**（`src/services/grading.ts`）

   ```ts
   gradeSession(totalElapsedMs, correctCount, totalCount): Grade
   // correctCount !== totalCount → encourage
   // ≤60s → excellent，≤75s → good，≤90s → pass，否则 encourage
   ```

   正确率**绝不参与**等级计算（§10.1）。边界（60.00s / 60.01s / 75.00s / 75.01s / 90.00s / 90.01s）均有单元测试。

2. **误差判定**：误差刚好等于允许误差时判定为正确（使用极小浮点容差），空输入与非法输入判定为错误且误差记为 `null`。

3. **薄弱点分析**：默认按除数百位范围（100–199 … 900–999）分桶；判定条件为
   `样本数 ≥ 10`、`错误数 ≥ 3`、`范围错误率 / max(整体错误率, 0.5%) ≥ 1.5`；
   权重按超出整体的倍数归一化并封顶（默认 0.35）；近期错误率明显下降 → `improving`（权重折减 50%），
   回落到整体水平 → `resolved`（权重 0，不再强化）。所有阈值均可在「设置」页修改。

4. **强化出题**：生成器按权重随机决定是否出薄弱范围题目，合计占比受 `maxReinforcementRatio`（默认 0.35）约束，
   保证「普通随机训练 + 薄弱点强化」始终结合（§16.1）。

5. **数据完整性**：导入 JSON 时白名单重建对象、校验版本号、拒绝非法数值（如除数为 0、负用时）、
   ID 冲突可选择「跳过」或「覆盖」；不使用 `eval`，所有 ID 使用 `crypto.randomUUID()`（§42）。

---

## 测试

```bash
npm test            # 单元 / 集成测试（jsdom）
npm run test:mobile # 手机端布局巡检（真实浏览器渲染，需要先 npm run dev）
```

### 单元 / 集成测试（`npm test`）

覆盖内容（§35 / §36）：

- `tests/grading.spec.ts`：评分边界与「正确率不参与等级」
- `tests/validator.spec.ts`：误差边界（刚好 3% / 小于 / 大于）、正数、小数、空输入、非法输入、全角输入
- `tests/generator.spec.ts`：五位数/三位数约束、不重复、随机种子可复现、薄弱强化比例上限
- `tests/weakPattern.spec.ts`：样本阈值、整体错误率比较、权重计算、改善降权、resolved、阈值可配置
- `tests/statistics.spec.ts`：今日/范围统计、按天聚合、平均用时、最近窗口错误率
- `tests/persistence.spec.ts`：题目级数据落库并可重新读取（≈刷新页面）、错题自动入库、再次做对不删历史、
  标记已掌握、放弃训练不计入统计、薄弱点落库、导出/清空/导入恢复、非法导入被拒绝
- `tests/trainingStore.spec.ts`：真实 store + 组件集成（提交推进、竞速无反馈、答错继续、错题重练、
  数字键盘事件、训练页三段式布局：题目固定在顶部 / 键盘在底部 / 顶部显示误差与等级速查）
- `tests/viewport.spec.ts`：可见视口高度取值、无 `visualViewport` 时的回退、地址栏收起后的更新
- `tests/mobileCss.spec.ts`：移动端样式不变量（动态视口高度、训练页不整页滚动、安全区、
  触控目标 ≥44px、横屏 5 列键盘、矮屏隐藏次要信息）

### 手机端布局巡检（`npm run test:mobile`）

用 Edge/Chrome 的**无头模式按真实机型尺寸渲染应用**，在页面内读取 `getBoundingClientRect()`
等真实排版数值后回传校验（脚本：`.tools/mobile-check.mjs` + `.tools/mobile-check.html`）。
当前覆盖机型：320×568、360×600、375×623、390×744、412×815、844×330（横屏）。

检查项：

1. 题目、答案完整可见且不被推出屏幕
2. 数字键盘贴底、不被浏览器工具栏或屏幕边缘切掉
3. 训练页不产生整页滚动（滚动会让题目消失）
4. 无横向溢出
5. 所有按键触控目标 ≥40px
6. 点按键盘能真正把数字输入进答案行
7. 答错反馈出现时：详情无需滚动即可看完，底部出现「继续」大按钮（≥44px），键盘让位
8. 逐页巡检 home / 五除三 / 错题 / 记录 / 薄弱点 / 设置：横向溢出与触控目标


---

## PWA / 离线（§23）

构建产物包含 `manifest.webmanifest` 与 Service Worker（Workbox），可安装到桌面或手机主屏幕，离线可完成训练
（训练数据全部保存在浏览器本地 IndexedDB，**默认不上传任何数据**，§38）。

例外只有一处：用户在「设置 → AI 能力分析」中**显式启用并同意**后，才会把**聚合统计**发送到用户自己配置的模型服务；
逐题原始答案默认不发送，API Key 只保存在本机、不进入任何导出文件，关掉该开关即恢复完全离线
（详见《与规格书的差异》第 5 条）。

---

## 文档

- `docs/ui-conventions.md`：页面实现约定、全局 CSS 类、Store / Service API 清单、业务红线
- `docs/ai-learning-diagnosis-prd.md`：能力诊断与训练教练需求（**最新**；与规格书冲突处以本文档为准）
