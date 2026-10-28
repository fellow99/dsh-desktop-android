'use strict';
/**
 * Node 侧入口（交给 `node::Start` 的脚本）—— Android 版（正式载荷）。
 *
 * 职责（顺序固定）：
 *   1) 建立运行期目录与 `app.log`；
 *   2) 安装异常兜底（只落日志，绝不 `process.exit`）；
 *   3) 轻量平台探针（FTS5 / Intl / sh → 记入 ready.json.probes，P0 门禁证据载体）；
 *   4) 断言解包结果（Kotlin PayloadInstaller 已解包；本文件是**消费者**，宪法 C5）；
 *   5) 交给 `host.js` 启动 dsh Host。
 *
 * 环境契约（由 Kotlin `NodeRuntimeOptions` 注入，见 specs/overall-data-model.md §5）：
 *   DSH_HOME / HOME / DSH_PROFILE_NAME=android / DSH_PLATFORM=android /
 *   DSH_FILES_DIR / DSH_PAYLOAD_DIR / DSH_USER_ROOT / DSH_STORAGE_MODE / DSH_APP_VERSION
 *
 * 与 ark 的差异：JIT 可用（无 jitless 兼容层）；解包由 Kotlin 完成（无 Node 自解包）；
 *   垫片由装配期文件替换（flock/sharp/require-builtin），运行期只做探测与登记。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ASSET_DIR = __dirname;
const RUN_ROOT = path.join(ASSET_DIR, 'dsh');            // 运行树（Kotlin 解包产物）
const PAYLOAD_ROOT = ASSET_DIR;                          // payloadRoot = 解包目录
const APP_LOG = process.env.DSH_ANDROID_APP_LOG
  || path.join(process.env.DSH_HOME || '', 'logs', 'app.log');
const READY_FILE = path.join(process.env.DSH_FILES_DIR || PAYLOAD_ROOT, 'run', 'ready.json');
const VERSION_FILE = path.join(ASSET_DIR, 'dsh.version');
const SCHEMA = 1;

function now() { return Date.now(); }

function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    fs.mkdirSync(path.dirname(APP_LOG), { recursive: true });
    fs.appendFileSync(APP_LOG, text);
  } catch (error) {
    process.stderr.write(`[app.log unavailable] ${text}`);
  }
}

function writeReady(payload) {
  const body = JSON.stringify({ schema: SCHEMA, at: now(), ...payload }, null, 2);
  try {
    fs.mkdirSync(path.dirname(READY_FILE), { recursive: true });
    const tmp = `${READY_FILE}.tmp-${process.pid}`;
    fs.rmSync(tmp, { force: true });
    const fd = fs.openSync(tmp, 'wx');
    try {
      fs.writeFileSync(fd, body);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, READY_FILE);
  } catch (error) {
    log(`writeReady failed: ${error && error.message ? error.message : String(error)}`);
  }
}

function installExceptionHandlers() {
  process.on('uncaughtException', (error) => {
    log(`uncaughtException: ${error && error.stack ? error.stack : String(error)}`);
  });
  process.on('unhandledRejection', (reason) => {
    log(`unhandledRejection: ${reason && reason.stack ? reason.stack : String(reason)}`);
  });
}

// ── 轻量平台探针（P0 门禁证据；结果只进 ready.json.probes 与 app.log）────────
function runProbes() {
  const probes = {};
  // G2：node:sqlite FTS5
  try {
    const sqlite = require('node:sqlite');
    const db = new sqlite.DatabaseSync(':memory:');
    try {
      db.exec('CREATE VIRTUAL TABLE t USING fts5(x)');
      db.exec("INSERT INTO t(x) VALUES ('hello dsh')");
      const row = db.prepare("SELECT x FROM t WHERE t MATCH 'dsh'").get();
      probes.sqlite = { ok: row && row.x === 'hello dsh', fts5: true, modules: process.versions.modules };
    } finally {
      try { db.close(); } catch (_) { /* ignore */ }
    }
  } catch (e) {
    probes.sqlite = { ok: false, error: e.message };
  }
  // G4：Intl
  try {
    const hasIntl = typeof Intl !== 'undefined';
    const ctor = hasIntl ? (() => { try { new Intl.DateTimeFormat('en').format(new Date()); return 'ok'; } catch (e2) { return 'error: ' + e2.message; } })() : null;
    probes.intl = { ok: hasIntl && ctor === 'ok', typeofIntl: hasIntl ? 'object' : typeof Intl, dateTimeFormat: ctor };
  } catch (e) {
    probes.intl = { ok: false, error: e.message };
  }
  // G9：/system/bin/sh
  try {
    const r = spawnSync('/system/bin/sh', ['-c', 'printf dsh-sh-ok'], { encoding: 'utf8', timeout: 5000 });
    probes.sh = { ok: r.status === 0 && (r.stdout || '').trim() === 'dsh-sh-ok', status: r.status, stdout: (r.stdout || '').trim() };
  } catch (e) {
    probes.sh = { ok: false, error: e.message };
  }
  // 会话持久化依赖
  try {
    const zlib = require('node:zlib');
    probes.zstd = { ok: typeof zlib.zstdCompressSync === 'function', compress: typeof zlib.zstdCompressSync === 'function' };
  } catch (e) {
    probes.zstd = { ok: false, error: e.message };
  }
  for (const [name, r] of Object.entries(probes)) {
    log(`probe ${name}: ${r.ok === true ? 'ok' : 'FAIL'} ${r.error || ''}`);
  }
  return probes;
}

