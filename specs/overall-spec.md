# 整体规格（overall-spec.md）

> 需求基线：`docs/000-工程规划.md`（2026-10-27，v0.1）｜ 能力基线：`dsh-desktop-ark` 0.2.1（§9 对齐矩阵）
> 状态标记：✅ 骨架已实现 ｜ 🟡 部分 ｜ ⬜ 规划（未开工）

## FR-APP 应用形态

| # | 需求 | 状态 | 证据/落点 |
|---|---|---|---|
| FR-APP-1 | 单 APK、单 Activity（`singleTask`）、仅 `arm64-v8a`，applicationId `org.fellow99.dsh.android` | ✅ | `AndroidManifest.xml`、`app/build.gradle.kts` |
| FR-APP-2 | 双发行线 flavor：`full`（All-files，自分发）/ `store`（SAF-only，可选） | ✅（结构）/ ⬜（store 政策项） | `flavorDimension "dist"` |
| FR-APP-3 | 版本三元组可见：app 0.1.0 / dsh 0.2.1-rc.2 / node 24.22.1 | 🟡 | `dsh.version`；「关于」页未做 |

## FR-RUN 运行时与启动

| # | 需求 | 状态 | 证据/落点 |
|---|---|---|---|
| FR-RUN-1 | 进程内 Node（`node::Start` 每进程一次）；`NodeRuntime.start` 投递即返回 | ✅ | `DshRuntime.runSequence` |
| FR-RUN-2 | 就绪判据 = `ready.json`(url) + `HEAD /` ∈ {200,303,401}；读后即删 | ✅ | `DshRuntime.awaitReadyEnvelope` / `Probe` |
| FR-RUN-3 | 失败终态：stage + 日志尾 + last-crash + 重启应用 | ✅ | `DshRuntime.onFailed`、错误页 |
| FR-RUN-4 | Activity 重建复用 URL，不重启 Node；`Exited` 显式建模 | ✅ | 单例 + `NodeState.Exited` 分支 |
| FR-RUN-5 | 载荷解包幂等（marker `.ready-<sha12>`）、半包自愈（tmp+rename）、sha 对账 | ✅ | `PayloadInstaller` |
| FR-RUN-6 | profile 播种到 `$DSH_HOME/profiles/android`（跨代际保留） | ⬜ | 105/P1 |

## FR-UI WebView 外壳

| # | 需求 | 状态 | 证据/落点 |
|---|---|---|---|
| FR-UI-1 | §6.3 配置矩阵（JS/DOM storage 开、file 访问关、cookie 开+flush、debug 才开远程调试） | ✅ | `WebShellView.ensureWebView` |
| FR-UI-2 | 导航围栏：仅本机 origin + about:blank；新窗口拒绝；下载显式提示未支持 | ✅/🟡（下载仅提示） | `isAllowed`/`onCreateWindow`/下载监听 |
| FR-UI-3 | 渲染进程崩溃自愈（重建 WebView 重放 URL） | ✅ | `onRenderProcessGone` |
| FR-UI-4 | WebView 版本下限 110，不达标可读报错（G-WV） | ✅ | `load()` 门禁 |
| FR-UI-5 | 加载/错误覆盖层；诊断一键复制（去 token） | ✅ | 覆盖层 |
| FR-UI-6 | 附件文件选择（SAF `onShowFileChooser`）、下载落盘（DownloadManager/SAF） | ⬜ | P2 |

## FR-CAP 宿主能力（冻结命名 16 项）

| # | 需求 | 状态 |
|---|---|---|
| FR-CAP-1 | 命名 `<域>.<动作>`、JSON 进出、永不抛、≤64 KiB、未注册 `unregistered` | ✅（纪律落实于已注册项） |
| FR-CAP-2 | 首批已注册：`echo` / `log.write` / `runtime.facts` / `perm.allFiles.status` / `shutdown` | ✅ |
| FR-CAP-3 | 其余 11 项（fs.pick*/fs.saveFile/shell.openExternal/notify.show/clipboard.*/image.normalize/power.keepAwake…）+ 两段式异步协议 | ⬜ P2（§6.4） |

## FR-DATA 数据与状态

| # | 需求 | 状态 |
|---|---|---|
| FR-DATA-1 | `DSH_HOME` 布局 §8.1；`HOME=$DSH_HOME/home`；`DSH_USER_ROOT` 由 Kotlin 下发 | ✅（env 已设） |
| FR-DATA-2 | 会话持久化（JSONL+zstd）与全文搜索（G2→node:sqlite；未过→better-sqlite3 垫片） | ⬜（G2 待真机探针） |
| FR-DATA-3 | 三+一主目录工作区（沙箱/文档/下载[/桌面存在才显示]）+ 根围栏 | ⬜ 106 |
| FR-DATA-4 | profile 播种/升级/回滚（`.seeded` marker，cordis.patch.yml 永不覆盖） | ⬜ 105/§8.5 |

## FR-DIAG 诊断与可观测

| # | 需求 | 状态 |
|---|---|---|
| FR-DIAG-1 | 四通道日志（node_bridge.log / app.log / logcat / last-crash） | ✅（通道已分） |
| FR-DIAG-2 | `/_android/facts`（debug-only）与 `payload/selfcheck.js` 断言 | ⬜ 107（探针页 `/probe.json` 为其前驱） |
| FR-DIAG-3 | P0 门禁探针（G1/G2/G4/G5/G8/G9/G12/G-WV 证据采集） | 🟡 已实现，待真机运行 |

## FR-REL 合规与发布

| # | 需求 | 状态 |
|---|---|---|
| FR-REL-1 | 权限最小化、按需请求；`networkSecurityConfig` 仅 loopback | ✅ |
| FR-REL-2 | 凭据/会话/日志全在沙箱；无遥测；日志脱敏 | ✅（原则）+ 待例行检查 |
| FR-REL-3 | 16 KB 页对齐（`zipalign -c -P 16` 通过）+ `useLegacyPackaging=false` | ✅（本轮已验证） |
| FR-REL-4 | 签名（debug/release 分离）、GitHub Release 材料 | ⬜ P4 |

## FR-ECO 生态（P3，全部 ⬜）

dsh-market 装/卸闭环（201）· 运行时插件安装（012，pnpm 10.34.6 in worker）· git 21 工具（204，isomorphic-git 1.44.2）· 纯 JS 内容搜索（206）· Agent 保活（109，前台服务 dataSync 仅 turn 期间）。
