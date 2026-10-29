# TEST_REPORT（logs/20261029-1/）

> 阶段：Testing / Regression ｜ 日期：2026-10-29 ｜ **2026-10-29 下午回归附录：新构建（Android Studio debug 签名 + 新载荷 sha12=23b9aaff51a4）已部署，回归完成，见文末「新构建设备回归」节**

## 测试矩阵

| 层 | 项 | 结果 | 说明 |
|---|---|---|---|
| 静态 | `node --check`（market/notify/facts） | ✅ 3/3 | 含评审修复后复检 |
| 静态 | `gradlew :app:compileFullReleaseKotlin :app:processFullReleaseManifest` | ✅ BUILD SUCCESSFUL | 评审修复前后各一轮；唯一 warning 为既有 WebShellView 废弃 API（非本次引入） |
| 静态 | bundle patch 合规（三类操作白名单） | ✅ | 本轮只改自有 insert 行的 config（facts.enabled），未触碰上游行 |
| 设备（既有构建） | P1-1 bash 端到端 | ✅ | `echo` exit 0（evidence/10、12） |
| 设备（既有构建） | P1-2 grep/glob | ❌ 缺陷登记 | ripgrep 裸 spawn 证伪；bash 兜底可用（evidence/20） |
| 设备（既有构建） | P1-3 git clone/push | ✅ | smart-HTTP + adb reverse 双向闭环（evidence/30） |
| 设备（既有构建） | P1-5 通知/文档写入 | ✅ | 通知栏弹出 + Documents 写入读回一致（evidence/40、50） |
| 设备（新构建） | P2-3/4/5/6 行为回归 | ⛔ 阻塞 | keystore 被外部删除，无法同签名重装（`adb install -r` 签名不符；卸载重装会丢模型配置） |
| 网关 | P1-4 安装对话框 lookup | ⛔ 依赖上游 | plugin-manager 不消费 desktopPnpm.lookup（契约成员已就位） |

## 回归影响评估

- 既有已装构建行为不受本次代码影响（未重装）→ P1 取证结论稳定。
- 评审修复全部为新增代码路径的收敛（线程化、限界、TTL、原子性），无对既有能力的语义变更；唯一行为变化：`notify.show` 正文修复后通知将带正文（属缺陷修复）。
- 恢复签名后的回归清单（移交）：
  1. 市场 Add-plugin 对话框（仍预期 ENOENT，直至上游反哺；验证错误文案路径）
  2. SAF pickFiles/saveFile：多选/取消/>64MB 文件/选择耗时 >15min
  3. AgentKeepAlive：turn 期间前台服务出现、结束消失；长跑 >6h（API 35+ 模拟器）验证 onTimeout
  4. facts：debug 构建 `GET /_android/facts` 200 + 能力名单正确；release 404
  5. 剪贴板：写文本→粘贴；复制图片→readImage；>6MB 图→image-too-large
  6. notify：回合完成通知应显示正文（body 字段修复验证）

## 结论

测试阶段无新增失败项；两项阻塞（签名恢复、上游反哺）均为环境/上游依赖，已分别登记于能力清单 D.2 P4 与 D.2 P1-G6。

---

## 新构建设备回归（2026-10-29 下午，keystore 阻塞解除：Android Studio debug 签名 + 新载荷）

**环境修复**：模拟器重启（WMI 分离启动）→ 时区 GMT→`Asia/Shanghai`（`cmd alarm set-timezone`，D.3 前置）→ `pm grant` POST_NOTIFICATIONS（重装清授权）。

| 项 | 结果 | 证据 |
|---|---|---|
| App 内 WebView 加载真实 UI | ✅ | 「Into the Unknown」+ workspace + 模型选择器（此前失败页根因=陈旧 ready.json 循环，`bugfix:` 0de220c 已修；本代干净启动无陈旧文件触发） |
| 时区门 | ✅ | 会话创建通过（此前 GMT 会被 `session/invalid-time-zone` 拒绝） |
| **P2-6 facts 端点** | ✅ 200 | `/_android/facts`：`DSH_ANDROID_FACTS="1"`（debug 门禁实证）+ 17 项冻结名单 + 手工 implemented 名单如实呈现 |
| **P2-5 AgentKeepAlive** | ✅ | turn running → FGS 起（`isForeground=true types=0x1 dataSync`）；idle → `keepalive: stopped`（26s/3s 两轮与命令窗口精确吻合）；dispose 收口在代码 |
| **M8 通知正文修复** | ✅ | 通知栏「dsh · 回合完成 / 会话 session- 已空闲」——body 首次实证显示（此前恒空） |
| **notify 静默失败** | ✅ 改进 | 失败双通道可见化（console.error + logger）；本轮即靠它一行定位 POST_NOTIFICATIONS 缺失 |
| bash 回归 | ✅ | `echo DSH-NOTIFY-FINAL` exit 0，3s |
| ready.json pid 校验 | ✅ 随包 | 干净启动无触发场景（触发条件=强杀残留）；代码保护在，待下次强杀场景自然验证 |
| SAF pickFiles/saveFile 功能 | ⏸ | 能力已注册（manifest 合并实证），上游暂无 JS 调用方，端到端待接线 |

**新登记环境前置**：重装/清数据后需重新 `pm grant org.fellow99.dsh.android android.permission.POST_NOTIFICATIONS`（D.3 核对单追加项）。
