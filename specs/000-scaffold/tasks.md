# 000-scaffold · 任务清单（tasks.md）

> 状态：✅ 完成 ｜ 🟡 进行中/部分 ｜ ⬜ 未开始

## A. 脚手架

- [x] A1 settings/build/gradle.properties/libs.versions.toml/wrapper（8.12）
- [x] A2 app 模块：applicationId/minSdk29/targetSdk36/compileSdk36/arm64/flavor full|store/buildTools 36.0.0
- [x] A3 Manifest（singleTask/权限/networkSecurityConfig）+ full flavor manifest（MANAGE_EXTERNAL_STORAGE）
- [x] A4 资源（主题/颜色/字符串/占位图标）

## B. Kotlin 外壳

- [x] B1 `Constants.kt`（§6.2 参数 + §8.1 目录名，单一事实源）
- [x] B2 `AppLog.kt`（app.log JSON 行 + logcat）
- [x] B3 `DshApplication.kt`（日志初始化 + uncaught 兜底）
- [x] B4 `PayloadInstaller.kt`（TarReader：marker/tmp+rename/sha 对账/zip-slip 防护/prefix 支持）
- [x] B5 `Probe.kt`（HEAD 200/303/401 重试）
- [x] B6 `DshRuntime.kt`（状态机 + ready 轮询 + 退化 DSH_READY + FAILED 终态 + 重建复用 URL）
- [x] B7 `HostCapabilities.kt`（首批 5 + 探针 1；guard 永不抛）
- [x] B8 `WebShellView.kt`（§6.3 矩阵/围栏/渲染自愈/版本门禁/错误页复制与重启）
- [x] B9 `MainActivity.kt`（装配 + 生命周期 + 返回键 + F5 刷新）

## C. 载荷与脚本

- [x] C1 `scripts/provision-engine.mjs`（sha256+size 对账 lock）
- [x] C2 `scripts/package-payload.mjs`（确定性裸 ustar + dsh.version + 幂等 + 断言）
- [x] C3 `payload/bootstrap.js`（**探针**：env/versions/Intl/sqlite/zstd/sh/payload/hostBridge/HTTP/ready）

## D. 构建验证（L0）

- [x] D1 `assembleFullDebug` 成功（76.3 MB debug）
- [x] D2 APK 内 4 个 .so + 资产契约（`unzip -l`）
- [x] D3 `zipalign -c -P 16 4` 通过
- [x] D4 `tar -tvf` 归档合法；打包幂等
- [x] D5 `.gitignore`（jniLibs/assets 产物/node_modules）

## E. 规范文档

- [x] E1 specs 根 10 文件
- [x] E2 `000-scaffold/` 四件套
- [x] E3 15 模块骨架（状态如实）

## F. 真机探针（阻塞：等待设备接入）

- [ ] F1 安装 + 启动 + 探针页截图（G1/G12/G3min）
- [ ] F2 `/probe.json` + `engine.json` 取证（G2/G4/G5/G8/G9/G-WV）
- [x] F3 门禁报告定稿（现并入 `docs/安卓环境能力清单-v0.2.1.md` §D.4）
- [ ] F4 探针清理（FR-000-9）+ checklist 更新

## G. 后续阶段入口（非本需求）

- [ ] G1 正式载荷装配管线（build-upstream/assemble/verify）→ P1
- [ ] G2 `android` profile 播种 + host.js/垫片 → P1
