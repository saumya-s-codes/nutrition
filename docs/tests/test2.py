import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17303),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,service_workers='allow'); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('http://127.0.0.1:17303/index.html'); pg.wait_for_timeout(800)
    # seed a week + fridge via UI actions
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=['m1','m13','m15','m65']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); save(); render(); }""")
    # honey test: need 2 tbsp, have 1 bottle -> cart empty
    r=pg.evaluate("""()=>{ S.week.picks.push('m35'); const before=cartLines().length; addFridge('Honey','tbsp',24); addFridge('Hot sauce','tsp',48); const after=cartLines().filter(l=>l.name==='Honey').length; return [before,after]; }""")
    print('honey lines (before add, after):', r)
    pg.evaluate("ui.tab='plan'; ui.planTab='fridge'; render()"); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/t1_fridge.png')
    pg.click('.tile[data-k="carrots|ea"]'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/t2_toss.png')
    pg.click('[data-a=tossInc][data-d="1"]'); pg.click('[data-a=doToss]'); pg.wait_for_timeout(300)
    print('carrots after toss 2:', pg.evaluate("stock('carrots|ea')"), 'diary', pg.evaluate("S.diary[0].type+' '+S.diary[0].servings"))
    # edit sheet
    pg.evaluate("ui.tab='plan'; ui.planTab='week'; render()"); pg.click('[data-a=info][data-m=m1]'); pg.click('[data-a=editMod][data-m=m1]'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/t3_edit.png')
    pg.evaluate('A.closeSheet()'); pg.wait_for_timeout(200)
    # eat: future day projection
    pg.evaluate("ui.tab='eat'; render()"); pg.evaluate("doCook('m1'); save(); render()")
    pg.evaluate("addEntry(addDays(todayIso(),1),'dinner','m1'); addEntry(addDays(todayIso(),1),'dinner','m1'); save(); render()")
    pg.click('.day:nth-child(n) >> nth=0') if False else None
    pg.evaluate("ui.date=addDays(todayIso(),3); render()"); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/t4_future.png')
    print('urgency day+3:', pg.evaluate("JSON.stringify(urgency(mod('m1'), addDays(todayIso(),3)))"), ' day+1:', pg.evaluate("JSON.stringify(urgency(mod('m1'), addDays(todayIso(),1)))"))
    # diary thoughts
    pg.evaluate("ui.date=todayIso(); doEat('m1',todayIso(),'dinner'); save(); ui.tab='diary'; render()")
    pg.click('[data-a=thoughts]'); pg.fill('#notes','Delicious! Keep.'); pg.evaluate('A.closeSheet()'); pg.click('[data-f=rating][data-r="4"]'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/t5_diary.png')
    # settings
    pg.click('[data-a=settings]'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/t6_settings.png')
    # offline check
    pg.evaluate("navigator.serviceWorker.ready.then(()=>1)"); pg.wait_for_timeout(500)
    print('sw controlling:', pg.evaluate("!!navigator.serviceWorker.controller"))
    print('errors', errs); b.close()
