import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17311),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17311/index.html'); pg.wait_for_timeout(400)
    pg.click('[data-a=settings]'); pg.wait_for_timeout(300)
    print('collapsed by default: rows visible =', pg.evaluate("document.querySelectorAll('.orow').length"), '| summary:', pg.inner_text('.acc small'), '| aria-expanded:', pg.get_attribute('.acc','aria-expanded'))
    pg.screenshot(path='/tmp/mealloop-shots/s1.png')
    pg.click('.acc'); pg.wait_for_timeout(200)
    print('after tap: rows =', pg.evaluate("document.querySelectorAll('.orow').length"), '| aria-expanded:', pg.get_attribute('.acc','aria-expanded'))
    pg.screenshot(path='/tmp/mealloop-shots/s2.png')
    pg.click('[data-a=catTarget][data-c=veg][data-d="1"]'); pg.wait_for_timeout(150)
    print('edit while open: veg target =', pg.evaluate("targetFor('veg')"), '| still open:', pg.evaluate("document.querySelectorAll('.orow').length"), '| summary now:', pg.inner_text('.acc small'), '| pill:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok') ? 'Saved' : '(not yet)'"))
    pg.click('.acc'); pg.wait_for_timeout(150)
    print('collapse again: rows =', pg.evaluate("document.querySelectorAll('.orow').length"), '| edit kept:', pg.evaluate("targetFor('veg')"))
    pg.evaluate("A.closeSheet(); A.settings()"); pg.wait_for_timeout(200)
    print('reopen settings: collapsed again =', pg.evaluate("document.querySelectorAll('.orow').length===0"))
    print('errors', errs); b.close()
from PIL import Image
a=Image.open('/tmp/mealloop-shots/s1.png'); c=Image.open('/tmp/mealloop-shots/s2.png')
W=Image.new('RGB',(a.width*2,a.height)); W.paste(a,(0,0)); W.paste(c,(a.width,0)); W.resize((780,844)).save('/tmp/mealloop-shots/s_pair.png')
