'use strict';
// Loads named functions out of index.html's single trailing <script>, so the CLI,
// tests and tools run the page's own code. Every call evaluates the script afresh.
const fs = require('fs');
const path = require('path');

const stub = () => ({
  addEventListener() {}, classList: { add() {}, remove() {} },
  value: '', textContent: '', innerHTML: '', className: '', checked: false,
  removeAttribute() {}, setAttribute() {}, select() {},
});

function loadPageApi(names, extraGlobals = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const open = html.lastIndexOf('<script>');
  const close = html.lastIndexOf('</' + 'script>');
  if (open < 0 || close < open) throw new Error('index.html has no trailing <script> block');
  const globals = {
    document: { getElementById: stub, querySelectorAll: () => [] },
    navigator: { clipboard: { writeText: async () => {} } },
    ...extraGlobals,
  };
  const keys = Object.keys(globals);
  return new Function(...keys,
    html.slice(open + 8, close) + `\n;return { ${names.join(', ')} };`)(...keys.map(k => globals[k]));
}

module.exports = { loadPageApi };
