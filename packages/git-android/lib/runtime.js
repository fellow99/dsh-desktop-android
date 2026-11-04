/**
 * 112-cli-integration（US3 / FR-112-4）：运行时支撑。
 *
 * isomorphic-git 纯 JS 后端已移除；21 工具全部委托真实 `git` 二进制（见 git-exec.js）。
 * 本模块保留加载入口以容纳跨工具导入，实际能力由 git-exec.js / toolkit.js 提供。
 *
 * @module @dsh-android/git/runtime
 */
import { resolveGitBinary } from './git-exec.js'

/** 历史版本断言已随 isomorphic-git 移除；此处仅文档化。 */
export const ISOMORPHIC_GIT_VERSION = null

/**
 * 加载 git 运行时命名空间（真实 git 二进制）。
 * @returns {Promise<{ binary: string }>} 解析到的 git 可执行路径。
 */
export async function loadGitBinary() {
  return { binary: resolveGitBinary() }
}

/** 兼容旧导入：返回真实 git 二进制信息（无 isomorphic-git 对象）。 */
export async function loadGit() {
  return { binary: resolveGitBinary(), version: ISOMORPHIC_GIT_VERSION }
}
