#!/usr/bin/env node
// Phase 3: builds the `scale` screen and its cases from one description, so the two cannot drift.
//
//   node make-scale.js     → LocatorLab/scale.json (the tree the app renders) + scale-cases.json
//
// The screen is one shop "Checkout" page (G1, the 100 target elements) plus background load that
// only grows the tree: G2 screens underneath (+400), G3 a long feed below the fold (+500),
// G4 an off-screen drawer and kept-alive tabs (+1000). `-load 100|500|1000|2000` picks the groups.
// Every target is unique in the whole tree at every load; background labels share words with
// targets ("Add to wishlist" vs "Add to cart") but never the matched value, so `contains` has to
// look at everything. scale.js checks that on the device before it times anything.
'use strict';
const fs = require('fs'), path = require('path');
const HERE = __dirname;

// ---------- tree nodes (decoded by ScaleScreen.swift into the Lab.swift DSL)
const text = (l, o = {}) => ({ t: 'text', l, ...o });
const button = (l, o = {}) => ({ t: 'button', l, ...o });
const field = (placeholder, id) => ({ t: 'field', l: placeholder, id });
const box = (o, k) => ({ t: 'box', ...o, k });
const row = k => ({ t: 'row', k });

// ---------- targets: 10 shapes × 3 positions
// Each entry: the XPath, and where the element lives (the node is placed by the G1 builder below).
const T = 'XCUIElementType';
const shapes = [
  { shape: 1, form: '//T[@name="v"]',
    top: `//${T}Button[@name="nav.help"]`, deep: `//${T}Button[@name="review.helpful"]`, end: `//${T}Button[@name="checkout.placeOrder"]` },
  { shape: 2, form: '//T[contains(@name,"v")]',
    top: `//${T}StaticText[contains(@name, "#1042")]`, deep: `//${T}StaticText[contains(@name, "Anna K")]`, end: `//${T}StaticText[contains(@name, "Baker St")]` },
  { shape: 3, form: '//*[contains(@type,"v") and contains(@label,"v")]',
    top: `//*[contains(@type,"Button") and contains(@label,"promo code")]`, deep: `//*[contains(@type,"Button") and contains(@label,"more replies")]`, end: `//*[contains(@type,"Button") and contains(@label,"payment method")]` },
  { shape: 4, form: '//T[@label="v"]',
    top: `//${T}StaticText[@label="Free delivery over $50"]`, deep: `//${T}StaticText[@label="Great fit, runs small"]`, end: `//${T}StaticText[@label="Total: $148.97"]` },
  { shape: 5, form: '//*[contains(@type,"v") and contains(@name,"v")]',
    top: `//*[contains(@type,"TextField") and contains(@name,"codeInput")]`, deep: `//*[contains(@type,"TextField") and contains(@name,"replyInput")]`, end: `//*[contains(@type,"TextField") and contains(@name,"postcode")]` },
  { shape: 6, form: '//T[contains(@label,"v")]',
    top: `//${T}Button[contains(@label, "Edit cart")]`, deep: `//${T}Button[contains(@label, "Report rev")]`, end: `//${T}Button[contains(@label, "Terms of")]` },
  { shape: 7, form: '//*[contains(@name|@label,"v")]',
    top: `//*[contains(@name, "flashSale")]`, deep: `//*[contains(@label, "Verified purchase")]`, end: `//*[contains(@name, "help with your")]` },
  { shape: 8, form: '(//T[@name="v"])[n]',
    top: `(//${T}Button[@name="Add to cart"])[2]`, deep: `(//${T}Button[@name="Reply"])[2]`, end: `(//${T}Button[@name="Remove"])[3]` },
  { shape: 9, form: '//*[@name="v" and @label="v"]',
    top: `//*[@name="cart.badge" and @label="3 items"]`, deep: `//*[@name="Was this helpful?" and @label="Was this helpful?"]`, end: `//${T}Button[@name="checkout.saveAddress" and @label="Save address"]` },
  { shape: 10, form: '//*[contains(@name,"v")]/child::T[@name="v"]',
    top: `//*[contains(@name,"deliveryInfo")]/child::${T}StaticText[@name="Arrives Tue, Oct 14"]`, deep: `//*[contains(@name,"replyMeta")]/child::${T}StaticText[@name="Posted 2 days ago"]`, end: `//*[contains(@name,"summary.taxes")]/child::${T}StaticText[@name="Taxes: $11.02"]` },
];

