'use strict';
/**
 * 112-cli-integration（FR-112-3 / D4）—— CLI 环境引导层。
 *
 * 在 Host 启动前把五件 CLI（node/npm/npx/corepack、python/pip、git、uv、pnpm）接到运行环境：
 *   1) `$HOME/bin` 命令符号链接农场（→ nativeLibraryDir 的 lib*.so；SELinux 只查目标标签，放行）；
 *   2) 把 `nativeLibraryDir` 与 `$HOME/bin` 前置到 `PATH`，注入运行期依赖 env
 *      （LD_LIBRARY_PATH / NODE_TOOLS_DIR / SSL_CERT_FILE / GIT_* / PYTHONHOME / npm registry）；
 *   3) 逐工具 spawn `--version` 探针，返回 { tool: version|missing } 供 facts/日志如实上报（C2）。
 *
 * 纪律：幂等（$HOME/bin/.cli-farm-ready marker）；失败只记日志、绝不阻断 Host 启动（C2）；
 * 只写符号链接（filesDir 为 noexec，脚本垫片不可 exec——见 docs/aosp+node+python+git运行方案.md §4.3）。
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** 农场条目：{ name: <PATH 命令名>, target: <NLDIR 下的实体文件>, probe: [args] } */
function farmEntries(nldir, cliData) {
  const p = (name) => path.join(nldir, name);
  return [
    { name: 'node', target: p('libnode_cli.so'), probe: ['--version'] },
    { name: 'npm', target: p('libnpm.so'), probe: ['--version'], needsNodeTools: true },
    { name: 'npx', target: p('libnpx.so'), probe: ['--version'], needsNodeTools: true },
    { name: 'corepack', target: p('libcorepack.so'), probe: ['--version'], needsNodeTools: true },
    { name: 'python', target: p('libpython_cli.so'), probe: ['-V'] },
    { name: 'python3', target: p('libpython_cli.so'), probe: [] },
    // pip/pip3 包装脚本按 `dirname $0` 找 libpython_cli.so ⇒ 农场需同名软链
    { name: 'libpython_cli.so', target: p('libpython_cli.so'), probe: [] },
    { name: 'pip', target: p('libpip.so'), probe: ['--version'] },
    { name: 'pip3', target: p('libpip3.so'), probe: ['--version'] },
    { name: 'uv', target: p('libuv_cli.so'), probe: ['--version'] },
    { name: 'pnpm', target: p('libpnpm_cli.so'), probe: ['--version'] },
    { name: 'git', target: p('libgit_cli.so'), probe: ['--version'] },
    // npm/npx 包装脚本经 NODE_NATIVE_DIR 定位 libnode_cli.so；农场同名软链作双保险
    { name: 'libnode_cli.so', target: p('libnode_cli.so'), probe: [] },
    // git remote helper（git 按 exec-path/PATH 查子程序名）
    { name: 'git-http-fetch', target: p('libgit_http_fetch.so'), probe: [] },
    { name: 'git-remote-https', target: p('libgit_remote_curl.so'), probe: [] },
    { name: 'git-remote-http', target: p('libgit_remote_curl.so'), probe: [] },
    { name: 'git-remote-ftp', target: p('libgit_remote_curl.so'), probe: [] },
    { name: 'git-remote-ftps', target: p('libgit_remote_curl.so'), probe: [] },
  ].filter((e) => fs.existsSync(e.target));
}

/**
 * 安装环境引导层。
 * @param {import('node:fs').appendFileSyncLike} log
 * @returns {{ installed: boolean, marker: string, tools: object }} 探头结果
 */
