import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17326),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
from PIL import Image
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17326/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ S.modules=[
      {id:'a',name:'Apples',cat:'fruit',icon:'apples',makes:5,wk:5,per:5,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:5,u:'ea'}],storage:'',method:''},
      {id:'q',name:'Quinoa',cat:'fill',icon:'quinoa',makes:4,wk:4,per:4,cook:true,raw:365,cooked:4,ing:[{n:'Quinoa',a:1,u:'cup'}],storage:'',method:''}];
      A.newWeek(); S.week.picks=['a','q']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
      S.settings.eatOpen={soon:false}; ui.tab='eat'; ui.date=todayIso(); render(); }""")
    rows=lambda s: pg.evaluate(f"document.querySelectorAll('.slot:has(.foldhead[data-k={s}]) .erow').length")
    print('1. no stepper anywhere:', pg.evaluate("document.querySelectorAll('.stepper-s').length"), '| text "planned eaten" on the page:', pg.evaluate("document.querySelector('#view').innerText.includes('planned eaten')"))
    # add the same side three times to Snack through the add sheet
    pg.click('[data-a=addTo][data-s=snack]'); pg.wait_for_timeout(250)
    for _ in range(3): pg.click('.mchip[data-m=a]'); pg.wait_for_timeout(120)
    pg.click('.sheetx'); pg.wait_for_timeout(200)
    print('2. added Apples to Snack 3 times → rows:', rows('snack'), '| each planned for 1:', pg.evaluate("entriesOn(todayIso()).filter(e=>e.mid==='a').every(e=>e.n===1)"), '| slot summary:', pg.evaluate("document.querySelector('.foldhead[data-k=snack] small').innerText"))
    print('   button labels on those rows:', pg.evaluate("[...document.querySelectorAll('.slot:has(.foldhead[data-k=snack]) [data-a=eat]')].map(b=>b.innerText.trim()).join(' | ')"))
    pg.screenshot(path='/tmp/mealloop-shots/s1.png')
    # eat one row: only that row finishes
    pg.click('.slot:has(.foldhead[data-k=snack]) .erow >> nth=0 >> [data-a=eat]'); pg.wait_for_timeout(250)
    print('3. ate the first → summary:', pg.evaluate("document.querySelector('.foldhead[data-k=snack] small').innerText"), '| rows done:', pg.evaluate("document.querySelectorAll('.slot:has(.foldhead[data-k=snack]) .erow.done').length"), '| its button now:', pg.evaluate("document.querySelector('.slot:has(.foldhead[data-k=snack]) .erow.done .btn.eat').innerText.trim()+' (disabled: '+document.querySelector('.slot:has(.foldhead[data-k=snack]) .erow.done .btn.eat').disabled+')'"), '| fridge apples left:', pg.evaluate("stock('apples|ea')"))
    pg.screenshot(path='/tmp/mealloop-shots/s2.png')
    # remove just one serving
    pg.evaluate("A.entryRm({e: document.querySelector('.slot:has(.foldhead[data-k=snack]) .erow:not(.done)').dataset.e})"); pg.wait_for_timeout(200)
    print('4. removed one planned serving → rows left:', rows('snack'), '(one eaten, one still planned)')
    # eating from the side list marks the next planned serving
    pg.click('.mrow:has(.nameb:text-is("Apples")) [data-a=eat]'); pg.wait_for_timeout(250)
    print('5. Eaten on the side list → planned servings eaten:', pg.evaluate("entriesOn(todayIso()).filter(e=>e.mid==='a'&&e.eaten>=1).length"), 'of', pg.evaluate("entriesOn(todayIso()).filter(e=>e.mid==='a').length"))
    # migration: a v8 plan with counts
    pg.evaluate("""()=>{ const old=JSON.parse(JSON.stringify(S)); old.v=8; const T=todayIso(); old.plan={[T]:[{id:'e1',slot:'dinner',mid:'a',n:3,eaten:1},{id:'e2',slot:'lunch',mid:'q',n:1,eaten:0}]}; localStorage.setItem('mealloop.v1',JSON.stringify(old)); }"""); pg.reload(); pg.wait_for_timeout(400)
    pl=pg.evaluate("Object.values(S.plan).flat().map(e=>e.slot+':'+e.mid+':n'+e.n+':eaten'+e.eaten).join(', ')")
    print('6. old plan (apples ×3 with 1 eaten) after upgrade → v'+str(pg.evaluate('S.v')), '|', pl)
    print('errors', errs); b.close()
a=Image.open('/tmp/mealloop-shots/s1.png'); c=Image.open('/tmp/mealloop-shots/s2.png')
W=Image.new('RGB',(a.width*2,a.height)); W.paste(a,(0,0)); W.paste(c,(a.width,0)); W.resize((780,844)).save('/tmp/mealloop-shots/s_pair.png')
