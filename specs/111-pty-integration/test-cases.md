# 111 · PTY 完整终端能力（test-cases.md）

> 状态：⬜ Planned ｜ 取证环境：真实设备 MIX(API26<minSdk29 不可装) ⇒ 模拟器 AVD `Pixel_10`（API37，x86_64+ARM 转译）
> 证据纪律：宪法 C3（命令输出/截图/facts 字段为唯一判据）。

## A. 环境与依赖

- [ ] TC-111-A1 三件套 Maven Central 可达（node-bridge 0.2.0 / node-runtime 26.13.0 / node-pty 26.13.0）
- [ ] TC-111-A2 `assembleFullDebug` 构建通过；APK 内五个 .so 齐全（§tasks T111-12）

## B. 引擎升级回归（FR-111-6）

- [ ] TC-111-B1 启动链：Host READY（G3）＋ 引擎 G12（node::Start）/ G4（Intl）
- [ ] TC-111-B2 会话持久化 / 通知 / git(21 工具) / 搜索(grep/glob) 冒烟不回归
- [ ] TC-111-B3 `/_android/facts` 可读（debug-only）

## C. node-pty 加载（FR-111-2）

- [ ] TC-111-C1 S6 垫片登记：bootstrap 日志 `shim DSH_ANDROID_SHIM node-pty: installed`
- [ ] TC-111-C2 facts 字段 `pty.loaded=true` / `pty.shell=/system/bin/sh`
- [ ] TC-111-C3 缺件/ABI 不符时不静默回退（结构化报错）

## D. spawnTerminal（FR-111-3）

- [ ] TC-111-D1 `spawnTerminal('/system/bin/sh -i')` 返回句柄 pid>0，output 出现提示
- [ ] TC-111-D2 交互命令 `echo hello` / `pwd` 回显、exit 正常

## E. 终端面板（FR-111-4）

- [ ] TC-111-E1 WebView 右侧栏出现终端面板并渲染 shell 提示
- [ ] TC-111-E2 键入/回车输入回环；面板 resize 生效
- [ ] TC-111-E3 close/kill：进程不残留；`done` settle

## F. 保活（FR-111-5）

- [ ] TC-111-F1 活跃终端不被保留自动回收误杀（inspectActivity 保守）

## G. 基本功能回归（用户要求）

- [ ] TC-111-G1 设置 DeepSeek API KEY 并选择模型 **deepseek-flash**
- [ ] TC-111-G2 创建工作区
- [ ] TC-111-G3 一次对话「介绍一下你自己」流式完成
- [ ] TC-111-G4 看图分析对话（attachment-image 管线）

> 注：测试所用密钥/凭证仅运行时注入，**不落盘任何文档**（内容纪律）。
