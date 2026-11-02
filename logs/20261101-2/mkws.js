// 在沙箱中创建一个测试目录作为工作区
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /添加工作区/ }).first().click();
  await p.waitForTimeout(1600);
  // 进入 沙箱
  await p.evaluate(() => { const el = [...document.querySelectorAll('div,span,button')].find(x => (x.innerText || '').trim() === '沙箱' && x.children.length === 0); if (el) el.click(); });
  await p.waitForTimeout(1000);
  // 新建文件夹
  await p.getByRole('button', { name: '新建文件夹' }).first().click().catch(async () => { await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText === '新建文件夹'); if (b) b.click(); }); });
  await p.waitForTimeout(900);
  // 找一个输入框输入目录名
  const inp = p.locator('input:visible').last();
  await inp.fill('ws-cap-test').catch(async () => { await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => x.offsetParent); if (i) i.value = 'ws-cap-test'; }); });
  await p.waitForTimeout(300);
  // 确认（确定/创建）
  await p.getByRole('button', { name: /确定|创建|完成/ }).first().click().catch(() => {});
  await p.waitForTimeout(1200);
  // 选中该目录并「打开」
  await p.evaluate(() => { const el = [...document.querySelectorAll('div,span,button')].find(x => (x.innerText || '').trim() === 'ws-cap-test' && x.children.length === 0); if (el) el.click(); });
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: '打开' }).first().click().catch(() => {});
  await p.waitForTimeout(2000);
  const out = await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 220));
  console.log('AFTER:', JSON.stringify(out));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
