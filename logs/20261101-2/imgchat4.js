// Android 新会话里挂图并发送：验证图片路径 vs 首会话卡死
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(500);
  // 新会话
  await p.locator('button[class*=newSession]').first().click().catch(() => {});
  await p.waitForTimeout(1500);
  // 挂图
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  await p.locator('input[type=file]').first().setInputFiles(img);
  await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
    sendAria: (() => { const b = document.querySelector('button._07c2Ya_primary'); return b ? (b.getAttribute('aria-label') || '') : ''; })(),
    running: /深度求索中/.test(document.body.innerText),
  }));
  console.log('after attach:', JSON.stringify(st));
  // Enter 发送
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片，描述你看到的形状、颜色和文字');
  await p.waitForTimeout(300);
  await compose.press('Enter');
  await p.waitForTimeout(2500);
  const after = await p.evaluate(() => ({
    composeText: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
  }));
  console.log('after Enter, composeText:', JSON.stringify(after.composeText), 'imgs:', after.imgs);

  let prev = ''; let stick = 0; let done = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    await p.waitForTimeout(5000);
    const running = (await p.locator('button[aria-label="停止生成"],button[aria-label="停止"]').count()) > 0;
    const cur = await p.evaluate(() => document.body.innerText);
    if (cur.length === prev.length) stick++; else stick = 0;
    prev = cur;
    const desc = /ANDROID-2026|红色矩形|蓝色圆形|绿色菱形|绿色三角|黄色矩形|四色|四个.*(图形|形状)|形状与颜色|DSH|整体印象/.test(cur);
    const stats = cur.match(/(\d+) 轮 (\d+) 步/);
    const turn2 = stats && parseInt(stats[1], 10) >= 2;
    if (!running && (desc && turn2) && stick >= 2) { done = true; console.log('IMG-IN-NEW-SESSION OK', ((Date.now() - t0) / 1000).toFixed(0) + 's', stats && stats[0]); break; }
    if (!running && stick >= 6) { console.log('stable'); break; }
  }
  const lines = await p.evaluate(() => document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean));
  const i = lines.findIndex(l => l.includes('分析这张图片'));
  console.log('AFTER:\n' + (i >= 0 ? lines.slice(i, i + 18).join('\n') : lines.slice(-18).join('\n')));
  console.log('RESULT newSessionImg=' + done);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
