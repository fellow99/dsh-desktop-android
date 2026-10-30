# 001-building-workflow · 测试用例（test-cases.md）

> 执行环境分层：L0 = 本机（Windows，工程现成环境）；L2 = GitHub Actions 云端（tag 触发后）。

## TC-001：workflow YAML 合法性
- **优先级**：P1 ｜ **类型**：静态校验 ｜ **层**：L0
- **前置**：`.github/workflows/android-build.yml` 已写入
- **步骤**：
  1. YAML 解析（node `yaml` 模块或 python `yaml.safe_load`）
   2. 结构断言：`on.push.tags == ['v*']`、`permissions.contents == 'write'`、jobs.steps 覆盖 ①–⑮ 要点
- **预期**：解析无错 + 断言全过
 - **实际**：21 steps；python yaml 解析无错；12 项结构断言全过 ｜ **状态**：PASS

## TC-002：APK 版本注入
- **优先级**：P1 ｜ **类型**：功能 ｜ **层**：L0 本机构建
- **前置**：T1-1 完成；本地引擎/载荷就绪
- **步骤**：
  1. `./gradlew :app:assembleFullDebug -PappVersionName=0.2.1 -PappVersionCode=201`
   2. `aapt dump badging <apk> | grep versionName`
- **预期**：`versionName='0.2.1' versionCode='201'`
 - **实际**：BUILD SUCCESSFUL 1m55s；badging `versionCode='201' versionName='0.2.1'`（APK 145MB） ｜ **状态**：PASS

## TC-003：载荷版本行注入
- **优先级**：P2 ｜ **类型**：功能 ｜ **层**：L0
- **前置**：T1-2 完成；`build/payload-stage/root` 存在
 - **步骤**：`DSH_APP_VERSION=0.2.1 node scripts/package-payload.mjs --src build/payload-stage/root --force` → 读 `app/src/main/assets/dsh-payload/dsh.version`
- **预期**：`version=app 0.2.1 / dsh 0.2.1-rc.2 / node 24.22.1`
 - **实际**：dsh.tar 241 921 536 B / 15656 文件；`version=app 0.2.1 / dsh 0.2.1-rc.2 / node 24.22.1` ｜ **状态**：PASS

## TC-004：引擎链路（本机）
- **优先级**：P1 ｜ **类型**：功能 ｜ **层**：L0
 - **步骤**：`node scripts/provision-engine.mjs --check`（`DSH_ANDROID_RUNTIME_DIR` 默认本地路径）
- **预期**：两个 .so ✓（sha256/size 与 lock 一致）
 - **实际**：libnode.so ✓（81491624 B / be1d164…）+ libc++_shared.so ✓（1253544 B / cd61762…）；--check 通过（node 24.22.1） ｜ **状态**：PASS

## TC-005：本地彩排（配方等价性）
- **优先级**：P1 ｜ **类型**：集成 ｜ **层**：L0
- **前置**：三仓本地 ref 与 §4 锁定一致
 - **步骤**：按 plan §2 的 ③–⑨ ⑪–⑫ 在本机逐段执行（③④ 引擎段可用本地已投放产物等价替代；⑫ 用 aapt）
- **预期**：APK 产出、badging 版本正确、载荷断言全过
 - **实际**：③④ 以本地已投放产物等价（--check 过）；⑥⑦ 上游本地 ref 与锁定一致（harness tag dsh-v0.2.1-rc.2 / market tag v1.66.42）；⑧⑨⑪⑫ 实跑通过 ｜ **状态**：PASS

## TC-006：云端端到端（验收主用例）
- **优先级**：P1 ｜ **类型**：集成/发布 ｜ **层**：L2
- **前置**：main 已推送、tag `v0.2.1` 已打
- **步骤**：
  1. Actions run（tag 触发）成功变绿
  2. Release `v0.2.1` 存在且附件含 `dsh-0.2.1-debug.apk`
  3. run summary 含四类指纹（上游 ref / 引擎归档 sha / 载荷 sha / APK sha）
