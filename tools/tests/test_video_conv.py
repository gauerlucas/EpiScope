#!/usr/bin/env python3
"""Galerie (v4.5) : vidéos légères.
  - AVI (MPEG-4 part 2, illisible par le navigateur) : conversion par ffmpeg.wasm, téléchargé une fois (ici servi depuis
    une copie locale de @ffmpeg/core 0.12.10 à la place de cdn.jsdelivr.net), gardé dans IndexedDB ;
  - WebM Full HD (lisible, lourd) : version légère dans le navigateur (WebCodecs, ≤ 1280 × 720, son conservé).
    python tools/tests/test_video_conv.py [dossier_ffmpeg_core_umd] [AVI] [WEBM]
Vidéos de test synthétiques (ffmpeg lavfi : testsrc2 + sinusoïde)."""
import os, sys, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
A = sys.argv[1:]
CORE = A[0] if A else '/tmp/claude-0/npmx/core/package/dist/umd'
AVI = A[1] if len(A) > 1 else '/tmp/claude-0/vid/test_mpeg4.avi'
WEBM = A[2] if len(A) > 2 else '/tmp/claude-0/vid/test_fullhd.webm'
errs, fails, fetched = [], [], []
def check(cond, msg):
    print(('ok   ' if cond else 'ÉCHEC ') + msg, flush=True)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'], viewport={'width': 1400, 'height': 900})
    def serve(route):
        name = route.request.url.split('/')[-1]; fetched.append(name)
        route.fulfill(path=os.path.join(CORE, name), headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/wasm' if name.endswith('.wasm') else 'text/javascript'})
    ctx.route('https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/*', serve)
    pg = ctx.new_page(); pg.set_default_timeout(60_000)
    pg.on('dialog', lambda d: d.accept(d.default_value or 'VIDEO-TEST') if d.type == 'prompt' else d.accept())
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(800)
    pg.evaluate("()=>SV.app.go({stage:'dossier', view:'galerie'})"); pg.wait_for_timeout(600)
    # AVI : illisible → ffmpeg
    pg.set_input_files('.gal-drop input[type=file]', AVI)
    pg.wait_for_function("()=>(SV.app.dossier.gallery||[]).length>=1", timeout=900_000); pg.wait_for_timeout(1500)
    g = pg.evaluate("()=>{ const g=SV.app.dossier.gallery[0]; return { mime: g.mime, file: g.file, conv: g.converted, w: g.w, h: g.h, dur: g.duration, size: g.size } }")
    print('  AVI →', g, '| téléchargés :', fetched)
    check(g['conv'] and g['conv']['tool'] == 'ffmpeg' and g['mime'].startswith('video/') and g['w'] == 1280 and g['dur'] > 7, 'AVI : convertie par ffmpeg en vidéo lisible (≤ 1280 px)')
    check('ffmpeg-core.wasm' in fetched and 'ffmpeg-core.js' in fetched, 'ffmpeg chargé à la demande (copie locale servie à la place du CDN)')
    ok = pg.evaluate("async ()=>{ const g=SV.app.dossier.gallery[0], u=await SV.app.galleryMediaURL(g), v=document.createElement('video'); v.muted=true; v.src=u; return await new Promise(r=>{ v.onloadedmetadata=()=>r(v.videoWidth); v.onerror=()=>r(-1); setTimeout(()=>r(-2), 8000); }) }")
    check(ok == 1280, f'vidéo convertie lue par le navigateur ({ok})')
    check(pg.evaluate("()=>SV.VideoConv.ffCached()"), 'ffmpeg gardé dans ce navigateur (IndexedDB)')
    if pg.locator('.gal-modal .close').count(): pg.locator('.gal-modal .close').click(); pg.wait_for_timeout(300)
    # WebM Full HD : version légère native
    n0 = len(fetched)
    pg.set_input_files('.gal-drop input[type=file]', WEBM)
    pg.wait_for_function("()=>(SV.app.dossier.gallery||[]).length>=2", timeout=900_000); pg.wait_for_timeout(1500)
    g2 = pg.evaluate("()=>{ const g=SV.app.dossier.gallery[1]; return { mime: g.mime, conv: g.converted, w: g.w, h: g.h, dur: g.duration, size: g.size } }")
    print('  WebM Full HD →', g2)
    check(g2['conv'] and g2['conv']['tool'] == 'navigateur' and g2['w'] == 1280 and g2['h'] == 720 and g2['size'] < g2['conv']['size0'] and g2['dur'] > 5, 'WebM Full HD : version légère dans le navigateur (1280 × 720, plus petite)')
    au = pg.evaluate("async ()=>{ const g=SV.app.dossier.gallery[1], b=await SV.app.galleryBlob(g); try { const ac=new OfflineAudioContext(1,1,48000), buf=await ac.decodeAudioData(await b.arrayBuffer()); let m=0; const x=buf.getChannelData(0); for (let i=0;i<x.length;i+=97) m=Math.max(m,Math.abs(x[i])); return [buf.duration, m] } catch(e) { return String(e) } }")
    check(isinstance(au, list) and au[0] > 5 and au[1] > 0.05, f'son conservé ({au})')
    check(len(fetched) == n0, 'version légère native : rien téléchargé')
    ctx.close()
real = [e for e in errs if 'favicon' not in e and 'ERR_FILE_NOT_FOUND' not in e]
print('erreurs console :', real[:8])
if real: fails.append('erreurs console')
print('\n%d échec(s)' % len(fails) + (' : ' + ' ; '.join(fails) if fails else ''))
sys.exit(1 if fails else 0)
