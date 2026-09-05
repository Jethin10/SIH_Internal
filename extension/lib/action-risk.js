(function initActionRisk(root) {
  "use strict";

  const anyOf = (...parts) => new RegExp(parts.map((part) => part.source).join("|"), "i");

  // Controls that commit money, an order, or a bid. Matched against the control's
  // own accessible name so a page cannot hide a purchase behind container markup.
  const PURCHASE_COMMIT = anyOf(
    /place\s+(?:your\s+|the\s+|my\s+)?(?:order|bid)/,
    /buy\s+(?:it\s+)?now/,
    /purchase\s+now/,
    /order\s+now/,
    /pay\s+(?:now|securely|and\s+\w+)/,
    /make\s+(?:a\s+)?payment/,
    /complete\s+(?:the\s+|your\s+)?(?:purchase|order|payment|checkout|booking)/,
    /confirm\s+(?:and\s+)?(?:pay|payment|order|purchase|booking|reservation)/,
    /submit\s+(?:your\s+)?order/,
    /proceed\s+to\s+pay(?:ment)?/,
    /authori[sz]e\s+(?:the\s+)?payment/,
    /subscribe\s+(?:and\s+)?pay/,
    /pay\s*(?:rs\.?|inr|usd|₹|\$)/,
    /^\s*(?:pay|buy)\s*$/
  );

  // Fields holding a payment instrument or a credential. A bare "pin" is absent on
  // purpose: Indian address forms label the postal code PIN, and the agent must be
  // able to fill an address unattended.
  const PAYMENT_FIELD = anyOf(
    /\bcard\s*(?:number|no\.?|holder)?\b/,
    /\bcardnumber\b/,
    /\b(?:credit|debit)\s*card\b/,
    /\bcvv\b/, /\bcvc\b/, /\bcsc\b/,
    /\bsecurity\s*code\b/,
    /\bexpir(?:y|ation)\b/,
    /\b(?:upi|atm|card|debit|credit|transaction)\s*pin\b/,
    /\botp\b/, /\bone[-\s]?time\s*(?:password|code)\b/,
    /\bnet\s*banking\b/, /\baccount\s*number\b/, /\bifsc\b/, /\brouting\s*number\b/,
    /\bpassword\b/, /\bpasscode\b/, /\baadhaar\b/
  );

  // Consequential but non-financial commitments. Gated by default; a user who turns
  // on autonomous actions can let these through. Purchases never qualify.
  const CONSEQUENTIAL = anyOf(
    /\bdelete\b/, /\bremove\s+account\b/, /\bclose\s+account\b/, /\bdeactivate\b/,
    /\btransfer\b/, /\bwithdraw\b/,
    /\bsend\b/, /\bpost\b/, /\bpublish\b/, /\btweet\b/, /\bshare\b/,
    /\bsign\b/, /\blog\s*in\b/, /\blogin\b/,
    /\bsubmit\b/, /\bupload\b/, /\bauthori[sz]e\b/, /\bconfirm\b/,
    /\bapply\s+now\b/, /\bbook\s+now\b/, /\breserve\b/,
    /\bcheck\s*out\b/, /\bunsubscribe\b/, /\breport\b/, /\bblock\s+user\b/
  );

  // Reaching a cart is reversible and is the ordinary middle of a shopping task.
  const ADD_TO_CART = /\b(?:add\s+to\s+(?:cart|bag|basket)|add\s+item|move\s+to\s+cart)\b/i;

  // Controls that only move between pages or pick a product variant. These are
  // exempt from the default-deny rule for form submit buttons, whose entire purpose
  // is that an unnamed submit might commit something.
  const NAVIGATION_INTENT = anyOf(
    /^continue\s+shopping$/, /^keep\s+shopping$/, /^continue\s+browsing$/,
    /^start\s+shopping$/, /^shop\s+now$/,
    /^continue\s+to\s+(?:the\s+)?(?:site|website|store|home\s*page)$/,
    /^go\s+to\s+(?:the\s+)?(?:home\s*page|store|site|cart)$/,
    /^view\s+cart$/, /^back\s+to\s+(?:results|search|shopping|top)$/,
    /^(?:skip|dismiss|close|cancel|back|not\s+now|no\s+thanks|maybe\s+later)$/,
    /^see\s+(?:all|more)\b/, /^(?:next|previous)\s+page$/, /^load\s+more$/,
    /^(?:search|go|find)$/,
    /^(?:uk|us|eu|size)?\s*\d{1,2}(?:\.5)?$/
  );

  const SEARCH_SUBMIT_NAME = /^(?:search|go|find|submit(?:\s+search)?|q)$/i;

  function decide(risk, reason) {
    return { risk, reason };
  }

  /**
   * Classify one proposed action from page-derived evidence.
   *
   * The planner's own `reason` prose is deliberately not an input. Model text is
   * untrusted and says nothing about the page, so feeding it in only made an
   * unchanged page classify differently between runs.
   */
  function classify(input) {
    const label = `${input.label || ""} ${input.semanticType || ""}`.trim();
    const name = String(input.label || "").trim();
    const formText = String(input.formText || "");
    const type = input.actionType;
    const submitsForm = Boolean(input.isSubmitControl && input.inForm);

    if (type === "fill") {
      if (PAYMENT_FIELD.test(label) || ["password", "secret"].includes(input.semanticType)) {
        return decide("critical", "Payment and credential fields are never filled without local confirmation");
      }
      if (input.sensitivity && input.sensitivity !== "none") {
        return decide(input.alwaysConfirmSensitiveFill ? "high" : "medium", "Sensitive field fill");
      }
      return decide("low", "Ordinary field fill");
    }

    if (!["click", "press"].includes(type)) return decide("low", "Non-committal action");
    if (type === "press" && !["enter", " ", "space"].includes(String(input.key || "").toLowerCase())) {
      return decide("low", "Navigation key press");
    }

    if (PURCHASE_COMMIT.test(name)) return decide("critical", "Control commits a purchase or payment");
    if (submitsForm && input.formHasPaymentField) return decide("critical", "Submits a form carrying payment or credential fields");
    // An ordinary GET search is the one form submission a research task cannot work
    // without, so it is recognised ahead of the consequential word list.
    if (submitsForm && input.formIsSearch && (!name || SEARCH_SUBMIT_NAME.test(name) || NAVIGATION_INTENT.test(name))) {
      return decide("low", "Ordinary search submission");
    }
    if (CONSEQUENTIAL.test(name)) return decide("high", "Control performs a consequential action");
    if (ADD_TO_CART.test(name)) return decide("medium", "Reversible cart change");
    if (NAVIGATION_INTENT.test(name)) return decide("low", "Control only navigates or picks a variant");
    if (submitsForm) {
      if (PURCHASE_COMMIT.test(formText)) return decide("critical", "Submit control inside a purchase form");
      if (CONSEQUENTIAL.test(formText)) return decide("high", "Submit control inside a consequential form");
      return decide("high", "An unnamed form submission could commit something");
    }
    if (PURCHASE_COMMIT.test(formText)) return decide("critical", "Purchase intent in the surrounding form");
    return decide("low", "Ordinary interaction");
  }

  // A user may hand routine consequential steps to the agent. Purchases and
  // credential entry always stop for a human, and so does the OCR fallback, whose
  // target is a pixel guess rather than a revalidated element.
  function autoApprovable(risk, options) {
    if (!options || !options.autonomousActions) return false;
    if (options.visual) return false;
    return risk === "high";
  }

  const api = { classify, autoApprovable, PURCHASE_COMMIT, PAYMENT_FIELD, CONSEQUENTIAL, ADD_TO_CART, NAVIGATION_INTENT };
  root.PrivacyActionRisk = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
