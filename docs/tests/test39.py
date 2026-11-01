import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17319),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17319/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=S.modules.filter(m=>['Carrots','Chicken','Hot honey','Stir-fry'].includes(m.name)).map(m=>m.id); S.week.locked=true; ui.picking=false;
      cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); addFridge('Parsley','ea',1); addFridge('Cumin seeds','tsp',3); ui.tab='plan'; ui.planTab='fridge'; render(); }""")
    print('0. editor no longer has shelf-life or storage fields:')
    pg.evaluate("A.editMod({m:S.week.picks[0]})"); pg.wait_for_timeout(250)
    print('   raw/cooked/storage inputs in module editor:', pg.evaluate("document.querySelectorAll('[data-f=raw],[data-f=cooked],[data-f=storage]').length"), '| sections:', pg.evaluate("[...document.querySelectorAll('.pbody .sec > h4, .pbody .acc b')].map(h=>h.innerText.split('\\n')[0]).join(' | ')"))
    pg.evaluate("A.closeSheet(); A.info({m:S.week.picks[0]})"); pg.wait_for_timeout(500)
    print('   card back shows Storage section or Raw/Cooked chips:', pg.evaluate("/Storage|\\bRaw\\b|\\bCooked\\b/.test(document.querySelector('.cardback').innerText)"))
    pg.evaluate("A.closeSheet()")
    # 1 icons
    icons=pg.evaluate("[...document.querySelectorAll('.tile')].filter(t=>t.dataset.a==='openFood').map(t=>t.querySelector('b').innerText+' → '+(t.querySelector('img')||{src:'NO ICON'}).src.slice(-60).split('/').pop().slice(0,24))")
    print('1. fridge ingredient tiles have icons:'); [print('   ',x) for x in icons[:8]]
    print('   tiles without an icon:', pg.evaluate("[...document.querySelectorAll('.tile')].filter(t=>!t.querySelector('img')).length"))
    pg.screenshot(path='/tmp/mealloop-shots/i1_fridge.png')
    # 2 dates row
    pg.click('.tile[data-k="carrots|ea"]'); pg.wait_for_timeout(350)
    st=lambda: pg.evaluate("(()=>{const r=document.querySelector('.batch'); return {bought:r.querySelector('[data-bf=start]').value, expires:r.querySelector('[data-bf=exp]').value, keeps:r.querySelector('[data-bf=life]').value}})()")
    T=pg.evaluate("todayIso()"); print('2. carrots dates:', st(), '| Bought and Expires side by side, Keeps below:', pg.evaluate("(()=>{const [a,b,c]=[...document.querySelectorAll('.batch .dates2 input')].map(i=>i.getBoundingClientRect()); return Math.round(a.top)===Math.round(b.top) && a.right<=b.left && c.top>a.bottom})()"))
    pg.screenshot(path='/tmp/mealloop-shots/i2_sheet.png')
    # type expiry from a package: +10 days
    exp=pg.evaluate("addDays(todayIso(),10)"); pg.fill('.batch [data-bf=exp]',exp); pg.wait_for_timeout(150)
    print('3. typed Expires +10d → Keeps =', st()['keeps'], '| batch life saved =', pg.evaluate("S.fridge.find(f=>f.key==='carrots|ea').life"), '| ingredient default unchanged =', pg.evaluate("S.life['carrots|ea']===undefined?'(none)':S.life['carrots|ea']"), '| Saved tag:', pg.evaluate("document.querySelector('#savedchip').classList.contains('ok')"))
    pg.fill('.batch [data-bf=life]','5'); pg.wait_for_timeout(150)
    print('4. typed Keeps 5 → Expires =', st()['expires']==pg.evaluate("addDays(todayIso(),5)"), '| default for carrots now =', pg.evaluate("S.life['carrots|ea']"))
    two=pg.evaluate("addDays(todayIso(),-2)"); pg.fill('.batch [data-bf=start]',two); pg.wait_for_timeout(150)
    print('5. changed Bought to 2 days ago → Expires =', st()['expires']==pg.evaluate("addDays(todayIso(),3)"), '(keeps stays 5) | info line now:', pg.inner_text('#finfo'))
    bad=pg.evaluate("addDays(todayIso(),-5)"); pg.fill('.batch [data-bf=exp]',bad); pg.wait_for_timeout(150)
    print('6. Expires before Bought → message:', pg.inner_text('#formmsg'), '| life unchanged =', pg.evaluate("S.fridge.find(f=>f.key==='carrots|ea').life"))
    # storage + icon
    pg.fill('#stor','Crisper drawer, damp paper towel'); pg.wait_for_timeout(100)
    print('7. storage note saved:', pg.evaluate("S.ingNotes['carrots|ea']"))
    pg.click('[data-a=ingIcons]'); pg.click('[data-a=setIngIcon][data-k=salad-greens]'); pg.wait_for_timeout(200)
    print('   changed icon → remembered:', pg.evaluate("S.ingIcons['carrots']"), '| tile now uses it:', pg.evaluate("document.querySelector('.tile[data-k=\"carrots|ea\"] img').src.includes('salad-greens')"))
    pg.evaluate("A.closeSheet()")
    # next purchase of carrots uses the 5-day default
    pg.evaluate("addFridge('Carrots','ea',2)"); print('8. next carrot purchase gets the new default life:', pg.evaluate("S.fridge.filter(f=>f.key==='carrots|ea').map(f=>f.life).join(',')"))
    # add-item sheet: typed printed date
    pg.evaluate("A.addItem()"); pg.wait_for_timeout(300)
    pg.fill('#ai-n','Sour cream'); exp6=pg.evaluate("addDays(todayIso(),6)"); pg.fill('#ai-e',exp6); pg.wait_for_timeout(500)
    print('9. add item with a printed expiry (+6d): Keeps auto-filled =', pg.input_value('#ai-l'), '| saved life =', pg.evaluate("S.fridge.find(f=>f.name==='Sour cream').life"), '| bought default = today:', pg.input_value('#ai-s')==T)
    pg.fill('#ai-l','9'); pg.wait_for_timeout(500); print('   then typed Keeps 9 → Expires =', pg.input_value('#ai-e')==pg.evaluate("addDays(todayIso(),9)"), '| life =', pg.evaluate("S.fridge.find(f=>f.name==='Sour cream').life"), '| default remembered:', pg.evaluate("S.life['sour cream|ea']"))
    pg.evaluate("A.closeSheet()")
    # cooked batch
    pg.evaluate("""()=>{ const m=S.modules.find(m=>m.name==='Carrots'); doCook(m.id); window.__m=m.id; ui.planTab='fridge'; render(); }"""); mid=pg.evaluate("window.__m")
    pg.click(f'.tile[data-m="{mid}"]'); pg.wait_for_timeout(350)
    print('    tile text for the cooked item:', pg.evaluate(f"document.querySelector('.tile[data-m=\"{mid}\"] small').innerText")) if False else None
    print('10. cooked batch sheet: first field label =', pg.evaluate("document.querySelector('.batch label').innerText.split('\\n')[0]"), '| keeps =', st()['keeps'])
    pg.fill('.batch [data-bf=life]','2'); pg.wait_for_timeout(150)
    print('    set keeps 2 → batch life:', pg.evaluate(f"S.cooked['{mid}'][0].life"), '| module default for next batch:', pg.evaluate(f"mod('{mid}').cooked"), '| urgency uses it:', pg.evaluate(f"JSON.stringify((urgency(mod('{mid}'),todayIso())||{{}}).left)"))
    pg.fill('#stor','Airtight tub, eat within 2 days'); pg.wait_for_timeout(100); print('    storage saved on the module:', pg.evaluate(f"mod('{mid}').storage"))
    pg.screenshot(path='/tmp/mealloop-shots/i3_cooked.png')
    print('errors', errs); b.close()
