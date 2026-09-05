"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
class Input { constructor(value) { this.value = value; this.type = "password"; } }
class Label { constructor(control) { this.control = control; this.text = "Password"; } }
const context = { HTMLLabelElement: Label, HTMLInputElement: Input, HTMLTextAreaElement: class {}, HTMLSelectElement: class {}, directText: (el) => el.text };
vm.createContext(context);
const source = fs.readFileSync(require.resolve("../content/content-script.js"), "utf8");
vm.runInContext(source.slice(source.indexOf("  function rawValueOf("), source.indexOf("  function taskTokens(")), context);
const input = new Input("swordfish42");
assert.equal(context.rawValueOf(input), "swordfish42", "Private field value must still be inspected");
assert.equal(context.rawValueOf(new Label(input)), "", "Associated public caption is not a private value");
assert.equal(context.rawValueOf(new Label(null)), "Password", "Unassociated text still follows the normal inspection path");
console.log("Public field captions are separated from private control values");
