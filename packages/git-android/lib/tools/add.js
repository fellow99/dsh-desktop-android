/**
 * The model-facing `git_add` tool: move work in and out of the index.
 * 112：后端改为真实 `git`（add/rm/reset/check-ignore + status），表层契约不变。
 *
 * @module @dsh-android/git/tools/add
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, currentBranch, headOid } from '../git-exec.js'
import { openRepo, parseStatusZ } from '../toolkit.js'
import { renderPathList } from '../report.js'

/** The index actions this tool exposes. */
const ACTIONS = ['add', 'remove', 'unstage', 'ignored']

export function applyGitAddTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_add',
    description: 'Change the staging area (the index) for `paths`. `action: "add"` stages the current content of '
      + 'each path (a directory stages everything inside it); `action: "remove"` records a deletion in the index '
      + 'for a file that is already gone from the working tree; `action: "unstage"` resets an index entry to HEAD, '
      + 'which unstages a newly added file as well; `action: "ignored"` writes nothing and only reports whether '
      + 'each path is matched by .gitignore. Ignored paths are reported instead of staged unless `force: true`. '
      + 'The report shows the resulting index state for the requested paths. Fails for a path that leaves the '
      + 'repository; a `dir` outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      action: { type: 'string', enum: ACTIONS, description: 'What to do with the index. Defaults to "add".' },
      paths: { type: 'array', items: { type: 'string' }, required: true, description: 'Repository-relative paths to operate on.' },
      force: { type: 'boolean', description: 'With action "add": stage even when .gitignore matches. Defaults to false.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          action: { type: 'string', required: true },
          paths: { type: 'array', required: true, items: { type: 'string' } },
          ignored: { type: 'array', required: true, items: { type: 'string' } },
          rows: { type: 'json', required: true },
          branch: { type: 'string', required: true },
          head: { type: 'string', required: true },
        },
      },
      render: (_args, value) => {
        const ignored = value.ignored.length === 0
          ? ''
          : `\n\nLeft alone because .gitignore matches them (action "add" with force: true overrides this):\n`
            + renderPathList(value.ignored, '')
        const what = value.action === 'ignored'
          ? 'Index unchanged: action "ignored" only reports.'
          : `Index updated for ${value.paths.length} requested path(s).`
        return [{
          type: 'text',
          text: `${what}${ignored}\n\nIndex state now:\n${value.rows.map((e) => `  ${e.code === '  ' ? '  ' : e.code} ${e.path}`).join('\n') || '  (no changes)'}`,
        }]
      },
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_add', args, exec)
      try {
        const action = args.action ?? 'add'
        if (!ACTIONS.includes(action)) {
          throw new Error(`git_add: unknown action "${action}" (expected one of ${ACTIONS.join(', ')})`)
        }
        const paths = args.paths
        if (paths.length === 0) throw new Error('git_add: paths must contain at least one path')
        for (const path of paths) {
          if (path.trim() === '') throw new Error('git_add: paths must not contain an empty path')
        }

        const ignored = []
        for (const path of paths) {
          const check = await runGit({ cwd: opened.root, args: ['check-ignore', '--quiet', path] })
          if (check.code === 0) ignored.push(path)
        }

        if (action === 'add') {
          if (ignored.length > 0 && args.force !== true) {
            throw new Error('git_add: the requested path(s) are ignored by .gitignore and were not staged '
              + `(${ignored.join(', ')}). Retry with force: true to stage them anyway.`)
          }
          const r = await runGit({ cwd: opened.root, args: ['add', ...paths], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git add failed (${r.stderr.trim()})`)
        } else if (action === 'remove') {
          const r = await runGit({ cwd: opened.root, args: ['rm', '--cached', '--', ...paths], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git rm failed (${r.stderr.trim()})`)
        } else if (action === 'unstage') {
          for (const path of paths) {
            const r = await runGit({ cwd: opened.root, args: ['reset', 'HEAD', '--', path], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
            if (r.code !== 0) throw new Error(`@dsh-android/git: git reset failed for ${path} (${r.stderr.trim()})`)
          }
        }

        const status = await runGit({ cwd: opened.root, args: ['status', '--porcelain=v1', '-z', '--', ...paths], signal: exec.signal })
        const rows = status.code === 0 ? parseStatusZ(status.stdout) : []
        const branch = await currentBranch(opened.root)
        const head = await headOid(opened.root)
        return { root: opened.root, action, paths, ignored, rows, branch: branch ?? '', head: head ?? '' }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
