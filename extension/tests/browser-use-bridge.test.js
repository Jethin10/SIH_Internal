"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {startBridge}=require("../scripts/browser-use-bridge");
const Protocol=require("../lib/agent-protocol");
const Client=require("../lib/browser-use-client");
async function main(){
  for(const [file,schema] of [["observation",Protocol.observationSchema],["action",require("../lib/action-policy").responseSchema]]){
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname,`../../adapters/browser-use/${file}.schema.json`))),schema,"Python contract must match JS core");
  }
  assert.throws(()=>Client.endpoint("https://elsewhere.test/"));
  assert.throws(()=>Client.inspectModelRequest({messages:[{role:"system",content:[]},{role:"user",content:"test"}],responseSchema:{}},[]));
  const bridge=await startBridge();
  const headers={Authorization:`Bearer ${bridge.token}`,"Content-Type":"application/json"};
  const request=(route,body,extra={})=>fetch(bridge.endpoint+route,{method:"POST",headers:{...headers,...extra},body:JSON.stringify(body)});
  const observation=Protocol.createObservation({sessionId:"session",observationId:"one",safeTask:"Read products",context:{page:{},elements:[],metrics:{graphComplete:true,topFrameObserved:true,pendingScanNodes:0}}}).observation;
  try{
    assert.equal((await fetch(bridge.endpoint+"/health")).status,401);
    assert.equal((await request("/prepare",observation,{Origin:"https://attacker.test"})).status,403);
    // fetch forbids spoofing the Host header, so loopback binding is asserted
    // on the endpoint itself; the Origin check above is the web boundary.
    assert.match(bridge.endpoint,/^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await request("/prepare",{...observation,rawDOM:"private"})).status,400);
    const prepared=await (await request("/prepare",observation)).json();
    assert.equal(prepared.engine,"browser-use/0.13.10");
    Client.inspectModelRequest(prepared.modelRequest,[]);
    assert.equal(JSON.parse(prepared.modelRequest.messages[1].content).safeTask,"Read products");
    const completion={jobId:prepared.jobId,sessionId:"session",observationId:"one",modelOutput:{evaluation_previous_goal:"Ready",memory:"",next_goal:"Finish",action:[{gateway:{type:"done",message:"No products visible"}}]}};
    const result=await request("/complete",completion);
    assert.equal(result.status,200);
    assert.equal(Protocol.acceptProposal(await result.json(),observation).type,"done");
    assert.equal((await request("/complete",completion)).status,400,"Completed jobs cannot replay");
    const second=await (await request("/prepare",observation)).json();
    assert.equal((await request("/complete",{...completion,jobId:second.jobId,sessionId:"wrong"})).status,400);
    const third=await (await request("/prepare",observation)).json();
    await request("/cancel",{jobId:third.jobId});
    assert.equal((await request("/complete",{...completion,jobId:third.jobId})).status,400);
    console.log("Actual Browser Use bridge: authentication, origin/host, schema, native planner, binding, replay and cancellation passed");
  }finally{bridge.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
