# REVIEW_REPORT · 001 追加 release 签名（20261030-1）

> 路径：requesting-code-review（fallback：无 subagent 派遣工具，按技能模板自审，显式分类）
> → receiving-code-review（逐条对照代码核验后处理）。
> 范围：工作树未提交 diff（workflow / build.gradle.kts / gitignore / keystore.properties.sample / specs / logs）。
- BASE: d264332（main HEAD）→ 工作树

## Critical
无。

## Important

- **I-1（已修复）** ⑮ Release notes 中 alias 使用 `${{ secrets.KEY_ALIAS }}` 内联插值。
  虽然 alias 本身非密文，但 `${{ }}` 展开进脚本步骤违反 secret 一律走 `env:` 的纪律（密文 secret 内联会进命令行/日志）。
  修复：改读已声明的 `$KEY_ALIAS` 环境变量。
- **I-2（已修复，加固）** 初版只在 Release notes 记录证书指纹，云端未对实际 APK 做签名断言。
  修复：新增 ⑫b `apksigner verify --print-certs`，tag 触发时断言证书 SHA-256 == `EXPECTED_SIGNER_SHA256`（job env 常量，公开指纹），漂移即红。
  指纹比较逻辑本地实测：apksigner 输出无冒号小写 hex，两侧统一 `tr -d ':' | tr a-f A-F`（第一次本地试跑曾 MISMATCH，已实证修复为 MATCH）。

## Minor

- **M-1（登记不修）** Release notes heredoc 内容带前导空格（沿用 Run #6 既有写法，GitHub 渲染正常）。
- **M-2（知悉）** debug（runner 临时 key）与 release（固定 key）签名不同，已装 debug 彩排版的设备升级 release 包需先卸载——由彩彩排→正式的一次性切换，接受。
- **M-3（知悉）** release 变体未开 R8/minify（isMinifyEnabled=false，Run #6 既有口径），后续可随 108 模块评估。

## 核验过的安全点（receiving 侧）

- `git check-ignore`：keystore.properties 与 *.keystore 均被忽略；sample 是唯一入库的签名相关文件，无真实口令。
- 四个 GitHub Secrets 已配置（gh secret list 实证），值不入库、不入日志（全程 env 注入）。
- tag 路径四 secret 缺一即失败，**不回落 debug**（避免误发临时签名正式包）；dispatch 彩排才出 debug。
- ⑩a `keytool -list` 在 Gradle 前预校验口令/别名，错误提前红。
- 本地 signingReport：fullRelease/storeRelease 均挂 release config；assembleFullRelease 成功且 apksigner 指纹与 keystore 一致（TC-008）。
