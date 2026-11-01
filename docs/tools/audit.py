from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',9962),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:9962/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=['m1','m13']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); doCook('m1'); addEntry(todayIso(),'lunch','m1'); doEat('m1',todayIso(),'lunch'); S.diary.push({id:'dd',ts:Date.now(),type:'eat',mid:'m1',name:'Carrots',icon:'carrots',servings:1,slot:'lunch',rating:0,notes:'',src:[]}); save(); }""")
    def btns(): return pg.evaluate("[...document.querySelectorAll('.panel button, .panel label.btn')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean)")
    steps=[('Edit module (existing card)',"ui.tab='plan'; A.editMod({m:'m1'})"),('New module (Add module tile)',"A.closeSheet(); A.editMod({m:'new:veg'})"),('Card back (info) from Plan',"A.closeSheet(); A.info({m:'m1'})"),('Log food',"A.closeSheet(); ui.tab='diary'; render(); A.logFood()"),('Diary notes',"A.closeSheet(); A.thoughts({i:'dd'})"),('Add to fridge',"A.closeSheet(); ui.tab='plan'; ui.planTab='fridge'; render(); A.addItem()"),('Throw out ingredient',"A.closeSheet(); A.tossIng({k:'carrots|ea'})"),('Throw out cooked',"A.closeSheet(); A.tossCooked({m:'m1'})"),('Cooked/eaten tally',"A.closeSheet(); ui.tab='eat'; render(); A.tally({m:'m1'})"),('Plan a serving (star)',"A.closeSheet(); A.assign({m:'m1'})"),('Add to a slot',"A.closeSheet(); A.addTo({s:'lunch'})"),('Settings (all open)',"A.closeSheet(); A.settings(); for (const k of ['plan','warn','data']) A.toggleAcc({k})"),('New week confirm',"A.closeSheet(); A.startWeek()")]
    for name,js in steps:
        pg.evaluate(js); pg.wait_for_timeout(200); print(f'{name}:', btns())
    pg.evaluate("A.closeSheet()")
    pg.evaluate("ui.tab='plan'; ui.planTab='cart'; render()"); print('Cart page buttons:', pg.evaluate("[...document.querySelectorAll('#view button')].map(b=>b.innerText.trim()).filter(Boolean).join(' | ')"))
    pg.evaluate("ui.planTab='week'; ui.picking=true; ui.step=0; render()"); print('Picker bar:', pg.evaluate("[...document.querySelectorAll('.pickbar button')].map(b=>b.innerText.trim()).join(' | ')"))
    print('errors', errs); b.close()
