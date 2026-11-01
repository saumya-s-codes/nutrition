import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17309),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17309/index.html'); pg.wait_for_timeout(400)
    # --- 3. breakfast merged
    print('3. categories:', pg.evaluate("CATS.map(c=>c.id).join(',')"))
    print('   modules in Easy meals:', pg.evaluate("S.modules.filter(m=>m.cat==='meal').length"), '| breakfast-flagged:', pg.evaluate("S.modules.filter(m=>m.bf).map(m=>m.name).join(' / ')"))
    print('   "Eggs + toast" copies:', pg.evaluate("S.modules.filter(m=>m.name==='Eggs + toast').length"), '| any cat=bfast:', pg.evaluate("S.modules.some(m=>m.cat==='bfast')"))
    # --- 1. x of y chosen
    pg.evaluate("ui.tab='plan'; A.newWeek(); render()"); pg.wait_for_timeout(300)
    print('1. step 1 text:', pg.inner_text('.pickbody > p'))
    pg.click('.card[data-m=m1]'); pg.click('.card[data-m=m2]'); pg.wait_for_timeout(200)
    print('   after 2 picks:', pg.inner_text('.pickbody > p'), '| step badge classes:', pg.evaluate("document.querySelector('.step.on b').className||'(not met yet)'"))
    pg.click('.card[data-m=m3]'); pg.wait_for_timeout(200); print('   after 3 picks badge met:', pg.evaluate("document.querySelector('.step.on b').className"))
    pg.screenshot(path='/tmp/mealloop-shots/k1_picker.png')
    # --- 2. settings order + targets
    pg.evaluate("ui.picking=false; ui.step=0; render(); A.settings()"); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/mealloop-shots/k2_settings.png')
    pg.click('[data-a=toggleAcc][data-k=plan]'); pg.click('[data-a=catMove][data-c=pro][data-d="-1"]'); pg.wait_for_timeout(150)
    pg.click('[data-a=catTarget][data-c=pro][data-d="1"]'); pg.click('[data-a=catTarget][data-c=pro][data-d="1"]'); pg.wait_for_timeout(150)
    print('2. order now:', pg.evaluate("orderedCats().map(c=>c.id).join(',')"), '| protein target:', pg.evaluate("targetFor('pro')"), '| pill:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok') ? 'Saved' : '(not yet)'"))
    pg.evaluate("A.closeSheet()"); pg.evaluate("A.editWeek()"); pg.wait_for_timeout(300)
    print('   picker step 1 is now:', pg.inner_text('.pickbody h2'), '|', pg.inner_text('.pickbody > p'))
    print('   persisted:', pg.evaluate("JSON.stringify([JSON.parse(localStorage.getItem('mealloop.v1')).settings.catOrder.slice(0,2), JSON.parse(localStorage.getItem('mealloop.v1')).settings.targets.pro])"))
    # --- 4. grid summary
    pg.evaluate("ui.tab='plan'; S.week.picks=['m1','m2','m13','m25','m37','m46','m70','m80']; S.week.locked=true; ui.picking=false; render()"); pg.wait_for_timeout(300)
    print('4. summary columns:', pg.evaluate("getComputedStyle(document.querySelector('.sgrid')).gridTemplateColumns.split(' ').length"), '| cards:', pg.evaluate("document.querySelectorAll('.sgrid .sgroup').length"), '| first card:', pg.evaluate("document.querySelector('.sgrid .sgroup h3').innerText.replace(/\\n/g,' ')"))
    pg.screenshot(path='/tmp/mealloop-shots/k3_summary.png')
    # --- migration v3 -> v4 with a duplicate breakfast module carrying real data
    pg.evaluate("""()=>{ const old=JSON.parse(JSON.stringify(S)); old.v=3;
      const meal=old.modules.find(m=>m.name==='Eggs + toast'&&!m.bf);
      old.modules.forEach(m=>{ if(m.bf){ m.cat='bfast'; delete m.bf; } });
      old.modules.push({...JSON.parse(JSON.stringify(meal)), id:'mdup', cat:'bfast'});
      const T=todayIso();
      old.week={id:'w',start:T,locked:true,picks:['mdup',meal.id],tally:{mdup:{cooked:2,raw:0}}};
      old.cooked={mdup:[{n:2,date:T}]}; old.plan={[T]:[{id:'e1',slot:'breakfast',mid:'mdup',n:1,eaten:0}]};
      old.diary=[{id:'d1',ts:Date.now(),type:'eat',mid:'mdup',name:'Eggs + toast',icon:'eggs-toast',servings:1,slot:'breakfast',rating:4,notes:''}];
      old.settings.catOrder=['bfast','veg','pro','fill','flav','fruit','meal','snack','treat']; localStorage.setItem('mealloop.v1',JSON.stringify(old)); window.__mealId=meal.id; }""")
    mealid=pg.evaluate("window.__mealId"); pg.reload(); pg.wait_for_timeout(400)
    print('5. migrated -> version', pg.evaluate('S.v'), '| any bfast cat:', pg.evaluate("S.modules.some(m=>m.cat==='bfast')"), '| "Eggs + toast" copies:', pg.evaluate("S.modules.filter(m=>m.name==='Eggs + toast').length"))
    print('   picks:', pg.evaluate("S.week.picks.includes('mdup')?'STILL HAS DUP':'deduped to '+S.week.picks.filter(x=>mod(x)&&mod(x).name==='Eggs + toast').length+' copy'"), '| cooked moved:', pg.evaluate(f"JSON.stringify(S.cooked['{mealid}'])"), '| tally:', pg.evaluate(f"JSON.stringify(S.week.tally['{mealid}'])"))
    print('   plan/diary remapped:', pg.evaluate(f"entriesOn(todayIso())[0].mid==='{mealid}' && S.diary[0].mid==='{mealid}'"), '| catOrder has bfast:', pg.evaluate("S.settings.catOrder.includes('bfast')"), '| the 7 breakfast-flagged modules kept:', pg.evaluate("S.modules.filter(m=>m.bf).length"))
    # --- auto-plan: breakfast uses bf meals, lunch avoids them
    pg.evaluate("""()=>{ localStorage.clear(); }"""); pg.reload(); pg.wait_for_timeout(300)
    pg.evaluate("""()=>{ const id=n=>S.modules.find(m=>m.name===n&&m.cat==='meal').id; A.newWeek(); S.week.picks=[id('Cereal + milk'),id('Avocado toast + egg'),id('Soup + bread'),id('Pasta + sauce')]; S.week.locked=true; ui.picking=false;
      cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); autoPlan(todayIso()); }""")
    print('6. auto-plan:', pg.evaluate("entriesOn(todayIso()).map(e=>e.slot+': '+mod(e.mid).name).join(' | ')"))
    print('errors', errs); b.close()
