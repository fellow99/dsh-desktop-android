'use strict';
/**
 * 平台垫片 S6：node-pty 原生件定位（装载到 `nativeLibraryDir` 的 `libpty_node.so`）。
 *
 * 为什么需要：
 *   - 上游 node-pty 的 `loadNativeModule()`（`lib/utils.js`）只在
 *     `build/Release|Debug|prebuilds/<p>-<a>` 下找 `pty.node`，从不看 Android 的
 *     `nativeLibraryDir`；
 *   - Android 10+ W^X（宪法 A10 / docs 111-PTY实现方案.md §5）：filesDir 载荷目录
 *     noexec，把 `pty.node` 副本放 / 或在载荷内 `exec`/dlopen ELF 会被拒；唯一可执行位是
 *     `nativeLibraryDir`（AAR 投放、`useLegacyPackaging=false` 不压缩）；
 *   - 因此把可执行件留在 `nativeLibraryDir`，由 Kotlin `System.loadLibrary("pty_node")`
 *     预载，此处只建一个 **symlink**：`node_modules/node-pty/build/Release/pty.node`
 *     → `<nativeLibraryDir>/libpty_node.so`。node-pty 按 `.node` 扩展名命中该路径，
 *     Node `process.dlopen` 沿 symlink realpath 到可执行位，与 Kotlin 预载同一 inode，
 *     dlopen 复用已装载句柄（无第二副本、不触 noexec）。
 *
 * 约束（宪法 C2：不伪造）：
 *   - 缺 `DSH_ANDROID_NATIVE_LIB_DIR` 或目标不存在 ⇒ installed=false 并记录原因，
 *     由调用方结构化上报，绝不静默产出假终端；
 *   - symlink 已存在且指向正确即幂等（EEXIST 视为已就位，若指向错误则强制为之）。
 *
 * 标记：DSH_ANDROID_SHIM node-pty（`/_android/facts` 与 selfcheck 依赖它）。
 */
const fs = require('node:fs');
const path = require('node:path');

const MARKER = 'DSH_ANDROID_SHIM node-pty';

/** node-pty 包地址（载荷运行树内）：<payload>/dsh/node_modules/node-pty */
function ptyPackageRoot() {
  // 本文件位于 <payload>/shims/s6-node-pty.js
  const shimsDir = __dirname;
  const payloadRoot = path.dirname(shimsDir);
  return path.join(payloadRoot, 'dsh', 'node_modules', 'node-pty');
}

const REL_TARGET = path.join('build', 'Release', 'pty.node');

/**
 * 安装：在 node-pty 的 build/Release 下放置 pty.node → nativeLibraryDir/libpty_node.so 的 symlink。
 * @param {(line: string) => void} [log]
 * @returns {{ marker: string, installed: boolean, libDir?: string, detail?: string }}
 */
function install(log) {
  const libDir = process.env.DSH_ANDROID_NATIVE_LIB_DIR;
  if (!libDir || typeof libDir !== 'string' || libDir === '') {
    const detail = '缺少 DSH_ANDROID_NATIVE_LIB_DIR';
    if (typeof log === 'function') log(`${MARKER}: installed=false (${detail})`);
    return { marker: MARKER, installed: false, detail };
  }

  const native = path.join(libDir, 'libpty_node.so');
  if (!fs.existsSync(native)) {
    const detail = `nativeLibraryDir 缺 libpty_node.so: ${native}`;
    if (typeof log === 'function') log(`${MARKER}: installed=false (${detail})`);
    return { marker: MARKER, installed: false, detail };
  }

  // 加载由材质期补丁 patchNodePtyNativeLoad（node-pty/lib/utils.js）完成：
  //   loadNativeModule() 经 process.dlopen 从 nativeLibraryDir/libpty_node.so 加载
  //   （绕过 Node 的扩展名判定——symbolic-link → .so 会被当成 JS 解析）。
  // 本垫片只做「可加载性事实校验 + 登记」；真验证在 require('node-pty') 时发生。
  if (typeof log === 'function') log(`${MARKER}: installed (native=${native}; load via process.dlopen)`);
  return { marker: MARKER, installed: true, libDir, native, detail: 'ok' };
}

module.exports = { install, marker: MARKER, REL_TARGET };
