# 001-building-workflow · 测试用例（test-cases.md）

> 执行环境分层：L0 = 本机（Windows，工程现成环境）；L2 = GitHub Actions 云端（tag 触发后）。

## TC-001：workflow YAML 合法性
- **优先级**：P1 ｜ **类型**：静态校验 ｜ **层**：L0
- **前置**：`.github/workflows/android-build.yml` 已写入
- **步骤**：
  1. YAML 解析（node `yaml` 模块或 python `yaml.safe_load`）
  2. 结构断言：`on.push.tags == ['v*']`、`permissions.contents == 'write'`、jobs.steps 覆盖 ①–⑮ 要点
- **预期**：解析无错 + 断言全过
- **实际**： ｜ **状态**：

## TC-002：APK 版本注入
- **优先级**：P1 ｜ **类型**：功能 ｜ **层**：L0 本机构建
- **前置**：T1-1 完成；本地引擎/载荷就绪
- **步骤**：
  1. `./gradlew :app:assembleFullDebug -PappVersionName=0.2.1 -PappVersionCode=201`
  2. `aapt dump badging <apk> | grep versionName`
- **预期**：`versionName='0.2.1' versionCode='201'`
- **实际**： ｜ **状态**：

## TC-003：载荷版本行注入
- **优先级**：P2 ｜ **类型**：功能 ｜ **层**：L0
- **前置**：T1-2 完成；`build/payload-stage/root` 存在
- **步骤**：`DSH_APP_VERSION=0.2.1 node scripts/package-payload.mjs --src build/payload-stage/root --force` → 读 `app/src/main/assets/dsh-payload/dsh.version`
- **预期**：`version=app 0.2.1 / dsh 0.2.1-rc.2 / node 24.22.1`
- **实际**： ｜ **状态**：

## TC-004：引擎链路（本机）
- **优先级**：P1 ｜ **类型**：功能 ｜ **层**：L0
- **步骤**：`node scripts/provision-engine.mjs --check`（`DSH_ANDROID_RUNTIME_DIR` 默认本地路径）
- **预期**：两个 .so ✓（sha256/size 与 lock 一致）
- **实际**： ｜ **状态**：

## TC-005：本地彩排（配方等价性）
- **优先级**：P1 ｜ **类型**：集成 ｜ **层**：L0
- **前置**：三仓本地 ref 与 §4 锁定一致
- **步骤**：按 plan §2 的 ③–⑨ ⑪–⑫ 在本机逐段执行（③④ 引擎段可用本地已投放产物等价替代；⑫ 用 aapt）
- **预期**：APK 产出、badging 版本正确、载荷断言全过
- **实际**： ｜ **状态**：

## TC-006：云端端到端（验收主用例）
- **优先级**：P1 ｜ **类型**：集成/发布 ｜ **层**：L2
- **前置**：main 已推送、tag `v0.2.1` 已打
- **步骤**：
  1. Actions run（tag 触发）成功变绿
  2. Release `v0.2.1` 存在且附件含 `dsh-0.2.1-debug.apk`
  3. run summary 含四类指纹（上游 ref / 引擎归档 sha / 载荷 sha / APK sha）
- **预期**：三步全过
- **实际**： ｜ **状态**：

## TC-007：云端 APK 内容抽检
- **优先级**：P2 ｜ **类型**：发布物完整性 ｜ **层**：L2（下载后本机）
- **步骤**：下载 Release APK → `unzip -l` 断言含 `lib/arm64-v8a/libnode.so`、`lib/arm64-v8a/libnode_bridge.so`、`assets/dsh-payload/dsh.tar` + `dsh.version`
- **预期**：四项齐全
- **实际**： ｜ **状态**：

## 覆盖说明

- 不含真机侧载安装用例（属用户手工验收，登记于 spec §6）。
- `workflow_dispatch` 路径（无 tag 回落默认版本）以 TC-001 结构断言覆盖，不在云端实跑。
