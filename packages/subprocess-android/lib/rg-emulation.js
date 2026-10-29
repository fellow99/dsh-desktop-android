/**
 * 进程内 ripgrep 替身（T-013 / specs/206 最小可用版）。
 *
 * 背景：上游 tool-fs-search 以 `argv=[<@vscode/ripgrep 的 rg 路径>, --no-config, …]`
 * 调 `ctx.subprocess.spawn`。本平台无可执行 rg（W^X，载荷内 linux ELF 不可执行），
 * 因此 spawn 同步抛 `SubprocessExecutableNotFoundError`，grep/glob 全部
 * `SEARCH_FAILED (ripgrep launch failed)`（2026-10-29 取证，logs/20261029-1）。
 *
 * 本文件在**本工程自有 seam**（@dsh-android/subprocess）内识别 rg 请求并进程内执行，
 * 产出与 `rg --json` / `rg --files` 对齐的输出，供上游解析器原样消费：
 * - grep: `--json --regexp=<pattern> [--glob=<include>] [-- <path>]`
 *   → NDJSON match 记录（`data.path.text` / `data.line_number` / `data.lines.text`），
 *     非 match 记录被上游忽略，但为保真仍输出 begin/end；
 * - glob: `--files --glob=<pattern> --sort=modified --no-ignore --hidden
 *   [--glob=反向排除 VCS 目录…] [-- <path>]` → 每行一个路径（mtime 升序），无结果 exit 1。
 *
 * 与真实 rg 的已知偏差（如实登记，specs/206 后续迭代收窄）：
 * - 正则引擎为 JS RegExp（Rust regex 的大部分常用语法兼容；不支持 \p{…} Unicode 类等）；
 * - 不读 .gitignore（上游显式传 `--no-ignore --hidden`，语义一致）；
 * - 二进制探测：前 8KiB 含 NUL 即跳过（rg 的默认近似）。
 *
 * @module @dsh-android/subprocess/rg-emulation
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve as resolvePath } from 'node:path'

/** 二进制探测窗口（rg 近似：NUL 字节即二进制）。 */
const BINARY_SNIFF_BYTES = 8192
/** 单文件读取上限（超出跳过；上游另有 rawOutputMaxBytes 总量闸）。 */
const MAX_FILE_BYTES = 16 * 1024 * 1024

/**
 * 是否为本替身接管的 ripgrep 请求：argv[0] 以 `/rg` 结尾（@vscode/ripgrep 的
 * bin 路径）且请求形态为上游 tool-fs-search 的两种调用之一。
 * @param {readonly string[]} argv
 * @returns {boolean}
 */
export function isRipgrepRequest(argv) {
  if (!Array.isArray(argv) || argv.length < 2) return false
  const program = String(argv[0]).replaceAll('\\', '/')
  if (!program.endsWith('/rg')) return false
  return argv.includes('--json') || argv.includes('--files') || argv[1] === '--no-config'
}

/**
 * 解析上游两种调用形态的旗标。
 * @param {readonly string[]} argv - 完整 argv（含程序路径）。
 * @returns {{ mode: 'files'|'json', pattern?: string, globPatterns: string[], path?: string }}
 */
export function parseRgArgs(argv) {
  const out = { mode: argv.includes('--files') ? 'files' : 'json', globPatterns: [] }
  let pattern
  let path
  let positionalDone = false
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') {
      if (i + 1 < argv.length) path = argv[i + 1]
      positionalDone = true
      break
    }
    if (arg === '--json' || arg === '--files' || arg === '--no-config' || arg === '--no-ignore' || arg === '--hidden') continue
    if (arg.startsWith('--sort=') || arg.startsWith('--sortr=')) continue
    if (arg.startsWith('--regexp=')) { pattern = arg.slice('--regexp='.length); continue }
    if (arg.startsWith('--glob=')) { out.globPatterns.push(arg.slice('--glob='.length)); continue }
    if (arg === '--glob') { out.globPatterns.push(argv[i + 1] ?? ''); i += 1; continue }
    if (arg.startsWith('--')) continue
    if (!positionalDone && pattern === undefined) pattern = arg
  }
  if (out.mode === 'json' && typeof pattern !== 'string') {
    throw new Error('rg-emulation: json mode requires --regexp=<pattern>')
  }
  out.pattern = pattern
  out.path = path
  return out
}

/**
 * glob → RegExp（rg 语义：无 `/` 的 glob 匹配 basename；`**` 跨段；`*`/`?` 不跨段）。
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // '**/' 允许零目录；裸 '**' 跨段
        if (glob[i + 2] === '/') { re += '(?:[^/]*/)?'; i += 2 } else { re += '.*'; i += 1 }
      } else re += '[^/]*'
    } else if (ch === '?') re += '[^/]'
    else re += /[a-zA-Z0-9_/-]/.test(ch) ? ch : `\\${ch}`
  }
  return new RegExp(`^(?:${re})$`)
}

/**
 * rg 的 glob 决策：按顺序求值，**最后一个命中的 glob 决定去留**（rg 手册语义）；
 * 全都不命中时：存在正向 glob → 排除，只有反向 glob → 包含。
 * @param {string} displayPath - 打印路径（相对 cwd，'/' 分隔）。
 * @param {string} rootRelPath - 相对搜索根的路径。
 * @param {string[]} globs - 按序的 glob（'!' 前缀 = 反向）。
 * @returns {boolean}
 */
