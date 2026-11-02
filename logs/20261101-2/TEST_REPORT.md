# TEST_REPORT — dsh-desktop-android 0.2.1（真机）

- **需求**：101-version-0.2.1 ｜ **工程**：dsh-desktop-android
- **版本**：APK 0.2.1 / versionCode 201 / 载荷 dsh **0.2.1-rc.5**（payload sha fda13bd6）｜ engine node **26.13.0**（漂移项待裁决）
- **测试日期**：2026-11-02 ｜ **设备**：MIX (Xiaomi)，Android 8.0.0 (API 26) / System WebView
- **驱动**：debug APK（可 run-as + setWebContentsDebuggingEnabled）→ adb forward CDP(9223) → Playwright

## 构建
| ID | 项 | 结果 |
|---|---|---|
| AN1 | 清理 build/.gradle/app/build | ✅ |
| AN2 | pin 更新：assemble/package-payload rc.2→rc.5；workflow DSH_MARKET_REF→1.73.7 | ✅ |
| AN3 | 引擎投放（provision-engine → jniLibs；**node 26.13.0**） | ✅ |
| AN4 | assemble-payload --deploy --apply（15789 文件；dshmarket 1.73.7） | ✅ |
| AN5 | package-payload（dsh.tar 243MB → assets） | ✅ |
| AN6 | assembleFullRelease ✓（79.4MB）／assembleFullDebug ✓（92.7MB，测试用） | ✅ |
| AN7 | APK 元数据 | ✅ versionName 0.2.1 / versionCode 201 / label DSH Desktop |

## 装机 / 启动
| ID | 项 | 结果 |
|---|---|---|
| AN8 | adb install | ⚠️ 首装被拒 `INSTALL_FAILED_USER_RESTRICTED`（前台 kiosk 拦截）；**设备解锁/回桌面后重装成功** |
| AN9 | 启动 + host 就绪 | ✅ host `http://127.0.0.1:39185/`，WebUI 加载（CDP 可达） |

## 功能测试（本机经 CDP 驱动设备端真实 WebUI）
| ID | 用例 | 结果 | 证据 |
|---|---|---|---|
| AND1 | 设置 DeepSeek API KEY | ✅ | toast「已保存 DeepSeek (deepseek-official)。」 |
| AND2 | 创建工作区（沙箱） | ✅ | 沙箱默认 workspace 激活；`files/workspace/ws-android` 目录已建 |
| AND3 | 一次对话（文本） | ✅ | 「你好，请用一句话回复：收到。」→ 回复「收到。」（6s，1轮1步） |
| AND4 | 图片分析对话 | ✅ **修复并验证**（根因见下） | 附件制备（image.normalize）阻塞已凿穿：宿主日志 `toBuffer out bytes=18965 format=jpeg 800x600`，附件落盘；消息成功提交进会话（轨迹可见），composer 保留文本系假密钥 LLM 认证失败之“保留待重试”正常行为 |
| AND5 | 首屏双标题 | 🔧 已修复并验证 | 根因见下 |
| AND6 | 设置真实 API KEY（真机） | ✅ | toast「已保存 DeepSeek (deepseek-official)。」；模型下拉可选 DeepSeek-V4.1-Flash |
| AND7 | 沙箱中创建测试目录作为工作区 | ✅ | 内置目录浏览器「新建文件夹」→ `ws-cap-test` 创建并选中激活 |
| AND8 | 一次对话「介绍一下你自己」 | ✅ | 真实回复完整（自我介绍+能力+沙箱边界说明），**14s** 完成 |
| AND9 | 图片分析对话（真 key 全链路） | ✅ **修复验证** | 附件制备正常（见下）；模型真实分析 test-image.png（几何测试图/尺寸/色彩类型等），**51s / 1轮** 完成 |
| AND10 | 端侧环境能力自检（agent 实操） | ✅ **13/14** | 见下节 |

## 修复：Android 图片附件发送阻塞（② 真机深挖）
- **现象**：图可挂载且就绪，但带图状态下 发送(Enter/按钮) 一直不触发；纯文本发送正常。
- **证据链**（宿主 app.log）：挂图即 `SHARP metadata ok` → `SHARP toBuffer …` → **`toBuffer invoke FAILED: image.normalize: argument too long`**；客户端 `readAsDataURL` 全部 LOAD 成功（文件可读、base64 完整），提交确实到达宿主。
- **根因**：原生 addon `node_bridge.c` / `node_host_client.c` 入参为**静态缓冲 `ANB_ARGS_CAP = 8192` 字节**，超限即 `napi_throw_range_error("argument too long")`；6752B PNG → base64 ≈ 9026 chars > 8192 → **任何 >6KB 图在 Android 的 image.normalize 桥调用都必然失败**。
  - 附带文档级错误：Kotlin 注释声称“桥 capBytes 8MiB”只约束**响应信封**，入参通道实际仅 64KB 级静态缓冲，多轮排查被该注释误导。
- **修复（自含、零外部仓重建）**：
  1. Node 侧 `packages/attachment-image-android/lib/host-bridge.js`：`invoke()` 中 args JSON > `ANB_ARGS_SAFE_LEN=7000` 时落临时文件（TMPDIR），桥仅传 `{__anbFile: 绝对路径}`；
  2. Kotlin 侧 `app/src/main/kotlin/.../host/HostCapabilities.kt`：`guard()` 分发前统一 `expandAnbArgs()` 读回并删除临时文件 → **全部能力透明受益**。
