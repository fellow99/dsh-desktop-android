'use strict'
/**
 * Android 宿主桥适配器（替代 ark 的 @dsh-ohos/host-bridge 文件信箱）。
 *
 * 传输层：aosp-node-bridge AAR 内置的 `host.js`（libnode_host_client.so → JNI 槽位表）。
 * - 桥硬约束：单次调用 ≤10s（ANB_TIMEOUT_MS）、payload ≤ capBytes（实现默认 8 MiB）；
 * - **两段式协议（§6.4）**：宿主返回 `{ok:true,pending:true,id}` 时，本适配器自动以
 *   `host.result` 轮询至 done/expired，对调用方屏蔽（perm.request 等 600s 级用户交互靠它）；
 * - 宿主 handler 纪律：JSON 进出、永不抛；`{ok:false,error,hint}` 视为宿主拒绝。
 *
 * 位置契约：`host.js` 在载荷根（`DSH_PAYLOAD_DIR`，即 Kotlin 侧 payloadRoot / Node cwd）。
 */
import { createRequire } from 'node:module'
import path from 'node:path'

/** ark 版同名兼容导出：通用超时（§6.4 默认 15s）。 */
export const DEFAULT_TIMEOUT_MS = 15_000
/** ark 版同名兼容导出：用户交互级超时（设置页授权等）；经两段式轮询支持。 */
export const USER_CHOICE_TIMEOUT_MS = 600_000
/** 冻结的 16 项能力面（§6.4）+ 内部 host.result（诊断/能力探测用）。 */
export const HOST_CAPABILITIES = Object.freeze([
  'runtime.facts', 'perm.check', 'perm.request', 'perm.allFiles.status', 'perm.allFiles.request',
  'perm.openAppInfo', 'fs.pickFolder', 'fs.pickFiles', 'fs.saveFile', 'shell.openExternal',
  'notify.show', 'clipboard.readImage', 'clipboard.writeText', 'image.normalize',
  'log.write', 'power.keepAwake', 'host.result',
])

/** 与 ark 版同名同形的错误类型（调用方只依赖 message/capability/hint 字段）。 */
export class HostBridgeError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'HostBridgeError'
    this.code = code
    if (details && typeof details === 'object') {
      if (details.capability !== undefined) this.capability = details.capability
      if (details.hint !== undefined) this.hint = details.hint
      if (details.cause !== undefined) this.cause = details.cause
    }
  }
}

let bridgePromise = null

function loadBridge() {
  if (bridgePromise !== null) return bridgePromise
  bridgePromise = new Promise((resolve, reject) => {
    const candidates = []
    const payloadDir = process.env.DSH_PAYLOAD_DIR
    if (payloadDir) candidates.push(path.join(payloadDir, 'host.js'))
    candidates.push(path.join(process.cwd(), 'host.js'))
    let lastError = 'no candidate'
    for (const candidate of candidates) {
      try {
        const require_ = createRequire(import.meta.url)
        const bridge = require_(candidate)
        if (bridge && typeof bridge.invoke === 'function') {
          resolve(bridge)
          return
        }
        lastError = `no invoke(): ${candidate}`
      } catch (error) {
        lastError = `${candidate}: ${error && error.message ? error.message : String(error)}`
      }
    }
    reject(new HostBridgeError('bridge-unavailable', `Android 宿主桥加载失败：${lastError}`))
  })
  return bridgePromise
}

/** 诊断/事实用：桥是否可用（能力是否注册由宿主响应的 ok/unregistered 表达）。 */
export function isAvailable(capability = undefined) {
  return bridgePromise !== null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 调用宿主能力（自动两段式）。
 * @param {string} capability
 * @param {Record<string, any>} args
 * @param {{ timeoutMs?: number }} [options] — 总预算；轮询每 500ms 一次，单次桥调用各受 10s 限制
 * @returns {Promise<Record<string, any>>} 成功时的最终结果对象
 */
export async function invoke(capability, args, options = undefined) {
  const totalMs = options && typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + totalMs
  const bridge = await loadBridge()
  let response
  try {
    response = await bridge.invoke(capability, args ?? {})
  } catch (error) {
    throw new HostBridgeError('bridge-invoke-failed', `${capability}: ${error && error.message ? error.message : String(error)}`, { capability, cause: String(error && error.message) })
  }
  if (response && typeof response === 'object' && response.ok === false) {
    throw new HostBridgeError('host-rejected', `${capability}: ${response.error ?? 'unknown error'}`, { capability, hint: typeof response.hint === 'string' ? response.hint : undefined })
  }
  // 两段式：宿主立即返回 pending + id → 轮询 host.result
  if (response && typeof response === 'object' && response.pending === true && response.id) {
    for (;;) {
      if (Date.now() > deadline) {
        throw new HostBridgeError('bridge-timeout', `${capability}: 两段式等待超时（${totalMs}ms）`, { capability })
      }
      await sleep(500)
      let poll
      try {
        poll = await bridge.invoke('host.result', { id: response.id })
      } catch (error) {
        throw new HostBridgeError('bridge-invoke-failed', `host.result: ${error && error.message ? error.message : String(error)}`, { capability: 'host.result' })
      }
      if (poll && poll.state === 'done') return { ok: true, ...(poll.result ?? {}) }
      if (poll && poll.state === 'expired') {
        throw new HostBridgeError('expired', `${capability}: 宿主槽位已过期（5 分钟未完成）`, { capability })
      }
      // pending → 继续轮询
    }
  }
  return response
}
