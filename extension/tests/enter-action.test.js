"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../content/content-script.js'), 'utf8');
class Button {
  constructor() { this.clicked = 0; }
  scrollIntoView() {}
  focus() {}
  dispatchEvent() { return true; }
  click() { this.clicked++; }
}
const button = new Button();
const context = {
  pendingMutationRoots: new Set(), mutationTimer: null,
  validateAction: () => ({ok:true,risk:'low'}), actionTarget: () => button,
  records: new Map([['search',{id:'search',label:'Go',role:'button'}]]),
  HTMLButtonElement: Button, HTMLAnchorElement: class {}, HTMLInputElement: class {},
  HTMLTextAreaElement: class {}, KeyboardEvent: class {},
  setTimeout: () => 1, flushMutations() {}, receipt: (action,result) => result
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  async function executeAction('), source.indexOf('  function validateVisualAction(')), context);
(async () => {
  await context.executeAction({type:'press',targetId:'search',key:'Enter'},false);
  assert.equal(button.clicked,1,'Enter must activate a search button, not just dispatch untrusted key events');
  console.log('Enter activates a native button exactly once');
})().catch(error => { console.error(error.message); process.exitCode=1; });
