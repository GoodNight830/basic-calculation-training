/**
 * 响应式代理剥离工具。
 *
 * 背景（重要 BUG 修复）：
 * Pinia / Vue 的 state、computed 返回的对象都是 **Proxy**，而 IndexedDB 的结构化克隆
 * 算法不能克隆 Proxy —— 直接写入会抛出 `DataCloneError: #<Object> could not be cloned`。
 *
 * 本项目的数据模型全部是纯 JSON 结构（字符串 / 数字 / 布尔 / null / 数组 / 普通对象），
 * 因此用一次 JSON 往返即可得到可安全落库的纯对象。
 *
 * 所有写库操作统一经过 db/repositories，仓库层会调用本函数，
 * 从而保证无论调用方是否传入响应式对象都不会再出现克隆失败。
 */

export function toPlain<T>(value: T): T {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

/** 数组版本，等价于 toPlain，仅作为语义化别名 */
export function toPlainList<T>(values: readonly T[]): T[] {
  return toPlain([...values])
}
