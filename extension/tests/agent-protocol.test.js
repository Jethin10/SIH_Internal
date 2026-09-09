"use strict";
const assert = require("node:assert/strict");
const Protocol = require("../lib/agent-protocol.js");
const context = {page:{origin:"https://store.test",path:"/",epoch:1},elements:[{id:"e_test",version:1,role:"button",label:"Search",actionable:true}],vaultCapabilities:[],metrics:{graphComplete:true,pendingScanNodes:0,topFrameObserved:true}};
const input = {sessionId:"session",observationId:"observation",safeTask:"Search shoes",context};
const {observation, serialized} = Protocol.createObservation(input);
assert.equal(JSON.stringify(observation), serialized);
const proposal = {protocolVersion:1,sessionId:"session",observationId:"observation",action:{type:"click",targetId:"e_test",expectedVersion:1}};
assert.equal(Protocol.acceptProposal(proposal,observation).type,"click");
for(const patch of [{observationId:"old"},{sessionId:"other"},{rawDOM:"<html>private</html>"},{action:{...proposal.action,targetId:"e_unknown"}},{action:{...proposal.action,expectedVersion:2}},{action:{type:"evaluate",script:"document.body"}}]) {
  assert.throws(()=>Protocol.acceptProposal({...proposal,...patch},observation));
}
assert.throws(()=>Protocol.createObservation({...input,context:{...context,metrics:{graphComplete:false}}}),/NOT_READY/);
assert.throws(()=>Protocol.createObservation({...input,safeTask:"person@example.com"}),/PII/);
assert.throws(()=>Protocol.createObservation({...input,safeTask:"secret-phrase",knownValues:["secret-phrase"]}),/PRIVATE/);
assert.throws(()=>Protocol.serialize({...observation,screenshot:"data:image/png;base64,x"},Protocol.observationSchema,[]),/UNKNOWN_FIELD/);
assert.throws(()=>Protocol.serialize({...observation,safeTask:"漢".repeat(8000)},Protocol.observationSchema,[]),/BYTE_LIMIT/);
assert.throws(()=>Protocol.createObservation({...input,context:{...context,elements:[{...context.elements[0],label:'<input value="secret">'}]}}),/RAW_CONTENT/);
const local = {...context,localPreview:[{raw:"secret"}],egressInventory:[{value:"secret"}],page:{...context.page,cookies:"secret"}};
assert(!Protocol.createObservation({...input,context:local}).serialized.includes("secret"));
for (const adapter of [async o=>({...proposal,sessionId:o.sessionId}),async o=>({...proposal,observationId:o.observationId})]) {
  adapter(observation).then(p=>assert.equal(Protocol.acceptProposal(p,observation).type,"click"));
}
console.log("Agent protocol allowlists, privacy checks, budget, completeness and target binding passed");