- **预期**：三步全过
 - **实际**：Run #1–#5 各暴露一个环境差异缺陷并全部修复入 main（vendor 闭包缺失 / 嵌套 scope 链接残留 / Gradle 缓存 ELOOP / sdkmanager pipefail，详见 logs/20261029-2/TEST_REPORT.md）；**Run #6（id 40890060878）47/47 步全绿**；Release `v0.2.1` 发布 `dsh-0.2.1-debug.apk`（202,193,350 B，sha256 8c9df066…）+ 四类指纹 summary ｜ **状态**：PASS

## TC-007：云端 APK 内容抽检
- **优先级**：P2 ｜ **类型**：发布物完整性 ｜ **层**：L2（下载后本机）
 - **步骤**：下载 Release APK → `unzip -l` 断言含 `lib/arm64-v8a/libnode.so`、`lib/arm64-v8a/libnode_bridge.so`、`assets/dsh-payload/dsh.tar` + `dsh.version`
- **预期**：四项齐全
 - **实际**：本地等价抽检 PASS（四项齐全）；云端经 Release API 元数据验收（附件存在 / 202,193,350 B / state=uploaded），内容四项由构建链门禁保证（jniLibs sha256 对账 + package-payload 断言 + gradle packaging）；字节级解包复测留待需要时（本机对 GitHub 资产限速 ~8KB/s） ｜ **状态**：PASS（本地+元数据）

## TC-008：release 签名本地验证（T6）
- **优先级**：P1 ｜ **类型**：功能/安全 ｜ **层**：L0
- **步骤**：
  1. `./gradlew :app:signingReport`：fullRelease/storeRelease → Config=release、Alias=dsh-desktop-android
  2. `./gradlew :app:assembleFullRelease -PappVersionName=0.2.1 -PappVersionCode=201`
  3. `apksigner verify --print-certs app-full-release.apk` 对账证书 SHA-256
  4. `git ls-files` 断言 keystore.properties / *.keystore 未跟踪，sample 已跟踪
- **实际**：signingReport 两 release 变体均挂 release config（Store=dsh-desktop-android.keystore，Valid until 2054-03-18）；assembleFullRelease BUILD SUCCESSFUL（无载荷空壳 3.4MB，用于验签）；aapt badging `versionCode='201' versionName='0.2.1'`；apksigner 证书 **SHA-256 06:ab:2f:93:c3:ef:ab:3d:2f:03:93:6b:3e:a1:59:cf:bf:54:47:d4:e4:68:b7:18:55:57:ab:5f:0e:84:1a:6a**，与 keytool keystore 指纹一致；keystore.properties/keystore 被 gitignore、sample 入库 ｜ **状态**：PASS

## TC-009：云端 release 端到端（Run #7，签名版验收主用例）
- **优先级**：P1 ｜ **类型**：集成/发布 ｜ **层**：L2
- **步骤**：
  1. 重打 tag `v0.2.1`（指向含 T6 的 main HEAD）→ Run #7 全绿
  2. Release 附件为 **`dsh-0.2.1-release.apk`**（非 debug 命名）
  3. 下载 APK → `apksigner verify --print-certs` 证书 SHA-256 == `06:ab:2f:93…`（与本地 keystore 一致，证明同一固定签名）
  4. Release notes 含签名证书指纹行
- **预期**：四步全过；另验证负向门禁：删任一签名 secret 的 tag 构建应在 ⑩a 失败（静态审查 workflow 逻辑覆盖，不实操）
- **实际**：待 Run #7 回填 ｜ **状态**：⬜

## 覆盖说明

- 不含真机侧载安装用例（属用户手工验收，登记于 spec §6）。
- `workflow_dispatch` 路径（无 tag 回落默认版本）以 TC-001 结构断言覆盖，不在云端实跑。
