# TEST_REPORT · 001 追加 release 签名（20261030-1）

> 用例源：specs/001-building-workflow/test-cases.md。本报告覆盖 TC-008（L0）/ TC-009（L2，Run #7）。

## TC-008：release 签名本地验证 — ✅ PASS

- `:app:signingReport`：fullRelease / storeRelease 均挂 Config=release（Store=dsh-desktop-android.keystore，Alias=dsh-desktop-android，Valid until 2054-03-18）；debug 变体仍是 AGP 默认 debug key。
- `:app:assembleFullRelease -PappVersionName=0.2.1 -PappVersionCode=201`：BUILD SUCCESSFUL（本地无载荷空壳 3,448,726 B）。
- `apksigner verify --print-certs`：证书 SHA-256 `06ab2f93c3efab3d2f03936b3ea159cfbf5447d4e468b7185557ab5f0e841a6a`，与 keytool keystore 指纹一致。
- aapt badging：`versionCode='201' versionName='0.2.1'`。
- 忽略规则：`git check-ignore` 命中 keystore.properties / *.keystore；入库仅 keystore.properties.sample。

## TC-009：云端 release 端到端 — ✅ PASS（Run #7 id 41091935880）

- tag `v0.2.1` 重打至 4703d6c 触发；**全 25 个业务步骤 success**（含新增 #17 ⑩a 注秘、#22 ⑫b apksigner 断言、#25 ⑮ Release）。
- Release 验收（gh release view 实证）：
  - 名称 `dsh-desktop-android 0.2.1`，非 draft/prerelease，tag v0.2.1
  - 附件：**`dsh-0.2.1-release.apk`，185,508,348 B（≈177MB），state=uploaded**（原 Run #6 丢失的 Release 已由幂等"先删后建"重建；debug 附件不再产出）
  - https://github.com/fellow99/dsh-desktop-android/releases/tag/v0.2.1
- 签名云端实证（Run #7 日志，#22 ⑫b，对 Release 同款 APK）：
  - `Signer #1 certificate DN: CN=dsh-desktop-android, O=fellow99, C=CN`
  - `Signer #1 certificate SHA-256 digest: 06ab2f93c3efab3d2f03936b3ea159cfbf5447d4e468b7185557ab5f0e841a6a` ← 与本地 keystore 及 EXPECTED_SIGNER_SHA256 断言值一致，步骤 success 即漂移断言通过
  - SHA-1 2e755b4c… 一致
- aapt 云端断言（#21）：`package: name='org.fellow99.dsh.android' versionCode='201' versionName='0.2.1'`
- 负向门禁（缺 secret 应红）：由 ⑩a fail-closed 循环 + 指纹断言的静态逻辑覆盖，未实操删 secret。
- 字节级全量下载复测未做：本机对 GitHub release 资产限速（15 分钟仅 21MB / ~24KB·s⁻¹，与 TC-007 记录同量级），云端 apksigner 已对同一文件完成验签，证据等价；已删除不完整分片，未留垃圾。

## 结论

- TC-008 ✅ / TC-009 ✅。需求 001 追加项达成：**打 tag v0.2.1 → 云端构建固定密钥签名的 full/release APK → GitHub Release 发布**。
- 同一固定签名的后续版本可覆盖升级（debug 彩排版需先卸载，见 REVIEW_REPORT M-2）。
- 后续：Play App Signing / store flavor 仍属 108 模块 P4（REVIEW_REPORT M-3：minify 未开）。
