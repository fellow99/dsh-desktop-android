#!/usr/bin/env node
/**
 * 引擎投放（G12 前置）：aosp-node-runtime 的 libnode.so / libc++_shared.so → app/src/main/jniLibs/arm64-v8a/
 *
 * 事实源：<runtime-dir>/runtime.lock.json（active.release）。
 * 来源优先级：
 *   ① --archive <node-vX-android-arm64-v8a.tar.gz>（GitHub Release 归档）
 *   ② <runtime-dir>/node-runtime/src/main/jniLibs/arm64-v8a/（已被 provision.mjs 投放并过八项门禁）
 *
 * 校验：sha256 + size 与 lock 完全一致，不符即退出码 2。
 * 二进制不入库（.gitignore）；用 `node scripts/provision-engine.mjs --check` 校验当前状态。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, copyFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'app/src/main/jniLibs/arm64-v8a');

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const check = process.argv.includes('--check');
const archive = argOf('--archive');
let runtimeDir = argOf('--runtime-dir')
  || process.env.DSH_ANDROID_RUNTIME_DIR
  || 'D:/node-bridge-workspace/aosp-node-runtime';

function sha256Of(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function fail(code, msg) {
  console.error(`[provision-engine] ${msg}`);
  process.exit(code);
}

const lockPath = join(runtimeDir, 'runtime.lock.json');
if (!existsSync(lockPath)) fail(2, `找不到 runtime.lock.json：${lockPath}（可用 --runtime-dir 或 DSH_ANDROID_RUNTIME_DIR 指定）`);
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const nodeVersion = lock.active.node;
const rel = lock.releases.find((r) => r.node === nodeVersion);
if (!rel) fail(2, `lock 中无 ${nodeVersion} 条目`);

const want = {
  'libnode.so': { sha256: rel.sha256, size: rel.size },
  'libc++_shared.so': { sha256: rel.libcxx.sha256, size: rel.libcxx.size },
};

let sourceDir = null;
if (archive) {
  fail(2, '--archive 模式请先用 aosp-node-runtime/tools/provision.mjs 投放（含八项 ELF 门禁），再运行本脚本');
}
sourceDir = join(runtimeDir, 'node-runtime/src/main/jniLibs/arm64-v8a');

let allOk = true;
for (const [name, expect] of Object.entries(want)) {
  const src = join(sourceDir, name);
  const dst = join(OUT, name);
  if (!existsSync(src)) {
    console.error(`[provision-engine] ✗ 源缺失：${src}`);
    allOk = false;
    continue;
  }
  const st = statSync(src);
  const sha = sha256Of(src);
  const okSha = sha === expect.sha256;
  const okSize = st.size === expect.size;
  const ok = okSha && okSize;
  console.log(`[provision-engine] ${name}: ${ok ? '✓' : '✗'} size=${st.size}${okSize ? '' : `≠${expect.size}`} sha256=${sha.slice(0, 12)}…${okSha ? '' : '≠lock'}`);
  if (!ok) allOk = false;
  if (!check && ok) {
    mkdirSync(OUT, { recursive: true });
    copyFileSync(src, dst);
  }
}

if (!allOk) fail(2, '引擎校验失败：先在 aosp-node-runtime 运行 tools/provision.mjs 投放 v' + nodeVersion);
if (check) {
  console.log(`[provision-engine] --check 通过（node ${nodeVersion}）`);
} else {
  console.log(`[provision-engine] 投放完成 → ${OUT}（node ${nodeVersion}，二进制不入库）`);
}
