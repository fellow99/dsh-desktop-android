// 环境能力自检：驱动 agent 逐项实操 + 结尾标记
const { chromium } = require('playwright');
const path = require('path');
const PROMPT = `请对当前 Android 运行环境做一次**能力自检**（仅在当前工作区内操作，绝不越界，不请求任何审批），逐项执行并如实汇报「成功✅/失败❌ + 关键证据」。最后一条消息必须以行内标记 \`[CAP-DONE]\` 结尾，并在此之前给出汇总表。

1. 文件新建/写/读：新建 cap/a.txt，写入 HELLO-CAP-1；读取并显示内容；往文件追加一行并在文件头部或整体再次读取确认。
2. 编辑/覆盖：把 a.txt 内容改为 HELLO-CAP-2 并读回确认。
3. 列目录：列出 cap/ 目录全部条目（用可用的 ls/glob 工具）。
4. 复制：把 a.txt 复制为 cap/b.txt，读回 b.txt 确认内容一致。
5. 重命名/移动：把 b.txt 重命名为 cap/c.txt，再用 ls 确认 c.txt 存在、b.txt 不存在。
6. 删除：删除 cap/c.txt，用 ls 确认已消失。
7. 子目录：新建 cap/sub/d.txt 写内容，再删除 d.txt 与空目录 sub。
8. 改权限 chmod：对 a.txt 执行 chmod 644，然后用 stat 或 ls -l 读回权限位并报告。
9. shell：运行 \`echo CAP-SHELL-OK\` 和 \`pwd\` 与 \`ls -la .\`，报告真实输出。
10. 内容搜索：新建 cap/search.md 写入 "NEEDLE-CAP-TEST-2026" 字样，再用内容搜索工具(grep/搜索)在工作区内找到含该字符串的文件，报告命中。
11. 后台任务：启动一个 \`sleep 5\` 类的后台任务，查询其 job 状态与输出（不阻塞）。
12. git：在 cap/ 下初始化 git 仓库，git status 确认，创建初始提交，报告 commit hash 与 git log 一行。
13. 子智能体：用子智能体执行一个简单任务（如统计 cap/ 下文件数或摘要 a.txt），汇报其返回。
14. 只读附件：本轮对话中已有 test-image.png 图片附件，请基于该附件总结它在对话中的角色。
每项一行「✅/❌ + 证据」。最后给汇总表，然后以 [CAP-DONE] 结束。`;
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  await p.locator('button[class*=newSession]').first().click().catch(() => {});
  await p.waitForTimeout(2000);
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill(PROMPT);
  await p.waitForTimeout(500);
  await compose.press('Enter');
  console.log('CAP SENT at', new Date().toISOString());
  let done = false;
  for (let i = 0; i < 120; i++) {
    await p.waitForTimeout(5000);
    const st = await p.evaluate(() => ({ running: /深度求索中/.test(document.body.innerText), body: document.body.innerText }));
    if (!st.running && /\[CAP-DONE\]/.test(st.body)) { done = true; console.log(`DONE at t+${(i + 1) * 5}s`); }
    // 也接受“仅 running false 且无运行中”作为兜底，但继续等标记几轮
    if (i % 12 === 0) {
      const t = await p.evaluate(() => document.body.innerText);
      const idx = t.lastIndexOf('cap/a.txt');
      console.log(`  t+${(i + 1) * 5}s running=${st.running} caplen=${idx > 0 ? 1 : 0}`);
    }
    if (done) break;
  }
  const full = await p.evaluate(() => document.body.innerText);
  // 截取从 prompt 之后到结束的回复
  const reply = full.split('能力自检')[1] || full.slice(-4000);
  await import('node:fs').then(fs => fs.promises.writeFile(path.join(__dirname, 'cap-reply.txt'), full.slice(-12000), 'utf8'));
  console.log('REPLY-TAIL:\n' + full.slice(-2600));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
