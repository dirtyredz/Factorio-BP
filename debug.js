'use strict';
// Drives the page's run() against a fake DOM so rendering errors surface.

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</' + 'script>'));

const els = new Map();
function el(id) {
  if (!els.has(id)) {
    const set = new Set();
    els.set(id, {
      id, value: '', textContent: '', innerHTML: '', className: '', checked: false,
      disabled: false, handlers: {},
      addEventListener(ev, fn) { this.handlers[ev] = fn; },
      classList: {
        add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c),
      },
      scrollIntoView() {},
      removeAttribute() {}, setAttribute() {}, select() {},
    });
  }
  return els.get(id);
}

const win = { matchMedia: () => ({ matches: false }) };
const doc = { getElementById: el, querySelectorAll: () => [] };

const api = new Function('document', 'navigator', 'window', 'requestAnimationFrame',
  src + '\n;return { run: run, applyMods: applyMods };'
)(doc, { clipboard: { writeText: async () => {} } }, win, fn => fn());

const read = n => fs.readFileSync(path.join(__dirname, 'blueprints', n + '.txt'), 'utf8').trim();

(async () => {
  el('a').value = read('dropoff-a');
  el('b').value = read('dropoff-a-signals');
  el('anchor').value = '';
  el('rm').checked = false;

  try {
    await api.run();
  } catch (e) {
    console.log('run() THREW: ' + e.message);
    console.log(e.stack.split('\n').slice(0, 4).join('\n'));
    process.exit(1);
  }

  console.log('run() completed without throwing');
  console.log('error box  :', el('err').innerHTML.slice(0, 200) || '(empty)');
  console.log('result len :', el('result').value.length);
  console.log('align html :', el('align').innerHTML ? 'populated' : 'EMPTY');
  console.log('verdict    :', el('verdict').innerHTML || '(empty)');
  console.log('status line:', el('status').textContent || '(empty)');
  console.log('button     :', el('go').textContent, '| disabled:', el('go').disabled,
              '| busy:', el('go').classList.contains('busy'));
})();
