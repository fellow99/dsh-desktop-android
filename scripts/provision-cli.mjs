#!/usr/bin/env node
/**
 * CLI 五件套投放（112-cli-integration，FR-112-1/2 / D2）：
 *   aosp-node-cli / aosp-python-cli / aosp-git-cli / aosp-uv-cli / aosp-pnpm-cli
 *   GitHub Release 归档 → 校验 → 归一化解包 →
 *     .so（exec 型 12 件）→ app/src/main/jniLibs/arm64-v8a/
 *     数据资产（npm/corepack / python stdlib / git templates+cacert）→ app/src/main/assets/cli/<tool>/
 *
 * 事实源：scripts/cli.lock.json（tools.*.sha256/size，与 Release 官方 .sha256 一致）。
 * 二进制与大资产不入库（.gitignore）；`node scripts/provision-cli.mjs --check` 校验当前状态。
 *
 * 退出码：0 全过；2 校验/门禁不合格；1 用法/IO 错误。
 */
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, statSync, copyFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOCK = JSON.parse(readFileSync(join(ROOT, 'scripts/cli.lock.json'), 'utf8'));
const JNI_OUT = join(ROOT, 'app/src/main/jniLibs/arm64-v8a');
const ASSETS_OUT = join(ROOT, 'app/src/main/assets/cli');
const WORK = join(ROOT, 'build/.cli-provision');
const CACHE = join(ROOT, 'build/.cli-cache');

const args = process.argv.slice(2);
const check = args.includes('--check');
const archiveFor = (name) => {
  const i = args.indexOf('--archive-' + name);
  return i >= 0 ? args[i + 1] : undefined;
};

function sha256Of(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function fail(code, msg) {
  console.error(`[provision-cli] ${msg}`);
  process.exit(code);
}
function log(message) {
  console.log(`[provision-cli] ${message}`);
}

/** 命令串用正斜杠（Windows bsdtar/cmd + 通用 shell 均接受）。 */
function posix(p) {
  return p.split(sep).join('/');
}

/** 递归复制（Node 原生，避免依赖 shell 的 cp）。 */
function copyRecursive(src, dst) {
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src)) {
      copyRecursive(join(src, entry), join(dst, entry));
    }
  } else {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  }
}