// values no background node may carry: the exact values (equality shapes) and the fragments (contains shapes)
const RESERVED = ['nav.help', 'review.helpful', 'checkout.placeOrder', '#1042', 'Anna K', 'Baker St', 'promo code', 'more replies',
  'payment method', 'Free delivery over $50', 'Great fit, runs small', 'Total: $148.97', 'codeInput', 'replyInput', 'postcode',
  'Edit cart', 'Report rev', 'Terms of', 'flashSale', 'Verified purchase', 'help with your', 'cart.badge', '3 items',
  'Was this helpful?', 'checkout.saveAddress', 'Save address', 'deliveryInfo', 'Arrives Tue, Oct 14', 'replyMeta',
  'Posted 2 days ago', 'summary.taxes', 'Taxes: $11.02'];
const RESERVED_EXACT = ['Add to cart', 'Reply', 'Remove'];

// ---------- G1: the Checkout page (always rendered, same at every load)
// DEEP = boxes between the thread root and the deep targets; calibrated so the deep targets sit at
// absolute depth ~40 in the page source (WDA's default snapshotMaxDepth is 50).
const DEEP = Number(process.env.DEEP || 26);
// The deep branch is a top-level `kit` subtree (UIKit, see ScaleScreen.swift): SwiftUI merges a container whose
// only child is another container, UIKit keeps every identified view.
const kit = k => ({ t: 'kit', k });
function nest(levels, inner) { let n = inner; for (let i = levels; i >= 1; i--) n = [box({ id: `review.reply.${i}` }, n)]; return n[0]; }

const G1 = [
  // top: nav bar, header, promo, product cards
  box({ id: 'checkout.navbar' }, [row([text('Checkout', { id: 'checkout.title' }), button('Help', { id: 'nav.help' }), button('3 items', { id: 'cart.badge' })])]),
  text('Order #1042 · 3 items'),
  text('Free delivery over $50'),
  box({ id: 'header.deliveryInfo' }, [text('Arrives Tue, Oct 14')]),
  text('Flash sale ends in 02:14:09', { id: 'banner.flashSale' }),
  row([field('Promo code', 'promo.codeInput'), button('Apply promo code')]),
  button('Edit cart (3)'),
  ...['Linen shirt · $49.99', 'Canvas sneakers · $64.00', 'Leather belt · $24.98'].map((p, i) => box({ id: `cart.product.${i + 1}` }, [text(p), button('Add to cart')])),
  // middle: reviews with one deep thread
  kit([box({ id: 'reviews.thread' }, [
    nest(DEEP, [box({ id: 'review.deep' }, [
      text('Reply from Anna K.'),
      text('Great fit, runs small'),
      text('Verified purchase · Size M'),
      box({ id: 'review.replyMeta' }, [text('Posted 2 days ago')]),
      text('Was this helpful?'),
      row([button('Yes, helpful', { id: 'review.helpful' }), button('Report review')]),
      row([button('Reply'), button('Reply'), button('Reply')]),
      button('Show 3 more replies'),
      field('Write a reply', 'review.replyInput'),
    ])]),
  ])]),
  // end: cart lines, address, summary, footer
  ...['Linen shirt', 'Canvas sneakers', 'Leather belt'].map(p => row([text(`${p} × 1`), button('Remove')])),
  text('Delivery address: 12 Baker St, London'),
  field('Postcode', 'address.postcodeField'),
  button('Save address', { id: 'checkout.saveAddress' }),
  button('Change payment method'),
  box({ id: 'checkout.summary.taxes' }, [text('Taxes: $11.02')]),
  text('Total: $148.97'),
  button('Terms of sale'),
  button('Need help with your order?'),
  button('Place order', { id: 'checkout.placeOrder' }),
];

