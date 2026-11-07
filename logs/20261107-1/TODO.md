# aosp-node-cli v26.13.0 重新构建 → 更新 dsh-desktop-android（TODO）

> workflow 42237842816 已 success（build-android-arm64-v8a 3h15m，2026-11-06T18:09 更新 release）。
> 目标：重新下载 v26.13.0 包 → 校验 → 更新 cli.lock.json/provision → 投放/重建/装真机 → 验证。

- [x] N1 下载新 node-cli-v26.13.0-android-arm64-v8a.tar.gz + .sha256；sha256 核对
- [x] N2 解包查看新布局（.so 集/数据树/manifest/元数据/AAR 是否变化；对照 provision-cli.mjs 期望）
- [x] N3 更新 `scripts/cli.lock.json` node 条目（sha256/size；若 jni/assets/licenses 变化一并更新）
- [x] N4 若布局变化：更新 `scripts/provision-cli.mjs` node 阶段（strip/文件清单/投放目标）
- [x] N5 重跑 provision 投放：12 个 .so→jniLibs + cli-assets；核对与旧产出的 diff
- [x] N6 assemble-payload（rc.5）→ package → gradle assembleFullDebug 完成；⚠ 真机安装被 MIUI 拦截（INSTALL_FAILED_USER_RESTRICTED，需设备放行）
- [ ] N7 真机验证：cli-env 探针 node/npm/npx/corepack + bash 工具 node -v；L2 或至少 host 注册
- [ ] N8 回填记录（cli 数据事实源/版本）；提交（子模块 + 父工程指针）；无 KEY/口令入盘

> 纪律：不改 git 分支（main）；提交用 Conventional Commits；敏感信息不落盘。
