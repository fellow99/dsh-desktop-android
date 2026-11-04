/**
 * The model-facing `git_push` tool.
 * 112：后端改为真实 `git push`。
 *
 * @module @dsh-android/git/tools/push
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, currentBranch } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { scrubUrl } from '../url.js'

export function applyGitPushTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_push',
    description: 'Push the local branch `ref` (default: the checked-out branch) to `remote` (default "origin"), '
      + 'updating `remoteRef` on the remote. `url` overrides the configured remote URL. `force: true` pushes '
      + 'without a fast-forward (discards remote commits — use deliberately). `delete: true` deletes the remote '
      + 'ref instead. Uses the stored credential for the host. Fails when `dir` is not a repository; a `dir` '
      + 'outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      remote: { type: 'string', description: 'Remote to push to. Defaults to "origin".' },
      url: { type: 'string', description: 'Remote URL, overriding the configured one.' },
      ref: { type: 'string', description: 'The local branch or tag to push. Defaults to the checked-out branch.' },
      remoteRef: { type: 'string', description: 'The ref name to update on the remote.' },
      force: { type: 'boolean', description: 'Push even without a fast-forward (discards remote commits). Defaults false.' },
      delete: { type: 'boolean', description: 'Delete the remote ref instead of pushing it. Defaults to false.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          remote: { type: 'string', required: true },
          url: { type: 'string', required: true },
          ref: { type: 'string', required: true },
          forced: { type: 'boolean', required: true },
          deleted: { type: 'boolean', required: true },
          result: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `git_push ${value.deleted ? 'delete ' : ''}${value.forced ? '--force ' : ''}`
          + `${value.ref} -> ${value.remote}${value.url === '' ? '' : ` (${value.url})`}\n\n`
          + `${value.result.ok === true ? 'Push accepted by the server.' : `Push was refused by the server: ${value.result.error ?? ''}`}`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_push', args, exec)
      try {
        const remote = args.remote ?? 'origin'
        const url = args.url ?? ''
        const ref = args.ref ?? (await currentBranch(opened.root)) ?? ''
        if (ref === '') throw new Error('git_push: no ref to push (give `ref` or check out a branch first)')
        const argv = ['push']
        if (args.force === true) argv.push('--force')
        if (args.delete === true) argv.push('--delete')
        if (url !== '') { argv.push(url) } else { argv.push(remote) }
        if (args.delete === true) {
          argv.push(args.remoteRef ?? ref)
        } else if (args.remoteRef !== undefined && args.remoteRef !== ref) {
          argv.push(`${ref}:${args.remoteRef}`)
        } else {
          argv.push(ref)
        }
        const r = await runGit({ cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
        if (r.code !== 0) {
          const stderr = r.stderr.trim()
          if (/could not read (Username|Password)|Authentication failed/i.test(stderr)) {
            throw new Error(deps.credentials.missingMessage(url || remote))
          }
          if (/\[rejected\]|non-fast-forward|protected branch/i.test(stderr) || /\[remote rejected\]/i.test(stderr)) {
            return {
              root: opened.root,
              remote,
              url: url === '' ? '' : scrubUrl(url),
              ref,
              forced: args.force === true,
              deleted: args.delete === true,
              result: { ok: false, error: stderr.slice(0, 600).split('\n')[0] },
            }
          }
          throw new Error(`@dsh-android/git: git push failed (${stderr.slice(0, 800)})`)
        }
        return {
          root: opened.root,
          remote,
          url: url === '' ? '' : scrubUrl(url),
          ref,
          forced: args.force === true,
          deleted: args.delete === true,
          result: { ok: true, refs: { [args.remoteRef ?? ref]: { ok: true } } },
        }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
