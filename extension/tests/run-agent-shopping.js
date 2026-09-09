"use strict";
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { chromePath } = require('../scripts/browser-runtime');
const root = path.resolve(__dirname, '..');
const live = process.argv.includes('--live');
const browserUse = process.argv.includes('--browser-use');
const interactive = process.argv.includes('--interactive');
const headed = process.argv.includes('--show') || interactive;
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const {testProfile} = require('../scripts/demo-store');
async function main() {
  if (live && !process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required');
  const events = [], requests = [];
  let browser;
  const bridge = browserUse ? await require('../scripts/browser-use-bridge').startBridge() : null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'strawhats-shopping-'));
  const store = require('../scripts/demo-store').createDemoStore();
  const planner = http.createServer(async (req,res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    try {
      assert(!raw.includes('vault.user@example.com'), 'Raw profile leaked');
      for(const value of Object.values(testProfile)) assert(!raw.includes(value),'Raw profile component leaked');
      assert(!raw.includes('data:image'), 'Screenshot leaked');
      const body = JSON.parse(raw);
      const observation = JSON.parse(body.messages.at(-1).content);
      if (browserUse) observation.context = {...observation,vaultCapabilities:observation.capabilities};
      requests.push({bytes:Buffer.byteLength(raw), path:observation.context.page.path});
      if (live) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`},body:JSON.stringify({...body,model:process.env.AGENT_MODEL || 'openrouter/free',max_tokens:2000,reasoning:{enabled:false},response_format:{type:'json_object'}}),signal:AbortSignal.timeout(140000)});
        const text = await response.text();
        let shape = {};
        try { const d = JSON.parse(text); const c0 = d.choices?.[0] || {}; const m = c0.message || {}; shape = { topKeys: Object.keys(d), choices: d.choices?.length, c0Keys: Object.keys(c0), msgKeys: Object.keys(m), contentLen: (m.content || "").length, reasoningLen: (m.reasoning || "").length, finish: c0.finish_reason || undefined, err: d.error ? JSON.stringify(d.error).slice(0,200) : undefined }; } catch (_) { shape = { parse: "fail", len: text.length }; }
        // Log status plus a short error snippet; planner payloads here use synthetic fixtures only.
        console.log(JSON.stringify({providerStatus:response.status, model:process.env.AGENT_MODEL || 'openrouter/free', shape, errorHead: response.ok ? undefined : text.slice(0, 300)}));
        res.writeHead(response.status, {'Content-Type':'application/json'}).end(text);
        return;
      }
      const context = observation.context;
      const find = text => context.elements.find(e => e.actionable && e.label.toLowerCase().includes(text));
      const action = (type,e,extra={}) => ({type,targetId:e.id,expectedVersion:e.version,...extra});
      let next;
      if (context.page.path === '/cart') {
        const email = context.elements.find(e => e.actionable && ['email','person','phone','address'].includes(e.semanticType) && !e.value);
        if (!email) next = {type:'done',message:'Trail Runner size 9 is in the cart for Rs 2400. Saved contact details are filled. No order placed.'};
        else {
          const cap = context.vaultCapabilities.find(c => c.type === ({email:'EMAIL',person:'PERSON',phone:'PHONE',address:'ADDRESS'})[email.semanticType]);
          next = action('fill',email,{value:cap.token});
        }
      } else if (context.page.path === '/product') {
        const size = find('size');
        next = size.value === '9' ? action('click',find('add to cart')) : action('select',size,{value:'9'});
      } else if (context.page.path === '/results') next = action('click',find('trail runner'));
      else {
        const search = find('search amazon');
        next = search.value ? action('press',search,{key:'Enter'}) : action('fill',search,{value:'running shoes'});
      }
      res.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{content:JSON.stringify(browserUse ? {evaluation_previous_goal:'Review current page',memory:'Follow the task',next_goal:'Continue',action:[{gateway:next}]} : next)}}]}));
    } catch(error) {console.log(JSON.stringify({plannerError:error.message}));res.writeHead(500, {'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
  });
  try {
    const port = await listen(store), plannerPort = await listen(planner);
    browser = await chromium.launchPersistentContext(profile,{executablePath:chromePath(),headless:!headed,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
    const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${port}/`);
    const panel = await browser.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).hostname}/sidepanel/index.html`);
    await panel.exposeFunction('agentEvent',event => {events.push(event);if(['ACTION_PROPOSED','TASK_DONE','TASK_ERROR'].includes(event.type)) console.log(JSON.stringify(event));});
    await panel.evaluate(() => chrome.runtime.onMessage.addListener(m => {if(m?.source==='gateway-worker') window.agentEvent({type:m.type,action:m.action?.type,message:m.message,error:m.error,reason:m.result?.reason});}));
    await panel.evaluate(async ({endpoint,profile}) => chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{provider:{endpoint,model:'agent-shopping',apiKey:''},userProfile:profile,policy:{visualEnabled:false}}}),{endpoint:`http://127.0.0.1:${plannerPort}/v1/chat/completions`,profile:testProfile});
    if (bridge) await panel.evaluate(async agent=>chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{agent}}),{kind:'browser-use',endpoint:bridge.endpoint,token:bridge.token});
    await page.bringToFront();
    if (interactive) {
      await panel.evaluate(async () => {
        await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{provider:{endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'',apiKey:''}}});
        const tab = await chrome.tabs.getCurrent();
        await chrome.windows.create({tabId:tab.id,type:'popup',left:920,top:0,width:480,height:900,focused:true});
      });
      await panel.reload();
      await panel.locator('#settingsPanel').evaluate(el=>el.open=true);
      await panel.locator('#providerPreset').selectOption('gemini');
      await panel.locator('#taskInput').fill('Shop for running shoes under Rs 3000 in size 9. Compare the listed options, add the affordable pair to the cart, fill my email, and stop before placing the order.');
      console.log('Agent ready. In Settings, enter your Gemini model ID and key, then Save. Keep the store tab active and click Run task in the panel. You can edit the task or open other websites. The profile email is synthetic. Ctrl+C closes this disposable browser.');
      await new Promise(resolve=>{browser.on('close',resolve);process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
      return;
    }
    const started = Date.now();
    await panel.locator('#taskInput').fill('Shop for running shoes under Rs 3000 in size 9. Compare the listed options, add the affordable pair to the cart, fill my email, and stop before placing the order.');
    await panel.locator('#runButton').click();
    const deadline = Date.now()+180000;
    while(Date.now()<deadline && !events.some(e=>['TASK_DONE','TASK_ERROR','CONFIRMATION_REQUIRED'].includes(e.type))) await new Promise(r=>setTimeout(r,200));
    assert(events.some(e=>e.type==='TASK_DONE'), 'Agent did not finish: '+JSON.stringify(events.filter(e=>e.error||e.reason).slice(-5)));
    assert.equal(new URL(page.url()).pathname,'/cart');
    assert.equal(await page.locator('#email').inputValue(),'vault.user@example.com');
    for(const [field,value] of Object.entries(testProfile)) assert.equal(await page.locator(`#${field}`).inputValue(),value);
    assert.equal(await page.locator('#notice').innerText(),'Order not submitted');
    const report = {ok:true,mode:live?'real-model':'mock-planner',agent:browserUse?'browser-use/0.13.10':'legacy',model:live?(process.env.AGENT_MODEL||'openrouter/free'):'deterministic test',platform:process.platform,browser:browser.browser()?.version(),seconds:(Date.now()-started)/1000,steps:events.filter(e=>e.type==='ACTION_PROPOSED').map(e=>e.action),requests,privateEmailFilled:true,orderNotSubmitted:true};
    fs.writeFileSync(path.join(root,`artifacts/${browserUse?'browser-use':'agent'}-shopping-${live?'live':'harness'}.json`),JSON.stringify(report,null,2));
    await page.screenshot({path:path.join(root,browserUse?'artifacts/browser-use-shopping.png':'artifacts/agent-shopping.png')});
    console.log(JSON.stringify(report,null,2));
  } finally {if(bridge) bridge.close(); if(browser) await browser.close();store.close();planner.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
