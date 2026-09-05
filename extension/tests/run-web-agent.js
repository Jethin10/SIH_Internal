"use strict";
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright');
const {chromePath} = require('../scripts/browser-runtime');
const root = path.resolve(__dirname,'..');
async function main() {
  if(!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY in the environment');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'strawhats-web-agent-'));
  const events=[];
  let taskStarted=false;
  let browser;
  try {
    browser=await chromium.launchPersistentContext(profile,{executablePath:chromePath(),headless:false,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1280,height:850}});
    const worker=browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
    const page=await browser.newPage();
    await page.goto(process.env.AGENT_URL || 'https://www.amazon.in/',{waitUntil:'load',timeout:45000});
    const panel=await browser.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).hostname}/sidepanel/index.html`);
    await panel.exposeFunction('agentEvent',e=>{if(e.type==='TASK_STARTED') taskStarted=true; if(!taskStarted) return; events.push(e); if(['ACTION_PROPOSED','TASK_DONE','TASK_ERROR','CONFIRMATION_REQUIRED'].includes(e.type)) console.log(JSON.stringify(e));});
    await panel.evaluate(()=>chrome.runtime.onMessage.addListener(m=>{if(m?.source==='gateway-worker') window.agentEvent({type:m.type,action:m.action?.type,reason:m.result?.reason || m.action?.reason,message:m.message,error:m.error,...(m.type==='CONTEXT'?{page:m.context?.page,elements:m.context?.elements?.slice(0,25).map(e=>({id:e.id,label:e.label,role:e.role,actionable:e.actionable}))}:{})});}));
    await panel.evaluate(async ({provider,userProfile})=>chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{provider,userProfile,policy:{visualEnabled:false,maxSteps:30}}}),{provider:{endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:process.env.AGENT_MODEL || 'gemini-3.6-flash',apiKey:process.env.GEMINI_API_KEY,fallbackApiKeys:JSON.parse(process.env.AGENT_FALLBACK_KEYS || '[]')},userProfile:JSON.parse(process.env.AGENT_PROFILE || '{}')});
    await page.bringToFront();
    await panel.evaluate(async () => {
      const deadline = Date.now()+15000;
      while(Date.now()<deadline) {
        const tabs=await chrome.tabs.query({});
        const target=tabs.find(t=>t.url?.startsWith('https://www.amazon.in/'));
        if(target) try { if(await chrome.tabs.sendMessage(target.id,{type:'PING'},{frameId:0})) return; } catch (_) {}
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      throw new Error('Amazon content script did not become ready');
    });
    const task=process.env.AGENT_TASK || 'Search Amazon India for running shoes under 3000 rupees. Compare two available options using their visible names and prices, then open the better product and summarize why. Do not add to cart or purchase. Stop and explain if login or CAPTCHA blocks you.';
    await panel.locator('#taskInput').fill(task);
    const start=Date.now();
    await panel.locator('#runButton').click();
    while(Date.now()-start<180000 && !events.some(e=>['TASK_DONE','TASK_ERROR','CONFIRMATION_REQUIRED'].includes(e.type))) await new Promise(r=>setTimeout(r,250));
    const report={generatedAt:new Date().toISOString(),platform:process.platform,model:process.env.AGENT_MODEL || 'gemini-2.5-flash',seconds:(Date.now()-start)/1000,url:page.url(),title:await page.title(),events,completed:events.some(e=>e.type==='TASK_DONE'),limitation:'Completion event alone is not a success assertion. Review the final page and model answer.'};
    fs.writeFileSync(path.join(root,'artifacts/web-agent-live.json'),JSON.stringify(report,null,2));
    await page.screenshot({path:path.join(root,'artifacts/web-agent-live.png')});
    console.log(JSON.stringify({completed:report.completed,seconds:report.seconds,url:report.url,title:report.title}));
    if(process.argv.includes('--keep')) {
      await panel.evaluate(async()=>{const tab=await chrome.tabs.getCurrent();await chrome.windows.create({tabId:tab.id,type:'popup',left:1000,top:0,width:470,height:900,focused:true});});
      console.log('Browser left open. Edit the task and run again, or Ctrl+C to close.');
      await new Promise(resolve=>{browser.on('close',resolve);process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
    }
    if(!report.completed) process.exitCode=1;
  } finally {if(browser) await browser.close();fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
