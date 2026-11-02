const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  // 新会话
  await p.locator('button.jy-7YG_newSession, button[class*=newSession]').first().click().catch(() => {});
  await p.waitForTimeout(1500);
  const state0 = await p.evaluate(() => ({
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
    text: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
    body: document.body.innerText.split('\n').filter(Boolean).slice(0, 8),
  }));
  console.log('new session state:', JSON.stringify(state0, null, 0));

  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('你好，请用一句话回复：收到。');
  await p.waitForTimeout(300);
  await compose.press('Enter');
  console.log('sent in new session at', new Date().toISOString());

  let prev = ''; let stick = 0; let done = false; let stats='';
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await p.waitForTimeout(4000);
    const running = (await p.locator('button[aria-label="停止生成"],button[aria-label="停止"]').count()) > 0;
    const cur = await p.evaluate(() => document.body.innerText);
    if (cur.length === prev.length) stick++; else stick = 0;
    prev = cur;
    const m = cur.match(/(\d+) 轮 (\d+) 步/);
    if (m) stats = m[0];
    const firstTurn = /介绍AI编码助手/.test(cur);
    const replyCount = (cur.match(/收到。/g) || []).length;
    const isNewRound = stats === '1 轮 1 步' && !/介绍AI编码助手/.test(cur);
    if (!running && (replyCount >= 1) && isNewRound && stick >= 2) { done = true; console.log('NEW-SESSION TEXT OK', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'stats=' + stats); break; }
    if (!running && stick >= 6) { console.log('stable, stats=' + stats); break; }
  }
  const lines = await p.evaluate(() => document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean).slice(-10));
  console.log('TAIL:\n' + lines.join('\n'));
  console.log('RESULT newSessionText done=' + done);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
