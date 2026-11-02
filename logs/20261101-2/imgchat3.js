const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(300);
  // 新会话（干净）
  await p.locator('button.jy-7YG_newSession, button[class*=newSession]').first().click().catch(() => {});
  await p.waitForTimeout(1500);
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  await p.locator('input[type=file]').first().setInputFiles(img);
  console.log('attached; waiting for prep...');
  // 轮询附件就绪状态 25s
  let ready = false;
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(4000);
    const st = await p.evaluate(() => ({
      imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
      pending: /上传中|准备|处理中|读取|pending/i.test((document.querySelector('[class*=composer],[class*=Composer]') || {}).innerText || ''),
      sendAria: (() => { const b = document.querySelector('button._07c2Ya_primary'); return b ? (b.getAttribute('aria-label') || b.innerText) : 'none'; })(),
    }));
    console.log(`  [prep ${((i + 1) * 4)}s]`, JSON.stringify(st));
    if (st.imgs >= 1 && !st.pending && /发送/.test(st.sendAria)) { ready = true; break; }
  }
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片，描述你看到的形状、颜色和文字');
  await p.waitForTimeout(300);
  // 用发送按钮发送
  await p.locator('button._07c2Ya_primary').first().click().catch(async () => { await compose.press('Enter'); });
  await p.waitForTimeout(1500);
  const sent = await p.evaluate(() => (document.querySelector('[contenteditable=true]') || {}).innerText || '');
  console.log('after send, composeText remaining:', JSON.stringify(sent.slice(0, 30)), '| ready was:', ready);

  let prev = ''; let stick = 0; let done = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await p.waitForTimeout(5000);
    const running = (await p.locator('button[aria-label="停止生成"],button[aria-label="停止"]').count()) > 0;
    const cur = await p.evaluate(() => document.body.innerText);
    if (cur.length === prev.length) stick++; else stick = 0;
    prev = cur;
    const desc = /ANDROID-2026|红色矩形|蓝色圆形|绿色菱形|绿色三角|黄色矩形|四色|四个.*(图形|形状)|形状与颜色|整体印象/.test(cur);
    if (!running && desc && stick >= 2) { done = true; console.log('IMG-REPLY-OK', ((Date.now() - t0) / 1000).toFixed(0) + 's'); break; }
    if (!running && stick >= 6) { console.log('stable no-desc'); break; }
  }
  const lines = await p.evaluate(() => document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean));
  const i = lines.findIndex(l => l.includes('分析这张图片'));
  console.log('AFTER-MSG:\n' + lines.slice(i, i + 16).join('\n'));
  console.log('RESULT imgDone=' + done);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
