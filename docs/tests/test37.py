import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17318),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17318/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ S.modules=[
      {id:'q',name:'Quinoa',cat:'fill',icon:'quinoa',makes:4,wk:4,per:4,cook:true,raw:365,cooked:4,ing:[{n:'Quinoa',a:1,u:'cup'}],storage:'',method:''},
      {id:'r',name:'Rice',cat:'fill',icon:'rice',makes:6,wk:6,per:6,cook:true,raw:365,cooked:5,ing:[{n:'Rice',a:1.5,u:'cup'}],storage:'',method:''},
      {id:'c',name:'Curry',cat:'meal',icon:'quesadilla',makes:3,wk:4,per:3,cook:true,raw:7,cooked:4,ing:[{n:'Chickpeas',a:2,u:'ea'}],storage:'',method:''},
      {id:'a',name:'Apples',cat:'fruit',icon:'apples',makes:5,wk:5,per:5,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:5,u:'ea'}],storage:'',method:''}];
      A.newWeek(); S.week.picks=['q','r','c','a']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
      ['q','r','c','a'].forEach(id=>addEntry(todayIso(),'lunch',id)); S.settings.eatOpen={soon:false}; ui.tab='eat'; ui.date=todayIso(); render(); }""")
    st=lambda mid: pg.evaluate(f"(()=>{{const b=document.querySelector('.slot .btn.amber[data-m={mid}]'); return b ? {{text:b.innerText.trim(), disabled:b.disabled, tappable:b.dataset.a==='cook'}} : 'none'}})()")
    print('1. before cooking, Quinoa:', st('q'), '| label has a number:', any(ch.isdigit() for ch in pg.evaluate("document.querySelector('.slot .btn.amber[data-m=q]').innerText")))
    pg.click('.slot [data-a=cook][data-m=q]'); pg.wait_for_timeout(250)
    print('2. cooked the weekly 4 → Quinoa:', st('q'), '| cooked ready:', pg.evaluate("cookedTotal('q')"))
    pg.evaluate("document.querySelector('.slot .btn.amber[data-m=q]').click()"); pg.wait_for_timeout(200)
    print('3. tried to tap the greyed button → cooked ready still:', pg.evaluate("cookedTotal('q')"), '| grey look:', pg.evaluate("(()=>{const cs=getComputedStyle(document.querySelector('.slot .btn.amber[data-m=q]')); return cs.backgroundColor+' on '+cs.color})()"))
    # direct action call is also refused
    pg.evaluate("A.cook({m:'q'})"); print('   even calling the action directly does nothing:', pg.evaluate("cookedTotal('q')")==4)
    # the final cook only covers what's left
    pg.click('.slot [data-a=cook][data-m=c]'); pg.wait_for_timeout(250); a1=pg.evaluate("cookedTotal('c')")
    print('4. Curry (batch 3, goal 4): 1st tap cooked', a1, end=' ')
    pg.click('.slot [data-a=cook][data-m=c]'); pg.wait_for_timeout(250); a2=pg.evaluate("cookedTotal('c')")-a1
    print('| 2nd tap cooked', a2, '| button after:', st('c'))
    print('5. columns still line up (Cooked / Eaten left edges equal across rows):', pg.evaluate("(()=>{const L=s=>[...document.querySelectorAll('.slot .erow')].map(r=>Math.round((r.querySelector(s)||{getBoundingClientRect:()=>({left:-1})}).getBoundingClientRect().left)); const c=L('.btn.amber').filter(x=>x>0), e=L('.btn.eat'); return new Set(c).size===1 && new Set(e).size===1})()"))
    print('6. apples (no cooking): Cooked button present:', pg.evaluate("!!document.querySelector('.slot .btn.amber[data-m=a]')"))
    pg.locator('.slot').first.screenshot(path='/tmp/mealloop-shots/q_slot.png')
    print('errors', errs); b.close()
