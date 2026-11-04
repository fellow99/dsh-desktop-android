/**
 * The model-facing `git_diff` tool.
 * 112：后端改为真实 `git diff`（numstat + name-status + 全文）。
 *
 * @module @dsh-android/git/tools/diff
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, resolveRev } from '../git-exec.js'
import { openRepo } from '../toolkit.js'
import { scrubUrl } from '../url.js'

const MODES = ['head', 'staged', 'refs']
const STATUS_LETTER = { A: 'added', M: 'modified', D: 'deleted', T: 'type-change', R: 'renamed', C: 'copied' }

export function applyGitDiffTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_diff',
    description: 'Show the differences between two sides of the repository. `mode: "head"` (default) compares HEAD '
      + 'against the working tree; `"staged"` compares the index against HEAD; `"refs"` compares `ref2` against '
      + '`ref` (both required there). `paths` limits the diff; `stat: true` reports only line counts. Fails when '
      + '`dir` is not a repository or a mode\'s ref cannot be resolved; a `dir` outside the session workspace is '
      + 'refused with an escalation hint.',
    parameters: {
      dir: { type: 'string', required: true, description: 'Repository root. Resolved against the session workspace.' },
      mode: { type: 'string', enum: MODES, description: 'Which two sides to compare. Defaults to "head".' },
      ref: { type: 'string', description: 'Base ref for mode "refs".' },
      ref2: { type: 'string', description: 'Target ref for mode "refs" (required there).' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Pathspecs to limit the diff to.' },
      stat: { type: 'boolean', description: 'Report only the added and removed line counts per file.' },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          base: { type: 'string', required: true },
          target: { type: 'string', required: true },
          stat: { type: 'boolean', required: true },
          files: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                status: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                addedLines: { type: 'number', required: true },
                removedLines: { type: 'number', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (args, value) => {
        const header = `diff ${value.mode} (${value.base} -> ${value.target})`
        if (value.files.length === 0) {
          return [{
            type: 'text',
            text: `${header}\nNo changes: the two sides are identical`
              + `${Array.isArray(args.paths) && args.paths.length > 0 ? ` under ${args.paths.join(', ')}` : ''}.`,
          }]
        }
        const lines = [header, `${value.files.length} changed ${value.files.length === 1 ? 'path' : 'paths'}:`]
        for (const file of value.files) {
          lines.push(`  ${file.status[0].toUpperCase() ?? '?'}  ${file.path}  (+${file.addedLines}/-${file.removedLines})`)
          if (!value.stat) lines.push(file.text)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_diff', args, exec)
      try {
        const mode = args.mode ?? 'head'
        if (!MODES.includes(mode)) throw new Error(`git_diff: unknown mode "${mode}"`)
        const paths = Array.isArray(args.paths) ? args.paths : []
        let base = ''
        let target = ''
        let rangeArgs = []
        if (mode === 'head') {
          base = 'HEAD'
          target = 'working tree'
          rangeArgs = ['HEAD']
        } else if (mode === 'staged') {
          base = 'index'
          target = 'HEAD'
          rangeArgs = ['--cached']
        } else {
          if (args.ref === undefined || args.ref2 === undefined) throw new Error('git_diff: mode "refs" requires ref and ref2')
          base = args.ref
          target = args.ref2
          rangeArgs = [`${await resolveRev(opened.root, args.ref)}..${await resolveRev(opened.root, args.ref2)}`]
        }
        const suffix = paths.length > 0 ? ['--', ...paths] : []
        const nameStatus = await runGit({ cwd: opened.root, args: ['diff', ...rangeArgs, '--name-status', ...suffix], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
        const numStat = await runGit({ cwd: opened.root, args: ['diff', ...rangeArgs, '--numstat', ...suffix], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
        if (nameStatus.code !== 0 || numStat.code !== 0) throw new Error('@dsh-android/git: git diff failed')
        const num = new Map()
        for (const line of numStat.stdout.split('\n').filter(Boolean)) {
          const [a, d, p] = line.split(/\t/)
          num.set(p, { addedLines: a === '-' ? 0 : Number(a) || 0, removedLines: d === '-' ? 0 : Number(d) || 0 })
        }
        const files = []
        for (const line of nameStatus.stdout.split('\n').filter(Boolean)) {
          const [letter, ...rest] = line.split(/\t/)
          const path = rest.join('\t').split(' -> ').pop()
          const counts = num.get(path) ?? { addedLines: 0, removedLines: 0 }
          files.push({
            path,
            status: STATUS_LETTER[letter[0]] ?? 'modified',
            kind: 'text',
            addedLines: counts.addedLines,
            removedLines: counts.removedLines,
            text: args.stat === true ? '' : '',
          })
        }
        if (args.stat !== true && files.length > 0) {
          const full = await runGit({ cwd: opened.root, args: ['diff', ...rangeArgs, ...suffix], signal: exec.signal, timeoutMs: deps.config.networkTimeoutMs })
          files.forEach((f) => { f.text = full.stdout || '' })
          if (full.stdout !== '') files[0].text = full.stdout
          else for (const f of files) f.text = ''
        }
        return { root: opened.root, mode, base, target, stat: args.stat === true, files }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
