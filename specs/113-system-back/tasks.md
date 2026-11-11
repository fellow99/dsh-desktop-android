# 113 · 系统返回键行为 + 界面安全区适配（Android 版，tasks.md）

> 对应：`spec.md` / `plan.md` ｜ 状态：⬜（执行中逐条勾）

## 依赖序任务

- [x] T1. 载荷 seam 插件 `packages/back-android/`
  - [ ] 1.1 `package.json`（`@dsh-android/back`，private，type module，exports→lib/index.js）
  - [ ] 1.2 `lib/seam.js`：SEAM_JS（幂等、语义选择器、Escape 派发 / 掩膜点击 / 无操作 false）
  - [ ] 1.3 `lib/index.js`：`name='back-android'`、`inject=['webServer']`、`apply()` push `kind:'script'` 行（含审计标记 `DSH_ANDROID_SYSTEM_BACK`）
  - [ ] 1.4 `README.md`（机制/纪律/审计标记）
- [x] T2. `packages/bundle-android/cordis.patch.yml` insert 追加 `- id: back-android / name: '@dsh-android/back'`
- [x] T3. Kotlin 壳：`MainActivity.onBackPressed()` 改造为总是消费 + `shell.handleSystemBack()`
- [x] T4. Kotlin 壳：`WebShellView.handleSystemBack()` 新增
- [x] T5. 界面安全区适配：`MainActivity`/`WebShellView` 安装 insets 监听 + `setDecorFitsSystemWindows`/回退 + `requestApplyInsets`
- [x] T6. 构建：`./gradlew assembleFullDebug` 通过（先于安装）
- [x] T7. 真机基线复现（改前）：装当前已发布包或差异包，截图 + uiautomator 取证顶/底重叠
- [x] T8. 真机实现验证（L1 用例）
- [x] T9. `lsp_diagnostics` 无新增错误 + 代码审查（Step 3.5）
