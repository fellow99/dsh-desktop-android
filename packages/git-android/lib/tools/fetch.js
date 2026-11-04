/**
 * The model-facing `git_fetch` tool.
 * 112：后端改为真实 `git fetch`。
 *
 * @module @dsh-android/git/tools/fetch
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderFetchResult } from '../report.js'
import { scrubUrl } from '../url.js'
export function applyGitFetchTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_fetch',
    description: 'Fetch objects and remote-tracking refs from a remote without touching the working tree. '
      + '`remote` defaults to "origin"; `url` overrides the configured remote URL. `singleBranch`/`remoteRef` '
      + 'limit to one branch; `depth` limits history; `tags` also fetches tags; `prune` deletes stale '
      + 'remote-tracking branches. Uses the stored credential for the host (Settings → Git 凭据). Fails when '
      + '`dir` is not a repository; a `dir` outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      remote: { type: 'string', description: 'Remote to fetch from. Defaults to "origin".' },
      url: { type: 'string', description: 'Remote URL, overriding the configured one.' },
      remoteRef: { type: 'string', description: 'The branch on the remote to fetch when singleBranch is true.' },
      singleBranch: { type: 'boolean', description: 'Fetch only one branch instead of all of them.' },
      depth: { type: 'number', description: 'Limit how much history is fetched, for example 1 for a shallow fetch.' },
      tags: { type: 'boolean', description: 'Also fetch tags. Defaults to false.' },
      prune: { type: 'boolean', description: 'Delete remote-tracking branches gone on the remote. Defaults to false.' },
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
          result: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderFetchResult(value.result, {
          ...(value.remote === '' ? {} : { remote: value.remote }),
          ...(value.url === '' ? {} : { url: value.url }),
        }),
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_fetch', args, exec)
      try {
        const remote = args.remote ?? 'origin'
        const url = args.url ?? ''
        const argv = ['fetch']
        if (args.prune === true) argv.push('--prune')
        if (args.tags === true) argv.push('--tags')
        if (args.depth !== undefined && !args.singleBranch) argv.push('--depth', String(args.depth))
        if (url !== '') {
          argv.push(url)
          if (args.remoteRef !== undefined) argv.push(args.remoteRef)
        } else {
          argv.push(remote)
          if (args.remoteRef !== undefined && args.singleBranch === true) argv.push(args.remoteRef)
        }
        const r = await runGit({ cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
        if (r.code !== 0) {
          const stderr = r.stderr.trim()
          if (/could not read (Username|Password)|Authentication failed/i.test(stderr)) {
            throw new Error(deps.credentials.missingMessage(url || remote))
          }
          throw new Error(`@dsh-android/git: git fetch failed (${stderr.slice(0, 800)})`)
        }
        const headRun = await runGit({ cwd: opened.root, args: ['rev-parse', '--short', 'FETCH_HEAD'], timeoutMs: 10000 })
        const head = headRun.code === 0 ? headRun.stdout.trim() : ''
        return {
          root: opened.root,
          remote: url === '' ? remote : '',
          url: url === '' ? '' : scrubUrl(url),
          result: { fetchHead: head, fetchHeadDescription: `from ${url === '' ? remote : scrubUrl(url)}`, pruned: [] },
        }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
