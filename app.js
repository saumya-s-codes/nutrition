'use strict';
/* Meal Loop — plan the week, cook, eat, log. All data stays on this device. */

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => iso(new Date());
const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtN = n => String(Math.round(n * 100) / 100);
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const fmtDay = s => parseIso(s).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const mondayOf = s => { const d = parseIso(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };
const plural = (n, w) => `${nice(n)} ${w}${Math.abs(n - 1) < 1e-9 ? '' : 's'}`;

// ---------- state ----------
const APP_VERSION = '1.15'; // keep in step with VERSION in sw.js
const KEY = 'mealloop.v1';
const fresh = () => ({
  v: 3, modules: parseModules(), week: null, history: [], fridge: [], cooked: {},
  plan: {}, diary: [], settings: { yellow: 0.7, red: 1, rawWindow: 3 }, packs: {}, life: {}, prices: {},
});
let S = (() => {
  try { const j = localStorage.getItem(KEY); if (j) return Object.assign(fresh(), JSON.parse(j)); } catch (e) { /* ignore */ }
  return fresh();
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save. Storage may be full.'); } };

const ui = { tab: 'eat', planTab: 'week', picking: false, step: 0, date: todayIso(), sheet: null, draft: null, iconOpen: false, tossAmt: 1, tossMode: 'ing', thoughtId: null };

const mod = id => S.modules.find(m => m.id === id);
const cat = id => CATS.find(c => c.id === id) || CATS[0];
// ----- units: everything is stored in a base unit (tsp for volume, oz for weight, or the count unit itself) -----
const UNITS = { tsp: { g: 'vol', f: 1 }, tbsp: { g: 'vol', f: 3 }, cup: { g: 'vol', f: 48 }, pint: { g: 'vol', f: 96 }, oz: { g: 'wt', f: 1 }, lb: { g: 'wt', f: 16 } };
const COUNT_UNITS = ['ea', 'slice', 'clove', 'can', 'bag'];
const ALIAS = { tbs: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp', cups: 'cup', c: 'cup', ounce: 'oz', ounces: 'oz', ozs: 'oz', lbs: 'lb', pound: 'lb', pounds: 'lb', each: 'ea', piece: 'ea', pieces: 'ea', pc: 'ea', pcs: 'ea', cans: 'can', slices: 'slice', cloves: 'clove', bags: 'bag', pints: 'pint' };
const normU = u => { const x = String(u || 'ea').trim().toLowerCase().replace(/\.$/, ''); return ALIAS[x] || x || 'ea'; };
const toBase = (a, u) => a * ((UNITS[normU(u)] || { f: 1 }).f);
const baseUnit = u => { const x = normU(u); const d = UNITS[x]; return d ? (d.g === 'vol' ? 'tsp' : 'oz') : x; };
const normName = n => String(n).trim().toLowerCase().replace(/\s+/g, ' ');
const ikey = (n, u) => `${normName(n)}|${baseUnit(u)}`;
const DISCRETE = new Set(['ea', 'can', 'slice', 'clove', 'bag', 'bottle', 'jar']);
const PLURAL = new Set([...DISCRETE, 'cup', 'pint']);
const PRICEF = { tsp: 48, oz: 16 }, PRICEU = { tsp: 'cup', oz: 'lb' };
const FR = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, null]];
function fracStr(n) {
  const w = Math.floor(n + 1e-9), r = n - w;
  for (const [v, t] of FR) if (Math.abs(r - v) < 0.03) { if (v === 1) return String(w + 1); return t ? (w ? `${w}${t}` : t) : String(w); }
  return null;
}
const nice = n => fracStr(n) ?? fmtN(n);
const UF = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
function parseAmt(x) {
  const t = String(x).trim().replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, c => ' ' + UF[c]).replace(/\s+/g, ' ').trim();
  if (!t) return 0;
  let m = t.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3];
  m = t.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2];
  const v = parseFloat(t); return isNaN(v) ? 0 : v;
}
function chooseUnit(q, base) {
  if (base === 'tsp') {
    const c = q / 48, fr = c - Math.floor(c + 1e-9);
    if (c >= 0.25 - 1e-9 && [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1].some(x => Math.abs(fr - x) < 0.02)) return 'cup';
    const t = q / 3; if (t >= 1 - 1e-9 && fracStr(t) !== null) return 'tbsp';
    return 'tsp';
  }
  if (base === 'oz') { const v = q / 16; if (v >= 1 - 1e-9 && fracStr(v) !== null) return 'lb'; }
  return base;
}
const unitLabel = (u, n) => u === 'ea' ? '' : (PLURAL.has(u) ? (n > 1 + 1e-9 ? u + 's' : u) : u);
const qtyText = (n, u) => `${nice(n)}${unitLabel(normU(u), n) ? ' ' + unitLabel(normU(u), n) : ''}`;
function fmtBase(q, base) { const u = chooseUnit(q, base); const f = (UNITS[u] || { f: 1 }).f; return qtyText(q / f, u); }
function roundUp(q, base) {
  if (!UNITS[base]) return Math.ceil(q - 1e-6);
  const f = UNITS[chooseUnit(q, base)].f, v = q / f;
  return fracStr(v) !== null ? q : Math.ceil(v * 4 - 1e-6) / 4 * f;
}
const PACKL = Object.fromEntries(Object.entries(PACKS).map(([k, v]) => { const [n, u] = k.split('|'); return [ikey(n, u), [v[0], toBase(v[1], u)]]; }));

function packOf(key) { const p = S.packs[key] || PACKL[key]; return p ? { name: p[0], size: p[1] } : null; }
const knownNames = () => { const seen = new Map(); S.modules.forEach(m => m.ing.forEach(i => seen.has(normName(i.n)) || seen.set(normName(i.n), i.n))); S.fridge.forEach(f => seen.has(normName(f.name)) || seen.set(normName(f.name), f.name)); return [...seen.values()].sort(); };
const canon = n => { const k = normName(n); const hit = knownNames().find(x => normName(x) === k); return hit || String(n).trim(); };
function unitConflict(name, unit, exceptId) {
  const k = normName(name), used = new Set();
  S.modules.forEach(m => { if (m.id !== exceptId) m.ing.forEach(i => { if (normName(i.n) === k) used.add(baseUnit(i.u)); }); });
  S.fridge.forEach(f => { if (normName(f.name) === k) used.add(f.unit); });
  if (!used.size || used.has(baseUnit(unit))) return '';
  const u = [...used][0];
  return `${canon(name)} is already measured ${u === 'tsp' ? 'by volume (tsp, tbsp, cup)' : u === 'oz' ? 'by weight (oz, lb)' : 'as ' + u}. Pick a matching unit.`;
}
const UNITS_F = u => (UNITS[u] || { f: 1 }).f;
const unitList = base => base === 'tsp' ? ['tsp', 'tbsp', 'cup', 'pint'] : base === 'oz' ? ['oz', 'lb'] : [base];
function unitOpts(sel, list) {
  const label = u => u === 'ea' ? 'each' : u;
  const s = normU(sel), known = ['tsp', 'tbsp', 'cup', 'pint', 'oz', 'lb', ...COUNT_UNITS];
  const opt = u => `<option value="${u}" ${u === s ? 'selected' : ''}>${label(u)}</option>`;
  if (list) return list.map(opt).join('');
  return `<optgroup label="Volume">${['tsp', 'tbsp', 'cup', 'pint'].map(opt).join('')}</optgroup><optgroup label="Weight">${['oz', 'lb'].map(opt).join('')}</optgroup><optgroup label="Count">${COUNT_UNITS.map(opt).join('')}</optgroup>${known.includes(s) ? '' : `<optgroup label="Other"><option value="${esc(s)}" selected>${esc(s)}</option></optgroup>`}`;
}
function lifeFor(name, unit) {
  const k = ikey(name, unit);
  if (S.life[k]) return S.life[k];
  const single = S.modules.find(m => m.ing.length === 1 && m.ing[0].n.toLowerCase() === name.toLowerCase());
  if (single) return single.raw;
  if (LIFE[name]) return LIFE[name];
  const any = S.modules.find(m => m.ing.some(i => i.n.toLowerCase() === name.toLowerCase()));
  return any ? Math.min(any.raw, 30) : 7;
}

// ---------- fridge ----------
const stock = key => S.fridge.filter(i => i.key === key).reduce((a, i) => a + i.qty, 0);
function addFridge(name, unit, qty, start, life) {
  const nm = canon(name), bu = baseUnit(unit);
  S.fridge.push({ id: uid(), key: ikey(nm, bu), name: nm, unit: bu, qty: toBase(qty, unit), start: start || todayIso(), life: life || lifeFor(nm, bu) });
}
function consume(key, qty) {
  const items = S.fridge.filter(i => i.key === key).sort((a, b) => (dayNum(a.start) + a.life) - (dayNum(b.start) + b.life));
  let need = qty;
  for (const it of items) { const t = Math.min(it.qty, need); it.qty -= t; need -= t; if (need <= 1e-9) break; }
  S.fridge = S.fridge.filter(i => i.qty > 1e-6);
  return Math.max(0, need);
}
const cookedBatches = mid => S.cooked[mid] || [];
const cookedTotal = mid => cookedBatches(mid).reduce((a, b) => a + b.n, 0);
function consumeCooked(mid, n) {
  const bs = cookedBatches(mid).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  let need = n;
  for (const b of bs) { const t = Math.min(b.n, need); b.n -= t; need -= t; if (need <= 1e-9) break; }
  S.cooked[mid] = bs.filter(b => b.n > 1e-6);
}
function rawLeft(m) {
  let best = Infinity;
  for (const i of m.ing) { const per = toBase(i.a, i.u) / m.makes; if (per > 0) best = Math.min(best, stock(ikey(i.n, i.u)) / per); }
  return best === Infinity ? 0 : best;
}
function ensureTally(mid) { if (S.week) S.week.tally[mid] = S.week.tally[mid] || { cooked: 0, raw: 0 }; return S.week && S.week.tally[mid]; }
function remaining(m) { const t = (S.week && S.week.tally[m.id]) || { cooked: 0, raw: 0 }; return Math.max(0, m.makes - t.cooked - t.raw); }

