/**
 * 112-cli-integration（US3）：git 工具族共享小工具——栅栏展开、错误映射、porcelain 输出解析。
 *
 * 目标：21 个工具保持注册表层（name/schema/render）不变，execute 改为真实 `git` 委托，
 * 此处集中「开仓库 / 收错误 / 解析输出」三件公共事，避免 21 个文件重复。
 *
 * @module @dsh-android/git/toolkit
 */
import { runGit, GitExecutionError } from './git-exec.js'

/**
 * 栅栏展开 + 授权策略记忆：统一每个工具的 execute 入口。
 * @param {object} deps - 工具共享依赖（fence）。
 * @param {string} tool - 工具名。
 * @param {object} args - 调用参数。
 * @param {object} exec - 执行上下文。
 * @returns {Promise<{ opened: import('./fence.js').OpenedRepository, mapError: Function }>}
 */
export async function openRepo(deps, tool, args, exec) {
  let opened
  let policy
  try {
    opened = await deps.fence.open(tool, args, exec, args.dir)
    policy = opened.policy
  } catch (error) {
    // open 不可能走到这里：fence.open 在策略解析失败时拒绝；把错误原样抛给调用方 catch。
    throw error
  }
  const mapError = async (error) => {
    // 统一把「不是 git 仓库」与 GitExecutionError 映射为可读错误
    if (error instanceof GitExecutionError && error.notARepo) {
      return new Error('@dsh-android/git: this directory is not a git repository. Use git_init to create one '
        + 'here, or git_clone to fetch an existing one.')
    }
    return deps.fence.mapError(error, policy ?? await deps.fence.resolvePolicy(tool, args, exec))
  }
  return { opened, mapError }
}

/**
 * 解析 `git status --porcelain=v1 -z -- <paths>` 输出为渲染友好的变更条目。
 * @param {Buffer|string} zstdout - `-z` 模式的原始输出。
 * @returns {Array<{path: string, code: string, staged: boolean, modified: boolean, deleted: boolean, untracked: boolean, changed: boolean}>}
 */
export function parseStatusZ(zstdout) {
  const buf = Buffer.isBuffer(zstdout) ? zstdout : Buffer.from(String(zstdout || ''))
  const NUL = 0
  const entries = []
  let i = 0
  while (i < buf.length) {
    const xy = String.fromCharCode(buf[i], buf[i + 1])
    let end = i + 3
    while (end < buf.length && buf[end] !== NUL) end += 1
    let path = buf.subarray(i + 3, end).toString('utf8')
    i = end + 1
    // rename/copy 形态：`XY\tfrom\0to\0` → path 是第二部分
    if (xy[0] === 'R' || xy[0] === 'C') {
      let rn = i
      while (rn < buf.length && buf[rn] !== NUL) rn += 1
      const target = buf.subarray(i, rn).toString('utf8')
      path = `${path} -> ${target}`
      i = rn + 1
    }
    const X = xy[0]; const Y = xy[1]
    const untracked = X === '?' && Y === '?'
    const staged = X !== ' ' && X !== '?' && X !== 'U'
    const deleted = Y === 'D' || X === 'D'
    const modified = Y === 'M' || X === 'M' || X === 'T' || Y === 'T'
    entries.push({
      path,
      code: xy.replace(/ /g, '  '),
      staged,
      modified,
      deleted,
      untracked,
      changed: untracked || staged || modified || deleted || X === 'U' || Y === 'U',
    })
  }
  return entries
}

/**
 * 解析 `git log --pretty=raw` 输出为渲染友好的提交列表（renderLog 所需形状）。
 * @param {Buffer|string} out - `--pretty=raw` 的原始输出。
 * @returns {Array<{oid: string, commit: {message: string, author: object, committer: object, tree: string, parent: string[]}}>}
 */
export function parseLogRecords(out) {
  const text = Buffer.isBuffer(out) ? out.toString('utf8') : String(out || '')
  const records = []
  const blocks = text.split(/\n\n/)
  for (const block of blocks) {
    if (!block.startsWith('commit ')) continue
    const lines = block.split('\n')
    const oid = lines[0].slice('commit '.length).trim()
    const commit = { message: '', author: undefined, committer: undefined, tree: '', parent: [], gpgsig: undefined }
    let messageLines = []
    let i = 1
    for (; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('tree ')) { commit.tree = line.slice(5).trim(); continue }
      if (line.startsWith('parent ')) { commit.parent.push(line.slice(7).trim()); continue }
      if (line.startsWith('author ')) { commit.author = identityOf(line.slice(7).trim()); continue }
      if (line.startsWith('committer ')) { commit.committer = identityOf(line.slice(10).trim()); continue }
      if (line.startsWith('gpgsig ')) { commit.gpgsig = 'present'; continue }
      if (line === '') { break }
    }
    if (i < lines.length) messageLines = lines.slice(i + 1)
    commit.message = messageLines.join('\n').replace(/^\n+/, '')
    records.push({ oid, commit })
  }
  return records
}

/** `Name <email> 1234567 +0800` → {name,email,timestamp,timezoneOffset}。 */
function identityOf(raw) {
  const m = /^(.*) <(.*)> (\d+) ([+-]\d{4})$/.exec(raw)
  if (!m) return { name: raw, email: '', timestamp: 0, timezoneOffset: 0 }
  return { name: m[1], email: m[2], timestamp: Number(m[3]), timezoneOffset: tzMinutes(m[4]) }
}

function tzMinutes(tz) {
  const sign = tz.startsWith('-') ? -1 : 1
  const abs = tz.replace(/^[+-]/, '')
  return sign * ((Number(abs.slice(0, 2)) || 0) * 60 + (Number(abs.slice(2)) || 0))
}

/** 通用：跑一次 git，附栅栏/超时/abort，非零抛 GitExecutionError。 */
export function run(cwd, args, { env, timeoutMs, signal } = {}) {
  return runGit({ cwd, args, env, timeoutMs, signal })
}
