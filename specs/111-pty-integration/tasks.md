# 111 · PTY 完整终端能力（tasks.md）

> 状态：⬜ Planned ｜ 编号规则：T111-01…（顺序分配，不复用）

## Phase 1 · 依赖接线（D1）

- [x] T111-01 `app/build.gradle.kts`：新增 `runtimeOnly("io.github.fellow99:node-runtime:26.13.0")` + `runtimeOnly("io.github.fellow99:node-pty:26.13.0")`；确认 `implementation node-bridge:0.2.0` 保留
- [x] T111-02 移除手工引擎投放链：`scripts/provision-engine.mjs` 不再被 gradle/文档调用；清 `src/main/jniLibs` 中的手工 libnode.so/libc++；`docs`/`README` 相关说明同步；确认三 `runtime.lock.json` 归属移交 AAR
- [x] T111-03 版本可达性核验（发布 runbook §4.2 镜像）：curl 两个坐标返回 200（node-runtime/node-pty 26.13.0）

## Phase 2 · 原生加载（D2）

- [x] T111-04 [P] `app/src/main/kotlin/.../runtime/DshRuntime.kt`：`runtime.start(opts)` 前 `System.loadLibrary("pty_node")`（失败结构化上报，不伪装）；`NodeRuntimeOptions.env` 注入 `DSH_ANDROID_NATIVE_LIB_DIR`（`applicationInfo.nativeLibraryDir`）
- [x] T111-05 新增 `payload/shims/s6-node-pty.js`：垫片覆写 node-pty 原生解析（首选 A symlink→nativeLibraryDir / 备选 B `_extensions['.node']` 路径覆写）；保持 S 系列"唯一锚点+登记+幂等"纪律
- [x] T111-06 `payload/bootstrap.js`：登记 S6 垫片（`shim DSH_ANDROID_SHIM node-pty: installed`）；`/_android/facts` 增加 `pty.loaded/pty.paired/pty.shell` 暴露（debug-only）

## Phase 3 · spawnTerminal 实现（D3）

- [x] T111-07 [P] 新增 `packages/subprocess-android/lib/terminal.js`：`AndroidTerminalHandle` 实现 `SubprocessTerminalHandle`（pid/output/done/write/resize/inspectForeground/inspectActivity/signalForeground/terminate）；`inspectActivity` 保守 `unknown`；onData→PassThrough（背压），onExit→end+outcome
- [x] T111-08 `packages/subprocess-android/lib/index.js`：`spawnTerminal()` 由抛错改为 require node-pty 并构造 `AndroidTerminalHandle`；`terminalEnvironment()`/`resolveExecutable()` 复核（`/system/bin/sh -i` 已放行）；加载失败结构化上报（C2）
- [x] T111-09 单元自检：`packages/subprocess-android/test/` 补 spawnTerminal 契约冒烟（mock/真实 node-pty 懒加载路径）

## Phase 4 · 解禁与载荷（D4/D5）

- [x] T111-10 `packages/bundle-android/cordis.patch.yml`：移除 `terminal-controller`/`ui-sidebar-terminal` 的 `disabled:true`；确认三依赖（subprocess/sandboxPolicy/workingDirectory）齐备
- [x] T111-11 载荷核验：`node scripts/assemble-payload.mjs --deploy --apply` 后确认 `node_modules/node-pty/lib/` 物化；若无则补 vendor 规则；S6 垫片入包
- [x] T111-12 构建：`./gradlew assembleFullDebug` 通过；APK 内 `nativeLibraryDir` 出现 `libnode.so`/`libc++_shared.so`/`libpty_node.so`/`libnode_bridge.so`/`libnode_host_client.so` 五个 .so

## Phase 5 · 引擎升级回归 + 文档回填（FR-111-6）

- [x] T111-13 引擎升级全量回归：D.3/D.4 门禁（G1/G3/G4/G12/会话持久化/通知/git/搜索/子agent 等）在 26 线复侧
- [x] T111-14 文档回填：`docs/安卓环境能力清单-v0.2.1.md`（#12/#36 回填、D.2/T-003 状态改已完成、终端探针注释更正）；`specs/README.md` 加 111 行；`docs/000-工程规划.md` 状态

## Phase 6 · 测试（D6，见 test-cases.md）

- [x] T111-15 测试计划与取证（`logs/<date>-<N>/`）：PTY 端到端（TC-111-*）+ 基本功能（API KEY/deepseek-flash/工作区/对话/看图）+ 引擎回归；证据落 C3 纪律
- [x] T111-16 测试报告 `TEST_REPORT.md`；缺陷修复 + 回归；尽量真实设备/模拟器取证，**不伪造**（宪法 C2/C3）
