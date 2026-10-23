// Playground logic: lines in, one entry per XPath out. Pure (no DOM) so the test can run it
// against the real converter; the DOM part below runs only in a browser.
(function (root) {
  'use strict';

  // kind: exact (no warning), close (converted with a warning), skip (no class chain).
  // The converter runs twice: without and with the optimizer (the CLI always uses it, the
  // library only with { optimize: true }). `optimize` picks which result is shown;
  // `optimizable` says whether the optimizer changes the chain, so the page can tell.
  function convertLines(text, convert, STATUS, optimize) {
    return String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(xpath => {
      const plain = convert(xpath);
      const opt = convert(xpath, { optimize: true });
      const r = optimize ? opt : plain;
      const ok = r.status === STATUS.SUCCESS;
      return {
        xpath,
        kind: !ok ? 'skip' : r.warning ? 'close' : 'exact',
        locator: ok ? r.locator : null,
        warning: r.warning || null,
        reason: ok ? null : r.reason || r.status,
        optimizable: opt.status === STATUS.SUCCESS && opt.locator !== plain.locator,
      };
    });
  }

  const EXAMPLES = [
    { label: 'exact', text: '//XCUIElementTypeStaticText[@name="Order total"]\n//*[contains(@type,"XCUIElementTypeButton") and contains(@label,"Add to cart")]\n//XCUIElementTypeButton[contains(@label, "Add to cart") and @enabled="true"]' },
    { label: 'close', text: '(//XCUIElementTypeButton[@name="product.addToCart"])[2]' },
    { label: 'skip', text: '//*[@name="Total:"]/following-sibling::*[1]\n//XCUIElementTypeButton[normalize-space(@label)="Pay"]' },
  ];

  const api = { convertLines, EXAMPLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Playground = api;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const LABEL = { exact: 'exact', close: 'close', skip: 'skipped' };

  function copy(text, btn) {
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1200); };
    const fallback = () => {
      const t = el('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* no clipboard */ }
      t.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // The optimizer is always checked, so the tag is the same with the box on or off:
  // optimized (it changed the chain), not optimized (it would change it), already optimal.
  function optimizerTag(r, optimize) {
    if (!r.optimizable) return ['already optimal', 'the optimizer has nothing to change'];
    return optimize ? ['optimized', 'the optimizer changed the chain'] : ['not optimized', 'turn on the optimizer to change this chain'];
  }

  function card(r, optimize) {
    const c = el('article', 'card ' + r.kind);
    const head = el('div', 'head');
    head.append(el('span', 'badge ' + r.kind, LABEL[r.kind]), el('code', 'xp', r.xpath));
    c.append(head);
    if (r.locator) {
      const row = el('div', 'out');
      const btn = el('button', 'copy', 'Copy');
      btn.type = 'button';
      btn.addEventListener('click', () => copy(r.locator, btn));
      row.append(el('code', 'ui', r.locator), btn);
      c.append(row);
      const [text, title] = optimizerTag(r, optimize);
      const tag = el('span', 'tag' + (r.optimizable ? (optimize ? ' on' : ' can') : ''), text);
      tag.title = title;
      const note = el('p', 'note');
      note.append(tag);
      c.append(note);
    }
    if (r.warning) c.append(el('p', 'note', 'Warning: ' + r.warning));
    if (r.reason) c.append(el('p', 'note', 'Skipped: ' + r.reason));
    return c;
  }

  function render() {
    const { convertXpathToClassChain, STATUS } = root.XpathToClassChain;
    const optimize = $('optimize').checked;
    const results = convertLines($('input').value, convertXpathToClassChain, STATUS, optimize);
    $('results').replaceChildren(...results.map(r => card(r, optimize)));
    $('summary').textContent = results.length
      ? ['exact', 'close', 'skip'].map(k => results.filter(r => r.kind === k).length + ' ' + LABEL[k]).join(' · ')
      : 'Enter one XPath per line.';
  }

  $('input').addEventListener('input', render);
  $('optimize').addEventListener('change', render);
  const ex = $('examples');
  EXAMPLES.forEach(e => {
    const b = el('button', 'chip', e.label);
    b.type = 'button';
    b.addEventListener('click', () => { $('input').value = e.text; render(); });
    ex.append(b);
  });
  $('input').value = EXAMPLES[0].text;
  render();
})(typeof globalThis !== 'undefined' ? globalThis : window);
