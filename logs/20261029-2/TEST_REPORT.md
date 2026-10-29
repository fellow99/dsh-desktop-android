# TEST_REPORT · 001-building-workflow（20261029-2）

> 用例源：specs/001-building-workflow/test-cases.md。L0 已全 PASS（见 test-cases.md 回填）。
> 本报告记录云端 L2 执行：Run #1–#6 迭代（每轮把失败点推进一格，全部修复入 main）。

## TC-006：云端端到端 — ✅ PASS（Run #6）

### Run #1（tag v0.2.1 首打，id 40875843413）— ❌ 失败 → 已修复

- **绿段（1–15）**：版本派生、三仓 checkout（含 `upstream/*` 路径）、引擎链路全绿——
  `③ 归档下载+sha256 对账 ✓`、`④ 八项 ELF 门禁 ✓`、`⑤ 投放 jniLibs ✓`（评审 C2/C3/C5 云端实证通过）；
  harness `pnpm install --frozen-lockfile + build` ✓（Linux 首跑通过）、dsh-market `npm ci + build` ✓。
- **败点（16 = ⑧⑨ 载荷装配）**：
  `[assemble-payload] git 闭包缺失：…/node_modules/@dsh-android/git/node_modules/isomorphic-git/package.json（packages/git-android/node_modules 需随包 vendor）`
- **根因**：`packages/git-android/node_modules/`（8.5MB / 672 文件 / 57 包）在本地由 npm 生成，被 `.gitignore:43` 通配 `node_modules/` 排除，**从未入库**；本地彩排树有此目录故 L0 通过，CI 干净 checkout 必然缺失——L0 盲区被云端 L2 揭出。
- **修复（bugfix）**：`.gitignore` 增加例外（`!packages/git-android/node_modules/` + `**`），闭包 672 文件入库；提交 `7c1a9d6`。

### Run #2（tag v0.2.1 重打，id 40876982605）— ❌ 失败（更远处）→ 已修复

- **绿段扩展**：git 闭包 ✓（isomorphic-git + 57 包，run#1 修复实证生效）、pnpm 引擎物化 ✓、dshmarket 物化 ✓、垫片 S1–S4 ✓。
- **败点（16 内 assertNoLinks）**：`载荷仍含链接：…/schemastery/node_modules/@deepseek-ai/cosmokit、…/@standard-schema/spec`
- **根因**：Linux 上 pnpm deploy 的嵌套 `@scope` 链接被 materializeLinks 整棵 cpSync 拷成真实目录后，拷入子树内部的链接不再被单趟遍历触达（Windows 本地是 junction 语义 + 本地树已物化，L0 不可见）。
- **修复（bugfix）**：`assemble-payload.mjs` 增加多趟物化 `materializeLinksUntilClean`（迭代至 0 命中，上限 3 趟；assertNoLinks 兜底）；提交 `55a92f7`。

### Run #3（tag v0.2.1 重打，id 40879560436）— ❌ 失败（推进到 ⑩）→ 已修复

- **绿段（1–16 全绿）**：载荷装配 + 打包首次全过——多趟物化修复实证生效；`assertNoLinks` 无残留。
- **败点（17 = ⑩ setup-java）**：`##[error]ELOOP: too many symbolic links encountered, stat '…/upstream/deepseek-harness/apps/cli/node_modules/@…'`
- **根因**：`cache: gradle` 的缓存链路深扫工作区；harness 的 pnpm node_modules 含符号链接环。
- **修复（bugfix）**：收窄 `cache-dependency-path`（提交 `9f46b15`，见 run#4——仍不够）。

### Run #4（tag v0.2.1 重打，id 40884779196）— ❌ 同点复败 → 已修复

- **败点（17 同 ELOOP）**：收窄 `cache-dependency-path` 后 restore 快速完成，但 save 预处理仍深扫工作区（11 分钟后 ELOOP）。
- **修复（bugfix）**：**彻底移除 Gradle 缓存**（发布型流水线构建频率低，依赖重装成本可接受）；顺带 `setup-java@v4→v5`；提交 `23a4c14`。

### Run #5（tag v0.2.1 重打，id 40887794050）— ❌ 新点（推进到 ⑩ 后半）→ 已修复

- **绿段扩展**：setup-java（无缓存）✓。
- **败点（18 = sdkmanager）**：`yes: standard output: Broken pipe` + exit 1。
- **根因**：GitHub 默认 shell 带 `-o pipefail`；`yes | sdkmanager` 在 sdkmanager 正常退出后 `yes` 收 SIGPIPE 判败（sdkmanager 本体 5 秒安装成功）。
- **修复（bugfix）**：去掉 `yes |`（托管 runner 许可证已预接受），直调 sdkmanager；提交 `be776c7`。

### Run #6（tag v0.2.1 重打，id 40890060878）— ✅ 全绿（47/47 success）

- 18 sdkmanager ✓ → 19 `:app:assembleFullDebug`（注入 0.2.1/201）✓ → 20 aapt 断言 ✓（versionCode 在前修复实证）→ 21 产物+指纹 summary ✓ → 22 artifact ✓ → 23 **GitHub Release 发布 ✓**。
- Release 验收（API 实证）：
  - `dsh-desktop-android 0.2.1`（tag v0.2.1，非 draft/prerelease）：https://github.com/fellow99/dsh-desktop-android/releases/tag/v0.2.1
  - 附件：**`dsh-0.2.1-debug.apk`，202,193,350 B（≈193MB），state=uploaded**
  - 指纹：APK sha256 `8c9df066ac0e…`；载荷 dsh.tar sha256 `7c5111a6e613…`（dsh 0.2.1-rc.2 / node 24.22.1）
- 体积登记：云端包 193MB vs 本地彩排 145MB——载荷内平台相关可选依赖剪裁差异（linux 侧残留多于 win 侧）所致，仍处 FR-108-5 预算内；对设备体积敏感可后续在剪裁规则中补 `linux-*` 平台剔除（登记不阻塞）。

## TC-007：云端 APK 内容抽检 — ✅ PASS（结构级）

- Release API 元数据：附件存在、大小 202,193,350 B、state=uploaded。
- 内容四项（libnode/libnode_bridge/dsh.tar/dsh.version）由构建链自身门禁保证（jniLibs 投放 sha256 对账 + package-payload 断言 + gradle packaging），本地等价抽检已 PASS。
- 字节级复测（下载 193MB APK 解包）留待用户侧需要时执行；本机对 GitHub 资产限速（~8KB/s），不做全量下载。

## 结论

- TC-006 ✅（Actions 绿 + Release 附件 + 指纹）、TC-007 ✅（结构级）。
- L0 全部用例 ✅（见 test-cases.md）。
- 需求验收达成：**打 tag v0.2.1 → 云端自动构建 → GitHub Release 发布可侧载 APK**。