// ---------- shopping cart ----------
function cartLines() {
  const need = new Map();
  if (S.week) for (const id of S.week.picks) {
    const m = mod(id); if (!m) continue;
    const frac = remaining(m) / m.makes;
    for (const i of m.ing) {
      const k = ikey(i.n, i.u);
      const row = need.get(k) || { key: k, name: i.n, unit: baseUnit(i.u), need: 0, forMods: [] };
      row.need += toBase(i.a, i.u) * frac; if (!row.forMods.includes(m.name)) row.forMods.push(m.name);
      need.set(k, row);
    }
  }
  const out = [];
  for (const r of need.values()) {
    const miss = r.need - stock(r.key);
    if (miss <= 0.001) continue;
    const p = packOf(r.key);
    let buy, label, detail = '', count, pu;
    if (p) { const n = Math.ceil(miss / p.size - 1e-6); buy = n * p.size; label = plural(n, p.name); detail = `need ${fmtBase(miss, r.unit)}`; count = n; pu = p.name; }
    else { buy = roundUp(miss, r.unit); label = fmtBase(buy, r.unit); count = buy / (PRICEF[r.unit] || 1); pu = PRICEU[r.unit] || (r.unit === 'ea' ? 'each' : r.unit); }
    const price = S.prices[r.key];
    out.push({ ...r, miss, buy, label, detail, count, pu, price, total: price == null ? null : price * count });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- plan / entries ----------
const entriesOn = d => S.plan[d] || [];
function addEntry(date, slot, mid) {
  const list = S.plan[date] = S.plan[date] || [];
  const ex = list.find(e => e.slot === slot && e.mid === mid);
  if (ex) ex.n++; else list.push({ id: uid(), slot, mid, n: 1, eaten: 0 });
}
function plannedRemainingAll(mid) {
  const T = dayNum(todayIso()); let n = 0;
  for (const [d, list] of Object.entries(S.plan)) if (dayNum(d) >= T) for (const e of list) if (e.mid === mid) n += Math.max(0, e.n - e.eaten);
  return n;
}
function activeMods() {
  const ids = new Set(S.week ? S.week.picks : []);
  for (const [id, bs] of Object.entries(S.cooked)) if (bs.length) ids.add(id);
  return [...ids].map(mod).filter(Boolean);
}

// ---------- urgency ----------
const rank = u => (u.level === 'red' ? 2000 : 1000) + Math.min(u.score, 999);
function urgency(m, dateIso) {
  const D = dayNum(dateIso), T = dayNum(todayIso());
  if (D < T) return null;
  let planned = 0;
  for (const [d, list] of Object.entries(S.plan)) {
    const dn = dayNum(d);
    if (dn >= T && dn < D) for (const e of list) if (e.mid === m.id) planned += Math.max(0, e.n - e.eaten);
  }
  let rem = planned;
  const batches = cookedBatches(m.id).slice().sort((a, b) => a.date < b.date ? -1 : 1).map(b => ({ n: b.n, exp: dayNum(b.date) + m.cooked }));
  for (const b of batches) { const t = Math.min(b.n, rem); b.n -= t; rem -= t; }
  let best = null;
  const consider = (servings, exp, kind) => {
    if (servings < 0.05) return;
    const left = exp - D;
    const score = left <= 0 ? Infinity : servings / left;
    const level = (left <= 0 || score >= S.settings.red) ? 'red' : (score >= S.settings.yellow ? 'yellow' : null);
    if (!level) return;
    const u = { level, score, servings, left, kind };
    if (!best || rank(u) > rank(best)) best = u;
  };
  batches.forEach(b => consider(b.n, b.exp, 'cooked'));
  const inPicks = S.week && S.week.picks.includes(m.id);
  if (inPicks) {
    const rs = rawLeft(m) - rem;
    if (rs > 0.05) {
      let exp = Infinity;
      for (const i of m.ing) for (const f of S.fridge.filter(x => x.key === ikey(i.n, i.u))) exp = Math.min(exp, dayNum(f.start) + f.life);
      if (exp !== Infinity && exp - D <= S.settings.rawWindow) consider(rs, exp, 'raw');
    }
  }
  return best;
}
const urgLabel = u => `${fmtN(u.servings)} ${u.kind} · ${u.left < 0 ? 'expired' : u.left === 0 ? 'expires today' : plural(u.left, 'day') + ' left'}`;

// ---------- actions on food ----------
function slotGuess(m) {
  if (m.cat === 'treat') return 'treat';
  if (m.cat === 'snack') return 'snack';
  if (m.cat === 'bfast') return 'breakfast';
  const h = new Date().getHours();
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner';
}
function tsFor(date) {
  const now = new Date(); const d = parseIso(date); d.setHours(now.getHours(), now.getMinutes(), 0, 0); return d.getTime();
}
function doCook(mid, count) {
  const m = mod(mid); const n = count || m.per;
  const t = ensureTally(mid);
  let short = [];
  for (const i of m.ing) { const left = consume(ikey(i.n, i.u), toBase(i.a, i.u) * n / m.makes); if (left > 0.01) short.push(i.n); }
  (S.cooked[mid] = S.cooked[mid] || []).push({ n, date: todayIso() });
  if (t) t.cooked += n;
  return short;
}
function doEat(mid, date, slot, entryId) {
  const m = mod(mid);
  let src;
  if (cookedTotal(mid) >= 1 - 1e-9) { const oldest = cookedBatches(mid).slice().sort((a, b) => a.date < b.date ? -1 : 1)[0]; src = { k: 'c', date: oldest.date }; consumeCooked(mid, 1); }
  else {
    src = { k: 'r' };
    for (const i of m.ing) consume(ikey(i.n, i.u), toBase(i.a, i.u) / m.makes);
    const t = ensureTally(mid); if (t) t.raw += 1;
  }
  let e = entryId ? entriesOn(date).find(x => x.id === entryId) : entriesOn(date).find(x => x.mid === mid && x.eaten < x.n);
  if (e) { e.eaten++; if (e.eaten > e.n) e.n = e.eaten; slot = e.slot; }
  slot = slot || slotGuess(m);
  const ts = tsFor(date);
  const last = S.diary.find(d => d.type === 'eat' && d.mid === mid && d.slot === slot && iso(new Date(d.ts)) === date);
  if (last) { last.servings++; (last.src = last.src || []).push(src); }
  else S.diary.push({ id: uid(), ts, type: 'eat', mid, name: m.name, icon: m.icon, servings: 1, slot, rating: 0, notes: '', src: [src] });
}
function eatenCount(mid) {
  const t0 = parseIso(S.week ? S.week.start : todayIso()).getTime();
  return S.diary.filter(d => d.type === 'eat' && d.mid === mid && d.ts >= t0).reduce((a, d) => a + d.servings, 0);
}
function undoCook(mid) {
  const m = mod(mid); const bs = cookedBatches(mid).slice().sort((a, b) => a.date < b.date ? 1 : -1);
  if (!bs.length) return false;
  bs[0].n -= 1; S.cooked[mid] = S.cooked[mid].filter(x => x.n > 1e-6);
  for (const i of m.ing) addFridge(i.n, i.u, i.a / m.makes);
  const t = ensureTally(mid); if (t) t.cooked = Math.max(0, t.cooked - 1);
  return true;
}
function undoEat(mid) {
  const m = mod(mid); const e = S.diary.filter(d => d.type === 'eat' && d.mid === mid).sort((a, b) => b.ts - a.ts)[0];
  if (!e) return false;
  const src = (e.src && e.src.length) ? e.src.pop() : (m.cook ? { k: 'c', date: todayIso() } : { k: 'r' });
  e.servings -= 1; if (e.servings <= 0) S.diary = S.diary.filter(d => d !== e);
  if (src.k === 'c') (S.cooked[mid] = S.cooked[mid] || []).push({ n: 1, date: src.date || todayIso() });
  else { for (const i of m.ing) addFridge(i.n, i.u, i.a / m.makes); const t = ensureTally(mid); if (t) t.raw = Math.max(0, t.raw - 1); }
  let pe = null;
  for (const d of [ui.date, ...Object.keys(S.plan).sort().reverse()]) { pe = (S.plan[d] || []).find(x => x.mid === mid && x.eaten > 0); if (pe) break; }
  if (pe) pe.eaten -= 1;
  return true;
}
function mutate(msg, fn) {
  const snap = JSON.stringify(S);
  const extra = fn();
  save(); render();
  if (msg) toast(typeof extra === 'string' ? extra : msg, () => { S = Object.assign(fresh(), JSON.parse(snap)); save(); render(); });
}

// ---------- auto-plan ----------
function autoPlan(date) {
  const list = S.plan[date] = S.plan[date] || [];
  const used = new Set(list.map(e => e.mid));
  const act = activeMods();
  const U = {}; act.forEach(m => U[m.id] = urgency(m, date));
  const avail = m => cookedTotal(m.id) + rawLeft(m) - plannedRemainingAll(m.id);
  const score = m => (U[m.id] ? rank(U[m.id]) : 0) + (cookedTotal(m.id) - plannedRemainingAll(m.id) > 0.99 ? 500 : 0) - (m.cook && cookedTotal(m.id) < 1 ? 100 : 0);
  const choose = cats => {
    const c = act.filter(m => cats.includes(m.cat) && avail(m) >= 0.99).sort((a, b) => score(b) - score(a));
    const fresh = c.filter(m => !used.has(m.id));
    return fresh[0] || c.find(m => U[m.id]);
  };
  const roles = {
    breakfast: [['bfast'], ['fruit']],
    lunch: choose(['meal']) ? [['meal']] : [['pro'], ['fill'], ['veg']],
    dinner: [['pro'], ['fill'], ['veg']],
    snack: [['snack'], ['fruit']],
  };
  let added = 0;
  for (const [slot, rs] of Object.entries(roles)) {
    if (list.some(e => e.slot === slot)) continue;
    for (const r of rs) { const m = choose(r); if (m) { addEntry(date, slot, m.id); used.add(m.id); added++; } }
  }
  return added;
}

// ---------- icons ----------
const ico = (k, c = 'ico') => `<img class="${c}" src="assets/food/${esc(k)}.png" alt="" loading="lazy">`;
const SV = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 3L5.5 13.5H11L10 21l8.5-11H13z"/></svg>',
  bowl: '<svg viewBox="0 0 24 24"><path d="M3.5 11h17a8.5 8.5 0 01-17 0zM8 20.5h8"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none"/><path d="M12 11v6M12 7.5v.5" fill="none"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14" fill="none"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19l-4 1zM14 7l3 3" fill="none"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5" fill="none"/></svg>',
  plan: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3" fill="none"/><path d="M4 10h16M9 3v4M15 3v4M9 15l2 2 4-4" fill="none"/></svg>',
  eat: '<svg viewBox="0 0 24 24"><path d="M7 3v8a2 2 0 002 2v8M11 3v8a2 2 0 01-2 2M7 3v6M17 21V3c-2.2 1.2-3 4-3 7 0 2 1 3 3 3" fill="none"/></svg>',
  diary: '<svg viewBox="0 0 24 24"><path d="M6 4h11a2 2 0 012 2v13a1 1 0 01-1 1H7a2 2 0 01-2-2V5a1 1 0 011-1zM9 8h6M9 12h6" fill="none"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3 5h2.5l2 10h9.5l2-7.5H6.5M9.5 20h.01M16.5 20h.01" fill="none"/></svg>',
  fridge: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="3" fill="none"/><path d="M6 10h12M9 6v1.5M9 13v3" fill="none"/></svg>',
  pot: '<svg viewBox="0 0 24 24"><path d="M5 10h14v6a4 4 0 01-4 4H9a4 4 0 01-4-4zM3 12h2M19 12h2M9 7c0-1.5 1.5-1.5 1.5-3M14 7c0-1.5 1.5-1.5 1.5-3" fill="none"/></svg>',
  wand: '<svg viewBox="0 0 24 24"><path d="M5 19L16 8M14 6l1-2 1 2 2 1-2 1-1 2-1-2-2-1zM18 14l.6-1.2.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6z" fill="none"/></svg>',
};
const svg = (n, c = '') => `<span class="svg ${c}">${SV[n]}</span>`;

// ---------- toast ----------
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-a="undo">Undo</button>' : ''}`;
  t.className = 'show'; t._undo = undo;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', 4200);
}

