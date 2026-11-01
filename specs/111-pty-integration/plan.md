# 111 · PTY 完整终端能力（plan.md）

> 状态：⬜ Planned

## 方案要点（对齐 docs/111-PTY实现方案.md 决策）

- **D1 依赖接线**（`app/build.gradle.kts`）：`implementation node-bridge:0.2.0`（不变）；
  `runtimeOnly node-runtime:26.13.0` + `runtimeOnly node-pty:26.13.0`。移除 `scripts/provision-engine.mjs`
  手工投放 v24.22.1 的链路（删除其 gradle 依赖/调用及 `src/main/jniLibs` 手工 libnode.so），改为 AAR 投放。
- **D2 原生加载**：Kotlin `DshRuntime` 在 `runtime.start` 前 `System.loadLibrary("pty_node")`（nativeLibraryDir
  唯一可执行位，规避 Android 10+ W^X）+ env 下发 `DSH_ANDROID_NATIVE_LIB_DIR`；Node 侧 **S6 垫片**
  `payload/shims/s6-node-pty.js` 拦截 node-pty 原生解析指向 `libpty_node.so`（复用已加载 inode）。
- **D3 spawnTerminal**：新增 `packages/subprocess-android/lib/terminal.js`（`AndroidTerminalHandle`，包
  node-pty IPty，实现完整契约；`inspectActivity` 保守返回 `unknown`）；`lib/index.js` 由抛错改为构造返回。
- **D4 解禁**：`packages/bundle-android/cordis.patch.yml` 移除 `terminal-controller`/`ui-sidebar-terminal`
  的 `disabled:true`。
- **D5 载荷**：核验 node-pty JS（subprocess-local 依赖，pnpm deploy 应已物化）；必要时在
  `assemble-payload.mjs` 补 vendor；S6 垫片随 `bootstrap.js` 登记。
- **D6 测试**：real device API26<minSdk29 不可装 ⇒ 用模拟器 AVD `Pixel_10`（API37，x86_64 + ARM 转译）；
  引擎升级全量回归（D.3/D.4 门禁）＋ PTY 端到端。

## 依赖

- 上游：deepseek-harness `dsh-v0.2.1-rc.2`；`node-pty`（subprocess-local 依赖）JS 入载荷
- 宪法：C1（零补丁，全走 bundle/垫片/插件）、C2（加载失败结构化上报，不伪造假终端）、C3（证据优先）、
  C5（载荷单一事实链）、C7（主线程不 dlopen）
- 发布 runbook：`../../../node-bridge-workspace/docs/发布到maven-central.md`（配对纪律/加载契约）

## 风险与对策

- 引擎 24→26 升级回归 → Plan B 备选（24.22.1 双件）；门禁先行、全量复侧
- W^X：载荷 noexec 不可 dlopen `.node` → 走 nativeLibraryDir + Kotlin 预载（S6 A/B 双方案）
- node-pty `loadNativeModule` 固定 relpath → S6 垫片覆写；P1 判据锁死
- 转译环境（x86_64+ARM 转译）PTY 稳定性 → 尽量真机/转译结果仅作部分证据
