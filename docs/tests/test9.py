import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17307),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17307/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ A.newWeek(); S.week.picks=['m1','m13','m61']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
      addEntry(todayIso(),'lunch','m1'); addEntry(todayIso(),'lunch','m13'); doCook('m1'); doEat('m1',todayIso(),'lunch'); save(); ui.tab='eat'; ui.date=todayIso(); render(); }""")
    pg.screenshot(path='/tmp/mealloop-shots/x1_eat.png')
    pg.click('.erow .nameb >> nth=0'); pg.wait_for_timeout(600); pg.screenshot(path='/tmp/mealloop-shots/x2_info.png')
    print('info sheet open from Eat:', pg.evaluate("ui.sheet && ui.sheet.t"), '| buttons:', pg.evaluate("[...document.querySelectorAll('.panel .sheetbtns .btn')].map(b=>b.innerText.trim()).join(' / ')"))
    pg.click('.sheetx')
    pg.evaluate("ui.sheet=null; renderSheet()")
    # diary with three ratings
    pg.click('[data-a=tab][data-t=diary]'); pg.wait_for_timeout(300)
    pg.click('.rate.rating [data-r="4"]'); pg.click('.rate.energy [data-r="5"]'); pg.click('.rate.filling [data-r="2"]'); pg.wait_for_timeout(200)
    print('ratings saved:', pg.evaluate("JSON.stringify(S.diary.filter(d=>d.type==='eat').map(d=>[d.name,d.rating,d.energy,d.filling]))"))
    pg.screenshot(path='/tmp/mealloop-shots/x3_diary.png')
    pg.evaluate("A.info({m:'m1'})"); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/mealloop-shots/x4_info_avgs.png')
    print('avgs block present:', 'How it' in pg.inner_text('.panel'))
    pg.evaluate("ui.sheet=null; ui.tab='plan'; ui.planTab='week'; ui.picking=true; ui.step=1; render()"); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/x5_picker.png')
    print('errors',errs); b.close()
from PIL import Image
ims=[Image.open(f'/tmp/mealloop-shots/{n}.png').resize((390,844)) for n in ['x1_eat','x2_info','x3_diary','x4_info_avgs','x5_picker']]
W=Image.new('RGB',(390*5,844)); [W.paste(im,(i*390,0)) for i,im in enumerate(ims)]; W.save('/tmp/mealloop-shots/m7.png')
