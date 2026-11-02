// 文本对话测试：介绍一下你自己（真实 key，端到端）
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  // 新建会话（避免首会话 P1 卡死）
  await p.locator('button[class*=newSession]').first().click().catch(() => {});
  await p.waitForTimeout(2000);
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('介绍一下你自己');
  await p.waitForTimeout(400);
  await compose.press('Enter');
  console.log('SENT 介绍一下你自己 at', new Date().toISOString());
  // 轮询等待回复完成（深度求索中 消失 + 出现停止按钮态变化）
  let done = false;
  let texts = [];
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(3000);
    texts = await p.evaluate(() => {
      const el = [...document.querySelectorAll('[class*=assistant] [class*=message] , [class*=AgentMessage], [class*=conversation] [class*=message]')].pop();
      return el ? el.innerText.slice(0, 400) : '';
    });
    const st = await p.evaluate(() => ({
      running: /深度求索中/.test(document.body.innerText),
      t: document.body.innerText.slice(-160),
    }));
    if (!st.running && texts && texts.length > 20) { done = true; break; }
    if (i % 10 === 0) console.log(`  t+${(i + 1) * 3}s running=${st.running}`);
  }
  const final = await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 500));
  console.log('DONE:', done);
  console.log('FINAL:', JSON.stringify(final));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
