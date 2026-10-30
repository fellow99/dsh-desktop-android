# DEV_CHECKLIST · 001 发布产物改名（20261030-2）

- [x] T7-1 workflow ⑬ NAME 改为 `dsh-desktop-${REL_VERSION}.apk`（变体后缀移除；中间产物 app-full-<variant>.apk 路径不变）
- [ ] T7-2 重打 tag v0.2.1 → Run #8，Release 附件 `dsh-desktop-0.2.1.apk`

## 评审要点（fallback 自审）

- APK_NAME 经 GITHUB_ENV 传递至 ⑮，改名只动 ⑬ 一处即可。
- 重跑幂等：⑮ `gh release delete -y` 删整个 Release（旧名 dsh-0.2.1-release.apk 附件随之删除）再 create，不会新旧并存。
- workflow_dispatch 彩排：VERSION 空 → 回落 0.1.0 → dsh-desktop-0.1.0.apk，不影响 Release（不发布）。
- artifact 名 dsh-apk-<version> 不含变体后缀，无需改动。
