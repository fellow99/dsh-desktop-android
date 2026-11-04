/**
 * The model-facing `git_config` tool: read and write repository-local git config.
 * 112：后端改为真实 `git config`（--local，仅仓库配置）。
 *
 * @module @dsh-android/git/tools/config
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderConfigValue, renderConfigValues } from '../report.js'

const ACTIONS = ['get', 'get-all', 'set', 'unset']

export function applyGitConfigTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_config',
    description: 'Read and write this repository\'s git config. `action: "get"` (the default) reads one key; '
      + '"get-all" reads every value of a multi-valued key (for example remote.origin.fetch); "set" writes `value` '
      + 'at `path` (`append: true` adds another value instead of replacing); "unset" removes the key. Sets are '
      + 'repository-local, so `user.name` and `user.email` set here become the identity of later commits. Fails '
      + 'when `path` is missing or `dir` is not a repository; a `dir` outside the session workspace is refused '
      + 'with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      action: { type: 'string', enum: ACTIONS, description: 'What to do. Defaults to "get".' },
      path: { type: 'string', required: true, description: 'The config key, for example "user.name" or "remote.origin.url".' },
      value: { type: 'string', description: 'For action "set": the value to store.' },
      append: { type: 'boolean', description: 'For action "set": append instead of replacing. Defaults false.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          action: { type: 'string', required: true },
          path: { type: 'string', required: true },
          value: { type: 'json', required: true },
          values: { type: 'json', required: true },
        },
      },
      render: (_args, value) => {
        if (value.action === 'get') {
          return [{ type: 'text', text: `${value.path} in ${value.root}\n${renderConfigValue(value.path, value.value)}` }]
        }
        if (value.action === 'get-all') {
          return [{ type: 'text', text: `${value.path} in ${value.root}\n${renderConfigValues(value.path, value.values)}` }]
        }
        if (value.action === 'unset') {
          return [{ type: 'text', text: `Removed ${value.path} from the repository config.\n` + renderConfigValue(value.path, value.value) }]
        }
        return [{ type: 'text', text: `Wrote ${value.path} in ${value.root}:\n${renderConfigValue(value.path, value.value)}` }]
      },
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_config', args, exec)
      try {
        const action = args.action ?? 'get'
        if (!ACTIONS.includes(action)) {
          throw new Error(`git_config: unknown action "${action}" (expected one of ${ACTIONS.join(', ')})`)
        }
        const path = args.path
        if (typeof path !== 'string' || path.trim() === '') throw new Error('git_config: path must be a non-empty config key')
        const base = ['config', '--local']
        let value
        let values = []
        if (action === 'get') {
          const r = await runGit({ cwd: opened.root, args: [...base, '--get', path], signal: exec.signal })
          value = r.code === 0 ? r.stdout.trimEnd() : undefined
        } else if (action === 'get-all') {
          const r = await runGit({ cwd: opened.root, args: [...base, '--get-all', path], signal: exec.signal })
          values = r.code === 0 ? r.stdout.split('\n').filter((l) => l !== '') : []
          value = values[0]
        } else if (action === 'set') {
          if (args.value === undefined) throw new Error(`git_config: action "set" requires value`)
          const r = await runGit({ cwd: opened.root, args: [...base, args.append === true ? '--add' : '--replace-all', path, String(args.value)], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git config set failed (${r.stderr.trim()})`)
          value = String(args.value)
        } else if (action === 'unset') {
          const r = await runGit({ cwd: opened.root, args: [...base, '--unset-all', path], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git config unset failed (${r.stderr.trim()})`)
          value = undefined
        }
        return { root: opened.root, action, path, value, values }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
