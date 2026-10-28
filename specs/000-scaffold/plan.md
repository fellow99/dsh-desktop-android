# 000-scaffold · 技术方案（plan.md）

> 落地结构与关键决策（含偏差登记）。宪法对照见 `../overall-plan.md` §四。

## 1. 结构决策

| 决策 | 内容 | 理由 |
|---|---|---|
| D-000-1 | 单模块 `:app`；`gradle/libs.versions.toml` 管 AGP 8.10.1 / Kotlin 2.2.20；wrapper 8.12 | 本机 Gradle 8.12 与 AGP 兼容矩阵上限；单一模块足够承载外壳 |
| D-000-2 | 零 AndroidX 依赖；View 体系覆盖层；WebView 版本门禁走 PackageManager | 外壳面小；减少依赖解析与版本漂移面 |
| D-000-3 | 引擎以 jniLibs 投放（来源 `aosp-node-runtime` v24.22.1，八项 ELF 门禁 + sha256 对账） | **偏差**：Maven Central 无 24.22.1；TECH.md 已登记恢复条件 |
| D-000-4 | 载荷资产 = **裸 ustar `dsh.tar`**；AAPT2 会解压 `.gz` 改名（实测）；压缩交给 APK zip | 打包器/解包器契约对齐（C5） |
| D-000-5 | 桥 AAR 的 `materializeBuiltinPayload=true`：获得内置 host.js（Node 侧 invoke 客户端）；已存在文件不覆盖 ⇒ 我们的 bootstrap.js 优先；**宿主启动器因此命名为 host-boot.js**（避免与桥客户端 host.js 同名互斥，评审 C3）| 复用桥的 NAPI 接线，不重造 |
| D-000-6 | 就绪判据 = ready.json + HEAD 探活；退化路径扫 `DSH_READY` 日志行 | §4.6 单一判据；防文件系统异常导致死等 |
| D-000-7 | 探针以**独立载荷文件**（payload/bootstrap.js 全量探针）+ Kotlin `[PROBE]` 标注位实现 | 探针可整体删除（FR-000-9），不留散落痕迹 |

## 2. 关键流程

```
构建：node scripts/provision-engine.mjs → node scripts/package-payload.mjs → gradle assembleFullDebug
运行：MainActivity → DshRuntime.ensureStarted → (解包→start→await→ready→探活→loadUrl)
探针：bootstrap.js 同步探测 → HTTP :0 监听 → 宿主桥 invoke(echo/probe.allFiles/facts) → ready.json+DSH_READY
取证：截图（探针页）+ `adb shell run-as … cat files/probe/engine.json` + `/probe.json`
```

## 3. 风险与处理

| 风险 | 处理 |
|---|---|
| AAPT2 资产改名 | 裸 tar 契约（D-000-4）；构建后 `unzip -l` 校验（TC-L0-4） |
| SDK 自动下载失败（无代理） | buildTools 钉 36.0.0；sdkmanager 显式 `--proxy` |
| 设备未连接 | 探针 APK 预构建；设备接入后一次性取证 |
| `probeEngine()` 桥 API 变化 | 仅探针期使用；正式版不依赖 |

## 4. 探针清理计划（FR-000-9）

门禁报告定稿后：
1. 删除 `payload/bootstrap.js`（探针载荷）→ 由正式 `payload/{bootstrap.js,host-boot.js,shims/,selfcheck.js}` 替换（P1 提交）。
2. 删除 `DshRuntime` 中 `[PROBE] engine.json` 段与 `HostCapabilities#probe.allFiles`。
3. 删除设备上 `files/probe/`（随卸载自动消失）。
4. 更新 `SPECS_CHECKLIST.md` 状态。
