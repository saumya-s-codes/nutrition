import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17323),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17323/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ S.modules=[
      {id:'a',name:'Apples',cat:'fruit',icon:'apples',makes:5,wk:5,per:5,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:5,u:'ea'}],storage:'',method:''},
      {id:'q',name:'Quinoa',cat:'fill',icon:'quinoa',makes:4,wk:4,per:4,cook:true,raw:365,cooked:4,ing:[{n:'Quinoa',a:1,u:'cup'}],storage:'',method:''}];
      A.newWeek(); S.week.picks=['a','q']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
      S.fridge.forEach(f=>{ f.start=addDays(todayIso(),-1); f.life=3; }); }""")
    for id in ('a','q'): print(pg.evaluate(f"mod('{id}').name+' (raw, eat/cook-by in 2 days): '+((sideStatus(mod('{id}'),todayIso(),cartMap())||{{}}).label||'none')"))
    print('errors', errs); b.close()
