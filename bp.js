#!/usr/bin/env node
'use strict';

// Command-line front end for the same merge logic the page uses. The logic itself
// lives in index.html and is loaded from there, so the two can't drift apart.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const STORE = path.join(ROOT, 'blueprints');

// ---------- load the page's logic ----------

function loadApi() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const open = html.lastIndexOf('<script>') + '<script>'.length;
  const close = html.lastIndexOf('</' + 'script>');
  const src = html.slice(open, close);

  const stub = () => ({
    addEventListener() {}, classList: { add() {}, remove() {} },
    value: '', textContent: '', innerHTML: '', className: '', checked: false,
    removeAttribute() {}, setAttribute() {}, select() {},
  });

  return new Function('document', 'navigator',
    src + '\n;return { decode, encode, compare, merge, bpOf, tally, paramBound, key, ZERO, paramsStillBind, turnBlueprint, flipBlueprint, normalise, normaliseReport };'
  )({ getElementById: stub, querySelectorAll: () => [] },
    { clipboard: { writeText: async () => {} } });
}

const api = loadApi();

// ---------- clipboard ----------

const ps = script => execFileSync('powershell',
  ['-NoProfile', '-NonInteractive', '-Command', script],
  { encoding: 'utf8', maxBuffer: 1 << 26 });

function clipGet() {
  const s = ps('Get-Clipboard -Raw');
  if (!s || !s.trim()) throw new Error('clipboard is empty');
  return s.trim();
}

function clipSetFromFile(file) {
  ps(`Set-Clipboard -Value ((Get-Content -Raw -LiteralPath '${file.replace(/'/g, "''")}').Trim())`);
  const back = ps('Get-Clipboard -Raw').trim();
  if (back !== fs.readFileSync(file, 'utf8').trim()) throw new Error('clipboard verification failed');
  return back.length;
}

// ---------- storage ----------

function slotPath(name) {
  fs.mkdirSync(STORE, { recursive: true });
  return path.join(STORE, name.endsWith('.txt') ? name : name + '.txt');
}

function readSlot(name) {
  const p = slotPath(name);
  if (!fs.existsSync(p)) throw new Error(`no saved blueprint named "${name}" (looked in ${p})`);
  return fs.readFileSync(p, 'utf8').trim();
}

const writeSlot = (name, str) => (fs.writeFileSync(slotPath(name), str), slotPath(name));

// ---------- output ----------

function describe(obj) {
  const b = api.bpOf(obj);
  const ents = b.entities || [];
  const L = [];
  L.push(`label:      ${b.label || '(none)'}`);
  L.push(`entities:   ${ents.length}`);
  L.push(`wires:      ${(b.wires || []).length}`);
  L.push(`snap-to-grid: ${b['snap-to-grid'] ? `${b['snap-to-grid'].x}x${b['snap-to-grid'].y}` : '(none)'}` +
         `  absolute: ${b['absolute-snapping'] ? 'yes' : 'no'}` +
         `  offset: ${b['position-relative-to-grid']
           ? `(${b['position-relative-to-grid'].x}, ${b['position-relative-to-grid'].y})` : '(none)'}`);
  L.push(`parameters: ${(b.parameters || []).length}`);
  for (const p of b.parameters || []) {
    const bits = [p.name ? `"${p.name}"` : '(unnamed)', p.type];
    if (p.number !== undefined) bits.push(`= ${p.number}`);
    if (p.variable) bits.push(`var ${p.variable}`);
    if (p.formula) bits.push(`formula ${p.formula}`);
    if (p.dependent) bits.push('(derived)');
    L.push(`  - ${bits.join('  ')}`);
  }
  const c = api.tally(ents);
  L.push('entity counts:');
  for (const k of Object.keys(c).sort()) L.push(`  ${String(c[k]).padStart(4)}  ${k}`);
  return L.join('\n');
}

