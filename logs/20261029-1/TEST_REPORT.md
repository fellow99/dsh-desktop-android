# TEST_REPORT（logs/20261029-1/）

> 阶段：Testing / Regression ｜ 日期：2026-10-29

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
