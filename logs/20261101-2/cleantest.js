const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = b.contexts()[0];
  const p = ctx.pages()[0];
  await p.waitForTimeout(500);
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(`[console.error] ${m.text().slice(0, 180)}`); });
  p.on('pageerror', e => errs.push(`[pageerror] ${e.message.slice(0, 180)}`));
  // 干净新会话
  await p.evaluate(() => window.location.reload()).catch(() => {});
  await p.waitForTimeout(4000);
  // 若启动进首会话（P1 风险），再点新会话
  await p.locator('button[class*=newSession]').first().click().catch(() => {});
  await p.waitForTimeout(1800);
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  await p.locator('input[type=file]').first().setInputFiles(img);
  await p.waitForTimeout(2500);
  const pre = await p.evaluate(() => ({
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
    sendAria: (() => { const x = document.querySelector('button._07c2Ya_primary'); return x ? x.getAttribute('aria-label') : ''; })(),
    running: /深度求索中/.test(document.body.innerText),
  }));
  console.log('PRE(one img):', JSON.stringify(pre));
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片');
  await p.waitForTimeout(300);
  await compose.press('Enter');
  await p.waitForTimeout(3000);
  const post = await p.evaluate(() => ({
    composeText: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
    bodyHasMsg: document.body.innerText.includes('分析这张图片'),
  }));
  console.log('POST:', JSON.stringify(post));
  console.log('ERR-EVENTS:\n' + errs.slice(-20).join('\n'));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
