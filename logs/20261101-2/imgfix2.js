const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  // 关设置
  await p.getByRole('button', { name: '关闭', exact: true }).first().click().catch(() => {});
  await p.waitForTimeout(700);
  // 新会话（避开 P1 首会话卡死：第 2 会话正常）
  await p.locator('button[class*=newSession]').first().click();
  await p.waitForTimeout(2500);
  const model = await p.evaluate(() => document.body.innerText.includes('DeepSeek-V4.1-Flash'));
  console.log('model selectable:', model);
  // 挂图
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  await p.locator('input[type=file]').first().setInputFiles(img);
  await p.waitForTimeout(2200);
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
  await p.waitForTimeout(9000);
  const post = await p.evaluate(() => ({
    composeText: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
    running: /深度求索中/.test(document.body.innerText),
    body: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 260),
  }));
  console.log('POST:', JSON.stringify(post, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
