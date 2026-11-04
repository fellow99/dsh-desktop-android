/**
 * The model-facing `git_commit` tool, and the identity/revision resolution the other
 * commit-creating tools share. 112：后端改为真实 `git`。
 *
 * @module @dsh-android/git/tools/commit
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, currentBranch, headOid } from '../git-exec.js'
import { openRepo } from '../toolkit.js'

/**
 * 解析一次提交的作者/提交者身份（真实 git config）。
 * 优先级：参数 authorName/authorEmail → 仓库 user.name/user.email → 插件默认（占位）。
 * @param {string} root - 仓库根。
 * @param {object} config - 插件配置默认。
 * @param {{authorName?: string, authorEmail?: string}} [args]
 * @returns {{ name: string, email: string, source: string }}
 */
export async function resolveIdentity(root, config, args = {}) {
  const read = async (key) => {
    const r = await runGit({ cwd: root, args: ['config', '--get', key], timeoutMs: 10000 })
    return r.code === 0 && r.stdout.trim() !== '' ? r.stdout.trim() : undefined
  }
  const repoName = await read('user.name')
  const repoEmail = await read('user.email')
  const overridden = args.authorName !== undefined || args.authorEmail !== undefined
  const name = args.authorName ?? repoName ?? config.authorName
  const email = args.authorEmail ?? repoEmail ?? config.authorEmail
  const source = overridden
    ? 'the tool arguments'
    : repoName !== undefined || repoEmail !== undefined
      ? 'this repository\'s user.name / user.email'
      : 'the plugin config default (this repository has no user.name / user.email — set them with git_config)'
  return { name, email, source }
}

/**
 * 解析一个版本（真实 git；天然支持缩写 oid 与祖先语法 HEAD~1）。
 * @param {string} root - 仓库根。
 * @param {string} revision - 分支/标签/oid。
 * @returns {{ ref: string, oid: string }}
 */
export async function resolveRevision(root, revision) {
  const r = await runGit({ cwd: root, args: ['rev-parse', '--verify', `${revision}^{commit}`], timeoutMs: 10000 })
  if (r.code !== 0) {
    throw new Error(`@dsh-android/git: "${revision}" cannot be resolved in ${root} (${String(r.stderr).trim()}). `
      + 'Use a branch name, a tag, "HEAD", or a commit object id.')
  }
  return { ref: revision, oid: r.stdout.trim() }
}

export function applyGitCommitTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_commit',
    description: 'Record the staged changes in `dir` as a new commit. Only what is staged is committed, so run '
      + '`git_add` first; `all: true` stages every modified and new file first for convenience, but it does not '
      + 'record deletions (use `git_add` with action "remove" for a deleted file). `message` becomes the commit '
      + 'message. `amend: true` replaces the previous commit instead of adding a new one. The identity is taken '
      + 'from `authorName`/`authorEmail` when given, else from this repository\'s user.name/user.email, else from '
      + 'the plugin defaults — the report names the source used. Fails when there is nothing staged; a `dir` '
      + 'outside the session workspace is refused with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      message: { type: 'string', required: true, description: 'Commit message. Required even with `amend`.' },
      all: { type: 'boolean', description: 'Stage every modified or new file before committing. Deletions are not staged by this option. Defaults to false.' },
      amend: { type: 'boolean', description: 'Replace the commit HEAD currently points at instead of adding a new commit. Defaults to false.' },
      authorName: { type: 'string', description: 'Author name for this commit, overriding the config value.' },
      authorEmail: { type: 'string', description: 'Author email for this commit, overriding the config value.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          oid: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          subject: { type: 'string', required: true },
          author: { type: 'string', required: true },
          identitySource: { type: 'string', required: true },
          amended: { type: 'boolean', required: true },
          stagedFirst: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.amended ? 'Amended' : 'Created'} commit ${value.oid.slice(0, 12)}`
          + `${value.branch === '' ? ' on a detached HEAD' : ` on branch "${value.branch}"`}.\n`
          + `Subject: ${value.subject}\n`
          + `Author:  ${value.author} (from ${value.identitySource})\n`
          + `${value.stagedFirst ? 'Every modified or new file was staged first (deletions are not staged by `all`).\n' : ''}`
          + 'Push it with git_push when the remote should have it.',
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_commit', args, exec)
      try {
        if (typeof args.message !== 'string' || args.message.trim() === '') {
          throw new Error('git_commit: message must be a non-empty commit message')
        }
        const stagedFirst = args.all === true
        if (stagedFirst) {
          const r = await runGit({ cwd: opened.root, args: ['add', '-A', '.'], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git add --all failed (${r.stderr.trim()})`)
        }
        const identity = await resolveIdentity(opened.root, deps.config, args)
        const commitArgs = ['commit']
        if (args.amend === true) commitArgs.push('--amend')
        commitArgs.push('-m', args.message)
        const commitRun = await runGit({
          cwd: opened.root,
          args: commitArgs,
          signal: exec.signal,
          timeoutMs: deps.config.networkTimeoutMs,
          env: {
            GIT_AUTHOR_NAME: identity.name,
            GIT_AUTHOR_EMAIL: identity.email,
            GIT_COMMITTER_NAME: identity.name,
            GIT_COMMITTER_EMAIL: identity.email,
          },
        })
        if (commitRun.code !== 0) {
          const msg = commitRun.stderr.trim()
          if (/nothing to commit/i.test(msg)) {
            throw new Error('git_commit: there is nothing staged. Run git_add first (or use all: true), then retry.')
          }
          throw new Error(`@dsh-android/git: git commit failed (${msg})`)
        }
        const oid = await headOid(opened.root)
        if (oid === '') throw new Error('git_commit: commit created but HEAD could not be read')
        const branch = await currentBranch(opened.root)
        return {
          root: opened.root,
          oid,
          branch: branch ?? '',
          subject: args.message.split('\n')[0],
          author: `${identity.name} <${identity.email}>`,
          identitySource: identity.source,
          amended: args.amend === true,
          stagedFirst,
        }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
