# Meal Loop: handoff for a new chat

State as of **app version 2.7** (service worker cache `meal-loop-v43`, data schema `v9`).
Source: this folder, deployed as a static PWA on GitHub Pages. Read this top to bottom once, then use the checklists.

---

## 0. Paste this to start the new chat

> I'm continuing work on **Meal Loop**, a meal-planning PWA (vanilla JS, no build step, deployed on GitHub Pages, used on my iPhone). I've attached `meal-loop.zip`. Please read `docs/HANDOFF.md` inside it first: it has the architecture, the data model, the rules we agreed on, my preferences and what's still open. Don't change anything until you've read it and told me, in two or three sentences, what you understand the app to be. I usually send cropped iPhone screenshots to point out visual problems. I want short answers, plain words, and I don't want complicated edge-case logic.

Then upload `meal-loop.zip`. The single-file demo that renders inside chat is rebuilt with `docs/tools/build_artifact.py` (see section 9).

---

## 1. What the product is

A phone-first app for planning, buying, cooking and eating a week of food with as little effort as possible.

The central idea is **three layers that must not be mixed up**:

| Layer | Language | Where it lives |
|---|---|---|
| **Sides** (what you plan, cook, eat, get warned about) | "Carrots", "Hot honey chicken" | Plan picker, **Eat** page |
| **Ingredients** (what you buy and store) | "eggs", "honey" | **Shopping** cart, **Fridge** ledger |
| **Physical things with dates** | ingredient stock and cooked servings | Fridge (and they drive the colors on Eat) |

- Only ingredient stock and cooked servings have dates. Sides read their status from them.
- **Eat shows sides only** (never ingredient names on the rows) and **only the sides picked in Plan for this week**.
- The user thinks in "sides": "I don't want to eat a raw egg, I want an omelet."
- The user's own words for the whole thing: remove decision fatigue, automate the day, stay flexible.

Tabs (bottom bar, three equal slots): **Plan** | **Eat** (green pill) | **Diary**. Settings is the "…" button in each page header.

---

## 2. Project layout

```
index.html            shell: #view, #tabs, #sheet, #toast; loads data.js then app.js
app.js   (~1330 lines) everything: state, rules, rendering, actions, listeners, migrations
data.js  (~190 lines)  CATS, SLOTS, 97 starter modules (RAW text table), PACKS, LIFE, ICON_HINTS, DEFAULT_TARGETS
styles.css (~620)     all styling, light + dark (prefers-color-scheme), later rules override earlier ones
sw.js                 cache-first service worker; precaches every asset
manifest.webmanifest, icons/, assets/ (98 food icons, 3 header images, fridge.png), .nojekyll
README.md             deploy + feature notes
docs/                 this file, tests/, tools/
```

No framework. Rendering is string templates written to `#view` / `#sheet`; one delegated `click` listener dispatches `data-a="actionName"` to the `A` object.

### Run / deploy
- Local: `python3 -m http.server 8000` in the folder.
- Deploy: push the folder to a GitHub repo → Settings → Pages → deploy from `main` `/ (root)`. Install on iPhone via Safari → Share → Add to Home Screen.

### Release checklist (do this on every change)
1. Bump `APP_VERSION` at the top of `app.js` **and** `VERSION` in `sw.js` (an installed copy only updates when the SW cache name changes).
2. `node --check app.js && node --check data.js`.
3. Run the tests (section 9).
4. Rebuild the demo: `python3 docs/tools/build_artifact.py` (writes `/mnt/user-data/outputs/meal-loop.html`).
5. Zip the folder (`meal-loop.zip`) and present both files.
6. The version shows at the bottom of Settings, so the user can confirm what their phone is running.

---

## 3. Architecture map of `app.js`

Section comments (`// ----- ... -----`) in order:

