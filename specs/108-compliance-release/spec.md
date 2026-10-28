# 108 · 合规与发布（spec.md）

> 状态：🟡 Partial ｜ 依据：docs/000-工程规划.md ｜ 源码落点：app/build.gradle.kts、app/src/full/AndroidManifest.xml
> 目标：双 flavor、签名、政策清单、体积（§12）。

## 功能需求

- FR-108-1 full（自分发，All-files）/ store（SAF-only，市场只读）双线同代码基
- FR-108-2 versionCode 单调递增；debug/release 签名分离；密钥不入库
- FR-108-3 16KB 对齐 + useLegacyPackaging=false ✅（已验证）
- FR-108-4 Play 政策清单（若走 store）：All-files/动态代码/FGS 类型/权限最小化
- FR-108-5 体积预算：APK ≤200MB（当前 debug 76MB ✅）

## 验收与测试

- 用例索引：TC-L3-2 ✅；L4 例行扫描 ✅
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
