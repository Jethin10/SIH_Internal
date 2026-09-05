"use strict";
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../background/service-worker.js'),'utf8');
async function main() {
  const attempts=[];
  const context = {URL,TextEncoder,AbortController,setTimeout,clearTimeout,
    compactPlannerHistory:x=>x,assertEgressSafe:c=>c,PII:{findPII:()=>[]},
    egressByTab:new Map(),sessions:new Map(),updateEgressState(){},broadcast(){},
    ActionPolicy:require('../lib/action-policy.js'),
    fetch:async (_url,request)=>{
      attempts.push(request.headers.Authorization);
      assert(!request.body.includes('fixture-key'),'Keys must not enter planner context');
      return {status:attempts.length===1?429:200,ok:attempts.length>1,
        headers:new Headers({'content-type':'application/json'}),
        text:async()=>JSON.stringify({choices:[{message:{content:'{"type":"done","message":"Ready"}'}}]})};
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function extractJSON('),source.indexOf('function bestElement(')),context);
  const result=await context.remotePlan(1,'Search shoes',{elements:[]},[],{provider:{endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',model:'fixture-model',apiKey:'fixture-key-one',fallbackApiKeys:['fixture-key-two']},userProfile:{}},[]);
  assert.equal(result.type,'done');
  assert.deepEqual(attempts,['Bearer fixture-key-one','Bearer fixture-key-two']);
  const session={tabId:1,origin:'https://www.amazon.in'};
  const boundary={URL,Date,sessions:new Map([[1,session]]),
    assertDomainAllowed:async()=>({status:'loading',url:'https://www.amazon.in/s?k=shoes'}),
    sendFrame:async()=>({ok:true,url:'https://www.amazon.in/s?k=shoes',readyState:'interactive'})};
  vm.createContext(boundary);
  vm.runInContext(source.slice(source.indexOf('async function assertSessionBoundary('),source.indexOf('async function runVisualOperation(')),boundary);
  assert.equal(await boundary.assertSessionBoundary(session,{}),true,'Usable DOM must not wait for late ad requests');
  console.log('Quota fallback keeps keys outside model context; interactive Amazon document is usable');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
