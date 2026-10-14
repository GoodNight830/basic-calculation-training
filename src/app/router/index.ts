/** 路由配置（§4 信息架构 · v2 三级结构：分类首页 → 基础计算 → 训练） */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { MODULE_FIVE_DIVIDE_THREE } from '@/config/trainingConfig'
import { useTrainingStore } from '@/app/stores/training'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    /** 是否出现在导航中 */
    nav?: boolean
    /** 导航顺序 */
    navOrder?: number
    /** 导航图标 */
    icon?: string
    /** 桌面端导航标签 */
    label?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/Home.vue'),
    meta: { title: '首页', nav: true, navOrder: 1, icon: '🏠', label: '首页' }
  },
  {
    path: '/basic',
    name: 'basic',
    component: () => import('@/pages/BasicCalc.vue'),
    meta: { title: '基础计算' }
  },
  {
    path: '/coming-soon',
    name: 'coming-soon',
    component: () => import('@/pages/ComingSoon.vue'),
    meta: { title: '敬请期待' }
  },
  {
    path: '/five-divide-three',
    name: 'five-divide-three',
    component: () => import('@/pages/FiveDivideThreeSetup.vue'),
    meta: { title: '五位数÷三位数' }
  },
  {
    path: '/training',
    name: 'training',
    component: () => import('@/pages/Training.vue'),
    meta: { title: '训练中' }
  },
  {
    path: '/result/:sessionId',
    name: 'result',
    component: () => import('@/pages/Result.vue'),
    props: true,
    meta: { title: '训练结果' }
  },
  {
    path: '/wrong',
    name: 'wrong',
    component: () => import('@/pages/WrongQuestions.vue'),
    meta: { title: '错题' }
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/pages/History.vue'),
    meta: { title: '训练记录' }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/pages/Profile.vue'),
    meta: { title: '个人数据', nav: true, navOrder: 2, icon: '📊', label: '个人数据' }
  },
  {
    path: '/weak',
    name: 'weak',
    component: () => import('@/pages/WeakPatterns.vue'),
    meta: { title: '薄弱点' }
  },
  {
    path: '/diagnosis',
    name: 'diagnosis',
    component: () => import('@/pages/Diagnosis.vue'),
    meta: { title: '能力诊断' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
    meta: { title: '设置', nav: true, navOrder: 3, icon: '⚙️', label: '设置' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

export const navigationRoutes = routes
  .filter((route) => route.meta?.nav)
  .sort((a, b) => (a.meta?.navOrder ?? 99) - (b.meta?.navOrder ?? 99))
  .map((route) => ({
    name: String(route.name),
    path: route.path,
    label: route.meta?.label ?? String(route.name),
    icon: route.meta?.icon ?? '•',
    navOrder: route.meta?.navOrder ?? 99
  }))

/** 移动端底部导航与桌面侧栏一致：首页 + 我的 */
export const mobileNavigation = navigationRoutes

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

/** 训练进行中不允许切换到其他模式或页面（§6.8） */
router.beforeEach((to) => {
  const trainingStore = useTrainingStore()
  if (trainingStore.hasActiveSession && to.name !== 'training' && to.name !== 'result') {
    return { name: 'training' }
  }
  if (to.name === 'training' && !trainingStore.hasActiveSession) {
    return { name: 'five-divide-three', query: { module: MODULE_FIVE_DIVIDE_THREE } }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} · 基础计算训练系统` : '基础计算训练系统'
})

export default router
