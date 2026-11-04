/**
 * The model-facing `git_merge` tool.
 * 112：后端改为真实 `git merge`。
 *
 * @module @dsh-android/git/tools/merge
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, headOid, currentBranch, resolveRev } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderMergeResult } from '../report.js'
import { resolveIdentity } from './commit.js'

export function applyGitMergeTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_merge',
    description: 'Merge `theirs` into the checked-out branch. `fastForward: false` always creates a merge commit; '
      + '`fastForwardOnly: true` refuses a merge that would need one; `dryRun: true` reports the outcome without '
      + 'writing; `abort: true` aborts an in-progress conflicted merge. On conflicts the call fails with the '
      + 'conflicting paths named. Fails when `dir` is not a repository; a `dir` outside the session workspace is '
      + 'refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      theirs: { type: 'string', description: 'The branch, tag or commit to merge. Required unless `abort` is true.' },
      fastForward: { type: 'boolean', description: 'Allow a fast-forward (the default). Set false to always create a merge commit.' },
      fastForwardOnly: { type: 'boolean', description: 'Refuse a merge that would need a merge commit.' },
      dryRun: { type: 'boolean', description: 'Report the outcome without writing anything. Defaults to false.' },
      abort: { type: 'boolean', description: 'Abort an in-progress conflicted merge.' },
      message: { type: 'string', description: 'Overrides the auto-generated merge commit message.' },
      authorName: { type: 'string', description: 'Author/committer name for the merge commit.' },
      authorEmail: { type: 'string', description: 'Author/committer email for the merge commit.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          theirs: { type: 'string', required: true },
          aborted: { type: 'boolean', required: true },
          oid: { type: 'string', required: true },
          alreadyMerged: { type: 'boolean', required: true },
          fastForward: { type: 'boolean', required: true },
          mergeCommit: { type: 'boolean', required: true },
          tree: { type: 'string', required: true },
          base: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.aborted
          ? `Aborted the merge in progress in ${value.root}: the index and the working tree were restored, and `
            + `HEAD is back at ${value.oid}.`
          : `${renderMergeResult({
            alreadyMerged: value.alreadyMerged,
            fastForward: value.fastForward,
            oid: value.oid,
            tree: value.tree,
          })}${value.base === '' ? '' : `\nMerge base: ${value.base}`}`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_merge', args, exec)
      try {
        const root = opened.root
        if (args.abort === true) {
          const r = await runGit({ cwd: root, args: ['merge', '--abort'], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git merge --abort failed (${r.stderr.trim()})`)
          const oid = await headOid(root)
          return { root, theirs: '', aborted: true, oid: oid ?? '', alreadyMerged: false, fastForward: false, mergeCommit: false, tree: '', base: '' }
        }
        if (args.theirs === undefined || args.theirs === '') throw new Error('git_merge: theirs is required (unless abort)')
        const theirs = await resolveRev(root, args.theirs)
        const ours = await headOid(root) || ''
        let base = ''
        const baseRun = await runGit({ cwd: root, args: ['merge-base', 'HEAD', theirs], signal: exec.signal })
        if (baseRun.code === 0) base = baseRun.stdout.trim()
        if (base === ours) {
          return { root, theirs: args.theirs, aborted: false, oid: ours, alreadyMerged: true, fastForward: false, mergeCommit: false, tree: (await treeOid(root, ours)) ?? '', base }
        }
        const fastForwardable = base !== '' && ours !== ''
        if (args.dryRun === true) {
          return { root, theirs: args.theirs, aborted: false, oid: ours, alreadyMerged: false, fastForward: fastForwardable, mergeCommit: !fastForwardable, tree: (await treeOid(root, ours)) ?? '', base }
        }
        const argv = ['merge']
        if (args.fastForward === false) argv.push('--no-ff')
        if (args.fastForwardOnly === true) argv.push('--ff-only')
        argv.push('--no-edit')
        argv.push(args.theirs)
        const identity = await resolveIdentity(root, deps.config, { authorName: args.authorName, authorEmail: args.authorEmail })
        const r = await runGit({
          cwd: root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs,
          env: { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email },
        })
        const oid = await headOid(root)
        const tree = await treeOid(root, oid)
        if (r.code !== 0) {
          const stderr = r.stderr.trim()
          if (/Already up to date/i.test(stderr)) {
            return { root, theirs: args.theirs, aborted: false, oid: oid ?? '', alreadyMerged: true, fastForward: false, mergeCommit: false, tree: tree ?? '', base }
          }
          if (/CONFLICT/i.test(stderr)) {
            const conflicts = stderr.split('\n').filter((l) => l.includes('CONFLICT')).slice(0, 10)
            throw new Error('@dsh-android/git: the merge conflicted:\n' + conflicts.join('\n'))
          }
          throw new Error(`@dsh-android/git: git merge failed (${stderr.slice(0, 800)})`)
        }
        const fastForward = oid !== ours && base === ours
        return { root, theirs: args.theirs, aborted: false, oid: oid ?? '', alreadyMerged: false, fastForward, mergeCommit: !fastForward, tree: tree ?? '', base }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}

async function treeOid(root, oid) {
  if (!oid) return undefined
  const r = await runGit({ cwd: root, args: ['rev-parse', `${oid}^{tree}`], timeoutMs: 10000 })
  return r.code === 0 ? r.stdout.trim() : undefined
}
