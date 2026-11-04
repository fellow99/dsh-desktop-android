/**
 * The model-facing `git_cherry_pick` tool.
 * 112：后端改为真实 `git cherry-pick`。
 *
 * @module @dsh-android/git/tools/cherry-pick
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, headOid, resolveRev } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { resolveIdentity } from './commit.js'

export function applyGitCherryPickTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_cherry_pick',
    description: 'Apply the change introduced by commit `oid` on top of the current HEAD as a new commit. Full or '
      + 'abbreviated commit ids, tags, branch names, and ancestry syntax work. `dryRun: true` checks that the pick '
      + 'would start cleanly without writing. Fails on conflicts (naming the paths), when `oid` cannot be resolved, '
      + 'or when `dir` is not a repository; a `dir` outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      oid: { type: 'string', required: true, description: 'The commit to pick.' },
      dryRun: { type: 'boolean', description: 'Check whether the pick would succeed, without writing. Defaults to false.' },
      committerName: { type: 'string', description: 'Committer name for the new commit.' },
      committerEmail: { type: 'string', description: 'Committer email for the new commit.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          oid: { type: 'string', required: true },
          committed: { type: 'string', required: true },
          dryRun: { type: 'boolean', required: true },
          committer: { type: 'string', required: true },
          identitySource: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.dryRun
          ? `Dry run: picking ${value.oid} onto the current branch would succeed. Nothing was written.`
          : `Picked ${value.oid} as new commit ${value.committed.slice(0, 12)} `
            + `(committer ${value.committer}, from ${value.identitySource}).`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_cherry_pick', args, exec)
      try {
        const root = opened.root
        const oid = await resolveRev(root, args.oid)
        const identity = await resolveIdentity(root, deps.config, { authorName: args.committerName, authorEmail: args.committerEmail })
        if (args.dryRun === true) {
          const check = await runGit({ cwd: root, args: ['status', '--porcelain'], signal: exec.signal })
          const dirty = check.code === 0 && check.stdout.trim() !== ''
          if (dirty) throw new Error('git_cherry_pick: the working tree has uncommitted changes that would block a clean pick (dry run).')
          return { root, oid, committed: await headOid(root) ?? '', dryRun: true, committer: `${identity.name} <${identity.email}>`, identitySource: identity.source }
        }
        const r = await runGit({
          cwd: root, args: ['cherry-pick', oid], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs,
          env: { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email },
        })
        if (r.code === 0) {
          const committed = await headOid(root)
          return { root, oid, committed: committed ?? '', dryRun: false, committer: `${identity.name} <${identity.email}>`, identitySource: identity.source }
        }
        const stderr = r.stderr.trim()
        if (/CONFLICT/i.test(stderr)) {
          throw new Error('@dsh-android/git: the cherry-pick conflicted. Resolve the conflicts, stage them with '
            + 'git_add, then finish with a new git_commit.\n' + stderr.split('\n').filter((l) => l.includes('CONFLICT')).slice(0, 10).join('\n'))
        }
        throw new Error(`@dsh-android/git: git cherry-pick failed (${stderr.slice(0, 800)})`)
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
