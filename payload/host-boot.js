'use strict';
/**
 * dsh Host 启动器（等价于 `apps/desktop-host` 的精简版）—— Android 版。
 *
 * 只做四件事：
 *   1) 从运行根解析上游包（`createRequire` 指向 `@deepseek-ai/dsh/package.json`）；
 *   2) `loadProfileDirectory` 载入 `<runRoot>/profiles/android`（用户 patch 来自 `$DSH_HOME/user-patch.yml`）；
 *   3) `runProfile` 启动 Web 应用（`--host 127.0.0.1 --port 0 --no-open`）；
 *   4) 用 `ctx.connection.authenticatedUrl()` 上报带一次性 token 的入口 URL。
 *
 * 失败时不抛给 bootstrap（那会被当作致命错误），而是写 `ready.json` 的失败态。
 * 就绪纪律：`DSH_READY` 日志行只含 {origin,port,pid}，绝不含 token（specs/overall-data-model.md §1）。
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');

async function start(ctx) {
  const { runRoot, version, shims, probes, profileName, log, writeReady } = ctx;
  const dshHome = process.env.DSH_HOME;
  const projectDir = path.join(runRoot, 'profiles', profileName || 'android');
  const userPatch = path.join(dshHome, 'user-patch.yml');
  const dshManifest = path.join(runRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');

  // 012/201：进程内 pnpm 的运行时前提（引擎入口 + profile pnpm 配置），幂等、失败只记日志
  configureMarketRuntime({ runRoot, profileDir: projectDir, log });

    writeReady({ phase: 'starting', sha12: version.sha12 || '', shims: shims.map((s) => s.marker), probes });

  if (!fs.existsSync(dshManifest)) {
    writeReady({
      phase: 'payload-missing',
      diagnostic: `缺少上游包：${dshManifest}`,
      shims: shims.map((s) => s.marker),
      probes,
    });
    return;
  }

  let appBoot;
  let profileBoot;
  try {
    const requireFromRun = createRequire(dshManifest);
    appBoot = await import(pathToFileURL(requireFromRun.resolve('@deepseek-ai/dsh-app-boot')).href);
    profileBoot = await import(pathToFileURL(requireFromRun.resolve('@deepseek-ai/dsh/profile-boot')).href);
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    log(`host: resolve upstream failed: ${message}`);
    writeReady({ phase: 'failed', diagnostic: `解析上游包失败：${message}`, shims: shims.map((s) => s.marker), probes });
    return;
  }

  try {
    const profile = appBoot.loadProfileDirectory('dsh', projectDir, dshManifest);
    appBoot.reportSkippedBundles('dsh', profile);
    log(`host: profile loaded from ${projectDir}`);

    const application = profileBoot.runProfile({
      environment: appBoot.loadLayeredEnv('dsh'),
      profile: profileName || 'android',
      resolvedProfile: { profile, installAnchor: dshManifest },
      patchFiles: fs.existsSync(userPatch) ? [userPatch] : [],
      args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
    });

    const { ctx: hostCtx } = await application;
    // 上游只提供 loopback 端口；不要臆造 `webServer.protocol` 之类的字段（不存在 → Invalid URL）。
    const port = hostCtx.webServer.port;
    if (!Number.isInteger(port) || port <= 0) {
      const diagnostic = `webServer.port 非法：${String(port)}`;
      log(`host: ${diagnostic}`);
      writeReady({ phase: 'failed', diagnostic, shims: shims.map((s) => s.marker), probes });
      return;
    }
    const origin = `http://127.0.0.1:${String(port)}`;
    const url = hostCtx.connection.authenticatedUrl(origin);
    const token = new URL(url).searchParams.get('token') || '';
    if (token === '') {
      const diagnostic = 'authenticatedUrl 未携带一次性 token';
      log(`host: ${diagnostic}`);
      writeReady({ phase: 'failed', diagnostic, shims: shims.map((s) => s.marker), probes });
      return;
    }

    writeReady({
      phase: 'ready',
      url,
      origin,
      token,
      pid: process.pid,
      sha12: version.sha12 || '',
      shims: shims.map((s) => s.marker),
      probes,
      roots: {
        payload: runRoot,
        dshHome,
        workspace: process.env.DSH_ANDROID_WORKSPACE || '',
        userRoot: process.env.DSH_USER_ROOT || '',
      },
    });
    // 脱敏日志：只有 origin/port/pid，绝不含 token（宪法 C9）
    process.stdout.write(`DSH_READY ${JSON.stringify({ origin, port, pid: process.pid })}\n`);
    log(`host: ready at ${origin} (token length=${token.length})`);
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    log(`host: runProfile failed: ${message}`);
    writeReady({ phase: 'failed', diagnostic: `启动 dsh Host 失败：${message}`, shims: shims.map((s) => s.marker), probes });
  }
}


/** 012/201：pnpm 运行时前提（幂等；失败不影响 Host 启动）。storeDir 必须绝对路径。 */
function configureMarketRuntime(options) {
  const { runRoot, profileDir, log } = options;
  const engine = path.join(runRoot, 'node_modules', 'dsh-market-pnpm', 'bin', 'pnpm.cjs');
  if (fs.existsSync(engine)) {
    process.env.DSH_PNPM_ENGINE = engine;
    log(`market: DSH_PNPM_ENGINE=${engine}`);
  } else {
    log('market: pnpm 引擎未随包（P3 裁剪？），desktopPnpm 将不可用');
  }
  const storeDir = path.join(profileDir, '.pnpm-store');
  const configFile = path.join(profileDir, 'pnpm-workspace.yaml');
  try {
    if (!fs.existsSync(configFile)) {
      const body = [
        'packages:',
        '  - .',
        '',
        'nodeLinker: hoisted',
        'autoInstallPeers: false',
        'packageImportMethod: copy',
        'ignoreScripts: true',
        'minimumReleaseAge: 0',
        `storeDir: ${JSON.stringify(storeDir)}`,
        '',
      ].join('\n');
      fs.writeFileSync(configFile, body);
      log(`market: wrote pnpm config ${configFile}`);
    } else {
      const current = fs.readFileSync(configFile, 'utf8');
      const match = /^storeDir:\s*(.+)$/m.exec(current);
      const configured = match === null ? '' : match[1].trim().replace(/^["']|["']$/g, '');
      if (configured !== storeDir) {
        const rewritten = match === null
          ? current.trimEnd() + `\nstoreDir: ${JSON.stringify(storeDir)}\n`
          : current.replace(match[0], `storeDir: ${JSON.stringify(storeDir)}`);
        fs.writeFileSync(configFile, rewritten);
        log(`market: storeDir 修正为 ${storeDir}（原值 ${configured || "未设置"}）`);
      } else {
        log(`market: pnpm config kept as-is ${configFile}`);
      }
    }
  } catch (error) {
    log(`market: pnpm config unavailable (continuing): ${error && error.message ? error.message : String(error)}`);
  }
  for (const dir of [storeDir, path.join(profileDir, '.pnpm-cache')]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (error) { log(`market: cannot create ${dir}: ${error.message}`); }
  }
}

module.exports = { start };
