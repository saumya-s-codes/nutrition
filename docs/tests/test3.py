import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17302),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17302/index.html'); pg.wait_for_timeout(500)
    pg.evaluate("A.newWeek(); S.week.picks=['m1','m13','m15','m35']; S.week.locked=true; ui.picking=false; ui.tab='plan'; ui.planTab='cart'; render()")
    print('lines',len(pg.query_selector_all('.row.cart')))
    for key,price in (('carrots|ea','4.50'),('chicken breast|ea','2.25')):
        pg.click(f'.row.cart[data-k="{key}"]'); pg.wait_for_timeout(250); pg.fill('.price-in',price); pg.press('.price-in','Tab'); pg.evaluate("A.closeSheet()"); pg.wait_for_timeout(150)
    print('prices',pg.evaluate("JSON.stringify(Object.fromEntries(Object.entries(S.units).map(([k,v])=>[k,v.price])))"), 'total text', pg.inner_text('.totalcard b'))
    pg.screenshot(path='/tmp/mealloop-shots/p1_cart.png')
    pg.evaluate("ui.tab='diary'; render()"); pg.click('[data-a=logFood]'); pg.wait_for_timeout(300)
    pg.fill('#lg-n','Burrito bowl at Chipotle'); pg.click('[data-a=logIcons]'); pg.click('[data-a=setLogIcon][data-k=rice]')
    print('name kept after icon pick:', pg.input_value('#lg-n'))
    pg.select_option('#lg-s','dinner'); pg.fill('#lg-o','Too salty'); pg.screenshot(path='/tmp/mealloop-shots/p2_log.png')
    pg.evaluate('A.closeSheet()'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/p3_diary.png')
    print('diary',pg.evaluate("JSON.stringify(S.diary.map(d=>[d.name,d.slot,d.manual,d.notes]))"),'fridge',pg.evaluate('S.fridge.length'))
    print('errors',errs); b.close()
