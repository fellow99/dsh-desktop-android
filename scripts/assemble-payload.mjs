#!/usr/bin/env node
/**
 * 装配载荷（Android 版）：把上游 dsh 运行树变成可随包分发的 `build/payload-stage/root/`。
 *
 * 结构（= Kotlin 解包后的 payload/<sha12>/ 内容）：
 *   root/
 *   ├── bootstrap.js / host.js / shims/      ← 本工程 payload/（正式载荷）
 *   ├── dsh.version                          ← 由 package-payload 生成后再回填（两段式）
 *   └── dsh/                                 ← 运行树：node_modules + profiles/android
 *
 * 输入：--deploy（从 ../deepseek-harness 物化，pnpm deploy --legacy + 补全 + web dist）
 * 覆盖层：profiles/android → <run>/profiles/android；packages/*-android → node_modules/@dsh-android/<short>/
 * 垫片（§5.3）：S1 flock / S2 sharp / S3 require-builtin / S4 附件 fsync 降级
 *
 * P1 边界（诚实登记）：pnpm 引擎 / dshmarket / git 闭包不在本阶段（specs/012、201、204 ⬜），
 * profile bundles 仅 [dsh-base, dsh-web-app, @dsh-android/bundle]。
 *
 * 退出码：0 成功（含 dry-run）；1 断言/执行失败；2 缺必需输入。
 */
import { execSync } from 'node:child_process';
import {
  cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAttachmentDurabilityPatch, applyFlockShim, applySharpShim, installRequireBuiltinShim,
} from './lib/payload-shims.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
 // 001-building-workflow：上游根可经环境变量覆盖（CI 把三仓 checkout 进工作区子目录时注入）；
 // 缺省保持本地开发布局（../deepseek-harness、../dsh-market）。
 const DSH_ROOT = resolve(process.env.DSH_HARNESS_DIR ?? resolve(ROOT, '../deepseek-harness'));
const STAGE = resolve(ROOT, 'build/payload-stage/root');
const WORK = resolve(ROOT, 'build/payload-stage/.work');
const PROFILE_SRC = resolve(ROOT, 'profiles/android');
const PACKAGES_SRC = resolve(ROOT, 'packages');
const PAYLOAD_SRC = resolve(ROOT, 'payload');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const deploy = flag('--deploy');
const apply = flag('--apply');
const fresh = flag('--fresh');

function fail(code, message, next) {
  console.error(`\n[assemble-payload] ${message}`);
  if (next) console.error(`[assemble-payload] 下一步：${next}`);
  process.exit(code);
}
function log(message) {
  console.log(`[assemble-payload] ${message}`);
}
function run(command, cwd) {
  log(`$ ${command}`);
  execSync(command, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CI: process.env.CI ?? 'true', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** pnpm 在 Windows 上用 Junction 表达 workspace 链接；落到设备上会失效，故就地换成真实目录。 */
function materializeLinks(dir, depth = 0, touched = []) {
  if (depth > 8) return touched;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return touched;
  }
  for (const entry of entries) {
    if (entry.name === '.bin' || entry.name === '.pnpm') continue;
    const full = join(dir, entry.name);
    if (isSymlink(full)) {
      try {
        const target = realpathSync(full);
        rmSync(full, { recursive: true, force: true });
        cpSync(target, full, { recursive: true, dereference: true });
        touched.push(full);
      } catch (error) {
        log(`物化链接失败 ${full}：${error.message}`);
      }
    } else if (entry.isDirectory()) {
      materializeLinks(full, depth + 1, touched);
    }
  }
  return touched;
}

/**
 * 001-building-workflow（CI run#2 教训）：单趟物化会把「整棵 @scope 符号链接」经 cpSync
 * 批量拷成真实目录，但拷入子树里若仍有链接（dereference 语义差异），需要再走一趟才能清干净。
 * 迭代至某趟 0 命中（上限 3 趟）；assertNoLinks 兜底。
 */
function materializeLinksUntilClean(root, log) {
  for (let pass = 1; pass <= 3; pass++) {
    const touched = materializeLinks(root, 0, []);
    log(`物化链接第 ${pass} 趟：${touched.length} 处`);
    if (touched.length === 0) return;
  }
  log('警告：3 趟后仍有链接被转换（异常形态），交由 assertNoLinks 终判');
}

/** 复制单个 workspace 包（lib + package.json + cordis.patch.yml），排除嵌套 node_modules。 */
function copyWorkspacePackage(pkgDir, destRoot) {
  const manifest = resolve(pkgDir, 'package.json');
  if (!existsSync(manifest)) return undefined;
  let name;
  try {
    name = JSON.parse(readFileSync(manifest, 'utf8')).name;
  } catch {
    return undefined;
  }
  if (!name || !name.startsWith('@deepseek-ai/')) return undefined;
  const short = name.slice('@deepseek-ai/'.length);
  const dest = resolve(destRoot, short);
  if (existsSync(dest)) return undefined;
  cpSync(pkgDir, dest, {
    recursive: true,
    dereference: true,
    filter: (src) => !src.includes(`${sep}node_modules`) && !src.includes(`${sep}test`),
  });
  return short;
}

/** deploy 不物化 peerDependencies 与 workspace 源码包；这里按目录结构补齐。 */
function collectWorkspacePackages(stage) {
  const destRoot = resolve(stage, 'node_modules/@deepseek-ai');
  mkdirSync(destRoot, { recursive: true });
  const copied = [];
  for (const category of ['packages', 'vendor', 'apps']) {
    const dir = resolve(DSH_ROOT, category);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (existsSync(resolve(full, 'package.json'))) {
        const done = copyWorkspacePackage(full, destRoot);
        if (done) copied.push(done);
        continue;
      }
      let nested = [];
      try {
        nested = readdirSync(full);
      } catch {
        continue;
      }
      for (const child of nested) {
        const done = copyWorkspacePackage(resolve(full, child), destRoot);
        if (done) copied.push(done);
      }
    }
  }
  return copied;
}

