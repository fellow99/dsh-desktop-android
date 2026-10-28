# 数据模型（overall-data-model.md）

> 本工程"数据"= 启动信封、宿主能力协议、载荷版本三类；会话/存储语义归上游 dsh Host，本工程只落路径与环境。
> 更新：2026-10-27

## 1. `ready.json` 就绪信封（Node → Kotlin，原子写）

```json
{
  "phase": "ready",
  "url":    "http://127.0.0.1:<port>/?token=<一次性令牌>",   // 正式 Host；探针阶段无 token
  "origin": "http://127.0.0.1:<port>",
  "port":   0,
  "pid":    0,
  "payloadSha12": "<sha 前 12 位>",
  "at":     0
}
```

- 位置：`<filesDir>/run/ready.json`；写法：`tmp + rename`（原子）。
- 纪律：Kotlin 读到后**立即删除**；`url` 只留内存；`DSH_READY` 日志行只含 `{origin,port,pid}`，**绝不含 token**（宪法 C9）。
- 退化判据：文件缺失时扫描 `node_bridge.log` 的 `DSH_READY {…}` 行。

## 2. 失败记录（Kotlin 侧，内存 + 错误页）

```
Failure {
  stage:   "orchestration" | "starting" | "waiting" | "probing" | "installing",
  message: string,          // 单行可读原因
  logTail: string[]         // node_bridge.log 尾 200 行 + [crash] last-crash.json 摘要
}
```

## 3. 宿主能力协议（桥 JNI 槽位表，JSON 字符串进出）

```
invoke(name, payloadJson) -> resultJson      // 10 s 硬超时；8 槽；args ≤ 8 KiB、result ≤ 64 KiB
result 成功: {"ok":true,  ...字段}
result 失败: {"ok":false, "error": "...", "hint"?: "..."}
未注册:      {"ok":false, "error":"unregistered"}        // 桥行为
未实现:      {"ok":false, "error":"not-implemented", "hint": "..."}   // 纪律：不假装成功
两段式（P2）: 首响 {"ok":true,"pending":true,"id"} → 轮询 host.result → {"state":"pending|done|expired"}
```

已注册能力（骨架批）的出入参：

| 能力 | 入参 | 出参（成功） |
|---|---|---|
| `echo` | 任意 JSON | `{"ok":true,"echo":<原样>,"handledBy":"kotlin"}` |
| `log.write` | `{level,tag,msg}` | `{"ok":true}`（写 app.log + logcat） |
| `runtime.facts` | `{}` | `{app{versionName,versionCode,applicationId,flavor}, platform{sdkInt,release,abi,model}, paths{filesDir,dshHome,payloadRoot,workspace,userRoot}, storageMode}` |
| `perm.allFiles.status` | `{}` | `{"ok":true,"granted":bool,"sdkInt":int,"storageMode":"full"\|"sandbox-only"}` |
| `shutdown` | `{}` | `{"ok":true,"note":…}`（真停止=进程退出） |

## 4. 载荷版本（`dsh.version`，构建期生成）

```
sha256=<dsh.tar 的 SHA-256>
files=<条目数>
bytes=<tar 字节数>
version=app 0.1.0 / dsh 0.2.1-rc.2 / node 24.22.1
inputsKey=<输入清单哈希（打包幂等键）>
```

- 幂等键 = sha256 前 12 位 → `payload/<sha12>/` 目录名 + `.ready-<sha12>` marker。
- 解包对账：`DigestInputStream` 全流计算，与首行不一致 → 删半包报错。

## 5. 环境变量（Kotlin → Node，启动即冻结）

| 变量 | 含义 |
|---|---|
| `DSH_HOME` | `<filesDir>/dsh-home`（profile/会话/凭据/日志根） |
| `HOME` | `<DSH_HOME>/home`（`os.homedir()` 唯一定义） |
| `DSH_PROFILE_NAME` | `android` |
| `DSH_PLATFORM` | `android` |
| `DSH_FILES_DIR` | 应用 filesDir |
| `DSH_PAYLOAD_DIR` | 解包后载荷根（cwd 同此） |
| `DSH_USER_ROOT` | `/storage/emulated/0`（Kotlin 解析；Node 禁止猜路径） |
| `DSH_STORAGE_MODE` | `full` \| `sandbox-only` |
| `DSH_APP_VERSION` | 0.1.0 |
| `TMPDIR` | `<filesDir>/tmp` |

## 6. 运行期目录状态

| 路径 | 写者 | 读者 | 生命周期 |
|---|---|---|---|
| `payload/<sha12>/` | PayloadInstaller | Node / 桥 | 代际切换时转 `previous` |
| `payload/previous/` | PayloadInstaller | （人工回滚） | 启动成功后保留一份 |
| `run/ready.json` | Node | DshRuntime（读后删） | 每次启动 |
| `dsh-home/logs/app.log` | Kotlin + Node(log.write) | 诊断 | 追加 |
| `node-bridge/node_bridge.log` | 桥（stdio 重建） | 诊断 | 追加 |
| `node-bridge/…last-crash.json` | 桥崩溃 handler | 错误页 | 覆盖 |
| `workspace/` | Node/工具 | Node | 持久 |
| `probe/`（探针期） | DshRuntime[PROBE] | 探针页 | **验收后清理** |
