import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17315),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
from PIL import Image
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17315/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=['m13']; S.week.locked=true; ui.picking=false; ui.tab='plan'; render(); A.editMod({m:'m13'}) }"""); pg.wait_for_timeout(450)
    heads=lambda: pg.evaluate("[...document.querySelectorAll('.pbody .sec > h4')].map(h=>h.innerText.split('\\n')[0]).join(' | ')")
    print('sections:', heads(), '| dropdowns:', pg.evaluate("[...document.querySelectorAll('.pbody .acc')].map(a=>a.querySelector('b').innerText+' ['+a.getAttribute('aria-expanded')+'] — '+a.querySelector('small').innerText).join(' || ')"))
    print('collapsed → notes/breakfast fields in the page:', pg.evaluate("document.querySelectorAll('[data-f=method],[data-f=storage],[data-f=bf]').length"), '| old Planning/Notes headers gone:', 'PLANNING' not in heads().upper() and 'NOTES' not in heads().upper())
    pg.evaluate("document.querySelector('.pbody').scrollTop=9999"); pg.wait_for_timeout(100); pg.screenshot(path='/tmp/mealloop-shots/m1.png')
    pg.click('.acc[data-k=more]'); pg.wait_for_timeout(150)
    print('opened → fields:', pg.evaluate("[...document.querySelectorAll('[data-f=bf],[data-f=method],[data-f=storage]')].map(e=>e.dataset.f).join(',')"), '| aria-expanded:', pg.get_attribute('.acc[data-k=more]','aria-expanded'))
    pg.evaluate("document.querySelector('.pbody').scrollTop=9999"); pg.wait_for_timeout(100); pg.screenshot(path='/tmp/mealloop-shots/m2.png')
    pg.check('[data-f=bf]'); pg.fill('[data-f=method]','Season, sear 5 min a side.'); pg.wait_for_timeout(600)
    print('edits inside the dropdown save live → bf:', pg.evaluate("mod('m13').bf"), '| method:', pg.evaluate("mod('m13').method"), '| tag saved:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok')"))
    pg.click('.acc[data-k=more]'); pg.wait_for_timeout(150)
    print('collapsed again → summary:', pg.inner_text('.acc[data-k=more] small'), '| values kept:', pg.evaluate("mod('m13').bf+' / '+mod('m13').method.length+' chars'"))
    pg.evaluate("A.closeSheet(); A.editMod({m:'m13'})"); pg.wait_for_timeout(300)
    print('reopen editor → collapsed:', pg.get_attribute('.acc[data-k=more]','aria-expanded')=='false', '| summary:', pg.inner_text('.acc[data-k=more] small'))
    print('errors', errs); b.close()
a=Image.open('/tmp/mealloop-shots/m1.png'); c=Image.open('/tmp/mealloop-shots/m2.png')
W=Image.new('RGB',(a.width*2,a.height)); W.paste(a,(0,0)); W.paste(c,(a.width,0)); W.resize((780,844)).save('/tmp/mealloop-shots/m_pair2.png')