/** .pnpm 里的非 hoisted 依赖摊平到顶层，否则设备上解析不到。 */
function collectNonHoistedDeps(stage) {
  const pnpmDir = resolve(stage, 'node_modules/.pnpm');
  const topDir = resolve(stage, 'node_modules');
  if (!existsSync(pnpmDir)) return [];
  const copied = new Set();
  const materialize = (entry, name) => {
    if (copied.has(name)) return;
    const dest = resolve(topDir, ...name.split('/'));
    if (existsSync(dest)) return;
    const nested = resolve(pnpmDir, entry, 'node_modules', ...name.split('/'));
    if (!existsSync(nested)) return;
    cpSync(nested, dest, { recursive: true, dereference: true });
    copied.add(name);
  };
  for (const entry of readdirSync(pnpmDir)) {
    const nodeModules = resolve(pnpmDir, entry, 'node_modules');
    if (!existsSync(nodeModules)) continue;
    for (const scopeOrName of readdirSync(nodeModules)) {
      const full = resolve(nodeModules, scopeOrName);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      if (scopeOrName.startsWith('@')) {
        for (const name of readdirSync(full)) materialize(entry, `${scopeOrName}/${name}`);
      } else {
        materialize(entry, scopeOrName);
      }
    }
  }
  return [...copied];
}

// ── 剪裁：只保留运行期真正会读到的文件（规则即数据）─────────────────────────
const PRUNE_DIRS = new Set([
  'test', 'tests', '__tests__', 'test-fixtures', 'fixtures',
  'docs', 'example', 'examples', 'benchmark', 'benchmarks',
]);
const PRUNE_FILE_EXT = ['.map', '.ts', '.tsx', '.mts', '.cts', '.tsbuildinfo', '.md', '.markdown'];
const ABI_SUFFIX = '(?:-(?:msvc|gnu|musl))?';
const FOREIGN_PKG = new RegExp(`-(win32|win|darwin|mac|linux|android)-(x64|ia32|arm64|arm|universal)${ABI_SUFFIX}$`);
const PLATFORM_DIR = new RegExp(`^(win32|win|darwin|mac|linux|android|freebsd|ohos)-(x64|ia32|arm64|arm|universal)${ABI_SUFFIX}$`);

function countTree(dir) {
  let files = 0;
  let bytes = 0;
  const walk = (current, depth) => {
    if (depth > 24) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else {
        files += 1;
        try {
          bytes += lstatSync(full).size;
        } catch { /* 忽略 */ }
      }
    }
  };
  walk(dir, 0);
  return { files, bytes };
}

function prunePayload(stage) {
  const nodeModules = resolve(stage, 'node_modules');
  let removedFiles = 0;
  let removedBytes = 0;
  const drop = (full, isDirectory) => {
    if (isDirectory) {
      const size = countTree(full);
      rmSync(full, { recursive: true, force: true });
      removedFiles += size.files;
      removedBytes += size.bytes;
    } else {
      try {
        removedBytes += lstatSync(full).size;
      } catch { /* 忽略 */ }
      rmSync(full, { force: true });
      removedFiles += 1;
    }
  };
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('@')) {
          walk(full, depth + 1);
          continue;
        }
        if (PRUNE_DIRS.has(entry.name) || FOREIGN_PKG.test(entry.name) || PLATFORM_DIR.test(entry.name)) {
          drop(full, true);
          continue;
        }
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (entry.name.startsWith('LICENSE') || entry.name.startsWith('NOTICE')) continue;
        if (PRUNE_FILE_EXT.some((ext) => entry.name.endsWith(ext))) drop(full, false);
      }
    }
  };
  walk(nodeModules, 0);
  log(`剪裁：移除 ${removedFiles} 个文件 / ${(removedBytes / 1048576).toFixed(1)} MiB`);
}