// ---------- views ----------
function header(title, sub, n) {
  return `<header class="hero hero${n}">
    <div class="hero-text"><h1>${title}</h1><p>${sub}</p></div>
    <img class="hero-art" src="assets/header${n}.jpg" alt="">
    <button class="icon-btn hero-more" data-a="settings" aria-label="Settings">${svg('more')}</button>
  </header>`;
}

function planView() {
  const lines = cartLines();
  const picks = S.week ? S.week.picks.length : 0;
  const fridgeCount = S.fridge.length + Object.values(S.cooked).filter(b => b.length).length;
  const chips = `<div class="chips">
    <button class="chip ${ui.planTab === 'week' ? 'on' : ''}" data-a="planTab" data-t="week">${svg('plan')}<span>Week</span><small>${picks} picks</small></button>
    <button class="chip ${ui.planTab === 'fridge' ? 'on' : ''}" data-a="planTab" data-t="fridge">${svg('fridge')}<span>Fridge</span><small>${fridgeCount} items</small></button>
    <button class="chip ${ui.planTab === 'cart' ? 'on' : ''}" data-a="planTab" data-t="cart">${svg('cart')}<span>Shopping</span><small>${lines.length} to buy</small></button>
  </div>`;
  let body = '';
  if (ui.planTab === 'fridge') body = fridgeView();
  else if (ui.planTab === 'cart') body = cartView(lines);
  else if (ui.picking) return `<div class="page">${header('Plan', 'Build your meal', 1)}${chips}${pickerView(lines)}</div>`;
  else body = weekSummary(lines);
  return `<div class="page">${header('Plan', 'Build your meal', 1)}${chips}${body}</div>`;
}

function weekSummary(lines) {
  if (!S.week) return `<section class="empty">
      ${ico('salad-bowl', 'ico xl')}
      <h2>No week planned yet</h2>
      <p>Pick your sides, proteins and snacks once. The app works out what to buy and what to eat each day.</p>
      <button class="btn primary" data-a="startWeek">Start new week</button>
    </section>`;
  const w = S.week;
  const groups = CATS.map(c => ({ c, ms: w.picks.map(mod).filter(m => m && m.cat === c.id) })).filter(g => g.ms.length);
  return `<section class="summary">
    <div class="sumhead">
      <div><h2>${w.locked ? 'Week locked in' : 'Draft week'}</h2><p>Week of ${parseIso(mondayOf(w.start)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${w.picks.length} picks · ${lines.length} to buy</p></div>
      ${w.locked ? `<span class="pill ok">${svg('check')}Locked</span>` : ''}
    </div>
    ${groups.length ? groups.map(g => `<div class="sgroup" style="--bg:${g.c.bg};--ink:${g.c.ink}">
        <h3>${g.c.short}</h3>
        <div class="schips">${g.ms.map(m => `<button class="schip" data-a="info" data-m="${m.id}">${ico(m.icon)}<span>${esc(m.name)}</span></button>`).join('')}</div>
      </div>`).join('') : '<p class="muted pad">Nothing picked yet.</p>'}
    <div class="actions">
      <button class="btn primary" data-a="editWeek">${w.locked ? 'Edit week' : 'Continue planning'}</button>
      <button class="btn" data-a="planTab" data-t="cart">Shopping cart (${lines.length})</button>
      <button class="btn ghost" data-a="startWeek">Start new week</button>
    </div>
  </section>`;
}

