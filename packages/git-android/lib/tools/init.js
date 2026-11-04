/**
 * The model-facing `git_init` tool: create an empty repository.
 * @module @dsh-android/git/tools/init
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdirSync } from 'node:fs'
import { runGit, GitExecutionError } from '../git-exec.js'
import { openRepo } from '../toolkit.js'

/**
 * Register the `git_init` tool.
 * @param ctx - the plugin context; `ctx.tools` receives the registration.
 * @param deps - shared collaborators.
 * @param {import('../fence.js').GitRepositoryFence} deps.fence - the repository fence.
 */
export function applyGitInitTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_init',
    description: 'Create an empty git repository (its `.git` directory) in `dir`. Use this before the first '
      + 'commit of a directory that is not a repository yet; `git_clone` creates the repository for you instead. '
      + 'The directory is created when missing, and other files in it are left alone. An existing repository is '
      + 'left untouched (the call is a no-op). Fails when the path cannot be created; a `dir` outside the session '
      + 'workspace is refused with an escalation hint instead of being written.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Directory that becomes the repository root (the working tree). Resolved against the session '
          + 'workspace; outside it the call is refused until a one-shot escalation is approved.',
      },
      defaultBranch: {
        type: 'string',
        description: 'Name of the default branch, for example "main" or "master". Defaults to "main".',
      },
      bare: {
        type: 'boolean',
        description: 'Create a bare repository (no working tree) when true. Defaults to false.',
      },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          defaultBranch: { type: 'string', required: true },
          bare: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.bare ? 'Initialized empty bare git repository' : 'Initialized empty git repository'} `
          + `at ${value.root} (default branch "${value.defaultBranch}").`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_init', args, exec)
      try {
        const defaultBranch = args.defaultBranch ?? 'main'
        mkdirSync(opened.root, { recursive: true })
        const argv = ['init']
        if (args.bare === true) argv.push('--bare')
        argv.push('-b', defaultBranch)
        const result = await runGit({ cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
        if (result.code !== 0) throw new GitExecutionError(opened.root, argv, result)
        return { root: opened.root, defaultBranch, bare: args.bare === true }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