/** 待装配的输入是否成立；不成立时给出下一步命令。 */
function assertDeployInputs() {
  if (!existsSync(resolve(DSH_ROOT, 'package.json'))) {
    fail(2, `上游未找到：${DSH_ROOT}`, '确认 ../deepseek-harness 处于 dsh-v0.2.1-rc.2');
  }
  const cliBin = resolve(DSH_ROOT, 'apps/cli/lib/bin.js');
  const sampleLib = resolve(DSH_ROOT, 'packages/core/agent/lib/index.js');
  const webDist = resolve(DSH_ROOT, 'apps/web/dist/index.html');
  const missing = [];
  if (!existsSync(cliBin)) missing.push('apps/cli/lib/bin.js（CLI/Host 产物）');
  if (!existsSync(sampleLib)) missing.push('packages/core/agent/lib（包产物）');
  if (!existsSync(webDist)) missing.push('apps/web/dist/index.html（Web UI 产物）');
  if (missing.length > 0) {
    fail(2, `上游未构建完整：缺少 ${missing.join('、')}`, 'cd ../deepseek-harness && pnpm build');
  }
}

function deployTree() {
  assertDeployInputs();
  const target = resolve(WORK, 'dsh');
  if (existsSync(target) && !fresh) {
    log(`复用物化树：${target}（--fresh 可重跑 pnpm deploy）`);
  } else {
    rmSync(WORK, { recursive: true, force: true });
    mkdirSync(WORK, { recursive: true });
    run(`pnpm --filter @deepseek-ai/dsh deploy --legacy "${target}"`, DSH_ROOT);
  }
  materializeLinksUntilClean(resolve(target, 'node_modules'), log);
  const workspacePackages = collectWorkspacePackages(target);
  log(`补全 @deepseek-ai 包 ${workspacePackages.length} 个`);
  const flat = collectNonHoistedDeps(target);
  log(`补全非 hoisted 依赖 ${flat.length} 个`);
  const store = resolve(target, 'node_modules/.pnpm');
  if (existsSync(store)) rmSync(store, { recursive: true, force: true });
  const webDist = resolve(DSH_ROOT, 'apps/web/dist');
  const webFrontend = resolve(target, 'node_modules/@deepseek-ai/dsh-web-frontend/dist');
  if (!existsSync(webDist)) fail(2, `缺少 Web UI 产物：${webDist}`, '在 ../deepseek-harness 执行 pnpm build');
  rmSync(webFrontend, { recursive: true, force: true });
  cpSync(webDist, webFrontend, { recursive: true });
  log('Web UI dist 已注入 dsh-web-frontend/dist');
  return target;
}

/** 本工程维护的包（packages/<name>-android/）物化为 @dsh-android/<name>。 */
function collectAndroidPackages(runTree) {
  const destRoot = resolve(runTree, 'node_modules/@dsh-android');
  mkdirSync(destRoot, { recursive: true });
  const copied = [];
  for (const entry of readdirSync(PACKAGES_SRC, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(PACKAGES_SRC, entry.name);
    const manifestPath = resolve(dir, 'package.json');
    if (!existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      fail(1, `无法解析 ${manifestPath}：${error.message}`);
    }
    if (!String(manifest.name ?? '').startsWith('@dsh-android/')) continue;
    const short = manifest.name.slice('@dsh-android/'.length);
    const dest = resolve(destRoot, short);
    rmSync(dest, { recursive: true, force: true });
    cpSync(dir, dest, {
      recursive: true,
      dereference: true,
      filter: (src) => !src.includes(`${sep}test`),
    });
    if (manifest.dsh && manifest.dsh.bundle) {
      const patch = (manifest.dsh.bundle.patch ?? ['./cordis.patch.yml'])[0];
      if (!existsSync(resolve(dest, patch))) {
        fail(1, `bundle 包 ${manifest.name} 缺少 ${patch}`);
      }
    } else {
      const main = manifest.main ?? 'lib/index.js';
      if (!existsSync(resolve(dest, main))) {
        fail(1, `插件包 ${manifest.name} 缺少入口 ${main}`);
      }
    }
    copied.push(manifest.name);
  }
  return copied;
}

// ── P3：随包物化（git 闭包 / pnpm 引擎 / dshmarket）────────────────────────
const PNPM_VERSION = '10.34.6';
 const MARKET_ROOT = resolve(process.env.DSH_MARKET_DIR ?? resolve(ROOT, '../dsh-market'));
const GIT_CLOSURE_MIN_PACKAGES = 50;

/** 断言 @dsh-android/git 自带的 isomorphic-git 闭包完整（vendor 随包，无需 pnpm add）。 */
function assertGitClosure(runTree) {
  const nested = resolve(runTree, 'node_modules/@dsh-android/git/node_modules');
  const manifest = resolve(nested, 'isomorphic-git/package.json');
  if (!existsSync(manifest)) {
    fail(1, `git 闭包缺失：${manifest}（packages/git-android/node_modules 需随包 vendor）`);
  }
  const httpNode = resolve(nested, 'isomorphic-git/http/node/index.js');
  const httpNodeCjs = resolve(nested, 'isomorphic-git/http/node/index.cjs');
  if (!existsSync(httpNode) && !existsSync(httpNodeCjs)) {
    fail(1, 'isomorphic-git 缺 http/node 入口（闭包不完整）');
  }
  let count = 0;
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) walk(full, e.name.startsWith('@') ? depth : depth + 1);
      else if (e.name === 'package.json') count += 1;
    }
  };
  walk(nested, 0);
  if (count < GIT_CLOSURE_MIN_PACKAGES) {
    fail(1, `git 闭包只有 ${count} 个包（下限 ${GIT_CLOSURE_MIN_PACKAGES}）`);
  }
  log(`✓ git 闭包：isomorphic-git + ${count} 包`);
}

