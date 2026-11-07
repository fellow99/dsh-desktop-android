/**
 * Plugin configuration for `@dsh-android/git`. Every deployment-varying tunable lives
 * here rather than as a hardcoded literal, so a profile row can override it without a
 * code change (the `DEFAULT_`-prefixed exports name the defaults).
 *
 * 112-cli-integration（FR-112-4 修订）：21 工具精简为单个 `git` passthrough 后，按动词的
 * 调参（authorName / authorEmail / maxDiffBlobBytes）不再被任何代码消费，本文件只保留
 * 对所有 git 命令都成立的网络预算 `networkTimeoutMs`。
 *
 * @module @dsh-android/git/config
 */

import z from '@deepseek-ai/schemastery'

/**
 * Wall-clock budget for one `git` invocation when the model does not set `timeoutMs`.
 * Network operations (`clone`/`fetch`/`pull`/`push`) over a slow link need room, but an
 * unbounded request would pin the host process.
 */
export const DEFAULT_NETWORK_TIMEOUT_MS = 5 * 60 * 1000

/** Plugin config schema; every key is optional and the defaults above apply. */
export const Config = z.object({
  networkTimeoutMs: z.natural().default(DEFAULT_NETWORK_TIMEOUT_MS),
})
