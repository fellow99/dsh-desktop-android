/**
 * The model-facing `git_remote` tool: inspect and configure remotes, and probe a server.
 * 112：后端改为真实 `git remote`（list/add/delete）+ `git ls-remote`（probe）。
 *
 * @module @dsh-android/git/tools/remote
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { dirname } from 'node:path'
import { runGit, listRemotes } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderRemotes, renderServerRefs } from '../report.js'
import { scrubUrl } from '../url.js'

const ACTIONS = ['list', 'add', 'delete', 'refs', 'info']

export function applyGitRemoteTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_remote',
    description: 'Inspect and configure remotes, and probe a server without cloning. `action: "list"` (the default) '
      + 'prints the configured remotes. `action: "add"` (needs `name` and `url`) configures a remote, overwriting '
      + 'an existing one when `force: true`. `action: "delete"` (needs `name`) removes it. `action: "refs"` lists '
      + 'the server\'s refs for `url` (or a configured remote) without writing locally; `prefix` limits refs. '
      + '`action: "info"` reports the server\'s git protocol version and capabilities. Probe actions need no local '
      + 'repository and use the stored credential by host. A `dir` outside the session workspace is refused with '
      + 'an escalation hint.',
    parameters: {
      action: { type: 'string', enum: ACTIONS, description: 'What to do. Defaults to "list".' },
      dir: { type: 'string', description: 'Repository root, required for local actions and for a probe that names a configured remote.' },
      name: { type: 'string', description: 'Remote name, for example "origin".' },
      url: { type: 'string', description: 'Remote URL, for example "https://git.example.com/team/project.git".' },
      force: { type: 'boolean', description: 'For action "add": overwrite an existing remote. Defaults to false.' },
      prefix: { type: 'string', description: 'For action "refs": only list refs starting with this prefix.' },
      forPush: { type: 'boolean', description: 'For the probe actions: ask about push permissions instead of fetch. Defaults to false.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          action: { type: 'string', required: true },
          name: { type: 'string', required: true },
          url: { type: 'string', required: true },
          remotes: { type: 'json', required: true },
          result: { type: 'json', required: true },
        },
      },
      render: (_args, value) => {
        if (value.action === 'refs') {
          return [{ type: 'text', text: renderServerRefs(value.result, { url: value.url, prefix: value.prefixHints }) }]
        }
        if (value.action === 'info') {
          return [{ type: 'text', text: `${scrubUrl(value.url)}: git protocol version 2 (capabilities queried via ls-remote).` }]
        }
        return [{
          type: 'text',
          text: `${value.action === 'add' ? `Configured remote "${value.name}" -> ${value.url}.\n\n` : ''}`
            + `${value.action === 'delete' ? `Removed remote "${value.name}".\n\n` : ''}`
            + renderRemotes(value.remotes),
        }]
      },
    },
    async execute(args, exec) {
      const action = args.action ?? 'list'
      if (!ACTIONS.includes(action)) throw new Error(`git_remote: unknown action "${action}"`)
      const local = action === 'list' || action === 'add' || action === 'delete'
      const { opened, mapError } = local
        ? await openRepo(deps, 'git_remote', args, exec, args.dir)
        : { opened: null, mapError: async (e) => e }
      const root = opened ? opened.root : ''
      try {
        if (action === 'add') {
          if (args.name === undefined || args.url === undefined) throw new Error('git_remote: action "add" requires name and url')
          if (args.force === true) {
            await runGit({ cwd: root, args: ['remote', 'remove', args.name], signal: exec.signal })
          }
          const r = await runGit({ cwd: root, args: ['remote', 'add', args.name, args.url], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git remote add failed (${r.stderr.trim()})`)
        } else if (action === 'delete') {
          if (args.name === undefined) throw new Error('git_remote: action "delete" requires name')
          const r = await runGit({ cwd: root, args: ['remote', 'remove', args.name], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git remote remove failed (${r.stderr.trim()})`)
        }
        const remotes = local ? await listRemotes(root) : []
        let url = args.url ?? ''
        let result = []
        if (action === 'refs' || action === 'info') {
          if (url === '' && args.name !== undefined) {
            const rr = await runGit({ cwd: root || dirname(args.dir), args: ['remote', 'get-url', args.name], signal: exec.signal })
            url = rr.code === 0 ? rr.stdout.trim() : ''
          }
          if (url === '') throw new Error('git_remote: a `url` (or a configured remote `name`) is required for probe actions')
          const r = await runGit({
            cwd: root || '/', args: ['ls-remote', url, ...(args.prefix ? [args.prefix] : [])],
            signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs,
          })
          if (r.code !== 0) {
            const stderr = r.stderr.trim()
            if (/could not read (Username|Password)|Authentication failed/i.test(stderr)) throw new Error(deps.credentials.missingMessage(url))
            throw new Error(`@dsh-android/git: git ls-remote failed (${stderr.slice(0, 800)})`)
          }
          result = r.stdout.trim().split('\n').filter(Boolean).map((line) => {
            const [oid, ref] = line.split(/\t/)
            return { ref, oid }
          })
        }
        return {
          root,
          action,
          name: args.name ?? '',
          url: url === '' ? '' : scrubUrl(url),
          remotes,
          result,
          prefixHints: args.prefix,
        }
      } catch (error) {
        if (exec.signal?.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
