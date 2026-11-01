import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17325),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
from PIL import Image
SETUP="""()=>{ const names=['Hot honey','Chicken','Carrots','Stir-fry','Apples']; A.newWeek(); S.week.picks=S.modules.filter(m=>names.includes(m.name)).map(m=>m.id); S.week.locked=true; ui.picking=false;
  S.units['honey|tsp']={price:6.5}; S.units['carrots|ea']={price:0.8}; ui.tab='plan'; ui.planTab='cart'; render(); }"""
with sync_playwright() as p:
    b=p.chromium.launch(); out=[]
    for scheme in ('light','dark'):
        ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,color_scheme=scheme); pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('http://127.0.0.1:17325/index.html'); pg.wait_for_timeout(400); pg.evaluate(SETUP); pg.wait_for_timeout(250)
        if scheme=='light':
            print('cards on the page:', pg.evaluate("document.querySelectorAll('.row.cart').length"), '| every card has an icon:', pg.evaluate("[...document.querySelectorAll('.row.cart')].every(r=>r.querySelector('img'))"), '| edit fields on the page:', pg.evaluate("document.querySelectorAll('.u-size,.u-unit,.price-in').length"))
            for r in pg.evaluate("[...document.querySelectorAll('.row.cart')].slice(0,4).map(r=>r.querySelector('b').innerText+'  →  '+r.querySelector('.csum').innerText+'  |  '+r.querySelector('.for').innerText+'  |  '+r.querySelector('.cprice').innerText)"): print('  ', r)
        pg.evaluate("document.querySelector('#view').scrollTop=170"); pg.wait_for_timeout(100); f=f'/tmp/mealloop-shots/y_cart_{scheme}.png'; pg.screenshot(path=f); out.append(f)
        # tapping To fridge must not open the sheet
        if scheme=='light':
            pg.click('.row.cart[data-k="carrots|ea"] [data-a=cartAdd]'); pg.wait_for_timeout(200); print('tap To fridge → sheet opened:', pg.evaluate("!!(ui.sheet&&ui.sheet.t==='unit')"), '| carrots in fridge:', pg.evaluate("stock('carrots|ea')"))
            pg.evaluate("S.fridge=[]; render()")
        pg.click('.row.cart[data-k="honey|tsp"] .cinfo2'); pg.wait_for_timeout(450)
        if scheme=='light': print('tap the card → sheet:', pg.evaluate("ui.sheet.t"), '| fields now:', pg.evaluate("[...document.querySelectorAll('.u-size,.u-unit,.price-in')].map(e=>e.className).join(',')"))
        f=f'/tmp/mealloop-shots/y_sheet_{scheme}.png'; pg.screenshot(path=f); out.append(f)
        if scheme=='light':
            pg.fill('.price-in','9'); pg.wait_for_timeout(150)
            print('typed price 9 → saved tag:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok')"), '| card behind updates:', pg.evaluate("document.querySelector('.row.cart[data-k=\"honey|tsp\"] .cprice').innerText"), '| sheet total:', pg.inner_text('#utotal'), '| grand total:', pg.inner_text('.totalcard b'))
        print(scheme,'errors',errs)
    b.close()
ims=[Image.open(f).resize((390,844)) for f in out]
W=Image.new('RGB',(390*4,844)); [W.paste(im,(i*390,0)) for i,im in enumerate(ims)]; W.save('/tmp/mealloop-shots/y_all.png')
