#!/usr/bin/env node
/**
 * 打包载荷（§7.4）：payload/ → app/src/main/assets/dsh-payload/{dsh.tar, dsh.version}
 *
 * - 产物为**裸 ustar**（AAPT2 会把 *.gz 解压改名，故 APK 资产不用 .gz；APK zip 自带压缩）；
 * - 确定性 ustar：条目按路径排序、mtime=0、uid/gid=0、无 pax/GNU 扩展（与 Kotlin TarReader 契约对齐）；
 * - dsh.version 首行 sha256=<tar 哈希>，随后 files/bytes/version 三元组；
 * - 幂等：输入清单（相对路径+大小+sha）未变化时跳过重打包；
 * - 断言：无 symlink、无绝对路径条目、单文件 < 512 MiB。
 *
 * 用法：node scripts/package-payload.mjs [--force]
 */
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
// --src：要打包的根目录（assemble-payload 产物 build/payload-stage/root；缺省 payload/ 探针形态）
const SRC = resolve(ROOT, value('--src') ?? 'payload');
const OUT_DIR = join(ROOT, 'app/src/main/assets/dsh-payload');
const ARCHIVE = join(OUT_DIR, 'dsh.tar');
const VERSION = join(OUT_DIR, 'dsh.version');
const STATE = join(ROOT, 'build/payload-package.state.json');

const force = process.argv.includes('--force');

function fail(code, msg) {
  console.error(`[package-payload] ${msg}`);
  process.exit(code);
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(1, `载荷内禁止 symlink：${relative(base, full)}`);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push({ full, rel: relative(base, full).split(sep).join('/') });
  }
  return out;
}

// ── 收集输入 ────────────────────────────────────────────────────────────────
if (!existsSync(SRC)) fail(2, `缺少源目录：${SRC}`);
const files = walk(SRC);
let total = 0;
const manifest = files.map((f) => {
  const st = statSync(f.full);
  if (st.size >= 512 * 1024 * 1024) fail(1, `单文件超 512MiB：${f.rel}`);
  total += st.size;
  const sha = createHash('sha256').update(readFileSync(f.full)).digest('hex');
  return { rel: f.rel, size: st.size, sha };
});
// 打包器格式版本并入幂等键：改 writeHeader 契约时同步升版本，避免旧归档被静默复用
const PACK_FORMAT = 'v2-ustar-prefix1'
const inputsKey = createHash('sha256')
  .update(PACK_FORMAT + JSON.stringify(manifest))
  .digest('hex');

// ── 幂等检查 ────────────────────────────────────────────────────────────────
if (!force && existsSync(ARCHIVE) && existsSync(VERSION) && existsSync(STATE)) {
  try {
    const prev = JSON.parse(readFileSync(STATE, 'utf8'));
    if (prev.inputsKey === inputsKey) {
      console.log(`[package-payload] 输入未变化（${manifest.length} files），跳过重打包`);
      process.exit(0);
    }
  } catch { /* 重打 */ }
}

// ── ustar 写入 ──────────────────────────────────────────────────────────────
function octal(n, digits) {
  return n.toString(8).padStart(digits, '0');
}

function writeHeader(buf, entry) {
  // entry: {name, size, type}
  buf.fill(0);
  let name = entry.name;
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    // 在 '/' 边界切 prefix（≤155）/ name（≤100）：合法 cut ∈ [len-100-1, 155]
    const minCut = name.length - 101;
    let cut = -1;
    for (let i = Math.min(155, name.length - 2); i >= minCut; i--) {
      if (i >= 0 && name[i] === '/') { cut = i; break; }
    }
    if (cut < 0) fail(1, `条目名过长且无法切分：${name}`);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
      fail(1, `条目名切分失败：${entry.name}`);
    }
  }
  buf.write(name, 0, 100, 'utf8');
  buf.write('0000644\0', 100, 8, 'utf8');   // mode
  buf.write('0000000\0', 108, 8, 'utf8');   // uid
  buf.write('0000000\0', 116, 8, 'utf8');   // gid
  buf.write(octal(entry.size, 11) + '\0', 124, 12, 'utf8'); // size
  buf.write('00000000000\0', 136, 12, 'utf8'); // mtime = 0（确定性）
  buf.write('        ', 148, 8, 'utf8');    // chksum 占位
  buf.write(entry.type, 156, 1, 'utf8');    // '0' file | '5' dir
  buf.write('ustar\0', 257, 6, 'utf8');
  buf.write('00', 263, 2, 'utf8');
  buf.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of buf) sum += b;
  buf.write(octal(sum, 6) + '\0 ', 148, 8, 'utf8');
}

const chunks = [];
function pushBlock(buf) {
  chunks.push(buf);
}

for (const f of files) {
  const st = statSync(f.full);
  const rel = f.rel;
  if (rel.startsWith('/') || rel.split('/').includes('..')) fail(1, `非法条目路径：${rel}`);
  // 目录条目（含中间目录，保证空目录也在包里）
  const parts = rel.split('/');
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    const dirBuf = Buffer.alloc(512);
    writeHeader(dirBuf, { name: `${acc}/`, size: 0, type: '5' });
    pushBlock(dirBuf);
  }
  const h = Buffer.alloc(512);
  writeHeader(h, { name: rel, size: st.size, type: '0' });
  pushBlock(h);
  const data = readFileSync(f.full);
  const pad = (512 - (data.length % 512)) % 512;
  chunks.push(data, Buffer.alloc(pad));
}
chunks.push(Buffer.alloc(1024)); // 结束双零块

const tar = Buffer.concat(chunks);
const sha256 = createHash('sha256').update(tar).digest('hex');

// ── 落盘 ───────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(STATE), { recursive: true });
writeFileSync(ARCHIVE, tar);
const versionLines = [
  `sha256=${sha256}`,
  `files=${manifest.length}`,
  `bytes=${tar.length}`,
  'version=app 0.1.0 / dsh 0.2.1-rc.2 / node 24.22.1',
  `inputsKey=${inputsKey}`,
];
writeFileSync(VERSION, versionLines.join('\n') + '\n');
writeFileSync(STATE, JSON.stringify({ inputsKey, sha256, at: new Date().toISOString() }, null, 1));

console.log(`[package-payload] dsh.tar ${tar.length} B, ${manifest.length} files, sha256=${sha256.slice(0, 12)}…`);
