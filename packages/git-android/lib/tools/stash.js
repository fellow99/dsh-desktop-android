/**
 * The model-facing `git_stash` tool.
 * 112：后端改为真实 `git stash`。
 *
 * @module @dsh-android/git/tools/stash
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderStashEntries } from '../report.js'
import { resolveIdentity } from './commit.js'

const OPS = ['push', 'apply', 'pop', 'drop', 'list']

export function applyGitStashTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_stash',
    description: 'Manage the stash. `op: "push"` (default) stashes the working tree (with `message` as a label); '
      + '`apply`/`pop` restore the entry at `index` (0 = newest, default) with pop also dropping it; `drop` removes '
      + 'it; `list` prints the stash entries, newest first. Fails when `dir` is not a repository; a `dir` outside '
      + 'the session workspace is refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      op: { type: 'string', enum: OPS, description: 'The stash operation. Defaults to "push".' },
      message: { type: 'string', description: 'For op "push": a label for the new stash entry.' },
      index: { type: 'number', description: 'For op "apply"/"pop"/"drop": which entry to use, 0 being the newest. Defaults to 0.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          op: { type: 'string', required: true },
          message: { type: 'string', required: true },
          entries: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.message}\n\n${renderStashEntries(value.entries)}` }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_stash', args, exec)
      try {
        const op = args.op ?? 'push'
        if (!OPS.includes(op)) throw new Error(`git_stash: unknown op "${op}"`)
        const index = args.index ?? 0
        let message = ''
        if (op === 'push') {
          const identity = await resolveIdentity(opened.root, deps.config, {})
          const r = await runGit({
            cwd: opened.root,
            args: ['stash', 'push', ...(args.message !== undefined ? ['-m', String(args.message)] : [])],
            signal: exec.signal,
            timeoutMs: deps.config.networkTimeoutMs,
            env: { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email },
          })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git stash push failed (${r.stderr.trim()})`)
          message = 'Stashed the working tree.'
        } else if (op === 'apply' || op === 'pop' || op === 'drop') {
          const ref = index === 0 ? 'stash@{0}' : `stash@{${index}}`
          const r = await runGit({ cwd: opened.root, args: ['stash', op, ref], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git stash ${op} failed (${r.stderr.trim()})`)
          message = `Stash ${op} of stash@{${index}} succeeded.`
        }
        const list = await runGit({ cwd: opened.root, args: ['stash', 'list'], signal: exec.signal })
        const entries = list.code === 0 && list.stdout.trim() !== ''
          ? list.stdout.split('\n').map((s) => s.trim()).filter(Boolean).reverse()
          : []
        return { root: opened.root, op, message, entries }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
