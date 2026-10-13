/** 应用入口 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './app/router'
import { installViewportHeightTracking } from './utils/viewport'
import './styles/main.css'
import { initializeHostSync } from './services/hostSync'

// 跟踪手机浏览器可见视口高度（避开地址栏 / 底部工具栏遮挡，见 utils/viewport.ts）
installViewportHeightTracking()

async function bootstrap(): Promise<void> {
  await initializeHostSync()
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

void bootstrap()
