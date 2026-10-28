# 整体技术方案（overall-plan.md）

> 回答"怎么把 `docs/000-工程规划.md` 变成可交付的工程"。阶段划分与门禁引用规划 §10/§11。
> 更新：2026-10-27

## 一、模块策略

| 模块 | 策略 | 依赖 |
|---|---|---|
| 101 启动编排 | Kotlin 单例状态机 + ready 信封 + 探活；失败即终态 | 桥 0.2.0 |
| 102 载荷管线 | 本工程自研确定性 ustar（**裸 tar 契约**，规避 AAPT2 .gz 改名）+ Kotlin 解包；上游装配脚本复用 ark 同构设计 | deepseek-harness tag |
| 103 WebView 外壳 | View 体系覆盖层；§6.3 矩阵逐项落代码；围栏/自愈/版本门 | 系统 WebView |
| 104 能力桥 | 冻结命名 16 项；两段式异步（pending + host.result 轮询）；handler 永不抛 | 桥 JNI 槽位表 |
| 105 上游适配 | `android` profile 播种 + `@dsh-android/bundle` YAML 覆盖层（只允许 disabled/换名/insert） | 上游 bundle 键名实测 |
| 106–109 | 按规划 §5.2/§6.4/§6.6/§6.7 实施，先探针后定版 | 101/104 |
| 012/201/204/206 | 从 ark 复制改名 `@dsh-android/*`，去 jitless/undici 相关（JIT 可用） | 105 |

## 二、引擎与依赖决策（含偏差登记）

1. **引擎 24.22.1**：Maven Central 的 `node-runtime` 尚无此版本 → 以 `aosp-node-runtime` 仓库为来源，`tools/provision.mjs`（八项 ELF 门禁）投放 + `scripts/provision-engine.mjs`（sha256 对账）复制进 jniLibs。**恢复条件**：Maven 发布 24.22.1 后切回 `runtimeOnly` 依赖。
2. **桥 0.2.0**：Maven Central 直取；`materializeBuiltinPayload=true` 复用其内置 host.js（桥物化不覆盖已有文件，我们的 bootstrap.js 优先）。
3. **AGP 8.10.1 + Gradle 8.12**：受本机 Gradle 缓存与 AGP-Gradle 兼容矩阵约束；升级 AGP ≥8.11 需同步升 Gradle 8.13。
4. **零 AndroidX**：WebView 版本门禁用 PackageManager 等价实现；后续如引入 androidx.activity（返回键现代化）需评审。

## 三、载荷契约（三方一致性）

```
package-payload.mjs（写）          PayloadInstaller.kt（读）         Node（用）
  ustar/mtime0/排序  ──契约──▶  TarReader（拒绝 pax/GNU）  ──▶  只读 payloadRoot
  dsh.version: sha256=tar 哈希 ──对账──▶ DigestInputStream 复核      bootstrap.js env 断言
```

- 资产名 `dsh.tar`（非 .gz）：AAPT2 实测会把 `*.gz` 解压并去后缀。
- 幂等：打包端 `inputsKey`（内容清单哈希）；解包端 `.ready-<sha12>` marker。
- 代际：`payload/<sha12>` 当前 + `payload/previous` 回滚位 + 启动成功后清理其余。

## 四、宪法合规表（关键条目 → 落点）

| 宪法 | 落点 |
|---|---|
| C1 上游零补丁 | `verify-upstream.mjs`（待写，102）+ tag 固定 |
| C2 诚实能力面 | `HostCapabilities.guard`；未注册由桥回 unregistered |
| C3 证据优先 | `docs/010-P0门禁报告.md`（待真机）+ `/probe.json` |
| C4 单进程不可重启 | `DshRuntime` 终态建模；错误页唯一恢复=重启应用 |
| C5 载荷单一事实链 | §三 |
| C8 失败终态化 | `onFailed` + `Phase.FAILED` |
| C9/C10 安全 | networkSecurityConfig；token 读后即删；凭据不落盘（C10 例行 `grep` 检查） |
| C12 二进制不入库 | `.gitignore`（jniLibs/dsh-payload/node_modules） |

## 五、交付流程（阶段门）

| Phase | 内容 | 出口判据 |
|---|---|---|
| P0（本需求） | 脚手架 + 探针 APK + 门禁取证 + 规范文档 | G1/G2/G4/G5/G8/G9/G12/G-WV 有结论 → `docs/010-P0门禁报告.md`；探针清理 |
| P1 MVP | 正式载荷装配（build-upstream/assemble/package）+ `android` profile + host.js/垫片 + 一次完整对话 | 新会话→流式回复→重启后会话仍在（截图序列） |
| P2 宿主能力 | 16 能力补齐 + 两段式异步 + 通知 + 图片桥 + 前台服务 | 能力逐项证据 + facts JSON |
| P3 生态 | market/pnpm/git/fs-search | 装/卸闭环；clone/push；搜索可用 |
| P4 分发 | 签名、双 flavor 产物、体积/性能 | 安装包可侧载；store 可编译并如实降级 |
| P5 回归 | 上游升级演练 | P1–P3 用例全过 |

## 六、风险与对策（摘自规划 §10.2，工程侧新增）

| # | 风险 | 对策 |
|---|---|---|
| R-ENG | Maven 无 24.22.1 引擎 | jniLibs 投放（已做）；发布后切回 |
| R-AAPT | AAPT2 对 assets 的隐式变换 | 裸 tar 契约（已做）；构建后 `unzip -l` 校验资产名 |
| R-NET | SDK/Maven 下载环境受限 | 用户级 gradle.properties 代理 + sdkmanager `--proxy`；buildTools 钉本机已装版本 |
| R-DEV | 真机未连接阻塞 P0 取证 | 探针 APK 预构建；设备接入后 `collect-evidence` 一次跑完 |