const where = (e, off) => `(${e.position.x + (off ? off.x : 0)}, ${e.position.y + (off ? off.y : 0)})` +
  ` direction=${e.direction === undefined ? 0 : e.direction}`;

function report(d) {
  const L = [];
  L.push(`alignment: offset (${d.al.off.x}, ${d.al.off.y}) anchored on "${d.al.anchor}" — ` +
         `${d.al.score}/${d.eb.length} incoming entities land on an occupied tile ` +
         `(${d.al.ident} of them identical, ${d.al.tried} offsets tested)`);
  if (d.al.score < d.eb.length - d.added.length) L.push('WARNING: alignment looks weak; check the offset above');
  L.push('');
  L.push(`added:     ${d.added.length}`);
  for (const e of d.added) L.push(`  + ${e.name} ${where(e, d.al.off)}`);
  L.push(`replaced:  ${d.replaced.length}`);
  for (const r of d.replaced) L.push(`  ⇄ ${r.from.name} -> ${r.to.name} ${where(r.to, d.al.off)}`);
  L.push(`removed:   ${d.removed.length}`);
  for (const e of d.removed) L.push(`  - ${e.name} ${where(e)}`);
  L.push(`changed settings (not applied): ${d.modified.length}`);
  for (const e of d.modified) L.push(`  ~ ${e.name} ${where(e)}`);
  return L.join('\n');
}

function verify(base, out, d, dropped) {
  const a = api.bpOf(base), v = api.bpOf(out);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const tiles = v.entities.map(e => `${e.name}@${e.position.x},${e.position.y}`);
  const rows = [
    ['label kept', a.label === v.label],
    ['snap-to-grid kept', same(a['snap-to-grid'], v['snap-to-grid'])],
    ['absolute snapping kept', a['absolute-snapping'] === v['absolute-snapping']],
    ['grid offset kept', same(a['position-relative-to-grid'], v['position-relative-to-grid'])],
    ['parameters kept', same(a.parameters, v.parameters)],
    ['entity count adds up',
      v.entities.length === (a.entities || []).length + d.added.length - (dropped ? d.removed.length : 0)],
    ['nothing stacked on itself', new Set(tiles).size === tiles.length],
    ['every parameter still binds', api.paramsStillBind(v)],
  ];
  return rows.map(([n, ok]) => `  ${ok ? 'OK  ' : 'FAIL'}  ${n}`).join('\n') +
    `\n  entities: ${(a.entities || []).length} -> ${v.entities.length}`;
}

// ---------- cli ----------

const [cmd, ...args] = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = n => {
  const hit = args.find(a => a.startsWith('--' + n + '='));
  return hit ? hit.slice(n.length + 3) : '';
};
const pos = args.filter(a => !a.startsWith('--'));