function install(log) {
  const nldir = process.env.DSH_ANDROID_NATIVE_LIB_DIR || '';
  const cliData = process.env.DSH_CLI_DATA_DIR || '';
  const home = process.env.HOME || path.join(process.env.DSH_HOME || '', 'home');
  const homeBin = path.join(home, 'bin');
  const marker = path.join(homeBin, '.cli-farm-ready');
  const tools = {};

  if (!nldir || !fs.existsSync(nldir)) {
    const reason = `${!nldir ? 'DSH_ANDROID_NATIVE_LIB_DIR 未设置' : `nativeLibraryDir 不存在：${nldir}`}`;
    log(`cli-env: 跳过（${reason}）——CLI 能力不可用`);
    return { installed: false, marker: 'DSH_CLI_ENV missing-nldir', tools };
  }

  // ── 1) 符号链接农场（幂等）──────────────────────────────────────────────
  try {
    fs.mkdirSync(homeBin, { recursive: true });
    let created = 0;
    let replaced = 0;
    for (const entry of farmEntries(nldir, cliData)) {
      const link = path.join(homeBin, entry.name);
      try {
        // 重装/升级后 nativeLibraryDir 路径会变（APK 目录哈希变化），旧软链会悬空。
        // 用 lstatSync（不跟随）+ readlinkSync（读链接本体的目标串）做比对：悬空链接也能被识别并重建。
        let needsCreate = true;
        try {
          const st = fs.lstatSync(link);
          if (st.isSymbolicLink()) {
            if (fs.readlinkSync(link) === entry.target) {
              needsCreate = false;
            } else {
              fs.rmSync(link, { force: true });
              replaced++;
            }
          } else {
            fs.rmSync(link, { force: true });
            replaced++;
          }
        } catch {
          // 不存在 → 需要创建
        }
        if (!needsCreate) continue;
        fs.symlinkSync(entry.target, link);
        created++;
      } catch (error) {
        log(`cli-env: 农场 ${entry.name} 建链失败：${error.message}`);
      }
    }
    if (!fs.existsSync(marker)) {
      try { fs.writeFileSync(marker, JSON.stringify({ at: new Date().toISOString(), created, replaced })); } catch (_) { /* ignore */ }
    }
    log(`cli-env: $HOME/bin 农场就绪（创建 ${created} 条 / 重建 ${replaced} 条链接）`);
  } catch (error) {
    log(`cli-env: 农场建立失败：${error.message}`);
  }

  // ── 2) 环境注入（幂等；PATH 前置 NLDIR + HOME_BIN）──────────────────────
  const currentPath = process.env.PATH || '';
  const prepend = [nldir, homeBin].filter(Boolean);
  if (!prepend.every((p) => currentPath.split(path.delimiter).includes(p))) {
    process.env.PATH = [...prepend, ...currentPath.split(path.delimiter).filter(Boolean)].join(path.delimiter);
  }
  process.env.LD_LIBRARY_PATH = nldir;
  // 112：npm/npx/corepack 壳脚本经 NODE_NATIVE_DIR 定位 libnode_cli.so（农场符号链接场景下
  // dirname $0 指向 $HOME/bin 而非 nativeLibraryDir，必须显式注入）。
  process.env.NODE_NATIVE_DIR = nldir;
  if (cliData) {
    const nodeTools = path.join(cliData, 'node', 'node-bridge-tools');
    const pythonLib = path.join(cliData, 'python', 'stdlib-assets', 'lib');
    const gitBridge = path.join(cliData, 'git', 'git-bridge-tools');
    if (fs.existsSync(nodeTools)) process.env.NODE_TOOLS_DIR = nodeTools;
    if (fs.existsSync(path.join(pythonLib, 'python3.14'))) {
      // PYTHONHOME 指向 stdlib 根（stdlib-assets：含 lib/ 与 cacert.pem）；PYTHONPATH 指向 lib
      process.env.PYTHONHOME = path.join(cliData, 'python', 'stdlib-assets');
      process.env.PYTHONPATH = pythonLib;
      process.env.PYTHONNOUSERSITE = '1';
    }
    const cacertPem = path.join(gitBridge, 'cacert.pem');
    if (fs.existsSync(cacertPem)) process.env.SSL_CERT_FILE = cacertPem;
    if (fs.existsSync(path.join(gitBridge, 'templates'))) {
      process.env.GIT_TEMPLATE_DIR = path.join(gitBridge, 'templates');
    }
    process.env.GIT_EXEC_PATH = homeBin; // git 子程序（remote helpers）在此找
    process.env.GIT_CONFIG_GLOBAL = path.join(home, '.gitconfig');
    // node/npm registry：沿用既有镜像缺省；显式 DSH_ANDROID_REGISTRY 优先
    if (!process.env.npm_config_registry && process.env.DSH_ANDROID_REGISTRY) {
      process.env.npm_config_registry = process.env.DSH_ANDROID_REGISTRY;
    }
  }
  // pnpm 引擎（110 → 112 替换）：软链到农场
  if (fs.existsSync(path.join(homeBin, 'pnpm'))) {
    process.env.DSH_PNPM_ENGINE = path.join(homeBin, 'pnpm');
  }

  // ── 3) 版本探针（C2：如实上报，缺失 = missing）──────────────────────────
  for (const entry of farmEntries(nldir, cliData)) {
    if (!entry.probe || entry.probe.length === 0) continue;
    try {
      const r = spawnSync(entry.target, entry.probe, {
        encoding: 'utf8', timeout: 15000,
        env: { ...process.env, PATH: process.env.PATH || '/system/bin', HOME: home, TMPDIR: process.env.TMPDIR },
      });
      if (r.status === 0) {
        tools[entry.name] = (r.stdout || '').trim().split('\n')[0];
      } else {
        tools[entry.name] = { error: `rc=${r.status} ${String(r.stderr || '').trim().slice(0, 120)}` };
      }
    } catch (error) {
      tools[entry.name] = { error: error.message };
    }
  }
  log(`cli-env: probe node=${tools.node} git=${tools.git} python=${tools.python} pnpm=${tools.pnpm} uv=${tools.uv}`);
  return { installed: true, marker: 'DSH_CLI_ENV installed', tools };
}

module.exports = { install, farmEntries };