// ---------- background vocabulary
let seed = 1042;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = a => a[Math.floor(rnd() * a.length)];
const PRODUCTS = ['Wool sweater', 'Denim jacket', 'Running shoes', 'Silk scarf', 'Cotton t-shirt', 'Rain coat', 'Ankle boots',
  'Chino trousers', 'Leather wallet', 'Sunglasses', 'Baseball cap', 'Hiking backpack', 'Yoga mat', 'Water bottle', 'Coffee grinder',
  'French press', 'Ceramic mug', 'Desk lamp', 'Wireless earbuds', 'Phone case', 'USB-C cable', 'Smart watch', 'Bluetooth speaker',
  'Scented candle', 'Throw pillow', 'Bath towel', 'Plant pot', 'Notebook', 'Fountain pen', 'Board game'];
const ACTIONS = ['Add to wishlist', 'Compare', 'Share', 'Buy now', 'Details', 'Notify me', 'Add to bag', 'Quick view', 'Remove from list', 'Reply all'];
const TAGS = ['New', 'Bestseller', 'Only 2 left', 'Eco', '-20%', 'Limited', 'Back in stock'];
const CATEGORIES = ['Women', 'Men', 'Kids', 'Home', 'Electronics', 'Sports', 'Beauty', 'Garden', 'Books', 'Toys', 'Outlet'];
const price = () => `$${(5 + Math.floor(rnd() * 190))}.${String(Math.floor(rnd() * 100)).padStart(2, '0')}`;

// one product card: Other + 2–3 StaticText + 1–2 Button (≈ 5–7 elements)
function card(prefix, i) {
  const p = pick(PRODUCTS), k = [text(p), text(price())];
  if (rnd() < 0.5) k.push(text(`${(3.5 + rnd() * 1.5).toFixed(1)} ★ (${Math.floor(rnd() * 900)})`));
  if (rnd() < 0.3) k.push(text(pick(TAGS)));
  k.push(row(rnd() < 0.5 ? [button(pick(ACTIONS))] : [button(pick(ACTIONS)), button(pick(ACTIONS))]));
  return box({ id: `${prefix}.card.${i}` }, k);
}
function cards(prefix, n) { return Array.from({ length: n }, (_, i) => card(prefix, i + 1)); }
function navbar(prefix, title) { return box({ id: `${prefix}.navbar` }, [row([button('Back', { id: `${prefix}.back` }), text(title), button('Search', { id: `${prefix}.search` })])]); }

// counts the XCUIElementType* nodes a subtree becomes (row is not an element)
const count = n => (n.t === 'row' || n.t === 'kit' ? 0 : 1) + (n.k || []).reduce((s, c) => s + count(c), 0);
const total = ns => ns.reduce((s, n) => s + count(n), 0);
// adds cards until the group holds `budget` elements (the last one may overshoot by a few)
function fill(prefix, head, budget) { const ns = [...head]; let i = 0; while (total(ns) < budget) ns.push(card(prefix, ++i)); return ns; }

// budgets are calibrated against the page source (scale.js --count); see README
const B = { g2: Number(process.env.G2 || 380), g3: Number(process.env.G3 || 495), drawer: Number(process.env.DRAWER || 300), tabs: Number(process.env.TABS || 654) };

