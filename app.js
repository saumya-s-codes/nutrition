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
const APP_VERSION = '2.41'; // keep in step with VERSION in sw.js
const KEY = 'mealloop.v1';
const fresh = () => ({
  v: 9, modules: parseModules(), week: null, history: [], fridge: [], cooked: {},
  plan: {}, diary: [], settings: { catOrder: CATS.map(c => c.id), targets: { ...DEFAULT_TARGETS } }, packs: {}, life: {}, prices: {}, units: {}, ingIcons: {}, ingNotes: {},
});
let S = (() => {
  try { const j = localStorage.getItem(KEY); if (j) return Object.assign(fresh(), JSON.parse(j)); } catch (e) { /* ignore */ }
  return fresh();
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save. Storage may be full.'); } };

const ui = { tab: 'eat', planTab: 'week', picking: false, step: 0, date: todayIso(), sheet: null, draft: null, iconOpen: false, tossAmt: 1, tossMode: 'ing', thoughtId: null };

const mod = id => S.modules.find(m => m.id === id);
const cat = id => CATS.find(c => c.id === id) || CATS[0];
function orderedCats() {
  const ord = (S.settings && S.settings.catOrder) || [];
  const at = c => { const i = ord.indexOf(c.id); return i < 0 ? 99 : i; };
  return CATS.slice().sort((a, b) => at(a) - at(b) || CATS.indexOf(a) - CATS.indexOf(b));
}
const targetFor = id => { const t = S.settings && S.settings.targets && S.settings.targets[id]; return t != null ? t : (DEFAULT_TARGETS[id] ?? 2); };
// ----- units: everything is stored in a base unit (tsp for volume, oz for weight, or the count unit itself) -----
const UNITS = { tsp: { g: 'vol', f: 1 }, tbsp: { g: 'vol', f: 3 }, cup: { g: 'vol', f: 48 }, pint: { g: 'vol', f: 96 }, oz: { g: 'wt', f: 1 }, lb: { g: 'wt', f: 16 } };
const COUNT_UNITS = ['ea'];
const ALIAS = { tbs: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp', cups: 'cup', c: 'cup', ounce: 'oz', ounces: 'oz', ozs: 'oz', lbs: 'lb', pound: 'lb', pounds: 'lb', each: 'ea', piece: 'ea', pieces: 'ea', pc: 'ea', pcs: 'ea', can: 'ea', cans: 'ea', slice: 'ea', slices: 'ea', clove: 'ea', cloves: 'ea', bag: 'ea', bags: 'ea', pints: 'pint' };
const normU = u => { const x = String(u || 'ea').trim().toLowerCase().replace(/\.$/, ''); return ALIAS[x] || x || 'ea'; };
const toBase = (a, u) => a * ((UNITS[normU(u)] || { f: 1 }).f);
const baseUnit = u => { const x = normU(u); const d = UNITS[x]; return d ? (d.g === 'vol' ? 'tsp' : 'oz') : x; };
const normName = n => String(n).trim().toLowerCase().replace(/\s+/g, ' ');
const ikey = (n, u) => `${normName(n)}|${baseUnit(u)}`;
const DISCRETE = new Set(['ea']);
const PLURAL = new Set(['cup', 'pint']);
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
const PACKL = Object.fromEntries(Object.entries(PACKS).map(([k, v]) => { const [n, u] = k.split('|'); return [ikey(n, u), [v[0], toBase(v[1], u)]]; }));

// One "unit" is whatever you buy in one go (a jar, can, bag, tub...). Size and price are editable per ingredient.
const defaultUnitSize = base => base === 'tsp' ? 48 : base === 'oz' ? 16 : 1;
function unitInfo(key, base) {
  const u = S.units[key] || {}, pk = PACKL[key];
  return { size: u.size ?? (pk ? pk[1] : defaultUnitSize(base)), price: u.price ?? null, known: u.size != null || !!pk };
}
function setUnit(key, patch) { S.units[key] = { ...(S.units[key] || {}), ...patch }; save(); refreshCart(); savedFlash(); }
const knownNames = () => { const seen = new Map(); S.modules.forEach(m => m.ing.forEach(i => seen.has(normName(i.n)) || seen.set(normName(i.n), i.n))); S.fridge.forEach(f => seen.has(normName(f.name)) || seen.set(normName(f.name), f.name)); return [...seen.values()].sort(); };
const canon = n => { const k = normName(n); const hit = knownNames().find(x => normName(x) === k); return hit || String(n).trim(); };
function unitConflict(name, unit, exceptId, exceptBatch) {
  const k = normName(name), used = new Set();
  S.modules.forEach(m => { if (m.id !== exceptId) m.ing.forEach(i => { if (normName(i.n) === k) used.add(baseUnit(i.u)); }); });
  S.fridge.forEach(f => { if (f.id !== exceptBatch && normName(f.name) === k) used.add(f.unit); });
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
function ingIcon(name) {
  const k = normName(name);
  if (S.ingIcons && S.ingIcons[k]) return S.ingIcons[k];
  const single = S.modules.find(m => m.ing.length === 1 && normName(m.ing[0].n) === k);
  if (single) return single.icon;
  for (const [re, icon] of ICON_HINTS) if (re.test(k)) return icon;
  const any = S.modules.find(m => m.ing.some(i => normName(i.n) === k));
  return any ? any.icon : 'other-meal';
}
function storageFor(key, name) {
  if (S.ingNotes && S.ingNotes[key] != null) return S.ingNotes[key];
  const single = S.modules.find(m => m.ing.length === 1 && normName(m.ing[0].n) === normName(name));
  return single ? single.storage || '' : '';
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
  const b = { id: uid(), key: ikey(nm, bu), name: nm, unit: bu, qty: toBase(qty, unit), start: start || todayIso(), life: life != null ? life : lifeFor(nm, bu) };
  S.fridge.push(b); return b;
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
  const m = mod(mid), exp = b => dayNum(b.date) + (b.life ?? (m ? m.cooked : 4));
  const bs = cookedBatches(mid).slice().sort((a, b) => exp(a) - exp(b));
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
const weekServings = m => (m.wk > 0 ? m.wk : m.makes);
function remaining(m) {
  const t = (S.week && S.week.tally[m.id]) || { cooked: 0, raw: 0 };
  return Math.max(0, weekServings(m) - t.cooked - t.raw);
}

// ---------- shopping cart ----------
// Things you cook are cooked as the whole recipe, so the cart buys whole recipes too (a 4-serving recipe you eat 2 a week from still needs 4 servings of ingredients)
const needFrac = m => { const r = remaining(m); return m.cook && r > 0.01 ? Math.ceil(r / m.makes - 1e-9) : r / m.makes; };
function cartLines() {
  const need = new Map();
  if (S.week) for (const id of S.week.picks) {
    const m = mod(id); if (!m) continue;
    const frac = needFrac(m);
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
    const info = unitInfo(r.key, r.unit);
    const units = Math.ceil(miss / info.size - 1e-6);
    out.push({ ...r, miss, size: info.size, price: info.price, known: info.known, units, buy: units * info.size,
      label: plural(units, 'unit'), detail: `need ${fmtBase(miss, r.unit)} · 1 unit = ${fmtBase(info.size, r.unit)}`,
      total: info.price == null ? null : info.price * units });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- plan / entries ----------
const entriesOn = d => S.plan[d] || [];
function addEntry(date, slot, mid) {   // every add is its own serving, so planning more is just adding again
  (S.plan[date] = S.plan[date] || []).push({ id: uid(), slot, mid, n: 1, eaten: 0 });
}
function plannedRemainingAll(mid) {
  const T = dayNum(todayIso()); let n = 0;
  for (const [d, list] of Object.entries(S.plan)) if (dayNum(d) >= T) for (const e of list) if (e.mid === mid) n += Math.max(0, e.n - e.eaten);
  return n;
}
// Eat shows only the sides picked in Plan for this week. Leftovers of anything else stay in the Fridge.
const isPicked = id => !!(S.week && S.week.picks.includes(id));
function activeMods() { return (S.week ? S.week.picks : []).map(mod).filter(Boolean); }

// ---------- side status ----------
// Only physical things (ingredient stock and cooked servings) carry dates, and a side reads its status from them.
//   red    = something is wrong: a needed item is past its eat-by date, or the fridge can't cover the side
//            (something it needs is sitting in the shopping cart)
//   yellow = you'd have to eat one a day or more to finish it before the eat-by date. The eat-by day itself is still fine.
// Slots and the plan are never consulted. Past days have no flags; a future day previews what will be tight by then.
// Expired food keeps counting everywhere until you throw it out, but it can't make anything else yellow.
const SOON_DAYS = 3; // plain ingredients have no servings to pace, so the Fridge flags them this many days out
const rank = u => (u.level === 'red' ? 2000 : 1000) + Math.min(u.score, 999);
const cartMap = () => new Map(cartLines().map(l => [l.key, l]));
const dayWord = n => {
  if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n === -1) return 'yesterday';
  const d = parseIso(addDays(todayIso(), n));
  return Math.abs(n) < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
// the tightest pace over batches {n, exp}: everything due by each deadline, divided by the eating days left (today through eat-by day)
function paceOf(items, D) {
  let cum = 0, best = null; const kinds = new Set();
  for (const x of items.slice().sort((a, b) => a.exp - b.exp)) { cum += x.n; kinds.add(x.kind); const pace = cum / (x.exp - D + 1); if (pace >= 1 - 1e-9 && (!best || pace > best.score)) best = { score: pace, x, cum, mixed: kinds.size > 1 }; }
  return best;
}
function rawGood(m, D) { // servings of raw stock still good on day D, and the earliest eat-by among it
  let best = Infinity, exp = null;
  for (const i of m.ing) {
    const k = ikey(i.n, i.u), per = toBase(i.a, i.u) / m.makes, good = S.fridge.filter(f => f.key === k && dayNum(f.start) + f.life >= D);
    for (const f of good) { const e = dayNum(f.start) + f.life; exp = exp === null ? e : Math.min(exp, e); }
    if (per > 0) best = Math.min(best, good.reduce((a, f) => a + f.qty, 0) / per);
  }
  return { servings: best === Infinity ? 0 : best, exp };
}
function sideStatus(m, dateIso, cart) {
  const D = dayNum(dateIso), T = dayNum(todayIso());
  if (D < T) return null;
  const picked = !!(S.week && S.week.picks.includes(m.id)), need = picked && remaining(m) > 0.05;
  const cooked = cookedBatches(m.id).map(b => ({ id: b.id, n: b.n, exp: dayNum(b.date) + (b.life ?? m.cooked) }));
  const expired = { cooked: cooked.filter(b => b.exp < D), raw: [] };
  if (need) for (const i of m.ing) for (const f of S.fridge.filter(x => x.key === ikey(i.n, i.u))) if (dayNum(f.start) + f.life < D) expired.raw.push({ id: f.id, key: f.key, name: f.name, qty: f.qty, unit: f.unit, exp: dayNum(f.start) + f.life });
  const missing = [];
  if (need && cart) for (const i of m.ing) { const l = cart.get(ikey(i.n, i.u)); if (l && !missing.includes(l)) missing.push(l); }
  const hasExpired = expired.cooked.length > 0 || expired.raw.length > 0;
  if (hasExpired || missing.length) {
    return { level: 'red', score: 999, label: hasExpired && missing.length ? 'Expired · missing ingredients' : hasExpired ? 'Expired' : 'Missing ingredients', expired, missing, hasExpired };
  }
  const items = cooked.filter(b => b.exp >= D).map(b => ({ n: b.n, exp: b.exp, kind: 'cooked' }));
  if (need) { const r = rawGood(m, D), rs = Math.min(r.servings, remaining(m)); if (rs > 0.05 && r.exp !== null) items.push({ n: rs, exp: r.exp, kind: 'raw' }); }
  const best = paceOf(items, D); if (!best) return null;
  const x = best.x, raw = x.kind === 'raw' && m.cook;   // raw food only gets "cook by" when the side needs cooking
  return { level: 'yellow', score: best.score, kind: x.kind, exp: x.exp, servings: best.cum, expired, missing, hasExpired: false,
    label: best.mixed ? `${nice(best.cum)} servings · use by ${dayWord(x.exp - T)}` : `${nice(best.cum)} ${raw ? 'to cook' : x.kind === 'raw' ? 'to eat' : 'cooked'} · ${raw ? 'cook' : 'eat'} by ${dayWord(x.exp - T)}` };
}
const urgency = (m, dateIso, cart) => sideStatus(m, dateIso, cart);

// ---------- actions on food ----------
function slotGuess(m) {
  if (m.cat === 'treat') return 'treat';
  if (m.cat === 'snack') return 'snack';
  if (m.bf) return 'breakfast';
  const h = new Date().getHours();
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner';
}
function tsFor(date) {
  const now = new Date(); const d = parseIso(date); d.setHours(now.getHours(), now.getMinutes(), 0, 0); return d.getTime();
}
function doCook(mid, count) {
  const m = mod(mid); const n = count || m.makes;
  const t = ensureTally(mid);
  let short = [];
  for (const i of m.ing) { const left = consume(ikey(i.n, i.u), toBase(i.a, i.u) * n / m.makes); if (left > 0.01) short.push(i.n); }
  (S.cooked[mid] = S.cooked[mid] || []).push({ id: uid(), n, date: todayIso() });
  if (t) t.cooked += n;
  return short;
}
function doEat(mid, date, slot, entryId) {
  const m = mod(mid);
  let src;
  if (cookedTotal(mid) >= 1 - 1e-9) { const first = cookedBatches(mid).slice().sort((a, b) => (dayNum(a.date) + (a.life ?? m.cooked)) - (dayNum(b.date) + (b.life ?? m.cooked)))[0]; src = { k: 'c', date: first.date, life: first.life }; consumeCooked(mid, 1); }
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
// Takeout and other one-off leftovers: a hidden module (never in the week picker) whose cooked servings live in the fridge
const leftoverMods = () => S.modules.filter(m => m.oneoff && cookedTotal(m.id) > 0.001);
function newOneoff(name, icon) {
  const m = { id: 'x' + uid(), name, cat: 'meal', bf: false, icon: icon || 'other-meal', makes: 1, wk: 0, per: 1, cook: false, raw: 3, cooked: 3, ing: [], storage: '', method: '', oneoff: true };
  S.modules.push(m); return m;
}
function mergeOneoff(mid) {   // same name added twice = one leftover entry
  const m = mod(mid); if (!m) return;
  const twin = S.modules.find(x => x.oneoff && x.id !== mid && normName(x.name) === normName(m.name)); if (!twin) return;
  S.cooked[twin.id] = (S.cooked[twin.id] || []).concat(S.cooked[mid] || []); delete S.cooked[mid]; twin.icon = m.icon;
  S.modules = S.modules.filter(x => x.id !== mid); ui.fresh = 'm:' + twin.id;
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
  if (src.k === 'c') (S.cooked[mid] = S.cooked[mid] || []).push({ id: uid(), n: 1, date: src.date || todayIso(), life: src.life });
  else { for (const i of m.ing) addFridge(i.n, i.u, i.a / m.makes); const t = ensureTally(mid); if (t) t.raw = Math.max(0, t.raw - 1); }
  let pe = null;
  for (const d of [ui.date, ...Object.keys(S.plan).sort().reverse()]) { pe = (S.plan[d] || []).find(x => x.mid === mid && x.eaten > 0); if (pe) break; }
  if (pe) pe.eaten -= 1;
  return true;
}
function mutate(msg, fn, extraBtn) {
  const snap = JSON.stringify(S);
  const extra = fn();
  save(); render();
  if (msg) toast(typeof extra === 'string' ? extra : msg, () => { S = Object.assign(fresh(), JSON.parse(snap)); save(); render(); }, extraBtn);
}

// once a side has nothing left to fix, its why sheet closes itself
function whyDone(mid) { const m = mod(mid); if (!m || !sideStatus(m, ui.date, cartMap())) { ui.sheet = null; renderSheet(); } }
// ---------- throwing food out ----------
function logToss(e) { S.diary.push({ id: uid(), ts: Date.now(), type: 'toss', ...e }); }
function tossCookedBatch(mid, bid, reason) {
  const m = mod(mid), b = cookedBatches(mid).find(x => x.id === bid); if (!m || !b) return;
  S.cooked[mid] = cookedBatches(mid).filter(x => x !== b);
  logToss({ name: m.name, icon: m.icon, mid, servings: b.n, qty: plural(b.n, 'serving'), reason });
}
function tossRawBatch(id, reason) {
  const f = S.fridge.find(x => x.id === id); if (!f) return;
  S.fridge = S.fridge.filter(x => x !== f);
  logToss({ name: f.name, icon: ingIcon(f.name), servings: f.qty, qty: fmtBase(f.qty, f.unit), reason });
}
const expiredFlag = (exp) => exp < dayNum(todayIso());

// ---------- auto-plan ----------
function autoPlan(date) {
  const list = S.plan[date] = S.plan[date] || [];
  const used = new Set(list.map(e => e.mid));
  const act = activeMods();
  const cart = cartMap(), U = {}; act.forEach(m => U[m.id] = urgency(m, date, cart));
  const avail = m => cookedTotal(m.id) + rawLeft(m) - plannedRemainingAll(m.id);
  const score = m => (U[m.id] ? rank(U[m.id]) : 0) + (cookedTotal(m.id) - plannedRemainingAll(m.id) > 0.99 ? 500 : 0) - (m.cook && cookedTotal(m.id) < 1 ? 100 : 0);
  const choose = (cats, pred = () => true) => {
    const c = act.filter(m => cats.includes(m.cat) && pred(m) && !(U[m.id] && U[m.id].hasExpired) && avail(m) >= 0.99).sort((a, b) => score(b) - score(a));
    const fresh = c.filter(m => !used.has(m.id));
    return fresh[0] || c.find(m => U[m.id]);
  };
  const isBf = m => !!m.bf, notBf = m => !m.bf;
  const roles = {
    breakfast: [[['meal'], isBf], [['fruit']]],
    lunch: choose(['meal'], notBf) ? [[['meal'], notBf]] : [[['pro']], [['fill']], [['veg']]],
    dinner: [[['pro']], [['fill']], [['veg']]],
    snack: [[['snack']], [['fruit']]],
  };
  let added = 0;
  for (const [slot, rs] of Object.entries(roles)) {
    if (list.some(e => e.slot === slot)) continue;
    for (const r of rs) { const m = choose(...r); if (m) { addEntry(date, slot, m.id); used.add(m.id); added++; } }
  }
  return added;
}

// ---------- icons ----------
const ico = (k, c = 'ico') => `<img class="${c}" src="assets/food/${esc(k)}.png" alt="" loading="lazy">`;
const SV = {
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none"/><path d="M12 7v5l3 2" fill="none"/></svg>',
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
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" fill="none"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none"/></svg>',
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
const accordion = (k, title, summary, body) => {
  const open = !!(ui.sheet && ui.sheet.open && ui.sheet.open[k]);
  return `<button class="acc" data-a="toggleAcc" data-k="${k}" aria-expanded="${open}"><span><b>${title}</b><small>${summary}</small></span>${svg(open ? 'up' : 'down')}</button>${open ? `<div class="accbody">${body}</div>` : ''}`;
};
const fold = (k, title, body, dflt) => {
  const o = ui.sheet && ui.sheet.open, open = o && k in o ? !!o[k] : !!dflt;
  return `<section class="sec"><button class="acc" data-a="toggleFold" data-k="${k}" data-d="${dflt ? 1 : 0}" aria-expanded="${open}"><span><b>${title}</b></span>${svg(open ? 'up' : 'down')}</button>${open ? `<div class="accbody">${body}</div>` : ''}</section>`;
};
// Date and time boxes: we draw the text ourselves, centered, and lay the real (invisible) input on top so a tap still opens the phone's picker. No more iOS alignment quirks.
const fmtDbox = (kind, v) => !v ? '—' : kind === 'time' ? new Date('1970-01-01T' + v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : parseIso(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dbx = (kind, attrs, v) => `<span class="dbox" data-kind="${kind}"><span class="dtxt${v ? '' : ' empty'}">${fmtDbox(kind, v)}</span><input type="${kind}" ${attrs} value="${v || ''}"></span>`;
function syncDbox() { document.querySelectorAll('.dbox').forEach(b => { const i = b.querySelector('input'), t = b.querySelector('.dtxt'); if (i && t) { t.textContent = fmtDbox(b.dataset.kind, i.value); t.classList.toggle('empty', !i.value); } }); }
['input', 'change'].forEach(ev => document.addEventListener(ev, () => requestAnimationFrame(syncDbox), true));
// pop-up grids: pick a side from this week, or an icon, without scrolling a long list
function popHtml() {
  const s = ui.sheet, L = ui.log; if (!s || s.t !== 'logfood' || !L) return '';
  const head = (title, a) => `<div class="pophead"><b>${title}</b><button class="icon-btn" data-a="${a}" aria-label="Close">${svg('x')}</button></div>`;
  if (L.sidesOpen) {   // your whole fridge in one place: this week's sides, leftovers, and every ingredient
    const wk = activeMods(), lm = S.modules.filter(m => cookedTotal(m.id) > 0.001 && !wk.includes(m)), ings = fridgeLedger().ings;
    const left = m => cookedTotal(m.id) > 0.001 ? `<small>${nice(cookedTotal(m.id))} left</small>` : '';
    const tile = (m, extra) => `<button data-a="logSide" data-m="${m.id}">${ico(m.icon)}<span>${esc(m.name)}</span>${extra || ''}</button>`;
    const grp = (label, tiles) => tiles.length ? `<div class="poplabel">${label}</div><div class="popgrid sides">${tiles.join('')}</div>` : '';
    return `<div class="popmask" data-a="logSides"></div><div class="popmenu" role="dialog">${head('Pick a food', 'logSides')}<div class="popscroll">
      ${grp('This week', wk.map(m => tile(m, left(m))))}
      ${grp('Leftovers', lm.map(m => tile(m, left(m))))}
      ${grp('Ingredients', ings.map(i => `<button data-a="logIng" data-k="${esc(i.key)}">${ico(i.icon)}<span>${esc(i.name)}</span><small>${fmtBase(i.qty, i.unit)}</small></button>`))}</div></div>`;
  }
  if (L.iconOpen) return `<div class="popmask" data-a="logIcons"></div><div class="popmenu" role="dialog">${head('Choose an icon', 'logIcons')}<div class="popgrid icons">${ALL_ICONS.map(k => `<button class="${k === L.icon ? 'on' : ''}" data-a="setLogIcon" data-k="${k}" aria-label="${k}">${ico(k)}</button>`).join('')}</div></div>`;
  return '';
}
const sheetHead = t => `<div class="sheethead"><h2>${t}</h2><span id="savedchip" class="savedtag ${ui.sheet && ui.sheet.saved ? 'ok' : ''}" role="status">${svg('check')}Saved</span></div>`;

// ---------- toast ----------
let toastTimer;
function toast(msg, undo, extra) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-a="undo">Undo</button>' : ''}${extra ? `<button data-a="toastExtra">${esc(extra.label)}</button>` : ''}`;
  t.className = 'show'; t._undo = undo; t._extra = extra ? extra.go : null;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = '', extra ? 6500 : 4200);
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
  const fridgeCount = (() => { const f = fridgeLedger(); return f.leftovers.length + f.ings.length; })();
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
  const groups = orderedCats().map(c => ({ c, ms: w.picks.map(mod).filter(m => m && m.cat === c.id) })).filter(g => g.ms.length);
  return `<section class="summary">
    <div class="sumhead">
      <div><h2>${w.locked ? 'Week locked in' : 'Draft week'}</h2><p>Week of ${parseIso(mondayOf(w.start)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${w.picks.length} picks · ${lines.length} to buy</p></div>
      <div class="sumact">${w.locked ? `<span class="pill ok">${svg('check')}Locked</span>` : ''}<button class="btn small editbtn" data-a="editWeek">${svg('edit')}${w.locked ? 'Edit' : 'Continue'}</button></div>
    </div>
    ${groups.length ? `<div class="srows">${groups.map(g => `<div class="srow" style="--bg:${g.c.bg};--ink:${g.c.ink}">
        <i class="sbar"></i>
        <h3>${g.c.short}<small>${g.ms.length}${targetFor(g.c.id) ? ' of ' + targetFor(g.c.id) : ''}</small></h3>
        <div class="schips">${g.ms.map(m => `<button class="schip" data-a="info" data-m="${m.id}">${ico(m.icon)}<span>${esc(m.name)}</span></button>`).join('')}</div>
        <button class="icon-btn schev" data-a="goCat" data-c="${g.c.id}" aria-label="Change ${g.c.short}">${svg('fwd')}</button>
      </div>`).join('')}</div>` : '<p class="muted pad">Nothing picked yet.</p>'}
    <div class="actions">
      <button class="btn primary" data-a="planTab" data-t="cart">Shopping cart (${lines.length})</button>
      <button class="btn ghost" data-a="startWeek">Start new week</button>
    </div>
  </section>`;
}

function pickerView(lines) {
  const OC = orderedCats(), steps = OC.length;
  const w = S.week;
  const stepper = `<div class="stepper">${OC.map((c, i) => {
    const n = w.picks.filter(id => (mod(id) || {}).cat === c.id).length, t = targetFor(c.id);
    return `<button class="step ${i === ui.step ? 'on' : ''} ${n ? 'has' : ''}" data-a="goStep" data-s="${i}" style="--bg:${c.bg}">${ico(c.icon)}${n ? `<b class="${t && n >= t ? 'met' : ''}">${n}</b>` : ''}</button>`;
  }).join('')}<button class="step ${ui.step === steps ? 'on' : ''}" data-a="goStep" data-s="${steps}">${svg('check')}</button></div>`;
  const top = `<div class="pickhead"><button class="linkbtn" data-a="closePicker">${svg('back')}This week</button><span class="muted">Step ${Math.min(ui.step + 1, steps + 1)} of ${steps + 1}</span></div>`;
  if (ui.step >= steps) {
    const groups = OC.map(c => ({ c, t: targetFor(c.id), n: w.picks.filter(id => (mod(id) || {}).cat === c.id).length }));
    return `${top}${stepper}<section class="review">
      <h2>Ready to lock in?</h2>
      <p class="muted">${w.picks.length} picks. ${lines.length ? `${lines.length} items to buy after what's already in your fridge.` : 'Your fridge already covers everything.'}</p>
      <div class="rgrid">${groups.map(g => `<button class="rcell" style="--bg:${g.c.bg};--ink:${g.c.ink}" data-a="goStep" data-s="${OC.indexOf(g.c)}">${ico(g.c.icon)}<b>${g.n}${g.t ? '/' + g.t : ''}</b><span>${g.c.short}</span></button>`).join('')}</div>
    </section>
    <div class="pickbar"><button class="btn" data-a="prevStep">Back</button><button class="btn primary grow" data-a="lockWeek">${svg('check')}Lock in week</button></div>`;
  }
  const c = OC[ui.step], tgt = targetFor(c.id);
  const ms = S.modules.filter(m => m.cat === c.id && !m.oneoff);
  const n = w.picks.filter(id => (mod(id) || {}).cat === c.id).length;
  const cards = ms.map(m => {
    const on = w.picks.includes(m.id);
    const miss = on && m.ing.some(i => stock(ikey(i.n, i.u)) < toBase(i.a, i.u) * needFrac(m) - 0.001);
    return `<div class="card ${on ? 'on' : ''}" style="--bg:${c.bg}" data-a="pick" data-m="${m.id}">
      <button class="cinfo" data-a="info" data-m="${m.id}" aria-label="Details for ${esc(m.name)}">${svg('info')}</button>
      <span class="ccheck ${on ? 'on' : ''}">${on ? svg('check') : ''}</span>
      ${ico(m.icon, 'ico big')}
      <b>${esc(m.name)}</b>
      <small>${on ? (miss ? 'In cart' : 'In fridge') : `${nice(weekServings(m))} a week`}</small>
    </div>`;
  }).join('');
  return `${top}${stepper}<section class="pickbody">
      <h2>Choose your ${c.name.toLowerCase()}</h2>
      <p class="muted">${c.hint} <b>${n}</b>${tgt ? ` of <b>${tgt}</b>` : ''} chosen.</p>
      <div class="grid">${cards}
        <button class="card add" data-a="editMod" data-m="new:${c.id}">${svg('plus')}<b>Add module</b></button>
      </div>
    </section>
    <div class="pickbar">
      <button class="btn" data-a="${ui.step ? 'prevStep' : 'closePicker'}">${ui.step ? 'Back' : 'Close'}</button>
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
    <p class="muted pad">Needed for this week, minus what's in your fridge. You buy whole units, so a half-used jar still means one jar. Tap an item to change its size or price.</p>
    ${lines.map(l => `<div class="row cart ccard" data-a="cartEdit" data-k="${esc(l.key)}" role="button" tabindex="0" aria-label="${esc(l.name)}. Tap to change unit size and price.">
      ${ico(ingIcon(l.name), 'ico')}
      <div class="cinfo2"><b>${esc(l.name)}</b><span class="csum">${esc(cartBuyText(l))}</span></div>
      <div class="cright"><b class="cprice${l.total == null ? ' none' : ''}">${l.total != null ? '$' + l.total.toFixed(2) : 'Add price'}</b><button class="btn small primary" data-a="cartAdd" data-k="${esc(l.key)}">${svg('plus')}To fridge</button></div>
    </div>`).join('')}
    <div class="actions"><button class="btn primary" data-a="cartAddAll">Add all ${lines.length} to fridge</button></div>
  </section>`;
}

// The virtual fridge is a ledger of physical things: cooked leftovers (named as sides) and ingredient stock. Each has its own dates.
function fridgeLedger() {
  const T = dayNum(todayIso());
  const leftovers = Object.entries(S.cooked).filter(([id, bs]) => bs.length && mod(id)).map(([id, bs]) => {
    const m = mod(id), items = bs.map(b => ({ n: b.n, exp: dayNum(b.date) + (b.life ?? m.cooked) }));
    const good = items.filter(x => x.exp >= T), soonest = Math.min(...items.map(x => x.exp));
    return { m, n: bs.reduce((a, x) => a + x.n, 0), left: soonest - T, red: soonest < T, yellow: soonest >= T && !!paceOf(good, T) };
  }).sort((a, b) => a.m.name.localeCompare(b.m.name, undefined, { sensitivity: 'base' }));
  const byKey = {};
  S.fridge.forEach(i => { const o = byKey[i.key] = byKey[i.key] || { key: i.key, name: i.name, unit: i.unit, qty: 0, left: Infinity }; o.qty += i.qty; o.left = Math.min(o.left, dayNum(i.start) + i.life - T); });
  const used = new Set(S.modules.flatMap(m => m.ing.map(i => ikey(i.n, i.u))));
  const ings = Object.values(byKey).map(o => ({ ...o, icon: ingIcon(o.name), red: o.left < 0, yellow: o.left >= 0 && o.left <= SOON_DAYS, orphan: !used.has(o.key) })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));   // A to Z, easy to scan
  return { leftovers, ings };
}
function fridgeView() {
  const { leftovers, ings } = fridgeLedger();
  const dl = left => left < 0 ? 'expired' : left === 0 ? 'today' : left > 60 ? '' : `${left}d`;
  const lvl = x => x.red ? 'red' : x.yellow ? 'yellow' : '';
  const chip = (txt, x) => `<span class="fchip ${lvl(x)}">${txt}${dl(x.left) ? ' · ' + dl(x.left) : ''}</span>`;
  const orphans = ings.filter(i => i.orphan && (i.red || i.yellow)).length;
  return `<section class="fridge">
    <div class="fridge-art"><img src="assets/fridge.png" alt=""><div><h2>In your fridge</h2><p class="muted">${leftovers.length} leftover${leftovers.length === 1 ? '' : 's'} · ${ings.length} ingredient${ings.length === 1 ? '' : 's'}</p><div class="fbtns"><button class="btn small primary" data-a="addItem">${svg('plus')}Add item</button><button class="btn small" data-a="fridgeCheck">${svg('check')}Check fridge</button></div></div></div>
    <h3 class="sub">Leftovers <small class="muted">cooked servings</small></h3>
    ${leftovers.length ? `<div class="tiles">${leftovers.map(x => `<button class="tile ${lvl(x)}${ui.fresh === 'm:' + x.m.id ? ' fresh' : ''}" data-a="openFood" data-m="${esc(x.m.id)}" data-k="">${ico(x.m.icon)}<b>${esc(x.m.name)}</b>${chip(`${nice(x.n)} cooked`, x)}</button>`).join('')}</div>` : '<p class="muted pad">Nothing cooked yet. Tap Cooked on the Eat page.</p>'}
    <h3 class="sub">Ingredients <small class="muted">${orphans ? `${orphans} outside your recipes ${orphans === 1 ? 'is' : 'are'} expiring` : 'what you bought'}</small></h3>
    ${ings.length ? `<div class="tiles">${ings.map(i => `<button class="tile ${lvl(i)}${ui.fresh === i.key ? ' fresh' : ''}" data-a="openFood" data-k="${esc(i.key)}" data-m="">${ico(i.icon)}<b>${esc(i.name)}</b>${chip(fmtBase(i.qty, i.unit), i)}</button>`).join('')}</div>` : '<p class="muted pad">Empty. Add what you buy from the Shopping tab.</p>'}
  </section>`;
}

// ----- Eat page: today only. Sides, Cooked, Eaten. Star up to 3 to quiet the page (optional, resets tomorrow). -----
function btnsFor(m, mode) {   // mode: 'today' (Eaten + Cooked), 'past' (Eaten only, records on that day), 'future' (no buttons, just plan with stars)
  if (mode === 'future') return '';
  // Icon buttons: fork and knife = Eaten, pot = Cooked. Cooked never goes past this week's goal; once covered it is greyed out.
  const n = m.makes, met = isPicked(m.id) && remaining(m) <= 0.01;   // Cooked adds the whole recipe
  const cook = !m.cook ? '<span class="gap g-cook"></span>'
    : met ? `<button class="ibtn cook met" data-m="${m.id}" disabled aria-label="Cooked. This week's goal is already cooked.">${svg('pot')}</button>`
    : `<button class="ibtn cook" data-a="cook" data-m="${m.id}" aria-label="Cooked: ${n} serving${n > 1 ? 's' : ''} of ${esc(m.name)}">${svg('pot')}</button>`;
  return `<button class="ibtn eat" data-a="eat" data-m="${m.id}" aria-label="Eaten: ${esc(m.name)}">${svg('eat')}</button>${mode === 'past' ? '' : cook}`;
}
const MAX_STARS = 3;
function starIds(date) { const sd = S.settings.starDays || {}; return (sd[date || ui.date] || []).filter(isPicked); }   // stars belong to a day, so plan tomorrow by starring on tomorrow
// one dot per serving for the week: filled = eaten so far, empty = still to eat (a manual log has no weekly goal, so it shows a dot and a number)
function eatenDots(e) {
  const m = e.mid && mod(e.mid);
  if (!m || !isPicked(m.id)) return `<span class="edot"><i class="on"></i>${nice(e.n)}</span>`;
  const done = Math.floor(eatenCount(m.id) + 0.001), total = Math.max(Math.ceil(weekServings(m)), done);
  return `<span class="dots" role="img" aria-label="${done} of ${total} this week">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>`;
}
function eatView() {
  const today = todayIso(); ui.date = ui.eatDate || today;
  const mode = ui.date === today ? 'today' : ui.date < today ? 'past' : 'future';
  const act = activeMods(), cart = cartMap(), stars = mode === 'past' ? [] : starIds();
  const sc = {}, st = m => (sc[m.id] = sc[m.id] === undefined ? sideStatus(m, ui.date, cart) : sc[m.id]);
  let body = '';
  if (!act.length && !leftoverMods().length) {
    body = `<section class="empty">${ico('stir-fry', 'ico xl')}<h2>Nothing planned yet</h2><p>Pick your week on the Plan tab.</p><button class="btn primary" data-a="tab" data-t="plan">Go to Plan</button></section>`;
  } else {
    const soon = act.map(m => ({ m, u: st(m) })).filter(x => x.u).sort((a, b) => rank(b.u) - rank(a.u));
    if (soon.length && mode === 'today') {
      const top = soon[0], red = top.u.level === 'red';
      body += `<section class="soonbar ${red ? 'red' : 'yellow'}">
        <button class="soonline" data-a="toggleSoon" aria-expanded="${!!ui.soonOpen}">${svg('clock')}<span><b>${esc(top.m.name)}</b> · ${esc(top.u.label)}</span>${soon.length > 1 ? `<i class="more">+${soon.length - 1}</i>` : ''}${svg(ui.soonOpen ? 'up' : 'down')}</button>
        ${ui.soonOpen ? soon.map(({ m, u }) => `<button class="soonitem ${u.level}" data-a="why" data-m="${m.id}">${ico(m.icon)}<span><b>${esc(m.name)}</b><small>${esc(u.label)}</small></span>${svg('fwd')}</button>`).join('') : ''}
      </section>`;
    }
    const row = m => {
      const u = st(m), on = stars.includes(m.id);
      return `<div class="trow ${mode}${u ? ' ' + u.level : ''}">
        <button class="icobtn" data-a="info" data-m="${m.id}" aria-label="Details for ${esc(m.name)}">${ico(m.icon)}</button>
        <div class="einfo"><button class="nameb" data-a="info" data-m="${m.id}">${esc(m.name)}</button>${u ? `<button class="tag ${u.level}" data-a="why" data-m="${m.id}">${u.level === 'yellow' ? 'Expiring soon' : u.hasExpired ? 'Expired' : 'Missing'}</button>` : ''}</div>
        ${mode === 'future' ? '' : `<div class="rbtns">${btnsFor(m, mode)}</div>`}
        ${mode === 'past' ? '<span></span>' : `<button class="icon-btn ${on ? 'starred' : ''}" data-a="star" data-m="${m.id}" aria-label="${on ? 'Unstar' : 'Star'} ${esc(m.name)}">${svg('star')}</button>`}
      </div>`;
    };
    const picks = stars.map(mod).filter(Boolean), rest = act.filter(m => !stars.includes(m.id));
    const dayName = mode === 'today' ? 'Today' : dayWord(dayNum(ui.date) - dayNum(today)).replace(/^./, c => c.toUpperCase());
    const head = (k, name, n, open, badges) => `<button class="acc" data-a="toggleGroup" data-k="${k}" aria-expanded="${open}"><span><b>${name}</b><small>${n}</small></span>${badges || ''}${svg(open ? 'up' : 'down')}</button>`;
    if (picks.length) { const open = ui.grp && '_picks' in ui.grp ? ui.grp._picks : true; body += `<section class="tgroup">${head('_picks', dayName, picks.length, open)}${open ? `<div class="tlist">${picks.map(row).join('')}</div>` : ''}</section>`; }
    const eaten = {};   // what you ate on this day, one line per side, with how many servings
    if (mode !== 'future') S.diary.filter(x => x.type === 'eat' && iso(new Date(x.ts)) === ui.date).forEach(x => { const k = x.mid || x.name; (eaten[k] = eaten[k] || { mid: x.mid, name: x.name, icon: x.icon, n: 0 }).n += x.servings || 1; });
    const eatenList = Object.values(eaten);
    if (eatenList.length) {
      const open = ui.grp && '_eaten' in ui.grp ? ui.grp._eaten : true, total = eatenList.reduce((n, e) => n + e.n, 0);
      body += `<section class="tgroup">${head('_eaten', 'Eaten', nice(total), open)}${open ? `<div class="eatenlist">${eatenList.map(e => `<button class="eatenrow" ${e.mid ? `data-a="info" data-m="${e.mid}"` : ''}>${ico(e.icon)}<span class="ename">${esc(e.name)}</span>${eatenDots(e)}</button>`).join('')}</div>` : ''}</section>`;
    }
    const lefts = mode === 'future' ? [] : leftoverMods();
    if (lefts.length) {
      const open = ui.grp && '_left' in ui.grp ? ui.grp._left : true, total = lefts.reduce((n, m) => n + cookedTotal(m.id), 0);
      body += `<section class="tgroup">${head('_left', 'Leftovers', nice(total), open)}${open ? `<div class="tlist">${lefts.map(m => { const u = st(m); return `<div class="trow past${u ? ' ' + u.level : ''}"><button class="icobtn" data-a="openFood" data-m="${m.id}" data-k="" aria-label="Edit ${esc(m.name)}">${ico(m.icon)}</button><div class="einfo"><button class="nameb" data-a="openFood" data-m="${m.id}" data-k="">${esc(m.name)}</button><small class="muted">${nice(cookedTotal(m.id))} left</small>${u ? `<button class="tag ${u.level}" data-a="why" data-m="${m.id}">${u.level === 'yellow' ? 'Expiring soon' : 'Expired'}</button>` : ''}</div><div class="rbtns"><button class="ibtn eat" data-a="eat" data-m="${m.id}" aria-label="Eaten: ${esc(m.name)}">${svg('eat')}</button></div><span></span></div>`; }).join('')}</div>` : ''}</section>`;
    }
    body += orderedCats().map(c => ({ c, ms: rest.filter(m => m.cat === c.id) })).filter(g => g.ms.length).map(({ c, ms }) => {
      const reds = ms.filter(m => st(m) && st(m).level === 'red').length, yels = ms.filter(m => st(m) && st(m).level === 'yellow').length;
      const open = ui.grp && c.id in ui.grp ? ui.grp[c.id] : reds + yels > 0;   // groups with something going bad open by themselves
      return `<section class="tgroup">${head(c.id, c.short, ms.length, open, `${reds ? `<i class="bdg red">${reds}</i>` : ''}${yels ? `<i class="bdg yellow">${yels}</i>` : ''}`)}${open ? `<div class="tlist">${ms.map(row).join('')}</div>` : ''}</section>`;
    }).join('');
  }
  const off = dayNum(ui.date) - dayNum(today);
  const bar = `<div class="datebar"><button class="icon-btn" data-a="eatDay" data-d="-1" aria-label="Previous day">${svg('back')}</button><button class="daylbl" data-a="eatDay" data-d="0" aria-label="Back to today"><b>${off === 0 ? 'Today' : dayWord(off)}</b><small>${parseIso(ui.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</small></button><button class="icon-btn" data-a="eatDay" data-d="1" aria-label="Next day">${svg('fwd')}</button></div>`;
  return `<div class="page">${header('Eat', mode === 'past' ? 'Record a past meal' : mode === 'future' ? 'Plan ahead' : 'What are you eating?', 2)}${bar}${body}</div>`;
}

// ----- Diary -----
const swWrap = (d, html) => `<div class="swrow dsw"><div class="swdel" aria-hidden="true">${svg('trash')}<span>Delete</span></div>${html}</div>`;
function diaryView() {
  const list = S.diary.slice().sort((a, b) => b.ts - a.ts);
  const days = {};
  list.forEach(d => { const k = iso(new Date(d.ts)); (days[k] = days[k] || []).push(d); });
  const today = todayIso();
  const slotName = id => (SLOTS.find(s => s.id === id) || { name: 'Meal' }).name;
  const body = list.length ? Object.entries(days).map(([k, es]) => `<h3 class="daytitle">${k === today ? 'Today' : fmtDay(k)}</h3>` + es.map(d => swWrap(d, d.type === 'toss'
    ? `<article class="entry toss swcard" data-e="${d.id}"><div class="ehead"><span>Threw out${d.reason === 'expired' ? ' · expired' : ''}</span><small>${fmtTime(d.ts)}</small></div><div class="ebody">${d.icon ? ico(d.icon) : `<span class="svg big">${SV.trash}</span>`}<b>${esc(d.name)}</b><span class="muted">${esc(d.qty || '×' + fmtN(d.servings))}</span></div></article>`
    : `<article class="entry swcard" data-e="${d.id}"><div class="ehead"><span>${slotName(d.slot)}</span><small>${fmtTime(d.ts)}</small></div>
        <div class="ebody">${ico(d.icon || 'other-meal')}<b>${esc(d.name)}${d.servings > 1 ? ' ×' + d.servings : ''}</b></div>
        <div class="rates">${[['rating', 'Taste', 'star'], ['energy', 'Energy', 'bolt'], ['filling', 'Filling', 'bowl']].map(([f, label, ic]) => `<div class="rate ${f}"><span>${label}</span><div class="stars">${[1, 2, 3, 4, 5].map(i => `<button class="${(d[f] || 0) >= i ? 'on' : ''}" data-a="rate" data-i="${d.id}" data-f="${f}" data-r="${i}" aria-label="${label} ${i} of 5">${SV[ic]}</button>`).join('')}</div></div>`).join('')}</div>
        ${d.notes ? `<p class="note">“${esc(d.notes)}”</p>` : ''}
        <button class="linkbtn" data-a="thoughts" data-i="${d.id}">${d.notes ? 'Edit thoughts' : 'Add thoughts'}</button></article>`)).join('')).join('')
    : `<section class="empty">${ico('oatmeal', 'ico xl')}<h2>Your food journal is empty</h2><p>Tap Eaten on the Eat page and it shows up here. Rate it and jot a note.</p></section>`;
  return `<div class="page">${header('Diary', 'Your food journal', 3)}<div class="diary"><button class="btn primary logbtn" data-a="logFood">${svg('plus')}Log food</button>${body}</div></div>`;
}

// ---------- sheets ----------
function sheetHtml() {
  const s = ui.sheet; if (!s) return '';
  let inner = '', cls = '';
  if (s.t === 'info') {
    const m = mod(s.mid); if (!m) return ''; const c = cat(m.cat); cls = 'flip';
    const on = S.week && S.week.picks.includes(m.id);
    const rs = S.diary.filter(d => d.type === 'eat' && d.mid === m.id);
    const avg = f => { const v = rs.map(d => d[f]).filter(x => x > 0); return v.length ? (v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) : '–'; };
    const fact = (l, v) => `<span class="fact">${l} <b>${v}</b></span>`;
    inner = `<div class="cardback" style="--bg:${c.bg};--ink:${c.ink}">
      <div class="cbtop">${ico(m.icon, 'ico big')}<div><h2>${esc(m.name)}</h2><p class="muted">${c.name}${m.bf ? ' · Breakfast' : ''}</p></div></div>
      <div class="facts">${fact('Recipe', nice(m.makes))}${fact('Week', nice(weekServings(m)))}</div>
      <h4>Ingredients <small>whole recipe</small></h4>
      <ul class="ings">${m.ing.map(i => `<li><span>${esc(i.n)}</span><b>${qtyText(i.a, i.u)}</b><small>${fmtBase(toBase(i.a, i.u) / m.makes, baseUnit(i.u))} a serving · fridge ${stock(ikey(i.n, i.u)) > 0.001 ? fmtBase(stock(ikey(i.n, i.u)), baseUnit(i.u)) : 'none'}</small></li>`).join('')}</ul>
      <h4>Prep</h4><p>${esc(m.method) || '<span class="muted">No prep notes yet.</span>'}</p>
      ${rs.length ? `<h4>How it's gone</h4><div class="facts">${fact('Taste', avg('rating'))}${fact('Energy', avg('energy'))}${fact('Filling', avg('filling'))}${fact('Logged', rs.reduce((x, d) => x + d.servings, 0))}</div>` : ''}
      <div class="sheetbtns">${ui.tab === 'eat' ? `<button class="btn grow" data-a="tally" data-m="${m.id}">${svg('edit')}Counts</button>` : ''}<button class="btn ${S.week && ui.tab === 'plan' ? '' : 'grow'}" data-a="editMod" data-m="${m.id}">Edit</button>
      ${S.week && ui.tab === 'plan' ? `<button class="btn primary grow" data-a="pick" data-m="${m.id}" data-close="1">${on ? 'Remove from week' : 'Add to week'}</button>` : ''}</div></div>`;
  }
  if (s.t === 'edit') {
    const d = ui.draft; const off = d.cook ? '' : 'off', dis = d.cook ? '' : 'disabled';
    inner = `${sheetHead(d.isNew ? 'New module' : 'Edit module')}<p id="formmsg" class="formmsg" role="alert"></p>
      <div class="editrow"><button class="iconpick" data-a="toggleIcons">${ico(d.icon, 'ico big')}<small>Change</small></button>
        <div class="namecol"><input class="nameinput" data-f="name" value="${esc(d.name)}" placeholder="Name, e.g. Hot honey chicken" aria-label="Name">
          <div class="catline"><span>Category</span><select data-f="cat">${orderedCats().map(x => `<option value="${x.id}" ${x.id === d.cat ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div></div></div>
      ${ui.iconOpen ? `<div class="iconlist">${ALL_ICONS.map(k => `<button class="${k === d.icon ? 'on' : ''}" data-a="setIcon" data-k="${k}">${ico(k)}</button>`).join('')}</div>` : ''}
      ${fold('servings', 'Servings', `<div class="two">
          <label>Recipe makes<input data-f="makes" type="number" inputmode="numeric" min="1" value="${d.makes}"></label>
          <label>Eat per week<input data-f="wk" type="number" inputmode="decimal" min="0.5" step="0.5" value="${d.wk > 0 ? d.wk : d.makes}"></label>
        </div>`, true)}
      ${fold('ings', 'Ingredients', `${d.ing.map((i, n) => `<div class="ingrow"><input data-f="n" data-i="${n}" list="ingnames" value="${esc(i.n)}" placeholder="Ingredient"><input data-f="a" data-i="${n}" type="text" inputmode="text" placeholder="1/2" value="${esc(nice(i.a))}" aria-label="Amount"><select data-f="u" data-i="${n}" aria-label="Unit">${unitOpts(i.u)}</select><button class="icon-btn" data-a="rmIng" data-i="${n}" aria-label="Remove ingredient">${svg('x')}</button></div>`).join('')}
        <datalist id="ingnames">${knownNames().map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        <button class="linkbtn" data-a="addIng">${svg('plus')}Add ingredient</button>`, true)}
      ${fold('more', 'Cooking and notes', `<label class="switchrow"><span><b>Needs cooking</b></span><input type="checkbox" class="switch" data-f="cook" ${d.cook ? 'checked' : ''}></label>
        <label class="switchrow"><span><b>Counts as breakfast</b></span><input type="checkbox" class="switch" data-f="bf" ${d.bf ? 'checked' : ''}></label>
        <label>Prep<textarea data-f="method" rows="3" placeholder="How to make it">${esc(d.method)}</textarea></label>`, false)}
      ${d.isNew ? '' : `<div class="sheetbtns"><button class="btn danger grow" data-a="delMod">${svg('trash')}Delete module</button></div>`}`;
  }
  if (s.t === 'confirmWeek') { const left = Object.values(S.cooked).flat().reduce((n, x) => n + x.n, 0); inner = `<h2>Start a new week?</h2><p class="muted">Your current plan is archived. Your fridge and diary carry over.</p>${left > 0.05 ? `<p class="muted">You have ${nice(left)} cooked serving${left === 1 ? '' : 's'} left. Eat only shows the sides you pick, so pick those sides again to keep eating them there. Otherwise they stay in the Fridge.</p>` : ''}<div class="sheetbtns"><button class="btn" data-a="closeSheet">Cancel</button><button class="btn primary grow" data-a="newWeek">Start new week</button></div>`; }
  if (s.t === 'assign') {
    const m = mod(s.mid);
    inner = `<h2>Plan ${esc(m.name)}</h2><p class="muted">${fmtDay(ui.date)}. Choose a slot.</p><div class="slotgrid">${SLOTS.map(sl => { const n = entriesOn(ui.date).filter(e => e.slot === sl.id && e.mid === m.id).reduce((a, e) => a + e.n, 0);
      return `<button class="slotbtn" data-a="assignTo" data-m="${m.id}" data-s="${sl.id}">${ico(sl.icon)}<b>${sl.name}</b>${n ? `<small>${n} planned</small>` : ''}</button>`; }).join('')}</div>`;
  }
  if (s.t === 'addTo') {
    const sl = SLOTS.find(x => x.id === s.slot); const act = activeMods();
    const groups = orderedCats().map(c => ({ c, ms: act.filter(m => m.cat === c.id) })).filter(g => g.ms.length);
    inner = `<h2>Add to ${sl.name}</h2>${groups.length ? groups.map(g => `<h4>${g.c.short}</h4><div class="chiplist">${g.ms.map(m => `<button class="mchip" style="--bg:${g.c.bg}" data-a="assignTo" data-m="${m.id}" data-s="${sl.id}" data-keep="1">${ico(m.icon)}<span>${esc(m.name)}</span></button>`).join('')}</div>`).join('') : '<p class="muted">Pick this week\'s modules on the Plan tab first.</p>'}`;
  }
  if (s.t === 'thoughts') {
    const d = S.diary.find(x => x.id === s.id); if (!d) return '';
    inner = `${sheetHead(esc(d.name))}<label>Your thoughts<textarea id="notes" rows="4" placeholder="How did it taste? How did you feel after? What would you change?">${esc(d.notes)}</textarea></label><div class="sheetbtns"><button class="btn danger grow" data-a="delEntry" data-i="${d.id}">${svg('trash')}Delete entry</button></div><p class="muted tiny">Deleting an entry doesn't put food back in your fridge.</p>`;
  }
  if (s.t === 'toss') {
    // one sheet per food. If it has both cooked servings and raw stock, tabs switch between the two.
    const m = s.mid ? mod(s.mid) : null;
    const hasCooked = !!(m && cookedTotal(m.id) > 0), hasRaw = !!(s.key && stock(s.key) > 0.0001);
    if (!hasCooked && !hasRaw) return '';
    if (s.kind === 'cooked' && !hasCooked) s.kind = 'ing'; else if (s.kind === 'ing' && !hasRaw) s.kind = 'cooked';
    let title, max, step, icon, batches, startLabel, noteVal, notePh;
    if (s.kind === 'cooked') {
      title = m.name; icon = m.icon; max = cookedTotal(m.id); step = 1; startLabel = 'Cooked';
      batches = cookedBatches(m.id).slice().sort((x, y) => (dayNum(x.date) + (x.life ?? m.cooked)) - (dayNum(y.date) + (y.life ?? m.cooked)))
        .map(x => ({ id: x.id, q: x.n, start: x.date, life: x.life ?? m.cooked }));
      noteVal = m.storage || STORAGE_DEFAULT[m.cat] || ''; notePh = 'Where and how you keep leftovers';
    } else {
      const items = S.fridge.filter(i => i.key === s.key);
      title = m ? m.name : items[0].name; icon = m ? m.icon : ingIcon(items[0].name); max = stock(s.key); const u = items[0].unit; s.unit = u; startLabel = 'Bought';
      step = u === 'tsp' ? (max <= 12 ? 1 : max <= 96 ? 3 : 12) : u === 'oz' ? (max <= 16 ? 1 : 4) : 1;
      batches = items.slice().sort((x, y) => (dayNum(x.start) + x.life) - (dayNum(y.start) + y.life)).map(x => ({ id: x.id, q: x.qty, start: x.start, life: x.life }));
      noteVal = storageFor(s.key, items[0].name); notePh = 'Where and how you keep it';
    }
    s.max = max; s.step = step; ui.tossAmt = Math.min(Math.max(ui.tossAmt, 1), max);
    const rawUnit = hasRaw ? S.fridge.find(i => i.key === s.key).unit : '';
    const nExp = batches.filter(x => dayNum(x.start) + x.life < dayNum(todayIso())).length;
    const seg = hasCooked && hasRaw ? `<div class="seg" role="tablist"><button class="${s.kind === 'cooked' ? 'on' : ''}" data-a="foodTab" data-kind="cooked" role="tab">Cooked <b>${nice(cookedTotal(m.id))}</b></button><button class="${s.kind === 'ing' ? 'on' : ''}" data-a="foodTab" data-kind="ing" role="tab">Raw <b>${fmtBase(stock(s.key), rawUnit)}</b></button></div>` : '';
    const ic = s.kind === 'cooked' || m ? ico(icon, 'ico headico') : `<button class="iconpick mini" data-a="ingIcons" aria-label="Change icon">${ico(icon, 'ico headico')}</button>`;
    const lab = q => s.kind === 'cooked' ? plural(q, 'serving') : fmtBase(q, s.unit);
    const groups = batches.map(x => ({ ids: [x.id], q: x.q, start: x.start, life: x.life }));   // one card per purchase; you decide what to combine
    const titleEl = s.kind === 'ing' ? `<input id="fname" class="titleinput" list="ingnames" value="${esc(S.fridge.find(i => i.key === s.key).name)}" autocomplete="off" autocapitalize="none" aria-label="Name">` : `<span>${esc(title)}</span>`;
    inner = `${sheetHead(`${ic}${titleEl}`)}<p id="formmsg" class="formmsg" role="alert"></p>${seg}<p id="finfo" class="muted">${fridgeInfoText(s)}</p>
      ${s.kind === 'ing' ? `<datalist id="ingnames">${knownNames().map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}
      ${s.iconOpen ? `<div class="iconlist">${ALL_ICONS.map(k => `<button class="${k === icon ? 'on' : ''}" data-a="setIngIcon" data-k="${k}">${ico(k)}</button>`).join('')}</div>` : ''}
      <section class="sec"><div class="sechead"><h4>${s.kind === 'cooked' ? 'Cooked' : 'Bought'} and expiry</h4>${s.kind === 'ing' ? `<button class="icon-btn" data-a="addBatch" aria-label="New purchase">${svg('plus')}</button>` : ''}</div>
        ${groups.map(g => `<div class="batch${s.freshId && g.ids[0] === s.freshId ? ' fresh' : ''}" data-b="${g.ids.join(',')}">
          <div class="dates2"><label>${startLabel}${dbx('date', 'data-bf="start"', g.start)}</label><label>Expires${dbx('date', 'data-bf="exp"', addDays(g.start, g.life))}</label></div>
          <div class="keepline">${s.kind === 'ing' ? `<span class="cstep"><button data-a="batchInc" data-id="${g.ids[0]}" data-d="-1" aria-label="Less">${svg('minus')}</button><b class="amt">${lab(g.q)}</b><button data-a="batchInc" data-id="${g.ids[0]}" data-d="1" aria-label="More">${svg('plus')}</button></span>` : `<b class="amt">${lab(g.q)}</b>`}<label class="keepsrow">Keeps for<span class="withsuf"><input type="number" inputmode="numeric" min="0" data-bf="life" value="${g.life}"><em>days</em></span></label></div></div>`).join('')}
      </section>
      <section class="sec"><h4>Storage</h4><textarea id="stor" rows="2" placeholder="${notePh}">${esc(noteVal)}</textarea></section>
      <section class="sec"><h4>Remove</h4>
        <div class="bigstep"><button data-a="tossInc" data-d="-1" aria-label="Less">${svg('minus')}</button><b>${s.kind === 'ing' ? fmtBase(ui.tossAmt, s.unit) : fmtN(ui.tossAmt)}</b><button data-a="tossInc" data-d="1" aria-label="More">${svg('plus')}</button><button class="linkbtn" data-a="tossAll">All</button></div>
        <div class="sheetbtns"><button class="btn grow" data-a="useUp">${svg('check')}Used up</button><button class="btn danger-fill grow" data-a="doToss">${svg('trash')}Throw out</button></div>
        ${nExp ? `<button class="btn danger wide" data-a="tossExpired">${svg('trash')}${nExp > 1 ? `Throw out the ${nExp} expired` : 'Throw out expired'}</button>` : ''}
      </section>`;
  }
  if (s.t === 'unit') {
    const l = cartLines().find(x => x.key === s.key); if (!l) return '';
    const u = chooseUnit(l.size, l.unit), f = UNITS_F(u);
    inner = `${sheetHead(`${ico(ingIcon(l.name), 'ico headico')}<span>${esc(l.name)}</span>`)}
      <p id="usum" class="muted">${esc(cartSummary(l))}</p>
      <div class="unitedit" data-k="${esc(l.key)}">
        <label>1 unit is<span class="ufld"><input class="u-size" data-k="${esc(l.key)}" type="text" inputmode="text" value="${esc(nice(l.size / f))}" aria-label="How much one unit of ${esc(l.name)} holds"><select class="u-unit" data-k="${esc(l.key)}" aria-label="Unit of measure">${unitOpts(u, unitList(l.unit))}</select></span></label>
        <label>Price per unit<span class="ufld"><span class="dollar">$</span><input class="price-in" data-k="${esc(l.key)}" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${l.price ?? ''}" aria-label="Price of one unit of ${esc(l.name)}"></span></label>
      </div>
      <div class="cfoot"><small class="uhint" ${l.known ? 'hidden' : ''}>This size is a guess. Set it to match what you buy.</small><b id="utotal" class="ltotal">${l.total != null ? `${plural(l.units, 'unit')} · $${l.total.toFixed(2)}` : ''}</b></div>`;
  }
  if (s.t === 'fcheck') {
    const { leftovers, ings } = fridgeLedger();
    const row = (icon, name, qty, btn) => `<div class="whyrow"><span class="whytxt checkrow">${icon}<span><b>${esc(name)}</b><small>${qty}</small></span></span><span class="whybtns">${btn}</span></div>`;
    inner = `<h2>Check your fridge</h2><p class="muted">Tap Out for anything that's gone. Nothing is logged as waste.</p>
      <div class="whylist">${leftovers.map(x => row(ico(x.m.icon), x.m.name, plural(x.n, 'cooked serving'), `<button class="btn small" data-a="outMid" data-m="${x.m.id}">Out</button>`)).join('')}${ings.map(i => row(ico(i.icon), i.name, fmtBase(i.qty, i.unit), `<button class="btn small" data-a="outKey" data-k="${esc(i.key)}">Out</button>`)).join('')}
      ${leftovers.length + ings.length ? '' : '<p class="muted">The fridge is empty.</p>'}</div>`;
  }
  if (s.t === 'why') {
    const m = mod(s.mid); if (!m) return '';
    const u = sideStatus(m, ui.date, cartMap()), T = dayNum(todayIso());
    const picked = !!(S.week && S.week.picks.includes(m.id));
    const batchRow = (icon, text, btns) => `<div class="whyrow"><span class="whytxt">${text}</span><span class="whybtns">${btns}</span></div>`;
    let rows = '';
    if (u) {
      u.expired.cooked.forEach(b => { rows += batchRow('', `<b>${plural(b.n, 'cooked serving')}</b><small>Eat-by ${dayWord(b.exp - T)} · expired</small>`, `<button class="btn small danger" data-a="whyToss" data-m="${m.id}" data-b="${b.id}" data-w="cooked">${svg('trash')}Throw out</button><button class="btn small" data-a="whyDate" data-m="${m.id}">Edit date</button>`); });
      u.expired.raw.forEach(b => { rows += batchRow('', `<b>${esc(b.name)} <span class="muted">${fmtBase(b.qty, b.unit)}</span></b><small>Eat-by ${dayWord(b.exp - T)} · expired</small>`, `<button class="btn small danger" data-a="whyToss" data-b="${b.id}" data-w="raw">${svg('trash')}Throw out</button><button class="btn small" data-a="whyDate" data-k="${esc(b.key)}">Edit date</button>`); });
      u.missing.forEach(l => { rows += batchRow('', `<b>${esc(l.name)}</b><small>Need ${fmtBase(l.miss, l.unit)} · it's in your shopping cart</small>`, `<button class="btn small primary" data-a="whyBought" data-k="${esc(l.key)}">${svg('plus')}I bought it</button>`); });
      if (u.level === 'yellow') cookedBatches(m.id).forEach(b => { const e = dayNum(b.date) + (b.life ?? m.cooked); if (e >= T) rows += batchRow('', `<b>${plural(b.n, 'cooked serving')}</b><small>Eat-by ${dayWord(e - T)}</small>`, `<button class="btn small" data-a="whyDate" data-m="${m.id}">Edit date</button>`); });
    }
    inner = `<h2>${esc(m.name)}</h2>
      ${u ? `<p class="whystatus ${u.level}">${esc(u.label)}</p>` : '<p class="muted">All good. Nothing needs attention.</p>'}
      ${u && u.level === 'red' ? `<p class="muted">${u.hasExpired ? 'Throw out what has expired, or fix the date if it is still good. ' : ''}${u.missing.length ? 'Buy what is missing, or remove this side from the week.' : ''}</p>` : u ? `<p class="muted">You would need to eat about one a day to get through these in time.</p>` : ''}
      <div class="whylist">${rows}</div>
      <div class="sheetbtns col">${u && u.missing.length ? `<button class="btn" data-a="openCart">${svg('cart')}Open shopping cart</button>` : ''}${picked ? `<button class="btn" data-a="whyRemove" data-m="${m.id}">Remove from this week</button>` : ''}</div>`;
  }
  if (s.t === 'tally') {
    const m = mod(s.mid); if (!m) return '';
    const t = (S.week && S.week.tally[m.id]) || { cooked: 0 }; const eaten = eatenCount(m.id), ready = cookedTotal(m.id);
    const stepper = (act, n, minusOff) => `<div class="bigstep sm"><button data-a="${act}" data-d="-1" ${minusOff ? 'disabled' : ''} aria-label="One fewer">${svg('minus')}</button><b>${nice(n)}</b><button data-a="${act}" data-d="1" aria-label="One more">${svg('plus')}</button></div>`;
    inner = `<h2>${esc(m.name)}</h2><p class="muted">This week · eating ${nice(weekServings(m))} servings · recipe makes ${m.makes}</p>
      ${m.cook ? `<div class="tallyrow"><div><b>Cooked</b><small>${ready < 1 ? 'Nothing cooked is left in the fridge to remove.' : 'Adding uses ingredients from your fridge. Removing puts them back.'}</small></div>${stepper('tallyCook', t.cooked, ready < 1)}</div>` : ''}
      <div class="tallyrow"><div><b>Eaten</b><small>${eaten ? 'Removing takes the latest serving out of your diary and puts the food back.' : 'Nothing eaten yet this week.'}</small></div>${stepper('tallyEat', eaten, eaten < 1)}</div>
      <div class="facts"><div><b>${nice(ready)}</b><small>${m.cook ? 'cooked, ready to eat' : 'prepared'}</small></div><div><b>${nice(rawLeft(m))}</b><small>servings of raw ingredients</small></div></div>
      ${ready >= 1 ? `<div class="sheetbtns"><button class="btn danger grow" data-a="tallyToss" data-m="${m.id}">${svg('trash')}Throw some out</button></div>` : ''}`;
  }
  if (s.t === 'logfood') {
    const L = ui.log; const now = new Date();
    const week = activeMods();
    inner = `${sheetHead('Log food')}
      <button class="weekbtn" data-a="logSides" aria-haspopup="dialog">${svg('plan')}<span>Pick a food</span>${svg('down')}</button>
      <div class="logname"><button class="iconpick mini" data-a="logIcons" aria-label="Change icon">${ico(L.icon, 'ico headico')}</button>
        <label>What did you eat?<input id="lg-n" value="${esc(L.name)}" placeholder="e.g. Burrito bowl" autocomplete="off"></label></div>
      <div class="logday"><button class="chip ${L.date === todayIso() ? 'on' : ''}" data-a="logDay" data-d="0">Today</button><button class="chip ${L.date === addDays(todayIso(), -1) ? 'on' : ''}" data-a="logDay" data-d="-1">Yesterday</button>${dbx('date', 'id="lg-d" aria-label="Date"', L.date)}</div>
      <div class="logrow"><label>Meal<select id="lg-s">${SLOTS.map(x => `<option value="${x.id}" ${x.id === L.slot ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <label>Time${dbx('time', 'id="lg-t"', L.time)}</label>
        <label>Servings<input id="lg-q" type="number" inputmode="numeric" min="1" value="${L.servings}"></label></div>
      <label>Your thoughts<textarea id="lg-o" rows="2" placeholder="Optional">${esc(L.notes)}</textarea></label>`;
  }
  if (s.t === 'addItem') inner = `${sheetHead('Add to fridge')}<p id="formmsg" class="formmsg" role="alert"></p><div class="seg" id="ai-kind"><button type="button" class="on" data-a="addKind" data-k="ing">Ingredient</button><button type="button" data-a="addKind" data-k="ready">Leftovers</button></div><div class="itemrow"><button class="iconpick mini" id="ai-ic" data-a="addIcons" type="button" aria-label="Choose icon">${ico(s.icon || 'other-meal', 'ico headico')}</button><label>Item<input id="ai-n" list="ingnames" placeholder="e.g. Kati rolls" autocomplete="off"></label></div><div class="iconlist" id="ai-icons" hidden>${ALL_ICONS.map(k => `<button type="button" data-a="setAddIcon" data-k="${k}">${ico(k)}</button>`).join('')}</div><datalist id="ingnames">${knownNames().map(x => `<option value="${esc(x)}">`).join('')}</datalist><div class="two"><label><span id="ai-ql">Quantity</span><input id="ai-q" type="text" inputmode="text" value="1" placeholder="1/2"></label><label id="ai-ufld">Unit<select id="ai-u">${unitOpts('ea')}</select></label></div><div class="dates2"><label>Bought${dbx('date', 'id="ai-s"', todayIso())}</label><label>Expires${dbx('date', 'id="ai-e"', '')}</label><label class="keepsrow">Keeps for<span class="withsuf"><input id="ai-l" type="number" inputmode="numeric" min="0" placeholder="auto"><em>days</em></span></label></div>`;
  if (s.t === 'settings') {
    const acc = (k, title, summary, body) => { const open = !!(s.open && s.open[k]); return `<button class="acc" data-a="toggleAcc" data-k="${k}" aria-expanded="${open}"><span><b>${title}</b><small>${summary}</small></span>${svg(open ? 'up' : 'down')}</button>${open ? `<div class="accbody">${body}</div>` : ''}`; };
    const planBody = `<p class="muted">The order of the steps when you plan a week, and how many to pick from each. Use 0 for no target.</p>
      <div class="orderlist">${orderedCats().map((c, i, arr) => `<div class="orow" style="--bg:${c.bg}"><span class="oicon">${ico(c.icon)}</span><b>${c.short}</b>
        <span class="movers"><button data-a="catMove" data-c="${c.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${c.short} earlier">${svg('up')}</button><button data-a="catMove" data-c="${c.id}" data-d="1" ${i === arr.length - 1 ? 'disabled' : ''} aria-label="Move ${c.short} later">${svg('down')}</button></span>
        <span class="pickn"><button data-a="catTarget" data-c="${c.id}" data-d="-1" aria-label="Fewer ${c.short}">${svg('minus')}</button><b>${targetFor(c.id) || 'Any'}</b><button data-a="catTarget" data-c="${c.id}" data-d="1" aria-label="More ${c.short}">${svg('plus')}</button></span></div>`).join('')}</div>`;
    const colorsBody = `<p><b class="ctag yellow">Yellow</b> means use it soon: you would have to eat about one serving a day, or more, to get through it before its eat-by date. The eat-by day itself is still fine.</p>
      <p><b class="ctag red">Red</b> means something is wrong: something is past its eat-by date, or you are missing an ingredient. Throw out what has expired, buy what is missing, or remove the side from the week.</p>
      <p class="muted tiny">Colors come only from what is in your fridge and today's date. Meal slots never change them. When you look at a later day, the Eat page previews what will be tight by then.</p>`;
    const dataBody = `<div class="sheetbtns col"><button class="btn" data-a="exportData">Export backup</button><label class="btn filebtn">Import backup<input type="file" accept="application/json" id="imp" hidden></label><button class="btn danger" data-a="resetModules">Reset module library</button></div>
      <p class="muted tiny">Everything is stored on this device only. Export a backup now and then.</p>`;
    inner = `${sheetHead('Settings')}
    ${acc('plan', 'Planning', `${orderedCats().length} steps · ${orderedCats().reduce((n, c) => n + targetFor(c.id), 0)} picks a week`, planBody)}
    ${acc('colors', 'What the colors mean', 'Yellow is use soon, red is a problem', colorsBody)}
    ${acc('data', 'Your data', 'Back up, restore, or reset', dataBody)}
    <p class="version">Meal Loop · version ${APP_VERSION}</p>`;
  }
  return `<div class="backdrop" data-a="closeSheet"></div><div class="panel ${cls}"><div class="grab"></div><button class="sheetx" data-a="closeSheet" aria-label="Close">${svg('x')}</button><div class="pbody">${inner}</div></div>${popHtml()}`;
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
let lastSheet = null;
// text boxes grow with what is typed, so nothing hides behind a tiny scroll window
function autoGrow(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 4) + 'px'; }
function renderSheet() {
  const el = $('#sheet'); const same = !!ui.sheet && ui.sheet === lastSheet; lastSheet = ui.sheet;
  const keep = same && $('.pbody') ? $('.pbody').scrollTop : 0;
  const html = sheetHtml();
  el.innerHTML = html; el.className = html ? 'open' + (same ? ' still' : '') : '';
  if (same && keep && $('.pbody')) $('.pbody').scrollTop = keep;
  document.body.classList.toggle('lock', !!html);
  el.querySelectorAll('textarea').forEach(autoGrow);
  syncDbox();
}

// ---------- actions ----------
function readDraftField(el) {
  const d = ui.draft; const f = el.dataset.f; if (!d || !f) return;
  if (el.dataset.i !== undefined) { const row = d.ing[+el.dataset.i]; row[f] = f === 'a' ? parseAmt(el.value) : el.value; return; }
  if (f === 'cook') {
    d.cook = el.checked;
    document.querySelectorAll('#sheet [data-cookonly]').forEach(l => { l.classList.toggle('off', !d.cook); const i = l.querySelector('input'); if (i) i.disabled = !d.cook; });
  }
  else if (f === 'bf') d.bf = el.checked;
  else if (['makes', 'wk', 'per', 'raw', 'cooked'].includes(f)) d[f] = parseFloat(el.value) || 0;
  else d[f] = el.value;
}
document.addEventListener('input', e => {
  if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
  if (ui.sheet && ui.sheet.t === 'edit') { readDraftField(e.target); ui.sheet.warned = false; scheduleCommit(); }
  const id = e.target.id;
  if (ui.sheet && ui.sheet.t === 'toss') { if (e.target.dataset.bf) onBatchInput(e.target); else if (id === 'stor') saveStorage(e.target.value); }
  if (ui.sheet && ui.sheet.t === 'addItem' && (id === 'ai-s' || id === 'ai-e' || id === 'ai-l')) linkAddDates(id);
  if (ui.sheet && ui.sheet.t === 'addItem' && id === 'ai-n') { guessAddLife(); if (!ui.sheet.icon) $('#ai-ic').innerHTML = ico(ingIcon(e.target.value.trim() || 'x'), 'ico headico'); }
  if (id === 'notes' && ui.sheet && ui.sheet.t === 'thoughts') scheduleCommit();
  if (ui.sheet && (ui.sheet.t === 'logfood' || ui.sheet.t === 'addItem') && /^(lg|ai)-/.test(id)) { ui.sheet.warned = false; scheduleCommit(); }
  if (e.target.classList.contains('price-in')) { const v = parseFloat(e.target.value); setUnit(e.target.dataset.k, { price: v >= 0 ? v : null }); }
  if (e.target.classList.contains('u-size')) {
    const row = e.target.closest('.unitedit'), v = parseAmt(e.target.value);
    if (row && v > 0) setUnit(e.target.dataset.k, { size: v * UNITS_F(row.querySelector('.u-unit').value) });
  }
});
document.addEventListener('change', e => {
  if (ui.sheet && ui.sheet.t === 'edit') { readDraftField(e.target); scheduleCommit(); }
  if (ui.sheet && ui.sheet.t === 'toss' && e.target.dataset.bf) onBatchInput(e.target);
  if (e.target.id === 'fname' && ui.sheet && ui.sheet.t === 'toss') renameIng(e.target.value);
  if ((e.target.id === 'setq' || e.target.id === 'setu') && ui.sheet && ui.sheet.t === 'toss') applyQty();
  if (ui.sheet && ui.sheet.t === 'addItem' && (e.target.id === 'ai-s' || e.target.id === 'ai-e')) linkAddDates(e.target.id);
  if (e.target.id === 'imp') importData(e.target.files[0]);
  if (ui.sheet && (ui.sheet.t === 'logfood' || ui.sheet.t === 'addItem') && /^(lg|ai)-/.test(e.target.id)) { ui.sheet.warned = false; scheduleCommit(); }
  if (e.target.classList.contains('u-unit')) {
    const row = e.target.closest('.unitedit'), v = parseAmt(row.querySelector('.u-size').value);
    if (v > 0) setUnit(e.target.dataset.k, { size: v * UNITS_F(e.target.value) });
  }
});

// ----- autosave: forms commit when closed; the module editor and notes also save as you type -----
let commitTimer;
// rename a fridge ingredient (all its batches) so it matches the name used in your recipes, and stops showing up in the shopping cart
function renameIng(v) {
  const sh = ui.sheet, old = sh.key, items = S.fridge.filter(i => i.key === old); if (!items.length) return;
  const oldName = items[0].name, u = items[0].unit, name = canon(v.trim()), msg = $('#formmsg'), fld = $('#fname');
  if (!name) { fld.value = oldName; return; }
  const nk = ikey(name, u), k = normName(name), used = new Set();
  S.modules.forEach(m => m.ing.forEach(i => { if (normName(i.n) === k) used.add(baseUnit(i.u)); }));
  S.fridge.forEach(f => { if (f.key !== old && normName(f.name) === k) used.add(f.unit); });
  if (used.size && !used.has(u)) { msg.textContent = `${name} is measured a different way in your recipes.`; fld.value = oldName; return; }
  msg.textContent = '';
  items.forEach(i => { i.name = name; i.key = nk; });
  if (nk !== old) {
    ['units', 'life', 'ingNotes'].forEach(b => { if (S[b] && S[b][old] !== undefined && S[b][nk] === undefined) S[b][nk] = S[b][old]; });
    const ok = normName(oldName), nn = normName(name);
    if (S.ingIcons && S.ingIcons[ok] && !S.ingIcons[nn]) S.ingIcons[nn] = S.ingIcons[ok];
  }
  sh.key = nk; save(); render(); savedFlash();
}
function savedFlash() {
  const el = $('#savedchip'); if (!el) return;
  if (ui.sheet) ui.sheet.saved = true;
  el.classList.add('ok');
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
const cartSummary = l => `Need ${fmtBase(l.miss, l.unit)}${l.unit === 'ea' ? ' each' : ''} · buy ${plural(l.units, 'unit')}`;
const cartBuyText = l => `Buy ${plural(l.units, 'unit')}${l.unit === 'ea' && l.size === 1 ? '' : ' of ' + fmtBase(l.size, l.unit)}`;
const cartNeedText = l => `Need ${fmtBase(l.miss, l.unit)}${l.unit === 'ea' ? ' each' : ''} · for ${l.forMods.slice(0, 2).join(', ')}${l.forMods.length > 2 ? '…' : ''}`;
function refreshCart() {
  const lines = cartLines(), priced = lines.filter(l => l.total != null), sum = priced.reduce((a, l) => a + l.total, 0);
  document.querySelectorAll('.row.cart').forEach(row => {
    const l = lines.find(x => x.key === row.dataset.k); if (!l) return;
    const c = row.querySelector('.csum'), f = row.querySelector('.for'), p = row.querySelector('.cprice');
    if (c) c.textContent = cartBuyText(l);
    if (f) f.textContent = cartNeedText(l);
    if (p) { p.textContent = l.total != null ? '$' + l.total.toFixed(2) : 'Add price'; p.classList.toggle('none', l.total == null); }
  });
  if (ui.sheet && ui.sheet.t === 'unit') {   // the edit sheet, if it is open
    const l = lines.find(x => x.key === ui.sheet.key);
    if (l) { const a = $('#usum'), t = $('#utotal'), h = $('.uhint'); if (a) a.textContent = cartSummary(l); if (t) t.textContent = l.total != null ? `${plural(l.units, 'unit')} · $${l.total.toFixed(2)}` : ''; if (h) h.hidden = l.known; }
  }
  const tb = $('.totalcard b'); if (tb) tb.textContent = '$' + sum.toFixed(2);
  const tm = $('.totalcard .muted'); if (tm) tm.textContent = `${priced.length} of ${lines.length} priced${priced.length < lines.length ? '. Add a price to each line.' : ''}`;
}
function formMsg(t) { const el = $('#formmsg'); if (el) el.textContent = t || ''; }
function commitModule() {
  const d = ui.draft; if (!d) return { skip: true };
  if (d.isNew && !d.name.trim() && d.ing.every(i => !i.n.trim())) return { skip: true };
  if (!d.name.trim()) return { error: 'Give the module a name.' };
  const ing = d.ing.filter(i => i.n.trim()).map(i => ({ n: canon(i.n), a: i.a || 0, u: normU(i.u) }));
  if (!ing.length) return { error: 'Add at least one ingredient.' };
  for (const i of ing) { const bad = unitConflict(i.n, i.u, d.id); if (bad) return { error: bad }; }
  const seen = new Set();
  for (const i of ing) { const k = ikey(i.n, i.u); if (seen.has(k)) return { error: `${i.n} is listed twice. Combine it into one line.` }; seen.add(k); }
  const makes = Math.max(1, d.makes || 1);
  const saved = { ...clone(d), ing, makes, wk: d.wk > 0 ? d.wk : makes, per: makes };
  delete saved.isNew;
  const idx = S.modules.findIndex(m => m.id === d.id);
  if (idx >= 0) S.modules[idx] = saved; else S.modules.push(saved);
  d.isNew = false; save();
  return { ok: true, created: idx < 0 };
}
function flushNotes() {
  const s = ui.sheet; if (!s || s.t !== 'thoughts') return;
  const n = $('#notes'), e = S.diary.find(x => x.id === s.id); if (!n || !e) return;
  e.notes = n.value.trim(); save();
}
function commitLog() {
  captureLog(); const L = ui.log;
  if (!L || !L.name.trim()) return { skip: true };
  const ts = new Date(`${L.date || todayIso()}T${L.time || '12:00'}`).getTime();
  const fields = { ts: isNaN(ts) ? Date.now() : ts, name: L.name.trim(), icon: L.icon, servings: Math.max(1, parseInt(L.servings) || 1), slot: L.slot, notes: L.notes.trim() };
  const e = L.entryId && S.diary.find(d => d.id === L.entryId);
  if (e) Object.assign(e, fields);
  else { const n = { id: uid(), type: 'eat', manual: true, rating: 0, ...fields }; S.diary.push(n); L.entryId = n.id; }
  save(); return { ok: true, created: !e };
}
function commitItem() {
  const s = ui.sheet, nEl = $('#ai-n'); if (!s || !nEl || !nEl.value.trim()) return { skip: true };
  const n = nEl.value.trim(), q = parseAmt($('#ai-q').value), u = $('#ai-u').value;
  if (s.ready) {   // takeout or other leftovers: servings you can eat, no recipe, never in this week's list
    if (!(q > 0)) return { error: 'Enter how many servings.' };
    const st = $('#ai-s').value || todayIso(), ev = $('#ai-e').value, lv = parseInt($('#ai-l').value);
    let life = 3; if (lv >= 0) life = lv; else if (ev) { life = dayNum(ev) - dayNum(st); if (life < 0) return { error: 'That expiry date is before it was bought.' }; }
    let m = s.mid && mod(s.mid), created = false;
    if (!m) { m = newOneoff(n); s.mid = m.id; created = true; }
    m.name = n; m.icon = s.icon || ingIcon(n); m.cooked = life;
    const list = (S.cooked[m.id] = S.cooked[m.id] || []); let b = s.cbId && list.find(x => x.id === s.cbId);
    if (b) Object.assign(b, { n: q, date: st, life }); else { b = { id: uid(), n: q, date: st, life }; list.push(b); s.cbId = b.id; }
    ui.fresh = 'm:' + m.id; save(); return { ok: true, created, name: n };
  }
  if (!(q > 0)) return { error: 'Enter a quantity.' };
  const bad = unitConflict(n, u, null, s.batchId); if (bad) return { error: bad };
  const st = $('#ai-s').value || todayIso(), ev = $('#ai-e').value, lv = parseInt($('#ai-l').value);
  let life; if (lv >= 0) life = lv; else if (ev) { life = dayNum(ev) - dayNum(st); if (life < 0) return { error: 'That expiry date is before it was bought.' }; }
  const nm = canon(n), bu = baseUnit(u);
  if (life != null && s.lifeSrc === 'keeps') S.life[ikey(nm, bu)] = life;
  const b = s.batchId && S.fridge.find(f => f.id === s.batchId);
  ui.fresh = ikey(nm, bu);   // the tile to highlight on the Fridge page
  if (b) { Object.assign(b, { name: nm, unit: bu, key: ikey(nm, bu), qty: toBase(q, u), start: st, life: life != null ? life : lifeFor(nm, bu) }); if (s.icon) S.ingIcons[normName(nm)] = s.icon; save(); return { ok: true, created: false, name: n }; }
  const nb = addFridge(n, u, q, st, life); s.batchId = nb.id;
  if (s.icon) S.ingIcons[normName(nm)] = s.icon;
  save();
  return { ok: true, created: true, name: n };
}
// keep Bought / Expires / Keeps in step on the add sheet
// once a name is typed, fill Expires with the usual shelf life (until you type a date or days yourself)
function dropCreated(s) {   // switching Ingredient / Leftovers after typing: remove what the sheet made, then make it again as the other kind
  if (s.batchId) { S.fridge = S.fridge.filter(f => f.id !== s.batchId); s.batchId = null; }
  if (s.mid) { delete S.cooked[s.mid]; S.modules = S.modules.filter(m => m.id !== s.mid); s.mid = null; s.cbId = null; }
}
function guessAddLife() {
  const s = ui.sheet, n = $('#ai-n').value.trim(), eEl = $('#ai-e'), lEl = $('#ai-l'), sEl = $('#ai-s');
  if (s.lifeSrc || !n) return;
  const d = s.ready ? 3 : lifeFor(canon(n), baseUnit($('#ai-u').value));
  lEl.placeholder = d; eEl.value = addDays(sEl.value || todayIso(), d);
}
function linkAddDates(id) {
  const sEl = $('#ai-s'), eEl = $('#ai-e'), lEl = $('#ai-l'), st = sEl.value || todayIso();
  if (id === 'ai-l') { const n = parseInt(lEl.value); if (n >= 0) { eEl.value = addDays(st, n); ui.sheet.lifeSrc = 'keeps'; } }
  else if (id === 'ai-e') { if (eEl.value) { const n = dayNum(eEl.value) - dayNum(st); if (n >= 0) { lEl.value = n; ui.sheet.lifeSrc = 'exp'; } } }
  else if (id === 'ai-s') { const n = parseInt(lEl.value) >= 0 ? parseInt(lEl.value) : parseInt(lEl.placeholder); if (n >= 0 && sEl.value) eEl.value = addDays(sEl.value, n); }
}
// Bought / Expires / Keeps on a fridge item: any one of them updates the others
const stepFor = (u, q) => u === 'tsp' ? (q <= 12 ? 1 : q <= 96 ? 3 : 12) : u === 'oz' ? (q <= 16 ? 1 : 4) : 1;
function onBatchInput(el) {
  const s = ui.sheet, row = el.closest('.batch'); if (!row) return;
  const cooked = s.kind === 'cooked', m = cooked ? mod(s.mid) : null, f = el.dataset.bf;
  const bs = row.dataset.b.split(',').map(id => cooked ? cookedBatches(s.mid).find(x => x.id === id) : S.fridge.find(x => x.id === id)).filter(Boolean); if (!bs.length) return;
  const b = bs[0], start = () => cooked ? b.date : b.start, life = () => cooked ? (b.life ?? m.cooked) : b.life;
  const fE = row.querySelector('[data-bf=exp]'), fL = row.querySelector('[data-bf=life]'), iso = /^\d{4}-\d\d-\d\d$/;
  formMsg('');
  if (f === 'start') { if (!iso.test(el.value)) return; bs.forEach(x => { if (cooked) x.date = el.value; else x.start = el.value; }); fE.value = addDays(el.value, life()); }
  else if (f === 'life') { const n = parseInt(el.value); if (!(n >= 0)) return; bs.forEach(x => { x.life = n; }); fE.value = addDays(start(), n); if (cooked) m.cooked = n; else S.life[b.key] = n; }
  else if (f === 'exp') { if (!iso.test(el.value)) return; const n = dayNum(el.value) - dayNum(start()); if (n < 0) { formMsg('That date is before it was ' + (cooked ? 'cooked.' : 'bought.')); return; } bs.forEach(x => { x.life = n; }); fL.value = n; }
  save(); savedFlash(); renderMain();
  const fi = $('#finfo'); if (fi) fi.textContent = fridgeInfoText(s);
}
function fridgeInfoText(s) {
  const T = dayNum(todayIso()), byExp = (x, y) => (dayNum(x.start) + x.life) - (dayNum(y.start) + y.life);
  let first, qtyTxt, label;
  if (s.kind === 'cooked') {
    const m = mod(s.mid); if (!m) return ''; const bs = cookedBatches(m.id); if (!bs.length) return '';
    first = bs.map(b => ({ start: b.date, life: b.life ?? m.cooked })).sort(byExp)[0]; qtyTxt = plural(cookedTotal(m.id), 'cooked serving'); label = 'cooked';
  } else {
    const items = S.fridge.filter(i => i.key === s.key); if (!items.length) return '';
    first = items.map(b => ({ start: b.start, life: b.life })).sort(byExp)[0]; qtyTxt = fmtBase(stock(s.key), items[0].unit) + (s.mid ? ' ' + items[0].name.toLowerCase() + ' raw' : ''); label = 'bought';
  }
  const ago = T - dayNum(first.start), left = dayNum(first.start) + first.life - T;
  return `${qtyTxt} in the fridge · ${label} ${ago <= 0 ? 'today' : plural(ago, 'day') + ' ago'} · ${left < 0 ? 'expired' : left === 0 ? 'expires today' : 'expires in ' + plural(left, 'day')}`;
}
function saveStorage(v) {
  const s = ui.sheet; if (!s || s.t !== 'toss') return;
  if (s.kind === 'cooked') { const m = mod(s.mid); if (m) m.storage = v; } else S.ingNotes[s.key] = v;
  save(); savedFlash();
}
function runCommit() {
  const s = ui.sheet; if (!s) return;
  if (s.t === 'edit') { const r = commitModule(); formMsg(r.error || ''); if (r.ok) { savedFlash(); renderMain(); } }
  else if (s.t === 'thoughts') { flushNotes(); savedFlash(); renderMain(); }
  else if (s.t === 'logfood') { const r = commitLog(); if (r.ok) { savedFlash(); renderMain(); } }
  else if (s.t === 'addItem') { const r = commitItem(); formMsg(r.error || ''); if (r.ok) { savedFlash(); renderMain(); if (r.created) toast(`${r.name} is in your fridge.`); } }
}
function scheduleCommit() { clearTimeout(commitTimer); commitTimer = setTimeout(runCommit, 350); }
function commitOnClose() {
  const s = ui.sheet; if (!s) return true;
  clearTimeout(commitTimer);
  let r = null, msg = '';
  if (s.t === 'edit') { r = commitModule(); if (r.ok && r.created) msg = 'Module added.'; }
  else if (s.t === 'thoughts') flushNotes();
  else if (s.t === 'logfood') { r = commitLog(); if (r.ok && r.created) msg = 'Added to your journal.'; }
  else if (s.t === 'addItem') { r = commitItem(); if (r.ok && s.ready && s.mid) mergeOneoff(s.mid); if (r.ok && r.created) msg = `${r.name} added to your fridge.`; }
  else if (s.t === 'toss' && s.kind === 'ing') { const q = $('#setq'); if (q && q.value !== '') applyQty(); }
  if (r && r.error) {
    if (!s.warned) { s.warned = true; toast(`${r.error} Tap outside again to discard.`); return false; }
    return true;
  }
  if (msg) setTimeout(() => toast('✓ ' + msg), 0);
  return true;
}
function applyQty() {
  const s = ui.sheet; if (!s || s.t !== 'toss') return;
  const raw = parseFloat($('#setq').value); if (!(raw >= 0)) return;
  const v = toBase(raw, $('#setu').value), key = s.key;
  mutate('✓ Quantity updated.', () => { const cur = stock(key); if (v < cur) consume(key, cur - v); else if (v > cur) { const it = S.fridge.find(i => i.key === key); addFridge(it.name, it.unit, v - cur); } });
}

const A = {
  tab: d => { ui.fresh = null; ui.tab = d.t; ui.sheet = null; ui.eatDate = null; ui.date = todayIso(); render(); },
  toastExtra: () => { const t = $('#toast'), f = t._extra; t.className = ''; if (f) f(); },
  undo: () => { const t = $('#toast'); if (t._undo) t._undo(); t.className = ''; },
  planTab: d => { ui.fresh = null; ui.planTab = d.t; if (d.t !== 'week') ui.picking = false; render(); },
  settings: () => { ui.sheet = { t: 'settings' }; renderSheet(); },
  closeSheet: () => { if (!commitOnClose()) return; const was = ui.sheet; ui.sheet = null; ui.iconOpen = false; if (was && was.t === 'edit') ui.draft = null; render(); const f = was && was.t === 'addItem' && document.querySelector('.tile.fresh'); if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); },
  // week
  startWeek: () => { if (S.week && S.week.picks.length) { ui.sheet = { t: 'confirmWeek' }; renderSheet(); } else A.newWeek(); },
  newWeek: () => { if (S.week && S.week.picks.length) S.history.push({ ...S.week, archived: todayIso() }); S.week = { id: uid(), start: todayIso(), locked: false, picks: [], tally: {} }; ui.picking = true; ui.step = 0; ui.planTab = 'week'; ui.sheet = null; save(); render(); },
  goCat: d => { ui.picking = true; ui.step = Math.max(0, orderedCats().findIndex(c => c.id === d.c)); render(); $('#view').scrollTop = 0; },
  editWeek: () => { ui.picking = true; ui.step = 0; render(); },
  closePicker: () => { ui.picking = false; render(); },
  goStep: d => { ui.step = +d.s; render(); $('#view').scrollTop = 0; },
  nextStep: () => { ui.step = Math.min(orderedCats().length, ui.step + 1); render(); $('#view').scrollTop = 0; },
  prevStep: () => { ui.step = Math.max(0, ui.step - 1); render(); $('#view').scrollTop = 0; },
  pick: d => {
    if (!S.week) return;
    const i = S.week.picks.indexOf(d.m); const m = mod(d.m);
    if (i >= 0) { S.week.picks.splice(i, 1); const T0 = todayIso(); for (const k of Object.keys(S.plan)) if (k >= T0) S.plan[k] = S.plan[k].filter(e => e.mid !== d.m || e.eaten > 0); }
    else S.week.picks.push(d.m);
    save();
    if (d.close) ui.sheet = null;
    render();
    if (i < 0) { const miss = m.ing.filter(g => stock(ikey(g.n, g.u)) < toBase(g.a, g.u) * needFrac(m) - 0.001).length; toast(miss ? `${m.name} added. ${miss} item${miss > 1 ? 's' : ''} to buy.` : `${m.name} added. You have it all.`); }
  },
  lockWeek: () => { S.week.locked = true; ui.picking = false; ui.step = 0; save(); render(); toast('Week locked in.'); },
  info: d => { ui.sheet = { t: 'info', mid: d.m }; renderSheet(); },
  // module editor
  editMod: d => {
    if (d.m.startsWith('new:')) { const c = d.m.slice(4); ui.draft = { isNew: true, id: 'm' + uid(), cat: c, bf: false, icon: cat(c).icon, name: '', makes: 4, wk: 4, per: 4, cook: false, raw: 7, cooked: 4, ing: [{ n: '', a: 1, u: 'ea' }], storage: '', method: '' }; }
    else { ui.draft = clone(mod(d.m)); }
    ui.iconOpen = false; ui.sheet = { t: 'edit' }; renderSheet();
  },
  toggleIcons: () => { ui.iconOpen = !ui.iconOpen; renderSheet(); },
  setIcon: d => { ui.draft.icon = d.k; ui.iconOpen = false; renderSheet(); scheduleCommit(); },
  addIng: () => { ui.draft.ing.push({ n: '', a: 1, u: 'ea' }); renderSheet(); scheduleCommit(); },
  rmIng: d => { ui.draft.ing.splice(+d.i, 1); if (!ui.draft.ing.length) ui.draft.ing.push({ n: '', a: 1, u: 'ea' }); renderSheet(); scheduleCommit(); },
  delMod: () => {
    clearTimeout(commitTimer);
    const id = ui.draft.id;
    if (!confirm(`Delete "${ui.draft.name}" from your library?`)) return;
    S.modules = S.modules.filter(m => m.id !== id);
    if (S.week) S.week.picks = S.week.picks.filter(x => x !== id);
    delete S.cooked[id];
    Object.values(S.plan).forEach((l, i, arr) => { });
    for (const k of Object.keys(S.plan)) S.plan[k] = S.plan[k].filter(e => e.mid !== id);
    ui.sheet = null; ui.draft = null; save(); render();
  },
  // cart + fridge
  cartAdd: d => { const l = cartLines().find(x => x.key === d.k); if (!l) return; mutate('Added to fridge.', () => addFridge(l.name, l.unit, l.buy), { label: 'Edit date', go: () => A.openFood({ k: l.key, m: '' }) }); },
  cartAddAll: () => { const ls = cartLines(); mutate(`${ls.length} items added to fridge.`, () => ls.forEach(l => addFridge(l.name, l.unit, l.buy))); },
  addKind: d => {
    const s = ui.sheet; dropCreated(s); s.ready = d.k === 'ready';
    document.querySelectorAll('#ai-kind button').forEach(b => b.classList.toggle('on', b.dataset.k === d.k));
    $('#ai-ufld').hidden = s.ready; document.querySelector('.two').classList.toggle('one', s.ready);
    $('#ai-ql').textContent = s.ready ? 'Servings' : 'Quantity'; $('#ai-n').placeholder = s.ready ? 'e.g. Kati rolls' : 'e.g. Parsley';
    guessAddLife(); runCommit(); renderMain();
  },
  addItem: () => { ui.sheet = { t: 'addItem' }; renderSheet(); },
  openFood: d => { const hasC = d.m && cookedTotal(d.m) > 0; ui.sheet = { t: 'toss', kind: hasC ? 'cooked' : 'ing', key: d.k || null, mid: d.m || null }; ui.tossAmt = 1; renderSheet(); },
  foodTab: d => { ui.sheet.kind = d.kind; ui.sheet.iconOpen = false; ui.tossAmt = 1; renderSheet(); },
  tossIng: d => { ui.sheet = { t: 'toss', kind: 'ing', key: d.k }; ui.tossAmt = 1; renderSheet(); },
  tossCooked: d => { ui.sheet = { t: 'toss', kind: 'cooked', mid: d.m }; ui.tossAmt = 1; renderSheet(); },
  tossInc: d => { const s = ui.sheet; ui.tossAmt = Math.min(s.max, Math.max(s.step, ui.tossAmt + (+d.d) * s.step)); renderSheet(); },
  batchInc: d => {   // the count on each card; going to zero removes the card (nothing logged as waste)
    const s = ui.sheet, b = S.fridge.find(x => x.id === d.id); if (!b) return;
    const step = stepFor(b.unit, b.qty) * (+d.d);
    if (b.qty + step <= 1e-6) { mutate('Removed. Nothing logged as waste.', () => { S.fridge = S.fridge.filter(x => x.id !== d.id); if (!S.fridge.some(i => i.key === s.key)) ui.sheet = null; }); return; }
    b.qty += step; save(); render(); savedFlash();
  },
  addBatch: () => {   // a new purchase = a new card, dated today
    const s = ui.sheet, it = S.fridge.find(i => i.key === s.key); if (!it) return;
    const sz = S.units && S.units[s.key] && S.units[s.key].size, nb = addFridge(it.name, it.unit, sz > 0 ? sz : stepFor(it.unit, 0), todayIso());
    s.freshId = nb.id; save(); render(); savedFlash();
    const el = document.querySelector('.batch.fresh'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  useUp: () => { const s = ui.sheet, amt = ui.tossAmt; ui.sheet = null; mutate('Removed. Nothing logged as waste.', () => { if (s.kind === 'cooked') consumeCooked(s.mid, amt); else consume(s.key, amt); }); },
  tossAll: () => { ui.tossAmt = ui.sheet.max; renderSheet(); },
  doToss: () => {
    const s = ui.sheet; const amt = ui.tossAmt; ui.sheet = null;
    mutate('Thrown out and logged.', () => {
      if (s.kind === 'cooked') {
        const m = mod(s.mid), first = cookedBatches(m.id).slice().sort((x, y) => (dayNum(x.date) + (x.life ?? m.cooked)) - (dayNum(y.date) + (y.life ?? m.cooked)))[0];
        const reason = first && expiredFlag(dayNum(first.date) + (first.life ?? m.cooked)) ? 'expired' : 'tossed';
        consumeCooked(m.id, amt); logToss({ name: m.name, icon: m.icon, mid: m.id, servings: amt, qty: plural(amt, 'serving'), reason });
      } else {
        const items = S.fridge.filter(i => i.key === s.key).sort((x, y) => (dayNum(x.start) + x.life) - (dayNum(y.start) + y.life)), it = items[0];
        const reason = expiredFlag(dayNum(it.start) + it.life) ? 'expired' : 'tossed';
        consume(s.key, amt); logToss({ name: it.name, icon: ingIcon(it.name), servings: amt, qty: fmtBase(amt, it.unit), reason });
      }
    });
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
  entryRm: d => { mutate('Removed from the day.', () => { S.plan[ui.date] = entriesOn(ui.date).filter(e => e.id !== d.e); }); },
  cook: d => {
    const m = mod(d.m); if (!m || (isPicked(m.id) && remaining(m) <= 0.01)) return;
    const n = m.makes;   // Cooked adds the whole recipe
    mutate('Cooked.', () => { const short = doCook(d.m, n); return short.length ? `Cooked ${n} ${m.name}. Short on ${short.slice(0, 2).join(', ')}.` : `Cooked ${n} serving${n > 1 ? 's' : ''} of ${m.name}.`; }, { label: 'Edit date', go: () => A.openFood({ m: d.m, k: '' }) });
  },
  eat: d => { const m = mod(d.m); mutate('Eaten.', () => { doEat(d.m, ui.date, null, d.e); return `Ate 1 ${m.name}.`; }); },
  // diary
  rate: d => { const e = S.diary.find(x => x.id === d.i), f = d.f || 'rating'; e[f] = e[f] === +d.r ? 0 : +d.r; save(); render(); },
  thoughts: d => { ui.sheet = { t: 'thoughts', id: d.i }; renderSheet(); setTimeout(() => { const n = $('#notes'); if (n) n.focus(); }, 60); },
  delSwipe: d => { mutate('Entry deleted.', () => { S.diary = S.diary.filter(x => x.id !== d.i); }); },
  delEntry: d => { if (!confirm('Delete this diary entry?')) return; S.diary = S.diary.filter(x => x.id !== d.i); ui.sheet = null; save(); render(); },
  // cooked / eaten tally
  tally: d => { ui.sheet = { t: 'tally', mid: d.m }; renderSheet(); },
  tallyToss: d => { ui.sheet = { t: 'toss', kind: 'cooked', mid: d.m }; ui.tossAmt = 1; renderSheet(); },
  tallyCook: d => { const mid = ui.sheet.mid; if (+d.d > 0) mutate('Added a cooked serving.', () => { const short = doCook(mid, 1); if (short.length) return `Added one. Short on ${short.slice(0, 2).join(', ')}.`; }); else mutate('Removed a cooked serving.', () => undoCook(mid)); },
  tallyEat: d => { const mid = ui.sheet.mid; if (+d.d > 0) mutate('Logged one eaten.', () => doEat(mid, ui.date, null, null)); else mutate('Removed one eaten.', () => undoEat(mid)); },
  // shopping cart: tap a card to change its unit size or price
  cartEdit: d => { ui.sheet = { t: 'unit', key: d.k }; renderSheet(); },
  // fridge upkeep
  tossExpired: () => { const s = ui.sheet, T = dayNum(todayIso()); ui.sheet = null; mutate('Expired food thrown out and logged.', () => {
    if (s.kind === 'cooked') { const m = mod(s.mid); cookedBatches(s.mid).filter(b => dayNum(b.date) + (b.life ?? m.cooked) < T).forEach(b => tossCookedBatch(s.mid, b.id, 'expired')); }
    else S.fridge.filter(f => f.key === s.key && dayNum(f.start) + f.life < T).forEach(f => tossRawBatch(f.id, 'expired'));
  }); },
  imOut: () => { const s = ui.sheet; ui.sheet = null; mutate('Removed from the fridge. Nothing logged as waste.', () => { if (s.kind === 'cooked') S.cooked[s.mid] = []; else S.fridge = S.fridge.filter(f => f.key !== s.key); }); },
  fridgeCheck: () => { ui.sheet = { t: 'fcheck' }; renderSheet(); },
  outMid: d => { mutate('Removed from the fridge.', () => { S.cooked[d.m] = []; }); },
  outKey: d => { mutate('Removed from the fridge.', () => { S.fridge = S.fridge.filter(f => f.key !== d.k); }); },
  // why is this side flagged?
  why: d => { ui.sheet = { t: 'why', mid: d.m }; renderSheet(); },
  whyToss: d => { const mid = ui.sheet.mid; mutate('Thrown out and logged.', () => { if (d.w === 'cooked') tossCookedBatch(d.m, d.b, 'expired'); else tossRawBatch(d.b, 'expired'); }); whyDone(mid); },
  whyDate: d => { A.openFood({ m: d.m || '', k: d.k || '' }); },
  whyBought: d => { const l = cartLines().find(x => x.key === d.k); if (!l) return; const mid = ui.sheet.mid; mutate('Added to fridge.', () => addFridge(l.name, l.unit, l.buy), { label: 'Edit date', go: () => A.openFood({ k: l.key, m: '' }) }); whyDone(mid); },
  whyRemove: d => {
    const T = todayIso(), m = mod(d.m);
    mutate(`${m.name} removed from this week.`, () => {
      S.week.picks = S.week.picks.filter(x => x !== d.m);
      for (const k of Object.keys(S.plan)) if (k >= T) S.plan[k] = S.plan[k].filter(e => e.mid !== d.m || e.eaten > 0);
      ui.sheet = null;
    });
  },
  openCart: () => { ui.sheet = null; ui.tab = 'plan'; ui.planTab = 'cart'; ui.picking = false; render(); },
  // fridge item: icon
  addIcons: () => { const l = $('#ai-icons'); l.hidden = !l.hidden; },
  setAddIcon: d => { ui.sheet.icon = d.k; $('#ai-ic').innerHTML = ico(d.k, 'ico headico'); $('#ai-icons').hidden = true; scheduleCommit(); },
  ingIcons: () => { ui.sheet.iconOpen = !ui.sheet.iconOpen; renderSheet(); },
  setIngIcon: d => { const it = S.fridge.find(i => i.key === ui.sheet.key); if (it) S.ingIcons[normName(it.name)] = d.k; ui.sheet.iconOpen = false; save(); renderMain(); renderSheet(); savedFlash(); },
  // Eat page: fold or open a section
  toggleGroup: d => { ui.grp = ui.grp || {}; const cur = d.k in ui.grp ? ui.grp[d.k] : document.querySelector(`[data-a="toggleGroup"][data-k="${d.k}"]`).getAttribute('aria-expanded') === 'true'; ui.grp[d.k] = !cur; renderMain(); },
  toggleSoon: () => { ui.soonOpen = !ui.soonOpen; renderMain(); },
  star: d => {
    const T = todayIso(); if (ui.date < T) return;
    const ids = starIds(), has = ids.includes(d.m);
    if (!has && ids.length >= MAX_STARS) { toast('Up to 3 a day. Unstar one first.'); return; }
    const sd = {}; for (const [k, v] of Object.entries(S.settings.starDays || {})) if (k >= T) sd[k] = v;   // old days drop off
    sd[ui.date] = has ? ids.filter(x => x !== d.m) : [...ids, d.m]; S.settings.starDays = sd;
    save(); renderMain();
  },
  eatDay: d => { ui.eatDate = +d.d === 0 ? null : addDays(ui.date, +d.d); renderMain(); },
  toggleEat: d => { S.settings.eatOpen = { ...(S.settings.eatOpen || {}), [d.k]: !eatOpen(d.k) }; save(); renderMain(); },
  // settings: planning order and targets
  toggleFold: d => { const o = ui.sheet.open = ui.sheet.open || {}; o[d.k] = !(d.k in o ? o[d.k] : d.d === '1'); renderSheet(); },
  toggleAcc: d => { const o = ui.sheet.open = ui.sheet.open || {}; o[d.k] = !o[d.k]; renderSheet(); },
  catMove: d => { const ord = orderedCats().map(c => c.id), i = ord.indexOf(d.c), j = i + (+d.d); if (j < 0 || j >= ord.length) return; [ord[i], ord[j]] = [ord[j], ord[i]]; S.settings.catOrder = ord; save(); renderMain(); renderSheet(); savedFlash(); },
  catTarget: d => { const t = Math.max(0, Math.min(12, targetFor(d.c) + (+d.d))); S.settings.targets = { ...(S.settings.targets || {}), [d.c]: t }; save(); renderMain(); renderSheet(); savedFlash(); },
  // manual log
  logFood: () => { const n = new Date(); ui.log = { name: '', icon: 'takeout', slot: slotGuess({ cat: 'meal' }), date: todayIso(), time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, servings: 1, notes: '', iconOpen: false }; ui.sheet = { t: 'logfood' }; renderSheet(); },
  logDay: d => { captureLog(); ui.log.date = addDays(todayIso(), +d.d); renderSheet(); scheduleCommit(); },
  logSide: d => {   // a side from this week: same as tapping Eaten, but on the chosen day
    captureLog(); const L = ui.log, m = mod(d.m); L.sidesOpen = false; if (!m) return; if (L.entryId) startNewLog();
    const snap = JSON.stringify(S);
    doEat(d.m, L.date, L.slot);
    const e = S.diary.filter(x => x.type === 'eat' && x.mid === d.m).sort((x, y) => y.ts - x.ts)[0];
    const t = new Date(e.ts); L.entryId = e.id; L.name = m.name; L.icon = m.icon; L.servings = e.servings; L.notes = e.notes || '';
    L.time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    save(); render(); toast('Added to your journal.', () => { S = Object.assign(fresh(), JSON.parse(snap)); ui.log.entryId = null; ui.log.name = ''; save(); render(); });
  },
  logIng: d => {   // an ingredient from the fridge: logs one, and takes one from the fridge when it is counted in 'each'
    captureLog(); const L = ui.log; L.sidesOpen = false; const f = S.fridge.find(i => i.key === d.k); if (!f) return; if (L.entryId) startNewLog();
    const snap = JSON.stringify(S), each = f.unit === 'ea', date = L.date, slot = L.slot;
    if (each) consume(d.k, 1);
    const last = S.diary.find(x => x.type === 'eat' && x.ingKey === d.k && x.slot === slot && iso(new Date(x.ts)) === date);
    let e; if (last) { last.servings++; e = last; } else { e = { id: uid(), ts: tsFor(date), type: 'eat', ingKey: d.k, name: f.name, icon: ingIcon(f.name), servings: 1, slot, rating: 0, notes: '', src: [{ k: 'i' }] }; S.diary.push(e); }
    const t = new Date(e.ts); L.entryId = e.id; L.name = e.name; L.icon = e.icon; L.servings = e.servings; L.notes = e.notes || '';
    L.time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    save(); render(); toast(each ? 'Added to your journal.' : 'Added to your journal. Update the amount in your fridge.', () => { S = Object.assign(fresh(), JSON.parse(snap)); ui.log.entryId = null; ui.log.name = ''; save(); render(); });
  },
  logIcons: () => { captureLog(); ui.log.iconOpen = !ui.log.iconOpen; ui.log.sidesOpen = false; renderSheet(); },
  logSides: () => { captureLog(); ui.log.sidesOpen = !ui.log.sidesOpen; ui.log.iconOpen = false; renderSheet(); },
  setLogIcon: d => { captureLog(); ui.log.icon = d.k; ui.log.iconOpen = false; renderSheet(); scheduleCommit(); },
  // settings
  exportData: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); a.download = `meal-loop-backup-${todayIso()}.json`; a.click(); },
  resetModules: () => { if (!confirm('Replace your module library with the starter set? Picks and logs stay, but your edits to modules are lost.')) return; const keep = S.modules.filter(m => m.oneoff), kc = {}; keep.forEach(m => { kc[m.id] = S.cooked[m.id] || []; }); S.modules = parseModules().concat(keep); if (S.week) S.week.picks = []; S.cooked = kc; S.plan = {}; ui.sheet = null; save(); render(); toast('Library reset.'); },
};
function startNewLog() {   // picking another food: save the one on screen, then start a fresh entry (same day and meal)
  const L = ui.log; clearTimeout(commitTimer); runCommit();
  Object.assign(L, { entryId: null, name: '', icon: 'takeout', servings: 1, notes: '' });
}
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

// ----- swipe a planned serving left to remove it (works with touch and mouse) -----
(() => {
  const OPEN = 88; let drag = null, moved = false, openRow = null;
  const setX = (row, x, anim) => { row.style.transition = anim ? 'transform .2s ease' : 'none'; row.style.transform = x ? `translateX(${x}px)` : ''; };
  const closeOpen = except => { if (openRow && !document.contains(openRow)) openRow = null; if (openRow && openRow !== except) { setX(openRow, 0, true); openRow.classList.remove('swopen'); openRow = null; } };
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.swdel')) return;
    const row = e.target.closest('.slotrow, .swcard');
    if (!row) { closeOpen(); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    closeOpen(row);
    const wasOpen = row.classList.contains('swopen');
    drag = { row, x0: e.clientX, y0: e.clientY, base: wasOpen ? -OPEN : 0, pid: e.pointerId, active: false, wasOpen };
    moved = false;
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }   // that is a scroll, not a swipe
      if (Math.abs(dx) < 8) return;
      drag.active = true; moved = true;
      try { drag.row.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    setX(drag.row, Math.max(drag.row.classList.contains('swcard') ? -drag.row.offsetWidth : -OPEN - 24, Math.min(0, drag.base + dx)), false);
  });
  const end = e => {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.pid)) return;
    const row = drag.row;
    if (drag.active && row.classList.contains('swcard')) {   // diary entry: a long swipe left deletes it, a short one springs back
      const cur = new DOMMatrix(getComputedStyle(row).transform).m41;
      if (cur <= -Math.min(150, row.offsetWidth * 0.4)) { setX(row, -row.offsetWidth - 24, true); setTimeout(() => A.delSwipe({ i: row.dataset.e }), 180); }
      else setX(row, 0, true);
      drag = null; return;
    }
    if (drag.active) {
      const cur = new DOMMatrix(getComputedStyle(row).transform).m41;
      if (cur < -OPEN / 2) {
        setX(row, -OPEN, true); row.classList.add('swopen'); openRow = row;
        if (!S.settings.swipeSeen) { S.settings.swipeSeen = true; save(); document.querySelectorAll('.swipehint').forEach(h => h.remove()); }
      } else { setX(row, 0, true); row.classList.remove('swopen'); if (openRow === row) openRow = null; }
    } else if (drag.wasOpen) { setX(row, 0, true); row.classList.remove('swopen'); openRow = null; moved = true; }   // a tap on an open row just closes it
    drag = null;
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  document.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);   // a swipe must not also tap a button
  document.addEventListener('keydown', e => { const row = e.target.closest && e.target.closest('.slotrow'); if (row && e.target === row && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); A.entryRm({ e: row.dataset.e }); } });
})();

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const act = A[el.dataset.a]; if (!act) return;
  if (el.classList.contains('card') && e.target.closest('.cinfo')) return;
  e.stopPropagation();
  act(el.dataset);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) A.closeSheet(); });

function remapModule(from, to) {
  const swap = arr => { const out = []; arr.forEach(x => { const y = x === from ? to : x; if (!out.includes(y)) out.push(y); }); return out; };
  [S.week, ...S.history].forEach(w => {
    if (!w) return;
    w.picks = swap(w.picks);
    if (w.tally && w.tally[from]) { const t = w.tally[to] = w.tally[to] || { cooked: 0, raw: 0 }; t.cooked += w.tally[from].cooked || 0; t.raw += w.tally[from].raw || 0; delete w.tally[from]; }
  });
  if (S.cooked[from]) { S.cooked[to] = (S.cooked[to] || []).concat(S.cooked[from]); delete S.cooked[from]; }
  Object.values(S.plan).forEach(list => list.forEach(e => { if (e.mid === from) e.mid = to; }));
  S.diary.forEach(d => { if (d.mid === from) d.mid = to; });
}
function migrate() {
  let v = S.v || 1;
  if (v < 2) {
    S.modules.forEach(m => m.ing.forEach(i => { i.u = normU(i.u); }));
    const old = S.fridge; S.fridge = [];
    old.forEach(f => { const bu = baseUnit(f.unit), nm = canon(f.name); S.fridge.push({ ...f, name: nm, unit: bu, qty: toBase(f.qty, f.unit), key: ikey(nm, bu) }); });
    const np = {}; Object.entries(S.prices || {}).forEach(([k, val]) => { const [n, u] = k.split('|'); np[ikey(n, u)] = val; }); S.prices = np;
    v = 3; // that pass already treats pints as volume
  }
  if (v < 3) {
    const old = S.fridge; S.fridge = [];
    old.forEach(f => { if (f.unit === 'pint') S.fridge.push({ ...f, unit: 'tsp', qty: f.qty * 96, key: ikey(f.name, 'tsp') }); else S.fridge.push(f); });
    const np = {}; Object.entries(S.prices || {}).forEach(([k, val]) => { const [n, u] = k.split('|'); np[ikey(n, u)] = val; }); S.prices = np;
    v = 3;
  }
  if (v < 4) {
    // Breakfasts are now part of Easy meals (flagged so Auto-plan still uses them for breakfast)
    S.modules.forEach(m => { if (m.cat === 'bfast') { m.cat = 'meal'; m.bf = true; } });
    for (const m of S.modules.slice()) {
      if (!m.bf || m.cat !== 'meal') continue;
      const twin = S.modules.find(x => x !== m && !x.bf && x.cat === 'meal' && normName(x.name) === normName(m.name));
      if (twin) { remapModule(m.id, twin.id); S.modules = S.modules.filter(x => x !== m); }
    }
    if (S.settings) { if (S.settings.catOrder) S.settings.catOrder = S.settings.catOrder.filter(id => id !== 'bfast'); if (S.settings.targets) delete S.settings.targets.bfast; }
    v = 4;
  }
  if (v < 5) {
    // cans, slices, cloves and bags are all just "each" now; package size and price live in S.units
    S.modules.forEach(m => m.ing.forEach(i => { const u = normU(i.u); i.u = (UNITS[u] || u === 'ea') ? u : 'ea'; }));
    S.fridge = S.fridge.map(f => (f.unit === 'tsp' || f.unit === 'oz' || f.unit === 'ea') ? f : { ...f, unit: 'ea', key: ikey(f.name, 'ea') });
    S.units = S.units || {};
    Object.entries(S.prices || {}).forEach(([k, val]) => { const [n, u] = k.split('|'), nk = ikey(n, u); S.units[nk] = { ...(S.units[nk] || {}), price: val }; });
    Object.entries(S.packs || {}).forEach(([k, p]) => { const [n, u] = k.split('|'), nk = ikey(n, u); S.units[nk] = { ...(S.units[nk] || {}), size: p[1] }; });
    S.prices = {}; S.packs = {};
    v = 5;
  }
  if (v < 6) {
    // servings per week: starts out equal to what the recipe makes, so nothing changes until you edit it
    S.modules.forEach(m => { if (!(m.wk > 0)) m.wk = m.makes; });
    v = 6;
  }
  if (v < 7) {
    // fridge items get icons and notes; cooked batches get ids so each one can carry its own dates
    S.ingIcons = S.ingIcons || {}; S.ingNotes = S.ingNotes || {};
    Object.values(S.cooked).forEach(bs => bs.forEach(b => { if (!b.id) b.id = uid(); }));
    v = 7;
  }
  if (v < 8) {
    // warning thresholds are gone: yellow and red now follow fixed rules
    delete S.settings.yellow; delete S.settings.red; delete S.settings.rawWindow;
    v = 8;
  }
  if (v < 9) {
    for (const [d, list] of Object.entries(S.plan)) {
      const out = [];
      list.forEach(e => { const n = Math.max(1, Math.round(e.n || 1)); for (let i = 0; i < n; i++) out.push({ id: i ? uid() : e.id, slot: e.slot, mid: e.mid, n: 1, eaten: i < (e.eaten || 0) ? 1 : 0 }); });
      S.plan[d] = out;
    }
    v = 9;
  }
  if (v !== (S.v || 1)) { S.v = v; save(); }
}
migrate();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });

// no pinch or double-tap zoom: the layout is built for the phone's width
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