async function main() {
  switch (cmd) {
    case 'save': {
      if (!pos[0]) throw new Error('usage: node bp.js save <name>   (reads the clipboard)');
      const str = clipGet();
      const obj = await api.decode(str);
      console.log(`saved ${str.length} chars to ${writeSlot(pos[0], str)}\n`);
      console.log(describe(obj));
      break;
    }
    case 'info':
      if (!pos[0]) throw new Error('usage: node bp.js info <name>');
      console.log(describe(await api.decode(readSlot(pos[0]))));
      break;

    case 'list': {
      fs.mkdirSync(STORE, { recursive: true });
      for (const f of fs.readdirSync(STORE).filter(f => f.endsWith('.txt'))) {
        const b = api.bpOf(await api.decode(fs.readFileSync(path.join(STORE, f), 'utf8')));
        console.log(`${f.replace(/\.txt$/, '').padEnd(26)} ${String((b.entities || []).length).padStart(4)} entities  ` +
          `${b['snap-to-grid'] ? 'grid' : '    '}  ${(b.parameters || []).length} params  ${b.label || ''}`);
      }
      break;
    }
    case 'diff': {
      if (pos.length < 2) throw new Error('usage: node bp.js diff <base> <new> [--anchor=entity-name]');
      const A = await api.decode(readSlot(pos[0])), B = await api.decode(readSlot(pos[1]));
      console.log(report(api.compare(A, B, opt('anchor'))));
      break;
    }
    case 'merge': {
      if (pos.length < 2) throw new Error(
        'usage: node bp.js merge <base> <new> [out] [--anchor=name] [--apply-removals] [--no-clip]');
      const A = await api.decode(readSlot(pos[0])), B = await api.decode(readSlot(pos[1]));
      const d = api.compare(A, B, opt('anchor'));
      const dropped = flag('apply-removals');

      // --apply-changes takes all of them, --apply-changes=train-stop just that type
      const want = opt('apply-changes') || (flag('apply-changes') ? '*' : '');
      const picked = want ? d.modified.filter(e => want === '*' || e.name === want) : [];
      const applySet = new Set(picked.map(e => api.key(e, api.ZERO)));

      const { out, wires } = api.merge(A, B, d, dropped, applySet);
      const str = await api.encode(out);
      const p = writeSlot(pos[2] || `${pos[0]}-merged`, str);

      console.log(report(d));
      const risky = d.replaced.filter(r => api.paramBound(api.bpOf(A), r.from));
      if (risky.length) {
        console.log(`\nWARNING: ${risky.length} replaced entit${risky.length === 1 ? 'y was' : 'ies were'} ` +
          `carrying a parameter (${risky.map(r => r.from.name).join(', ')}).`);
        console.log('         Check the parametrisation dialog after importing.');
      }
      if (picked.length) {
        console.log(`\napplied rebuilt settings to ${picked.length} entit${picked.length === 1 ? 'y' : 'ies'}: ` +
          picked.map(e => e.name).join(', '));
        console.log('  (field by field; values a parameter binds to were kept from the base)');
      }
      if (d.modified.length > picked.length) {
        console.log(`\nNOTE: ${d.modified.length - picked.length} changed entit` +
          `${d.modified.length - picked.length === 1 ? 'y' : 'ies'} kept the base version.`);
        console.log('      Use --apply-changes, or --apply-changes=<entity-name>, to bring them across.');
      }
      if (!dropped && d.removed.length) {
        console.log('\nNOTE: removals not applied. Re-run with --apply-removals if you meant to delete them.');
      }
      console.log(`\nwires carried over: ${wires}`);
      console.log(`\nverification:\n${verify(A, await api.decode(str), d, dropped)}`);
      console.log(`\nwrote ${str.length} chars to ${p}`);
      if (!flag('no-clip')) console.log(`clipboard: ${clipSetFromFile(p)} chars — paste into Factorio`);
      break;
    }
    case 'turn': {
      if (!pos[0]) throw new Error('usage: node bp.js turn <name> [cw|ccw|180] [out]');
      const how = (pos[1] || '180').toLowerCase();
      const q = how === 'cw' ? 1 : how === 'ccw' ? 3 : how === '180' ? 2 : Number(how);
      if (![1, 2, 3].includes(q)) throw new Error('turn direction must be cw, ccw, or 180');
      const obj = await api.decode(readSlot(pos[0]));
      const str = await api.encode(api.turnBlueprint(obj, q));
      const p = writeSlot(pos[2] || `${pos[0]}-turned`, str);
      console.log(describe(await api.decode(str)));
      console.log(`\nwrote ${str.length} chars to ${p}`);
      if (!flag('no-clip')) console.log(`clipboard: ${clipSetFromFile(p)} chars — paste into Factorio`);
      break;
    }
    case 'flip': {
      if (!pos[0]) throw new Error('usage: node bp.js flip <name> h|v [out]');
      const how = (pos[1] || 'h').toLowerCase();
      const axis = /^(h|horizontal|x)$/.test(how) ? 'x' : /^(v|vertical|y)$/.test(how) ? 'y' : '';
      if (!axis) throw new Error('flip direction must be h (left-right) or v (top-bottom)');
      const obj = await api.decode(readSlot(pos[0]));
      const str = await api.encode(api.flipBlueprint(obj, axis));
      const p = writeSlot(pos[2] || `${pos[0]}-flipped`, str);
      console.log(describe(await api.decode(str)));
      console.log(`\nwrote ${str.length} chars to ${p}`);
      if (!flag('no-clip')) console.log(`clipboard: ${clipSetFromFile(p)} chars — paste into Factorio`);
      break;
    }
    case 'normalise':
    case 'normalize': {
      if (!pos[0]) throw new Error('usage: node bp.js normalise <name> [x] [y] [out]');
      const tx = pos[1] === undefined ? 0 : Number(pos[1]);
      const ty = pos[2] === undefined ? 0 : Number(pos[2]);
      if (!isFinite(tx) || !isFinite(ty)) throw new Error('corner x and y must be numbers');
      const obj = await api.decode(readSlot(pos[0]));
      const r = api.normalise(obj, { x: tx, y: ty });
      if (!r.entities) throw new Error('that blueprint has no entities to move');

      // Absolute X/Y pins the lattice to the world; two blueprints need the same
      // one to land together, so allow setting it alongside the move.
      const pin = opt('absolute');
      if (pin) {
        const m = /^(-?[\d.]+)[,\s]+(-?[\d.]+)$/.exec(pin.trim());
        if (!m) throw new Error('--absolute takes "x,y"');
        api.bpOf(obj)['position-relative-to-grid'] = { x: Number(m[1]), y: Number(m[2]) };
      }

      const str = await api.encode(obj);
      const back = api.bpOf(await api.decode(str));
      if (!api.paramsStillBind(back)) throw new Error('a parameter stopped binding — not written');

      const p = writeSlot(pos[3] || `${pos[0]}-normalised`, str);
      const rep = api.normaliseReport(back);
      console.log(`moved (${r.moved.x}, ${r.moved.y}) — ${r.entities} entities`);
      console.log(`corner (${r.from.x}, ${r.from.y}) -> (${r.to.x}, ${r.to.y})` +
        (r.residual.x || r.residual.y
          ? `  [${r.residual.x}, ${r.residual.y}] short — translations are whole tiles only`
          : ''));
      console.log(`\nmust match to land together: grid ${rep.grid} · ${rep.snapping} · absolute ${rep.offset}`);
      console.log(`\nwrote ${str.length} chars to ${p}`);
      if (!flag('no-clip')) console.log(`clipboard: ${clipSetFromFile(p)} chars — paste into Factorio`);
      break;
    }
    case 'copy':
      if (!pos[0]) throw new Error('usage: node bp.js copy <name>');
      console.log(`clipboard: ${clipSetFromFile(slotPath(pos[0]))} chars — paste into Factorio`);
      break;

    default:
      console.log(`usage: node bp.js <command>

  save <name>              read the clipboard, validate it, store it
  list                     list stored blueprints
  info <name>              decode and summarise
  diff <base> <new>        align the two and list added / replaced / removed / changed
  merge <base> <new> [out] merge into <base>, verify, copy the result to the clipboard
  turn <name> cw|ccw|180   rotate a blueprint, keeping grid and parameters
  flip <name> h|v          mirror a blueprint left-right or top-bottom
  normalise <name> [x] [y] [out]   move the build to a fixed corner, so blueprints sharing a
                           grid size land on the same spot  [--absolute=x,y]
  copy <name>              put a stored blueprint back on the clipboard

  flags:  --anchor=<entity-name>  line up on this entity type (default: best fit)
          --apply-changes         take the rebuilt settings for every changed entity
          --apply-changes=<name>  ...or just for that entity type, e.g. train-stop
          --apply-removals        also delete entities missing from <new>
          --no-clip               write the file, leave the clipboard alone`);
  }
}

main().catch(e => { console.error('error: ' + e.message); process.exit(1); });
