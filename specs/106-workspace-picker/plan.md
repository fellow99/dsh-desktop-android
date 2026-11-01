# 106 · 工作区选择（三+一主目录）（plan.md）

> 状态：🟢 In Use（2026-11-01 授权门 API 分派修复）

## 方案要点

- 后端原语复用上游 -browse；不自实现 FS。
- 依赖 G8 结论（All-files 可用性）。
- **授权门按系统版本分派**（FR-106-4）：
  - API 30+：`Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`（两段式，`onAppResumed` 解析）；
  - API 26–29：`Activity.requestPermissions([READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE])` 系统弹窗，结果经 `MainActivity.onRequestPermissionsResult → HostCapabilities.onRequestPermissionsResult` 完成槽位。

## 落点（as-built）

| 关注点 | 文件 |
|---|---|
| 旧版存储权限声明（≤29） | `app/src/full/AndroidManifest.xml`（`READ/WRITE_EXTERNAL_STORAGE` + `maxSdkVersion=29`；`store` flavor 不声明，保持 SAF-only） |
| 授权判定 | `host/HostCapabilities.kt::storageGranted()`（≥30 `isExternalStorageManager`；<30 运行时权限） |
| 请求分派 + 两段式槽位 | `HostCapabilities::perm.request` / `perm.check` / `perm.allFiles.status`；`PendingSlots.pendingStorageSlotId` |
| 前台 Activity 与结果回传 | `DshApplication.onActivityResumed → setForegroundActivity`；`MainActivity.onRequestPermissionsResult → HostCapabilities.onRequestPermissionsResult` |
| All-files 启动守卫 | `PendingSlots.launchAllFilesSettings()` 返回 Boolean（`resolveActivity` 为空 → 结构化报错，不崩） |
| Node 侧（不变） | `packages/workspace-picker-android`：`permission()/requestPermission()` 经 `perm.check`/`perm.request`（两段式）驱动，授权后 re-probe 可读性 |

## 依赖

- 上游：deepseek-harness dsh-v0.2.1-rc.2（tag 固定）
- 宪法：C1（零补丁）、C2（诚实降级/结构化报错）、C14（结构化进出）