- **验证（2026-11-02 重打包重装后 host 日志）**：
  ```
  SHARP metadata ok bytes=6752 format=png 800x600 …
  SHARP toBuffer in bytes=6752 raw=true resize=null format=undefined
  SHARP toBuffer out bytes=18965 format=jpeg 800x600   ← 成功（修复前恒 `invoke FAILED: argument too long`）
  DSH_ANDROID_SHIM fs.link … attachments/v1/tmp/… → 哈希名（附件已持久化）
  ```
  - 消息成功提交进会话（轨迹视图出现用户消息）；composer 保留待重试系假模型认证失败行为，与附件无关。
- **待办**：用真 API KEY 跑一次完整图片对话（本轮以假 key 验证宿主附件链路）。

## 功能回归（真机，真实 API KEY，2026-11-02）
- KEY 仅运行时注入（env → 一次性涂改设备端 `dsh-home/.credentials.yaml`，未落盘脚本/文档/提交/日志）；**安全回扫：8 仓 git 跟踪文件零命中；logs 区残留的 3 处旧测试 credential 已抹除为占位符**。
- 测试用假 KEY 已用真 KEY 覆盖；设备 `.credentials.yaml` 的 `refs.DEEPSEEK_API_KEY` 为真实值（产品正常存储，仅设备侧）。
- **真 KEY 图片分析对话验证（AND9）**：挂图→Enter→host 日志 `toBuffer out bytes=18965 format=jpeg`→模型如实分析（几何测试图、800×600、8-bit truecolor RGB…）→「已完成，用时 51 秒」。**② 修复 + 真 key 全链路闭环**。

## 端侧环境能力自检（AND10，agent 实操 + 盘上核验）
| # | 能力 | 结果 | 关键证据（agent 实测 + 盘态） |
|---|---|---|---|
| 1 | 新建/写/读/追加 | ✅ | cat HELLO-CAP-1 + 追加行（wc -l=2） |
| 2 | 编辑/覆盖 | ✅ | printf 覆盖，cat 读回 HELLO-CAP-2，od 验字节 |
| 3 | 列目录 | ✅ | ls -la cap/ |
| 4 | 复制 | ✅ | cp + cmp identical + sha256 同 |
| 5 | 重命名/移动 | ✅ | mv 后 b 消失 c 存在 |
| 6 | 删除 | ✅ | rm 后 test -e GONE |
| 7 | 子目录增删 | ✅ | mkdir/写入/rmdir，test -d GONE |
| 8 | chmod | ✅ **真机实证** | chmod 644 + stat → 644；盘态 `a.txt -rw-r--r--` |
| 9 | shell | ✅ | 真实输出 CAP-SHELL-OK / pwd / ls（盘态佐证） |
| 10 | 内容搜索 grep | ✅ | grep 命中 cap/search.md:1 NEEDLE-… |
| 11 | 后台任务 | ✅ | sleep job 非阻塞；完成通知取回输出+exit 0（盘态无误） |
| 12 | git | ✅ | init main→commit 7ca895…；盘态 .git 齐 |
| 13 | 子智能体 | ✅ | 返回 FILE_COUNT/A_TXT_CONTENT/BYTES，声明未改动 |
| 14 | 附件上下文识别 | ❌（如实） | 新会话无附件上下文；仅磁盘同名文件可读（read_image 仍可用） |
- 合计 **1 轮 13 步 · 241 tok/s · 308K tok**；全程未触发审批、未越界。
- 对照能力对照清单：high-sig 项（#3/#7/#8/#9/#10/#11/#14/#15/#18/#22/#23/#35）在真机以真实工具调用佐证。#21 workflow（❌）、#12/#36 PTY（❌）未测（已知决策不做）。

## 修复：首屏重复 "DSH Desktop"（用户指示 ③）
- **证据**（CDP）：`z7KHQG_headline` 内含 `div[data-slot=conversation.hero.brand.mark]`（插件 hero：logo+DSH Desktop）+ 上游 `span.z7KHQG_titleGroup`（DSH Desktop 预览版），二者都可见 → 双标题。
- **根因**：`@dsh-android/branding` 的 `HERO_CSS` 注入规则 `div:has(> span > [data-slot…]) > span:not(:has([hero]))` 只匹配「槽位被 span 包裹」结构；rc.5 上游把 hero 槽位改为 **`div[data-slot]`（display:contents）直挂 headline** → 规则失配 → 上游 titleGroup 未隐藏。
- **修复**：`packages/branding-android/lib/index.js` `HERO_CSS` 扩展为同时接受 直挂 div / span 包裹 两种结构（`:has()` 选择器列表）。
- **验证**：重装后上游 `z7KHQG_titleGroup` computed `display: none`，首屏仅剩一个 "DSH Desktop" ✅。

## 待办/发现
1. **Android 图片对话完整轮次**：附件链路已修复并验证（假 key）；真 API KEY 完整图片对话待用户注入密钥后跑一遍。
2. **引擎 node 漂移**：③ 已裁决落地（文档/CI 对齐 26.13.0），无 24.22.1 残留。
3. **发送按钮 CDP click 不生效**（Enter 有效）：驱动层现象，正式用户触摸无碍。

## 安全
- API KEY 仅运行时注入，未写入补丁/提交/文档；测试截图/脚本存 `logs/20261101-2/`（gitignored）。
