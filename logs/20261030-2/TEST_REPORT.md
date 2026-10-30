# TEST_REPORT · 001 发布产物改名（20261030-2）

> 变更：Release 附件定名 `dsh-desktop-<version>.apk`（去掉 -android 中缀与 -release 变体后缀）。
> 仅改名；签名/构建/版本注入逻辑零改动。

## Run #8（id 41144737353，tag v0.2.1 → 98f0644）— ✅ PASS

- 全部业务步骤 success（含 #22 ⑫b apksigner 断言、#25 ⑮ Release）。
- Release 附件（gh release view 实证）：
  - **`dsh-desktop-0.2.1.apk`，185,508,340 B，state=uploaded**，非 draft
  - 与 Run #7 包体字节数一致（确定性构建；签名未变）
  - 旧名 `dsh-0.2.1-release.apk` 未残留（⑮ 先删后建，整个 Release 重建）
  - https://github.com/fellow99/dsh-desktop-android/releases/tag/v0.2.1
- 签名回归（#22 日志）：`Signer #1 certificate SHA-256 digest: 06ab2f93c3efab3d2f03936b3ea159cfbf5447d4e468b7185557ab5f0e841a6a` —— 与期望固定证书一致，断言通过。
- 版本回归（#21 日志）：badging `versionCode='201' versionName='0.2.1'`。

## 结论

TC-009（改名版）✅：tag v0.2.1 → 云端签名 release 构建 → Release 附件名为 `dsh-desktop-0.2.1.apk`。
