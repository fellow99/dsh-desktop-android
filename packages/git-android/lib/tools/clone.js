/**
 * The model-facing `git_clone` tool: fetch a remote repository into a local working tree.
 * 112：后端改为真实 `git clone`（经 credential.helper=store 处理 HTTP 认证）。
 *
 * @module @dsh-android/git/tools/clone
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { runGit, currentBranch, headOid } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { scrubUrl, scrubErrorUrl } from '../url.js'

export function applyGitCloneTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_clone',
    description: 'Clone a remote repository into `dir` (the working tree is created there). `url` is the remote '
      + 'URL, for example "https://git.example.com/team/project.git"; only http(s) transport is available (no SSH '
      + 'client). `depth` limits history (use 1 for a shallow clone of a large repository), `singleBranch` fetches '
      + 'only `ref`, `noTags` skips tags. Public repositories need no credentials; for a private one, store '
      + '"<username>:<password>" under GIT_CREDENTIAL_<HOST> first (Settings → Git 凭据, or $DSH_HOME/.credentials.yaml) '
      + '— a missing or refused credential is reported with that exact name instead of a bare 401. A `dir` outside '
      + 'the session workspace is refused with an escalation hint. A clone that exceeds the network timeout is '
      + 'aborted and reports how long it ran.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Destination directory for the clone (the working tree). Created when missing; expected to be '
          + 'empty. Resolved against the session workspace.',
      },
      url: { type: 'string', required: true, description: 'Remote repository URL.' },
      ref: { type: 'string', description: 'Branch or tag to check out. Defaults to the remote\'s default branch.' },
      depth: { type: 'number', description: 'Number of commits to fetch per ref. Omit for the complete history; use 1 for a shallow clone.' },
      singleBranch: { type: 'boolean', description: 'Fetch only the branch named by `ref` (or the default branch) instead of every branch.' },
      noTags: { type: 'boolean', description: 'Do not fetch tags. Defaults to false.' },
      remote: { type: 'string', description: 'Name for the created remote. Defaults to "origin".' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          url: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          head: { type: 'string', required: true },
          remote: { type: 'string', required: true },
          depth: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Cloned ${value.url} into ${value.root} as remote "${value.remote}".\n`
          + `Checked out ${value.branch === '' ? 'a detached HEAD' : `branch "${value.branch}"`} at ${value.head.slice(0, 10)}.\n`
          + `History: ${value.depth === 0 ? 'complete' : `shallow, ${value.depth} commit(s) per ref`}.`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_clone', args, exec, args.dir)
      const started = Date.now()
      try {
        if (typeof args.url !== 'string' || args.url === '') throw new Error('git_clone: url is required')
        if (!/^https?:\/\//i.test(args.url)) {
          throw new Error('git_clone: only http(s) remote URLs are supported in this deployment (no native git '
            + 'client and no SSH); got "' + scrubUrl(args.url) + '".')
        }
        mkdirSync(dirname(opened.root), { recursive: true })
        const argv = ['clone']
        if (args.depth !== undefined) argv.push('--depth', String(args.depth))
        if (args.singleBranch === true) argv.push('--single-branch')
        if (args.noTags === true) argv.push('--no-tags')
        if (args.ref !== undefined) argv.push('--branch', args.ref)
        argv.push('--origin', args.remote ?? 'origin')
        argv.push(args.url, opened.root)
        const result = await runGit({
          cwd: dirname(opened.root),
          args: argv,
          signal: exec.signal,
          timeoutMs: deps.config.networkTimeoutMs,
        })
        if (result.code !== 0) {
          const stderr = (result.stderr || result.stdout || '').trim()
          if (/could not read (Username|Password)|Authentication failed/i.test(stderr)) {
            const msg = deps.credentials.missingMessage(args.url)
            throw new Error(msg)
          }
          throw new Error(`@dsh-android/git: git clone failed after ${Math.round((Date.now() - started) / 1000)}s:\n`
            + `${stderr.slice(0, 800)}`)
        }
        const branch = await currentBranch(opened.root)
        const head = await headOid(opened.root)
        return {
          root: opened.root,
          url: scrubUrl(args.url),
          branch: branch ?? '',
          head: head ?? '',
          remote: args.remote ?? 'origin',
          depth: args.depth ?? 0,
        }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(scrubErrorUrl(error, args.url))
      }
    },
  }))
}
