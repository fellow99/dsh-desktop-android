# 105 · 上游适配层（android profile + bundle）（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：profiles/android/、packages/bundle-android/（P1）
> 目标：android profile 播种 + @dsh-android/bundle YAML 覆盖层（§5.1）。

## 功能需求

- FR-105-1 profile 播种到 $DSH_HOME/profiles/android（.seeded marker；cordis.patch.yml 永不覆盖）
- FR-105-2 bundles 顺序：dsh-base → dsh-web-app → @dsh-android/bundle → dshmarket
- FR-105-3 覆盖行：hmr 禁用、subprocess/sandbox/open-in-app 换名、directory-picker 处理、新增 notify/facts/market/git/fs-search
- FR-105-4 只允许 disabled/换 name/insert；键名以实测为准，不做猜键名
- FR-105-5 verify-upstream.mjs 兼容性门禁（§5.5）

## 验收与测试

- 用例索引：随 P1 定义
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
