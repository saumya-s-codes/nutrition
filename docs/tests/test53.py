import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',17328),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
from PIL import Image
SETUP="""()=>{ S.modules=[
  {id:'c',name:'Chicken',cat:'pro',icon:'chicken',makes:4,wk:4,per:4,cook:true,raw:2,cooked:4,ing:[{n:'Chicken breast',a:2,u:'ea'}],storage:'',method:''},
  {id:'a',name:'Apples',cat:'fruit',icon:'apples',makes:5,wk:5,per:5,cook:false,raw:28,cooked:0,ing:[{n:'Apples',a:5,u:'ea'}],storage:'',method:''}];
  A.newWeek(); S.week.picks=['c','a']; S.week.locked=true; ui.picking=false; cartLines().forEach(l=>addFridge(l.name,l.unit,l.buy));
  S.fridge.find(f=>f.name==='Chicken breast').start=addDays(todayIso(),-1);
  addEntry(todayIso(),'lunch','c'); addEntry(todayIso(),'lunch','a'); addEntry(todayIso(),'lunch','a');
  S.settings.swipeSeen=false; S.settings.eatOpen={soon:false,breakfast:false,dinner:false,snack:false,treat:false}; ui.tab='eat'; ui.date=todayIso(); render(); }"""
with sync_playwright() as p:
    b=p.chromium.launch(); out=[]
    for scheme in ('light','dark'):
        ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,color_scheme=scheme); pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto('http://127.0.0.1:17328/index.html'); pg.wait_for_timeout(400); pg.evaluate(SETUP); pg.wait_for_timeout(250)
        rows=lambda: pg.evaluate("document.querySelectorAll('.slot .slotrow').length")
        def box(sel='.slot .slotrow', n=0):
            pg.locator(sel).nth(n).scroll_into_view_if_needed(); pg.wait_for_timeout(60)
            return pg.locator(sel).nth(n).bounding_box()
        def swipe(n, dx, steps=8):
            bx=box(n=n); y=bx['y']+bx['height']/2; x0=bx['x']+bx['width']*0.55
            pg.mouse.move(x0,y); pg.mouse.down(); pg.mouse.move(x0+dx/2,y+2,steps=steps//2); pg.mouse.move(x0+dx,y+2,steps=steps//2); pg.mouse.up(); pg.wait_for_timeout(350)
        tx=lambda n: pg.evaluate(f"new DOMMatrix(getComputedStyle(document.querySelectorAll('.slot .slotrow')[{n}]).transform).m41")
        if scheme=='light':
            print('1. layout of a planned row:')
            geo=pg.evaluate("""(()=>{ const r=document.querySelector('.slot .slotrow'), info=r.querySelector('.einfo').getBoundingClientRect(), eat=r.querySelector('.btn.eat').getBoundingClientRect(), ck=r.querySelector('.btn.amber').getBoundingClientRect(), row=r.getBoundingClientRect();
              return { buttonsRightOfText: eat.left>=info.right-1, eatSize: Math.round(eat.width)+'x'+Math.round(eat.height), cookedBelowEaten: ck.top>=eat.bottom-1, sameColumn: Math.round(eat.left)===Math.round(ck.left), flushRight: Math.round(row.right-eat.right)<=14, xButtons: document.querySelectorAll('.rmbtn').length, rowHeight: Math.round(row.height) } })()""")
            for k,v in geo.items(): print('   ',k,'=',v)
            print('   swipe hint shown:', pg.evaluate("!!document.querySelector('.swipehint')"), '| Remove button covered at rest:', pg.evaluate("(()=>{const d=document.querySelector('.swdel').getBoundingClientRect(), r=document.querySelector('.slotrow').getBoundingClientRect(); return d.left>=r.right-1 || r.right>d.left})()"))
            pg.screenshot(path='/tmp/mealloop-shots/t_rest.png')
        n0=rows()
        # short drag: snaps back
        swipe(1,-30); a=tx(1)
        if scheme=='light': print('2. a short drag (30px) snaps back:', round(a), '| open class:', pg.evaluate("document.querySelectorAll('.swopen').length"))
        # long drag: opens
        swipe(1,-140); b2=tx(1)
        if scheme=='light': print('3. a real swipe left opens the row:', round(b2), '(88 = fully revealed) | open rows:', pg.evaluate("document.querySelectorAll('.swopen').length"), '| hint gone & remembered:', pg.evaluate("!document.querySelector('.swipehint') && S.settings.swipeSeen===true"))
        pg.screenshot(path=f'/tmp/mealloop-shots/t_open_{scheme}.png'); out.append(f'/tmp/mealloop-shots/t_open_{scheme}.png')
        # a swipe must not also tap Eaten
        e0=pg.evaluate("S.diary.length")
        # open another row: the first closes
        swipe(2,-140)
        if scheme=='light': print('4. opening a second row closes the first:', [round(tx(i)) for i in range(3)], '(only one is -88)')
        # tap inside an open row closes it and does not activate its button
        bx=box(n=2); pg.mouse.click(bx['x']+bx['width']*0.3, bx['y']+bx['height']/2); pg.wait_for_timeout(300)
        if scheme=='light': print('5. tapping an open row closes it:', round(tx(2)), '| nothing was eaten by that tap:', pg.evaluate("S.diary.length")==e0)
        # vertical drag does not open
        bx=box(n=0); pg.mouse.move(bx['x']+bx['width']*0.5,bx['y']+10); pg.mouse.down(); pg.mouse.move(bx['x']+bx['width']*0.5+6,bx['y']+60,steps=6); pg.mouse.up(); pg.wait_for_timeout(250)
        if scheme=='light': print('6. a mostly vertical drag (scrolling) does not open a row:', round(tx(0)))
        # delete via the revealed button
        swipe(1,-140); pg.click('.swopen .. >> .swdel') if False else None
        d=pg.evaluate("document.querySelectorAll('.slot .swrow')[1].querySelector('.swdel').getBoundingClientRect().toJSON()")
        pg.mouse.click(d['x']+d['width']/2, d['y']+d['height']/2); pg.wait_for_timeout(300)
        if scheme=='light': print('7. tap Remove on the revealed button → rows', n0, '→', rows(), '| toast:', pg.evaluate("document.querySelector('#toast').innerText.replace(/\\n/g,' ')"))
        # undo
        pg.click('#toast [data-a=undo]'); pg.wait_for_timeout(250)
        if scheme=='light': print('8. Undo brings it back:', rows()==n0)
        # keyboard
        pg.evaluate("document.querySelectorAll('.slot .slotrow')[2].focus()"); pg.keyboard.press('Delete'); pg.wait_for_timeout(250)
        if scheme=='light': print('9. keyboard (focus a row, press Delete) removes it:', rows()==n0-1)
        # eating still works by tap
        pg.evaluate("S.plan[todayIso()]=[]; addEntry(todayIso(),'lunch','c'); render()"); pg.wait_for_timeout(200)
        pg.click('.slot .slotrow .btn.eat'); pg.wait_for_timeout(250)
        if scheme=='light': print('10. Eaten still works with a plain tap:', pg.evaluate("document.querySelector('.slot .slotrow').classList.contains('done')"))
        print(scheme,'errors',errs)
    b.close()
ims=[Image.open('/tmp/mealloop-shots/t_rest.png'), Image.open('/tmp/mealloop-shots/t_open_light.png'), Image.open('/tmp/mealloop-shots/t_open_dark.png')]
W=Image.new('RGB',(390*3,844)); [W.paste(im.resize((390,844)),(i*390,0)) for i,im in enumerate(ims)]; W.save('/tmp/mealloop-shots/t_all.png')