function assertEnv() {
  const required = ['DSH_HOME', 'HOME', 'DSH_PROFILE_NAME', 'DSH_PLATFORM', 'DSH_FILES_DIR', 'DSH_PAYLOAD_DIR'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`env 缺失：${missing.join(',')}（Kotlin 侧 env 注入不完整）`);
  }
  if (process.env.HOME !== path.join(process.env.DSH_HOME, 'home')) {
    log(`env: HOME 与 DSH_HOME/home 不一致（${process.env.HOME}）——按纵深防御记录`);
  }
}

function readVersion() {
  // 权威校验在 Kotlin PayloadInstaller（DigestInputStream 全流对账）；此处只解析 sha12 供登记。
  try {
    const lines = fs.readFileSync(VERSION_FILE, 'utf8').split('\n');
    const shaLine = lines.find((l) => l.startsWith('sha256='));
    const sha256 = shaLine ? shaLine.slice('sha256='.length).trim() : '';
    if (!/^[0-9a-f]{64}$/.test(sha256)) return { present: false, detail: 'dsh.version sha256 行无效' };
    return { present: true, sha256, sha12: sha256.slice(0, 12) };
  } catch (error) {
    return { present: false, detail: error && error.message ? error.message : String(error) };
  }
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1 << 20);
    let read = 0;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** 用户级 patch：`$DSH_HOME/user-patch.yml`（设备可改、升级不覆盖）。缺省写入空数组。 */
function ensureUserPatch() {
  const file = path.join(process.env.DSH_HOME, 'user-patch.yml');
  try {
    fs.mkdirSync(process.env.DSH_HOME, { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '# 用户级 patch（设备可改；升级不覆盖）。空数组 = 无覆盖。\n[]\n');
      log(`user-patch: created ${file}`);
    }
    return file;
  } catch (error) {
    log(`user-patch: 写入失败（不影响启动）：${error && error.message ? error.message : String(error)}`);
    return '';
  }
}

async function main() {
  const t0 = now();
  installExceptionHandlers();
  assertEnv();
  log(`bootstrap: start (payload=${ASSET_DIR}, platform=${process.env.DSH_PLATFORM}, storage=${process.env.DSH_STORAGE_MODE})`);
  log(`bootstrap: execArgv=${JSON.stringify(process.execArgv)}（S3 require-builtin 依赖 --expose-internals）`);
  writeReady({ phase: 'preparing', sha12: '' });

  const probes = runProbes();
  const version = readVersion();

  // 解包断言：Kotlin 已把运行树解到本目录的 dsh/ 下（宪法 C5：谁解包谁负责，Node 只消费）
  const dshManifest = path.join(RUN_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
  const profileDir = path.join(RUN_ROOT, 'profiles', 'android');
  if (!fs.existsSync(dshManifest)) {
    const diagnostic = `缺少上游包：${dshManifest}（载荷未装配或解包不完整）`;
    writeReady({ phase: 'payload-missing', diagnostic, probes });
    log(`bootstrap: payload-missing. ${diagnostic}`);
    return;
  }
  if (!fs.existsSync(path.join(profileDir, 'package.json'))) {
    const diagnostic = `载荷缺少 profiles/android：${profileDir}`;
    writeReady({ phase: 'failed', diagnostic, probes, sha12: version.sha12 || '' });
    log(`bootstrap: ${diagnostic}`);
    return;
  }
  log(`host: runRoot=${RUN_ROOT} profile=${profileDir} sha12=${version.sha12 || '?'}`);
  ensureUserPatch();

  // 运行期垫片：fs.link/fs.symlink 在部分 Android 存储（模拟器 FUSE 等）上 EACCES → 回退 rename/copy（S5，纵深防御）
  let fsLinkShim = { marker: 'DSH_ANDROID_SHIM fs.link', installed: false };
  let fsSymlinkShim = { marker: 'DSH_ANDROID_SHIM fs.symlink', installed: false };
  try { fsLinkShim = require('./shims/fs-link.js').install(log); } catch (e) { log('fs-link shim install failed: ' + e.message); }
  try { fsSymlinkShim = require('./shims/fs-symlink.js').install(log); } catch (e) { log('fs-symlink shim install failed: ' + e.message); }

  const shims = [
    { marker: 'DSH_ANDROID_SHIM flock', installed: fs.existsSync(path.join(RUN_ROOT, 'node_modules', '@deepseek-ai', 'node-addon-system', 'lib', 'flock.js')) },
    { marker: 'DSH_ANDROID_SHIM sharp', installed: false },
    { marker: 'DSH_ANDROID_SHIM require-builtin', installed: false },
    fsLinkShim,
    fsSymlinkShim,
  ];
  try {
    const sharpPkg = JSON.parse(fs.readFileSync(path.join(RUN_ROOT, 'node_modules', 'sharp', 'package.json'), 'utf8'));
    shims[1].installed = sharpPkg.dshAndroidShim === 'S2';
  } catch (_) { /* 未替换=失败 */ }
  try {
    const rbPkg = JSON.parse(fs.readFileSync(path.join(RUN_ROOT, 'node_modules', 'node-addon-require-builtin', 'package.json'), 'utf8'));
    shims[2].installed = String(rbPkg.dshAndroidShim || '') === 'S3';
  } catch (_) { /* 未替换=失败 */ }
  for (const s of shims) log(`shim ${s.marker}: ${s.installed ? 'installed' : 'MISSING'}`);

  const host = require('./host-boot.js');
  await host.start({
    runRoot: RUN_ROOT,
    payloadRoot: PAYLOAD_ROOT,
    assetDir: ASSET_DIR,
    version,
    shims,
    probes,
    profileName: process.env.DSH_PROFILE_NAME || 'android',
    log,
    writeReady,
    bootMsBudget: t0,
  });
}

main().catch((error) => {
  const message = error && error.stack ? error.stack : String(error);
  log(`bootstrap: fatal ${message}`);
  writeReady({ phase: 'failed', diagnostic: message });
});
