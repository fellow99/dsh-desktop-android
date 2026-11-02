// 连接 Android 端 DSH WebView CDP 并探测 UI
const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  await page.waitForTimeout(1500);
  console.log('title:', await page.title());
  const inf = await page.evaluate(() => ({
    url: location.href,
    text: document.body ? document.body.innerText.slice(0, 600) : '(no body)',
  }));
  console.log('URL:', inf.url);
  console.log('BODY:', inf.text.slice(0, 500));
  const ctrl = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, input, [contenteditable=true], [role=button]').forEach(el => {
      const t = (el.innerText || el.getAttribute('placeholder') || '').trim().replace(/\s+/g,' ').slice(0,30);
      const tag = el.tagName.toLowerCase();
      out.push(`${tag}[${el.className && typeof el.className==='string' ? '.'+el.className.split(' ')[0] : ''}] "${t}"`);
    });
    return out.slice(0, 30);
  });
  console.log('CONTROLS:\n' + ctrl.join('\n'));
  await page.screenshot({ path: path.join(SHOTS, '03-device-ui.png') }).catch(e=>console.log('shot err', e.message));
  await browser.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
