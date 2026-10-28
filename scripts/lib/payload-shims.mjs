/**
 * 载荷物化期的垫片安装器（Android 版）。
 *
 * 三条白名单垫片（docs/000-工程规划.md §5.3，标记 DSH_ANDROID_SHIM）：
 *   S1 flock       —— @deepseek-ai/node-addon-system/lib/flock.js 单进程替身（文件替换）
 *   S2 sharp       —— node_modules/sharp 同名包替身 → @dsh-android/attachment-image
 *   S3 require-builtin —— node-addon-require-builtin 原生 addon → 纯 JS（依赖 --expose-internals）
 * 附件目录 fsync 降级补丁（Android 沙箱边界 best-effort，防御性；预期不触发）。
 *
 * 与 ark 的差异：fs-link/fs-symlink 垫片不需要（Android 原生支持）；无 jitless 层。
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const FLOCK_MARKER = 'DSH_ANDROID_FLOCK_STUB';
export const SHIM_TAG = 'dshAndroidShim';
const FLOCK_SOURCE = join(ROOT, 'payload/shims/node-addon-system-flock.js');
const SHARP_SOURCE = join(ROOT, 'payload/shims/sharp');
const REQUIRE_BUILTIN_SOURCE = join(ROOT, 'payload/shims/require-builtin.js');

function fail(message) {
  throw new Error(`[payload-shims] ${message}`);
}

/** S1：把载荷里的 node-addon-system/lib/flock.js 换成单进程替身（幂等）。 */
export function applyFlockShim(stage, log = () => {}) {
  const dest = join(stage, 'node_modules/@deepseek-ai/node-addon-system/lib/flock.js');
  if (!existsSync(FLOCK_SOURCE)) fail(`缺少 S1 垫片源码：${FLOCK_SOURCE}`);
  if (!existsSync(dest)) fail(`载荷里没有 node-addon-system/lib/flock.js：${dest}`);

  if (readFileSync(dest, 'utf8').includes(FLOCK_MARKER)) {
    log('垫片 S1：flock 已是单进程替身（幂等）');
    return dest;
  }
  const backup = join(dirname(dest), 'flock.upstream.js');
  if (!existsSync(backup)) copyFileSync(dest, backup);
  writeFileSync(dest, readFileSync(FLOCK_SOURCE, 'utf8'));
  if (!readFileSync(dest, 'utf8').includes(FLOCK_MARKER)) fail(`S1 替换后标记缺失：${dest}`);
  log('垫片 S1：node-addon-system/flock → 单进程替身（上游备份 flock.upstream.js）');
  return dest;
}

/** S2：把载荷里的 node_modules/sharp 换成同名包替身。 */
export function applySharpShim(stage, log = () => {}) {
  const dest = join(stage, 'node_modules/sharp');
  const manifestPath = join(dest, 'package.json');
  if (!existsSync(join(SHARP_SOURCE, 'index.cjs')) || !existsSync(join(SHARP_SOURCE, 'package.json'))) {
    fail(`缺少 S2 垫片源码：${SHARP_SOURCE}`);
  }

  let upstreamVersion = '';
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest[SHIM_TAG] === 'S2') {
        log('垫片 S2：sharp 已是纯 JS 替身（幂等）');
        return dest;
      }
      upstreamVersion = String(manifest.version ?? '');
    } catch {
      upstreamVersion = '';
    }
  }

  const backup = join(stage, 'node_modules', 'sharp.upstream');
  if (existsSync(dest)) {
    if (!existsSync(backup)) renameSync(dest, backup);
    else rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  cpSync(SHARP_SOURCE, dest, { recursive: true });
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.upstreamVersion = upstreamVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (!existsSync(join(dest, 'index.cjs'))) fail(`S2 替换后入口缺失：${dest}`);
  log(`垫片 S2：sharp → @dsh-android/attachment-image（upstreamVersion=${upstreamVersion || 'unknown'}）`);
  return dest;
}

/** S3：把 node-addon-require-builtin（原生 addon）替换为纯 JS 实现（依赖 --expose-internals）。 */
export function installRequireBuiltinShim(stage, log = () => {}) {
  const dest = join(stage, 'node_modules/node-addon-require-builtin');
  if (!existsSync(dest)) fail(`载荷里没有 node-addon-require-builtin：${dest}（检查 deploy 是否完整）`);
  let upstreamVersion = '';
  try {
    upstreamVersion = String(JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8')).version ?? '');
  } catch {
    upstreamVersion = '';
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, 'lib'), { recursive: true });
  writeFileSync(
    join(dest, 'package.json'),
    `${JSON.stringify(
      {
        name: 'node-addon-require-builtin',
        version: upstreamVersion === '' ? '0.1.9' : upstreamVersion,
        type: 'commonjs',
        description: 'Android shim S3: pure JS replacement for the native require-builtin addon (needs --expose-internals).',
        main: 'lib/index.js',
        exports: {
          '.': { import: './lib/index.js', require: './lib/index.js', default: './lib/index.js' },
          './package.json': './package.json',
        },
        license: 'MIT',
        [SHIM_TAG]: 'S3',
        upstreamVersion,
      },
      null,
      2,
    )}\n`,
  );
  copyFileSync(REQUIRE_BUILTIN_SOURCE, join(dest, 'lib/index.js'));
  log(`垫片 S3：node-addon-require-builtin → 纯 JS（upstreamVersion=${upstreamVersion || 'unknown'}）`);
  return dest;
}

/** 附件目录 fsync 降级（Android 私有目录预期可 fsync；此补丁是纵深防御，EACCES/EPERM 时跳过）。 */
export function applyAttachmentDurabilityPatch(stage, log = () => {}) {
  const file = join(stage, 'node_modules/@deepseek-ai/dsh-attachment-local/lib/index.js');
  if (!existsSync(file)) fail(`载荷里没有 dsh-attachment-local：${file}`);
  const text = readFileSync(file, 'utf8');
  const MARK = 'DSH_ANDROID_SYNC_DIR_BEST_EFFORT';
  if (text.includes(MARK)) {
    log('补丁 S4：附件目录持久性证明已是 best-effort（幂等）');
    return file;
  }
  const anchor = 'await syncDirectory(parent);';
  const occurrences = text.split(anchor).length - 1;
  if (occurrences !== 1) fail(`S4 锚点不唯一或缺失（${occurrences}）：${anchor}`);
  const patched = text.replace(anchor, 'await syncDirectoryBestEffort(parent);') + '\n' + `
/** ${MARK}: Android 沙箱边界 fsync 祖先目录可能 EACCES ⇒ 边界处降级（纵深防御）。 */
async function syncDirectoryBestEffort(dir) {
  try {
    await syncDirectory(dir);
  } catch (error) {
    const code = error && error.code;
    if (code !== 'EACCES' && code !== 'EPERM') throw error;
    if (!globalThis.${MARK}_WARNED) {
      globalThis.${MARK}_WARNED = true;
      console.error('[android] syncDirectory at sandbox boundary skipped: ' + dir + ' (' + code + ')');
    }
  }
}
`;
  writeFileSync(file, patched);
  if (!readFileSync(file, 'utf8').includes(MARK)) fail(`S4 补丁后标记缺失：${file}`);
  log('补丁 S4：dsh-attachment-local 目录 fsync 改为沙箱边界 best-effort');
  return file;
}
