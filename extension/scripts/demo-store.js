"use strict";
const http=require("node:http");
const shell = body => `<!doctype html><meta charset="utf-8"><title>Harbor Shoes · synthetic agent test</title><style>body{font:20px system-ui;max-width:850px;margin:50px auto;background:#f4f5f0;color:#172b28}button,input,select{font:inherit;padding:12px;margin:12px}a{display:block;padding:20px;background:white;margin:15px}h1{font-size:40px}</style><h1>Harbor Shoes</h1><p>Synthetic store. No real purchases or messages.</p>${body}`;
const testProfile = {name:'Fixture Shopper',email:'vault.user@example.com',phone:'9876543210',address:'42 Fixture Lane, Test City'};
function createDemoStore() {
  return http.createServer((req,res) => {
    const url = new URL(req.url, 'http://localhost');
    let body;
    if (url.pathname === '/product') body = `<h2>Trail Runner</h2><p>Price: Rs 2400. Lightweight running shoes.</p><label>Size<select id="size"><option value="">Choose size</option><option>8</option><option>9</option><option>10</option></select></label><button id="add" onclick="if(document.querySelector('#size').value==='9')location.href='/cart';else document.querySelector('#notice').textContent='Choose size 9 first'">Add to cart</button><p id="notice"></p>`;
    else if (url.pathname === '/cart') body = `<h2>Your cart</h2><p>Trail Runner · Size 9 · Rs 2400 · Quantity 1</p><form onsubmit="event.preventDefault();document.querySelector('#notice').textContent='Synthetic order submitted'"><label>Email<input type="email" id="email" autocomplete="email"></label><button id="submit">Place order</button></form><p id="notice">Order not submitted</p>`;
    else if (url.pathname === '/results') body = `<h2>Running shoes</h2><a target="_blank" href="/product">Trail Runner · Rs 2400 · sizes 8, 9, 10</a><a href="/expensive">Premium Runner · Rs 4200</a>`;
    else body = `<form method="get" action="/results" role="search"><input name="field-keywords" aria-label="Search Amazon.in" type="text"><input type="submit" value="Go"></form>`;
    if(url.pathname === '/cart') body += '<label>Full name<input id="name" autocomplete="name"></label><label>Phone<input id="phone" type="tel" autocomplete="tel"></label><label>Street address<textarea id="address" autocomplete="street-address"></textarea></label>';
    res.writeHead(200, {'Content-Type':'text/html'}).end(shell(body));
  });
}
module.exports={createDemoStore,testProfile};
