/**
 * The model-facing `git_pull` tool.
 * 112：后端改为真实 `git pull`。
 *
 * @module @dsh-android/git/tools/pull
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, headOid, currentBranch } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { resolveIdentity } from './commit.js'

export function applyGitPullTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_pull',
    description: 'Fetch from a remote and merge (or fast-forward) into the checked-out branch. `remote` defaults '
      + 'to "origin"; `url` overrides the configured one; `ref`/`remoteRef` select the local and remote branch. '
      + '`fastForwardOnly: true` refuses a merge commit. Uses the stored credential for the host. Fails when `dir` '
      + 'is not a repository; a `dir` outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      remote: { type: 'string', description: 'Remote to pull from. Defaults to "origin".' },
      url: { type: 'string', description: 'Remote URL, overriding the configured one.' },
      ref: { type: 'string', description: 'The local branch to merge into. Defaults to the checked-out branch.' },
      remoteRef: { type: 'string', description: 'The branch on the remote to take. Defaults to the tracking branch.' },
      fastForwardOnly: { type: 'boolean', description: 'Refuse a pull that would need a merge commit. Defaults to false.' },
      authorName: { type: 'string', description: 'Author/committer name for a merge commit this pull creates.' },
      authorEmail: { type: 'string', description: 'Author/committer email for a merge commit this pull creates.' },
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
          branch: { type: 'string', required: true },
          before: { type: 'string', required: true },
          after: { type: 'string', required: true },
          updated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.updated
          ? `Pulled from ${value.remote}${value.url === '' ? '' : ` (${value.url})`}: `
            + `${value.branch === '' ? 'HEAD' : `branch "${value.branch}"`} moved ${value.before} -> ${value.after}.`
          : `Already up to date: pulling from ${value.remote} left `
            + `${value.branch === '' ? 'HEAD' : `branch "${value.branch}"`} at ${value.after}. Nothing was merged.`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_pull', args, exec)
      try {
        const remote = args.remote ?? 'origin'
        const url = args.url ?? ''
        const before = await headOid(opened.root)
        const identity = await resolveIdentity(opened.root, deps.config, { authorName: args.authorName, authorEmail: args.authorEmail })
        const argv = ['pull']
        if (args.fastForwardOnly === true) argv.push('--ff-only')
        if (url !== '') { argv.push(url) } else { argv.push(remote) }
        if (args.ref !== undefined) argv.push(args.ref)
        if (args.remoteRef !== undefined) argv.push(args.remoteRef)
        const r = await runGit({
          cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs,
          env: { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email },
        })
        if (r.code !== 0) {
          const stderr = r.stderr.trim()
          if (/Already up to date/i.test(stderr) || r.stdout.includes('Already up to date')) {
            const after = await headOid(opened.root)
            const branch = await currentBranch(opened.root)
            return { root: opened.root, remote, url: url === '' ? '' : url, branch: branch ?? '', before, after, updated: false }
          }
          if (/could not read (Username|Password)|Authentication failed/i.test(stderr)) {
            throw new Error(deps.credentials.missingMessage(url || remote))
          }
          throw new Error(`@dsh-android/git: git pull failed (${stderr.slice(0, 800)})`)
        }
        const after = await headOid(opened.root)
        const branch = await currentBranch(opened.root)
        return { root: opened.root, remote, url: url === '' ? '' : url, branch: branch ?? '', before, after, updated: before !== after }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
