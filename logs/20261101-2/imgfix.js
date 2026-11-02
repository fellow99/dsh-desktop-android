const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(800);
  // 若在 onboarding/welcome，尝试进入
  const body = await p.evaluate(() => document.body.innerText.slice(0, 200));
  console.log('BODY head:', JSON.stringify(body));
  // 新会话（避开 P1 首会话卡死：第 2 会话正常）
  const newBtn = p.locator('button[class*=newSession]').first();
  if (await newBtn.count()) { await newBtn.click(); }
  await p.waitForTimeout(3000);
  // 注入桥调用成功与否的旁路观测：监听 console
  p.on('console', m => { const t = m.text(); if (/error|fail|normalize/i.test(t)) console.log('[page]', m.type(), t.slice(0, 160)); });
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  await p.locator('input[type=file]').first().setInputFiles(img);
  await p.waitForTimeout(2000);
  const pre = await p.evaluate(() => ({
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
  }));
  console.log('PRE imgs:', pre.imgs);
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片');
  await p.waitForTimeout(400);
  await compose.press('Enter');
  console.log('Enter at', new Date().toISOString());
  await p.waitForTimeout(6000);
  const post = await p.evaluate(() => ({
    composeText: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
    running: /深度求索中/.test(document.body.innerText),
    hasUserMsg: document.body.innerText.includes('分析这张图片'),
  }));
  console.log('POST:', JSON.stringify(post));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
