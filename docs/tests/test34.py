import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17316),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17316/index.html'); pg.wait_for_timeout(400)
    pg.evaluate("""()=>{ const ids=S.modules.filter(m=>m.cook).slice(0,8).map(m=>m.id); A.newWeek(); S.week.picks=ids; S.week.locked=true; ui.picking=false;
      cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy)); ids.forEach(id=>{ doCook(id); S.cooked[id][0].date=addDays(todayIso(),-3); });
      addEntry(todayIso(),'breakfast',ids[0]); addEntry(todayIso(),'lunch',ids[1]); addEntry(todayIso(),'lunch',ids[2]); addEntry(todayIso(),'dinner',ids[3]); doEat(ids[1],todayIso(),'lunch');
      S.settings.eatOpen=undefined; save(); ui.tab='eat'; ui.date=todayIso(); render(); window.__ids=ids; }""")
    n=pg.evaluate("[...document.querySelectorAll('.soon .erow')].length")
    flagged=pg.evaluate("activeMods().filter(m=>urgency(m,todayIso())).length")
    print('foods flagged:', flagged, '| rows of them shown by default:', n, '(Use soon starts folded)')
    print('Use soon header:', pg.inner_text('.soon .foldhead').replace('\n',' | '))
    tops=pg.evaluate("[...document.querySelectorAll('.slot')].map(s=>[s.querySelector('b').innerText, Math.round(s.getBoundingClientRect().top)])")
    print('slot headers on screen without scrolling (screen is 844 tall):', ', '.join(f'{n} at y={t}' for n,t in tops), '| all visible:', all(t<800 for _,t in tops[:3]))
    pg.screenshot(path='/tmp/mealloop-shots/f1.png')
    pg.click('.soon .foldhead'); pg.wait_for_timeout(150)
    print('open Use soon → rows:', pg.evaluate("document.querySelectorAll('.soon .erow').length"), '| header says:', pg.inner_text('.soon .ftitle small'), '| aria-expanded:', pg.get_attribute('.soon .foldhead','aria-expanded'))
    pg.screenshot(path='/tmp/mealloop-shots/f2.png')
    pg.click('.soon .foldhead'); pg.wait_for_timeout(100)
    # fold lunch
    print('slot summaries:', pg.evaluate("[...document.querySelectorAll('.slot')].map(s=>s.querySelector('b').innerText+': '+s.querySelector('.ftitle small').innerText).join(' | ')"))
    pg.click('.foldhead[data-k=lunch]'); pg.wait_for_timeout(120)
    print('fold Lunch → its rows:', pg.evaluate("document.querySelectorAll('.foldhead[data-k=lunch]')[0].closest('.slot').querySelectorAll('.erow').length"), '| summary still:', pg.evaluate("document.querySelector('.foldhead[data-k=lunch] small').innerText"))
    # + button on a folded slot still works
    pg.click('.foldhead[data-k=lunch] ~ [data-a=addTo]'); pg.wait_for_timeout(150); print('+ on folded Lunch opens the add sheet:', pg.evaluate("ui.sheet && ui.sheet.t+':'+ui.sheet.slot")); pg.click('.sheetx'); pg.wait_for_timeout(100)
    # persistence
    pg.reload(); pg.wait_for_timeout(400)
    print('after reload → Use soon folded:', pg.evaluate("!eatOpen('soon')"), '| Lunch folded:', pg.evaluate("!eatOpen('lunch')"), '| Breakfast open:', pg.evaluate("eatOpen('breakfast')"))
    print('errors', errs); b.close()
from PIL import Image
a=Image.open('/tmp/mealloop-shots/f1.png'); c=Image.open('/tmp/mealloop-shots/f2.png')
W=Image.new('RGB',(a.width*2,a.height)); W.paste(a,(0,0)); W.paste(c,(a.width,0)); W.resize((780,844)).save('/tmp/mealloop-shots/f_pair.png')
