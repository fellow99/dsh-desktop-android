/**
 * pnpm runner: runs the real `pnpm` CLI binary (aosp-pnpm-cli, 112-cli-integration)
 * as a child process and adapts it to the market's `DesktopPnpmLike.runPlugin`
 * handle (`{ stdout, stderr, done, cancel }`).
 *
 * Replaces the worker-thread + pure-JS pnpm (v10) engine of specs/110:
 * `DSH_PNPM_ENGINE` now names the `$HOME/bin/pnpm` symlink → nativeLibraryDir
 * `libpnpm_cli.so` (the exec-type Rust binary). pnpm 12+ runs its lifecycle
 * scripts with the `node` on PATH (cli-env farm guarantees it).
 *
 * Design notes (see `docs/pnpm+dsh-market.md` §3.3):
 * - Completion signal is the **child exit code** (same contract as the worker's).
 * - One operation at a time: a second concurrent call throws synchronously with
 *   the busy message the market classifies as `busy`.
 *
 * @module @dsh-android/market/pnpm-inprocess
 */

import { statSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'

/** Busy message the market matches on (`dsh-market/src/dsh-cli.ts:1395-1405`). */
export const BUSY_MESSAGE = 'another desktop pnpm operation is already running'

/** Token of the operation currently holding the single-flight gate. */
let activeOperation = null

/** Facts of the most recent operation, for `--inspect` diagnostics. */
let lastRun = null

/**
 * The pnpm engine entry, from `DSH_PNPM_ENGINE` (set by cli-env / host-boot:
 * `$HOME/bin/pnpm` → nativeLibraryDir/libpnpm_cli.so).
 * @param {NodeJS.ProcessEnv} [env] - environment, injectable for tests.
 * @returns {string | null} the entry path, or null when unset.
 */
export function resolveEngineEntry(env = process.env) {
  const entry = env.DSH_PNPM_ENGINE
  return typeof entry === 'string' && entry !== '' ? entry : null
}

/**
 * Whether a path is a usable pnpm engine entry: an existing, non-empty file
 * (symlink to the CLI binary counts; statSync follows it).
 * @param {string | null} entry - candidate path.
 * @returns {boolean} true when usable.
 */
export function assertPnpmEngine(entry) {
  if (typeof entry !== 'string' || entry === '') return false
  try {
    const stat = statSync(entry)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

/** Facts of the most recent operation (or null). */
export function getLastRun() {
  return lastRun
}

/** Whether an operation is running right now. */
export function isRunning() {
  return activeOperation !== null
}

/**
 * Compose the argv the pnpm CLI expects. `--dir` makes the launched profile
 * authoritative regardless of process.cwd() (which is `/` on device).
 * @param {string} entry - engine entry path (the pnpm binary).
 * @param {readonly string[]} args - market argv.
 * @param {string} dir - absolute profile directory.
 * @param {string} execPath - ignored (kept for signature compatibility).
 * @returns {string[]} argv for the pnpm child process.
 */
export function composeArgv(entry, args, dir, execPath) {
  return [entry, ...args.map((value) => String(value)), '--dir', dir]
}

/**
 * Probe whether the pnpm engine can start and answer `--version`.
 * @param {number} [timeoutMs] - budget; the probe never outlives it.
 * @returns {Promise<{ ok: boolean, detail?: string }>} probe facts, never throws.
 */
export function probeWorker(timeoutMs = 5000) {
  const entry = resolveEngineEntry()
  if (!assertPnpmEngine(entry)) {
    return Promise.resolve({ ok: false, detail: `pnpm engine entry not found: ${entry ?? '(unset)'}` })
  }
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve({ ok: false, detail: `probe timed out after ${timeoutMs} ms` }) }
    }, timeoutMs)
    timer.unref?.()
    try {
      const child = spawn(entry, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (c) => { out += c })
      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, detail: error instanceof Error ? error.message : String(error) })
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(code === 0 ? { ok: true, detail: out.trim() } : { ok: false, detail: `probe exited (code ${String(code)})` })
      })
    } catch (error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, detail: error instanceof Error ? error.message : String(error) })
    }
  })
}

