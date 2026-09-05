"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../lib/action-policy.js');
for (const url of ['javascript:alert(1)', 'file:///C:/secret', 'https://user:pass@example.com', 'garbage']) {
  assert.equal(policy.validate({type:'navigate', url}).ok, false, url);
}
assert.equal(policy.validate({type:'navigate', url:'https://example.com/'}).ok, true);
const source = fs.readFileSync(require.resolve('../background/service-worker.js'), 'utf8');
const context = { URL };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function taskAllowsAction('), source.indexOf('async function runSession(')), context);
assert.equal(context.taskAllowsAction('Open https://example.com/ and search shoes', {type:'navigate',url:'https://example.com/'}), true);
assert.equal(context.taskAllowsAction('Open https://example.com/', {type:'navigate',url:'https://evil.example/steal'}), false);
assert.equal(context.taskAllowsAction('Read this page', {type:'navigate',url:'https://example.com/steal'}), false);
assert.equal(context.taskAllowsAction('Open https://example.com/', {type:'navigate',url:'https://example.com/?secret=value'}), false);
console.log('Navigation URL validation and task scope passed');
