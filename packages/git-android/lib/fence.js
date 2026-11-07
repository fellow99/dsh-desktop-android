/**
 * The repository fence: the single decision point that decides whether one git operation may
 * touch a given repository, and the escalation ladder that lets a user approve an exception.
 *
 * The vocabulary, the strictly-wider ladder, and the fail-closed approval sequence belong to
 * `@deepseek-ai/dsh-sandbox`; this module only adapts them to the git tool, mirroring
 * `@deepseek-ai/dsh-tool-fs`'s `FsMutationSandbox` so every file-effect family in this shell
 * escalates identically and a denial reads the same to the model.
 *
 * 112-cli-integration（FR-112-4 修订）：isomorphic-git 的 `fs` 适配层已删除，`open()` 只返回
 * 仓库根与策略；`isWithin` 随围栏保留（`git` passthrough 用同一个谓词裁决 `-C` 越界）。
 *
 * Why the fence is needed at all: `git` runs as an independent process, so the `fs-sandbox`'s
 * per-call `checkedTarget` never sees its `.git` writes — the containment check therefore
 * happens once, on the repository root, before any I/O:
 *
 * > a repository inside the session workspace runs freely; a repository outside it is refused
 * > with the shared denial marker until the user approves a one-shot escalation.
 *
 * See `../dsh-desktop-hos/docs/204-插件-GIT.md` §8 — the narrowed fence is an accepted, documented trade-off.
 *
 * @module @dsh-android/git/fence
 */

import { FsError } from '@deepseek-ai/dsh-fs'
import {
  ESCALATION_TARGETS,
  approveEscalation,
  canonicalPath,
  escalationHintMarker,
  sandboxDenialMarker,
  validateEscalationArgs,
} from '@deepseek-ai/dsh-sandbox'
import { normalize, resolve, sep } from 'node:path'

/** A path segment that traverses to a parent, in either separator dialect. */
const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

/**
 * Whether a candidate path lies inside a root, on a path-segment boundary.
 * @param root - absolute root path.
 * @param candidate - absolute candidate path.
 * @returns true when `candidate` is `root` or below it.
 */
export function isWithin(root, candidate) {
  // Windows paths compare case-insensitively; folding keeps a lexically-correct path from being
  // refused as if it were outside (fail-closed, but a false rejection is still a bug).
  const fold = value => (process.platform === 'win32' ? value.toLowerCase() : value)
  const base = fold(normalize(resolve(root)))
  const other = fold(normalize(resolve(candidate)))
  if (base === other) return true
  return other.startsWith(base.endsWith(sep) ? base : base + sep)
}

/**
 * Per-call memory of a resolved sandbox policy, keyed on the tool call's own `exec` object.
 * See {@link GitRepositoryFence.resolvePolicy} for why resolving twice in one call is a defect.
 * @type {WeakMap<object, object | undefined>}
 */
const resolvedPolicies = new WeakMap()

/**
 * The calling agent's per-session workspace cwd, or `undefined` for an agent-less call (the
 * backend then applies its own default).
 * @param exec - the tool-execution context; only its optional `agent` is read.
 * @param requestedPath - the path the provider will resolve; parent traversal makes a
 *   symlinked cwd's filesystem identity observable.
 * @returns the session cwd, canonicalized only on that traversal case.
 */
function sessionCwd(exec, requestedPath) {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  return canonicalPath(cwd)
}

/**
 * An opened repository: its root and the policy the call runs under.
 * @typedef {object} OpenedRepository
 * @property {string} root - absolute repository root in the host process's filesystem.
 * @property {object | undefined} policy - the sandbox policy stamped on the call, when a confining backend is mounted.
 */

/**
 * The escalation API for the git tool: advertisement gating, per-call policy resolution, the
 * one-approved wider retry, denial-marker mapping, and repository-root vetting.
 */
export class GitRepositoryFence {
  /** @param ctx - the plugin context; `ctx.fs` decides whether escalation is advertised. */
  constructor(ctx) {
    this.ctx = ctx
    const defaultMode = ctx.fs.sandboxMode
    // The targets are the closed vocabulary, not "what is wider than the deployment default":
    // a session switched below that default would otherwise be confined with no advertised lever.
    this.escalationModes = defaultMode === undefined ? [] : ESCALATION_TARGETS
    // `ctx.get` rather than the property proxy: this plugin does not inject `sandboxPolicy`,
    // and the proxy is topology-sensitive.
    this.policy = defaultMode === undefined ? undefined : ctx.get('sandboxPolicy')
    if (defaultMode !== undefined && this.policy === undefined) {
      throw new Error('@dsh-android/git: the mounted filesystem confines but ctx.sandboxPolicy is missing')
    }
  }

  /**
   * The escalation parameter specs, or `{}` when no confining backend is mounted.
   *
   * Advertised on the repository-touching tool rather than omitted: read-shaped operations
   * (`status` refreshes the index, `fetch` writes objects) mutate `.git` too, and the fence is
   * the only containment `git`'s own process writes get.
   * @returns the two parameter specs to spread into the tool's `parameters`.
   */
  escalationFields() {
    if (this.escalationModes.length === 0) return {}
    return {
      sandbox_permissions: {
        type: 'string',
        enum: [...this.escalationModes],
        description: 'The wider sandbox mode this git operation needs. Only valid as a one-shot retry '
          + 'of an operation the sandbox just denied; requires justification and user approval.',
      },
      justification: {
        type: 'string',
        description: 'Required with sandbox_permissions: one sentence for the user explaining '
          + 'why this git operation needs a repository outside the session workspace.',
      },
    }
  }

