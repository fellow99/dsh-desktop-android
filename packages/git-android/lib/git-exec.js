/**
 * 112-cli-integration（US3 / FR-112-4）：真实 `git` 二进制执行器。
 *
 * 替代 isomorphic-git：21 工具改为在仓库根 spawn 真实 `git` 子进程（经 PATH/农场解析，
 * 见 payload/cli-env.js 的 $HOME/bin 符号链接农场）。要点：
 *
 * - 环境注入（GIT_CONFIG_GLOBAL / GIT_TEMPLATE_DIR / GIT_EXEC_PATH / SSL_CERT_FILE / PATH）
 *   从 process.env 继承（cli-env 已注入）；
 * - 凭据走 `credential.helper=store --file=$DSH_HOME/.git-credentials`（lib/git-credentials.js
 *   已按 git credential-store 格式维护该文件，0600、temp+rename）；
 * - `GIT_TERMINAL_PROMPT=0` + `GIT_ASKPASS=true`：无凭据时直接失败，绝不挂起等待交互输入；
 * - 超时（networkTimeoutMs）+ abort（exec.signal）；错误文本脱敏（scrubUrl 语义）。
 *
 * @module @dsh-android/git/git-exec
 */
import { spawn } from 'node:child_process'
import { existsSync, accessSync, constants as fsConstants } from 'node:fs'
import { gitCredentialsPath } from './git-credentials.js'
import { scrubUrl } from './url.js'

/** 从 PATH 解析 git（农场软链 → nativeLibraryDir/libgit_cli.so）；找不到回退裸名（交给 spawn 报）。 */
export function resolveGitBinary() {
  for (const dir of String(process.env.PATH ?? '').split(':').filter((d) => d !== '')) {
    const candidate = `${dir}/git`
    try {
      accessSync(candidate, fsConstants.X_OK)
      return candidate
    } catch { /* try next dir */ }
  }
  return 'git'
}

/** 将错误文本中的 `scheme://user:pwd@` 脱敏为 `scheme://***@`。 */
function scrubErrorText(text) {
  return String(text)
    .replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, `$1${'***'}@`)
}

/** 非零退出 / 找不到仓库的独立错误类型，供工具 catch 统一映射。 */
export class GitExecutionError extends Error {
  constructor(cwd, args, result) {
    const detail = String(result.stderr || `exit ${result.code}`).trim().slice(0, 2000)
    super(`@dsh-android/git: \`git ${args[0] ?? ''}\` failed in ${cwd}:\n${scrubErrorText(detail)}`, { cause: result })
    this.name = 'GitExecutionError'
    this.code = 'git-error'
    this.exitCode = result.code
    this.stderr = String(result.stderr || '')
    this.notARepo = /not a git repository/i.test(detail)
    this.authFailed = /Authentication failed|could not read Password|fatal: could not read Username/i.test(detail)
  }
}

/**
 * 运行一次 `git <args>`（cwd=仓库根）。非零退出不抛，由调用方决定语义。
 * @param {object} options
 * @param {string} options.cwd - 仓库根（已由 fence 校验）。
 * @param {Array<string>} options.args - 传给 git 的参数（不含 `git`）。
 * @param {object} [options.env] - 附加 env；默认继承 process.env（含 cli-env 注入）。
 * @param {number} [options.timeoutMs] - 整命令预算（networkTimeoutMs）。
 * @param {AbortSignal} [options.signal] - 调用方 abort。
 * @returns {Promise<{ code: number, stdout: string, stderr: string, timedOut: boolean, aborted: boolean, git: string }>}
 */
export function runGit({ cwd, args, env, timeoutMs = 5 * 60 * 1000, signal }) {
  const git = resolveGitBinary()
  const commandArgs = [
    '-c', `credential.helper=store --file=${gitCredentialsPath()}`,
    '-c', 'core.quotepath=off',
    '-c', 'color.ui=never',
    '-c', 'i18n.logOutputEncoding=UTF-8',
    ...args,
  ]
  const childEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'true',
    ...env,
  }
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(git, commandArgs, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: String(error.message), timedOut: false, aborted: false, git })
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    let timedOut = false
    let settled = false
    const kill = () => { try { child.kill('SIGKILL') } catch { /* ignore */ } }
    const timer = setTimeout(() => { timedOut = true; kill() }, timeoutMs)
    const onAbort = () => { if (!settled) kill() }
    if (signal !== undefined) {
      if (signal.aborted) { onAbort() } else { signal.addEventListener('abort', onAbort, { once: true }) }
    }
    const finish = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve({ code, stdout, stderr, timedOut, aborted: signal?.aborted === true, git })
    }
    child.on('error', (error) => finish(-1))
    child.on('close', (code) => finish(code ?? -1))
  })
}

/** 断言退出码 0；否则抛 {@link GitExecutionError}。 */
export async function runGitOk(options) {
  const result = await runGit(options)
  if (result.code !== 0 || result.timedOut || result.aborted) {
    throw new GitExecutionError(options.cwd, options.args, result)
  }
  return result
}

/** 查询辅助：当前分支（符号名；detached/未生/非仓库 → ''）。 */
export async function currentBranch(cwd, env) {
  const r = await runGit({ cwd, args: ['symbolic-ref', '--quiet', '--short', 'HEAD'], env, timeoutMs: 15000 })
  return r.code === 0 ? r.stdout.trim() : ''
}

/** 查询辅助：HEAD 完整 oid（未生/非仓库 → ''）。 */
export async function headOid(cwd, env) {
  const r = await runGit({ cwd, args: ['rev-parse', 'HEAD'], env, timeoutMs: 15000 })
  return r.code === 0 ? r.stdout.trim() : ''
}

/** 查询辅助：解析 `rev` 为完整 oid；无法解析抛错（含缩写 oid 支持，天然由 git 提供）。 */
export async function resolveRev(cwd, rev, env) {
  const r = await runGit({ cwd, args: ['rev-parse', '--verify', `${rev}^{commit}`], env, timeoutMs: 15000 })
  if (r.code !== 0) {
    throw new Error(`@dsh-android/git: "${rev}" cannot be resolved in ${cwd} (${String(r.stderr).trim()}). `)
  }
  return r.stdout.trim()
}

/** 查询辅助：配置的 remote 列表 [{remote,url}]。 */
export async function listRemotes(cwd, env) {
  const r = await runGit({ cwd, args: ['remote'], env, timeoutMs: 15000 })
  const names = r.code === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : []
  const out = []
  for (const name of names) {
    const urlRun = await runGit({ cwd, args: ['remote', 'get-url', name], env, timeoutMs: 15000 })
    if (urlRun.code === 0 && urlRun.stdout.trim() !== '') {
      out.push({ remote: name, url: urlRun.stdout.trim() })
    }
  }
  return out
}

/** 判定一个非零结果是否可归因到"目录不是 git 仓库"（供 fence.mapError 语义）。 */
export function isNotARepository(result) {
  return /not a git repository/i.test(String(result.stderr || ''))
}

export { scrubUrl }
