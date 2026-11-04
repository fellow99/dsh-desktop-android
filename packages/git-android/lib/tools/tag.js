/**
 * The model-facing `git_tag` tool: list, create or delete tags.
 * 112：后端改为真实 `git tag`。
 *
 * @module @dsh-android/git/tools/tag
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, resolveRev } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { renderTags } from '../report.js'
import { resolveIdentity } from './commit.js'

const ACTIONS = ['list', 'create', 'delete']

export function applyGitTagTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_tag',
    description: 'List, create or delete tags. `action: "list"` (the default) prints them all. `action: "create"` '
      + 'creates `name` pointing at `object` (default "HEAD"). With `message` it is an annotated tag; without it, '
      + 'a lightweight ref. An existing tag is only overwritten with `force: true`. `action: "delete"` removes the '
      + 'tag `name` locally. Fails when `dir` is not a repository; a `dir` outside the session workspace is refused '
      + 'with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      action: { type: 'string', enum: ACTIONS, description: 'What to do. Defaults to "list".' },
      name: { type: 'string', description: 'Tag name to create or delete.' },
      object: { type: 'string', description: 'For action "create": what the tag points at. Defaults to "HEAD".' },
      message: { type: 'string', description: 'For action "create": annotation text; providing it makes the tag annotated.' },
      force: { type: 'boolean', description: 'For action "create": overwrite an existing tag. Defaults to false.' },
      taggerName: { type: 'string', description: 'For an annotated tag: tagger name.' },
      taggerEmail: { type: 'string', description: 'For an annotated tag: tagger email.' },
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
          annotated: { type: 'boolean', required: true },
          tags: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.action === 'list'
          ? ''
          : value.action === 'create'
            ? `Created ${value.annotated ? 'annotated' : 'lightweight'} tag "${value.name}".\n\n`
            : `Deleted tag "${value.name}".\n\n`}${renderTags(value.tags)}`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_tag', args, exec)
      try {
        const action = args.action ?? 'list'
        if (!ACTIONS.includes(action)) throw new Error(`git_tag: unknown action "${action}"`)
        if (action !== 'list' && (args.name === undefined || args.name.trim() === '')) {
          throw new Error(`git_tag: action "${action}" requires name`)
        }
        if (action === 'create') {
          const target = await resolveRev(opened.root, args.object ?? 'HEAD')
          const annotated = args.message !== undefined
          if (annotated) {
            const identity = await resolveIdentity(opened.root, deps.config, { authorName: args.taggerName, authorEmail: args.taggerEmail })
            const argv = ['tag', '-a', args.name, '-m', String(args.message), target]
            if (args.force === true) argv.splice(1, 0, '-f')
            const r = await runGit({
              cwd: opened.root, args: argv, signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs,
              env: { GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email },
            })
            if (r.code !== 0) throw new Error(`@dsh-android/git: git tag -a failed (${r.stderr.trim()})`)
          } else {
            const argv = ['tag', args.name, target]
            if (args.force === true) argv.splice(1, 0, '-f')
            const r = await runGit({ cwd: opened.root, args: argv, signal: exec.signal })
            if (r.code !== 0) throw new Error(`@dsh-android/git: git tag failed (${r.stderr.trim()})`)
          }
        } else if (action === 'delete') {
          const r = await runGit({ cwd: opened.root, args: ['tag', '-d', args.name], signal: exec.signal })
          if (r.code !== 0) throw new Error(`@dsh-android/git: git tag -d failed (${r.stderr.trim()})`)
        }
        const list = await runGit({ cwd: opened.root, args: ['tag', '--list'], signal: exec.signal })
        const tags = list.code === 0 ? list.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : []
        return { root: opened.root, action, name: args.name ?? '', annotated: args.message !== undefined, tags }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
