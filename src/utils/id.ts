/** 唯一 ID 生成（§42：必须使用可靠的 UUID 或等价方案） */
export function newId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  // 回退方案：时间戳 + 随机数（仅在缺少 crypto.randomUUID 的老旧环境中使用）
  const rand = Math.random().toString(36).slice(2, 10)
  return `id-${Date.now().toString(36)}-${rand}`
}

/** 错题唯一键：被除数 + 除数 */
export function questionKeyOf(dividend: number, divisor: number): string {
  return `${dividend}:${divisor}`
}
