const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(500);
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(`[console.err] ${m.text().slice(0,160)}`); });
  p.on('requestfailed', r => errs.push(`[reqfail] ${r.url().slice(0,90)} ${r.failure()?.errorText}`));

  // 确认 composer 里的图
  const imgs0 = await p.evaluate(() => [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length);
  console.log('composer imgs before:', imgs0);
  // 把文本换成图片分析提问
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片，描述你看到的形状、颜色和文字');
  await p.waitForTimeout(300);
  // 发送按钮（composer primary；有内容时是发送）
  const sendSel = 'button._07c2Ya_primary';
  const aria = await p.locator(sendSel).first().getAttribute('aria-label').catch(() => 'none');
  console.log('send btn aria-label:', aria);
  await p.locator(sendSel).first().click().catch(async () => { await p.keyboard.press('Control+Enter'); });
  await p.waitForTimeout(1500);
  // 校验：composer 文本是否清空（=真正发送）
  const after = await p.evaluate(() => ({
    composeText: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
    composeImgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
  }));
  console.log('after send -> composeText:', JSON.stringify(after.composeText), 'composeImgs:', after.composeImgs);

  let prev = ''; let stick = 0; let done = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await p.waitForTimeout(5000);
    const running = (await p.locator('button[aria-label="停止生成"],button[aria-label="停止"]').count()) > 0;
    const cur = await p.evaluate(() => document.body.innerText);
    if (cur.length === prev.length) stick++; else stick = 0;
    prev = cur;
    // 判定：出现对图形的描述（排除 composer 里那段用户文本）
    const desc = /ANDROID-2026|红色矩形|蓝色圆形|绿色菱形|绿色三角|黄色矩形|四个.*图形|形状与颜色|整体印象/.test(cur);
    const statsNew = /1 轮 2 步|2 轮|2 轮/.test(cur);
    if (!running && desc && stick >= 2) { done = true; console.log('IMG-REPLY-OK', ((Date.now() - t0) / 1000).toFixed(0) + 's'); break; }
    if (!running && stick >= 6) { console.log('stable no-desc'); break; }
  }
  const lines = await p.evaluate(() => document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean));
  const i = lines.findIndex(l => l.includes('分析这张图片'));
  console.log('AFTER-MSG:\n' + lines.slice(i, i + 18).join('\n'));
  console.log('ERR-EVENTS:\n' + errs.slice(-12).join('\n'));
  console.log('RESULT imgDone=' + done);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
