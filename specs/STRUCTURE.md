# 目录结构（STRUCTURE.md）

> 依据 `find`（排除 `.git/build/.gradle/jniLibs/载荷产物`）于 2026-10-27 生成。
> 生成物规则：**二进制不入库**（docs/000-工程规划.md §13）——`app/src/main/jniLibs/`、`app/src/main/assets/dsh-payload/`、`build/` 均已 gitignore。

```
dsh-desktop-android/
├── .gitignore                          # 含「二进制不入库」条目（jniLibs / dsh-payload / node_modules）；本模块为 git 子模块
├── LICENSE                             # MIT
├── README.md                           # 项目一句话介绍
├── settings.gradle.kts                 # include(":app")；google/mavenCentral
├── build.gradle.kts                    # AGP/Kotlin 版本经 libs.versions.toml
├── gradle.properties                   # jvmargs、androidx、发行线 dsh.dist=full
├── local.properties                    # sdk.dir（gitignored，不入库）
├── gradle/
│   ├── libs.versions.toml              # AGP 8.10.1 / Kotlin 2.2.20
│   └── wrapper/                        # gradle-wrapper 8.12（jar + properties）
├── gradlew / gradlew.bat
├── app/
│   ├── build.gradle.kts                # applicationId/minSdk29/targetSdk36/flavor full|store/buildTools 36.0.0
│   ├── proguard-rules.pro              # keep org.fellow99.nodebridge.**
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml     # singleTask / 权限 / networkSecurityConfig
│       │   ├── kotlin/org/fellow99/dsh/android/
│       │   │   ├── DshApplication.kt           # 日志初始化 + 未捕获异常兜底
│       │   │   ├── MainActivity.kt             # 唯一 Activity（singleTask）→ WebShellView
│       │   │   ├── common/Constants.kt         # 路径/超时/能力名单一事实源
│       │   │   ├── common/AppLog.kt            # 业务日志（dsh-home/logs/app.log，JSON 行）
│       │   │   ├── runtime/DshRuntime.kt       # 启动编排状态机（Application 级单例）
│       │   │   ├── runtime/PayloadInstaller.kt # 裸 ustar 解包（marker/sha256 对账/zip-slip 防护）
│       │   │   ├── runtime/Probe.kt            # HEAD / 探活（200/303/401）
│       │   │   ├── host/HostCapabilities.kt    # 宿主能力注册（echo/log.write/facts/allFiles…）
│       │   │   └── ui/WebShellView.kt          # WebView + 加载/错误覆盖层 + 导航围栏 + 渲染自愈
│       │   ├── res/
│       │   │   ├── drawable/ic_launcher.xml    # 占位图标
│       │   │   ├── values/{strings,colors,themes}.xml
│       │   │   └── xml/network_security_config.xml  # 仅 127.0.0.1/localhost 明文
│       │   ├── jniLibs/arm64-v8a/              # [生成物，不入库] libnode.so + libc++_shared.so
│       │   └── assets/dsh-payload/             # [生成物，不入库] dsh.tar + dsh.version
│       └── full/
│           └── AndroidManifest.xml     # MANAGE_EXTERNAL_STORAGE（仅 full flavor）
├── payload/
│   └── bootstrap.js                    # [探针载荷·临时] P0 门禁证据采集（验收后删除）
├── scripts/
│   ├── provision-engine.mjs            # 引擎 .so 投放（sha256 对账 runtime.lock.json）
│   └── package-payload.mjs            # payload/ → 确定性裸 ustar + dsh.version
├── docs/
│   └── 000-工程规划.md                  # 需求与设计唯一上游文档
└── specs/                              # 本目录（规范文档）
```

## 运行期数据目录（设备上，`<filesDir>` = /data/user/0/org.fellow99.dsh.android/files）

```
<filesDir>/
├── dsh-home/                  # DSH_HOME
│   ├── profiles/android/      # profile（播种 + 运行时装插件；跨代际保留）
│   ├── logs/app.log           # 业务日志（结构化 JSON 行）
│   ├── home/                  # HOME（os.homedir() 落点）
│   ├── storages/ · sessions/
├── payload/<sha12>/           # 解包后的载荷（只读使用）
├── payload/previous           # 上一代际（回滚用）
├── node-bridge/               # 桥日志 node_bridge.log + last-crash
├── run/ready.json             # 就绪信封（读后即删）
├── workspace/                 # 沙箱工作区根（默认工作区）
├── tmp/
└── probe/                     # [探针阶段临时] engine.json（验收后随探针清理）
```

## 模块 ↔ 源码映射

| specs 模块 | 源码落点 |
|---|---|
| 101 运行时启动编排 | `runtime/DshRuntime.kt`、`runtime/Probe.kt` |
| 102 载荷管线 | `runtime/PayloadInstaller.kt`、`scripts/package-payload.mjs`、`scripts/provision-engine.mjs` |
| 103 WebView 外壳 | `ui/WebShellView.kt`、`MainActivity.kt`、`res/xml/network_security_config.xml` |
| 104 宿主能力桥 | `host/HostCapabilities.kt`、`common/AppLog.kt` |
| 108 合规与发布 | `app/build.gradle.kts`（flavor）、`app/src/full/AndroidManifest.xml` |
| 探针（临时） | `payload/bootstrap.js` + `host/HostCapabilities.kt#probe.allFiles` |
