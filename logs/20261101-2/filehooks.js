const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  const img = path.join(__dirname, 'shots', 'test-image.png').replace(/\\/g, '/');
  // 注入钩子：跟踪 FileReader.readAsDataURL / File.arrayBuffer 完成情况
  await p.evaluate(() => {
    window.__frLog = [];
    const orig = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      window.__frLog.push('readAsDataURL START size=' + (blob && blob.size) + ' type=' + (blob && blob.type));
      const e = this;
      this.addEventListener('load', () => { window.__frLog.push('readAsDataURL LOAD len=' + String(e.result && e.result.length)); }, { once: true });
      this.addEventListener('error', (ev) => { window.__frLog.push('readAsDataURL ERROR ' + (ev.target && ev.target.error)); }, { once: true });
      return orig.call(this, blob);
    };
    const oArr = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      window.__frLog.push('arrayBuffer START size=' + this.size);
      return oArr.call(this).then(
        (b2) => { window.__frLog.push('arrayBuffer OK bytes=' + b2.byteLength); return b2; },
        (e) => { window.__frLog.push('arrayBuffer ERR ' + e.message); throw e; },
      );
    };
    window.__frLog.push('hooks installed');
  });
  await p.locator('input[type=file]').first().setInputFiles(img);
  console.log('attached; waiting 4s');
  await p.waitForTimeout(4000);
  const logs = await p.evaluate(() => window.__frLog || []);
  console.log('File hooks log:\n' + JSON.stringify(logs, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
