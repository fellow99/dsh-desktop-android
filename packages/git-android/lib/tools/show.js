/**
 * The model-facing `git_show` tool.
 * 112：后端改为真实 `git show`（cat-file 判定类型 + show 输出）。
 *
 * @module @dsh-android/git/tools/show
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit } from '../git-exec.js'
import { openRepo } from '../toolkit.js'

export function applyGitShowTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_show',
    description: 'Show the object `ref` names — a commit, tag, tree or blob. `content: false` returns only the '
      + 'metadata/change list for a commit; `paths` limits which changed paths are listed. Full or abbreviated '
      + 'object ids work, as do branch and tag names and ancestry syntax such as "HEAD~1". Fails when `ref` cannot '
      + 'be resolved or `dir` is not a repository; a `dir` outside the session workspace is refused with an '
      + 'escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      ref: { type: 'string', required: true, description: 'The commit, tag, tree or blob to show.' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Pathspecs limiting changed paths for a commit.' },
      content: { type: 'boolean', description: 'Print the content of the changed paths (default true).' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          ref: { type: 'string', required: true },
          oid: { type: 'string', required: true },
          type: { type: 'string', required: true },
          text: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.ref} resolves to ${value.type} ${value.oid}\n\n${value.text}`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_show', args, exec)
      try {
        const typeRun = await runGit({ cwd: opened.root, args: ['cat-file', '-t', args.ref], signal: exec.signal })
        if (typeRun.code !== 0) throw new Error(`@dsh-android/git: "${args.ref}" cannot be resolved (${typeRun.stderr.trim()})`)
        const type = typeRun.stdout.trim()
        const oidRun = await runGit({ cwd: opened.root, args: ['rev-parse', args.ref], signal: exec.signal })
        const oid = oidRun.code === 0 ? oidRun.stdout.trim() : args.ref
        const paths = Array.isArray(args.paths) ? args.paths : []
        const showRun = await runGit({
          cwd: opened.root,
          args: ['show', '--stat', '--format=fuller', args.ref, ...(paths.length > 0 ? ['--', ...paths] : [])],
          signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs,
        })
        let text = showRun.code === 0 ? showRun.stdout.trim() : '(no content)'
        if (args.content === false && type === 'commit') {
          // 只保留元数据+变更清单，略去正文 diff
          const lines = text.split('\n')
          const idx = lines.findIndex((l) => l.startsWith('diff --git') || l.startsWith('  '))
          text = idx >= 0 ? lines.slice(0, idx).join('\n').trim() : text
        }
        return { root: opened.root, ref: args.ref, oid, type, text }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