/** 012：物化纯 JS pnpm 引擎到 <runTree>/node_modules/dsh-market-pnpm（worker 内 import，不 spawn）。 */
function collectMarketPNPM(runTree) {
  const dest = resolve(runTree, 'node_modules/dsh-market-pnpm');
  if (existsSync(resolve(dest, 'package.json'))) {
    log('pnpm 引擎已物化（断言通过）');
    return;
  }
  const staging = resolve(WORK, 'pnpm-engine');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  writeFileSync(resolve(staging, 'package.json'), JSON.stringify({ name: 'pnpm-engine-staging', version: '0.0.0', private: true }, null, 2) + '\n');
  run(`pnpm add pnpm@${PNPM_VERSION} --config.node-linker=hoisted --ignore-scripts`, staging);
  const src = resolve(staging, 'node_modules/pnpm');
  if (!existsSync(resolve(src, 'package.json'))) fail(1, `pnpm 引擎物化失败：${src}`);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  rmSync(staging, { recursive: true, force: true });
  log(`pnpm 引擎已物化 (pnpm@${PNPM_VERSION})`);
}

/** 206：物化 @vscode/ripgrep 的 android 平台包存根——真实包 lib/index.js 运行时
 * require.resolve(`@vscode/ripgrep-android-arm64/bin/rg`)，android 平台该 optionalDependency
 * 不存在 → rgPath 解析直接拒绝（进不到 spawn）。物化后 rgPath 指向存根文件（不执行），
 * argv 由 @dsh-android/subprocess 进程内接管（docs/020 T-013）。 */
function collectRipgrepStub(runTree) {
  const platformPkg = resolve(runTree, 'node_modules/@vscode/ripgrep-android-arm64');
  if (existsSync(resolve(platformPkg, 'package.json'))) {
    log('@vscode/ripgrep-android-arm64 存根已物化（断言通过）');
    return;
  }
  mkdirSync(resolve(platformPkg, 'bin'), { recursive: true });
  writeFileSync(resolve(platformPkg, 'package.json'), JSON.stringify({
    name: '@vscode/ripgrep-android-arm64',
    version: '0.0.0-dsh-virtual-stub',
    description: 'Stub: satisfies @vscode/ripgrep runtime resolution on Android; the resolved rg path is never executed — @dsh-android/subprocess intercepts it and searches in-process (specs/206, T-013).',
    bin: { rg: 'bin/rg' },
    private: true,
  }, null, 2) + '\n');
  writeFileSync(resolve(platformPkg, 'bin', 'rg'), '# dsh virtual rg: intercepted in-process by @dsh-android/subprocess\n');
  log('@vscode/ripgrep-android-arm64 存根已物化（bin/rg 由 @dsh-android/subprocess 进程内接管）');
}

/** T-001（docs/020）：plugin-manager registry lookup 的进程内替身补丁。
 * 上游 viewProfilePackage 走 execa 裸 spawn `pnpm view`（本平台必然失败）；
 * 本补丁在 lookup 分支 feature-detect 宿主 `desktopPnpm.lookup`（@dsh-android/market 提供，
 * worker 进程内跑 pnpm），存在即走进程内，保持 viewProfilePackage 的返回形状不变，
 * registry 计划/超时/取消语义全部保留。此 diff 亦是向上游反哺的参考实现（specs/206 同类机制）。 */
