// CDP helper for the dsh WebView (evidence capture; not shipped)
// uses Node's global WebSocket (v22+)
import { writeFileSync } from 'node:fs'

const TARGET = process.env.CDP_WS || 'ws://127.0.0.1:9222/devtools/page/5688AAF7A8F319D5F3699D78434B9FF1'
const cmd = process.argv[2]
const arg = process.argv[3]

const ws = new WebSocket(TARGET)
let id = 0
const pending = new Map()

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout ' + method)) } }, 25000)
  })
}

ws.onopen = async () => {
  await call('Page.enable'); await call('Runtime.enable')
  try {
    if (cmd === 'shot') {
      const { data } = await call('Page.captureScreenshot', { format: 'png' })
      writeFileSync(arg, Buffer.from(data, 'base64'))
      console.log('saved', arg)
    } else if (cmd === 'eval') {
      const { result, exceptionDetails } = await call('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true })
      if (exceptionDetails) console.log('EXC', JSON.stringify(exceptionDetails.exception?.description || exceptionDetails.text))
      console.log(typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2))
    } else if (cmd === 'click') {
      const js = `(()=>{const els=[...document.querySelectorAll('button, [role=button], input[type=submit], .d-button')];
        const target=els.find(e=>(e.innerText||'').trim().toLowerCase()===${JSON.stringify(String(arg).toLowerCase())})||els.find(e=>(e.textContent||'').trim().toLowerCase().includes(${JSON.stringify(String(arg).toLowerCase())})&&(e.innerText||'').trim().length<40);
        if(!target) return 'NOT_FOUND:'+els.map(e=>(e.innerText||'').trim().slice(0,20)).join('|');
        target.click(); return 'CLICKED:'+target.innerText.trim();})()`
      const { result } = await call('Runtime.evaluate', { expression: js, returnByValue: true })
      console.log(result.value)
    } else if (cmd === 'type') {
      const js = `(()=>{const els=[...document.querySelectorAll('input,textarea,[contenteditable=true]')];
        const el=els.find(e=>(e.placeholder||'').toLowerCase().includes(${JSON.stringify(String(arg[0]).toLowerCase())}))||els[els.length-1];
        if(!el) return 'NO_INPUT';
        const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')||Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');
        const native=setter&&setter.set;
        const txt=${JSON.stringify(String(arg[1]))};
        if(native) native.call(el,txt); else el.value=txt;
        el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
        return 'TYPED:'+el.tagName;})()`
      const { result } = await call('Runtime.evaluate', { expression: js, returnByValue: true })
      console.log(result.value)
    } else if (cmd === 'enter') {
      const js = `(()=>{const el=[...document.querySelectorAll('textarea,[contenteditable=true]')].pop(); if(!el) return 'NO_INPUT';
        el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
        el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true,cancelable:true})); return 'ENTER';})()`
      const { result } = await call('Runtime.evaluate', { expression: js, returnByValue: true })
      console.log(result.value)
    } else if (cmd === 'dom') {
      const js = `JSON.stringify({url:location.href,title:document.title,body:(document.body.innerText||'').slice(0,1500),
        btns:[...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,80),
        inputs:[...document.querySelectorAll('input,textarea')].map(i=>({type:i.type||'',ph:i.placeholder||'',len:(i.value||'').length})).slice(0,30),
        links:[...document.querySelectorAll('a')].map(a=>(a.innerText||'').trim()).filter(Boolean).slice(0,30)})`
      const { result } = await call('Runtime.evaluate', { expression: js, returnByValue: true })
      console.log(result.value)
    }
  } catch (e) {
    console.error('CMD error', e.message)
  }
  process.exit(0)
}
ws.onerror = (e) => { console.error('WS error', e.message || e); process.exit(1) }
ws.onmessage = (event) => {
  const msg = JSON.parse(String(event.data))
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id)
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
  }
}
