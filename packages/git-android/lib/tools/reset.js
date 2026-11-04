/**
 * The model-facing `git_reset` tool: move the current branch pointer or unstage paths.
 * 112：后端改为真实 `git reset`。
 *
 * @module @dsh-android/git/tools/reset
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, headOid, currentBranch } from '../git-exec.js'
import { openRepo, parseStatusZ } from '../toolkit.js'

const RESET_MODES = ['soft', 'mixed', 'hard']

export function applyGitResetTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_reset',
    description: 'Move the current branch to `ref` (default HEAD). `mode: "soft"` moves only the branch pointer, '
      + 'leaving the index and working tree as they are. `mode: "mixed"` (default) also rewrites the index to match '
      + '`ref`. `mode: "hard"` additionally overwrites the working tree with `ref`, DISCARDS uncommitted changes — '
      + 'it is the only mode that loses work. With `paths` and `mode: "mixed"`, only those paths are unstaged. '
      + 'Fails when `dir` is not a repository; a `dir` outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      ref: { type: 'string', description: 'The ref to reset to. Defaults to "HEAD".' },
      mode: { type: 'string', enum: RESET_MODES, description: 'What to reset. Defaults to "mixed".' },
      paths: { type: 'array', items: { type: 'string' }, description: 'With mode "mixed": only unstage these paths.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          ref: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          head: { type: 'string', required: true },
          rows: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Reset (${value.mode}) to ${value.ref}: branch "${value.branch}" now points at ${value.head}.\n\n`
          + `Index / working tree now:\n${value.rows.map((e) => `  ${e.code === '  ' ? '  ' : e.code} ${e.path}`).join('\n') || '  (clean)'}`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_reset', args, exec)
      try {
        const mode = args.mode ?? 'mixed'
        if (!RESET_MODES.includes(mode)) throw new Error(`git_reset: unknown mode "${mode}"`)
        const ref = args.ref ?? 'HEAD'
        const paths = Array.isArray(args.paths) ? args.paths : []
        const argv = ['reset', `--${mode}`]
        if (paths.length > 0) {
          if (mode !== 'mixed') throw new Error('git_reset: paths are only supported with mode "mixed"')
          argv.push(ref, '--')
          argv.push(...paths)
        } else if (ref !== 'HEAD') {
          argv.push(ref)
        } else {
          argv.push(ref)
        }
        const r = await runGit({ cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
        if (r.code !== 0) throw new Error(`@dsh-android/git: git reset failed (${r.stderr.trim()})`)
        const head = await headOid(opened.root)
        const branch = await currentBranch(opened.root)
        const status = await runGit({ cwd: opened.root, args: ['status', '--porcelain=v1', '-z'] })
        const rows = status.code === 0 ? parseStatusZ(status.stdout) : []
        return { root: opened.root, mode, ref, branch: branch ?? '', head: head ?? '', rows }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