function patchPluginManagerLookup(runTree) {
  const file = resolve(runTree, 'node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js');
  if (!existsSync(file)) fail(1, `载荷里没有 dsh-plugin-manager：${file}`);
  const text = readFileSync(file, 'utf8');
  const MARK = 'DSH_ANDROID_DESKTOP_PNPM_LOOKUP';
  if (text.includes(MARK)) {
    log('补丁 T-001：plugin-manager desktopPnpm.lookup 已接管（幂等）');
    return file;
  }

  // 锚点 1：viewProfilePackage 函数体结束处（return 行后补一个 helper）
  const helperAnchor = `\tconst cause = result.exitCode === void 0 && !result.timedOut && !result.isCanceled ? Object.assign(new Error(result.shortMessage), { code: result.code }) : void 0;\n\treturn {\n\t\texitCode: result.exitCode ?? null,\n\t\tstdout: result.stdout,\n\t\tstderr: result.stderr,\n\t\ttimedOut: result.timedOut,\n\t\t...cause === void 0 ? {} : { cause }\n\t};\n}`;
  const helperOccurrences = text.split(helperAnchor).length - 1;
  if (helperOccurrences !== 1) fail(1, `T-001 helper 锚点不唯一或缺失（${helperOccurrences}）`);
  const helper = `${helperAnchor}\n\n/* ${MARK}: 进程内 view——经宿主 desktopPnpm.lookup（worker 跑纯 JS pnpm），返回与 viewProfilePackage 相同的形状。 */\nasync function viewProfilePackageInProcess(desktop, dir, spec, options) {\n\tconst argv = ["view", spec, "name", "version", "description", "dsh", "--json", ...registryArguments(options.registry ?? null)];\n\tconst stdoutChunks = [];\n\tconst stderrChunks = [];\n\tconst pump = (stream, chunks) => new Promise((resolve) => {\n\t\tif (stream === void 0 || stream === null) return resolve();\n\t\tstream.on("data", (chunk) => chunks.push(typeof chunk === "string" ? chunk : chunk.toString()));\n\t\tstream.once("end", resolve);\n\t\tstream.once("error", resolve);\n\t});\n\tlet handle;\n\ttry {\n\t\thandle = desktop.lookup(argv, dir, options.signal);\n\t} catch (error) {\n\t\treturn { exitCode: null, stdout: "", stderr: String(error && error.message ? error.message : error), timedOut: false, cause: error };\n\t}\n\tconst collected = Promise.all([pump(handle.stdout, stdoutChunks), pump(handle.stderr, stderrChunks)]);\n\tlet timedOut = false;\n\tconst timer = setTimeout(() => { timedOut = true; try { handle.cancel(); } catch {} }, options.timeoutMs);\n\ttimer.unref?.();\n\tconst onAbort = () => { try { handle.cancel(); } catch {} };\n\toptions.signal?.addEventListener("abort", onAbort, { once: true });\n\tlet outcome;\n\ttry {\n\t\toutcome = await handle.done;\n\t} catch (error) {\n\t\tclearTimeout(timer);\n\t\toptions.signal?.removeEventListener("abort", onAbort);\n\t\tawait collected;\n\t\treturn { exitCode: null, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") || String(error && error.message ? error.message : error), timedOut: false, cause: error };\n\t}\n\tclearTimeout(timer);\n\toptions.signal?.removeEventListener("abort", onAbort);\n\tawait collected;\n\treturn {\n\t\texitCode: timedOut ? null : outcome.exitCode ?? null,\n\t\tstdout: stdoutChunks.join(""),\n\t\tstderr: stderrChunks.join(""),\n\t\ttimedOut,\n\t\t...outcome.signal === null || timedOut ? {} : { cause: Object.assign(new Error(\`terminated by \${String(outcome.signal)}\`), { code: outcome.signal }) }\n\t};\n}`;
  const withHelper = text.replace(helperAnchor, helper);

  // 锚点 2：registry lookup 调用点 → feature-detect 后分支（缩进自适应：deploy 后层级可能加深）
  const callNeedle = 'const view = await viewProfilePackage(this.profile.dir, spec.trim(), {';
  const callNeedleCount = withHelper.split(callNeedle).length - 1;
  if (callNeedleCount !== 1) fail(1, `T-001 call 锚点不唯一或缺失（${callNeedleCount}）`);
  const callStart = withHelper.indexOf(callNeedle);
  const closeIdx = withHelper.indexOf('registry: current', callStart);
  if (closeIdx < 0) fail(1, 'T-001 call 收尾锚点缺失');
  const closeEnd = withHelper.indexOf('});', closeIdx);
  if (closeEnd < 0) fail(1, 'T-001 call 结束锚点缺失');
  const callEndAbs = closeEnd + '});'.length;
  const lineStart = withHelper.lastIndexOf('\n', callStart) + 1;
  const indent = withHelper.slice(lineStart, callStart);
  const inner = `${indent}\t`;
  const callText = withHelper.slice(callStart + 'const view = '.length, callEndAbs);
  const callPatch = `/* ${MARK}: 宿主发布 desktopPnpm.lookup 时走进程内 view（本平台无可执行 pnpm）。 */\n${indent}const desktopPnpm = (() => { try { return typeof this.ownerContext?.get === "function" ? this.ownerContext.get("desktopPnpm") ?? null : null } catch { return null } })();\n${indent}const view = desktopPnpm !== null && typeof desktopPnpm.lookup === "function"\n${inner}? await viewProfilePackageInProcess(desktopPnpm, this.profile.dir, spec.trim(), {\n${inner}\ttimeoutMs: this.inspectTimeoutMs,\n${inner}\t...signal === void 0 ? {} : { signal },\n${inner}\tregistry: current\n${inner}})\n${indent}: ${callText}`;
  const patched = `${withHelper.slice(0, lineStart)}${callPatch}${withHelper.slice(callEndAbs)}`;
  writeFileSync(file, patched);
  if (!readFileSync(file, 'utf8').includes(MARK)) fail(1, `T-001 补丁后标记缺失：${file}`);
  log('补丁 T-001：plugin-manager lookup feature-detect desktopPnpm.lookup（进程内 view）');
  return file;
}

