# TEST_CHECKLIST · 111-pty-integration

> 日期：2026-11-01 ｜ 来源：specs/111-pty-integration/test-cases.md ｜ 目标设备：模拟器 AVD `Pixel_10`(API37)
> 真实设备 MIX(API26) < minSdk29 **不可装**，故用模拟器。

## A. 环境与依赖
- [ ] TC-111-A1 Maven Central 三件套可达（node-bridge 0.2.0 / node-runtime 26.13.0 / node-pty 26.13.0）✅
- [ ] TC-111-A2 `assembleFullDebug` 通过且 5 .so 入包 ✅（libpty_node.so 71,120B）

## B. 引擎升级回归
- [ ] TC-111-B1 Host READY + 引擎 G12/G4
- [ ] TC-111-B2 会话持久化/通知/git/搜索冒烟
- [ ] TC-111-B3 /_android/facts 可读

## C. node-pty 加载
- [ ] TC-111-C1 S6 垫片登记日志
- [ ] TC-111-C2 facts pty 字段
- [ ] TC-111-C3 缺件不静默回退

## D. spawnTerminal
- [ ] TC-111-D1 fork /system/bin/sh -i 句柄
- [ ] TC-111-D2 echo/pwd 回显

## E. 终端面板
- [ ] TC-111-E1 右侧终端面板渲染
- [ ] TC-111-E2 输入回环/resize
- [ ] TC-111-E3 close/kill 无残留

## F. 保活
- [ ] TC-111-F1 活跃终端不被误回收

## G. 基本功能回归
- [ ] TC-111-G1 设置 API KEY + deepseek-flash
- [ ] TC-111-G2 创建工作区
- [ ] TC-111-G3 对话「介绍一下你自己」
- [ ] TC-111-G4 看图分析
