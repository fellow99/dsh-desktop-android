/**
 * The model-facing `git_log` tool: walk commit history.
 * 112：后端改为真实 `git log`，天然支持缩写 oid / `HEAD~1` 祖先语法（isomorphic-git 不支持的能力）。
 *
 * @module @dsh-android/git/tools/log
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, resolveRev } from '../git-exec.js'
import { openRepo, parseLogRecords } from '../toolkit.js'
import { renderLog } from '../report.js'

export function applyGitLogTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_log',
    description: 'List commit history, newest first, with each commit\'s short id, author, date, parent count and '
      + 'subject. `ref` chooses where to start (a branch, tag, commit id, or "HEAD"); abbreviated ids and ancestry '
      + 'syntax such as "HEAD~1" work. `depth` limits how many commits are returned; omit it for the full history. '
      + '`path` follows the history of one file; `follow: true` keeps listing across renames. A repository with no '
      + 'commit yet is reported as such. Fails when `ref` cannot be resolved or `dir` is not a repository; a `dir` '
      + 'outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      ref: { type: 'string', description: 'Commit, branch or tag to start from; full or abbreviated oid works. Defaults to "HEAD".' },
      depth: { type: 'number', description: 'Maximum number of commits to return. Omit for the complete history.' },
      path: { type: 'string', description: 'Repository-relative file path whose history to follow.' },
      follow: { type: 'boolean', description: 'With `path`: keep following the file across renames. Defaults to false.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          ref: { type: 'string', required: true },
          count: { type: 'number', required: true },
          commits: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderLog(value.commits, { ref: value.ref, root: value.root }) }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_log', args, exec)
      try {
        const requested = args.ref ?? 'HEAD'
        const ref = await resolveRev(opened.root, requested)
        const logRun = await runGit({
          cwd: opened.root,
          args: ['log', '--pretty=raw', ...(args.depth !== undefined ? ['-n', String(args.depth)] : []), ...(args.path !== undefined ? ['--', args.path] : [])],
          signal: exec.signal,
          timeoutMs: deps.config.networkTimeoutMs,
        })
        if (logRun.code !== 0) throw new Error(`@dsh-android/git: git log failed (${logRun.stderr.trim()})`)
        const commits = parseLogRecords(logRun.stdout)
        return { root: opened.root, ref, count: commits.length, commits }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
