import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17314),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17314/index.html'); pg.wait_for_timeout(400)
    print('0. defaults: every module has a weekly amount equal to what it makes:', pg.evaluate("S.modules.every(m=>m.wk===m.makes)"), '| picker caption:', pg.evaluate("(()=>{const m=S.modules[0]; return nice(weekServings(m))+' a week'})()"))
    pg.evaluate("""()=>{ S.modules=[
      {id:'c1',name:'Chickpea curry',cat:'pro',icon:'chickpeas',makes:3,wk:3,per:3,cook:true,raw:365,cooked:4,ing:[{n:'Chickpeas',a:2,u:'ea'},{n:'Coconut milk',a:1,u:'ea'}],storage:'',method:''},
      {id:'a1',name:'Apple + peanut butter',cat:'snack',icon:'apple-pb',makes:1,wk:1,per:1,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:1,u:'ea'},{n:'Peanut butter',a:1,u:'tbsp'}],storage:'',method:''}];
      A.newWeek(); S.week.picks=['c1','a1']; S.week.locked=true; ui.picking=false; ui.tab='plan'; ui.planTab='cart'; render(); }""")
    need=lambda n: pg.evaluate(f"(cartLines().find(l=>l.name==='{n}')||{{need:0}}).need")
    print('1. before setting a weekly amount: apples needed', need('Apples'), '| chickpeas', need('Chickpeas'))
    # set apples to 4 a week through the editor (live save)
    pg.evaluate("ui.planTab='week'; render(); A.editMod({m:'a1'})"); pg.wait_for_timeout(300)
    pg.fill('[data-f=wk]','4'); pg.wait_for_timeout(600)
    print('2. apple snack set to 4 a week → saved wk =', pg.evaluate("mod('a1').wk"), '| makes still', pg.evaluate("mod('a1').makes"), '| apples to buy:', need('Apples'), '| peanut butter:', pg.evaluate("fmtBase((cartLines().find(l=>l.name==='Peanut butter')||{need:0}).need,'tsp')"))
    print('   chickpea curry untouched (3 a week, makes 3): chickpeas needed', need('Chickpeas'), '(one batch)')
    pg.evaluate("A.closeSheet()")
    # curry 4 a week of a 3-serving recipe → proportional
    pg.evaluate("mod('c1').wk=4; save(); render()"); print('3. curry at 4 a week (makes 3): chickpeas needed', round(need('Chickpeas'),2), '(4/3 of a batch) → units to buy:', pg.evaluate("cartLines().find(l=>l.name==='Chickpeas').units"))
    pg.evaluate("mod('c1').wk=3; save(); render()")
    # eat progress
    pg.evaluate("""()=>{ ui.tab='eat'; ui.date=todayIso(); addEntry(todayIso(),'snack','a1'); cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); render(); }""")
    print('4. eat page line for apples before eating:', pg.evaluate("document.querySelector('.erow .tally').innerText.trim()"))
    pg.evaluate("doEat('a1',todayIso(),'snack'); doEat('a1',todayIso(),'snack'); save(); render()")
    print('   after 2 apples:', pg.evaluate("[...document.querySelectorAll('.tally')].map(t=>t.innerText.trim()).filter(t=>t.startsWith('Eaten'))[0]"), '| still need to buy (fridge covers the rest):', pg.evaluate("cartLines().length"), '| remaining servings', pg.evaluate("remaining(mod('a1'))"))
    pg.evaluate("doEat('a1',todayIso(),'snack'); doEat('a1',todayIso(),'snack'); save(); render()")
    print('   after 4 apples → remaining', pg.evaluate("remaining(mod('a1'))"), '| apples left in fridge:', pg.evaluate("stock('apples|ea')"), '| cart:', pg.evaluate("cartLines().map(l=>l.name).join(',')||'empty'"))
    # cook button follows the weekly goal
    pg.evaluate("mod('c1').wk=6; save(); render()")
    cook=lambda: pg.evaluate("[...document.querySelectorAll('[data-a=cook][data-m=c1]')].length>0")
    dis=lambda: pg.evaluate("(()=>{const b=document.querySelector('.btn.amber[data-m=c1]'); return b ? b.disabled : 'missing'})()")
    print('5. curry at 6 a week, batch of 3: Cooked button tappable:', cook(), '| label:', pg.evaluate("document.querySelector('[data-a=cook][data-m=c1]').innerText.trim()"))
    pg.evaluate("doCook('c1',3); save(); render()"); print('   after one batch: still tappable (3 more to go):', cook(), '| remaining', pg.evaluate("remaining(mod('c1'))"))
    pg.evaluate("doCook('c1',3); save(); render()"); print('   after two batches: tappable:', cook(), '| greyed out and disabled:', dis())
    print('errors', errs); b.close()
