import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17324),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17324/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ S.modules=[
      {id:'q',name:'Quinoa',cat:'fill',icon:'quinoa',makes:4,wk:4,per:4,cook:true,raw:365,cooked:4,ing:[{n:'Quinoa',a:1,u:'cup'}],storage:'',method:''},
      {id:'a',name:'Apples',cat:'fruit',icon:'apples',makes:5,wk:5,per:5,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:5,u:'ea'}],storage:'',method:''}];
      A.newWeek(); S.week.picks=['a']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
      S.cooked={q:[{id:'q1',n:3,date:addDays(todayIso(),-6),life:4}]};     // expired leftovers of a side NOT picked this week
      S.settings.eatOpen={soon:true}; ui.tab='eat'; ui.date=todayIso(); render(); }""")
    rows=lambda: pg.evaluate("[...new Set([...document.querySelectorAll('.mrow .nameb, .slot .nameb, .soon .nameb')].map(n=>n.innerText))].join(', ')||'(none)'")
    print('1. Quinoa has expired leftovers but is not picked → on the Eat page:', rows(), '| Needs-attention section present:', pg.evaluate("!!document.querySelector('.soon')"))
    pg.evaluate("ui.tab='plan'; ui.planTab='fridge'; render()"); print('   …but the Fridge still lists it under Leftovers:', pg.evaluate("[...document.querySelectorAll('.fridge .tile b')].map(b=>b.innerText).join(', ')"))
    pg.evaluate("S.week.picks.push('q'); ui.tab='eat'; render()")
    print('2. pick Quinoa for the week → on Eat:', rows(), '| its chip:', pg.evaluate("(document.querySelector('.mrow .flag')||{}).innerText"))
    # stale plan entry for a side that is no longer picked
    pg.evaluate("addEntry(todayIso(),'dinner','a'); render()"); print('3. Apples planned for dinner:', pg.evaluate("document.querySelectorAll('.slot .erow').length"), 'row in slots')
    pg.evaluate("ui.tab='plan'; ui.planTab='week'; ui.picking=true; ui.step=3; render()"); 
    pg.evaluate("A.pick({m:'a'})"); pg.wait_for_timeout(150)
    print('   unpick Apples → upcoming plan entries for it:', pg.evaluate("Object.values(S.plan).flat().filter(e=>e.mid==='a').length"))
    pg.evaluate("S.plan[todayIso()]=[{id:'z',slot:'dinner',mid:'a',n:1,eaten:0}]; ui.picking=false; ui.tab='eat'; render()")
    print('   even a stale entry left in the data stays hidden on Eat:', pg.evaluate("document.querySelectorAll('.slot .erow').length"), 'rows')
    # nothing picked at all
    pg.evaluate("S.week.picks=[]; render()")
    print('4. nothing picked, leftovers in the fridge → Eat shows:', pg.evaluate("document.querySelector('.empty h2')?.innerText || '(rows)'"))
    # new week note
    pg.evaluate("S.week.picks=['a']; A.startWeek()"); pg.wait_for_timeout(250)
    print('5. Start new week sheet:', pg.evaluate("document.querySelector('.pbody').innerText.replace(/\\n+/g,' · ').slice(0,260)"))
    print('errors', errs); b.close()
