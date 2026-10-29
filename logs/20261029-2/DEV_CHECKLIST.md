# DEV_CHECKLIST · 001-building-workflow（20261029-2）

> 分支 `main`（不改动）；连续执行模式。对应 specs/001-building-workflow/tasks.md。

## T1 版本注入

 - [x] T1-1 `app/build.gradle.kts`：versionName/versionCode 支持 `-PappVersionName/-PappVersionCode`，缺省回落 0.1.0/1
 - [x] T1-2 `scripts/package-payload.mjs`：`version=` app 段读 `DSH_APP_VERSION`，缺省 0.1.0
 - [x] T1-3 本地验证（TC-002/TC-003）→ 均 PASS

## T2–T4 workflow

 - [x] `.github/workflows/android-build.yml` 全量落地（引擎→载荷→APK→Release，21 steps）
 - [x] TC-001 YAML 校验 → PASS

## T5 验证

 - [x] TC-004 引擎链路 --check → PASS
 - [x] TC-005 本地彩排（含 TC-002/TC-003）→ PASS（APK 145MB；badging versionName='0.2.1'/versionCode='201'）
 - [x] Code Review（requesting → receiving）→ 5C/4I/5M 全闭环（见 REVIEW_REPORT.md）
- [ ] 提交（git-commit 前缀）/推送/打 tag
 - [x] 提交（git-commit 前缀）/推送/打 tag → main 已推送（23a4c14…be776c7），tag v0.2.1 → Run #6 全绿
## 证据

 - TC-002：BUILD SUCCESSFUL in 1m 55s（37 tasks）；`package: name='org.fellow99.dsh.android' versionCode='201' versionName='0.2.1'`
 - TC-003：dsh.tar 241921536 B / 15656 files / sha256=23b9aaff51a4…；`version=app 0.2.1 / dsh 0.2.1-rc.2 / node 24.22.1`
 - TC-004：libnode.so ✓（81491624 B / be1d164…）、libc++_shared.so ✓（1253544 B / cd61762…）
 - TC-007（本地等价）：APK 内 libnode.so / libnode_bridge.so / dsh.tar / dsh.version 四项齐全
 - 规格：specs/001-building-workflow/{spec,plan,tasks,test-cases}.md
