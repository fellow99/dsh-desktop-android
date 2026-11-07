/**
 * Host half of `@dsh-android/git`: the model-facing git tool.
 *
 * 112-cli-integration（FR-112-4 修订）：21 个按动词封装的工具精简为单个 `git` passthrough。
 * Scope of this file is **assembly only** — it constructs the two collaborators the tool shares
 * and hands them to the one registration function:
 *
 * - `GitRepositoryFence` — resolves and vets the repository root once per call, and carries the
 *   sandbox-escalation ladder for repositories outside the session workspace.
 * - `GitCredentials` — resolves HTTP credentials from the credential store, so no tool parameter
 *   ever carries a secret, and keeps git's own `.git-credentials` in step (pre-mirror).
 *
 * `inject` names only services this file itself needs. `credentials` and `sandboxPolicy` are read
 * through `ctx.get(...)` instead, deliberately: a host-plane row that injects a service which
 * never appears stays pending forever, and that failure mode takes the whole plugin tree down
 * (see `profiles/desktop/cordis.patch.yml` for the same reasoning applied to `open-in-app`).
 *
 * Named exports only — a default export makes the Loader discard `inject`.
 *
 * @module @dsh-android/git
 */

import { Config } from './config.js'
import { GitCredentials } from './auth.js'
import { GitRepositoryFence } from './fence.js'
import { applyGitTool } from './tools/git.js'

/** Plugin name used by loader diagnostics and the profile row. */
export const name = '@dsh-android/git'

/** Services required before the tool registers. */
export const inject = ['tools', 'fs']

export { Config }

/**
 * Register the single `git` passthrough tool.
 * @param ctx - the plugin context; registrations are effects scoped to it.
 * @param config - the resolved plugin config (schemastery filled every default).
 */
export function apply(ctx, config) {
  const fence = new GitRepositoryFence(ctx)
  const credentials = new GitCredentials(ctx)
  const deps = { fence, credentials, config }

  applyGitTool(ctx, deps)

  // The run-time self-report channel: the inspector cannot reach `ctx` (no host handle is
  // published), so this line in hilog is what proves the row activated on a device.
  console.log('[dsh-android] @dsh-android/git: registered 1 tool (git passthrough)')
}
