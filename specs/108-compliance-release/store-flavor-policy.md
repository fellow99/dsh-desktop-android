# store flavor 政策清单（specs/108 · T-007）

> 日期：2026-10-29 ｜ 结论：`assembleStoreDebug` **编译通过**（与 full 同源 main 源码，flavor 仅差 config）
> 构建产物：`app/build/outputs/apk/store/debug/app-store-debug.apk`

## flavor 差异矩阵（full vs store）

| 政策项 | full（侧载线） | store（商店线） | 依据 |
|---|---|---|---|
| `DSH_STORAGE_MODE` | `full` | `sandbox-only` | app/build.gradle.kts flavors |
| `MANAGE_EXTERNAL_STORAGE` | 声明（full/AndroidManifest） | **不声明** | app/src/full/AndroidManifest.xml 仅 full 合入 |
| 文档/下载目录访问 | All-files 授权门 + 直接读写 | SAF-only（fs.pickFiles/fs.saveFile 两段式） | 能力清单 #17/#29 |
| `perm.allFiles.status` | 按实际授权返回 | 恒 `granted:false`（storageMode != "full"） | HostCapabilities.kt |
| `/_android/facts` | debug 构建开启 | debug 构建开启（诊断口径与 full 一致；release 两线恒关） | DSH_ANDROID_FACTS（FR-105-013） |
| AgentKeepAlive/通知/桥/搜索/git/市场 | 同 | 同（无 flavor 差异） | main 源码共用 |
| 运行时权限 | POST_NOTIFICATIONS + All-files | POST_NOTIFICATIONS（无 All-files） | manifest 合并 |

## 商店合规要点（提交市场前核对）

1. `targetSdk 36`：前台服务 dataSync 类型已声明 + `FOREGROUND_SERVICE_DATA_SYNC` 权限在（Android 14+ 要求）✅
2. 无 All-files 权限 → 商店审核面最小化 ✅
3. `/_android/facts` release 恒关（FR-105-013）✅
4. 密钥/凭据零落盘：载荷与配置不嵌入 API key ✅
5. 通知使用场景：回合完成/审批提醒（用户可关）——市场元数据需声明
6. 升级路径：`adb install -r` 已在 debug 线演练（数据保留）；商店升级沿用同签名链

## 遗留

- 正式发布签名物料恢复（T-008）：store **release** 产物与升级演练待签名恢复后执行
- SAF-only 线的 Documents/Download 工作区会话（workspace-root 在共享存储）——当前工作区根固定应用私有目录（`DSH_ANDROID_WORKSPACE`），store 线 SAF 选文件只服务上传/导出，不改工作区根；此语义需在 108 验收时向产品确认
