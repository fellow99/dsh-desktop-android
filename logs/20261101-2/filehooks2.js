const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  await p.evaluate(() => {
    window.__frLog = [];
    File.prototype.arrayBuffer = function () {
      window.__frLog.push('arrayBuffer START size=' + this.size);
      return File.prototype.arrayBuffer.__orig.call(this).then(
        (b2) => { window.__frLog.push('arrayBuffer OK bytes=' + b2.byteLength); return b2; },
        (e) => { window.__frLog.push('arrayBuffer ERR ' + e.message); throw e; },
      );
    };
    const fr = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      window.__frLog.push('readAsDataURL START size=' + (blob && blob.size));
      const e = this;
      this.addEventListener('load', () => { window.__frLog.push('readAsDataURL LOAD len=' + String((e.result || '').length)); }, { once: true });
      this.addEventListener('error', (ev) => { window.__frLog.push('readAsDataURL ERR ' + (ev.target && ev.target.error)); }, { once: true });
      return fr.call(this, blob);
    };
    window.__frLog.push('hooks installed');
  });
  await p.locator('input[type=file]').first().setInputFiles(img);
  await p.waitForTimeout(1500);
  const compose = p.locator('[contenteditable=true]').first();
  await compose.click();
  await compose.fill('分析这张图片');
  await p.waitForTimeout(300);
  await compose.press('Enter');
  console.log('Enter pressed at', new Date().toISOString());
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => ({
    logs: window.__frLog || [],
    composeText: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
  }));
  console.log('hooks log:\n' + JSON.stringify(r.logs, null, 1));
  console.log('composeText:', JSON.stringify(r.composeText), 'imgs:', r.imgs);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
