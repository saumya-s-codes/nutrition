import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17308),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
def tap_out(pg): pg.mouse.click(195,40); pg.wait_for_timeout(250)   # tap the dimmed area above the sheet
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17308/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=['m1']; S.week.locked=true; ui.picking=false; ui.tab='plan'; ui.planTab='week'; render(); }""")
    save_btns=lambda: pg.evaluate("[...document.querySelectorAll('.panel button')].map(b=>b.innerText.trim()).filter(t=>/^(save|add to|cancel)/i.test(t))")
    # 1. edit existing module: live save + pill + tap out
    pg.evaluate("A.editMod({m:'m1'})"); pg.wait_for_timeout(300)
    print('1. edit sheet buttons named save/cancel/add:', save_btns(), '| pill:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok') ? 'Saved' : '(not yet)'"))
    pg.fill('[data-f=name]','Carrots renamed'); pg.wait_for_timeout(600)
    print('   after typing -> saved name:', pg.evaluate("mod('m1').name"), '| pill:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok') ? 'Saved' : '(not yet)'"))
    pg.screenshot(path='/tmp/mealloop-shots/f1_edit.png')
    tap_out(pg); print('   tapped out -> sheet closed:', pg.evaluate('ui.sheet===null'), '| name kept:', pg.evaluate("mod('m1').name"))
    # 2. new module: blank discards, filled saves
    n0=pg.evaluate('S.modules.length'); pg.evaluate("A.editMod({m:'new:veg'})"); pg.wait_for_timeout(250); tap_out(pg)
    print('2. new module left blank -> modules added:', pg.evaluate('S.modules.length')-n0, '| closed:', pg.evaluate('ui.sheet===null'))
    pg.evaluate("A.editMod({m:'new:veg'})"); pg.wait_for_timeout(250); pg.fill('[data-f=name]','Garlic greens'); pg.fill('input[data-f=n][data-i="0"]','Greens'); pg.wait_for_timeout(500); tap_out(pg)
    print('   filled in -> modules added:', pg.evaluate('S.modules.length')-n0, '| toast:', pg.inner_text('#toast'))
    # 3. invalid state: error shown, first tap-out stays open, second discards
    pg.evaluate("A.editMod({m:'m1'})"); pg.wait_for_timeout(250); pg.fill('[data-f=name]',''); pg.wait_for_timeout(600)
    print('3. blank name -> message:', pg.inner_text('#formmsg'))
    tap_out(pg); print('   first tap-out: still open =', pg.evaluate('ui.sheet!==null'), '| toast:', pg.inner_text('#toast')[:70])
    tap_out(pg); print('   second tap-out: closed =', pg.evaluate('ui.sheet===null'), '| last good name kept:', pg.evaluate("mod('m1').name"))
    # 4. thoughts live save
    pg.evaluate("""()=>{ S.diary.push({id:'dd',ts:Date.now(),type:'eat',mid:'m1',name:'Carrots',icon:'carrots',servings:1,slot:'lunch',rating:0,notes:'',src:[]}); ui.tab='diary'; render(); A.thoughts({i:'dd'}); }""")
    pg.wait_for_timeout(300); pg.fill('#notes','Great with honey'); pg.wait_for_timeout(600)
    print('4. notes saved while typing:', pg.evaluate("S.diary.find(d=>d.id==='dd').notes"), '| pill:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok') ? 'Saved' : '(not yet)'"), '| buttons:', save_btns())
    tap_out(pg)
    # 5. log food
    n0=pg.evaluate('S.diary.length'); pg.click('[data-a=logFood]'); pg.wait_for_timeout(300); tap_out(pg)
    print('5. log food blank -> entries added:', pg.evaluate('S.diary.length')-n0)
    pg.click('[data-a=logFood]'); pg.wait_for_timeout(300); pg.fill('#lg-n','Pad thai out'); print('   buttons:', save_btns()); tap_out(pg)
    print('   with a name -> entries added:', pg.evaluate('S.diary.length')-n0, '| toast:', pg.inner_text('#toast'))
    # 6. add to fridge
    pg.evaluate("ui.tab='plan'; ui.planTab='fridge'; render(); A.addItem()"); pg.wait_for_timeout(300)
    f0=pg.evaluate('S.fridge.length'); pg.fill('#ai-n','Parsley'); pg.fill('#ai-q','1/2'); pg.select_option('#ai-u','cup'); print('6. buttons:', save_btns()); tap_out(pg)
    print('   fridge items added:', pg.evaluate('S.fridge.length')-f0, '| parsley:', pg.evaluate("S.fridge.filter(f=>f.name==='Parsley').map(f=>f.qty+' '+f.unit).join()"), '| toast:', pg.inner_text('#toast'))
    # 7. settings pill
    pg.evaluate("A.settings()"); pg.wait_for_timeout(250); pg.click('[data-a=toggleAcc][data-k=plan]'); pg.wait_for_timeout(100); print('7. settings pill before:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok') ? 'Saved' : '(not yet)'")); pg.click('[data-a=catTarget][data-c=veg][data-d="1"]'); pg.wait_for_timeout(200)
    print('   after typing:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok') ? 'Saved' : '(not yet)'"), '| saved:', pg.evaluate('S.settings.targets.veg')); pg.screenshot(path='/tmp/mealloop-shots/f2_settings.png'); tap_out(pg)
    # 8. fix the count autosaves on blur
    pg.evaluate("addFridge('Honey','tbsp',24); ui.tab='plan'; ui.planTab='fridge'; render(); A.tossIng({k:'honey|tsp'})"); pg.wait_for_timeout(300)
    print('8. fix-count buttons:', save_btns()); pg.fill('#setq','10'); pg.select_option('#setu','tbsp'); pg.wait_for_timeout(300)
    print('   honey now (expected 30 tsp = 10 tbsp):', pg.evaluate("stock('honey|tsp')"))
    print('errors', errs); b.close()
