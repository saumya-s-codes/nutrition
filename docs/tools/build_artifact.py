import base64, io, os, re, json
from PIL import Image
P=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))
def webp(path,q=80):
    im=Image.open(path); buf=io.BytesIO()
    im.save(buf,'WEBP',quality=q,method=6)
    return 'data:image/webp;base64,'+base64.b64encode(buf.getvalue()).decode()
IMG={}
for f in sorted(os.listdir(f'{P}/assets/food')): IMG[f[:-4]]=webp(f'{P}/assets/food/{f}',78)
for n in (1,2,3): IMG[f'h{n}']=webp(f'{P}/assets/header{n}.jpg',82)
IMG['fridge']=webp(f'{P}/assets/fridge.png',80)

css=open(f'{P}/styles.css').read()
data=open(f'{P}/data.js').read()
app=open(f'{P}/app.js').read()

# --- artifact-specific edits ---
app=re.sub(r"let S = \(\(\) => \{.*?\}\)\(\);", "let S = fresh();", app, flags=re.S)
app=re.sub(r"const save = \(\) => \{.*?\};", "const save = () => {};", app, count=1)
app=app.replace("if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });","")
app=app.replace("const ico = (k, c = 'ico') => `<img class=\"${c}\" src=\"assets/food/${esc(k)}.png\" alt=\"\" loading=\"lazy\">`;",
                "const ico = (k, c = 'ico') => `<img class=\"${c}\" src=\"${IMG[k] || IMG['other-meal']}\" alt=\"\">`;")
app=app.replace('src="assets/header${n}.jpg"','src="${IMG[\'h\' + n]}"').replace('src="assets/fridge.png"','src="${IMG.fridge}"')
assert 'assets/' not in app, re.findall(r'.{30}assets/.{30}',app)
app=app.replace("// ---------- state ----------","window.confirm = () => true;\n// ---------- state ----------")

seed = r"""
function seedDemo() {
  const id = n => S.modules.find(m => m.name === n).id;
  const T = todayIso(), Y = addDays(T, -1);
  S.week = { id: uid(), start: T, locked: true, tally: {}, picks: ['Carrots', 'Brussels sprouts', 'Broccoli', 'Chicken', 'Eggs', 'Quinoa', 'Rice', 'Hot honey', 'Apples', 'Bananas', 'Avocado toast + egg', 'Stir-fry', 'Yogurt', 'Popcorn', 'Cookies'].map(id) };
  const skip = ['Eggs', 'Honey', 'Hot sauce'];
  cartLines().filter(l => !skip.includes(l.name)).forEach(l => addFridge(l.name, l.unit, l.buy, Y));
  S.fridge.forEach(f => { if (f.name === 'Chicken breast') f.start = Y; });
  const cook = (n, daysAgo) => { const m = id(n); doCook(m); S.cooked[m][S.cooked[m].length - 1].date = addDays(T, -daysAgo); };
  cook('Carrots', 3); cook('Quinoa', 0); cook('Brussels sprouts', 6);   // carrots: yellow, quinoa: fine, sprouts: expired -> red
  Object.entries({ 'eggs|ea': 4.99, 'honey|tsp': 6.5, 'bananas|ea': 0.3, 'yogurt cups|ea': 0.9, 'cookies|ea': 0.6, 'hot sauce|tsp': 3.25 }).forEach(([k, v]) => { S.units[k] = { price: v }; });
  const at = (day, h, mi) => { const d = parseIso(day); d.setHours(h, mi, 0, 0); return d.getTime(); };
  addEntry(T, 'lunch', id('Chicken')); addEntry(T, 'lunch', id('Quinoa')); addEntry(T, 'lunch', id('Carrots'));
  addEntry(T, 'snack', id('Apples'));
  addEntry(addDays(T, 1), 'dinner', id('Stir-fry'));
  S.diary.push(
    { id: uid(), ts: at(Y, 8, 20), type: 'eat', mid: id('Avocado toast + egg'), name: 'Avocado toast + egg', icon: 'avocado-toast-egg', servings: 1, slot: 'breakfast', rating: 4, energy: 5, filling: 3, notes: 'Perfect ripeness.' },
    { id: uid(), ts: at(Y, 13, 5), type: 'eat', manual: true, name: 'Burrito bowl at Chipotle', icon: 'rice', servings: 1, slot: 'lunch', rating: 3, energy: 2, filling: 5, notes: 'A bit salty.' },
    { id: uid(), ts: at(Y, 20, 40), type: 'toss', name: 'Spinach', icon: 'spinach', servings: 1, qty: '5 oz', reason: 'expired' });
  ui.tab = 'eat';
}
seedDemo();
"""
app=app.replace("render();\n", seed+"render();\n",1) if False else app
# insert seed right before the final render()
idx=app.rindex("render();")
app=app[:idx]+seed+"render();\n"

html=f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Meal Loop</title>
<style>
{css}
</style></head>
<body>
<div id="app"><main id="view"></main><nav id="tabs"></nav></div>
<div id="sheet"></div>
<div id="toast" role="status" aria-live="polite"></div>
<script>
const IMG = {json.dumps(IMG)};
{data}
{app}
</script>
</body></html>"""
OUT=os.environ.get('OUT','/mnt/user-data/outputs/meal-loop.html'); os.makedirs(os.path.dirname(OUT),exist_ok=True)
open(OUT,'w').write(html)
print(round(len(html)/1024),'KB')
