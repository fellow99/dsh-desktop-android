# DEV_CHECKLIST · 001 追加 release 签名（20261030-1）

> 范围：001-building-workflow 追加 T6（release 正式签名）。分支：main（不改动约束）。
> 参考：d:\opencode-workspace\oc-desktop-android（keystore.properties 方案 + build-release.yml secrets 注秘）。

## 任务状态

- [x] T6-1 生成 keystore（RSA2048/PKCS12/alias=dsh-desktop-android/10000 天）+ keystore.properties（gitignore）+ .sample（入库）
- [x] T6-2 app/build.gradle.kts：Properties 条件注册 signingConfigs.release
- [x] T6-3 workflow ⑩a 注秘 + ⑪–⑮ variant 化（tag=release 强制签名；dispatch=debug）
- [x] T6-4 四个 GitHub Secrets 配置（gh secret set/list 核验）
- [x] T6-5 本地验证 signingReport + assembleFullRelease + apksigner（TC-008 PASS）
- [ ] T6-6 重打 tag → Run #7（TC-009）

## 关键事实

- 证书 SHA-256：06:ab:2f:93:c3:ef:ab:3d:2f:03:93:6b:3e:a1:59:cf:bf:54:47:d4:e4:68:b7:18:55:57:ab:5f:0e:84:1a:6a
- SHA-1：2e:75:5b:4c:73:64:f6:2e:cd:ec:6e:c7:0e:6d:0a:de:de:42:32:61
- 有效期至 2054-03-18；DN: CN=dsh-desktop-android, O=fellow99, C=CN
- 本地 release 空壳（无载荷）3,448,726 B，apksigner 验证通过，badging 201/0.2.1

## 云端前遗留状态（本次需一并修复）

- Run #6 发布的 Release v0.2.1 事后被删除：现仅 tag 占位 Release（Source code zip/tar.gz），
  API /releases 返回 []，dsh-0.2.1-debug.apk 直链 404。Run #7 的 ⑮（先删后建）将重建正式 Release。
