import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage } from 'node:http'

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
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
        cleanupOutdatedCaches: true
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
