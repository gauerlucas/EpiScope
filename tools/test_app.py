#!/usr/bin/env python3
"""Test de fumée de dist/EpiScope.html dans Chromium headless (Playwright).
   python tools/test_app.py [--canvas]   (--canvas force le repli Canvas 2D sans WebGL)"""
import os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
canvas = '--canvas' in sys.argv

CASE = [
    {'sign_id': 'aura_epigastric', 't': 0, 'dt': 1, 'dur': 10, 'side': '', 'conf': 1},
    {'sign_id': 'fear', 't': 2, 'dt': 1, 'dur': 8, 'side': '', 'conf': 0.75},
    {'sign_id': 'loss_of_awareness', 't': 14, 'dt': 2, 'dur': 40, 'side': '', 'conf': 1},
    {'sign_id': 'oroalimentary_automatisms', 't': 16, 'dt': 2, 'dur': 30, 'side': '', 'conf': 1},
    {'sign_id': 'dystonic_posturing', 't': 22, 'dt': 2, 'dur': 20, 'side': 'R', 'topography': 'UL', 'conf': 1},
    {'sign_id': 'head_version', 't': 40, 'dt': 2, 'dur': 6, 'side': 'R', 'conf': 1},
    {'sign_id': 'fbtcs', 't': 45, 'dt': 2, 'dur': 60, 'side': '', 'conf': 1},
    {'sign_id': 'postictal_aphasia', 't': 110, 'dt': 5, 'dur': 120, 'side': '', 'conf': 1},
]

with sync_playwright() as p:
    args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    if canvas: args = ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2']
    b = p.chromium.launch(headless=True, args=args)
    pg = b.new_page(viewport={'width': 1600, 'height': 950})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html'))
    pg.wait_for_timeout(2500)
    pg.on('dialog', lambda d: d.accept('TEST-APP') if d.type == 'prompt' else d.accept())
    pg.click('#pNew'); pg.wait_for_timeout(1200)   # v3 : pas de crise sans patient
    pg.evaluate("()=>SV.app.newSeizureIn(SV.app.dossier.explorations[0])"); pg.wait_for_timeout(1200)
    print('mode viewer:', pg.evaluate('SV.app.viewer.mode'))
    pg.screenshot(path=os.path.join(OUT, 'empty.png'))
    # charge un cas par l'API
    pg.evaluate('''(evs)=>{ evs.forEach((e,i)=>SV.app.state.events.push(Object.assign({id:i+1,note:''},e))); SV.app.nextId=evs.length+1; document.getElementById('caseName').value='Cas test TLE G'; SV.app.changed(); }''', CASE)
    pg.wait_for_timeout(800)
    res = pg.evaluate('''()=>{ const r=SV.app.result; return {T:r.T, ms:SV.app._lastComputeMs, pL:r.lateralization.pL, cands:r.candidates.slice(0,5).map(c=>[SV.app.atlas.label(c.region), +c.score.toFixed(2), c.silent]), relays:r.relays.length, targets:r.targets.length}; }''')
    print(json.dumps(res, ensure_ascii=False))
    for t, name in [(1, 't01'), (18, 't18'), (24, 't24'), (46, 't46')]:
        pg.evaluate(f'SV.app.setTime({t})'); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, f'{name}.png'))
    pg.evaluate("SV.app.viewer.setView('medL', false)"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(OUT, 'medL.png'))
    pg.evaluate("SV.app.viewer.setCellConfig(0, {glass: true}); SV.app.viewer.setBorders && SV.app.viewer.setBorders(true)"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(OUT, 'glass.png'))
    pg.evaluate("SV.app.viewer.setCellConfig(0, {glass: false}); SV.app.viewer.setLayout('mosaic'); SV.app.setTab('onset')"); pg.wait_for_timeout(400); pg.screenshot(path=os.path.join(OUT, 'onset.png'))
    pg.evaluate("SV.app.viewer.setLayout('single'); SV.app.viewer.setView('latL', false)")
    pg.evaluate("SV.app.setTab('targets')"); pg.wait_for_timeout(200); pg.screenshot(path=os.path.join(OUT, 'targets.png'))
    # saisie clavier : taper un signe + Entrée
    pg.evaluate("SV.app.setMode('manual'); document.getElementById('manT').value=30;")
    pg.click('#search'); pg.keyboard.type('cloni'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    print('events after typing:', pg.evaluate('SV.app.state.events.length'), 'topo popover:', pg.evaluate("!!document.querySelector('.topo-pop')"))
    pg.screenshot(path=os.path.join(OUT, 'typed.png'))
    # éditeur de base
    pg.evaluate("SV.app.openDB()"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(OUT, 'db.png'))
    pg.evaluate("document.getElementById('dbDialog').hidden=true; SV.app.present(true)"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(OUT, 'present.png'))
    pg.evaluate("SV.app.present(false)")
    # rapport
    with pg.expect_download(timeout=120000) as dl:
        pg.evaluate("SV.app.report()")
    d = dl.value; path = os.path.join(OUT, 'rapport.html'); d.save_as(path); print('rapport', os.path.getsize(path), 'bytes')
    # export app avec base
    with pg.expect_download(timeout=20000) as dl2:
        pg.evaluate("SV.app.exportAppWithDb()")
    d2 = dl2.value; p2 = os.path.join(OUT, 'exported_app.html'); d2.save_as(p2); print('app exportée', os.path.getsize(p2), 'bytes')
    print('console errors:', errs[:10] if errs else 'none')
    b.close()
