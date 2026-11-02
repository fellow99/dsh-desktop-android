const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(400);

  // 找 composer 里附件卡片上的移除按钮
  const rm = await p.evaluate(() => {
    // 附件卡通常有 close/x 按钮
    const comp = document.querySelector('[class*=composer],[class*=Composer]');
    if (!comp) return 'no-composer';
    const closeBtns = [...comp.querySelectorAll('button, [role=button]')].filter(b => {
      const svg = b.querySelector('svg');
      const labs = (b.getAttribute('aria-label')||'')+(b.getAttribute('title')||'');
      const cls = typeof b.className === 'string' ? b.className : '';
      return /remove|delete|close|关闭|移除|删除/i.test(labs + cls) || (svg && /\bM6.?L18.?|x|x\b/i.test(cls));
    }).map(b => b.className.split(' ')[0]);
    return closeBtns;
  });
  console.log('candidate remove buttons:', JSON.stringify(rm));

  // 尝试点击第一个可能是移除的按钮
  let removed = false;
  for (const cls of rm) {
    const btn = p.locator(`[class*=composer],[class*=Composer] button.${cls}`).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await p.waitForTimeout(800);
      const imgs = await p.evaluate(() => [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length);
      console.log(`after clicking .${cls}: composerImgs=`, imgs);
      if (imgs === 0) { removed = true; break; }
    }
  }
  if (!removed) {
    // 兜底：Escane 或点击不同区域
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
  }
  const compState = await p.evaluate(() => ({
    imgs: [...document.querySelectorAll('[class*=composer] img,[class*=Composer] img')].length,
    text: (document.querySelector('[contenteditable=true]') || {}).innerText || '',
  }));
  console.log('after removal attempt ->', JSON.stringify(compState));

  // 现在发纯文本
  if (compState.imgs === 0) {
    const compose = p.locator('[contenteditable=true]').first();
    await compose.click();
    await compose.fill('你好，请用一句话回复：收到。');
    await p.waitForTimeout(300);
    await compose.press('Enter');
    console.log('sent text after image removal at', new Date().toISOString());
    let prev=''; let stick=0; let done=false;
    const t0=Date.now();
    while (Date.now()-t0 < 90000){
      await p.waitForTimeout(4000);
      const running=(await p.locator('button[aria-label="停止生成"],button[aria-label="停止"]').count())>0;
      const cur=await p.evaluate(()=>document.body.innerText);
      if(cur.length===prev.length) stick++; else stick=0;
      prev=cur;
      // 判定真正回复：统计“轮”变成 2，或出现多个“收到。”（排除用户行）
      const stats=cur.match(/(\d+) 轮 (\d+) 步/);
      const turn2= stats && parseInt(stats[1],10)>=2;
      const replyCount=(cur.match(/收到。/g)||[]).length;
      if (!running && (turn2 || replyCount>=2) && stick>=2){ done=true; console.log('TEXT(turn2) OK', ((Date.now()-t0)/1000).toFixed(0)+'s', 'stats=',stats?stats[0]:''); break; }
      if(!running && stick>=6){ console.log('stable'); break; }
    }
    const lines=await p.evaluate(()=>document.body.innerText.split('\n').map(x=>x.trim()).filter(Boolean).slice(-10));
    console.log('TAIL:\n'+lines.join('\n'));
    console.log('RESULT turn2 done='+done);
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
