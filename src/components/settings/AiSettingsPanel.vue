<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useSettingsStore } from '@/app/stores/settings'
import { testAiConnection } from '@/services/aiAnalysis'
import type { AiSettings } from '@/config/trainingConfig'

const store = useSettingsStore()
const form = reactive<AiSettings>({ ...store.settings.ai })
const saving = ref(false)
const testing = ref(false)
const message = ref('')
const errorText = ref('')
const showKey = ref(false)

function sync(): void { Object.assign(form, store.settings.ai) }
async function save(): Promise<void> {
  saving.value = true; message.value = ''; errorText.value = ''
  try { await store.updateAi({ ...form }); sync(); message.value = 'AI 设置已保存在本机' }
  catch (error) { errorText.value = error instanceof Error ? error.message : String(error) }
  finally { saving.value = false }
}
async function test(): Promise<void> {
  testing.value = true; message.value = ''; errorText.value = ''
  try { await testAiConnection({ ...form, apiKey: form.apiKey.trim() }); message.value = '连接成功' }
  catch (error) { errorText.value = error instanceof Error ? error.message : String(error) }
  finally { testing.value = false }
}
function clearKey(): void { form.apiKey = ''; message.value = '密钥已从表单清除，请保存设置' }
function applyFastAiTokenPreset(): void {
  Object.assign(form, {
    provider: 'FastAIToken',
    baseUrl: 'https://www.fastaitoken.com',
    model: 'gpt-5.5',
    wireApi: 'responses',
    transport: 'local_proxy',
    reasoningEffort: 'low',
    reportDetail: 'standard',
    maxOutputTokens: 1000
  } satisfies Partial<AiSettings>)
  message.value = '已应用 FastAIToken 配置，请确认 Key 后保存设置'
  errorText.value = ''
}
onMounted(async () => { await store.ensureLoaded(); sync() })
</script>

<template>
  <div id="ai-settings" class="card section">
    <h2 class="card-title">AI 服务</h2>
    <p class="card-subtitle">模型只接收聚合统计；原始题目、逐题答案和 API Key 不会进入数据导出</p>
    <div class="btn-row" style="margin-top:12px"><button class="btn btn-outline btn-sm" type="button" @click="applyFastAiTokenPreset">应用 FastAIToken 配置</button></div>
    <div class="field" style="margin-top:14px"><label class="switch"><input v-model="form.enabled" type="checkbox" /><span>启用 AI 解读</span></label></div>
    <div class="field"><label class="field-label" for="ai-url">接口地址</label><input id="ai-url" v-model.trim="form.baseUrl" class="input input-mono" type="url" placeholder="https://api.example.com/v1" /><p class="field-hint">支持 OpenAI-compatible Chat Completions；本地 Ollama 或 LM Studio 可填写本机地址。</p></div>
    <div class="field"><label class="field-label" for="ai-model">模型名称</label><input id="ai-model" v-model.trim="form.model" class="input input-mono" type="text" placeholder="模型 ID" /></div>
    <div class="field"><label class="field-label" for="ai-wire">接口协议</label><select id="ai-wire" v-model="form.wireApi" class="select"><option value="chat_completions">Chat Completions</option><option value="responses">Responses API</option></select><p class="field-hint">中转站配置写有 wire_api = "responses" 时选择 Responses API。</p></div>
    <div class="field"><label class="field-label" for="ai-transport">连接方式</label><select id="ai-transport" v-model="form.transport" class="select"><option value="local_proxy">本地代理（推荐中转站）</option><option value="direct">浏览器直连</option></select><p class="field-hint">本地代理由 XC2 的本机服务转发，可解决多数中转站不允许浏览器跨域访问的问题。</p></div>
    <div v-if="form.wireApi === 'responses'" class="field"><label class="field-label" for="ai-reasoning">推理强度</label><select id="ai-reasoning" v-model="form.reasoningEffort" class="select"><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select><p class="field-hint">高推理强度可能提高分析质量，同时增加响应时间和用量。</p></div>
    <div class="field"><label class="field-label" for="ai-key">API Key</label><div class="row"><input id="ai-key" v-model="form.apiKey" class="input input-mono" :type="showKey ? 'text' : 'password'" autocomplete="off" placeholder="本地模型可留空" /><button class="btn btn-outline btn-sm" type="button" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button><button class="btn btn-ghost btn-sm" type="button" @click="clearKey">清除</button></div></div>
    <div class="field"><label class="field-label" for="ai-goal">训练目标</label><select id="ai-goal" v-model="form.learningGoal" class="select"><option value="accuracy">提高准确率</option><option value="speed">提高速度</option><option value="exam">备考冲刺</option><option value="maintenance">日常保持</option></select></div>
    <div class="field"><label class="field-label" for="ai-auto">自动分析</label><select id="ai-auto" v-model="form.autoAnalysis" class="select"><option value="off">仅手动分析</option><option value="daily">每天最多一次</option><option value="weekly">每周最多一次</option><option value="after_30_questions">新增30题后</option></select><p class="field-hint">自动分析仍需满足新增30题和数据明显变化；当前首版先提供手动生成，设置会为自动触发保留。</p></div>
    <div class="field"><label class="switch"><input v-model="form.consentToUpload" type="checkbox" /><span>同意向所填接口发送聚合统计</span></label><p class="field-hint">包括正确率、耗时、范围样本量和趋势，不包括逐题输入。</p></div>
    <div class="btn-row"><button class="btn btn-primary" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存 AI 设置' }}</button><button class="btn btn-outline" type="button" :disabled="testing" @click="test">{{ testing ? '测试中…' : '测试连接' }}</button><RouterLink class="btn btn-secondary" :to="{ name: 'diagnosis' }">前往能力诊断</RouterLink></div>
    <p class="field-hint">保存并测试成功后，到“能力诊断”页面点击“生成 AI 报告”。生成按钮不会出现在设置页。</p>
    <div v-if="message" class="alert alert-success" style="margin-top:10px">{{ message }}</div><div v-if="errorText" class="alert alert-danger" style="margin-top:10px">{{ errorText }}</div>
  </div>
</template>