/**
 * Run one pnpm command (spawn the real pnpm binary).
 *
 * @param {readonly string[]} args - pnpm argv, e.g. `['add', '-w', 'pkg@1.2.3']`.
 * @param {{ dir?: string, entry?: string, signal?: AbortSignal }} [options]
 *   `dir` is the launched profile directory.
 * @returns {{ stdout: import('node:stream').PassThrough, stderr: import('node:stream').PassThrough,
 *   done: Promise<{ exitCode: number | null, signal: NodeJS.Signals | null }>, cancel: () => void }}
 * @throws {Error} when another operation is already running (market reads this as `busy`).
 */
export function runPnpmInProcess(args, options = {}) {
  if (activeOperation !== null) {
    throw new Error(BUSY_MESSAGE)
  }

  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const entry = options.entry ?? resolveEngineEntry()
  const dir = options.dir
  const token = Symbol('pnpm operation')
  let settled = false
  let cancelled = false
  let resolveDone
  let onAbort
  /** Accumulated child stderr, for host-side diagnostics on failure. */
  let capturedStderr = ''
  const done = new Promise((resolve) => {
    resolveDone = resolve
  })

  const finish = (result) => {
    if (settled) return
    settled = true
    if (activeOperation === token) activeOperation = null
    if (options.signal !== undefined && onAbort !== undefined) options.signal.removeEventListener('abort', onAbort)
    lastRun = { args: args.map((value) => String(value)), dir: dir ?? null, exitCode: result.exitCode, at: Date.now() }
    if (capturedStderr !== '') {
      console.error(`[market-pnpm] pnpm failed (exit ${String(result.exitCode)}):\n${capturedStderr.slice(-8000)}`)
    }
    stdout.end()
    stderr.end()
    resolveDone(result)
  }

  const failNow = (code, message) => {
    queueMicrotask(() => {
      stderr.write(message)
      finish({ exitCode: code, signal: null })
    })
    return { stdout, stderr, done, cancel() {} }
  }

  if (typeof dir !== 'string' || dir.trim() === '') {
    return failNow(127, '[market-pnpm] no profile directory; refusing to run pnpm\n')
  }
  if (!assertPnpmEngine(entry)) {
    return failNow(
      127,
      `[market-pnpm] pnpm engine entry not found: ${entry ?? '(unset)'} (DSH_PNPM_ENGINE)\n`
      + '[market-pnpm] the engine is the aosp-pnpm-cli binary wired by payload/cli-env.js ($HOME/bin/pnpm)\n',
    )
  }

  const argv = composeArgv(entry, args, dir, process.execPath)
  activeOperation = token

  let child
  try {
    child = spawn(entry, argv.slice(1), {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: 'true',
        npm_config_package_import_method: 'copy',
        pnpm_config_package_import_method: 'copy',
        npm_config_registry: process.env.npm_config_registry ?? process.env.DSH_ANDROID_REGISTRY,
        XDG_CACHE_HOME: join(dir, '.pnpm-cache'),
        XDG_DATA_HOME: join(dir, '.pnpm-cache'),
        XDG_STATE_HOME: join(dir, '.pnpm-cache'),
        TMPDIR: join(dir, '.pnpm-cache', 'tmp'),
      },
    })
  } catch (error) {
    activeOperation = null
    const detail = error instanceof Error ? error.message : String(error)
    return failNow(127, `[market-pnpm] pnpm could not start: ${detail}\n`)
  }

  child.stdout.on('data', (chunk) => stdout.write(chunk))
  child.stderr.on('data', (chunk) => {
    capturedStderr += String(chunk)
    if (capturedStderr.length > 24000) capturedStderr = capturedStderr.slice(-24000)
    stderr.write(chunk)
  })
  child.on('error', (error) => {
    const text = `[market-pnpm] pnpm error: ${error && error.stack ? error.stack : String(error)}\n`
    capturedStderr += text
    stderr.write(text)
    console.error(text)
  })
  child.on('close', (code, signal) => {
    if (cancelled) {
      stderr.write('[market-pnpm] cancelled: the pnpm operation was terminated\n')
      finish({ exitCode: code === 0 || code === null ? 1 : code, signal })
      return
    }
    finish({ exitCode: code ?? 1, signal })
  })

  const kill = () => {
    cancelled = true
    try { child.kill('SIGKILL') } catch { /* already gone */ }
  }
  onAbort = kill
  if (options.signal !== undefined) {
    if (options.signal.aborted) kill()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    stdout,
    stderr,
    done,
    cancel() {
      kill()
    },
  }
}
