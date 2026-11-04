/**
 * The model-facing `git_revert` tool.
 * 112：后端改为真实 `git revert`。
 *
 * @module @dsh-android/git/tools/revert
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, headOid, resolveRev } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderPathList, shortOid } from '../report.js'
import { resolveIdentity } from './commit.js'

export function applyGitRevertTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_revert',
    description: 'Undo the commit `ref` by creating a new commit with the inverse change. Full or abbreviated '
      + 'commit ids, branch names, tags, and ancestry syntax work. Fails on conflicts (naming the paths), when '
      + '`ref` cannot be resolved, or when `dir` is not a repository; a `dir` outside the session workspace is '
      + 'refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      ref: { type: 'string', required: true, description: 'The commit to undo.' },
      authorName: { type: 'string', description: 'Author/committer name for the revert commit.' },
      authorEmail: { type: 'string', description: 'Author/committer email for the revert commit.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          ref: { type: 'string', required: true },
          target: { type: 'string', required: true },
          parent: { type: 'string', required: true },
          message: { type: 'string', required: true },
          oid: { type: 'string', required: true },
          paths: { type: 'array', required: true, items: { type: 'string' } },
          author: { type: 'string', required: true },
          identitySource: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Reverted ${shortOid(value.target, 12)} (${value.message}) as new commit ${value.oid}.\n`
          + `Author: ${value.author} (from ${value.identitySource}).\n\n`
          + renderPathList(value.paths, 'No path differed between the commit and its parent, so nothing changed.'),
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_revert', args, exec)
      try {
        const root = opened.root
        const target = await resolveRev(root, args.ref)
        const identity = await resolveIdentity(root, deps.config, { authorName: args.authorName, authorEmail: args.authorEmail })
        const r = await runGit({
          cwd: root, args: ['revert', '--no-edit', target], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs,
          env: { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email },
        })
        const oid = await headOid(root)
        if (r.code === 0) {
          const subject = r.stdout.trim().split('\n').pop()?.split(': ')[0] ?? target.slice(0, 12)
          return { root, ref: args.ref, target, parent: `${target}^`, message: subject, oid: oid ?? '', paths: [], author: `${identity.name} <${identity.email}>`, identitySource: identity.source }
        }
        const stderr = r.stderr.trim()
        if (/CONFLICT/i.test(stderr)) {
          const conflicts = stderr.split('\n').filter((l) => l.includes('CONFLICT')).slice(0, 10)
          throw new Error('@dsh-android/git: the revert conflicted. Resolve the conflicts, then it is usually easiest '
            + 'to continue manually (git_add/git_commit).\n' + conflicts.join('\n'))
        }
        throw new Error(`@dsh-android/git: git revert failed (${stderr.slice(0, 800)})`)
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
