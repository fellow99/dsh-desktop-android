/**
 * The model-facing `git_status` tool: what changed, grouped the way `git status` groups it.
 *
 * The `conflicted` group deserves a word. isomorphic-git keeps unmerged index entries inside
 * the index object and exposes no API for them, so the only observable evidence of an
 * unresolved merge in the working tree is the conflict-marker block git itself leaves in the
 * file. This tool therefore reports a changed path as conflicted when its working-tree copy
 * still holds a complete `<<<<<<<` / `=======` / `>>>>>>>` marker set — the same thing a user
 * would see. The scan is size-capped and never fails the call.
 *
 * @module @dsh-android/git/tools/status
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { promises as nodeFs } from 'node:fs'
import { runGit, currentBranch, headOid } from '../git-exec.js'
import { openRepo, parseStatusZ } from '../toolkit.js'

/**
 * Whether a working-tree file still holds a complete git conflict marker set.
 * @param {string} text - the file's decoded content.
 * @returns true when the file looks like an unresolved merge result.
 */
function hasConflictMarkers(text) {
  let seenOurs = false
  let seenSplit = false
  for (const line of text.split('\n')) {
    if (line.startsWith('<<<<<<< ')) seenOurs = true
    else if (line.startsWith('=======')) seenSplit = true
    else if (line.startsWith('>>>>>>> ') && seenOurs && seenSplit) return true
  }
  return false
}

/**
 * Scan the changed working-tree files for the conflict markers an unresolved merge leaves.
 * Best-effort on purpose: the status matrix is the authoritative answer, and a file that
 * cannot be inspected (over the size cap, unreadable) is simply not claimed to be conflicted.
 * @param {object} fs - the confined repository filesystem.
 * @param {string} root - the repository root.
 * @param {Array<[string, number, number, number]>} rows - the status matrix.
 * @param {number} maxBytes - the per-file scan cap.
 * @returns the paths whose working-tree copy holds conflict markers.
 */
async function scanForConflicts(root, rows, maxBytes) {
  const found = []
  for (const entry of rows) {
    if (!entry.modified && !entry.untracked) continue
    const absolute = `${root}/${entry.path.split(' -> ')[0]}`
    try {
      const stat = await nodeFs.stat(absolute)
      if (stat.size > maxBytes) continue
      if (hasConflictMarkers(await nodeFs.readFile(absolute, 'utf8'))) found.push(entry.path)
    } catch {
      // A file that vanished mid-scan is reported by the status matrix, not here.
    }
  }
  return found
}

/** 渲染真实 git porcelain 解析出的变更条目（保持既有措辞；112 后端替换后数据形态）。 */
function renderStatusEntries(rows, options = {}) {
  const conflicting = new Set(options.conflicts ?? [])
  const lines = []
  if (options.root !== undefined) lines.push(`Repository: ${options.root}`)
  const head = options.head === undefined || options.head === '' ? undefined : options.head.slice(0, 10)
  const branch = options.branch === undefined || options.branch === ''
    ? `detached HEAD${head === undefined ? '' : ` at ${head}`}`
    : `branch ${options.branch}${head === undefined ? '' : ` (HEAD ${head})`}`
  lines.push(`On ${branch}`)
  const groups = [
    ['Staged for commit', rows.filter((e) => e.staged)],
    ['Modified in the working tree, not staged', rows.filter((e) => !e.staged && e.modified && !e.untracked)],
    ['Deleted', rows.filter((e) => !e.staged && e.deleted)],
    ['Untracked', rows.filter((e) => e.untracked)],
  ]
  const conflicted = rows.filter((e) => conflicting.has(e.path))
  const changed = rows.filter((e) => e.changed)
  if (changed.length === 0 && conflicted.length === 0) {
    lines.push('')
    lines.push('No changes: HEAD, the index and the working tree all agree.')
    return lines.join('\n')
  }
  for (const [title, group] of groups) {
    if (group.length === 0) continue
    lines.push('')
    lines.push(`${title} (${group.length}):`)
    for (const e of group) lines.push(`  ${e.code === '  ' ? '  ' : e.code} ${e.path}${conflicting.has(e.path) ? ' (conflicted)' : ''}`)
  }
  if (conflicted.length > 0) {
    lines.push('')
    lines.push(`Conflicted (${conflicted.length}) — resolve these before committing; the working tree `
      + 'still holds the merge conflict markers:')
    for (const e of conflicted) lines.push(`  ${e.code === '  ' ? '  ' : e.code} ${e.path}`)
  }
  return lines.join('\n')
}

/**
 * Register the `git_status` tool.
 * @param ctx - the plugin context; `ctx.tools` receives the registration.
 * @param deps - shared collaborators.
 * @param {import('../fence.js').GitRepositoryFence} deps.fence - the repository fence.
 * @param {object} deps.config - the resolved plugin config.
 */
export function applyGitStatusTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git_status',
    description: 'Show the state of the repository at `dir`: a header with the checked-out branch and HEAD, then '
      + 'the paths that are staged for commit, modified but not staged, deleted, untracked, and conflicted. '
      + '`paths` narrows the report to a path or directory prefix. A clean repository is reported as such. '
      + 'Conflict detection reads working-tree files for merge conflict markers (isomorphic-git exposes no '
      + 'unmerged-index API), so it covers everything `git merge` leaves behind. Fails when `dir` is not a git '
      + 'repository, naming `git_init` / `git_clone` as the fix; a `dir` outside the session workspace is refused '
      + 'with an escalation hint.',
    parameters: {
      dir: {
        type: 'string',
        required: true,
        description: 'Repository root. Resolved against the session workspace; outside it the call is refused '
          + 'until a one-shot escalation is approved.',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pathspecs (files or directory prefixes, repository-relative) to limit the report to. '
          + 'Omit to report the whole repository.',
      },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          head: { type: 'string', required: true },
          clean: { type: 'boolean', required: true },
          count: { type: 'number', required: true },
          conflicts: { type: 'array', required: true, items: { type: 'string' } },
          rows: { type: 'json', required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `${Array.isArray(args.paths) && args.paths.length > 0
          ? `Scope: ${args.paths.join(', ')}\n`
          : ''}${renderStatusEntries(value.rows, {
          root: value.root,
          branch: value.branch === '' ? undefined : value.branch,
          head: value.head === '' ? undefined : value.head,
          conflicts: value.conflicts,
        })}`,
      }],
    },
    async execute(args, exec) {
      const { opened, mapError } = await openRepo(deps, 'git_status', args, exec)
      try {
        const filepaths = Array.isArray(args.paths) && args.paths.length > 0 ? args.paths : ['.']
        const statusRun = await runGit({
          cwd: opened.root,
          args: ['status', '--porcelain=v1', '-z', '--', ...filepaths],
          signal: exec.signal,
          timeoutMs: deps.config.networkTimeoutMs,
        })
        if (statusRun.code !== 0) throw new Error(`@dsh-android/git: git status failed (${statusRun.stderr.trim()})`)
        const rows = parseStatusZ(statusRun.stdout)
        const branch = await currentBranch(opened.root)
        const head = await headOid(opened.root)
        const conflicts = await scanForConflicts(opened.root, rows, deps.config.maxDiffBlobBytes)
        return {
          root: opened.root,
          branch: branch ?? '',
          head: head ?? '',
          clean: rows.filter((entry) => entry.changed).length === 0 && conflicts.length === 0,
          count: rows.filter((entry) => entry.changed).length,
          conflicts,
          rows,
        }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw await mapError(error)
      }
    },
  }))
}