function pickerView(lines) {
  const steps = CATS.length;
  const w = S.week;
  const stepper = `<div class="stepper">${CATS.map((c, i) => {
    const n = w.picks.filter(id => (mod(id) || {}).cat === c.id).length;
    return `<button class="step ${i === ui.step ? 'on' : ''} ${n ? 'has' : ''}" data-a="goStep" data-s="${i}" style="--bg:${c.bg}">${ico(c.icon)}${n ? `<b>${n}</b>` : ''}</button>`;
  }).join('')}<button class="step ${ui.step === steps ? 'on' : ''}" data-a="goStep" data-s="${steps}">${svg('check')}</button></div>`;
  const top = `<div class="pickhead"><button class="linkbtn" data-a="closePicker">${svg('back')}This week</button><span class="muted">Step ${Math.min(ui.step + 1, steps + 1)} of ${steps + 1}</span></div>`;
  if (ui.step >= steps) {
    const groups = CATS.map(c => ({ c, n: w.picks.filter(id => (mod(id) || {}).cat === c.id).length }));
    return `${top}${stepper}<section class="review">
      <h2>Ready to lock in?</h2>
      <p class="muted">${w.picks.length} picks. ${lines.length ? `${lines.length} items to buy after what's already in your fridge.` : 'Your fridge already covers everything.'}</p>
      <div class="rgrid">${groups.map(g => `<button class="rcell" style="--bg:${g.c.bg};--ink:${g.c.ink}" data-a="goStep" data-s="${CATS.indexOf(g.c)}">${ico(g.c.icon)}<b>${g.n}</b><span>${g.c.short}</span></button>`).join('')}</div>
    </section>
    <div class="pickbar"><button class="btn" data-a="prevStep">Back</button><button class="btn primary grow" data-a="lockWeek">${svg('check')}Lock in week</button></div>`;
  }
  const c = CATS[ui.step];
  const ms = S.modules.filter(m => m.cat === c.id);
  const n = w.picks.filter(id => (mod(id) || {}).cat === c.id).length;
  const cards = ms.map(m => {
    const on = w.picks.includes(m.id);
    const miss = on && m.ing.some(i => stock(ikey(i.n, i.u)) < toBase(i.a, i.u) * remaining(m) / m.makes - 0.001);
    return `<div class="card ${on ? 'on' : ''}" style="--bg:${c.bg}" data-a="pick" data-m="${m.id}">
      <button class="cinfo" data-a="info" data-m="${m.id}" aria-label="Details for ${esc(m.name)}">${svg('info')}</button>
      <span class="ccheck ${on ? 'on' : ''}">${on ? svg('check') : ''}</span>
      ${ico(m.icon, 'ico big')}
      <b>${esc(m.name)}</b>
      <small>${on ? (miss ? 'In cart' : 'In fridge') : `${m.makes} servings`}</small>
    </div>`;
  }).join('');
  return `${top}${stepper}<section class="pickbody">
      <h2>Choose your ${c.name.toLowerCase()}</h2>
      <p class="muted">${c.hint} <b>${n}</b> chosen.</p>
      <div class="grid">${cards}
        <button class="card add" data-a="editMod" data-m="new:${c.id}">${svg('plus')}<b>Add module</b></button>
      </div>
    </section>
    <div class="pickbar">
      <button class="btn" data-a="${ui.step ? 'prevStep' : 'closePicker'}">${ui.step ? 'Back' : 'Done'}</button>
      <button class="btn primary grow" data-a="nextStep">Continue ${svg('fwd')}</button>
    </div>`;
}

function cartView(lines) {
  if (!S.week || !S.week.picks.length) return `<section class="empty"><h2>Nothing to buy yet</h2><p>Pick modules for the week and the cart fills in automatically.</p><button class="btn primary" data-a="planTab" data-t="week">Go to this week</button></section>`;
  if (!lines.length) return `<section class="empty">${ico('rice', 'ico xl')}<h2>You're covered</h2><p>Your fridge has everything this week needs.</p></section>`;
  const priced = lines.filter(l => l.total != null);
  const sum = priced.reduce((a, l) => a + l.total, 0);
  return `<section class="list">
    <div class="totalcard"><div><small>Estimated total</small><b>$${sum.toFixed(2)}</b></div><span class="muted">${priced.length} of ${lines.length} priced${priced.length < lines.length ? '. Add a price to each line.' : ''}</span></div>
    <p class="muted pad">Needed for this week, minus what's already in your fridge.</p>
    ${lines.map(l => `<div class="row cart">
      <div class="rinfo"><b>${esc(l.name)}</b><small>${esc(l.label)}${l.detail ? ' · ' + l.detail : ''}</small><small class="for">For ${esc(l.forMods.slice(0, 3).join(', '))}${l.forMods.length > 3 ? '…' : ''}</small></div>
      <button class="btn small primary" data-a="cartAdd" data-k="${esc(l.key)}">${svg('plus')}To fridge</button>
      <div class="pricerow"><label class="pricebox"><span>$</span><input class="price-in" data-k="${esc(l.key)}" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${l.price ?? ''}" aria-label="Price per ${esc(l.pu)} of ${esc(l.name)}"><em>per ${esc(l.pu)}</em></label><b class="ltotal">${l.total != null ? '$' + l.total.toFixed(2) : ''}</b></div>
    </div>`).join('')}
    <div class="actions"><button class="btn primary" data-a="cartAddAll">Add all ${lines.length} to fridge</button></div>
  </section>`;
}

function fridgeView() {
  const T = dayNum(todayIso());
  const cooked = Object.entries(S.cooked).filter(([id, b]) => b.length && mod(id)).map(([id, b]) => {
    const m = mod(id); const first = b.slice().sort((x, y) => x.date < y.date ? -1 : 1)[0];
    return { m, n: b.reduce((a, x) => a + x.n, 0), left: dayNum(first.date) + m.cooked - T };
  });
  const byKey = {};
  S.fridge.forEach(i => { const o = byKey[i.key] = byKey[i.key] || { key: i.key, name: i.name, unit: i.unit, qty: 0, left: Infinity }; o.qty += i.qty; o.left = Math.min(o.left, dayNum(i.start) + i.life - T); });
  const ings = Object.values(byKey).sort((a, b) => a.left - b.left);
  const lvl = left => left <= 0 ? 'red' : left <= S.settings.rawWindow ? 'yellow' : '';
  const dl = left => left < 0 ? 'expired' : left === 0 ? 'today' : left > 60 ? '' : `${left}d`;
  return `<section class="fridge">
    <div class="fridge-art"><img src="assets/fridge.png" alt=""><div><h2>In your fridge</h2><p class="muted">${cooked.length} cooked · ${ings.length} ingredients</p><button class="btn small primary" data-a="addItem">${svg('plus')}Add item</button></div></div>
    <h3 class="sub">Cooked and ready</h3>
    ${cooked.length ? `<div class="tiles">${cooked.map(c => `<button class="tile ${lvl(c.left)}" data-a="tossCooked" data-m="${c.m.id}">${ico(c.m.icon)}<b>${esc(c.m.name)}</b><small>${plural(c.n, 'serving')}${dl(c.left) ? ' · ' + dl(c.left) : ''}</small></button>`).join('')}</div>` : '<p class="muted pad">Nothing cooked yet. Log a cook on the Eat page.</p>'}
    <h3 class="sub">Ingredients</h3>
    ${ings.length ? `<div class="tiles">${ings.map(i => {
      const p = packOf(i.key);
      return `<button class="tile ${lvl(i.left)}" data-a="tossIng" data-k="${esc(i.key)}"><b>${esc(i.name)}</b><span class="qty">${p ? plural(i.qty / p.size, p.name) : fmtBase(i.qty, i.unit)}</span><small>${p ? fmtBase(i.qty, i.unit) + ' · ' : ''}${dl(i.left) || 'keeps well'}</small></button>`;
    }).join('')}</div>` : '<p class="muted pad">Empty. Add what you buy from the Shopping tab.</p>'}
  </section>`;
}

// ----- Eat page -----
function dayStrip() {
  const start = mondayOf(ui.date); const today = todayIso();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return `<div class="daystrip">
    <button class="icon-btn" data-a="weekShift" data-d="-1" aria-label="Previous week">${svg('back')}</button>
    ${days.map(d => {
      const es = entriesOn(d); const dots = es.slice(0, 4).map(e => `<i class="${e.eaten >= e.n ? 'done' : ''}"></i>`).join('');
      return `<button class="day ${d === ui.date ? 'on' : ''} ${d === today ? 'today' : ''}" data-a="pickDay" data-d="${d}"><small>${parseIso(d).toLocaleDateString(undefined, { weekday: 'short' })}</small><b>${parseIso(d).getDate()}</b><span class="dots">${dots}</span></button>`;
    }).join('')}
    <button class="icon-btn" data-a="weekShift" data-d="1" aria-label="Next week">${svg('fwd')}</button>
  </div>
  <p class="daylabel">${fmtDay(ui.date)}${ui.date === today ? ' · Today' : ''}</p>`;
}

function btnsFor(m, date, entryId) {
  const canCook = m.cook && (S.week && S.week.picks.includes(m.id)) && remaining(m) > 0.01;
  return `${canCook ? `<button class="btn small amber" data-a="cook" data-m="${m.id}">Cooked +${m.per}</button>` : ''}
    <button class="btn eat" data-a="eat" data-m="${m.id}" ${entryId ? `data-e="${entryId}"` : ''}>${svg('eat')}Eaten +1</button>`;
}
function tallyLine(m) {
  const t = (S.week && S.week.tally[m.id]) || { cooked: 0 };
  const parts = m.cook ? [`Cooked ${nice(t.cooked)}`, `Eaten ${eatenCount(m.id)}`, `${nice(cookedTotal(m.id))} ready`] : [`Eaten ${eatenCount(m.id)}`, `${nice(rawLeft(m))} in fridge`];
  return `<button class="tally" data-a="tally" data-m="${m.id}" aria-label="Edit cooked and eaten for ${esc(m.name)}">${parts.join(' · ')}${svg('edit')}</button>`;
}
function stateLine(m) {
  const c = cookedTotal(m.id), r = rawLeft(m);
  const parts = [];
  if (m.cook) { parts.push(c ? `${fmtN(c)} cooked` : 'not cooked'); if (r >= 0.05) parts.push(`${fmtN(r)} raw`); }
  else parts.push(r >= 0.05 ? `${fmtN(r)} in fridge` : 'none in fridge');
  return parts.join(' · ');
}

function eatView() {
  const date = ui.date; const today = todayIso();
  const act = activeMods();
  let body = '';
  if (!act.length) {
    body = `<section class="empty">${ico('stir-fry', 'ico xl')}<h2>Nothing planned yet</h2><p>Pick this week's modules on the Plan tab, then come back to cook, eat and log.</p><button class="btn primary" data-a="tab" data-t="plan">Go to Plan</button></section>`;
  } else {
    const unassigned = act.reduce((a, m) => a + Math.max(0, cookedTotal(m.id) - plannedRemainingAll(m.id)), 0);
    const soon = act.map(m => ({ m, u: urgency(m, date) })).filter(x => x.u).sort((a, b) => rank(b.u) - rank(a.u));
    body += `<div class="autobar">
      ${date >= today ? `<button class="btn primary" data-a="autoPlan">${svg('wand')}Auto-plan my day</button>` : ''}
      <span class="muted">${unassigned > 0.05 ? `${fmtN(unassigned)} cooked serving${unassigned === 1 ? '' : 's'} unassigned` : 'All cooked servings assigned'}</span>
    </div>`;
    if (soon.length) body += `<section class="soon"><h3>Use soon</h3>${soon.map(({ m, u }) => `<div class="erow ${u.level}">
        <button class="icobtn" data-a="info" data-m="${m.id}" aria-label="Details for ${esc(m.name)}">${ico(m.icon)}</button><div class="einfo"><button class="nameb" data-a="info" data-m="${m.id}">${esc(m.name)}</button><span class="flag ${u.level}">${urgLabel(u)}</span>${tallyLine(m)}</div>
        <div class="ebtns">${btnsFor(m, date)}<button class="icon-btn" data-a="assign" data-m="${m.id}" aria-label="Plan ${esc(m.name)}">${svg('star')}</button></div>
      </div>`).join('')}</section>`;
    body += SLOTS.map(s => {
      const es = entriesOn(date).filter(e => e.slot === s.id && mod(e.mid));
      return `<section class="slot">
        <div class="slothead">${ico(s.icon)}<h3>${s.name}</h3><button class="icon-btn" data-a="addTo" data-s="${s.id}" aria-label="Add to ${s.name}">${svg('plus')}</button></div>
        ${es.length ? es.map(e => { const m = mod(e.mid); const done = e.eaten >= e.n;
          return `<div class="erow ${done ? 'done' : ''}">
            <button class="icobtn" data-a="info" data-m="${m.id}" aria-label="Details for ${esc(m.name)}">${ico(m.icon)}</button><div class="einfo"><button class="nameb" data-a="info" data-m="${m.id}">${esc(m.name)}</button><span>${e.eaten} of ${e.n} planned eaten</span>${tallyLine(m)}</div>
            <div class="ebtns">
              <span class="stepper-s"><button data-a="entryInc" data-e="${e.id}" data-d="-1" aria-label="Fewer">${svg('minus')}</button><b>${e.n}</b><button data-a="entryInc" data-e="${e.id}" data-d="1" aria-label="More">${svg('plus')}</button></span>
              ${btnsFor(m, date, e.id)}
              <button class="icon-btn" data-a="entryRm" data-e="${e.id}" aria-label="Remove">${svg('x')}</button>
            </div></div>`; }).join('') : `<button class="slotempty" data-a="addTo" data-s="${s.id}">${svg('plus')}Add something</button>`}
      </section>`;
    }).join('');
    const groups = CATS.map(c => ({ c, ms: act.filter(m => m.cat === c.id) })).filter(g => g.ms.length);
    body += `<h3 class="sub">This week's modules</h3>` + groups.map(g => `<section class="mgroup" style="--bg:${g.c.bg};--ink:${g.c.ink}"><h4>${g.c.short}</h4>${g.ms.map(m => {
      const planned = entriesOn(date).some(e => e.mid === m.id);
      return `<div class="mrow"><button class="icobtn" data-a="info" data-m="${m.id}" aria-label="Details for ${esc(m.name)}">${ico(m.icon)}</button><div class="einfo"><button class="nameb" data-a="info" data-m="${m.id}">${esc(m.name)}</button>${tallyLine(m)}</div>
        <div class="ebtns">${btnsFor(m, date)}${cookedTotal(m.id) > 0 ? `<button class="icon-btn" data-a="tossCooked" data-m="${m.id}" aria-label="Throw out">${svg('trash')}</button>` : ''}<button class="icon-btn ${planned ? 'starred' : ''}" data-a="assign" data-m="${m.id}" aria-label="Plan ${esc(m.name)}">${svg('star')}</button></div></div>`;
    }).join('')}</section>`).join('');
  }
  return `<div class="page">${header('Eat', 'Plan it, cook it, log it.', 2)}${dayStrip()}${body}</div>`;
}

// ----- Diary -----
function diaryView() {
  const list = S.diary.slice().sort((a, b) => b.ts - a.ts);
  const days = {};
  list.forEach(d => { const k = iso(new Date(d.ts)); (days[k] = days[k] || []).push(d); });
  const today = todayIso();
  const slotName = id => (SLOTS.find(s => s.id === id) || { name: 'Meal' }).name;
  const body = list.length ? Object.entries(days).map(([k, es]) => `<h3 class="daytitle">${k === today ? 'Today' : fmtDay(k)}</h3>` + es.map(d => d.type === 'toss'
    ? `<article class="entry toss"><div class="ehead"><span>Threw out</span><small>${fmtTime(d.ts)}</small></div><div class="ebody">${d.icon ? ico(d.icon) : `<span class="svg big">${SV.trash}</span>`}<b>${esc(d.name)} ×${fmtN(d.servings)}</b></div></article>`
    : `<article class="entry"><div class="ehead"><span>${slotName(d.slot)}</span><small>${fmtTime(d.ts)}</small></div>
        <div class="ebody">${ico(d.icon || 'other-meal')}<b>${esc(d.name)}${d.servings > 1 ? ' ×' + d.servings : ''}</b></div>
        <div class="rates">${[['rating', 'Taste', 'star'], ['energy', 'Energy', 'bolt'], ['filling', 'Filling', 'bowl']].map(([f, label, ic]) => `<div class="rate ${f}"><span>${label}</span><div class="stars">${[1, 2, 3, 4, 5].map(i => `<button class="${(d[f] || 0) >= i ? 'on' : ''}" data-a="rate" data-i="${d.id}" data-f="${f}" data-r="${i}" aria-label="${label} ${i} of 5">${SV[ic]}</button>`).join('')}</div></div>`).join('')}</div>
        ${d.notes ? `<p class="note">“${esc(d.notes)}”</p>` : ''}
        <button class="linkbtn" data-a="thoughts" data-i="${d.id}">${d.notes ? 'Edit thoughts' : 'Add thoughts'}</button></article>`).join('')).join('')
    : `<section class="empty">${ico('oatmeal', 'ico xl')}<h2>Your food journal is empty</h2><p>Tap Eaten +1 on the Eat page and it shows up here. Rate it and jot a note.</p></section>`;
  return `<div class="page">${header('Diary', 'Your food journal', 3)}<div class="diary"><button class="btn primary logbtn" data-a="logFood">${svg('plus')}Log food</button>${body}</div></div>`;
}

// ---------- sheets ----------
function sheetHtml() {
  const s = ui.sheet; if (!s) return '';
  let inner = '', cls = '';
  if (s.t === 'info') {
    const m = mod(s.mid); if (!m) return ''; const c = cat(m.cat); cls = 'flip';
    const on = S.week && S.week.picks.includes(m.id);
    inner = `<div class="cardback" style="--bg:${c.bg};--ink:${c.ink}">
      <div class="cbtop">${ico(m.icon, 'ico big')}<div><h2>${esc(m.name)}</h2><p class="muted">${c.name} · makes ${m.makes} servings · ${m.per} per cook</p></div></div>
      <h4>Ingredients</h4>
      <ul class="ings">${m.ing.map(i => `<li><span>${esc(i.n)}</span><b>${qtyText(i.a, i.u)}</b><small>${fmtBase(toBase(i.a, i.u) / m.makes, baseUnit(i.u))} / serving · in fridge: ${stock(ikey(i.n, i.u)) > 0.001 ? fmtBase(stock(ikey(i.n, i.u)), baseUnit(i.u)) : 'none'}</small></li>`).join('')}</ul>
      <h4>Prep</h4><p>${esc(m.method) || '<span class="muted">No prep notes yet.</span>'}</p>
      <h4>Storage</h4><p>${esc(m.storage) || esc(STORAGE_DEFAULT[m.cat])}</p>
      <h4>Shelf life</h4>
      <div class="life"><div><b>${m.raw >= 365 ? Math.round(m.raw / 365 * 10) / 10 + ' yr' : m.raw + ' d'}</b><small>raw</small></div>${m.cook ? `<div><b>${m.cooked} d</b><small>cooked</small></div>` : ''}</div>
      ${(() => { const rs = S.diary.filter(d => d.type === 'eat' && d.mid === m.id); if (!rs.length) return ''; const avg = f => { const v = rs.map(d => d[f]).filter(x => x > 0); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'; }; return `<h4>How it's gone</h4><div class="life"><div><b>${avg('rating')}</b><small>taste</small></div><div><b>${avg('energy')}</b><small>energy</small></div><div><b>${avg('filling')}</b><small>filling</small></div></div><small class="muted">Average across ${rs.reduce((a, d) => a + d.servings, 0)} servings you've logged.</small>`; })()}
      <div class="sheetbtns"><button class="btn" data-a="editMod" data-m="${m.id}">Edit</button>
      ${S.week && ui.tab === 'plan' ? `<button class="btn primary grow" data-a="pick" data-m="${m.id}" data-close="1">${on ? 'Remove from week' : 'Add to week'}</button>` : `<button class="btn primary grow" data-a="closeSheet">Done</button>`}</div></div>`;
  }
  if (s.t === 'edit') {
    const d = ui.draft; const c = cat(d.cat);
    inner = `<h2>${d.isNew ? 'New module' : 'Edit module'}</h2>
      <div class="editrow"><button class="iconpick" data-a="toggleIcons">${ico(d.icon, 'ico big')}<small>Change</small></button>
        <label class="grow">Name<input data-f="name" value="${esc(d.name)}" placeholder="e.g. Hot honey chicken"></label></div>
      ${ui.iconOpen ? `<div class="iconlist">${ALL_ICONS.map(k => `<button class="${k === d.icon ? 'on' : ''}" data-a="setIcon" data-k="${k}">${ico(k)}</button>`).join('')}</div>` : ''}
      <label>Category<select data-f="cat">${CATS.map(x => `<option value="${x.id}" ${x.id === d.cat ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
      <h4>Ingredients</h4>
      ${d.ing.map((i, n) => `<div class="ingrow"><input data-f="n" data-i="${n}" list="ingnames" value="${esc(i.n)}" placeholder="Ingredient"><input data-f="a" data-i="${n}" type="text" inputmode="text" placeholder="1/2" value="${esc(nice(i.a))}" aria-label="Amount"><select data-f="u" data-i="${n}" aria-label="Unit">${unitOpts(i.u)}</select><button class="icon-btn" data-a="rmIng" data-i="${n}" aria-label="Remove ingredient">${svg('x')}</button></div>`).join('')}
      <datalist id="ingnames">${knownNames().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <button class="linkbtn" data-a="addIng">${svg('plus')}Add ingredient</button>
      <div class="two"><label>Makes (servings)<input data-f="makes" type="number" inputmode="numeric" value="${d.makes}"></label><label>Per cook<input data-f="per" type="number" inputmode="numeric" value="${d.per}"></label></div>
      <div class="two"><label>Raw life (days)<input data-f="raw" type="number" inputmode="numeric" value="${d.raw}"></label><label>Cooked life (days)<input data-f="cooked" type="number" inputmode="numeric" value="${d.cooked}"></label></div>
      <label class="check"><input type="checkbox" data-f="cook" ${d.cook ? 'checked' : ''}> Needs cooking before eating</label>
      <label>Storage<textarea data-f="storage" rows="2">${esc(d.storage)}</textarea></label>
      <label>Method &amp; notes<textarea data-f="method" rows="3">${esc(d.method)}</textarea></label>
      <div class="sheetbtns">${d.isNew ? '' : `<button class="btn danger" data-a="delMod">${svg('trash')}</button>`}<button class="btn" data-a="closeSheet">Cancel</button><button class="btn primary grow" data-a="saveMod">Save</button></div>`;
  }
  if (s.t === 'confirmWeek') inner = `<h2>Start a new week?</h2><p class="muted">Your current plan is archived. Your fridge, cooked leftovers and diary carry over.</p><div class="sheetbtns"><button class="btn" data-a="closeSheet">Cancel</button><button class="btn primary grow" data-a="newWeek">Start new week</button></div>`;
  if (s.t === 'assign') {
    const m = mod(s.mid);
    inner = `<h2>Plan ${esc(m.name)}</h2><p class="muted">${fmtDay(ui.date)}. Choose a slot.</p><div class="slotgrid">${SLOTS.map(sl => { const n = entriesOn(ui.date).filter(e => e.slot === sl.id && e.mid === m.id).reduce((a, e) => a + e.n, 0);
      return `<button class="slotbtn" data-a="assignTo" data-m="${m.id}" data-s="${sl.id}">${ico(sl.icon)}<b>${sl.name}</b>${n ? `<small>${n} planned</small>` : ''}</button>`; }).join('')}</div>`;
  }
  if (s.t === 'addTo') {
    const sl = SLOTS.find(x => x.id === s.slot); const act = activeMods();
    const groups = CATS.map(c => ({ c, ms: act.filter(m => m.cat === c.id) })).filter(g => g.ms.length);
    inner = `<h2>Add to ${sl.name}</h2>${groups.length ? groups.map(g => `<h4>${g.c.short}</h4><div class="chiplist">${g.ms.map(m => `<button class="mchip" style="--bg:${g.c.bg}" data-a="assignTo" data-m="${m.id}" data-s="${sl.id}" data-keep="1">${ico(m.icon)}<span>${esc(m.name)}</span></button>`).join('')}</div>`).join('') : '<p class="muted">Pick this week\'s modules on the Plan tab first.</p>'}<div class="sheetbtns"><button class="btn primary grow" data-a="closeSheet">Done</button></div>`;
  }
  if (s.t === 'thoughts') {
    const d = S.diary.find(x => x.id === s.id); if (!d) return '';
    inner = `<h2>${esc(d.name)}</h2><label>Your thoughts<textarea id="notes" rows="4" placeholder="How did it taste? How did you feel after? What would you change?">${esc(d.notes)}</textarea></label><div class="sheetbtns"><button class="btn danger" data-a="delEntry" data-i="${d.id}" aria-label="Delete entry">${svg('trash')}</button><button class="btn" data-a="closeSheet">Cancel</button><button class="btn primary grow" data-a="saveThoughts">Save thoughts</button></div><p class="muted tiny">Deleting an entry doesn't put food back in your fridge.</p>`;
  }
  if (s.t === 'toss') {
    let title, max, step, info;
    if (s.kind === 'cooked') { const m = mod(s.mid); title = m.name; max = cookedTotal(m.id); step = 1; info = `${fmtN(max)} cooked serving${max === 1 ? '' : 's'} in the fridge`; }
    else { const items = S.fridge.filter(i => i.key === s.key); if (!items.length) return ''; title = items[0].name; max = stock(s.key); const u = items[0].unit; step = u === 'tsp' ? (max <= 12 ? 1 : max <= 96 ? 3 : 12) : u === 'oz' ? (max <= 16 ? 1 : 4) : 1; info = `${fmtBase(max, u)} in the fridge`; s.unit = u; }
    s.max = max; s.step = step; ui.tossAmt = Math.min(Math.max(ui.tossAmt, 1), max);
    inner = `<h2>${esc(title)}</h2><p class="muted">${info}</p>
      <h4>Throw out</h4>
      <div class="bigstep"><button data-a="tossInc" data-d="-1" aria-label="Less">${svg('minus')}</button><b>${s.kind === 'ing' ? fmtBase(ui.tossAmt, s.unit) : fmtN(ui.tossAmt)}</b><button data-a="tossInc" data-d="1" aria-label="More">${svg('plus')}</button><button class="linkbtn" data-a="tossAll">All</button></div>
      <div class="sheetbtns"><button class="btn" data-a="closeSheet">Cancel</button><button class="btn danger-fill grow" data-a="doToss">${svg('trash')}Throw out</button></div>
      ${s.kind === 'ing' ? `<h4>Fix the count</h4><div class="ingrow setrow"><input id="setq" type="number" inputmode="decimal" step="any" placeholder="${nice(max / UNITS_F(chooseUnit(max, s.unit)))}"><select id="setu" aria-label="Unit">${unitOpts(chooseUnit(max, s.unit), unitList(s.unit))}</select><button class="btn small" data-a="setQty">Set quantity</button></div>` : ''}`;
  }
  if (s.t === 'tally') {
    const m = mod(s.mid); if (!m) return '';
    const t = (S.week && S.week.tally[m.id]) || { cooked: 0 }; const eaten = eatenCount(m.id), ready = cookedTotal(m.id);
    const stepper = (act, n, minusOff) => `<div class="bigstep sm"><button data-a="${act}" data-d="-1" ${minusOff ? 'disabled' : ''} aria-label="One fewer">${svg('minus')}</button><b>${nice(n)}</b><button data-a="${act}" data-d="1" aria-label="One more">${svg('plus')}</button></div>`;
    inner = `<h2>${esc(m.name)}</h2><p class="muted">This week · makes ${m.makes} servings</p>
      ${m.cook ? `<div class="tallyrow"><div><b>Cooked</b><small>${ready < 1 ? 'Nothing cooked is left in the fridge to remove.' : 'Adding uses ingredients from your fridge. Removing puts them back.'}</small></div>${stepper('tallyCook', t.cooked, ready < 1)}</div>` : ''}
      <div class="tallyrow"><div><b>Eaten</b><small>${eaten ? 'Removing takes the latest serving out of your diary and puts the food back.' : 'Nothing eaten yet this week.'}</small></div>${stepper('tallyEat', eaten, eaten < 1)}</div>
      <div class="facts"><div><b>${nice(ready)}</b><small>${m.cook ? 'cooked, ready to eat' : 'prepared'}</small></div><div><b>${nice(rawLeft(m))}</b><small>servings of raw ingredients</small></div></div>
      <div class="sheetbtns">${ready >= 1 ? `<button class="btn danger" data-a="tallyToss" data-m="${m.id}" aria-label="Throw some out">${svg('trash')}</button>` : ''}<button class="btn primary grow" data-a="closeSheet">Done</button></div>`;
  }
  if (s.t === 'logfood') {
    const L = ui.log; const now = new Date();
    inner = `<h2>Log food</h2><p class="muted">For meals that didn't come from your fridge, like eating out. Your fridge isn't changed.</p>
      <div class="editrow"><button class="iconpick" data-a="logIcons">${ico(L.icon, 'ico big')}<small>Change</small></button>
        <label class="grow">What did you eat?<input id="lg-n" value="${esc(L.name)}" placeholder="e.g. Burrito bowl at Chipotle"></label></div>
      ${L.iconOpen ? `<div class="iconlist">${ALL_ICONS.map(k => `<button class="${k === L.icon ? 'on' : ''}" data-a="setLogIcon" data-k="${k}">${ico(k)}</button>`).join('')}</div>` : ''}
      <label>Meal<select id="lg-s">${SLOTS.map(x => `<option value="${x.id}" ${x.id === L.slot ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
      <div class="two"><label>Date<input id="lg-d" type="date" value="${L.date}"></label><label>Time<input id="lg-t" type="time" value="${L.time}"></label></div>
      <label>Servings<input id="lg-q" type="number" inputmode="numeric" min="1" value="${L.servings}"></label>
      <label>Your thoughts<textarea id="lg-o" rows="2" placeholder="Optional">${esc(L.notes)}</textarea></label>
      <div class="sheetbtns"><button class="btn" data-a="closeSheet">Cancel</button><button class="btn primary grow" data-a="saveLog">Add to journal</button></div>`;
  }
  if (s.t === 'addItem') inner = `<h2>Add to fridge</h2><label>Item<input id="ai-n" list="ingnames" placeholder="e.g. Parsley"></label><datalist id="ingnames">${knownNames().map(x => `<option value="${esc(x)}">`).join('')}</datalist><div class="two"><label>Quantity<input id="ai-q" type="text" inputmode="text" value="1" placeholder="1/2"></label><label>Unit<select id="ai-u">${unitOpts('ea')}</select></label></div><label>Keeps for (days)<input id="ai-l" type="number" inputmode="numeric" placeholder="auto"></label><div class="sheetbtns"><button class="btn" data-a="closeSheet">Cancel</button><button class="btn primary grow" data-a="saveItem">Add to fridge</button></div>`;
  if (s.t === 'settings') inner = `<h2>Settings</h2>
    <h4>Use-it-up warnings</h4>
    <p class="muted">Food turns yellow, then red, on the Eat page when you'd have to eat this many servings a day to finish it before it goes bad. Food that expires today is always red.</p>
    <label>Turns yellow at<div class="inline"><input id="st-y" type="number" inputmode="decimal" min="0.1" step="0.1" value="${S.settings.yellow}"><span>servings a day</span></div></label>
    <label>Turns red at<div class="inline"><input id="st-r" type="number" inputmode="decimal" min="0.1" step="0.1" value="${S.settings.red}"><span>servings a day</span></div></label>
    <label>Start watching raw food<div class="inline"><input id="st-w" type="number" inputmode="numeric" min="1" step="1" value="${S.settings.rawWindow}"><span>days before it expires</span></div></label>
    <p class="muted tiny">Example: 2 cooked servings with 2 days left is 1 serving a day. Changes save as you type.</p>
    <h4>Your data</h4>
    <div class="sheetbtns col"><button class="btn" data-a="exportData">Export backup</button><label class="btn filebtn">Import backup<input type="file" accept="application/json" id="imp" hidden></label><button class="btn danger" data-a="resetModules">Reset module library</button></div>
    <p class="muted tiny">Everything is stored on this device only. Export a backup now and then.</p>
    <p class="version">Meal Loop · version ${APP_VERSION}</p>`;
  return `<div class="backdrop" data-a="closeSheet"></div><div class="panel ${cls}"><div class="grab"></div>${inner}</div>`;
}
const ALL_ICONS = ['carrots', 'brussels-sprouts', 'cucumber', 'butternut-squash', 'tomatoes', 'tomato-cucumber-salad', 'green-beans', 'bell-peppers', 'broccoli', 'sweet-potato', 'salad-greens', 'spinach', 'chicken', 'chickpeas', 'eggs', 'hummus', 'black-beans', 'lentils', 'salmon', 'tofu', 'greek-yogurt', 'turkey', 'mac-cheese', 'pita', 'rice', 'pasta', 'potatoes', 'bread', 'ramen-noodles', 'tortillas', 'couscous', 'bagels', 'quinoa', 'other-grain', 'hot-honey', 'tahini-lemon', 'feta', 'tomato-sauce', 'pesto', 'salsa', 'soy-sesame', 'garlic-butter', 'yogurt-sauce', 'lemon-olive-oil', 'favorite-dressing', 'bananas', 'apples', 'strawberries', 'blueberries', 'grapes', 'mandarins', 'peaches', 'melon', 'cereal-milk', 'eggs-toast-b', 'yogurt-fruit-granola', 'avocado-toast-egg', 'bagel-cream-cheese', 'oatmeal', 'purchased-breakfast', 'apple-pb', 'crackers-cheese', 'hummus-veggies', 'yogurt', 'trail-mix', 'popcorn', 'granola-bar', 'fruit-snack', 'cheese-fruit', 'rice-cakes', 'nut-butter-banana', 'chicken-noodle-soup', 'ramen-egg', 'takeout', 'frozen-meal', 'quesadilla', 'cereal-dinner', 'eggs-toast', 'soup-bread', 'pasta-sauce', 'stir-fry', 'salad-bowl', 'other-meal', 'cookies', 'ice-cream', 'chocolate', 'brownie', 'pastry', 'chips', 'candy', 'seasonal', 'croissant', 'cake', 'donut'];

// ---------- render ----------
function render() { renderMain(); renderSheet(); }
function renderMain() {
  const view = $('#view'); const keep = view.scrollTop; const prevTab = view.dataset.tab;
  view.innerHTML = ui.tab === 'plan' ? planView() : ui.tab === 'eat' ? eatView() : diaryView();
  view.dataset.tab = ui.tab;
  view.scrollTop = prevTab === ui.tab ? keep : 0;
  const lines = cartLines().length;
  $('#tabs').innerHTML = [['plan', 'Plan', 'plan'], ['eat', 'Eat', 'eat'], ['diary', 'Diary', 'diary']].map(([id, n, ic]) =>
    `<button class="tab ${ui.tab === id ? 'on' : ''} ${id === 'eat' ? 'main' : ''}" data-a="tab" data-t="${id}">${svg(ic)}<span>${n}</span>${id === 'plan' && lines ? '<i class="dot"></i>' : ''}</button>`).join('');
}
function renderSheet() {
  const el = $('#sheet'); const html = sheetHtml();
  el.innerHTML = html; el.className = html ? 'open' : '';
  document.body.classList.toggle('lock', !!html);
}

// ---------- actions ----------
function readDraftField(el) {
  const d = ui.draft; const f = el.dataset.f; if (!d || !f) return;
  if (el.dataset.i !== undefined) { const row = d.ing[+el.dataset.i]; row[f] = f === 'a' ? parseAmt(el.value) : el.value; return; }
  if (f === 'cook') d.cook = el.checked;
  else if (['makes', 'per', 'raw', 'cooked'].includes(f)) d[f] = parseFloat(el.value) || 0;
  else d[f] = el.value;
}
document.addEventListener('input', e => {
  if (ui.sheet && ui.sheet.t === 'edit') readDraftField(e.target);
  const id = e.target.id;
  if (id === 'st-y' || id === 'st-r' || id === 'st-w') {
    const v = parseFloat(e.target.value); if (!(v > 0)) return;
    if (id === 'st-y') S.settings.yellow = v; else if (id === 'st-r') S.settings.red = v; else S.settings.rawWindow = Math.max(1, Math.round(v));
    save(); renderMain();
  }
});
document.addEventListener('change', e => {
  if (ui.sheet && ui.sheet.t === 'edit') readDraftField(e.target);
  if (e.target.id === 'imp') importData(e.target.files[0]);
  if (e.target.classList.contains('price-in')) {
    const v = parseFloat(e.target.value);
    if (v >= 0) S.prices[e.target.dataset.k] = v; else delete S.prices[e.target.dataset.k];
    save(); const keep = $('#view').scrollTop; render(); $('#view').scrollTop = keep;
  }
});

const A = {
  tab: d => { ui.tab = d.t; ui.sheet = null; render(); },
  undo: () => { const t = $('#toast'); if (t._undo) t._undo(); t.className = ''; },
  planTab: d => { ui.planTab = d.t; if (d.t !== 'week') ui.picking = false; render(); },
  settings: () => { ui.sheet = { t: 'settings' }; renderSheet(); },
  closeSheet: () => { ui.sheet = null; ui.iconOpen = false; renderSheet(); },
  // week
  startWeek: () => { if (S.week && S.week.picks.length) { ui.sheet = { t: 'confirmWeek' }; renderSheet(); } else A.newWeek(); },
  newWeek: () => { if (S.week && S.week.picks.length) S.history.push({ ...S.week, archived: todayIso() }); S.week = { id: uid(), start: todayIso(), locked: false, picks: [], tally: {} }; ui.picking = true; ui.step = 0; ui.planTab = 'week'; ui.sheet = null; save(); render(); },
  editWeek: () => { ui.picking = true; ui.step = 0; render(); },
  closePicker: () => { ui.picking = false; render(); },
  goStep: d => { ui.step = +d.s; render(); $('#view').scrollTop = 0; },
  nextStep: () => { ui.step = Math.min(CATS.length, ui.step + 1); render(); $('#view').scrollTop = 0; },
  prevStep: () => { ui.step = Math.max(0, ui.step - 1); render(); $('#view').scrollTop = 0; },
  pick: d => {
    if (!S.week) return;
    const i = S.week.picks.indexOf(d.m); const m = mod(d.m);
    if (i >= 0) S.week.picks.splice(i, 1); else S.week.picks.push(d.m);
    save();
    if (d.close) ui.sheet = null;
    render();
    if (i < 0) { const miss = m.ing.filter(g => stock(ikey(g.n, g.u)) < toBase(g.a, g.u) * remaining(m) / m.makes - 0.001).length; toast(miss ? `${m.name} added. ${miss} item${miss > 1 ? 's' : ''} to buy.` : `${m.name} added. You have it all.`); }
  },
  lockWeek: () => { S.week.locked = true; ui.picking = false; ui.step = 0; save(); render(); toast('Week locked in.'); },
  info: d => { ui.sheet = { t: 'info', mid: d.m }; renderSheet(); },
  // module editor
  editMod: d => {
    if (d.m.startsWith('new:')) { const c = d.m.slice(4); ui.draft = { isNew: true, id: 'm' + uid(), cat: c, icon: cat(c).icon, name: '', makes: 4, per: 4, cook: false, raw: 7, cooked: 4, ing: [{ n: '', a: 1, u: 'ea' }], storage: '', method: '' }; }
    else { ui.draft = clone(mod(d.m)); }
    ui.iconOpen = false; ui.sheet = { t: 'edit' }; renderSheet();
  },
  toggleIcons: () => { ui.iconOpen = !ui.iconOpen; renderSheet(); },
  setIcon: d => { ui.draft.icon = d.k; ui.iconOpen = false; renderSheet(); },
  addIng: () => { ui.draft.ing.push({ n: '', a: 1, u: 'ea' }); renderSheet(); },
  rmIng: d => { ui.draft.ing.splice(+d.i, 1); if (!ui.draft.ing.length) ui.draft.ing.push({ n: '', a: 1, u: 'ea' }); renderSheet(); },
  saveMod: () => {
    const d = ui.draft;
    if (!d.name.trim()) { toast('Give the module a name.'); return; }
    d.ing = d.ing.filter(i => i.n.trim()).map(i => ({ n: canon(i.n), a: i.a || 0, u: normU(i.u) }));
    if (!d.ing.length) { toast('Add at least one ingredient.'); return; }
    for (const i of d.ing) { const bad = unitConflict(i.n, i.u, d.id); if (bad) { toast(bad); return; } }
    const seen = new Set();
    for (const i of d.ing) { const k = ikey(i.n, i.u); if (seen.has(k)) { toast(`${i.n} is listed twice. Combine it into one line.`); return; } seen.add(k); }
    d.makes = Math.max(1, d.makes); d.per = Math.min(Math.max(1, d.per || d.makes), d.makes);
    const isNew = d.isNew; delete d.isNew;
    if (isNew) S.modules.push(d); else S.modules[S.modules.findIndex(m => m.id === d.id)] = d;
    ui.sheet = null; save(); render(); toast(isNew ? 'Module added.' : 'Module saved.');
  },
  delMod: () => {
    const id = ui.draft.id;
    if (!confirm(`Delete "${ui.draft.name}" from your library?`)) return;
    S.modules = S.modules.filter(m => m.id !== id);
    if (S.week) S.week.picks = S.week.picks.filter(x => x !== id);
    delete S.cooked[id];
    Object.values(S.plan).forEach((l, i, arr) => { });
    for (const k of Object.keys(S.plan)) S.plan[k] = S.plan[k].filter(e => e.mid !== id);
    ui.sheet = null; save(); render();
  },
  // cart + fridge
  cartAdd: d => { const l = cartLines().find(x => x.key === d.k); if (!l) return; mutate('Added to fridge.', () => addFridge(l.name, l.unit, l.buy)); },
  cartAddAll: () => { const ls = cartLines(); mutate(`${ls.length} items added to fridge.`, () => ls.forEach(l => addFridge(l.name, l.unit, l.buy))); },
  addItem: () => { ui.sheet = { t: 'addItem' }; renderSheet(); },
  saveItem: () => {
    const n = $('#ai-n').value.trim(), q = parseAmt($('#ai-q').value), u = $('#ai-u').value, l = parseInt($('#ai-l').value);
    if (!n || !(q > 0)) { toast('Enter a name and quantity.'); return; }
    const bad = unitConflict(n, u); if (bad) { toast(bad); return; }
    ui.sheet = null; mutate(`${n} added.`, () => addFridge(n, u, q, todayIso(), l > 0 ? l : undefined));
  },
  tossIng: d => { ui.sheet = { t: 'toss', kind: 'ing', key: d.k }; ui.tossAmt = 1; renderSheet(); },
  tossCooked: d => { ui.sheet = { t: 'toss', kind: 'cooked', mid: d.m }; ui.tossAmt = 1; renderSheet(); },
  tossInc: d => { const s = ui.sheet; ui.tossAmt = Math.min(s.max, Math.max(s.step, ui.tossAmt + (+d.d) * s.step)); renderSheet(); },
  tossAll: () => { ui.tossAmt = ui.sheet.max; renderSheet(); },
  doToss: () => {
    const s = ui.sheet; const amt = ui.tossAmt; ui.sheet = null;
    mutate('Thrown out and logged.', () => {
      if (s.kind === 'cooked') { const m = mod(s.mid); consumeCooked(m.id, amt); S.diary.push({ id: uid(), ts: Date.now(), type: 'toss', name: m.name, icon: m.icon, servings: amt, mid: m.id }); }
      else { const it = S.fridge.find(i => i.key === s.key); const nm = it.name; consume(s.key, amt); S.diary.push({ id: uid(), ts: Date.now(), type: 'toss', name: nm, icon: null, servings: amt }); }
    });
  },
  setQty: () => {
    const raw = parseFloat($('#setq').value); if (!(raw >= 0)) { toast('Enter a number.'); return; }
    const v = toBase(raw, $('#setu').value);
    const key = ui.sheet.key; ui.sheet = null;
    mutate('Quantity updated.', () => { const cur = stock(key); if (v < cur) consume(key, cur - v); else if (v > cur) { const it = S.fridge.find(i => i.key === key); addFridge(it.name, it.unit, v - cur); } });
  },
  // eat page
  pickDay: d => { ui.date = d.d; render(); },
  weekShift: d => { ui.date = addDays(ui.date, 7 * +d.d); render(); },
  autoPlan: () => { mutate('Planned.', () => { const n = autoPlan(ui.date); return n ? `Planned ${n} item${n > 1 ? 's' : ''} for the day.` : 'Nothing to add. Slots are filled or nothing is ready.'; }); },
  assign: d => { ui.sheet = { t: 'assign', mid: d.m }; renderSheet(); },
  assignTo: d => {
    addEntry(ui.date, d.s, d.m); save();
    if (d.keep) { render(); toast(`Added ${mod(d.m).name}.`); } else { ui.sheet = null; render(); }
  },
  addTo: d => { ui.sheet = { t: 'addTo', slot: d.s }; renderSheet(); },
  entryInc: d => { const e = entriesOn(ui.date).find(x => x.id === d.e); e.n = Math.max(Math.max(1, e.eaten), e.n + (+d.d)); save(); render(); },
  entryRm: d => { S.plan[ui.date] = entriesOn(ui.date).filter(e => e.id !== d.e); save(); render(); },
  cook: d => { const m = mod(d.m); mutate('Cooked.', () => { const short = doCook(d.m); return short.length ? `Cooked ${m.per} ${m.name}. Short on ${short.slice(0, 2).join(', ')}.` : `Cooked ${m.per} serving${m.per > 1 ? 's' : ''} of ${m.name}.`; }); },
  eat: d => { const m = mod(d.m); mutate('Eaten.', () => { doEat(d.m, ui.date, null, d.e); return `Ate 1 ${m.name}.`; }); },
  // diary
  rate: d => { const e = S.diary.find(x => x.id === d.i), f = d.f || 'rating'; e[f] = e[f] === +d.r ? 0 : +d.r; save(); render(); },
  thoughts: d => { ui.sheet = { t: 'thoughts', id: d.i }; renderSheet(); setTimeout(() => { const n = $('#notes'); if (n) n.focus(); }, 60); },
  saveThoughts: () => { const e = S.diary.find(x => x.id === ui.sheet.id); e.notes = $('#notes').value.trim(); ui.sheet = null; save(); render(); },
  delEntry: d => { if (!confirm('Delete this diary entry?')) return; S.diary = S.diary.filter(x => x.id !== d.i); ui.sheet = null; save(); render(); },
  // cooked / eaten tally
  tally: d => { ui.sheet = { t: 'tally', mid: d.m }; renderSheet(); },
  tallyToss: d => { ui.sheet = { t: 'toss', kind: 'cooked', mid: d.m }; ui.tossAmt = 1; renderSheet(); },
  tallyCook: d => { const mid = ui.sheet.mid; if (+d.d > 0) mutate('Added a cooked serving.', () => { const short = doCook(mid, 1); if (short.length) return `Added one. Short on ${short.slice(0, 2).join(', ')}.`; }); else mutate('Removed a cooked serving.', () => undoCook(mid)); },
  tallyEat: d => { const mid = ui.sheet.mid; if (+d.d > 0) mutate('Logged one eaten.', () => doEat(mid, ui.date, null, null)); else mutate('Removed one eaten.', () => undoEat(mid)); },
  // manual log
  logFood: () => { const n = new Date(); ui.log = { name: '', icon: 'takeout', slot: slotGuess({ cat: 'meal' }), date: todayIso(), time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, servings: 1, notes: '', iconOpen: false }; ui.sheet = { t: 'logfood' }; renderSheet(); },
  logIcons: () => { captureLog(); ui.log.iconOpen = !ui.log.iconOpen; renderSheet(); },
  setLogIcon: d => { captureLog(); ui.log.icon = d.k; ui.log.iconOpen = false; renderSheet(); },
  saveLog: () => {
    captureLog(); const L = ui.log;
    if (!L.name.trim()) { toast('Say what you ate.'); return; }
    const ts = new Date(`${L.date || todayIso()}T${L.time || '12:00'}`).getTime();
    S.diary.push({ id: uid(), ts: isNaN(ts) ? Date.now() : ts, type: 'eat', manual: true, name: L.name.trim(), icon: L.icon, servings: Math.max(1, parseInt(L.servings) || 1), slot: L.slot, rating: 0, notes: L.notes.trim() });
    ui.sheet = null; save(); render(); toast('Added to your journal.');
  },
  // settings
  exportData: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); a.download = `meal-loop-backup-${todayIso()}.json`; a.click(); },
  resetModules: () => { if (!confirm('Replace your module library with the starter set? Picks and logs stay, but your edits to modules are lost.')) return; S.modules = parseModules(); if (S.week) S.week.picks = []; S.cooked = {}; S.plan = {}; ui.sheet = null; save(); render(); toast('Library reset.'); },
};
function captureLog() {
  const L = ui.log; if (!L || !$('#lg-n')) return;
  L.name = $('#lg-n').value; L.slot = $('#lg-s').value; L.date = $('#lg-d').value; L.time = $('#lg-t').value; L.servings = $('#lg-q').value; L.notes = $('#lg-o').value;
}
function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { try { const j = JSON.parse(r.result); if (!j.modules) throw 0; S = Object.assign(fresh(), j); save(); ui.sheet = null; render(); toast('Backup restored.'); } catch (e) { toast('That file is not a Meal Loop backup.'); } };
  r.readAsText(file);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const act = A[el.dataset.a]; if (!act) return;
  if (el.classList.contains('card') && e.target.closest('.cinfo')) return;
  e.stopPropagation();
  act(el.dataset);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) A.closeSheet(); });

function migrate() {
  if ((S.v || 1) === 2) {
    const old = S.fridge; S.fridge = [];
    old.forEach(f => { if (f.unit === 'pint') S.fridge.push({ ...f, unit: 'tsp', qty: f.qty * 96, key: ikey(f.name, 'tsp') }); else S.fridge.push(f); });
    const np = {}; Object.entries(S.prices || {}).forEach(([k, v]) => { const [n, u] = k.split('|'); np[ikey(n, u)] = v; }); S.prices = np;
    S.v = 3; save(); return;
  }
  if ((S.v || 1) >= 3) return;
  S.modules.forEach(m => m.ing.forEach(i => { i.u = normU(i.u); }));
  const old = S.fridge; S.fridge = [];
  old.forEach(f => { const bu = baseUnit(f.unit), nm = canon(f.name); S.fridge.push({ ...f, name: nm, unit: bu, qty: toBase(f.qty, f.unit), key: ikey(nm, bu) }); });
  const np = {}; Object.entries(S.prices || {}).forEach(([k, v]) => { const [n, u] = k.split('|'); np[ikey(n, u)] = v; }); S.prices = np;
  S.v = 3; save();
}
migrate();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
