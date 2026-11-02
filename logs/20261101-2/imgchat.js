const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  const fi = p.locator('input[type=file]').first();
  const winpath = path.join(SHOTS, 'test-image.png').replace(/\\/g, '/');
  await fi.setInputFiles(winpath);
  await p.waitForTimeout(1800);
  const imgs = await p.evaluate(() => [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length);
  console.log('composer images:', imgs);
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片，描述你看到的形状、颜色和文字');
  await p.waitForTimeout(300);
  await compose.press('Enter');
  console.log('sent img ask at', new Date().toISOString());
  let prev = ''; let stick = 0; let done = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await p.waitForTimeout(5000);
    const running = (await p.locator('button[aria-label="停止生成"],button[aria-label="停止"]').count()) > 0;
    const cur = await p.evaluate(() => document.body.innerText);
    if (cur.length === prev.length) stick++; else stick = 0;
    prev = cur;
    const desc = /ANDROID-2026|DSH|红色|蓝色|绿色|黄色|圆形|菱形|矩形|形状/.test(cur);
    if (!running && desc && stick >= 2) { done = true; console.log('IMAGE REPLY OK', ((Date.now() - t0) / 1000).toFixed(0) + 's'); break; }
    if (!running && stick >= 5) { console.log('stable'); done = true; break; }
  }
  const tail = await p.evaluate(() => document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean).slice(-22).join('\n'));
  console.log('TAIL:\n' + tail);
  await p.screenshot({ path: path.join(SHOTS, '10-img.png') }).catch(() => {});
  console.log('RESULT img done=' + done);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
