/**
 * 112-cli-integration（FR-112-4 修订）：单一 `git` passthrough 工具。
 *
 * 前置背景见 `specs/112-cli-integration/spec.md` FR-112-4 —— 21 个按动词封装的工具由
 * 一个把 argv 直接交给真实 `git` 二进制的工具取代（后端与 `git-exec.js` 相同）。LLM 本就
 * 精通 git 命令，本工具保留三件必须的运行时信封，其余像普通终端一样如实放行：
 *
 * - **仓库围栏**（`fence.open`）：解析 `dir`（默认会话目录）得到仓库根；越出会话工作区
 *   走升级审批。`ctx.fs` 的按调用沙箱拦不住独立 `git` 进程的 `.git` 直写，根上的这层
 *   裁决是唯一真正的遏制点（见 fence.js 头注释）。
 * - **凭据前置 mirror**：argv 里出现 http(s) URL 时先 `credentials.lookup(url)`，把设置页
 *   存的 `GIT_CREDENTIAL_<HOST>`（`<username>:<password>`）同步进 `$HOME/.git-credentials`
 *   （git credential-store 原生格式，0600，temp+rename），真实 `git` 经
 *   `credential.helper=store --file=…` 读取。
 * - **argv 护栏**：拒绝会让 git 打开仓库外的选项（`--git-dir` / `--work-tree` / `--exec-path`
 *   / `--separate-git-dir` / `--config-env=`）；`-C` 的绝对路径必须落在栅栏根内。
 *
 * 输出策略刻意"如实"：非零退出码、stdout、stderr 原样回给模型 —— `git diff --exit-code`
 * 与 `git status --short` 返回 1 是模型需要的**值**，不是错误。仅两类失败映射为可读错误：
 * 认证缺失（提示 `GIT_CREDENTIAL_<HOST>` 存储名）与目标不是仓库（提示 `git init`）。
 *
 * @module @dsh-android/git/tools/git
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { runGit, isNotARepository } from '../git-exec.js'
import { scrubUrl } from '../url.js'
import { isWithin } from '../fence.js'

/** An absolute path on this platform's separator. */
const ABSOLUTE_PATH = /^\//
/** A git remote URL with a scheme this deployment can actually reach. */
const URL_TOKEN = /^https?:\/\//i
/** stderr phrases that mean "the server demanded credentials and got none". */
const AUTH_FAILED = /could not read (?:Username|Password)|Authentication failed/i

/** Options that would let git base its operation on a directory other than the fenced root. */
const FORBIDDEN_OPTIONS = new Set([
  '--git-dir',
  '--work-tree',
  '--exec-path',
  '--separate-git-dir',
])
/** The same options written as `--flag=value`, plus config loaded from an env path. */
const FORBIDDEN_PREFIXES = [
  '--git-dir=',
  '--work-tree=',
  '--exec-path=',
  '--separate-git-dir=',
  '--config-env=',
]

/**
 * Refuse argv that would aim git at a repository outside the fenced root.
 *
 * The fence already confined the *working directory* to one repository root; these options
 * would let a single command escape it (`--git-dir=/data/…` opens another repository, `-C
 * /sdcard` changes the working directory before the subcommand runs). `-C` with a **relative**
 * or root-relative path stays inside and is allowed — operating on a subdirectory of the
 * repository is legitimate. Everything else (pathspecs, refs, `-c name=value`, `--bare`, …)
 * stays confined to the repository root by construction.
 *
 * @param argv - the model-supplied command line (after `git`).
 * @param root - the fenced repository root.
 * @returns true.
 * @throws Error describing the refused option.
 */
function guardArgv(argv, root) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error('@dsh-android/git: `argv` is required and must name at least one git subcommand.')
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (typeof token !== 'string' || token === '') {
      throw new Error('@dsh-android/git: every `argv` item must be a non-empty string.')
    }
    if (FORBIDDEN_OPTIONS.has(token)) {
      throw new Error(
        `@dsh-android/git: "${token}" is not allowed in a session-confined git call; `
        + 'run the operation inside the session repository instead.',
      )
    }
    for (const prefix of FORBIDDEN_PREFIXES) {
      if (token.startsWith(prefix)) {
        throw new Error(
          `@dsh-android/git: "${prefix}…" is not allowed in a session-confined git call; `
          + 'run the operation inside the session repository instead.',
        )
      }
    }
    if (token === '-C') {
      const value = argv[index + 1]
      if (typeof value !== 'string' || value === '') {
        throw new Error('@dsh-android/git: "-C" requires a directory argument.')
      }
      if (ABSOLUTE_PATH.test(value) && !isWithin(root, value)) {
        throw new Error(
          `@dsh-android/git: "-C ${value}" points outside the fenced repository root `
          + `"${root}" and was refused.`,
        )
      }
      index += 1
    }
  }
  return true
}

/**
 * The http(s) remote URLs named in an argv, in order.
 * @param argv - the model-supplied command line.
 * @returns the URL tokens.
 */
