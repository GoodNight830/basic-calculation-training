import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

interface HostDataFile {
  revision: number
  updatedAt: string
  data: Record<string, unknown>
}

const hostDataPath = resolve(process.cwd(), 'data', 'training-data.json')
let hostWriteQueue: Promise<void> = Promise.resolve()

async function readHostData(): Promise<HostDataFile | null> {
  try {
    const parsed = JSON.parse(await readFile(hostDataPath, 'utf8')) as HostDataFile
    return Number.isInteger(parsed.revision) && parsed.revision >= 1 && parsed.data ? parsed : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeHostData(value: HostDataFile): Promise<void> {
  await mkdir(dirname(hostDataPath), { recursive: true })
  const temporaryPath = `${hostDataPath}.tmp`
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
  await rename(temporaryPath, hostDataPath)
}

function sendJson(response: import('node:http').ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

function validHostData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const required = ['sessions', 'questions', 'wrongQuestions', 'weakPatterns', 'activeSessions', 'aiAnalysisSnapshots']
  return !('settings' in record) && required.every((key) => Array.isArray(record[key]))
}

const hostDataStorage = {
  name: 'host-data-storage',
  configureServer(server: { middlewares: { use: (path: string, handler: (request: IncomingMessage, response: import('node:http').ServerResponse) => void) => void } }) {
    server.middlewares.use('/api/host-data', async (request, response) => {
      try {
        if (request.method === 'GET') {
          sendJson(response, 200, { snapshot: await readHostData() })
          return
        }
        if (request.method !== 'PUT') {
          sendJson(response, 405, { error: '仅支持 GET 和 PUT' })
          return
        }
        const body = await readRequestBody(request)
        if (Buffer.byteLength(body, 'utf8') > 50 * 1024 * 1024) {
          sendJson(response, 413, { error: '训练数据超过 50 MB 限制' })
          return
        }
        const input = JSON.parse(body) as { baseRevision?: unknown; data?: unknown }
        if (!Number.isInteger(input.baseRevision) || (input.baseRevision as number) < 0 || !validHostData(input.data)) {
          sendJson(response, 400, { error: '主机数据格式无效' })
          return
        }
        let result: HostDataFile | null = null
        let conflict: HostDataFile | null = null
        hostWriteQueue = hostWriteQueue.catch(() => undefined).then(async () => {
          const current = await readHostData()
          if ((current?.revision ?? 0) !== input.baseRevision) {
            conflict = current
            return
          }
          result = {
            revision: (current?.revision ?? 0) + 1,
            updatedAt: new Date().toISOString(),
            data: input.data as Record<string, unknown>
          }
          await writeHostData(result)
        })
        await hostWriteQueue
        if (conflict) {
          sendJson(response, 409, { error: '主机数据已被其他设备更新', snapshot: conflict })
          return
        }
        sendJson(response, 200, { snapshot: result })
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : '主机数据读写失败' })
      }
    })
  }
}

const localAiProxy = {
  name: 'local-ai-proxy',
  configureServer(server: { middlewares: { use: (path: string, handler: (request: IncomingMessage, response: import('node:http').ServerResponse) => void) => void } }) {
    server.middlewares.use('/api/ai-proxy', async (request, response) => {
      try {
        const target = String(request.headers['x-ai-target'] ?? '')
        const parsed = new URL(target)
        const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)
        if (parsed.protocol !== 'https:' && !isLocalHttp) throw new Error('代理只允许 HTTPS 或本机 HTTP 地址')
        if (!parsed.pathname.endsWith('/responses') && !parsed.pathname.endsWith('/chat/completions')) throw new Error('不支持的 AI 接口路径')
        const body = await readRequestBody(request)
        const upstream = await fetch(parsed, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(request.headers.authorization ? { Authorization: request.headers.authorization } : {})
          },
          body,
          signal: AbortSignal.timeout(95_000)
        })
        response.statusCode = upstream.status
        response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
        response.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) {
        const cause = error instanceof Error ? error.cause : null
        const causeRecord = cause && typeof cause === 'object' ? cause as { code?: string; message?: string } : null
        const details = [
          error instanceof Error ? error.message : '本地代理请求失败',
          causeRecord?.code,
          causeRecord?.message
        ].filter(Boolean).join(' / ')
        response.statusCode = 502
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ error: details }))
      }
    })
  }
}

export default defineConfig({
  plugins: [
    hostDataStorage,
    localAiProxy,
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '基础计算训练系统',
        short_name: '计算训练',
        description: '本地优先的行测基础计算训练系统，首个模块：五除三（五位数 ÷ 三位数）',
        lang: 'zh-CN',
        theme_color: '#2f9e6b',
        background_color: '#f2f6f2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      /*
       * 显式给出监听忽略规则（覆盖 Vite 默认值，因此要带上默认项）：
       * - node_modules / .git / 依赖缓存目录不必监听（本项目 .npm-cache 有数百 MB）
       * - 图片、压缩包等素材文件不参与热更新：用户在 Windows 上拖入工作区时，
       *   文件常处于被占用状态，chokidar 会抛 EBUSY 并让开发服务器直接退出
       */
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/dev-dist/**',
        '**/.npm-cache/**',
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.webp',
        '**/*.gif',
        '**/*.heic',
        '**/*.bmp',
        '**/*.pdf',
        '**/*.zip'
      ]
    }
  },
  build: {
    target: 'es2022',
    sourcemap: false
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true
  }
})
