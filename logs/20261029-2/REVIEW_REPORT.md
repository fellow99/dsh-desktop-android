# REVIEW_REPORT · 001-building-workflow（20261029-2）

> 流程：requesting-code-review（explorer 子代理，只读评审，BASE=44e8f9f HEAD=cc7d6cb）→ receiving-code-review（逐条核实 → 修复/驳回）。
> 评审结论（原始）：**No — 5 Critical / 4 Important / 5 Minor**。修复后复评结论见文末。

## Critical（5/5 证实并修复）

| # | 发现 | 核实 | 处置 |
|---|---|---|---|
| C1 | `actions/checkout` 不支持 `path: ../xxx`（v4.2.2 input-helper 抛 "not under $GITHUB_WORKSPACE"）——步骤⑥⑦首跑必挂 | 证实（评审者抓取 action 源码核对） | 上游两仓改 checkout 进 `upstream/` 子目录；`assemble-payload.mjs` 的 `DSH_ROOT`/`MARKET_ROOT` 支持 `DSH_HARNESS_DIR`/`DSH_MARKET_DIR` 环境变量覆盖（与 provision-engine 的 `DSH_ANDROID_RUNTIME_DIR` 同模式），workflow ⑧⑨ 注入 |
| C2 | 引擎 lock 源错位：tag `v24.22.1` 的 `runtime.lock.json` 是 `active=24.2.0` 且**无 24.22.1 条目**——CI 会静默构建 24.2.0 引擎且全部 sha 门禁照常通过 | 证实（`git show v24.22.1:runtime.lock.json`；本地 lock 的 24.22.1 在未打标的 main 上） | `NODE_RUNTIME_REF` 锁 `origin/main@605715e7`（lock.active=24.22.1，已验证）；step ③ 增加硬断言 `lock.active.node == 24.22.1`（node-bridge 0.2.0 配对），漂移即红；provision.mjs 显式 `--node 24.22.1` |
| C3 | lock 的 `release.url` 是发布**页**地址（…/releases/tag/…），`curl -fL` 会下载 HTML → sha256 校验必挂 | 证实（本地 lock 同值） | 下载直链改为 `…/releases/download/<release.tag>/<release.archive>`（仍由 lock 派生，单一事实源不破坏）；实测 HEAD：302→200，`Content-Length=84617236` 与 lock.archiveSize 精确一致、`application/octet-stream`（字节级 sha256 由 CI step ③ 对账兜底） |
| C4 | aapt badging 输出 **versionCode 在前**，断言 grep 的顺序反了——每次 tag run 构建成功后死在 step ⑫ | 证实（本项目 TC-002 证据即 `versionCode='201' versionName='0.2.1'`） | grep -F 改为 `versionCode='$APP_VCODE' versionName='$APP_VERSION'` |
| C5 | `gradlew` 在 git index 中是 100644——Linux runner 上 `./gradlew` Permission denied | 证实（`git ls-files -s gradlew` = 100644） | `git update-index --chmod=+x gradlew` → 100755 |

## Important（4 项：3 修复 1 部分采纳）

| # | 发现 | 处置 |
|---|---|---|
| I1 | `gh release delete --cleanup-tag false`（空格传参）使布尔旗标变 true 且 `false` 被当第二 tag 参数——重跑会误删 git tag | 修复：去掉该旗标（默认 false=保留 tag），注释说明 |
| I2 | spec.md 体积修订把 `## 5. 约束` 标题误替换掉，且旧「≈350MB」行残留形成自相矛盾 | 修复：恢复标题、删除旧行（实测 145MB 在预算内，无矛盾） |
| I3 | pnpm 缓存 key=`run_id` 永不精确命中，且偏离 plan「key 含 harness ref」 | 修复：key=`pnpm-store-<harness pnpm-lock.yaml sha256>`（checkout 后计算），restore-keys 前缀回退 |
| I4 | 彩排未覆盖 ③④⑤ 与 dispatch 路径——恰是全部 Critical 所在 | 采纳：③ 的 URL/断言逻辑本地 HEAD 实证 + sha 口径核对；④⑤ 为 runtime 仓库原生工具（本地 `provision-engine --check` 已证 libnode.so 与 lock 一致）；云端 tag run 作为最终端到端验收（TC-006） |

## Minor（5 项：3 采纳 2 登记）

- 主仓 checkout 补 `persist-credentials: false`（与上游 checkout 一致）——采纳。
- `pnpm config set store-dir` 的 `~` 改 `"$HOME"` 显式展开——采纳。
- summary/release notes 的 runtime 标识由裸 SHA 摘要化（`${NODE_RUNTIME_REF:0:12}`）——采纳。
- provision-engine 的 lock 查找无 abi 过滤——**驳回**（单 abi 锁定 `matrix.abi=[arm64-v8a]`，现库既有行为，不属本模块范围）。
- rc-tag 与正式 tag 的 versionCode 撞号（rc.1/final 均 201）——登记 spec 风险表；首发 v0.2.1 不受影响。

## 驳回/校正说明（receiving-code-review 纪律）

- 评审称「cache key never hits」不准确：restore-keys 前缀回退仍可命中旧缓存；但偏离 plan 文档属实，故仍按 I3 修复。
- 其余发现全部与主源核实一致（action 源码、`git show` 锁内容、`git ls-files -s`、aapt 实证输出）。

## 修复后复评（本地等价验证）

- TC-001(re)：YAML 解析无错 + 结构断言全过（22 steps；含 checkout 路径、env 注入、缓存键、aapt 顺序、gh 幂等）。
- 引擎 URL 实证：构造直链 HEAD 302→200，`Content-Length=84617236 == lock.archiveSize`，`application/octet-stream`。
- 引擎字节一致性：本地 `provision-engine --check` 两 .so 的 sha256/size 与 lock 完全一致（libnode.so be1d164… 即归档产物）。
- `node --check`：assemble-payload.mjs 语法通过。
- 结论：**5 Critical 全部闭环，无遗留 Critical/Important** → 具备打 tag 条件（云端 TC-006 为最终验收）。
