import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17313),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17313/index.html'); pg.wait_for_timeout(400)
    edit=lambda k: (pg.click(f'.row.cart[data-k="{k}"]'), pg.wait_for_timeout(250))
    done=lambda: (pg.evaluate("A.closeSheet()"), pg.wait_for_timeout(150))
    old=pg.evaluate("S.modules.flatMap(m=>m.ing).filter(i=>!['tsp','tbsp','cup','pint','oz','lb','ea'].includes(i.u)).length")
    print('1. recipe ingredients still using can/slice/clove/bag/etc:', old, '| count units:', pg.evaluate("COUNT_UNITS.join()"))
    pg.evaluate("""()=>{ S.modules=[
       {id:'s1',name:'Soup',cat:'meal',icon:'soup-bread',makes:1,wk:1,per:1,cook:false,raw:5,cooked:0,ing:[{n:'Soup',a:1,u:'ea'}],storage:'',method:''},
       {id:'s2',name:'Chickpeas',cat:'pro',icon:'chickpeas',makes:2,wk:2,per:2,cook:false,raw:365,cooked:0,ing:[{n:'Chickpeas',a:0.5,u:'ea'}],storage:'',method:''},
       {id:'s3',name:'Garlic bits',cat:'flav',icon:'garlic-butter',makes:1,wk:1,per:1,cook:false,raw:30,cooked:0,ing:[{n:'Garlic',a:4,u:'ea'}],storage:'',method:''},
       {id:'s4',name:'Hot honey',cat:'flav',icon:'hot-honey',makes:4,wk:4,per:4,cook:false,raw:365,cooked:0,ing:[{n:'Honey',a:2,u:'tbsp'}],storage:'',method:''}];
       A.newWeek(); S.week.picks=['s1','s2','s3','s4']; S.week.locked=true; ui.picking=false; ui.tab='plan'; ui.planTab='cart'; render(); }""")
    pg.wait_for_timeout(250)
    cards=lambda: pg.evaluate("[...document.querySelectorAll('.row.cart')].map(r=>r.querySelector('b').innerText+': '+r.querySelector('.csum').innerText+' | '+r.querySelector('.cprice').innerText)")
    print('2. compact cards (fields hidden until tapped):'); [print('   ',r) for r in cards()]
    print('   edit fields visible on the page before any tap:', pg.evaluate("document.querySelectorAll('.u-size,.price-in').length"))
    edit('soup|ea'); pg.fill('.u-size','2'); pg.fill('.price-in','5'); pg.wait_for_timeout(100)
    soup=pg.evaluate("cartLines().find(l=>l.name==='Soup')")
    print('3. soup unit = 2 each, $5 → buy', soup['units'],'unit | total', soup['total'], '| focus kept in price box:', pg.evaluate("document.activeElement.classList.contains('price-in')"))
    done(); pg.click('.row.cart[data-k="soup|ea"] [data-a=cartAdd]'); pg.wait_for_timeout(200)
    print('   added to fridge → soup in fridge:', pg.evaluate("stock('soup|ea')"), 'each | still in cart:', pg.evaluate("cartLines().some(l=>l.name==='Soup')"))
    edit('garlic|ea'); pg.fill('.u-size','40'); pg.wait_for_timeout(100)
    g=pg.evaluate("cartLines().find(l=>l.name==='Garlic')"); print('4. garlic need 4, 1 unit = 40 each → buy', g['units'], 'unit | sheet summary:', pg.inner_text('#usum')); done()
    h0=pg.evaluate("cartLines().find(l=>l.name==='Honey')"); print('5. honey default: 1 unit =', pg.evaluate("fmtBase(cartLines().find(l=>l.name==='Honey').size,'tsp')"), '→ buy', h0['units'])
    edit('honey|tsp'); pg.select_option('.u-unit','tbsp'); pg.fill('.u-size','1'); pg.wait_for_timeout(100)
    h1=pg.evaluate("cartLines().find(l=>l.name==='Honey')"); print('   set 1 unit = 1 tbsp → need 2 tbsp → buy', h1['units'], 'units')
    pg.select_option('.u-unit','cup'); pg.wait_for_timeout(100)
    print('   dropdown to cup (number 1) → 1 unit =', pg.evaluate("fmtBase(cartLines().find(l=>l.name==='Honey').size,'tsp')"), '| volume item offers:', pg.evaluate("[...document.querySelectorAll('.u-unit option')].map(o=>o.text).join(',')")); done()
    edit('garlic|ea'); print('   count items only offer:', pg.evaluate("[...document.querySelectorAll('.u-unit option')].map(o=>o.text).join(',')")); done()
    pg.evaluate("""()=>{ const old=JSON.parse(JSON.stringify(S)); old.v=4; delete old.units;
      old.modules=[{id:'g1',name:'Garlic things',cat:'flav',icon:'garlic-butter',makes:1,per:1,cook:false,raw:30,cooked:0,ing:[{n:'Garlic',a:2,u:'clove'},{n:'Chickpeas',a:1,u:'can'},{n:'Bread',a:2,u:'slice'}],storage:'',method:''}];
      old.fridge=[{id:'f1',key:'bread|slice',name:'Bread',unit:'slice',qty:6,start:todayIso(),life:5},{id:'f2',key:'chickpeas|can',name:'Chickpeas',unit:'can',qty:2,start:todayIso(),life:730}];
      old.prices={'bread|slice':3.5,'chickpeas|can':1.25,'honey|tsp':6.5}; old.packs={};
      old.week={id:'w',start:todayIso(),locked:true,picks:['g1'],tally:{}}; localStorage.setItem('mealloop.v1',JSON.stringify(old)); }""")
    pg.reload(); pg.wait_for_timeout(400)
    print('6. migrated to v', pg.evaluate('S.v'), '| ingredient units:', pg.evaluate("S.modules[0].ing.map(i=>i.n+':'+i.u).join(', ')"), '| prices became unit prices:', pg.evaluate("JSON.stringify(Object.fromEntries(Object.entries(S.units).map(([k,v])=>[k,v.price])))"))
    print('errors', errs); b.close()
