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
    PrivacyEgress:require('../lib/privacy-egress.js'),
    fetch:async (_url,request)=>{
      attempts.push(request.headers.Authorization);
      assert.equal(request.redirect, 'error', 'Provider requests must reject redirects');
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
  context.StrawHatsAgentRuntime = { tuneProviderBody: (_endpoint, body) => ({...body, injected: 'fixture-key-one'}) };
  await assert.rejects(context.remotePlan(1,'Search shoes',{elements:[]},[],{provider:{endpoint:'https://example.test/chat',model:'fixture-model',apiKey:'fixture-key-one'},userProfile:{}},[]), /egress inspection/);
  assert.equal(attempts.length, 2, 'Provider transformations must be inspected before fetch');
  delete context.StrawHatsAgentRuntime;

  let redirectedRequests = 0;
  const server = require('node:http').createServer((request, response) => {
    if (request.url === '/redirected') { redirectedRequests++; response.end('{}'); }
    else { response.writeHead(307, { Location: '/redirected' }); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    context.fetch = fetch;
    await assert.rejects(context.remotePlan(1,'Search shoes',{elements:[]},[],{provider:{endpoint:`http://127.0.0.1:${server.address().port}/start`,model:'fixture-model',apiKey:''},userProfile:{}},[]), /fetch failed/);
    assert.equal(redirectedRequests, 0, 'A redirect must not receive the checked provider body');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
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
