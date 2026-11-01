import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17320),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17320/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ S.modules=[
      {id:'q',name:'Quinoa',cat:'fill',icon:'quinoa',makes:4,wk:4,per:4,cook:true,raw:365,cooked:4,ing:[{n:'Quinoa',a:1,u:'cup'}],storage:'',method:''},
      {id:'o',name:'Omelet',cat:'meal',icon:'eggs',makes:2,wk:2,per:2,cook:true,raw:21,cooked:3,ing:[{n:'Eggs',a:4,u:'ea'},{n:'Cheese',a:2,u:'oz'}],storage:'',method:''}];
      window.setCooked=(n,leftDays)=>{ S.cooked={q:[{id:'c1',n,date:addDays(todayIso(), leftDays-4)}]}; };   // life 4 -> eat-by = today+leftDays
      window.st=(id,d)=>{ const s=sideStatus(mod(id), d||todayIso(), cartMap()); return s? s.level+': '+s.label : 'none'; };
      A.newWeek(); S.week.picks=[]; S.week.locked=true; ui.picking=false; }""")
    show=lambda label,js: print(f'{label:<62}', pg.evaluate(js))
    print('--- cooked leftovers, pace = servings ÷ eating days (today through eat-by day) ---')
    for n,left,why in [(3,2,'3 servings, eat by Thu (Tue,Wed,Thu = 3 days)'),(2,3,'2 servings, 4 eating days'),(1,0,'1 serving, last day (eat-by day is still fine)'),(0.5,0,'half a serving on the last day'),(4,5,'4 servings over 6 days'),(6,3,'6 servings over 4 days')]:
        show(f'{why}:', f"setCooked({n},{left}); st('q')")
    show('2 servings, eat-by was yesterday:', "setCooked(2,-1); st('q')")
    show('expired, and today is also past -> still red:', "setCooked(2,-5); st('q')")
    print('--- several batches: everything due by each deadline counts ---')
    show('2 due tomorrow + 4 due in 5 days (2 in 2 days = 1/day):', "S.cooked={q:[{id:'a',n:2,date:addDays(todayIso(),-3)},{id:'b',n:4,date:addDays(todayIso(),1)}]}; st('q')")
    show('1 due tomorrow + 3 due in 2 days (4 in 3 days):', "S.cooked={q:[{id:'a',n:1,date:addDays(todayIso(),-3)},{id:'b',n:3,date:addDays(todayIso(),-2)}]}; st('q')")
    show('expired batch + good batch -> red until the bad one is gone:', "S.cooked={q:[{id:'a',n:2,date:addDays(todayIso(),-9)},{id:'b',n:4,date:addDays(todayIso(),0)}]}; st('q')")
    print('--- preview of a future day (what will be tight by then) ---')
    show('3 servings eat-by in 5 days: viewing today / in 3 days / in 7 days:', "setCooked(3,5); [st('q'), st('q',addDays(todayIso(),3)), st('q',addDays(todayIso(),7))].join('  |  ')")
    show('viewing yesterday (history has no flags):', "setCooked(3,0); st('q',addDays(todayIso(),-1))")
    print('--- raw stock (cook by), only for sides picked this week ---')
    pg.evaluate("S.cooked={}; S.week.picks=['q']; addFridge('Quinoa','cup',1); S.fridge[0].start=addDays(todayIso(),-1); S.fridge[0].life=3;")   # 4 servings, eat-by in 2 days
    show('4 raw servings, cook by Thu (3 days):', "st('q')")
    pg.evaluate("S.fridge[0].life=30")
    show('same, 30-day pantry life:', "st('q')")
    print('--- red for missing ingredients (the cart is the measure) ---')
    pg.evaluate("S.fridge=[]; S.week.picks=['o']")
    show('Omelet picked, empty fridge:', "st('o')")
    pg.evaluate("addFridge('Eggs','ea',12); addFridge('Cheese','oz',8)")
    show('Omelet picked, eggs + cheese in the fridge:', "st('o')")
    pg.evaluate("S.fridge=S.fridge.filter(f=>f.name!=='Cheese')")
    show('cheese runs out:', "st('o')")
    pg.evaluate("S.week.picks=[]")
    show('Omelet not picked this week and no leftovers:', "st('o')")
    print('--- expired stock keeps counting until thrown out ---')
    pg.evaluate("S.week.picks=['o']; S.fridge=[]; addFridge('Eggs','ea',12); addFridge('Cheese','oz',8); S.fridge.forEach(f=>{f.start=addDays(todayIso(),-10); f.life=3}); window.__x=1")
    show('eggs + cheese expired: status:', "st('o')")
    show('   cart asks for eggs/cheese again? (expired still counts)', "cartLines().length===0 ? 'no (still counted as in the fridge)' : 'YES'")
    show('   stock count includes expired eggs:', "stock('eggs|ea')")
    print('--- slots never matter ---')
    pg.evaluate("setCooked(3,2); S.week.picks=[]")
    a=pg.evaluate("st('q')"); pg.evaluate("addEntry(todayIso(),'dinner','q'); addEntry(todayIso(),'lunch','q'); addEntry(addDays(todayIso(),1),'dinner','q')"); b2=pg.evaluate("st('q')")
    print(f'{"status before / after slotting the side three times:":<62}', a, '/', b2, '| identical:', a==b2)
    print('errors', errs); b.close()
