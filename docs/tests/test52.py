import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17327),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
from PIL import Image
with sync_playwright() as p:
    b=p.chromium.launch(); out=[]
    for scheme in ('light','dark'):
        ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,color_scheme=scheme); pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('http://127.0.0.1:17327/index.html'); pg.wait_for_timeout(400)
        pg.evaluate("""()=>{ S.modules=[
          {id:'q',name:'Quinoa',cat:'fill',icon:'quinoa',makes:4,wk:4,per:4,cook:true,raw:365,cooked:4,ing:[{n:'Quinoa',a:1,u:'cup'}],storage:'',method:''},
          {id:'c',name:'Carrots',cat:'veg',icon:'carrots',makes:5,wk:5,per:2,cook:true,raw:21,cooked:4,ing:[{n:'Carrots',a:5,u:'ea'}],storage:'',method:''},
          {id:'a',name:'Apples',cat:'fruit',icon:'apples',makes:5,wk:5,per:5,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:5,u:'ea'}],storage:'',method:''}];
          A.newWeek(); S.week.picks=['q','c','a']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); doCook('q');
          S.cooked.c=[{id:'c1',n:2,date:addDays(todayIso(),-3),life:4}]; S.week.tally.c={cooked:2,raw:0};     // carrots: yellow, so it shows in Needs attention too
          ['q','c','a'].forEach(id=>addEntry(todayIso(),'lunch',id)); S.settings.eatOpen={soon:true,breakfast:false,dinner:false,snack:false,treat:false}; ui.tab='eat'; ui.date=todayIso(); render(); }""")
        pg.wait_for_timeout(200)
        if scheme=='light':
            labels=pg.evaluate("[...new Set([...document.querySelectorAll('.btn.eat, .btn.amber')].map(b=>b.innerText.trim()))].join(' | ')")
            print('1. every button label on the page:', labels, '| any "+1" or count:', pg.evaluate("[...document.querySelectorAll('.btn.eat, .btn.amber')].some(b=>/\\d|\\+/.test(b.innerText))"))
            order=pg.evaluate("""(()=>{ const res={}; for (const [name,sel] of [['Needs attention','.soon .erow'],['Lunch slot (right-hand stack)','.slot .erow'],['Side list','.mrow']]) { res[name]=[...document.querySelectorAll(sel)].map(r=>{ const kids=[...r.querySelectorAll('.ebtns > *, .rbtns > *')]; return kids.map(k=>k.classList.contains('eat')?'Eaten':k.classList.contains('amber')?'Cooked':k.classList.contains('gap')?'(empty)':k.classList.contains('icon-btn')?'icon':'?').join(' ')}).filter((v,i,a)=>a.indexOf(v)===i).join('  ;  '); } return res; })()""")
            print('2. button order by row type:'); [print('   ',k,'→',v) for k,v in order.items()]
            print('3. Eaten comes before Cooked in every row that has both:', pg.evaluate("[...document.querySelectorAll('.ebtns, .rbtns')].filter(e=>e.querySelector('.btn.amber')).every(e=>[...e.children].indexOf(e.querySelector('.btn.eat')) < [...e.children].indexOf(e.querySelector('.btn.amber')))"))
            print('4. columns line up (left edge of Eaten, and of Cooked, equal across each list):', pg.evaluate("""(()=>{ const ok=(sel,cls)=>{ const x=[...document.querySelectorAll(sel)].map(r=>r.querySelector(cls)).filter(Boolean).map(e=>Math.round(e.getBoundingClientRect().left)); return new Set(x).size<=1; }; return ['.slot .erow','.mrow','.soon .erow'].map(s=>s+': '+(ok(s,'.btn.eat')&&ok(s,'.btn.amber'))).join(' | ') })()"""))
            print('5. greyed Cooked (Quinoa) is still disabled and sits after Eaten:', pg.evaluate("""(()=>{ const row=[...document.querySelectorAll('.mrow')].find(r=>r.querySelector('.nameb').innerText==='Quinoa'); const b=row.querySelector('.btn.amber'), e=row.querySelector('.btn.eat'); return 'disabled='+b.disabled+', Eaten is left of it='+(e.getBoundingClientRect().left<b.getBoundingClientRect().left) })()"""))
        f=f'/tmp/mealloop-shots/r_lunch_{scheme}.png'; pg.locator('.slot', has_text='Lunch').first.screenshot(path=f); out.append(f)
        f=f'/tmp/mealloop-shots/r_list_{scheme}.png'; pg.evaluate("document.querySelector('.mgroup').scrollIntoView()"); pg.evaluate("document.querySelector('#view').scrollTop-=60"); pg.wait_for_timeout(120); pg.locator('.mgroup').first.screenshot(path=f); out.append(f)
        print(scheme,'errors',errs)
    b.close()
ims=[Image.open(f) for f in out]
rows=[ims[0:2],ims[2:4]]
W=Image.new('RGB',(max(sum(i.width for i in r) for r in rows), sum(max(i.height for i in r) for r in rows)),'white'); y=0
for r in rows:
    x=0
    for im in r: W.paste(im,(x,y)); x+=im.width
    y+=max(i.height for i in r)
W.resize((W.width//2,W.height//2)).save('/tmp/mealloop-shots/r_all.png')
