/**
 * `AndroidTerminalHandle` — PTY terminal-process handle for `@dsh-android/subprocess`.
 *
 * Implements the upstream `SubprocessTerminalHandle` contract
 * (`packages/subprocess/subprocess/src/types.ts`) by wrapping one node-pty
 * `IPty` process. This is a deliberately minimal, self-contained handle: it
 * does NOT transplant the desktop `LocalTerminalHandle`
 * (`subprocess-local/src/terminal.ts`), whose process-inspector / linux-scope /
 * managed-owner machinery depends on landlock containment and /proc session
 * inspection Android has no use for. Everything the browser terminal panel
 * (terminal-controller) drives — output, write, resize, terminate, done,
 * retention activity — is implemented here against node-pty.
 *
 * Platform truths (constitution C2 / C3):
 * - `inspectActivity()` conservatively reports `{ state: 'unknown' }` so the
 *   host's retention cannot auto-reclaim a live terminal. It does not pretend
 *   to know idleness we cannot faithfully observe.
 * - `inspectForeground()`/`signalForeground()` are not used by the browser
 *   panel; they return the safe "absent"/not-supported path rather than
 *   faking process-group signalling.
 * - Load/fork failures surface as structured errors and are never papered over
 *   by a pipe-backed fake terminal.
 *
 * @module @dsh-android/subprocess/terminal
 */

import { PassThrough } from 'node:stream'
import { constants } from 'node:os'

/** Named-signal decoder (mirrors upstream `subprocess-local/src/terminal.ts`). */
function signalName(number) {
  if (number === undefined || number === 0) return null
  for (const [name, value] of Object.entries(constants.signals)) {
    if (value === number) return name
  }
  return null
}

/**
 * A PTY-backed `SubprocessTerminalHandle`.
 *
 * @implements {import('./types.js').SubprocessTerminalHandle}
 */
export class AndroidTerminalHandle {
  /** @type {number} */
  pid

  /** @type {import('node:stream').PassThrough} */
  output

  /** @type {Promise<{ exitCode: number|null, signal: string|null }>} */
  done

  /**
   * @param {import('node-pty').IPty} terminal - allocated node-pty process.
   * @param {{ graceMs?: number }} [options]
   */
  constructor(terminal, options = {}) {
    /** @private */
    this.terminal = terminal
    /** @private */
    this.graceMs = Number.isFinite(options.graceMs) && options.graceMs > 0 ? options.graceMs : 3000

    this.pid = terminal.pid
    this.output = new PassThrough()

    const outcome = Promise.withResolvers()
    this.done = outcome.promise

    /** @private */
    this.outcome = outcome
    /** @private */
    this.exited = false
    /** @private */
    this.outputPaused = false

    const resume = () => {
      if (!this.outputPaused) return
      this.outputPaused = false
      if (!this.exited) this.terminal.resume()
    }
    this.output.on('drain', resume)
    this.output.once('close', () => this.output.off('drain', resume))

    /** @private */
    this.dataDisposable = terminal.onData((data) => {
      if (!this.output.write(Buffer.from(data, 'utf8')) && !this.outputPaused) {
        this.outputPaused = true
        terminal.pause()
      }
    })
    /** @private */
    this.exitDisposable = terminal.onExit(({ exitCode, signal }) => {
      if (this.exited) return
      this.exited = true
      this.output.end()
      this.outcome.resolve({
        exitCode: signal === undefined || signal === 0 ? exitCode : null,
        signal: signalName(signal),
      })
    })
  }

  /** node-pty has not yet published the top-level exit event. */
  get running() {
    return !this.exited
  }

  /** @private */
  assertOpen() {
    if (this.exited) throw new Error(`terminal process has exited (pid ${this.pid})`)
  }

  /**
   * Write raw input bytes to the PTY master.
   * @param {string} data
   * @returns {Promise<void>}
   */
  async write(data) {
    this.assertOpen()
    this.terminal.write(data)
  }

  /**
   * Resize the PTY so the child shell sees a new `TIOCSWINSZ`.
   * @param {number} cols @param {number} rows
   * @returns {Promise<void>}
   */
  async resize(cols, rows) {
    this.assertOpen()
    this.terminal.resize(cols, rows)
  }

  /**
   * Foreground process-group introspection is not available on this handle.
   * The browser panel never requires it; absence is an honest answer.
   * @returns {Promise<undefined>}
   */
  async inspectForeground() {
    return undefined
  }

  /**
   * Conservatively report no known activity state so the host retention never
   * auto-reclaims a terminal it cannot faithfully classify.
   * @returns {Promise<{ state: 'unknown', revision: number }>}
   */
  async inspectActivity() {
    return { state: 'unknown', revision: 0 }
  }

  /**
   * Process-group signalling is unsupported on this handle (no fake).
   * @returns {Promise<never>}
   */
  async signalForeground() {
    throw new Error('subprocess-android: signalForeground is not supported (no process-group signalling)')
  }

  /**
   * Idempotently TERM then KILL the shell and await settlement.
   * @returns {Promise<void>}
   */
  async terminate() {
    if (this.cleanup !== undefined) return this.cleanup
    if (this.outputPaused) {
      this.outputPaused = false
      this.terminal.resume()
    }
    const clean = this.closeOnce().then(() => {})
    this.cleanup = clean
    void clean.catch(() => { this.cleanup = undefined })
    return clean
  }

  /** @private */
  kill(signal) {
    try {
      this.terminal.kill(signal)
    } catch {
      // Delivery races exit; teardown stays idempotent (upstream semantics).
    }
  }

  /** @private */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** @private */
  async closeOnce() {
    if (!this.exited) {
      this.kill('SIGTERM')
      const waitFor = () =>
        new Promise((resolve) => {
          const timer = setInterval(() => {
            if (this.exited) {
              clearInterval(timer)
              resolve(true)
            }
          }, 25)
          setTimeout(() => {
            clearInterval(timer)
            resolve(false)
          }, this.graceMs)
        })
      const exited = await waitFor()
      if (!exited && !this.exited) this.kill('SIGKILL')
    }
    // Wait at most graceMs more for the exit event, then settle the outcome if
    // the exit event never arrived (killed shell that could not signal).
    await Promise.race([this.done.then(() => undefined), this.sleep(this.graceMs)])
    this.dataDisposable.dispose()
    this.exitDisposable.dispose()
    if (!this.exited) {
      this.exited = true
      this.output.end()
      this.outcome.resolve({ exitCode: null, signal: null })
    }
  }
}

export default AndroidTerminalHandle
