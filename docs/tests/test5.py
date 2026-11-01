import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os, json
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17304),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    # --- migration: seed an OLD v1 state before load
    pg.goto('http://127.0.0.1:17304/index.html'); pg.wait_for_timeout(300)
    pg.evaluate("""()=>{ const s=JSON.parse(localStorage.getItem('mealloop.v1')||'null')||{}; 
      const old={v:1, fridge:[{id:'a',key:'honey|tbsp',name:'honey ',unit:'tbsp',qty:24,start:'2026-10-30',life:730},{id:'b',key:'brussels sprouts|lb',name:'Brussels sprouts',unit:'lb',qty:1,start:'2026-10-30',life:7}], prices:{'honey|tbsp':6.5,'brussels sprouts|lb':3}};
      localStorage.setItem('mealloop.v1', JSON.stringify(old)); }""")
    pg.reload(); pg.wait_for_timeout(400)
    print('migrated fridge:', pg.evaluate("JSON.stringify(S.fridge.map(f=>[f.key,f.unit,f.qty]))"), 'prices', pg.evaluate("JSON.stringify(Object.fromEntries(Object.entries(S.units).map(([k,v])=>[k,v.price])))"), 'v', pg.evaluate('S.v'))
    # --- cross-unit subtraction
    r=pg.evaluate("""()=>{
      const hot=S.modules.find(m=>m.name==='Hot honey'); // honey 4 tbsp + hot sauce 2 tsp
      S.modules.push({id:'tA',cat:'flav',icon:'hot-honey',name:'Test A',makes:2,per:2,cook:false,raw:30,cooked:0,ing:[{n:'Honey',a:1,u:'tbsp'}],storage:'',method:''});
      S.modules.push({id:'tB',cat:'flav',icon:'hot-honey',name:'Test B',makes:2,per:2,cook:false,raw:30,cooked:0,ing:[{n:'honey',a:1,u:'tsp'}],storage:'',method:''});
      S.week={id:'w',start:todayIso(),locked:true,picks:['tA','tB'],tally:{}};
      const withBottle=cartLines().map(l=>l.name);
      S.fridge=S.fridge.filter(f=>!f.key.startsWith('honey'));
      const noBottle=cartLines().map(l=>l.name+': '+l.label+' ('+l.detail+')');
      return {withBottle,noBottle}; }""")
    print(r)
    # non-pack volume: lemon juice 2 tbsp + 1 tsp + 1/4 cup
    r=pg.evaluate("""()=>{
      S.modules.push({id:'tC',cat:'flav',icon:'hot-honey',name:'Test C',makes:1,per:1,cook:false,raw:7,cooked:0,ing:[{n:'Lemon juice',a:2,u:'tbsp'},{n:'Flour',a:0.25,u:'cup'}],storage:'',method:''});
      S.modules.push({id:'tD',cat:'flav',icon:'hot-honey',name:'Test D',makes:1,per:1,cook:false,raw:7,cooked:0,ing:[{n:'lemon juice',a:1,u:'tsp'}],storage:'',method:''});
      S.week.picks=['tC','tD']; return cartLines().map(l=>l.name+': '+l.label); }""")
    print('non-pack:', r)
    print('fmt checks:', pg.evaluate("[fmtBase(4,'tsp'),fmtBase(72,'tsp'),fmtBase(1,'tsp'),fmtBase(8,'oz'),fmtBase(24,'oz'),fmtBase(18,'tsp'),fmtBase(2,'ea')]"))
    # --- eat deducts across units
    pg.evaluate("S.week.picks=['tA']; addFridge('Honey','tbsp',24); doEat('tA',todayIso(),'snack'); doEat('tA',todayIso(),'snack')")
    print('honey tsp left after 2 servings (each 1.5 tsp):', pg.evaluate("stock('honey|tsp')"), '(expected 72-3=69)')
    # --- editor + conflict
    pg.evaluate("ui.tab='plan'; ui.planTab='week'; ui.picking=false; render(); S.week.picks=['tA']; render(); A.editMod({m:'tA'})"); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/mealloop-shots/u1_edit.png')
    pg.select_option('select[data-f=u]','oz'); pg.evaluate('A.closeSheet()'); pg.wait_for_timeout(200)
    print('conflict toast:', pg.inner_text('#toast'))
    pg.select_option('select[data-f=u]','cup'); pg.evaluate('A.closeSheet()'); pg.wait_for_timeout(200)
    print('sheet closed after fixing unit:', pg.evaluate('ui.sheet===null'), '| honey unit saved as cup:', pg.evaluate("S.modules.find(m=>m.id==='tA').ing[0].u"))
    # add item sheet + toss sheet
    pg.evaluate("ui.planTab='fridge'; render(); A.addItem()"); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/u2_add.png')
    pg.evaluate("A.closeSheet(); A.tossIng({k:'honey|tsp'})"); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/u3_toss.png')
    pg.evaluate("ui.sheet=null; render(); ui.planTab='cart'; S.week.picks=['tC','tD']; render()"); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/mealloop-shots/u4_cart.png')
    print('errors',errs); b.close()
from PIL import Image
ims=[Image.open(f'/tmp/mealloop-shots/{n}.png').resize((390,844)) for n in ['u1_edit','u2_add','u3_toss','u4_cart']]
W=Image.new('RGB',(390*4,844)); [W.paste(im,(i*390,0)) for i,im in enumerate(ims)]; W.save('/tmp/mealloop-shots/m5.png')
