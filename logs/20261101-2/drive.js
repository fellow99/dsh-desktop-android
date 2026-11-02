// Android 端 DSH 测试驱动（经 CDP 连接 9223）
const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');

let page;
async function connect() {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  page = b.contexts()[0].pages()[0];
  return b;
}
async function dump(tag) {
  const c = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, input, [contenteditable=true], [role=button]').forEach(el => {
      const t = (el.innerText || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 32);
      const tag = el.tagName.toLowerCase();
      out.push(`${tag}[${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}] "${t}"`);
    });
    return out.slice(0, 40);
  });
  console.log(`\n[${tag}]\n` + c.join('\n'));
  await page.screenshot({ path: path.join(SHOTS, tag + '.png') }).catch(() => {});
}

module.exports = { connect, dump, page: () => page };

async function main() {
  const b = await connect();
  await page.waitForTimeout(1000);
  await dump('05-state');
  await b.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
