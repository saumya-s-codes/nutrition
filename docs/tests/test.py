import os as _os; _os.makedirs('/tmp/mealloop-shots', exist_ok=True)
ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
from playwright.sync_api import sync_playwright
import http.server, threading, socketserver, os, json
os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=(setattr(socketserver.TCPServer,'allow_reuse_address',True) or socketserver.TCPServer(('127.0.0.1',17301),Q)); threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
    pg=ctx.new_page()
    errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:17301/index.html'); pg.wait_for_timeout(500)
    pg.screenshot(path='/tmp/mealloop-shots/s1_eat_empty.png')
    pg.click('[data-a=tab][data-t=plan]'); pg.click('[data-a=startWeek]'); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/mealloop-shots/s2_picker.png')
    # pick a few modules
    for name in ['m1','m2','m3']: pg.click(f'.card[data-m={name}]')
    pg.click('[data-a=nextStep]'); pg.click('.card[data-m=m13]'); pg.click('.card[data-m=m15]')
    pg.wait_for_timeout(200); pg.screenshot(path='/tmp/mealloop-shots/s3_picked.png')
    # info card
    pg.click('.card[data-m=m13] .cinfo'); pg.wait_for_timeout(600); pg.screenshot(path='/tmp/mealloop-shots/s4_info.png')
    pg.click('[data-a=closeSheet].backdrop',position={'x':200,'y':40})
    while pg.query_selector('[data-a=nextStep]'): pg.click('[data-a=nextStep]')
    pg.wait_for_timeout(200); pg.screenshot(path='/tmp/mealloop-shots/s5_review.png')
    pg.click('[data-a=lockWeek]'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/s6_summary.png')
    pg.click('[data-a=planTab][data-t=cart]'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/mealloop-shots/s7_cart.png')
    pg.click('[data-a=cartAddAll]'); pg.wait_for_timeout(300)
    pg.click('[data-a=planTab][data-t=fridge]'); pg.wait_for_timeout(200); pg.screenshot(path='/tmp/mealloop-shots/s8_fridge.png')
    print('cart after add-all:', pg.evaluate('cartLines().length'))
    pg.click('[data-a=tab][data-t=eat]'); pg.wait_for_timeout(200)
    pg.click('[data-a=autoPlan]'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/s9_eat_planned.png',full_page=False)
    # cook carrots
    pg.evaluate("doCook('m1'); save(); render()")
    pg.evaluate("S.cooked['m1'][0].date=addDays(todayIso(),-2); save(); render()")
    pg.wait_for_timeout(200); pg.screenshot(path='/tmp/mealloop-shots/s10_urgent.png')
    pg.click('.erow [data-a=eat][data-m=m1]') if pg.query_selector('.erow [data-a=eat][data-m=m1]') else None
    pg.wait_for_timeout(300)
    pg.click('[data-a=tab][data-t=diary]'); pg.wait_for_timeout(300); pg.screenshot(path='/tmp/mealloop-shots/s11_diary.png')
    print('fridge carrots', pg.evaluate("stock('carrots|ea')"), 'cooked', pg.evaluate("cookedTotal('m1')"), 'diary', pg.evaluate('S.diary.length'))
    print('errors:',errs)
    b.close()
