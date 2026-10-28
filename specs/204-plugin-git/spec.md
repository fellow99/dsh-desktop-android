# 204 · GIT 插件（21 工具）（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：packages/git-android/（P3）
> 目标：isomorphic-git 1.44.2 仓库根 chroot + 凭据设置页（§5.2 #10）。

## 功能需求

- FR-204-1 21 个 git 工具（纯 JS，无二进制）
- FR-204-2 凭据：设置页 + 镜像 .git-credentials（0600，临时文件+rename）；参数不得出现口令明文
- FR-204-3 clone/status/commit/push 真机通过

## 验收与测试

- 用例索引：随 P3 定义
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
