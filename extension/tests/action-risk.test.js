const assert = require("assert");
const risk = require("../lib/action-risk.js");

const of = (input) => risk.classify(input).risk;
const click = (label, extra = {}) => of({ actionType: "click", label, ...extra });
const fill = (label, extra = {}) => of({ actionType: "fill", label, ...extra });
const submitIn = (formText, extra = {}) => ({ isSubmitControl: true, inForm: true, formText, ...extra });

// Amazon's entry interstitial puts "Continue shopping" in a form as a submit
// button. It only navigates, so it must not be treated as an order submission.
assert.strictEqual(click("Continue shopping", submitIn("/ref=cs_503_link Continue shopping")), "low");
assert.strictEqual(click("Keep shopping", submitIn("Keep shopping")), "low");
assert.strictEqual(click("Go to homepage", submitIn("")), "low");

// The real purchase controls stay gated, by their own name rather than by the
// accident of sitting inside a form. "Place your order" is the live Amazon label
// and the older "place order" pattern did not match it.
assert.strictEqual(click("Place your order", submitIn("Order summary Place your order")), "critical");
assert.strictEqual(click("Place order"), "critical");
assert.strictEqual(click("Buy Now", submitIn("Add to Cart Buy Now")), "critical");
assert.strictEqual(click("Pay now"), "critical");
assert.strictEqual(click("Complete purchase"), "critical");
assert.strictEqual(click("Confirm and pay"), "critical");
assert.strictEqual(click("Submit order"), "critical");
assert.strictEqual(click("Pay ₹2400"), "critical");
// An unnamed control that submits a form holding a payment instrument is a
// purchase whatever the button says.
assert.strictEqual(click("Continue", submitIn("Card number CVV Expiry", { formHasPaymentField: true })), "critical");

// Ordinary shopping progress runs unattended.
assert.strictEqual(click("Add to Cart", submitIn("Add to Cart Buy Now Secure transaction")), "medium");
assert.strictEqual(click("9", submitIn("Size 8 9 10 Add to Cart")), "low");
assert.strictEqual(click("Trail Runner Rs 2400"), "low");
assert.strictEqual(click("Go", submitIn("Search Amazon.in Go", { formIsSearch: true })), "low");
assert.strictEqual(click("", submitIn("Search", { formIsSearch: true })), "low");
assert.strictEqual(click("Submit search", submitIn("Search", { formIsSearch: true })), "low");

// Consequential but non-financial steps are gated, and are the only tier a user
// can delegate in advance.
assert.strictEqual(click("Delete account", submitIn("")), "high");
assert.strictEqual(click("Sign in", submitIn("")), "high");
assert.strictEqual(click("Proceed to checkout", submitIn("Subtotal Proceed to checkout")), "high");
assert.strictEqual(click("Use this address", submitIn("Deliver to this address")), "high");
assert.strictEqual(click("Continue", submitIn("Full name Address line 1 City")), "high");

// Field fills. An Indian postal code is labelled PIN and must stay fillable.
assert.strictEqual(fill("Card number"), "critical");
assert.strictEqual(fill("CVV"), "critical");
assert.strictEqual(fill("One-time password"), "critical");
assert.strictEqual(fill("Login", { semanticType: "password" }), "critical");
assert.strictEqual(fill("PIN code", { semanticType: "address", sensitivity: "personal" }), "medium");
assert.strictEqual(fill("Email", { semanticType: "email", sensitivity: "personal" }), "medium");
assert.strictEqual(fill("Email", { semanticType: "email", sensitivity: "personal", alwaysConfirmSensitiveFill: true }), "high");
assert.strictEqual(fill("Search products", { sensitivity: "none" }), "low");

// Non-committal actions.
assert.strictEqual(of({ actionType: "scroll" }), "low");
assert.strictEqual(of({ actionType: "press", label: "Place your order", key: "ArrowDown" }), "low");
assert.strictEqual(of({ actionType: "press", label: "Place your order", key: "Enter" }), "critical");

// Delegation covers the high tier only, and never a pixel-targeted OCR click.
assert.strictEqual(risk.autoApprovable("high", { autonomousActions: true }), true);
assert.strictEqual(risk.autoApprovable("critical", { autonomousActions: true }), false);
assert.strictEqual(risk.autoApprovable("high", { autonomousActions: true, visual: true }), false);
assert.strictEqual(risk.autoApprovable("high", { autonomousActions: false }), false);
assert.strictEqual(risk.autoApprovable("high", {}), false);

// The planner's prose is not evidence about the page and must not move the tier.
const base = { actionType: "click", label: "Continue shopping", ...submitIn("Continue shopping") };
assert.strictEqual(risk.classify({ ...base, reason: "click to place the order and pay now" }).risk, "low");

console.log("Action risk tests passed");
assert.equal(of({actionType:'press',key:'Enter',label:'Search Amazon.in',isTextInput:true,isSubmitControl:true,inForm:true,formIsSearch:true}), 'low');
assert.equal(of({actionType:'press',key:'Enter',label:'Email',isTextInput:true,isSubmitControl:true,inForm:true,formHasPaymentField:true}), 'critical');
