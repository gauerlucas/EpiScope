#!/usr/bin/env python3
"""v1.1.0 — vidéo calée sur l'heure des tracés (dist/EpiScope.html, Chromium headless, Playwright, stockage du navigateur) :
   début lu dans le nom du fichier, panneau vidéo de la visionneuse qui suit le curseur, point de synchronisation, vidéo
   trouvée pour une crise. Données synthétiques : EDF+D de make_synth_edfd.py (début 23:30:00), vidéo de mire générée par
   ffmpeg (test sauté sans ffmpeg).   python3 tools/tests/test_video_sync.py      (après python3 tools/build.py)"""
import os, sys, shutil, subprocess, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if not shutil.which('ffmpeg'): print('ffmpeg absent : test sauté'); raise SystemExit(0)
TMP = tempfile.mkdtemp(prefix='episcope-vid-')
EDF, VID = os.path.join(TMP, 'trace.edf'), os.path.join(TMP, 'cam1_20210602_233543.webm')
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'tests', 'make_synth_edfd.py'), EDF], check=True, capture_output=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5:duration=300', '-c:v', 'libvpx', '-b:v', '100k', VID], check=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { await SV.Library.saveSettings({ site: 'TST' }); const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'VID' }), ex = S.addExploration(d, { kind: 'seeg', start: '2021-06-01' });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true, ctx: { explorationId: ex.id } });
      for (const id of ['fe', 'fv']) { const i = document.createElement('input'); i.type = 'file'; i.id = id; document.body.appendChild(i); } }""")
    pg.wait_for_timeout(1000); pg.set_input_files('#fe', EDF); pg.set_input_files('#fv', VID)
    pg.evaluate("async () => { await SV.app.ieegImport([...document.getElementById('fe').files]); await SV.app.galleryAdd([...document.getElementById('fv').files], { explorationId: SV.app.ieegEx().id }); await SV.app.flushSave(); }")
    pg.wait_for_timeout(2500)
    st = pg.evaluate("(() => { const d = SV.app.dossier, g = d.gallery.find(x => /^video/.test(x.mime)); return { L: d.syncLinks.map(l => [l.start, l.method, l.galleryId === g.id]), name: g.name, json: JSON.stringify(d).includes('cam1_') , dur: Math.round(g.duration) } })()")
    check(st['L'] == [['2021-06-02T23:35:43.000', 'filename', True]], f"début de la vidéo lu dans le nom du fichier : {st['L']}")
    check(st['name'] == 'Vidéo du 02/06/2021 23:35:43' and not st['json'], f"nom d’origine non conservé : {st['name']}")
    pg.evaluate("async () => { await SV.app.ieegOpen(SV.app.ieegEx().recordings[0]); }"); pg.wait_for_timeout(2500)
    check(pg.evaluate("!!document.querySelector('.ie-vidb')"), 'bouton « ▶ Vidéo » dans la visionneuse')
    pg.click('.ie-vidb'); pg.wait_for_timeout(800)
    pg.evaluate("(() => { const V = SV.app._iev; V.cursor = 421; V.t = 400; SV.app.ieegDraw(); })()"); pg.wait_for_timeout(2500)
    v1 = pg.evaluate("(() => { const vd = SV.app._iev.vid; return [Math.round(vd.el.currentTime * 10) / 10, vd.box.querySelector('.ie-vid-st').textContent] })()")
    check(abs(v1[0] - 77) < 0.6 and '23:37:00' in v1[1], f'curseur à 23:37:00 → vidéo à 1:17 : {v1}')
    pg.evaluate("(() => { const V = SV.app._iev; V.cursor = 100; V.t = 90; SV.app.ieegDraw(); })()"); pg.wait_for_timeout(1500)
    v2 = pg.evaluate("SV.app._iev.vid.box.querySelector('.ie-vid-st').textContent")
    check('Pas de vidéo calée à 23:31:40' in v2, f'avant le début de la vidéo : {v2!r}')
    pg.screenshot(path=os.path.join(ROOT, 'tools', 'tests', 'out', 'video_panel.png'))
    # point de synchronisation : l'évènement est à 1:19 dans la vidéo et à 23:37:00 dans le tracé → début 23:35:41
    pg.evaluate("(() => { const V = SV.app._iev; V.cursor = 421; V.t = 400; SV.app.ieegDraw(); })()"); pg.wait_for_timeout(1500)
    pg.evaluate("(() => { const el = SV.app._iev.vid.el; el.pause(); el.currentTime = 79; })()"); pg.wait_for_timeout(600)
    pg.click('.ie-vid-pt'); pg.wait_for_selector('.vs-ok', timeout=5000)
    check('1:19' in pg.evaluate("document.querySelector('.vs-pts').textContent"), 'fenêtre « Heure de la vidéo » avec le point proposé')
    pg.click('.vs-ok'); pg.wait_for_timeout(1200)
    L2 = pg.evaluate("SV.app.dossier.syncLinks.map(l => [l.start, l.method, l.points.length, l.recordingId === SV.app._iev.rec.id])")
    check(L2 == [['2021-06-02T23:35:41.000', 'points', 1, True]], f'vidéo recalée par le point : {L2}')
    # crise dont le début est couvert par la vidéo : vidéo et t = 0 trouvés sans réglage
    sz = pg.evaluate("""async () => { const A = SV.app, S = SV.Store, d = A.dossier, ex = A.ieegEx(), z = S.addSeizure(d, ex.id, { label: 'Crise V' }), r = ex.recordings[0];
      r.seizureId = z.id; r.marks = Object.assign(r.marks || {}, { onset: 451, end: 480 }); A.touch(); await A.flushSave(); const g = A.videoLinked(z); return [z.onsetAbs, g && /^video/.test(g.mime), z.video && z.video.t0] }""")
    check(sz[0] == '2021-06-02T23:37:30.000' and sz[1] and abs(sz[2] - 109) < 0.2, f'crise : vidéo et instant trouvés ({sz})')
    pg.click('.ie-vid-x'); pg.wait_for_timeout(300)
    check(pg.evaluate("!document.querySelector('.ie-vid')"), 'panneau vidéo fermé')
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    b.close()
shutil.rmtree(TMP, ignore_errors=True)
print('\n' + ('OK vidéo calée (interface)' if not fails else f'{len(fails)} échec(s)'))
raise SystemExit(1 if fails else 0)
