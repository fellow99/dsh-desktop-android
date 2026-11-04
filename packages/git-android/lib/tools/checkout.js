/**
 * The model-facing `git_checkout` tool: switch branches or restore paths.
 * 112：后端改为真实 `git checkout` / `git restore`。
 *
 * @module @dsh-android/git/tools/checkout
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, headOid, currentBranch } from '../git-exec.js'
import { openRepo } from '../toolkit.js'

export function applyGitCheckoutTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_checkout',
    description: 'Switch the working tree to `ref` (a branch name, a tag, or a full or abbreviated commit id; '
      + 'ancestry syntax such as HEAD~1 works). Or, when `paths` is given — restore just those paths from `ref` '
      + 'and leave HEAD untouched. A branch name switches to that branch; a commit id leaves HEAD detached. Local '
      + 'modifications that the checked-out content would overwrite make the call fail with the conflicting path '
      + 'named, unless `force: true`. Fails when `ref` cannot be resolved or `dir` is not a repository; a `dir` '
      + 'outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      ref: { type: 'string', required: true, description: 'What to check out: "HEAD", a branch, a tag, or a commit id.' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Restore only these paths and keep HEAD where it is.' },
      force: { type: 'boolean', description: 'Overwrite local modifications instead of failing. Defaults to false.' },
      track: { type: 'boolean', description: 'When switching to a remote branch, configure it as the tracking branch. Defaults to true.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          ref: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          head: { type: 'string', required: true },
          restored: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.restored.length > 0
          ? `Restored ${value.restored.length} path(s) from ${value.ref}: ${value.restored.join(', ')}.\n`
            + `HEAD is unchanged at ${value.head}${value.branch === '' ? ' (detached)' : ` on branch "${value.branch}"`}.`
          : `Checked out ${value.ref} at ${value.head}. HEAD is now `
            + `${value.branch === '' ? 'detached' : `on branch "${value.branch}"`}.`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_checkout', args, exec)
      try {
        const paths = Array.isArray(args.paths) ? args.paths : []
        if (paths.length > 0) {
          const argv = ['restore', '--source', args.ref, '--staged', '--worktree', '--', ...paths]
          if (args.force === true) argv.push('--force')
          const r = await runGit({ cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git restore failed (${r.stderr.trim()})`)
          const head = await headOid(opened.root)
          const branch = await currentBranch(opened.root)
          return { root: opened.root, ref: args.ref, branch: branch ?? '', head: head ?? '', restored: paths }
        }
        const argv = ['checkout']
        if (args.force === true) argv.push('--force')
        if (args.track === false) argv.push('--no-track')
        argv.push(args.ref)
        const r = await runGit({ cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
        if (r.code !== 0) throw new Error(`@dsh-android/git: git checkout failed (${r.stderr.trim()})`)
        const head = await headOid(opened.root)
        const branch = await currentBranch(opened.root)
        return { root: opened.root, ref: args.ref, branch: branch ?? '', head: head ?? '', restored: [] }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
