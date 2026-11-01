import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17306),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17306/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=['m1','m61']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); 
      addEntry(todayIso(),'lunch','m1'); addEntry(todayIso(),'snack','m61'); doCook('m1'); doEat('m1',todayIso(),'lunch'); doEat('m61',todayIso(),'snack'); save(); ui.tab='eat'; ui.date=todayIso(); render(); }""")
    print('tally lines:', pg.evaluate("[...document.querySelectorAll('.tally')].map(e=>e.innerText.trim()).join(' || ')"))
    pg.screenshot(path='/tmp/mealloop-shots/w1_eat.png')
    st=lambda: pg.evaluate("JSON.stringify({carrotsRaw:stock('carrots|ea'),cooked:cookedTotal('m1'),tallyCooked:S.week.tally.m1.cooked,eaten:eatenCount('m1'),diaryCarrots:S.diary.filter(d=>d.mid==='m1').reduce((a,d)=>a+d.servings,0),planEaten:entriesOn(todayIso()).find(e=>e.mid==='m1').eaten})")
    print('start        ', st())
    pg.click('.tally >> nth=0') if pg.query_selector('.tally') else None
    pg.evaluate("A.tally({m:'m1'})"); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/w2_sheet.png')
    pg.click('[data-a=tallyEat][data-d="-1"]');  print('un-eat 1     ', st())
    pg.click('[data-a=tallyCook][data-d="-1"]'); print('un-cook 1    ', st())
    pg.click('[data-a=tallyCook][data-d="1"]');  print('cook +1      ', st())
    pg.click('[data-a=tallyEat][data-d="1"]');   print('eat +1       ', st())
    # undo button restores snapshot
    pg.click('#toast [data-a=undo]'); pg.wait_for_timeout(200); print('toast Undo   ', st())
    # raw (non-cook) item: apples
    pg.evaluate("ui.sheet=null; A.tally({m:'m61'})"); print('apple name:', pg.evaluate("mod('m61').name"), 'raw before', pg.evaluate("rawLeft(mod('m61'))"))
    pg.click('[data-a=tallyEat][data-d="-1"]'); print('apple un-eat raw ->', pg.evaluate("rawLeft(mod('m61'))"), 'eaten', pg.evaluate("eatenCount('m61')"))
    pg.screenshot(path='/tmp/mealloop-shots/w3_sheet_apple.png')
    print('errors',errs); b.close()
from PIL import Image
ims=[Image.open(f'/tmp/mealloop-shots/{n}.png').resize((390,844)) for n in ['w1_eat','w2_sheet','w3_sheet_apple']]
W=Image.new('RGB',(390*3,844)); [W.paste(im,(i*390,0)) for i,im in enumerate(ims)]; W.save('/tmp/mealloop-shots/m6.png')