export function globDecision(displayPath, rootRelPath, globs) {
  let positives = 0
  let include = null
  for (const raw of globs) {
    const negated = raw.startsWith('!')
    const glob = negated ? raw.slice(1) : raw
    if (!negated) positives += 1
    const re = globToRegExp(glob)
    const hasSlash = glob.includes('/')
    const hit = hasSlash
      ? (re.test(rootRelPath) || re.test(displayPath))
      : (re.test(basenameOf(rootRelPath)) || re.test(basenameOf(displayPath)))
    if (hit) include = !negated
  }
  if (include !== null) return include
  return positives === 0
}

function basenameOf(p) {
  const i = p.replaceAll('\\', '/').lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
}

/**
 * 递归收集文件（不跟随 symlink；目录内字典序）。
 * @param {string} dir - 绝对目录。
 * @param {string} root - 搜索根（绝对）。
 * @param {string[]} out - 收集的绝对路径。
 */
function walkFiles(dir, root, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) walkFiles(full, root, out)
    else if (entry.isFile()) out.push(full)
  }
}

/** display path：相对 spawn cwd 的 posix 路径（rg 的打印约定）。 */
function displayPathOf(file, cwd) {
  return relative(cwd, file).replaceAll('\\', '/')
}

/** root-relative path：相对搜索根（glob 判定的辅助口径）。 */
function rootRelOf(file, root) {
  return relative(root, file).replaceAll('\\', '/')
}

function isBinary(file) {
  try {
    const fd = readFileSync(file)
    const window = fd.subarray(0, Math.min(BINARY_SNIFF_BYTES, fd.length))
    return window.includes(0)
  } catch {
    return true
  }
}

/**
 * files 模式：按 mtime 升序的路径清单。
 * @returns {{ stdout: string, stderr: string, exitCode: number, signal: null }}
 */
export function runFilesMode(spec, parsed) {
  const cwd = resolvePath(spec.cwd)
  const root = parsed.path !== undefined ? resolvePath(cwd, parsed.path) : cwd
  const files = []
  walkFiles(root, root, files)
  const kept = []
  for (const file of files) {
    let mtime = 0
    try {
      const st = statSync(file)
      if (!st.isFile()) continue
      mtime = st.mtimeMs
    } catch {
      continue
    }
    const display = displayPathOf(file, cwd)
    const rootRel = rootRelOf(file, root)
    if (globDecision(display, rootRel, parsed.globPatterns)) kept.push({ file, mtime, display })
  }
  kept.sort((a, b) => (a.mtime - b.mtime) || a.display.localeCompare(b.display))
  if (kept.length === 0) return { stdout: '', stderr: '', exitCode: 1, signal: null }
  return { stdout: `${kept.map(e => e.display).join('\n')}\n`, stderr: '', exitCode: 0, signal: null }
}

/**
 * json 模式：NDJSON（begin/match/end），正则用 JS RegExp（行内匹配，非全局）。
 * @returns {{ stdout: string, stderr: string, exitCode: number, signal: null }}
 */
export function runJsonMode(spec, parsed) {
  const cwd = resolvePath(spec.cwd)
  const root = parsed.path !== undefined ? resolvePath(cwd, parsed.path) : cwd
  let pattern
  try {
    pattern = new RegExp(parsed.pattern)
  } catch (error) {
    return { stdout: '', stderr: `rg-emulation: invalid regex: ${error instanceof Error ? error.message : String(error)}\n`, exitCode: 2, signal: null }
  }
  const files = []
  walkFiles(root, root, files)
  const lines = []
  let anyMatch = false
  for (const file of files) {
    const display = displayPathOf(file, cwd)
    const rootRel = rootRelOf(file, root)
    if (!globDecision(display, rootRel, parsed.globPatterns)) continue
    let content
    try {
      const st = statSync(file)
      if (!st.isFile() || st.size > MAX_FILE_BYTES) continue
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (isBinary(file)) continue
    const fileLines = content.split('\n')
    if (fileLines.length > 0 && fileLines[fileLines.length - 1] === '') fileLines.pop()
    let fileMatched = false
    for (let n = 0; n < fileLines.length; n += 1) {
      const text = fileLines[n]
      if (!pattern.test(text)) continue
      if (!fileMatched) {
        lines.push(JSON.stringify({ type: 'begin', data: { path: { text: display } } }))
        fileMatched = true
      }
      lines.push(JSON.stringify({
        type: 'match',
        data: {
          path: { text: display },
          line_number: n + 1,
          lines: { text: `${text}\n` },
          submatches: [{ match: { text: text.slice(0, 512) }, start: 0, end: Math.min(text.length, 512) }],
        },
      }))
      anyMatch = true
    }
    if (fileMatched) lines.push(JSON.stringify({ type: 'end', data: { path: { text: display } } }))
  }
  if (!anyMatch) return { stdout: '', stderr: '', exitCode: 1, signal: null }
  return { stdout: `${lines.join('\n')}\n`, stderr: '', exitCode: 0, signal: null }
}

/**
 * 顶层入口：解析并执行，返回收集器写入所需的完整结果。
 * @param {{ cwd: string }} spec - spawn spec（用 cwd 与 argv）。
 * @returns {{ stdout: string, stderr: string, exitCode: number, signal: null }}
 */
export function runRipgrepEmulation(spec) {
  const parsed = parseRgArgs(spec.argv)
  return parsed.mode === 'files' ? runFilesMode(spec, parsed) : runJsonMode(spec, parsed)
}
