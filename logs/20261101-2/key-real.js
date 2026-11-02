// 运行时注入 DeepSeek API KEY（仅从 process.env.DSH_TEST_API_KEY 读取，绝不写盘）。
// 目标：设置 → 模型 → DeepSeek(编辑) → 替换 API 密钥 → 保存。
const { chromium } = require('playwright');

(async () => {
  const key = process.env.DSH_TEST_API_KEY;
  if (!key || key.length < 16) { console.error('need DSH_TEST_API_KEY'); process.exit(2); }
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);
  // 打开账号菜单 → 设置
  await p.getByRole('button', { name: /账号菜单/ }).first().click().catch(() => {});
  await p.waitForTimeout(800);
  await p.getByText('设置', { exact: true }).first().click().catch(() => {});
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: '模型', exact: true }).first().click();
  await p.waitForTimeout(900);
  // DeepSeek 已存在 → 点「编辑」
  await p.getByRole('button', { name: '编辑', exact: true }).first().click().catch(() => {});
  await p.waitForTimeout(800);
  // 填密钥（取密码框）
  const pw = p.locator('input[type=password]').first();
  if (await pw.count()) {
    await pw.fill(key);
    const v = await pw.inputValue();
    console.log('key filled len=', v.length, 'head=', v.slice(0, 3));
  } else {
    console.log('WARN: no password input found');
  }
  // 保存
  await p.getByRole('button', { name: '保存', exact: true }).first().click();
  await p.waitForTimeout(1800);
  const out = await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' | ').slice(0, 260));
  console.log('RESULT:', JSON.stringify(out));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