/** T-004（docs/020）：ctx.fs 原语补齐的物化期补丁——在 fs-local 的 LocalFileSystem
 * 原型上补 remove/move/copy/chmod（机械函数 fs-local 已 import 或动态引入，统一经
 * this.resolve(displayPath) 取 targetKey），并在 fs-sandbox 的 SandboxedFileSystem
 * 原型上加围栏包装（写语义走 checkedTarget：read-only 拒绝、workspace-write 含包含校验）。
 * 已知边界（如实登记）：remove 仅普通文件（目录递归删除待需求）；move/copy 仅普通文件。
 * 消费方：任何注入 ctx.fs 的插件/未来工具（上游 tool-fs 尚无调用点，T-004 登记为待上游消费面）。 */
function patchFsPrimitives(runTree) {
  const localFile = resolve(runTree, 'node_modules/@deepseek-ai/dsh-fs-local/lib/index.js');
  const sandboxFile = resolve(runTree, 'node_modules/@deepseek-ai/dsh-fs-sandbox/lib/index.js');
  if (!existsSync(localFile)) fail(1, `载荷里没有 dsh-fs-local：${localFile}`);
  if (!existsSync(sandboxFile)) fail(1, `载荷里没有 dsh-fs-sandbox：${sandboxFile}`);

  const MARK = 'DSH_ANDROID_FS_PRIMITIVES';
  const localText = readFileSync(localFile, 'utf8');
  if (!localText.includes(MARK)) {
    const exportAnchor = 'export { LocalFileSystem, LocalFileSystem as default };';
    if (localText.split(exportAnchor).length - 1 !== 1) fail(1, `T-004 fs-local export 锚点不唯一或缺失`);
    const localPatch = `\n/* ${MARK}: ctx.fs 写原语补齐（remove/move/copy/chmod）。resolve(displayPath) 与同类方法同源。 */\nObject.assign(LocalFileSystem.prototype, {\n\tasync remove(displayPath, signal) {\n\t\tconst target = await this.resolve(displayPath);\n\t\tsignal?.throwIfAborted();\n\t\tawait rm(target.targetKey, { force: false, recursive: false });\n\t\treturn { ok: true, path: target.displayPath };\n\t},\n\tasync move(fromDisplay, toDisplay, signal) {\n\t\tconst from = await this.resolve(fromDisplay);\n\t\tconst to = await this.resolve(toDisplay);\n\t\tsignal?.throwIfAborted();\n\t\tconst { mkdir } = await import("node:fs/promises");\n\t\tconst { dirname } = await import("node:path");\n\t\tawait mkdir(dirname(to.targetKey), { recursive: true });\n\t\tawait rename(from.targetKey, to.targetKey);\n\t\treturn { ok: true, from: from.displayPath, to: to.displayPath };\n\t},\n\tasync copy(fromDisplay, toDisplay, signal) {\n\t\tconst from = await this.resolve(fromDisplay);\n\t\tconst to = await this.resolve(toDisplay);\n\t\tsignal?.throwIfAborted();\n\t\tconst { mkdir, copyFile } = await import("node:fs/promises");\n\t\tconst { dirname } = await import("node:path");\n\t\tawait mkdir(dirname(to.targetKey), { recursive: true });\n\t\tawait copyFile(from.targetKey, to.targetKey);\n\t\treturn { ok: true, from: from.displayPath, to: to.displayPath, size: (await stat(to.targetKey)).size };\n\t},\n\tasync chmod(displayPath, mode, signal) {\n\t\tconst target = await this.resolve(displayPath);\n\t\tsignal?.throwIfAborted();\n\t\tawait chmod(target.targetKey, mode);\n\t\treturn { ok: true, path: target.displayPath, mode };\n\t},\n});\n`;
    writeFileSync(localFile, localText.replace(exportAnchor, `${localPatch}\n${exportAnchor}`));
    if (!readFileSync(localFile, 'utf8').includes(MARK)) fail(1, `T-004 fs-local 补丁后标记缺失`);
    log('补丁 T-004a：dsh-fs-local LocalFileSystem 补 remove/move/copy/chmod 原型');
  }

  const sandboxText = readFileSync(sandboxFile, 'utf8');
  if (!sandboxText.includes(MARK)) {
    const exportAnchor = 'export { SandboxedFileSystem, SandboxedFileSystem as default };';
    if (sandboxText.split(exportAnchor).length - 1 !== 1) fail(1, `T-004 fs-sandbox export 锚点不唯一或缺失`);
    const sandboxPatch = `\n/* ${MARK}: 原语的围栏包装——写语义统一走 checkedTarget（read-only 拒 / workspace-write 包含校验）。 */\nObject.assign(SandboxedFileSystem.prototype, {\n\tasync remove(displayPath, sandboxPolicy, signal) {\n\t\tconst target = await this.checkedTarget(displayPath, sandboxPolicy);\n\t\treturn super.remove(target.displayPath, signal);\n\t},\n\tasync move(fromDisplay, toDisplay, sandboxPolicy, signal) {\n\t\tconst from = await this.checkedTarget(fromDisplay, sandboxPolicy);\n\t\tconst to = await this.checkedTarget(toDisplay, sandboxPolicy);\n\t\treturn super.move(from.displayPath, to.displayPath, signal);\n\t},\n\tasync copy(fromDisplay, toDisplay, sandboxPolicy, signal) {\n\t\tconst to = await this.checkedTarget(toDisplay, sandboxPolicy);\n\t\treturn super.copy(fromDisplay, to.displayPath, signal);\n\t},\n\tasync chmod(displayPath, mode, sandboxPolicy, signal) {\n\t\tconst target = await this.checkedTarget(displayPath, sandboxPolicy);\n\t\treturn super.chmod(target.displayPath, mode, signal);\n\t},\n});\n`;
    writeFileSync(sandboxFile, sandboxText.replace(exportAnchor, `${sandboxPatch}\n${exportAnchor}`));
    if (!readFileSync(sandboxFile, 'utf8').includes(MARK)) fail(1, `T-004 fs-sandbox 补丁后标记缺失`);
    log('补丁 T-004b：dsh-fs-sandbox 原语围栏包装（checkedTarget 语义）');
  }
}