function findRemoteUrls(argv) {
  return argv.filter((token) => typeof token === 'string' && URL_TOKEN.test(token))
}

/**
 * Register the single `git` passthrough tool.
 * @param ctx - the plugin context; `ctx.tools` receives the registration.
 * @param deps - shared collaborators.
 * @param deps.fence - the repository fence (root veto + escalation + error mapping).
 * @param deps.credentials - the credential lookup (settings-page store → `.git-credentials`).
 */
export function applyGitTool(ctx, deps) {
  ctx.tools.register(defineTool({
    name: 'git',
    description: 'Run a real `git` command in the session, exactly as in a desktop terminal. '
      + '`argv` is the command line after `git`: ["status", "--short"], ["log", "--oneline", "-n", "10"], '
      + '["add", "-A"], ["commit", "-m", "…"], ["clone", "https://…", "dir"], ["push"] and so on. The command runs '
      + 'with the working directory at the fenced repository root inside the session workspace; a directory outside '
      + 'that root is refused until a one-shot escalation is approved. Options that open a repository outside the '
      + 'root (--git-dir, --work-tree, --exec-path, -C with an absolute outside path) are refused. Only http(s) '
      + 'transport is available (no SSH). For a private remote, store "<username>:<password>" under '
      + 'GIT_CREDENTIAL_<HOST> first (Settings → Git 凭据, or $DSH_HOME/.credentials.yaml); a missing or refused '
      + 'credential is reported with that exact name instead of a bare 401. The exit code is returned, not thrown — '
      + '`git diff --exit-code` or `git status --short` returning 1 is a value, not an error.',
    parameters: {
      argv: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: 'The git command line after `git`, e.g. ["status"] or ["clone", "https://git.example.com/team/project.git", "project"].',
      },
      dir: {
        type: 'string',
        description: 'Directory the repository root is resolved from (default: the session workspace).'
          + ' For `init`/`clone`, name where the repository should live.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Wall-clock budget in milliseconds (default: the deployment network timeout).'
          + ' Long-running commands time out and report how long they ran instead of hanging.',
      },
      ...deps.fence.escalationFields(),
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'number', required: true },
          root: { type: 'string', required: true },
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `exit ${value.code}`,
          value.root === '' ? '' : `root: ${value.root}`,
          value.stdout,
          value.stderr,
        ]
          .filter((part) => String(part).trim() !== '')
          .join('\n'),
      }],
    },
    async execute(args, exec) {
      let opened
      try {
        const dir = args.dir ?? exec.agent?.session.header.cwd ?? '.'
        opened = await deps.fence.open('git', args, exec, dir)
        const argv = args.argv
        guardArgv(argv, opened.root)

        // Credential pre-mirror: sync the settings-page store into git's own credential file for
        // every remote this command names, so the real binary finds its credentials without the
        // first attempt failing a 401. Best effort on purpose (the store is the source of truth).
        for (const url of findRemoteUrls(argv)) {
          try { await deps.credentials.lookup(url) } catch { /* keep going */ }
        }

        const timeoutMs = args.timeoutMs ?? deps.config.networkTimeoutMs
        const result = await runGit({
          cwd: opened.root,
          args: argv,
          signal: exec.signal,
          timeoutMs,
        })
        const stdout = scrubUrl(result.stdout.trim())
        const stderr = scrubUrl(result.stderr.trim())

        if (result.code === 0 && !result.timedOut && !result.aborted) {
          return { code: 0, root: opened.root, stdout, stderr }
        }
        if (result.timedOut) {
          throw new Error(
            `@dsh-android/git: \`git ${argv[0] ?? ''}\` did not finish within ${Math.round(timeoutMs / 1000)}s `
            + 'and was aborted.',
          )
        }
        if (result.aborted || exec.signal.aborted) throw exec.signal.reason ?? new Error('aborted')

        const urls = findRemoteUrls(argv)
        if (urls.length > 0 && AUTH_FAILED.test(stderr)) {
          // Distinguish "no credential configured" from "the stored credential was rejected":
          // the remedy differs (create vs update), and re-using the missing message on a rejection
          // would send the user looking for the wrong fix.
          const url = urls[0]
          const stored = await deps.credentials.storeLookup(url)
          throw new Error(
            stored === undefined ? deps.credentials.missingMessage(url) : deps.credentials.rejectedMessage(url),
          )
        }
        if (isNotARepository(result)) {
          throw new Error(
            '@dsh-android/git: this directory is not a git repository. Use `git init` to create one here, '
            + 'or `git clone <url> <dir>` to fetch an existing one.',
          )
        }

        // Anything else is a normal git result the model must read for itself.
        return { code: result.code, root: opened.root, stdout, stderr }
      } catch (error) {
        if (exec.signal.aborted) throw error
        throw deps.fence.mapError(error, opened?.policy)
      }
    },
  }))
}
