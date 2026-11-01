import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os, re
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17321),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
SETUP="""()=>{ S.modules=[
  {id:'q',name:'Quinoa',cat:'fill',icon:'quinoa',makes:4,wk:4,per:4,cook:true,raw:365,cooked:4,ing:[{n:'Quinoa',a:1,u:'cup'}],storage:'',method:''},
  {id:'o',name:'Omelet',cat:'meal',icon:'eggs',makes:2,wk:2,per:2,cook:true,raw:21,cooked:3,ing:[{n:'Eggs',a:4,u:'ea'},{n:'Cheese',a:2,u:'oz'}],storage:'',method:''},
  {id:'s',name:'Stir-fry',cat:'meal',icon:'stir-fry',makes:2,wk:2,per:2,cook:true,raw:5,cooked:4,ing:[{n:'Soy sauce',a:2,u:'tbsp'},{n:'Mixed vegetables',a:1,u:'lb'}],storage:'',method:''},
  {id:'a',name:'Apples',cat:'fruit',icon:'apples',makes:5,wk:5,per:5,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:5,u:'ea'}],storage:'',method:''}];
  A.newWeek(); S.week.picks=['q','o','s','a']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
  S.settings.eatOpen={soon:true}; ui.tab='eat'; ui.date=todayIso(); render(); }"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17321/index.html'); pg.wait_for_timeout(400); pg.evaluate(SETUP); pg.wait_for_timeout(200)
    chips=lambda: pg.evaluate("[...new Map([...document.querySelectorAll('.mrow')].map(r=>[r.querySelector('.nameb').innerText,(r.querySelector('.flag')||{innerText:'(normal)'}).innerText])).entries()].map(([n,c])=>n+': '+c).join('  |  ')")
    print('0. stocked, nothing wrong:', chips())
    # ---- yellow: the one-a-day rule on cooked leftovers
    pg.evaluate("S.cooked={q:[{id:'c1',n:3,date:addDays(todayIso(),-2)}]}; S.cooked.q[0].life=4; S.week.tally.q={cooked:3,raw:0}; render()")
    print('1. 3 quinoa servings, eat by in 2 days (3 eating days):', chips())
    pg.evaluate("S.cooked.q[0]={id:'c1',n:2,date:addDays(todayIso(),-1),life:4}; render()")
    print('   2 servings, eat by in 3 days (4 eating days):', chips())
    # ---- red: expired, then throw out from the why sheet
    pg.evaluate("S.cooked.q[0]={id:'c1',n:3,date:addDays(todayIso(),-6),life:4}; render()")
    print('2. 3 quinoa servings eat-by 2 days ago:', chips())
    pg.click('.mrow:has(.nameb:text-is("Quinoa")) .flag'); pg.wait_for_timeout(300)
    print('   why sheet:', pg.evaluate("document.querySelector('.pbody').innerText.replace(/\\n+/g,' · ').slice(0,200)"))
    pg.screenshot(path='/tmp/mealloop-shots/v1_why_expired.png')
    d0=pg.evaluate("S.diary.length"); pg.click('[data-a=whyToss]'); pg.wait_for_timeout(250)
    e=pg.evaluate("S.diary[S.diary.length-1]")
    print('   threw it out → diary entry:', {k:e.get(k) for k in ('type','name','qty','reason')}, '| logged:', pg.evaluate("S.diary.length")-d0, '| Quinoa now:', chips().split('  |  ')[0])
    # ---- red: missing ingredient, ingredients stay off the Eat rows
    pg.evaluate("S.fridge=S.fridge.filter(f=>f.name!=='Cheese'); render()")
    print('3. cheese runs out → Omelet:', [c for c in chips().split('  |  ') if c.startswith('Omelet')])
    page=pg.evaluate("document.querySelector('#view').innerText")
    print('   ingredient names visible anywhere on the Eat page (Cheese / Eggs / Soy sauce / Mixed vegetables):', [w for w in ('Cheese','Eggs','Soy sauce','Mixed vegetables') if w in page] or 'none')
    pg.click('.mrow:has(.nameb:text-is("Omelet")) .flag'); pg.wait_for_timeout(300)
    print('   why sheet (ingredient names are fine in here):', pg.evaluate("document.querySelector('.pbody').innerText.replace(/\\n+/g,' · ').slice(0,200)"))
    pg.click('[data-a=whyBought]'); pg.wait_for_timeout(250)
    print('   "I bought it" → Omelet:', [c for c in chips().split('  |  ') if c.startswith('Omelet')], '| toast has Edit date:', pg.evaluate("!!document.querySelector('#toast [data-a=toastExtra]')"))
    pg.evaluate("document.querySelector('#toast').className=''")
    # ---- remove from the week: plan and cart update
    pg.evaluate("S.fridge=S.fridge.filter(f=>f.name!=='Cheese'); addEntry(todayIso(),'dinner','o'); addEntry(addDays(todayIso(),1),'lunch','o'); render()")
    cartBefore=pg.evaluate("cartLines().map(l=>l.name).join(',')")
    pg.click('.mrow:has(.nameb:text-is("Omelet")) .flag'); pg.wait_for_timeout(250); pg.click('[data-a=whyRemove]'); pg.wait_for_timeout(250)
    print('4. removed from the week → picked:', pg.evaluate("S.week.picks.includes('o')"), '| future plan entries for it:', pg.evaluate("Object.values(S.plan).flat().filter(e=>e.mid==='o').length"), '| cart before →', cartBefore, '| after →', pg.evaluate("cartLines().map(l=>l.name).join(',')||'(empty)'"))
    # ---- slots never matter
    pg.evaluate("S.week.picks=['q','o','s','a']; S.fridge=[]; S.cooked={}; render()"); pg.evaluate(SETUP); pg.evaluate("S.cooked={q:[{id:'c1',n:3,date:addDays(todayIso(),-2),life:4}]}; S.week.tally.q={cooked:3,raw:0}; render()")
    a1=chips(); pg.evaluate("addEntry(todayIso(),'dinner','q'); addEntry(todayIso(),'lunch','a'); render()"); a2=chips()
    print('5. chips identical before/after putting sides in slots:', a1==a2)
    # ---- use soon summary
    pg.evaluate("S.cooked.q[0].date=addDays(todayIso(),-7); render()")
    print('6. Use soon header:', pg.evaluate("document.querySelector('.soon .foldhead').innerText.replace(/\\n+/g,' · ')"))
    print('errors', errs); b.close()
