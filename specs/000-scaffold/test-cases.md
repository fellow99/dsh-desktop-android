# 000-scaffold · 测试用例（test-cases.md）

> 探针验收流程。证据全部进 `docs/010-P0门禁报告.md`；本文件只定义步骤与判据。
> 前置：真机（arm64-v8a，Android 11+）已连接 `adb`；已安装 `app-full-debug.apk`。

## TC-000-01 安装与冷启

```bash
adb install -r app/build/outputs/apk/full/debug/app-full-debug.apk
adb shell am start -n org.fellow99.dsh.android/.MainActivity
adb logcat -s DSH_ANDROID NODE_BRIDGE -v time
```

判据：无 `AndroidRuntime` FATAL；出现 `[probe] listening http://127.0.0.1:<port>` 与 `DSH_READY {…}`。

## TC-000-02 探针页渲染（G1 + G-WV）

判据：设备屏幕显示 "DSH Android · P0 Probe" 表格页；截图留存。
表格 env 行 = `all present`；页面底部 JSON 链接可点。

## TC-000-03 引擎证据（G12 / G3min）

```bash
adb shell run-as org.fellow99.dsh.android cat files/probe/engine.json
```

判据：JSON 含 dlopen/libnode 成功标志（桥 probeEngine 输出）；`bootstrap.js` 已执行（探针页存在即证）。

## TC-000-04 node:sqlite FTS5（G2）

`/probe.json` → `probes.sqlite`：`available:true, fts5:true, match:true`。
失败后果（按规划）：记录值，G-SQL 兜底路线进 P1 决策。

## TC-000-05 Intl（G4）

`/probe.json` → `probes.intel`…（字段 `probes.intl`）：记录 `typeofIntl`（预期 `undefined`，`--with-intl=none`）、`fullCaseMapping`。
判据：有**明确记录值**即过（门禁要求的是影响面结论，不是必须 undefined）。

## TC-000-06 解包自证（G5）

`/probe.json` → `probes.payload`：`markers` 含 `.ready-<sha12>`、`homeMatches:true`、`workspaceExists:true`。
二次验证：杀进程重启后秒级 READY（marker 命中跳过解包，对比首次 bootMs）。

## TC-000-07 宿主桥 invoke + All-files（G8）

`/probe.json` → `hostBridge.echo.ok:true`；`hostBridge.allFiles`：
- 未授权：`granted:false`（记录，UI 侧后续做授权门）；
- 已授权（设置里授予"所有文件"后重开 App）：`dirs.Documents.writable:true && dirs.Download.writable:true`。

## TC-000-08 /system/bin/sh（G9）

`/probe.json` → `probes.sh`：`status:0 && stdout:"dsh-sh-ok"`。

## TC-000-09 版本三元组与脱敏

- `probes.versions.node` = 24.22.1；`env.appVersion` = 0.1.0。
- `adb logcat -s DSH_ANDROID | grep -i token` 无命中（C9/C10）。

## TC-000-10 报告与清理

1. 以上证据（截图 + JSON 片段 + 命令输出）写入 `docs/010-P0门禁报告.md`。
2. 执行 `000-scaffold/plan.md` §4 探针清理清单。
3. 更新 `SPECS_CHECKLIST.md` 与 `overall-test-cases.md` L1 状态。
