// dsh-desktop-android · 根构建脚本
// 版本统一由 gradle/libs.versions.toml 管理（docs/000-工程规划.md §6.1）。
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
}