// G2: two screens underneath (layers, each a list of nodes) (custom ZStack navigator): Home feed, Catalog
const G2 = [
  fill('home', [navbar('home', 'Home'), text('Good morning'), text('Picked for you')], B.g2 / 2),
  fill('catalog', [navbar('catalog', 'Catalog'), row(CATEGORIES.slice(0, 4).map(c => button(c)))], B.g2 / 2),
];
// G3: the rest of the Checkout page below the fold: recommendations and older reviews
const G3 = fill('reco', [text('You may also like'), text('Recently viewed')], B.g3);
// G4: drawer with a category tree (3 levels), and kept-alive tabs in an off-screen pager
function drawer(budget) {
  const ns = [text('Menu'), button('Sign in')]; let i = 0;
  while (total(ns) < budget) {
    const c = CATEGORIES[i % CATEGORIES.length] + (i >= CATEGORIES.length ? ` ${Math.floor(i / CATEGORIES.length) + 1}` : '');
    ns.push(box({ id: `drawer.cat.${++i}` }, [button(c), ...['New in', 'Clothing', 'Shoes', 'Accessories', 'Sale'].map(s =>
      box({}, [button(`${c}: ${s}`), text(`${Math.floor(rnd() * 400)} products`)]))]));
  }
  return ns;
}
const G4 = {
  drawer: drawer(B.drawer),
  tabs: [
    fill('search', [navbar('search', 'Search'), text('Popular searches')], B.tabs / 3),
    fill('orders', [navbar('orders', 'Orders'), text('Order history')], B.tabs / 3),
    fill('profile', [navbar('profile', 'Profile'), text('Account settings')], B.tabs / 3),
  ],
  tabbar: ['Shop', 'Search', 'Bag', 'Orders', 'Profile'].map(t => button(t, { id: `tab.${t.toLowerCase()}` })),
};

// ---------- checks
const strings = n => [n.l, n.id, n.v, ...(n.k || []).flatMap(strings)].filter(Boolean);
const bg = [...G2.flat(), ...G3, ...G4.drawer, ...G4.tabs.flat(), ...G4.tabbar].flatMap(strings);
const clash = bg.filter(s => RESERVED.some(r => s.includes(r)) || RESERVED_EXACT.includes(s));
if (clash.length) throw new Error(`background reuses target values: ${[...new Set(clash)].join(', ')}`);
const g1 = G1.flatMap(strings);
for (const r of RESERVED) if (!g1.some(s => s.includes(r))) throw new Error(`target value missing from G1: ${r}`);

// ---------- scale-deep: one chain of boxes with a marker text every 5 levels (depth check, not timed)
const DEEP_MAX = 70;
let deepTree = [text(`depth.marker.${DEEP_MAX}`)];
for (let d = DEEP_MAX - 1; d >= 1; d--) deepTree = [box({ id: `level.${d}` }, d % 5 === 0 ? [text(`depth.marker.${d}`), ...deepTree] : deepTree)];

// ---------- write
const screen = { note: 'Generated by make-scale.js; do not edit.', g1: G1, g2: G2, g3: G3, g4: G4, deep: [kit(deepTree)] };
fs.writeFileSync(path.join(HERE, 'LocatorLab/scale.json'), JSON.stringify(screen) + '\n');

const positions = ['top', 'deep', 'end'];
const cases = shapes.flatMap(s => positions.map(p => ({ id: `S${String(s.shape).padStart(2, '0')}-${p}`, shape: s.shape, form: s.form, position: p, xpath: s[p] })));
const deepCases = [];
for (let d = 5; d <= DEEP_MAX; d += 5) deepCases.push({ id: `D${d}`, marker: d, xpath: `//${T}StaticText[@name="depth.marker.${d}"]` });
fs.writeFileSync(path.join(HERE, 'scale-cases.json'), JSON.stringify({ cases, deep: deepCases }, null, 1) + '\n');

console.log(`G1 ${total(G1)}, G2 ${total(G2.flat())}, G3 ${total(G3)}, G4 ${total(G4.drawer) + total(G4.tabs.flat()) + total(G4.tabbar)} model elements (wrappers excluded); ${cases.length} cases, ${deepCases.length} depth markers`);