/** 201：物化 dshmarket（lib+client+运行时依赖闭包；@deepseek-ai/* 由宿主闭包提供）。 */
function collectDshMarket(runTree) {
  const dest = resolve(runTree, 'node_modules/dshmarket');
  if (!existsSync(resolve(MARKET_ROOT, 'package.json'))) {
    fail(2, `dsh-market 未找到：${MARKET_ROOT}`, 'cd ../dsh-market && npm i && npm run build');
  }
  for (const rel of ['lib/index.js', 'client/client.js']) {
    if (!existsSync(resolve(MARKET_ROOT, rel))) {
      fail(2, `dsh-market 未构建：缺 ${rel}`, 'cd ../dsh-market && npm i && npm run build');
    }
  }
  const marketVersion = String(JSON.parse(readFileSync(resolve(MARKET_ROOT, 'package.json'), 'utf8')).version ?? '');
  rmSync(dest, { recursive: true, force: true });
  cpSync(MARKET_ROOT, dest, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = relative(MARKET_ROOT, src);
      if (rel === '') return true;
      const top = rel.split(/[\\/]/)[0];
      return top === 'package.json' || top === 'cordis.patch.yml' || top === 'lib' || top === 'client';
    },
  });
  // 运行时依赖闭包（非 @deepseek-ai/*）
  const srcNm = resolve(MARKET_ROOT, 'node_modules');
  const destNm = resolve(dest, 'node_modules');
  if (existsSync(srcNm)) {
    const seen = new Set();
    const queue = [];
    try {
      const manifest = JSON.parse(readFileSync(resolve(MARKET_ROOT, 'package.json'), 'utf8'));
      queue.push(...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {}));
    } catch { /* ignore */ }
    while (queue.length > 0) {
      const name = queue.shift();
      if (seen.has(name) || name.startsWith('@deepseek-ai/')) continue;
      seen.add(name);
      const srcPkg = resolve(srcNm, ...name.split('/'));
      const destPkg = resolve(destNm, ...name.split('/'));
      if (!existsSync(resolve(srcPkg, 'package.json')) || existsSync(resolve(destPkg, 'package.json'))) continue;
      cpSync(srcPkg, destPkg, { recursive: true, dereference: true });
      try {
        const pkg = JSON.parse(readFileSync(resolve(srcPkg, 'package.json'), 'utf8'));
        queue.push(...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}));
      } catch { /* 闭包断言兜底 */ }
    }
  }
  log(`dshmarket 已物化 (${marketVersion})`);
}

/** bundle 覆盖层里引用的每一个 @dsh-android/@deepseek-ai 包都必须能解析（FR-105-005）。 */
function assertInsertedRowsResolve(runTree) {
  const patchPath = resolve(PACKAGES_SRC, 'bundle-android/cordis.patch.yml');
  if (!existsSync(patchPath)) fail(2, `缺少 bundle 覆盖层：${patchPath}`);
  const text = readFileSync(patchPath, 'utf8');
  const names = [...text.matchAll(/^\s*-?\s*name:\s*'?(@[^'\s]+)'?\s*$/gm)].map((m) => m[1]);
  const missing = [];
  for (const name of [...new Set(names)]) {
    const target = resolve(runTree, 'node_modules', ...name.split('/'), 'package.json');
    if (!existsSync(target)) missing.push(name);
  }
  if (missing.length > 0) {
    fail(1, `bundle 引用无法解析：${missing.join(', ')}`, '先装配这些包，或从覆盖层移除该行');
  }
  return [...new Set(names)];
}

function assertNoLinks(stage) {
  const links = [];
  const walk = (current, depth) => {
    if (depth > 12 || links.length > 5) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (isSymlink(full)) links.push(full);
      else if (entry.isDirectory()) walk(full, depth + 1);
    }
  };
  walk(stage, 0);
  if (links.length > 0) {
    fail(1, `载荷仍含链接（设备上不应依赖链接语义）：${links.slice(0, 5).join(', ')}`);
  }
}

