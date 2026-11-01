// Minimal WebView CDP client: eval JS in page (authenticated) or click by text via real mouse events.
// Usage:
//   node cdp.mjs eval '<js expression>'
//   node cdp.mjs click '<exact text>'
//   node cdp.mjs clickxy <x> <y>
const WS = process.argv[2] || 'ws://127.0.0.1:9222/devtools/page/26781D1D23171CE8C622EC4973639D9B';
const cmd = process.argv[3];
const arg = process.argv.slice(4).join(' ');

const ws = new WebSocket(WS);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }
});
function evalJS(expr) {
  return send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    .then((r) => {
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    });
}
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
ws.addEventListener('open', async () => {
  try {
    await send('Runtime.enable');
    await send('Page.enable').catch(() => {});
    if (cmd === 'eval') {
      const v = await evalJS(arg);
      console.log(typeof v === 'string' ? v : JSON.stringify(v));
    } else if (cmd === 'click') {
      const rect = await evalJS(`(() => {
        const t = ${JSON.stringify(arg)};
        const els = [...document.querySelectorAll('button,a,div,span,li')];
        const hit = els.filter(e => (e.textContent||'').trim() === t).sort((a,b)=>a.textContent.length-b.textContent.length)[0]
          || els.filter(e => (e.textContent||'').includes(t)).sort((a,b)=>a.textContent.length-b.textContent.length)[0];
        if (!hit) return null;
        const r = hit.getBoundingClientRect();
        return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), tw: hit.textContent.length };
      })()`);
      if (!rect) { console.log('NOT_FOUND'); }
      else { await clickAt(rect.x, rect.y); console.log('CLICKED', JSON.stringify(rect)); }
    } else if (cmd === 'clickxy') {
      const [x, y] = arg.split(/\s+/).map(Number);
      await clickAt(x, y);
      console.log('CLICKED_XY', x, y);
    } else if (cmd === 'compose') {
      // Focus the composer (textarea/contenteditable) by aria-label prefix, insert real text, click send.
      const prefix = '发消息或创建任务';
      const rect = await evalJS(`(() => { const e=[...document.querySelectorAll('[aria-label]')].find(x=>(x.getAttribute('aria-label')||'').startsWith(${JSON.stringify(prefix)})); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; })()`);
      if (!rect) { console.log('NO_COMPOSER'); }
      else {
        await clickAt(rect.x, rect.y);
        await new Promise(r => setTimeout(r, 300));
        await send('Input.insertText', { text: arg });
        await new Promise(r => setTimeout(r, 300));
        const srect = await evalJS(`(() => { const e=document.querySelector('[aria-label="发送消息"]'); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), dis: e.disabled===true}; })()`);
        if (!srect) { console.log('NO_SEND'); }
        else { await clickAt(srect.x, srect.y); console.log('COMPOSED_AND_SENT dis='+srect.dis); }
      }
    } else {
      console.log('unknown cmd');
    }
  } catch (e) {
    console.error('ERR', e.message);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
});
ws.addEventListener('error', (e) => { console.error('WS_ERR', e.message); process.exitCode = 1; });
