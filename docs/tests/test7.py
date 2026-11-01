import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17305),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17305/index.html'); pg.wait_for_timeout(300)
    # a v2 save from the previous release: a pint stored as a count, with a price
    pg.evaluate("""()=>{ const s=JSON.parse(JSON.stringify(S)); s.v=2; s.fridge=[{id:'z',key:'blueberries|pint',name:'Blueberries',unit:'pint',qty:1,start:todayIso(),life:7}]; s.prices={'blueberries|pint':4}; localStorage.setItem('mealloop.v1',JSON.stringify(s)); }""")
    pg.reload(); pg.wait_for_timeout(300)
    print('v2->v3 migrate:', pg.evaluate("JSON.stringify([S.v, S.fridge.map(f=>[f.key,f.unit,f.qty]), S.prices])"))
    # fraction entry in the editor
    pg.evaluate("A.editMod({m:'new:flav'})"); pg.wait_for_timeout(200)
    pg.fill('[data-f=name]','Frac test'); pg.fill('input[data-f=n][data-i="0"]','Cream'); pg.fill('input[data-f=a][data-i="0"]','1 1/2'); pg.select_option('select[data-f=u][data-i="0"]','cup')
    pg.click('[data-a=addIng]'); pg.fill('input[data-f=n][data-i="1"]','Vanilla'); pg.fill('input[data-f=a][data-i="1"]','½'); pg.select_option('select[data-f=u][data-i="1"]','tsp')
    pg.evaluate('A.closeSheet()'); pg.wait_for_timeout(200)
    print('saved fractions:', pg.evaluate("JSON.stringify(S.modules[S.modules.length-1].ing)"))
    print('labels:', pg.evaluate("[fmtBase(36,'tsp'),fmtBase(48,'tsp'),fmtBase(72,'tsp'),fmtBase(16,'tsp'),fmtBase(192,'tsp')].join(' | ')"))
    print('errors',errs); b.close()
