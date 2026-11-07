[English](./README.md) | 中文

# `@dsh-android/git`

> DSH Desktop（Android 版）的 **git 集成**（`specs/112-cli-integration`）：把 **aosp-git-cli 真实 `git` 二进制**（经
> `payload/cli-env.js` 的 `$HOME/bin` 符号链接农场）作为执行引擎，Host 侧只保留**一个 `git` passthrough 工具**
> 把 argv 直接交给真实 `git`。21 个按动词封装的工具（源自 `dsh-desktop-hos/plugins/harmony-plugin-git` 的
> isomorphic-git 版）已精简为这一层，纯 JS 闭包不再随包。

## 交付物

| 面 | 内容 |
|---|---|
| Host（`lib/index.js` + `lib/tools/git.js`） | **1 个工具**：`git` —— `argv`（`git` 之后的命令行）+ 可选 `dir`/`timeoutMs`；返回 `code`/`root`/`stdout`/`stderr` |
| Client（`lib/client.js`） | 设置页「Git 凭据」：保存 / 查看状态 / 删除（`settings.section`，id `git-credentials`） |

一行 `@dsh-android/bundle` 的 `insert` 行同时交付两者（工具注册在宿主平面；设置页由 `dsh.client` 扫描发现）。

## 工具语义

`git` 把 `argv` 原样交给真实二进制，工作目录 = 围栏裁决后的仓库根。刻意"如实"：**非零退出码不被当成错误**
——`git diff --exit-code` 或 `git status --short` 返回 1 是模型需要的值。仅两类失败映射为可读错误：

- 认证缺失/被拒 → 提示创建 `GIT_CREDENTIAL_<HOST>`（Settings → Git 凭据），而非裸 401；
- 目标不是仓库 → 提示 `git init` / `git clone`。

**argv 护栏**：拒绝会让 git 打开仓库外的选项（`--git-dir` / `--work-tree` / `--exec-path` / `--separate-git-dir` /
`--config-env=`）；`-C` 的绝对路径必须落在围栏根内（相对子目录放行）。

## 配置（`Config`，schemastery）

| 键 | 默认 | 说明 |
|---|---|---|
| `networkTimeoutMs` | `300000` | 单次 git 调用的墙钟预算（模型可用 `timeoutMs` 覆盖） |

## 凭据

- 键名：`GIT_CREDENTIAL_<HOST>`，`<HOST>` = `host[:port]` 大写化、非字母数字 → `_`；值 = `username:password`（按**第一个** `:` 切分）。
- 真实 `git` 经 `credential.helper=store --file=$DSH_HOME/.git-credentials` 读取凭据；`lib/git-credentials.js`
  按 git 原生格式维护该文件（一行一条带 userinfo 的 URL、`0600`、临时文件 + rename）。
- `git` 工具在 spawn 前会为 argv 中的 http(s) URL **前置 mirror**：`credentials.lookup(url)` 把设置页存的
  `GIT_CREDENTIAL_<HOST>` 同步进该文件（尽力而为，失败不影响本次操作）。`$DSH_HOME` 整份拷走后，别处的
  `git` 也能直接用同一份凭据。
- 明文**不进**对话、日志与 `cordis.patch.yml`；远端地址进输出前会抹掉 userinfo。
- 身份（`user.name`/`user.email`）**不进**凭据库。

## 围栏

每次调用先用 `ctx.fs` 把 `dir`（默认会话目录）解析成进程可见的绝对**仓库根**，之后 `git` 只在该根内运行：

- 仓库根在会话工作区内 → 直接执行；
- 在会话工作区外 → `FS_SANDBOX_DENIED` + 共享 marker 的提权提示；模型带 `sandbox_permissions` + `justification`
  重试时走既有审批链路，一次性放行。

**已知取舍**：仓库**内部**写入不逐次经 `fs-sandbox.checkedTarget`（`git` 是独立进程），围栏粒度是仓库根单点 + argv
护栏（比 `bash` 工具完全无围栏更严）。

## 已知限制

- **SSH 不可用**：只有 http(s) 传输；`git@host:path` 与 `ssh://` 不在本轮范围（aosp-git-cli 侧二期）。
- 未授权/无凭据的 http(s) 远端立即失败（`GIT_TERMINAL_PROMPT=0`），绝不挂起等交互输入。
- 明文 `http://` 远端会把 Basic 凭据以 base64 过网，生产环境应使用 `https://`。
- 设置页无法枚举 ref（凭据 API 无枚举面），「已录入主机」列表存在页面 `localStorage`，页面 origin 每次启动变化
  ⇒ 重启后该列表为空（凭据本身不受影响）。

## 规格与验收

`specs/112-cli-integration/`（spec / plan / tasks / test-cases）；真机验收记录见 `logs/`。上游同契约源码
（isomorphic-git 版，未随 112 改动）见 `dsh-desktop-hos/plugins/harmony-plugin-git` 与
`dsh-desktop-ark/packages/git-ohos`。
