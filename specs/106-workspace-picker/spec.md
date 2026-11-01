# 106 · 工作区选择（三+一主目录）（spec.md）

> 状态：🟢 In Use（三主目录 + 根围栏 + 授权门已实测；2026-11-01 修复授权门在 API<30 的崩溃）｜ 依据：docs/000-工程规划.md ｜ 源码落点：`packages/workspace-picker-android/`（Node 侧）+ `host/HostCapabilities.kt`（宿主能力）
> 目标：三主目录（沙箱/文档/下载）+ 桌面（存在才显示）+ 根围栏 + 权限门（§5.2 规格）。

## 功能需求

- FR-106-1 主目录来源 = Kotlin env 下发（DSH_USER_ROOT + DSH_EXTRA_WRITABLE_ROOTS），单一事实源
- FR-106-2 dual-face：host 面宿主能力 + client 面 directoryFlow 双槽独占
- FR-106-3 根围栏：首列锁主目录；无手动路径输入；切主目录整栈重置；四域互不可上溯
- FR-106-4 授权门：无共享存储授权时显示「请求权限/刷新」，点 Tab 只查不弹窗。**请求权限须按系统版本分派**：
  - **API 30+**：跳 `MANAGE_APP_ALL_FILES_ACCESS` 设置页（All-files，两段式：pending → 返回前台后 `onAppResumed` 解析）；
  - **API 26–29**：发起 `READ_EXTERNAL_STORAGE` + `WRITE_EXTERNAL_STORAGE` **运行时权限（系统授权弹窗）**，结果经 `MainActivity.onRequestPermissionsResult` 回传完成槽位；
  - 两条路径都必须**结构化上报**（无 All-files 设置页 / 无前台 Activity 等异常不得抛栈），无伪造成功（宪法 C2）。
- FR-106-5 记忆只记主目录 id（localStorage）；采纳复用 createWorkspace

## 修复记录（as-built）

### 2026-11-01 · 授权门「请求权限」在 Android 8.0 报错、不弹系统授权框

| 项 | 内容 |
|---|---|
| 现象 | 选择工作区目录 → 点「文档/下载」显示无权限（正常）；点「请求权限」显示错误：`permission gate unavailable: perm.request: ActivityNotFoundException: No Activity found to handle Intent { act=android.settings.MANAGE_APP_ALL_FILES_ACCESS ... }` |
| 根因 | `HostCapabilities` 的 `perm.request` **无条件**跳 `MANAGE_APP_ALL_FILES_ACCESS` 设置页——该页是 **Android 11（API 30+）** 的 All-files 授权入口；当前真机 **Android 8.0（API 26）** 没有该设置页 → `ActivityNotFoundException`。API 26–29 访问共享存储的正确方式是**经典运行时权限 READ/WRITE_EXTERNAL_STORAGE（系统弹窗）** |
| 修复 | ① `app/src/full/AndroidManifest.xml`：声明 `READ/WRITE_EXTERNAL_STORAGE`（`maxSdkVersion=29`，仅 ≤29 生效；30+ 仍用 All-files）；② `HostCapabilities`：新增 `storageGranted()`（≥30 看 `isExternalStorageManager`，<30 看 READ/WRITE 授权）、`setForegroundActivity()`、`onRequestPermissionsResult()`；`perm.request`/`perm.check`/`perm.allFiles.status` 统一按 `storageGranted()` 判定；`perm.request` 按 SDK 分派（≥30 设置页 + `resolveActivity` 守卫；<30 `requestPermissions` 系统弹窗，结果回槽位）；③ `DshApplication` 记录前台 Activity；④ `MainActivity` 覆写 `onRequestPermissionsResult` 转交宿主 |
| 证据 | 真机 MIX（Android 8.0/API26，minSdk 26）撤销 READ/WRITE 后点击「请求权限」→ **弹出系统授权框**（用户实测通过）；`logs/20261101-1/evidence/51-doc-gate.png`（授权门现场） |
| 预防 | 授权门必须**按系统版本分派**且对无入口场景结构化报错；桌面/API 30+ 行为不变 |

## 验收与测试

- 用例索引：`workspace-picker` 权限门（无授权→请求权限→系统授权→刷新可浏览）；`logs/20261101-1/`
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
