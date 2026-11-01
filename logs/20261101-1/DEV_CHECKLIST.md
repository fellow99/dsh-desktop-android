# DEV_CHECKLIST · 111-pty-integration

> 日期：2026-11-01 ｜ 模块：specs/111-pty-integration ｜ 分支：main（不改动）

## 任务进度（tasks.md）

- [x] T111-01 app/build.gradle.kts 加 runtime/pty AAR，node-bridge 保留
- [x] T111-02 移除手工 provision-engine 链（build.gradle 注释；CI 待跟）
- [x] T111-03 版本可达性核验（见下）
- [x] T111-04 DshRuntime.kt：System.loadLibrary("pty_node") + DSH_ANDROID_NATIVE_LIB_DIR env
- [x] T111-05 payload/shims/s6-node-pty.js（symlink → nativeLibraryDir）
- [x] T111-06 bootstrap.js 登记 S6；facts pty 字段
- [x] T111-07 packages/subprocess-android/lib/terminal.js（AndroidTerminalHandle）
- [x] T111-08 index.js spawnTerminal 落地
- [ ] T111-09 单元自检（依赖 node-pty 实装，设备端）
- [x] T111-10 cordis.patch.yml 解禁两行
- [ ] T111-11 载荷 node-pty JS 物化核验（需 assemble-payload + 引擎）
- [ ] T111-12 APK 构建 5 .so 核验（需 SDK/网络）
- [ ] T111-13 引擎升级回归（需设备/模拟器）
- [ ] T111-14 文档回填
- [ ] T111-15/16 测试取证（需设备/模拟器）

## 冒烟（node 层）

- [ ] subprocess-android 既有 smoke 通过（见下输出）

## 已知待验证（诚实登记）

- node-pty 原生加载策略（S6 symlink + Kotlin preload → Node dlopen 复用）为**实现假设**，
  需设备/模拟器上 TC-111-C1/C2 实证；若不通切 Option B（process.dlopen 路径覆写）。