/** 解析带 strip 层数的归档内目标：返回顶层含 source 的临时目录。 */
function extract(tool, archive) {
  const tmp = join(WORK, tool);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execSync(`tar --force-local -xzf "${posix(archive)}" -C "${posix(tmp)}"`, { stdio: 'ignore', shell: true });
  const spec = LOCK.tools[tool];
  let source = tmp;
  for (let i = 0; i < (spec.strip || 0); i++) {
    const entries = readdirSync(source, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (entries.length !== 1) {
      throw new Error(`${tool}: strip=${spec.strip} 但顶层目录数=${entries.length}`);
    }
    source = join(source, entries[0].name);
  }
  return { tmp, source };
}

function srcFile(source, rel) {
  const p = join(source, rel);
  return existsSync(p) ? p : undefined;
}

function deployJni(tool, spec, source) {
  const missing = [];
  for (const rel of spec.jni) {
    const src = srcFile(source, rel);
    if (!src) { missing.push(rel); continue; }
    const dst = join(JNI_OUT, rel);
    mkdirSync(JNI_OUT, { recursive: true });
    copyFileSync(src, dst);
    log(`  jni ${rel}: ✓（${statSync(dst).size} B）`);
  }
  if (missing.length) throw new Error(`${tool}: 缺少 jni 文件 ${missing.join(', ')}`);
}

function deployAssets(tool, spec, source) {
  const missing = [];
  const dstRoot = join(ASSETS_OUT, tool);
  rmSync(dstRoot, { recursive: true, force: true });
  mkdirSync(dstRoot, { recursive: true });
  for (const rel of spec.assets) {
    const src = srcFile(source, rel);
    if (!src) { missing.push(rel); continue; }
    copyRecursive(src, join(dstRoot, rel.split('/').pop()));
    log(`  assets ${tool}/${rel.split('/').pop()}: ✓`);
  }
  if (missing.length) throw new Error(`${tool}: 缺少资产 ${missing.join(', ')}`);

  const licDst = join(ASSETS_OUT, 'licenses', tool);
  if (spec.licenses && spec.licenses.length) {
    mkdirSync(licDst, { recursive: true });
    for (const rel of spec.licenses) {
      const src = srcFile(source, rel);
      if (!src) continue;
      copyFileSync(src, join(licDst, rel.split('/').pop()));
    }
  }
  if (spec.extra) {
    mkdirSync(licDst, { recursive: true });
    for (const rel of spec.extra) {
      const src = srcFile(source, rel);
      if (!src) continue;
      copyFileSync(src, join(licDst, rel.split('/').pop()));
    }
  }
}

function writeGates() {
  const gates = {};
  for (const [tool, spec] of Object.entries(LOCK.tools)) {
    gates[tool] = {
      version: spec.version,
      archiveSha256: spec.sha256,
      jni: spec.jni.map((f) => f),
      assets: spec.assets.map((a) => a),
    };
  }
  writeFileSync(join(ROOT, 'build/cli.gates.json'), JSON.stringify(gates, null, 2));
  log('已写出 build/cli.gates.json（归档级 sha256 见 cli.lock.json；ELF/PT_INTERP 门禁见各仓 gates-report）');
}

/** 校验当前投放状态（存在且非空）。逐文件 sha 以各仓 Release 的 .sha256/gates-report 为准。 */
function verifyDeployment() {
  let allOk = true;
  for (const [tool, spec] of Object.entries(LOCK.tools)) {
    for (const rel of spec.jni) {
      const dst = join(JNI_OUT, rel);
      const ok = existsSync(dst) && statSync(dst).size > 0;
      if (!ok) {
        allOk = false;
        console.error(`[provision-cli] ✗ jni ${tool}/${rel} 缺失或为空`);
      }
    }
    for (const rel of spec.assets) {
      const dst = join(ASSETS_OUT, tool, rel.split('/').pop());
      if (!existsSync(dst)) {
        allOk = false;
        console.error(`[provision-cli] ✗ assets ${tool}/${rel} 缺失`);
      }
    }
  }
  return allOk;
}

// ── 主流程 ─────────────────────────────────────────────────────────────
if (check) {
  if (!verifyDeployment()) fail(2, 'CLI 投放不完整：请先运行 provision-cli');
  log('--check 通过（12 .so + 数据资产齐全）');
  process.exit(0);
}

// 顺序投放
mkdirSync(WORK, { recursive: true });
mkdirSync(CACHE, { recursive: true });
for (const [tool, spec] of Object.entries(LOCK.tools)) {
  log(`[${tool}] ${spec.version}（${spec.archive}）`);
  const local = archiveFor(tool);
  let archive = local;
  if (!archive) {
    const cached = join(CACHE, spec.archive);
    const valid = existsSync(cached) && statSync(cached).size === spec.size && sha256Of(cached) === spec.sha256;
    if (valid) {
      archive = cached;
      log(`  命中缓存 ${cached}（sha256 ✓）`);
    } else {
      log(`  下载 ${spec.url}`);
      execSync(`curl -sL --connect-timeout 15 -o "${cached}" "${spec.url}"`, { stdio: 'ignore' });
      if (!existsSync(cached) || statSync(cached).size !== spec.size) {
        fail(2, `${tool}: 下载大小不符（${existsSync(cached) ? statSync(cached).size : 0} ≠ ${spec.size}）`);
      }
      if (sha256Of(cached) !== spec.sha256) {
        fail(2, `${tool}: sha256 不符：${sha256Of(cached).slice(0, 12)}… ≠ ${spec.sha256.slice(0, 12)}…`);
      }
      archive = cached;
      log(`  下载完成并校验 ✓`);
    }
  } else {
    if (!existsSync(local)) fail(2, `${tool}: --archive-${tool} 指定文件不存在：${local}`);
    if (sha256Of(local) !== spec.sha256) fail(2, `${tool}: 本地归档 sha256 不符`);
    archive = local;
  }

  let ext;
  try {
    ext = extract(tool, archive);
  } catch (error) {
    fail(2, `${tool}: 解包失败 ${error.message}`);
  }
  try {
    deployJni(tool, spec, ext.source);
    deployAssets(tool, spec, ext.source);
  } catch (error) {
    fail(2, `${tool}: 投放失败 ${error.message}`);
  }
  rmSync(ext.tmp, { recursive: true, force: true });
}
writeGates();
log('全部投放完成 → app/src/main/jniLibs/arm64-v8a/ 与 app/src/main/assets/cli/（二进制不入库）');
