// 图片分析对话：分析这张图片（验证 image.normalize 修复 + 真 key 全链路）
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  await p.locator('button[class*=newSession]').first().click().catch(() => {});
  await p.waitForTimeout(2000);
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  await p.locator('input[type=file]').first().setInputFiles(img);
  await p.waitForTimeout(2200);
  const pre = await p.evaluate(() => [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length);
  console.log('ATTACHED imgs=', pre);
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片');
  await p.waitForTimeout(400);
  await compose.press('Enter');
  console.log('SENT 图片问题 at', new Date().toISOString());
  let finalBody = '';
  let done = false;
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(3000);
    const st = await p.evaluate(() => ({ running: /深度求索中/.test(document.body.innerText), t: document.body.innerText.slice(-200) }));
    finalBody = st.t;
    if (/已完成|出错|失败/.test(finalBody) && !st.running && finalBody.includes('分析')) { done = true; break; }
    if (i % 10 === 0) console.log(`  t+${(i + 1) * 3}s running=${st.running}`);
  }
  console.log('DONE:', done);
  console.log('FINAL:', JSON.stringify(finalBody.slice(-450)));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
