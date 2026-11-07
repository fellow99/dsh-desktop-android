English | [中文](./README_zh.md)

# `@dsh-android/git`

> Git integration for the Android edition of DSH Desktop (`specs/112-cli-integration`): the real
> **aosp-git-cli binary** (resolved through the `$HOME/bin` symlink farm wired by
> `payload/cli-env.js`) is the execution engine, and the host ships just **one `git` passthrough
> tool** that hands argv straight to the real binary. The 21 per-verb tools (originally the
> isomorphic-git implementation of `dsh-desktop-hos/plugins/harmony-plugin-git`) have been
> collapsed into that layer; the pure-JS closure is no longer bundled.

## Deliverables

| Face | Content |
|---|---|
| Host (`lib/index.js` + `lib/tools/git.js`) | **1 tool**: `git` — `argv` (the command line after `git`) + optional `dir`/`timeoutMs`; returns `code`/`root`/`stdout`/`stderr` |
| Client (`lib/client.js`) | Settings page "Git 凭据" (Git credentials): save / view / delete (`settings.section`, id `git-credentials`) |

A single `@dsh-android/bundle` `insert` line delivers both (tool registration on the host plane;
the settings page is discovered by `dsh.client` scanning).

## Tool semantics

`git` passes `argv` verbatim to the real binary; the working directory is the fence-resolved
repository root. Deliberately faithful: **a non-zero exit code is not treated as an error** —
`git diff --exit-code` or `git status --short` returning 1 is a value the model must see. Only two
failures are mapped to readable errors:

- missing/refused authentication → names `GIT_CREDENTIAL_<HOST>` (Settings → Git 凭据) instead of a bare 401;
- not a git repository → suggests `git init` / `git clone`.

**argv confinement**: options that would let git open a repository outside the root are refused
(`--git-dir` / `--work-tree` / `--exec-path` / `--separate-git-dir` / `--config-env=`); `-C` with an
absolute path must stay inside the fenced root (relative subdirectories are allowed).

## Config (`Config`, schemastery)

| Key | Default | Description |
|---|---|---|
| `networkTimeoutMs` | `300000` | Wall-clock budget per `git` call (overridable per call via `timeoutMs`) |

## Credentials

- Ref name: `GIT_CREDENTIAL_<HOST>`, `<HOST>` = `host[:port]` upper-cased, non-alphanumerics → `_`;
  value = `username:password` (split on the **first** `:`).
- The real `git` reads credentials via `credential.helper=store --file=$DSH_HOME/.git-credentials`;
  `lib/git-credentials.js` maintains that file in git's native format (one URL-with-userinfo per
  line, `0600`, temp-file + rename).
- The `git` tool **pre-mirrors** credentials for every http(s) URL in argv before spawning:
  `credentials.lookup(url)` syncs the settings-page store into that file (best effort; a failure
  never fails the operation). Copying `$DSH_HOME` lets `git` elsewhere use the same credentials.
- Cleartext never enters the conversation, logs, or `cordis.patch.yml`; remote addresses have their
  userinfo scrubbed before they reach output.
- Identity (`user.name`/`user.email`) stays out of the credential store.

## Fence

Each call resolves `dir` (default: the session directory) through `ctx.fs` to an absolute
**repository root**, and `git` runs only inside that root:

- root inside the session workspace → runs freely;
- root outside → `FS_SANDBOX_DENIED` with the shared marker and escalation hint; a model retry
  carrying `sandbox_permissions` + `justification` goes through the existing approval channel,
  one-shot.

**Known trade-off**: writes *inside* the repository are not re-checked per call against
`fs-sandbox.checkedTarget` (`git` is an independent process); the fence granularity is the
repository root plus argv confinement (still stricter than the unconstrained `bash` tool).

## Known limitations

- **No SSH**: only http(s) transport; `git@host:path` and `ssh://` are out of scope this round
  (aosp-git-cli side, phase 2).
- Unauthenticated http(s) remotes fail immediately (`GIT_TERMINAL_PROMPT=0`), never hanging on an
  interactive prompt.
- Plain `http://` remotes send Basic credentials base64-encoded over the wire; use `https://` in
  production.
- The settings page cannot enumerate refs (the credential API has no enumeration face); the
  "entered hosts" list lives in page `localStorage`, and the page origin changes every launch, so
  the list is empty after a restart (stored credentials are unaffected).

## Spec & acceptance

`specs/112-cli-integration/` (spec / plan / tasks / test-cases); device acceptance records under
`logs/`. The upstream same-contract sources (isomorphic-git edition, untouched by 112) live at
`dsh-desktop-hos/plugins/harmony-plugin-git` and `dsh-desktop-ark/packages/git-ohos`.
