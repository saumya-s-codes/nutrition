import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17310),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17310/index.html'); pg.wait_for_timeout(400)
    st=lambda: pg.evaluate("[...document.querySelectorAll('[data-cookonly]')].map(l=>l.innerText.split('\\n')[0]+': '+(l.querySelector('input').disabled?'greyed out':'active')).join(' | ')")
    # apples: does not need cooking
    pg.evaluate("ui.tab='plan'; A.editMod({m:S.modules.find(m=>m.name==='Apples').id})"); pg.wait_for_timeout(300)
    print('Apples (no cooking):', st())
    pg.evaluate("document.querySelector('.panel').scrollTop=400"); pg.wait_for_timeout(100); pg.screenshot(path='/tmp/mealloop-shots/o1_off.png')
    pg.check('[data-f=cook]'); pg.wait_for_timeout(100); print('after ticking Needs cooking:', st())
    pg.fill('[data-f=per]','2'); pg.wait_for_timeout(500)
    print('   saved per-cook:', pg.evaluate("S.modules.find(m=>m.name==='Apples').per"), '| cook flag:', pg.evaluate("S.modules.find(m=>m.name==='Apples').cook"))
    pg.screenshot(path='/tmp/mealloop-shots/o2_on.png')
    pg.uncheck('[data-f=cook]'); pg.wait_for_timeout(100); print('after unticking again:', st(), '| value kept in the greyed box:', pg.input_value('[data-f=per]'))
    pg.evaluate("A.closeSheet()")
    # chicken needs cooking: both active on open
    pg.evaluate("A.editMod({m:S.modules.find(m=>m.name==='Chicken').id})"); pg.wait_for_timeout(300); print('Chicken (needs cooking):', st())
    print('errors', errs); b.close()
from PIL import Image
a=Image.open('/tmp/mealloop-shots/o1_off.png'); c=Image.open('/tmp/mealloop-shots/o2_on.png')
W=Image.new('RGB',(a.width*2,a.height)); W.paste(a,(0,0)); W.paste(c,(a.width,0)); W.resize((780,844)).save('/tmp/mealloop-shots/o_pair.png')