- **helpers**: `$`, `esc`, dates (`iso`, `dayNum`, `addDays`, `mondayOf`), `fmtN`, `plural`.
- **state**: `S` (loaded from `localStorage['mealloop.v1']`), `save()`, `ui` (non-persistent UI state), `mod()`, `cat()`, `orderedCats()`, `targetFor()`.
- **units**: `UNITS`, `normU`, `toBase`, `baseUnit`, `ikey(name, unit)`, `fmtBase`, `nice`, `fracStr`, `parseAmt`, `chooseUnit`, `unitInfo`, `setUnit`, `unitConflict`, `unitOpts`, `canon`, `knownNames`, `ingIcon`, `storageFor`, `lifeFor`.
- **fridge**: `stock`, `addFridge`, `consume` (soonest-expiring first), `cookedBatches`, `cookedTotal`, `consumeCooked` (soonest-expiring first), `rawLeft`, `remaining`, `weekServings`.
- **shopping cart**: `cartLines()`, `cartMap()`.
- **plan / entries**: `entriesOn`, `addEntry`, `plannedRemainingAll`, `activeMods()` (= this week's picks), `isPicked`.
- **side status**: `sideStatus`, `paceOf`, `rawGood`, `urgency` (alias), `dayWord`, `SOON_DAYS`, `rank`.
- **actions on food**: `doCook`, `doEat`, `undoCook`, `undoEat`, `eatenCount`, `slotGuess`, `tsFor`, `mutate` (snapshot + undo toast).
- **throwing food out**: `logToss`, `tossCookedBatch`, `tossRawBatch`, `whyDone`.
- **auto-plan**: `autoPlan`.
- **views**: `planView`, `weekSummary`, `pickerView`, `cartView`, `fridgeLedger`, `fridgeView`, `eatView` (+ `btnsFor`, `tallyLine`, `dayStrip`), `diaryView`.
- **sheets**: `sheetHtml()` is one big `if (s.t === '…')` chain. Sheet types: `info` (card back), `edit` (module editor), `confirmWeek`, `assign`, `addTo`, `thoughts`, `toss` (the fridge item sheet), `tally`, `why`, `unit` (cart item), `fcheck`, `logfood`, `addItem`, `settings`.
- **render**: `render()` = `renderMain()` + `renderSheet()`. `renderSheet()` keeps scroll and skips the slide-in animation when re-rendering the *same* sheet object.
- **autosave helpers**: `commitModule`, `commitLog`, `commitItem`, `flushNotes`, `runCommit`, `scheduleCommit`, `commitOnClose`, `savedFlash`, `onBatchInput`, `linkAddDates`, `refreshCart`, `applyQty`.
- **actions**: `const A = { … }` (about 95 handlers).
- **listeners**: `input`, `change`, a swipe-gesture IIFE, the delegated `click`, `keydown` (Esc closes a sheet).
- **migration**: `migrate()` (sequential, `S.v` 1 → 9), then `migrate(); render();`.

---

## 4. Data model (`S`)

```js
S = {
  v: 9,
  modules: [{ id, name, cat, bf, icon, makes, wk, per, cook, raw, cooked, ing:[{n,a,u}], storage, method }],
  week:    { id, start, locked, picks:[moduleId], tally:{ [mid]:{ cooked, raw } } } | null,
  history: [archived weeks],
  fridge:  [{ id, key, name, unit, qty, start, life }],        // ingredient batches; qty in BASE units; expiry = start + life (days)
  cooked:  { [mid]: [{ id, n, date, life? }] },                // cooked servings; expiry = date + (life ?? module.cooked)
  plan:    { 'YYYY-MM-DD': [{ id, slot, mid, n:1, eaten:0|1 }] },   // ONE entry per planned serving
  diary:   [ eat: { id, ts, type:'eat', mid?, name, icon, servings, slot, rating, energy, filling, notes, src:[{k:'c'|'r',date?,life?}], manual? }
           | toss:{ id, ts, type:'toss', name, icon, servings, qty, reason:'expired'|'tossed', mid? } ],
  settings:{ catOrder:[ids], targets:{catId:n}, eatOpen:{soon?,breakfast?,…}, swipeSeen },
  units:   { [key]: { size?, price? } },   // purchase unit per ingredient: size in base units, price per unit
  life:    { [key]: days },                // default shelf life learned from your edits
  ingIcons:{ [normName]: iconKey }, ingNotes:{ [key]: 'storage text' },
  packs:{}, prices:{}                      // legacy, emptied by migration v5
}
```

Module field meanings: `makes` = servings the recipe yields (ingredient amounts are for this); `wk` = servings you eat per week (cart scales by `remaining / makes`); `per` = batch size, how many servings one **Cooked** tap logs (capped at what's left of the weekly goal); `cook` = needs cooking; `raw`/`cooked` = default shelf-life days (edited on the Fridge, not in the module editor); `bf` = counts as breakfast (Auto-plan only).

IDs: modules are `m1…mN` by line order in `RAW` in `data.js`. **Never delete or reorder RAW lines**: a commented-out line (`#merged into…`) keeps ids stable.

Categories: `veg` (shown as "Sides"), `pro`, `fill`, `flav`, `fruit`, `meal` ("Easy meals", includes the old breakfast items), `snack`, `treat`. Slots: breakfast, lunch, dinner, snack, treat. Default pick targets: veg 3, pro 2, fill 2, flav 2, fruit 2, meal 3, snack 3, treat 1.

Migrations (all in `migrate()`): v1 → v2 unit normalization; v3 pint is volume; v4 merge breakfasts into Easy meals; v5 count units collapse to `each`, prices/packs → `S.units`; v6 `wk`; v7 icons/notes/cooked ids; v8 remove old warning thresholds; v9 split plan entries into one per serving.

---

## 5. Rules we agreed on (don't change without asking)

### Units
- Stored in one base unit per type: **tsp** (volume), **oz** (weight), **ea** (count). `pint` = volume (96 tsp). Count words (can, clove, slice, bag) all became **each**. Display converts back (`fmtBase`: "1½ cups", "1⅓ tbsp", fractions via `fracStr`; amounts can be typed as `1/2` or `½`).
- An ingredient can't mix types (honey in tbsp and oz) → blocked with a message.
- No metric (g, ml) yet.
- A **unit** is whatever you buy (jar, can, bag, tub). Every cart line is whole units, rounded up. Size defaults: `PACKS` in `data.js`, else 1 cup / 1 lb / 1 each ("guess" hint until the user sets it). Garlic: user sets 1 unit = 40 each.

### Shopping cart
- `cartLines()`: need = Σ over picked sides of `ingredient × remaining(m) / makes`, minus **all** stock (expired stock still counts until thrown out), then ceil to units.
- Each line is a compact card (icon, "Buy 1 unit of 1½ cups", "Need ¼ cup · for Hot honey", price). **Tap the card** → a sheet with unit size + price (autosave). **To fridge** adds the whole bought quantity with default dates and a toast with Undo and **Edit date**.

### Fridge (strict ledger, nothing merged)
- Two sections: **Leftovers** (cooked servings, named as sides) and **Ingredients**. Tile chips show amount + days left, colored red (expired) or yellow.
- Item sheet: **Bought/Cooked** date, **Expires** date, **Keeps for** days (any one updates the others; type the date printed on a package). Editing "keeps for" on an ingredient becomes its default next time. Storage note, icon (ingredients), **Throw out expired**, **I'm out** (removes without logging waste), throw-out stepper, fix-the-count.
- **Check fridge** sheet: list with **Out** buttons to correct drift. Header notes ingredients outside any recipe that are expiring.
- Freezing is not modelled: change the storage note and raise the shelf life.

### Status colors (the heart of the app)
`sideStatus(m, dateIso, cartMap)`, applied to every **picked** side:
- **Red = something is wrong**: any needed item is past its eat-by date, **or** the side is missing an ingredient (something it needs appears in the shopping cart). No partial states.
- **Yellow = use soon**: you'd have to eat **one serving a day or more** to finish before the eat-by date. Pace = cumulative servings due by each deadline ÷ eating days (today through eat-by day inclusive). **The eat-by day itself is still fine; red starts the day after.**
- Cooked leftovers say "eat by", raw food that needs cooking says "cook by", raw food that doesn't (apples) says "to eat · eat by".
- Expired food doesn't count toward yellow pace but keeps counting everywhere else until thrown out (red is the prompt).
- Independent of slots and the plan. Past days show no flags; a future day previews what will be tight by then.
- Tapping a chip opens the **why sheet** (side language): throw out expired, "I bought it" (adds the missing ingredient to the fridge), edit date, open cart, remove from this week (also drops upcoming plan entries). It closes itself once the side is clear.
- Plain ingredients on the Fridge use days only (`SOON_DAYS = 3`) because they have no servings to pace.
- Eating uses the **soonest-expiring** batch first. No prompt when eating expired food (user fixes the date instead).

### Eat page
- Only this week's picks (`activeMods()`); stale plan entries for unpicked sides are hidden and dropped when a side is unpicked.
- Sections: day strip (Mon–Sun, arrows), **Auto-plan my day**, collapsible **Needs attention** (red + yellow sides, folded by default, shows "1 red · 2 use soon"), five collapsible slots, then **This week's modules** grouped by category.
- Slot rows: one row per planned serving; small **Eaten** / **Cooked** pills stacked on the right; **swipe left → Remove** (pointer events, 88px reveal, Undo toast; also Delete key). The × button is gone. Hint "Swipe a row left to remove it" until the first swipe.
- Side-list and Needs-attention rows still use the wide button row: `[Eaten][Cooked][trash][star]` with fixed columns and empty placeholders so columns line up.
- **Cooked** cooks `min(batch size, servings left in the weekly goal)`; once the goal is covered the button is **greyed out and disabled**. Labels have no counts ("Eaten", "Cooked").
- Each side card line: `2 cooked · 3 to cook · Eaten 0 of 5` (pencil opens the tally sheet to correct counts, all undoable).
- Slots are optional and nothing depends on them. Auto-plan fills only empty slots (breakfast from `bf` Easy meals + fruit, lunch an Easy meal or protein+filling+veg, dinner protein+filling+veg, snack + fruit; never Treat; skips sides with expired food).

### Plan page
- Chips: **Week** | **Fridge** | **Shopping** (counts). Start new week → step-by-step picker (one step per category, in the user's order, "2 of 3 chosen", badge turns green at target) → review → **Lock in week**. Locked summary is a two-column grid of colored cards with food "labels"; **Edit** sits next to the "Locked" pill. Starting a new week archives the old one and warns about leftover cooked servings (they only show on Eat if their side is picked again).
- Card back (tap the "i"): recipe/week/batch facts, ingredients with per-serving amounts and fridge stock, prep notes, "How it's gone" averages.

### Module editor (card)
Name + icon + category; **Servings** (Recipe makes / Eat per week / Batch size, batch size greyed unless Needs cooking); **Ingredients** (name, amount, unit dropdown); **Cooking** switch; collapsible **Notes and planning** (breakfast switch, prep). Shelf life and storage are *not* here; they live on the Fridge.

### Diary
Eat entries with **three ratings** (taste stars, energy bolts, filling bowls) and notes; manual **Log food** (for eating out; no fridge effect); toss entries read "Threw out · expired" with a readable amount. Merging: consecutive eats of the same side/slot/day increment one entry.

### Settings (autosave, collapsible sections)
Planning (reorder categories, pick targets per category, 0 = "Any"); What the colors mean (read-only explainer); Your data (export/import JSON backup, reset module library). Version line at the bottom.

### Autosave everywhere (no Save buttons anywhere)
- Editing sheets show a quiet "✓ Saved" tag and an × close. Module editor, notes, settings, fridge dates, cart price/size save live.
- **Log food** and **Add item** create the record on the first valid input and update that same record after.
- Invalid state (e.g. blank name, unit conflict): red message; first tap-out keeps the sheet open, second discards.
- Destructive things (delete, throw out) stay explicit. Undo toast exists for most actions via `mutate()`.

---

## 6. User preferences and working style

- **Phone-first.** The user tests on an iPhone (installed PWA) and sends cropped screenshots. Keep replies short; lead with the answer; simple words.
- **Simplicity above all.** "Don't overthink", "low tolerance for edge cases", "clean and simple logic". Resist adding special cases. If a rule needs an exception, propose a simpler rule instead.
- **Brainstorm mode vs build mode.** When they say "just talk", "brainstorm only" or "think with me", do **not** code. When they say "go build", build, test, rebuild the demo and zip, and present files.
- They like **icons**, **collapsible sections**, **cards**, direct manipulation, and removing buttons/numbers that feel fussy. They dislike steppers, counts on buttons, Save buttons and anything that needs explaining.
- Terminology they chose: **sides**, **Needs attention**, **unit** (what you buy), **each** (count), **eat by**, "Recipe makes / Eat per week / Batch size".
- Be honest about what could not be verified (see section 8). Don't claim iPhone behavior was tested.

---

## 7. Gotchas when editing

- **Version bump + SW cache** every change (checklist above).
- Editing with Python string replacement: always `assert` the match count. One slice once deleted `cartLines` because `remaining` was a one-liner; after big edits compare the function list:
  `grep -oE '^(async )?function [A-Za-z0-9_]+' app.js | sort`.
- `docs/tools/build_artifact.py` rewrites `app.js` with regexes: it needs `let S = (() => {…})();`, `const save = () => {…};`, the `ico` helper line, the `assets/header${n}.jpg` and `assets/fridge.png` snippets, and the `serviceWorker.register` line to stay matchable. It also seeds demo data (`seedDemo`) and sets `window.confirm = () => true`. If you change those lines, update the script.
- The in-chat demo has **no persistence** (artifacts can't use localStorage).
- `.panel input:not([type=checkbox])` styles every sheet input; wrappers like `.ufld` override it with `.panel .ufld input`. Date inputs: do **not** set `appearance:none` or `display:block` on them, Safari then pins the text to the top (this happened once).
- `renderSheet()` reuses scroll position/no animation only for the same `ui.sheet` object; open a new sheet by assigning a new object.
- Text in `.panel label` is muted by default; buttons built as labels (`label.btn`) need explicit overrides.
- Sandbox clock moves past midnight during long sessions; tests use `todayIso()`/`addDays`, not literal dates.

---

## 8. Not verified / open questions / next ideas

**Never verified on a real device (desktop Chromium only):**
- Date-field centering on iOS Safari (fixed by restoring native styling; if text still sits high, wrap each date in a flex box).
- Feel of the swipe-to-remove under a thumb; behavior at 320 px width; tab bar over the home indicator; service-worker update flow on an installed copy.

**Offered but not done:**
- Make the side-list and Needs-attention rows use the same compact right-hand buttons as slot rows (they also carry trash and star icons, so it needs a small design call).
- Carry leftover cooked sides into the next week automatically (right now they stay on the Fridge and show on Eat only if picked again).

**Possible later:** metric units; a gentle weekly "check your fridge" prompt (today it's a manual button); per-side "I can eat two a day" for the pace rule; sync across devices (none: data is local, export/import JSON is the backup); freezing as a first-class state.

**Assumptions baked in:** at most one serving of a side per day for the yellow rule; proportional scaling (4 servings of a 3-serving recipe buys 4/3 of the ingredients); flags cover picked sides only, not the whole library; raw stock of unpicked sides is ignored on Eat (the Fridge page covers it).

---

## 9. Tests and tooling (in `docs/`)

`docs/tests/*.py` are Playwright (Python) scripts. Each one starts a tiny local server on its own port, drives the real app in headless Chromium at 390×844, and prints what it finds. A run is clean when there is no traceback and the printed values match the scenario in the label. They are project-relative (they find the app two folders up) and write screenshots to `/tmp/mealloop-shots/`.

```bash
pip install playwright && playwright install chromium
python3 docs/tests/test42.py                                                   # run one
for t in docs/tests/test*.py; do python3 $t >/dev/null 2>&1 || echo FAIL $t; done   # run all (28 files, about 3 minutes)
OUT=/tmp/meal-loop.html python3 docs/tools/build_artifact.py                    # rebuild the single-file demo (default output: /mnt/user-data/outputs/meal-loop.html)
```

At 2.7, 18 of 28 pass. These 10 still drive the removed Eat UI (Auto-plan, meal slots, day strip, old rows) and need rewriting or deleting: test, test9, test31, test34, test37, test43, test44, test50, test52, test53. Their logic (status rules, fridge ledger) is unchanged.

The ones worth keeping green (each prints its scenario):

| File | Covers |
|---|---|
| `test.py` | plan → cart → fridge → cook → eat → diary round trip |
| `test2.py`, `test3.py` | honey/units cart case, toss, editor, cart prices, manual diary log |
| `test5.py`, `test7.py` | unit conversion, conflicts, fractions, v1→v3 migrations |
| `test8.py`, `test9.py` | cooked/eaten tally + undo; ratings and card back |
| `test17.py`, `test27.py` | autosave in every form; "no Save/Done buttons" audit |
| `test19.py` | category order/targets/breakfast merge/summary grid/auto-plan |
| `test21.py`, `test23.py`, `test33.py`, `test34.py` | greyed cooking fields, settings accordions, notes dropdown, Eat folding |
| `test30.py`, `test48.py` | whole-unit cart, unit cards, tap-to-edit sheet |
| `test31.py` | servings per week and goal-based cooking |
| `test35.py`, `test52.py`, `test53.py` | button alignment, Eaten-before-Cooked, compact buttons + swipe |
| `test37.py` | Cooked greys out and cannot be tapped at the goal; final cook is capped |
| `test39.py` | fridge icons, linked dates, storage notes |
| `test42.py` | **status rules** (yellow pace, red, eat-by day, batches, previews, slot independence) |
| `test43.py`, `test46.py`, `test47.py` | Eat chips + why sheet flows; "to cook" vs "to eat"; Eat shows picked sides only |
| `test44.py` | strict fridge ledger, throw out expired, I'm out, soonest-first eating, Edit date, v7→v8 |
| `test50.py` | one serving per planned row, migration to per-serving entries |

Only these 28 are bundled (earlier screenshot-only helper scripts were dropped). `docs/tools/audit.py` lists every button label per sheet (used to prove there is no Save/Done button). `docs/tools/crop.py` shows how the 98 food icons were cropped, with transparent backgrounds, from the user's original icon sheet (that sheet is not included).

---

## 10. Where the project stands

In short, the path so far: three-page flow and tabs → dark mode and polish → units system (base units, packs, fractions) → cart unit cards → servings per week → fridge ledger with linked dates → **status redesign (v2.0)** → Eat shows only picked sides (2.1) → compact cart cards (2.2) → per-serving planning (2.3) → Cooked greys out at goal, no counts (2.4–2.5) → compact slot buttons + swipe to remove (2.6).

The last thing delivered: slot rows with small right-hand Eaten/Cooked buttons and swipe-to-remove. The user had not yet reacted to it. The likely next conversation is feedback from their phone (swipe feel, date fields) and possibly extending the compact buttons to the other lists.


---

## 11. Version 2.7: simplify, one page at a time

The user found the whole app too complicated. Agreed design rules for **every** screen: icons over sentences; autosave only; controls side by side; little scrolling; every option (dates, quantities, prices) hidden one tap deeper. Logic stays, only what is visible changes.

**Done in 2.7: Eat page only.** Today only (no day strip). One quiet "Use soon" line at the top (worst side + "+N"; tap to expand, tap an item for the why sheet). Flat list of this week's picked sides, each with **Eaten** / **Cooked** and a **star**. Stars are optional: up to 3, stored in `S.settings.stars = {d, ids}`, ignored when `d` is not today (so they reset by themselves). With stars, the page shows only starred sides ("Only picks" / "This week" link toggles). The list stays open while starring and goes quiet at the 3rd star or when you return to the tab. Removed from Eat: meal slots, Auto-plan, swipe rows, tallies, colored sections. The info sheet (tap a name) has **Counts** (tally sheet) and **Edit**. `autoPlan`, `entryRm`, swipe code and plan entries still exist in code but nothing on Eat uses them.

**Next, in this order:** Shopping (checklist only), Fridge (behind a small link), Plan, Settings (icon row for categories, icon buttons for backup/reset, drop the colors explainer), item sheets (icon fields in a row). Ask the user to check each on the phone before moving on.