function overlay(runTree) {
  // 1) profile 注入
  const profileDest = resolve(runTree, 'profiles/android');
  rmSync(profileDest, { recursive: true, force: true });
  cpSync(PROFILE_SRC, profileDest, { recursive: true });
  const manifest = JSON.parse(readFileSync(resolve(profileDest, 'package.json'), 'utf8'));
  const bundles = manifest?.dsh?.profile?.bundles ?? [];
  if (!bundles.includes('@dsh-android/bundle')) {
    fail(1, `profile 清单未包含 @dsh-android/bundle：${profileDest}/package.json`);
  }
  log(`profile 已注入：profiles/android（${bundles.length} 个 bundle）`);

  // 2) 本工程包
  const plugins = collectAndroidPackages(runTree);
  log(`本工程包已注入：${plugins.length} 个（${plugins.join(', ')}）`);

  // P3：git 闭包断言 + pnpm 引擎 + dshmarket
  assertGitClosure(runTree);
  try { collectMarketPNPM(runTree); } catch (e) { fail(1, `012 物化失败：${e.message}`); }
  try { collectRipgrepStub(runTree); } catch (e) { fail(1, `206 rg 存根物化失败：${e.message}`); }
  try { patchPluginManagerLookup(runTree); } catch (e) { fail(1, `T-001 补丁失败：${e.message}`); }
  try { patchFsPrimitives(runTree); } catch (e) { fail(1, `T-004 补丁失败：${e.message}`); }
  try { collectDshMarket(runTree); } catch (e) { fail(1, `201 物化失败：${e.message}`); }

  // 3) 垫片（§5.3 白名单）
  installRequireBuiltinShim(runTree, log);
  applyFlockShim(runTree, log);
  applySharpShim(runTree, log);
  try {
    applyAttachmentDurabilityPatch(runTree, log);
  } catch (error) {
    // 纵深防御补丁：锚点漂移只告警不失败（上游 rc 变更时不应阻塞整包装配）
    log(`警告：S4 附件补丁未应用：${error.message}`);
  }
}

function assertStage(root) {
  const checks = [];
  const runTree = resolve(root, 'dsh');
  checks.push(['bootstrap.js 存在', existsSync(resolve(root, 'bootstrap.js'))]);
  checks.push(['host-boot.js 存在', existsSync(resolve(root, 'host-boot.js'))]);
  checks.push(['@deepseek-ai/dsh 存在', existsSync(resolve(runTree, 'node_modules/@deepseek-ai/dsh/package.json'))]);
  checks.push(['Web UI dist 存在', existsSync(resolve(runTree, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html'))]);
  checks.push(['profiles/android 存在', existsSync(resolve(runTree, 'profiles/android/package.json'))]);
  const rows = assertInsertedRowsResolve(runTree);
  checks.push([`bundle 引用可解析（${rows.length} 行）`, true]);
  checks.push(['sharp 垫片（S2）', (() => {
    try {
      return JSON.parse(readFileSync(resolve(runTree, 'node_modules/sharp/package.json'), 'utf8')).dshAndroidShim === 'S2';
    } catch {
      return false;
    }
  })()]);
  assertNoLinks(root);
  checks.push(['无 symlink', true]);

  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length > 0) fail(1, `载荷断言失败：${failed.join('、')}`);
  for (const [name] of checks) log(`✓ ${name}`);
}

function main() {
  if (!deploy) {
    log('dry-run：未指定输入，只打印计划');
    log('  真实物化：node scripts/assemble-payload.mjs --deploy --apply');
    log(`  目标：${STAGE}`);
    process.exit(0);
  }

  const stage = deployTree();
  prunePayload(stage);
  // root 布局：{payload 文件, dsh/(运行树)}
  const root = resolve(WORK, 'root');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  renameSync(stage, resolve(root, 'dsh'));
  // 载荷脚本（bootstrap/host/shims）
  for (const entry of ['bootstrap.js', 'host-boot.js', 'shims']) {
    const src = resolve(PAYLOAD_SRC, entry);
    if (!existsSync(src)) fail(2, `缺少载荷文件：${src}`);
    cpSync(src, resolve(root, entry), { recursive: true });
  }
  // 覆盖层作用于运行树
  overlay(resolve(root, 'dsh'));
  assertStage(root);

  if (!apply) {
    log('dry-run：未加 --apply，弃用本次装配结果（不写 build/payload-stage）');
    process.exit(0);
  }
  const size = countTree(root);
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(resolve(STAGE, '..'), { recursive: true });
  renameSync(root, STAGE);
  writeFileSync(
    resolve(STAGE, '..', 'assemble.json'),
    `${JSON.stringify({ schema: 1, source: 'deploy', files: size.files, bytes: size.bytes, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
  log(`已落地：${STAGE}（${size.files} 文件 / ${(size.bytes / 1048576).toFixed(1)} MiB）`);
  log('下一步：node scripts/package-payload.mjs --src build/payload-stage/root');
}

main();