  /**
   * The policy to stamp onto this call: an approved escalation grant (a strictly wider mode
   * resolved through the approval channel BEFORE anything executes), else the session's
   * standing mode.
   * @param toolName - the calling tool's name, for the approval audit trail.
   * @param args - the call's escalation arguments.
   * @param exec - the tool-execution context (agent, callId, signal).
   * @returns the policy for this call, or `undefined` for an unsandboxed backend.
   */
  async resolvePolicy(toolName, args, exec) {
    // One call resolves its policy exactly once. Without this memo the denial path resolves it
    // twice: `open()` resolves the policy and only then may refuse, while the tool's catch asks
    // again for a policy to report with — so a denied call would put a **second** approval panel
    // in front of the user, and a second refusal would replace the `[sandbox: …]` marker with a
    // generic error. The memo is keyed on `exec`, which is a fresh object per tool call, so it is
    // per-call by construction and cannot leak a grant into the next call.
    const memoized = resolvedPolicies.get(exec)
    if (memoized !== undefined) return memoized

    validateEscalationArgs(args.sandbox_permissions, args.justification)
    const standingPolicy = this.policy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
    if (args.sandbox_permissions === undefined || args.justification === undefined) {
      resolvedPolicies.set(exec, standingPolicy)
      return standingPolicy
    }
    if (this.escalationModes.length === 0) {
      throw new Error('sandbox_permissions is not available in this composition (no sandboxing filesystem to escalate)')
    }
    const approvedMode = await approveEscalation(
      {
        requestedMode: args.sandbox_permissions,
        justification: args.justification,
        effectiveMode: standingPolicy.mode,
        subject: 'operation',
      },
      {
        approver: this.ctx.get('approval'),
        agent: exec.agent,
        callId: exec.callId,
        toolName,
        signal: exec.signal,
      },
    )
    const resolved = { ...standingPolicy, mode: approvedMode }
    resolvedPolicies.set(exec, resolved)
    return resolved
  }

  /**
   * Map a thrown provider error for the model. A `FS_SANDBOX_DENIED` becomes an `FsError`
   * whose text is the shared `[sandbox: …]` denial marker plus the same-turn escalation hint,
   * so the model can retry with the fields the tool advertises; the structured code is
   * preserved because `ToolRuntime` populates `result.error` only for `HarnessError` instances.
   * @param error - the error thrown by a git operation.
   * @param policy - the policy stamped onto the call; names the mode in the marker.
   * @returns the marker `FsError` for a sandbox denial, else the original error.
   */
  mapError(error, policy) {
    const effective = policy ?? error?.policy
    if (error instanceof FsError && error.code === 'FS_SANDBOX_DENIED') {
      return new FsError(
        `${sandboxDenialMarker(effective?.mode ?? 'unknown')}\n${escalationHintMarker('operation')}`,
        'FS_SANDBOX_DENIED',
        { cause: error },
      )
    }
    return error
  }

  /**
   * Vet a requested repository directory and open it for this call.
   *
   * Resolution goes through `ctx.fs` so the path means the same thing it means everywhere else
   * in dsh (session cwd, backend identity), and `processPath` yields the absolute path the host
   * process can hand to `git`. Containment is then decided against the workspace root the policy
   * names — or skipped entirely under `danger-full-access`, which is exactly what an approved
   * escalation grants.
   *
   * @param toolName - the calling tool's name, for the approval audit trail.
   * @param args - the call's escalation arguments.
   * @param exec - the tool-execution context.
   * @param requestedDir - the directory the model named.
   * @returns the opened repository root and policy.
   * @throws FsError with code `FS_SANDBOX_DENIED` when a confining backend denies the root.
   */
  async open(toolName, args, exec, requestedDir) {
    const policy = await this.resolvePolicy(toolName, args, exec)
    const cwd = policy?.workspaceRoot ?? sessionCwd(exec, requestedDir)
    const target = await this.ctx.fs.resolve(requestedDir, {
      ...cwd === undefined ? {} : { cwd },
      signal: exec.signal,
    })
    const root = this.ctx.fs.processPath(target)

    const workspaceRoot = policy?.workspaceRoot
    if (policy !== undefined && policy.mode !== 'danger-full-access'
      && workspaceRoot !== undefined && !isWithin(workspaceRoot, root)) {
      const refusal = new FsError(
        `@dsh-android/git: the repository "${root}" is outside the session workspace `
        + `"${workspaceRoot}", so this git operation was refused.`,
        'FS_SANDBOX_DENIED',
      )
      // Carry the policy on the refusal so a catch that only has the error can still name the
      // denying mode instead of printing "unknown".
      refusal.policy = policy
      throw refusal
    }

    return { root, policy }
  }
}
