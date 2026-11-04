# REVIEW_REPORT · 112-cli-integration

> 评审方式：requesting-code-review 模板（category: Critical / Important / Minor）＋ receiving-code-review 纪律（逐条对源码核实后处理）。
> 评审范围：`git log --oneline 9389354..HEAD`（dev 轮 feat/fix 提交）涉及的 CLI 集成实现。

## 变更概览（提交范围）

- `feat(112)`: provision-cli.mjs + cli.lock.json；cli-env.js 环境引导层；subprocess 护栏放行 nativeLibraryDir + ENV_ALLOWLIST；git 21 工具 isomorphic-git→真实 git 委托（git-exec/toolkit）；pnpm worker→spawn 真实 pnpm；assemble-payload 去 isomorphic-git/纯 JS pnpm + cli-data 入载荷；Kotlin DSH_CLI_DATA_DIR。
- `fix(112)`: 农场陈旧链接重建 + NODE_NATIVE_DIR；git_log 无损 JSON + 消息正文解析。

## 结论

未发现 **Critical** 级问题；2 项 Important（均已在开发/测试轮闭环，见证据）；6 项 Minor（记录处理）。

## Important

| # | 项 | 核实 | 处置 |
|---|---|---|---|
| I-1 | **老代码路径残留引用**：`runtime.js` 旧 `loadGit()` 接口 + 注释仍宣称 isomorphic-git。核实：无 import 者（`grep loadGit(` 仅 runtime 自身），注释误导读者。 | 已改为真实 git 加载器（loadGitBinary/loadGit 返回 binary），注释声明 isomorphic-git 已移除 | ✅ 已修复 |
| I-2 | **npm/pip 壳脚本运行前提**：`NODE_NATIVE_DIR` / 农场同名软链不可缺；缺则 `inaccessible or not found`。核实为真机缺陷链（fix 提交 #2/#3）。 | 真机复测：npm/npx/pip 均回版本 | ✅ 已修复（真机证据） |
| I-3 | **git_log 非无损 JSON**：`undefined` 字段触发工具框架校验失败（Agent 交互实测）。 | 真机复测：git_log 正常返回且含标题 | ✅ 已修复（真机证据） |

## Minor（记录，纳入 polish 或后续）

| # | 项 | 说明 |
|---|---|---|
| M-1 | `branch.js` 残留未用 `const argv` 局部变量 | 无害死代码，清理 |
| M-2 | `diff.js` render 状态字母用 `status[0].toUpperCase()`（added→'A' 等），R/C（rename/copy）显示为 'R'/'C' 而非对应描述，可读性略差 | 行为不破坏契约，记录 |
| M-3 | `fetch.js`/`pull.js` 对 `url` 覆盖模式下不设置跟踪分支信息 | 与既有 isomorphic 语义对齐度可后续精化 |
| M-4 | `remote.js` refs 探针 cwd 用 `/`，非仓库场景可接受但路径语义较粗 | 记录 |
| M-5 | `stash.js` entries `reverse()` 把"最新在前"转为列表索引 | 与 renderStashEntries `[index]` 语义一致，记录 |
| M-6 | 多个工具描述文本仍带 "isomorphic-git 不支持祖先语法" 等陈旧措辞 | 描述与实际(已支持 HEAD~1)不符，待文本润色 |

## 评审后动作

- Critical：无。
- Important：I-1..I-3 已在开发/测试轮修复并有真机证据（见 TEST_REPORT 修复清单 1–5），无需再改。
- Minor：M-1..M-6 记录到 `specs/112-cli-integration/tasks.md` Polish 与本文档，本轮不阻塞。
- 敏感信息：review 未发现 KEY/口令入文本文件。
