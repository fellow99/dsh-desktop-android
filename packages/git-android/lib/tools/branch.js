/**
 * The model-facing `git_branch` tool: work with branches.
 * 112：后端改为真实 `git branch`。
 *
 * @module @dsh-android/git/tools/branch
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, headOid, currentBranch } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderBranches } from '../report.js'

const ACTIONS = ['list', 'create', 'delete', 'rename']
const NEEDS_NAME = new Set(['create', 'delete', 'rename'])

export function applyGitBranchTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_branch',
    description: 'Work with branches. `action: "list"` (the default) prints the local branches with the current '
      + 'one marked, or the remote-tracking branches of `remote` when that is given. `action: "create"` creates '
      + '`name` at `from` (a branch, tag, commit id or "HEAD"; default HEAD); `checkout: true` switches to it '
      + 'right away. `action: "delete"` deletes the branch `name` (never the checked-out one). `action: "rename"` '
      + 'renames `oldName` to `name`. Fails when `dir` is not a repository; a `dir` outside the session workspace '
      + 'is refused with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      action: { type: 'string', enum: ACTIONS, description: 'What to do. Defaults to "list".' },
      name: { type: 'string', description: 'Branch name to create, delete or rename to.' },
      oldName: { type: 'string', description: 'For action "rename": the branch to rename.' },
      from: { type: 'string', description: 'For action "create": the start point. Defaults to "HEAD".' },
      checkout: { type: 'boolean', description: 'For action "create": switch to the new branch. Defaults to false.' },
      remote: { type: 'string', description: 'For action "list": list the remote-tracking branches of this remote.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          action: { type: 'string', required: true },
          current: { type: 'string', required: true },
          remote: { type: 'string', required: true },
          branches: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderBranches(value.branches, {
          current: value.current === '' ? undefined : value.current,
          ...(value.remote === '' ? {} : { remote: value.remote }),
        }),
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_branch', args, exec)
      try {
        const action = args.action ?? 'list'
        if (!ACTIONS.includes(action)) throw new Error(`git_branch: unknown action "${action}"`)
        if (NEEDS_NAME.has(action) && (args.name === undefined || args.name.trim() === '')) {
          throw new Error(`git_branch: action "${action}" requires name`)
        }
        if (action === 'create') {
          const start = args.from ?? 'HEAD'
          if (args.checkout === true) {
            const r = await runGit({ cwd: opened.root, args: ['checkout', '-b', args.name, start], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
            if (r.code !== 0) throw new Error(`@dsh-android/git: git checkout -b failed (${r.stderr.trim()})`)
          } else {
            const r = await runGit({ cwd: opened.root, args: ['branch', args.name, start], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
            if (r.code !== 0) throw new Error(`@dsh-android/git: git branch failed (${r.stderr.trim()})`)
          }
        } else if (action === 'delete') {
          const r = await runGit({ cwd: opened.root, args: ['branch', '-D', args.name], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git branch -D failed (${r.stderr.trim()})`)
        } else if (action === 'rename') {
          if (args.oldName === undefined) throw new Error('git_branch: action "rename" requires oldName')
          const r = await runGit({ cwd: opened.root, args: ['branch', '-m', args.oldName, args.name], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git branch -m failed (${r.stderr.trim()})`)
        }
        const current = await currentBranch(opened.root)
        const remote = args.remote ?? ''
        let branches
        if (action === 'list' && remote !== '') {
          const r = await runGit({ cwd: opened.root, args: ['branch', '-r', `--list`, `${remote}/*`] })
          branches = r.code === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^\*\s*/, '')) : []
        } else if (action === 'list') {
          const r = await runGit({ cwd: opened.root, args: ['branch', '--format=%(refname:short)'] })
          branches = r.code === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : []
        } else {
          const r = await runGit({ cwd: opened.root, args: ['branch', '--format=%(refname:short)'] })
          branches = r.code === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : []
        }
        return { root: opened.root, action, current: current ?? '', remote, branches }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
