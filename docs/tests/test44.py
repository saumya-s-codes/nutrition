import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17322),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
SETUP="""()=>{ S.modules=[
  {id:'c',name:'Carrots',cat:'veg',icon:'carrots',makes:5,wk:5,per:2,cook:true,raw:21,cooked:4,ing:[{n:'Carrots',a:5,u:'ea'}],storage:'',method:''},
  {id:'o',name:'Omelet',cat:'meal',icon:'eggs',makes:2,wk:2,per:2,cook:true,raw:21,cooked:3,ing:[{n:'Eggs',a:4,u:'ea'},{n:'Cheese',a:2,u:'oz'}],storage:'',method:''}];
  A.newWeek(); S.week.picks=['c','o']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
  doCook('c'); S.settings.eatOpen={soon:true}; ui.tab='plan'; ui.planTab='fridge'; render(); }"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:17322/index.html'); pg.wait_for_timeout(400); pg.evaluate(SETUP); pg.wait_for_timeout(250)
    secs=lambda: pg.evaluate("(()=>{const out={}; let cur=''; for(const el of document.querySelectorAll('.fridge .sub, .fridge .tile')){ if(el.classList.contains('sub')){cur=el.childNodes[0].textContent.trim(); out[cur]=[];} else out[cur].push(el.querySelector('b').innerText+' ['+[...el.querySelectorAll('.fchip')].map(c=>c.innerText.replace(/\\n/g,' ')).join(' | ')+']'); } return out})()")
    s=secs()
    print('1. the fridge is a strict ledger:'); [print('   ',k,'→',v) for k,v in s.items()]
    print('   Carrots tiles (should be one per section, never merged):', [(k,sum(1 for t in v if t.startswith('Carrots'))) for k,v in s.items()])
    pg.screenshot(path='/tmp/mealloop-shots/w1_fridge.png')
    # expired ingredient
    pg.evaluate("S.fridge.find(f=>f.name==='Eggs').start=addDays(todayIso(),-30); S.fridge.find(f=>f.name==='Eggs').life=7; S.fridge.find(f=>f.name==='Cheese').life=1; render()")
    print('2. eggs 30 days old with a 7-day life →', [t for t in secs()['Ingredients'] if t.startswith('Eggs')])
    pg.click('.tile[data-k="eggs|ea"]'); pg.wait_for_timeout(350)
    print('   sheet buttons:', pg.evaluate("[...document.querySelectorAll('.pbody .btn')].map(b=>b.innerText.replace(/\\n/g,' ').trim()).filter(t=>/expired|out of/i.test(t)).join(' | ')"))
    pg.screenshot(path='/tmp/mealloop-shots/w2_sheet.png')
    d0=pg.evaluate("S.diary.length"); pg.click('[data-a=tossExpired]'); pg.wait_for_timeout(250)
    e=pg.evaluate("S.diary[S.diary.length-1]")
    print('   Throw out expired → eggs left:', pg.evaluate("stock('eggs|ea')"), '| diary:', {k:e.get(k) for k in ('name','qty','reason')}, '| entries added:', pg.evaluate("S.diary.length")-d0)
    # I'm out
    pg.click('.tile[data-k="cheese|oz"]'); pg.wait_for_timeout(300); d1=pg.evaluate("S.diary.length"); pg.click('[data-a=imOut]'); pg.wait_for_timeout(250)
    print("3. I'm out on cheese → cheese left:", pg.evaluate("stock('cheese|oz')"), '| diary entries added (waste log untouched):', pg.evaluate("S.diary.length")-d1, '| toast:', pg.inner_text('#toast')[:60].replace(chr(10),' '))
    # check fridge
    pg.evaluate("addFridge('Parsley','ea',1); S.fridge.find(f=>f.name==='Parsley').life=1; S.fridge.find(f=>f.name==='Parsley').start=addDays(todayIso(),-1); render()")
    print('4. orphan ingredient (not in any recipe) expiring → Ingredients header says:', pg.evaluate("document.querySelectorAll('.fridge .sub')[1].innerText.replace(/\\n/g,' ')"))
    pg.click('[data-a=fridgeCheck]'); pg.wait_for_timeout(300)
    print('   Check fridge lists:', pg.evaluate("[...document.querySelectorAll('.whyrow')].map(r=>r.querySelector('b').innerText).join(', ')"))
    pg.click('[data-a=outKey][data-k="parsley|ea"]'); pg.wait_for_timeout(250)
    print('   tapped Out on Parsley → still listed:', pg.evaluate("[...document.querySelectorAll('.whyrow b')].some(b=>b.innerText==='Parsley')"), '| diary untouched:', pg.evaluate("S.diary.every(d=>d.name!=='Parsley')"))
    pg.evaluate("A.closeSheet()")
    # eat the soonest-expiring batch first
    pg.evaluate("S.cooked={c:[{id:'late',n:2,date:addDays(todayIso(),-5),life:10},{id:'soon',n:2,date:addDays(todayIso(),-1),life:2}]}; save(); render()")
    pg.evaluate("doEat('c',todayIso(),'lunch')")
    print('5. two cooked batches (older one lasts longer). Ate one →', pg.evaluate("S.cooked.c.map(b=>b.id+':'+b.n).join(', ')"), '(the sooner-expiring batch should shrink first)')
    # edit date shortcut after cooking
    pg.evaluate("S.cooked={}; ui.tab='eat'; ui.date=todayIso(); S.settings.eatOpen={soon:false}; render()")
    pg.click('.mrow:has(.nameb:text-is("Carrots")) [data-a=cook]'); pg.wait_for_timeout(250)
    print('6. after Cooked, toast offers:', pg.evaluate("[...document.querySelectorAll('#toast button')].map(b=>b.innerText).join(' + ')"))
    pg.click('#toast [data-a=toastExtra]'); pg.wait_for_timeout(350)
    print('   Edit date opens:', pg.evaluate("ui.sheet.t+' / '+ui.sheet.kind"), '| first field label:', pg.evaluate("document.querySelector('.batch label').innerText.split('\\n')[0]"))
    pg.evaluate("A.closeSheet()")
    # diary wording
    pg.evaluate("ui.tab='diary'; render()")
    print('7. diary toss entries:', pg.evaluate("[...document.querySelectorAll('.entry.toss')].map(e=>e.innerText.replace(/\\n+/g,' · ')).join('  ||  ')")[:260])
    # settings
    pg.click('[data-a=settings]'); pg.wait_for_timeout(250)
    print('8. settings sections:', pg.evaluate("[...document.querySelectorAll('.acc b')].map(b=>b.innerText).join(' | ')"), '| old threshold inputs:', pg.evaluate("document.querySelectorAll('#st-y,#st-r,#st-w').length"))
    pg.click('.sheetx')
    # migration
    pg.evaluate("""()=>{ const old=JSON.parse(JSON.stringify(S)); old.v=7; old.settings.yellow=0.7; old.settings.red=1; old.settings.rawWindow=3; localStorage.setItem('mealloop.v1',JSON.stringify(old)); }"""); pg.reload(); pg.wait_for_timeout(400)
    print('9. upgraded from v7 → version', pg.evaluate('S.v'), '| leftover threshold settings:', pg.evaluate("['yellow','red','rawWindow'].filter(k=>k in S.settings).join(',')||'none'"))
    print('errors', errs); b.close()
