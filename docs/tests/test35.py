import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17317),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
from PIL import Image
SEED="""()=>{ const cooks=S.modules.filter(m=>m.cook).slice(0,5).map(m=>m.id); const raws=S.modules.filter(m=>!m.cook&&m.cat==='fruit').slice(0,2).map(m=>m.id);
  const ids=[...cooks,...raws]; A.newWeek(); S.week.picks=ids; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
  doCook(cooks[0]); doCook(cooks[1]); S.cooked[cooks[1]][0].date=addDays(todayIso(),-3);
  addEntry(todayIso(),'lunch',cooks[0]); addEntry(todayIso(),'lunch',raws[0]); addEntry(todayIso(),'dinner',cooks[2]);
  S.settings.eatOpen={soon:true}; save(); ui.tab='eat'; ui.date=todayIso(); render(); }"""
# left edge of each button column, per row, for each list
MEASURE="""()=>{ const out={};
  const grab=(sel,label)=>{ out[label]=[...document.querySelectorAll(sel)].map(r=>[...r.querySelectorAll('.ebtns > *')].map(e=>Math.round(e.getBoundingClientRect().left))); };
  grab('.mrow','module list'); grab('.soon .erow','use soon'); grab('.slot .erow','slots'); return out; }"""
with sync_playwright() as p:
    b=p.chromium.launch(); shots=[]
    for w in (390,375,360):
        ctx=b.new_context(viewport={'width':w,'height':844},device_scale_factor=2); pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('http://127.0.0.1:17317/index.html'); pg.wait_for_timeout(400); pg.evaluate(SEED); pg.wait_for_timeout(200)
        m=pg.evaluate(MEASURE)
        verdict={}
        for label,rows in m.items():
            cols=max(len(r) for r in rows) if rows else 0
            ok=all(len({r[i] for r in rows if len(r)>i})==1 for i in range(cols)) if rows else True
            verdict[label]=f"{len(rows)} rows, {cols} columns, columns line up: {ok}"
        print(f'viewport {w}:', ' | '.join(f'{k}: {v}' for k,v in verdict.items()), '| overflow:', pg.evaluate("document.documentElement.scrollWidth>innerWidth"), '| errors', errs)
        if w==390:
            pg.evaluate("document.querySelector('#view').scrollTop=620"); pg.wait_for_timeout(150); pg.screenshot(path='/tmp/mealloop-shots/g_mod.png')
            pg.evaluate("document.querySelector('#view').scrollTop=0"); pg.wait_for_timeout(100); pg.evaluate("document.querySelector('#view').scrollTop=250"); pg.wait_for_timeout(100); pg.screenshot(path='/tmp/mealloop-shots/g_top.png')
        ctx.close()
    b.close()
a=Image.open('/tmp/mealloop-shots/g_top.png'); c=Image.open('/tmp/mealloop-shots/g_mod.png')
W=Image.new('RGB',(a.width*2,a.height)); W.paste(a,(0,0)); W.paste(c,(a.width,0)); W.resize((780,844)).save('/tmp/mealloop-shots/g_pair.png')
