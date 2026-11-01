import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os, re
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17312),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17312/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=['m1','m13']; S.week.locked=true; ui.picking=false; ui.tab='plan'; render(); }""")
    chip=lambda: pg.evaluate("document.querySelector('#savedchip').classList.contains('ok')")
    # 1. scan every sheet / page for Save/Done-style buttons
    bad=re.compile(r'^(save|done|apply|ok|confirm|update|submit)\b',re.I); found=[]
    for name,js in [('editor',"A.editMod({m:'m1'})"),('new module',"A.closeSheet(); A.editMod({m:'new:veg'})"),('card back',"A.closeSheet(); A.info({m:'m1'})"),('log food',"A.closeSheet(); ui.tab='diary'; render(); A.logFood()"),('add item',"A.closeSheet(); ui.tab='plan'; ui.planTab='fridge'; render(); A.addItem()"),('toss',"A.closeSheet(); A.tossIng({k:'carrots|ea'})"),('tally',"A.closeSheet(); ui.tab='eat'; render(); A.tally({m:'m1'})"),('add to slot',"A.closeSheet(); A.addTo({s:'lunch'})"),('settings',"A.closeSheet(); A.settings(); for (const k of ['plan','warn','data']) A.toggleAcc({k})")]:
        pg.evaluate(js); pg.wait_for_timeout(150)
        txt=pg.evaluate("[...document.querySelectorAll('.panel button, .panel label.btn')].map(b=>(b.innerText||'').trim()).filter(Boolean)")
        found+= [(name,t) for t in txt if bad.match(t)]
        has_x=pg.evaluate("!!document.querySelector('.panel .sheetx')")
        if not has_x: found.append((name,'NO CLOSE X'))
    pg.evaluate("A.closeSheet()")
    print('1. save/done-style buttons found across all sheets:', found or 'none', '| every sheet has a close X: ', 'yes' if not any(t=='NO CLOSE X' for _,t in found) else 'NO')
    # 2. log food: saves while typing, one record, updates in place
    pg.evaluate("ui.tab='diary'; render()"); n0=pg.evaluate('S.diary.length'); pg.click('[data-a=logFood]'); pg.wait_for_timeout(250)
    print('2. log food: tag before typing saved =', chip())
    pg.fill('#lg-n','Pad thai'); pg.wait_for_timeout(600)
    print('   after typing (sheet still open): entries added =', pg.evaluate('S.diary.length')-n0, '| tag saved =', chip(), '| visible in the diary behind the sheet:', pg.evaluate("[...document.querySelectorAll('.entry b')].some(e=>e.innerText.includes('Pad thai'))"))
    pg.fill('#lg-q','2'); pg.fill('#lg-n','Pad thai with shrimp'); pg.wait_for_timeout(600)
    print('   edited -> still 1 entry:', pg.evaluate('S.diary.length')-n0==1, '| name:', pg.evaluate("S.diary[S.diary.length-1].name"), '| servings:', pg.evaluate("S.diary[S.diary.length-1].servings"))
    pg.mouse.click(195,40); pg.wait_for_timeout(250); print('   closed, entries added =', pg.evaluate('S.diary.length')-n0)
    # 3. add to fridge: saves while typing, updates the same batch, conflict message
    pg.evaluate("ui.tab='plan'; ui.planTab='fridge'; render(); A.addItem()"); pg.wait_for_timeout(250); f0=pg.evaluate('S.fridge.length')
    pg.fill('#ai-n','Parsley'); pg.wait_for_timeout(600)
    print('3. add item: after typing the name, fridge items added =', pg.evaluate('S.fridge.length')-f0, '| tag saved =', chip())
    pg.fill('#ai-q','2'); pg.select_option('#ai-u','cup'); pg.wait_for_timeout(600)
    print('   qty/unit edited -> still 1 batch:', pg.evaluate('S.fridge.length')-f0==1, '| stored:', pg.evaluate("S.fridge.filter(f=>f.name==='Parsley').map(f=>f.qty+' '+f.unit).join()"))
    pg.fill('#ai-n','Carrots'); pg.select_option('#ai-u','oz'); pg.wait_for_timeout(600)
    print('   conflicting unit shows message:', pg.inner_text('#formmsg')[:60], '| batch unchanged:', pg.evaluate("S.fridge.filter(f=>f.name==='Parsley').length"))
    pg.fill('#ai-n','Parsley'); pg.wait_for_timeout(500); pg.mouse.click(195,40); pg.wait_for_timeout(250)
    # 4. cart price: saves per keystroke without losing focus
    pg.evaluate("S.week.picks=['m1','m13']; ui.planTab='cart'; render()"); pg.wait_for_timeout(200)
    pg.click('.row.cart >> nth=0'); pg.wait_for_timeout(250); pg.click('.price-in'); pg.keyboard.type('4.5'); pg.wait_for_timeout(100)
    print('4. cart price typed (no blur): saved =', pg.evaluate("Object.values(S.units).map(u=>u.price).join()"), '| still focused:', pg.evaluate("document.activeElement.classList.contains('price-in')"), '| line total:', pg.inner_text('.cprice >> nth=0'), '| grand total:', pg.inner_text('.totalcard b'))
    print('errors', errs); b.close()
