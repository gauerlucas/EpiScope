#!/usr/bin/env python3
"""v1.0.1 — navigation dans un tracé long (Chromium headless, Playwright) : EDF+D synthétique (make_synth_edfd.py),
   heure réelle sur l'axe et au curseur, bouton « Disposition », frise (crises, coupure, zoom, tout le tracé).
   python3 tools/tests/test_viewer_nav.py      (après python3 tools/build.py) ; captures dans tools/tests/out/"""
import os, sys, subprocess, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
EDF = os.path.join(tempfile.mkdtemp(prefix='episcope-nav-'), 'nuit.edf')
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'tests', 'make_synth_edfd.py'), EDF], check=True, capture_output=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1600, 'height': 950}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'NAV' }), ex = S.addExploration(d, { kind: 'seeg', start: '2021-06-01' });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true, ctx: { explorationId: ex.id } });
      const i = document.createElement('input'); i.type = 'file'; i.id = 'navfile'; document.body.appendChild(i); }""")
    pg.wait_for_timeout(1500); pg.set_input_files('#navfile', EDF)
    pg.evaluate("async () => { await SV.app.ieegImport([...document.getElementById('navfile').files]); await SV.app.ieegOpen(SV.app.ieegEx().recordings[0]); }"); pg.wait_for_timeout(3000)
    pg.evaluate("() => { const a = SV.app, V = a._iev, r = V.rec; a.ieegNewSeizureAt(r, 421); r.marks.end = 471; a.ieegAfterSwitch(V); a.ieegNewSeizureAt(r, 751); r.marks.end = 801; a.ieegAfterSwitch(V); a.ieegDraw(); }"); pg.wait_for_timeout(1200)
    check(pg.evaluate("!!document.querySelector('.ie-top .ie-lay') && !document.querySelector('.ie-top .ie-lay').hidden"), 'bouton « Disposition » dans la barre')
    cur = pg.evaluate("document.querySelector('.ie-cur').textContent")
    check(cur.startswith('23:57:24') and '02/06/2021' in cur, f'curseur en heure réelle : {cur}')
    spans = pg.evaluate("SV.app.ieegSeizureSpans().map(z => [z.label, z.on, z.active])")
    check(spans == [['Crise 1', 421, False], ['Crise 2', 751, True]], f'crises du tracé : {spans}')
    pg.screenshot(path=os.path.join(OUT, 'nav_full.png'))
    box = pg.evaluate("(() => { const r = document.querySelector('.ie-ovw canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    pg.mouse.move(box[0] + box[2] * 0.55, box[1] + box[3] * 0.5)
    for _ in range(4): pg.mouse.wheel(0, -200); pg.wait_for_timeout(150)
    pg.wait_for_timeout(400)
    check(pg.evaluate("!!SV.app._iev.ovR") and not pg.evaluate("document.querySelector('.ie-ovall').hidden"), 'molette : frise zoomée, bouton « tout le tracé » visible')
    pg.screenshot(path=os.path.join(OUT, 'nav_zoom.png'))
    pg.click('.ie-ovall'); pg.wait_for_timeout(300)
    check(pg.evaluate("SV.app._iev.ovR") is None, '« tout le tracé » : frise complète')
    h0 = pg.evaluate("SV.app._iev.ovHits[0]")
    pg.mouse.click(box[0] + (h0['x0'] + h0['x1']) / 2, box[1] + box[3] * 0.6); pg.wait_for_timeout(300)
    t = pg.evaluate("SV.app._iev.t"); check(400 <= t <= 421, f'clic sur la bande de la crise 1 : page au début de la crise (t = {t})')
    pg.evaluate("() => [...document.querySelectorAll('.ie-clk button')].find(x => x.dataset.c === 'rel').click()"); pg.wait_for_timeout(200)
    check(pg.evaluate("SV.app._iev.clk") is False, 'bascule vers le temps du tracé')
    pg.evaluate("() => [...document.querySelectorAll('.ie-clk button')].find(x => x.dataset.c === 'abs').click()")
    # v1.1.0 : références SEEG
    pg.click('.ie-mont [data-m=car]'); pg.wait_for_timeout(400)
    check(pg.evaluate("SV.app._iev.montage === 'car' && SV.app._iev.D.filter(d => d.seeg).length === 19"), 'moyenne commune : 19 voies')
    pg.click('.ie-mont [data-m=ref]'); pg.wait_for_timeout(500)
    n = pg.evaluate("document.querySelectorAll('.ie-refp [data-n]').length"); check(n >= 19, f'sélecteur du plot de référence ({n} boutons)')
    pg.evaluate("() => [...document.querySelectorAll('.ie-refp [data-n]')].find(b => b.dataset.n.replace(/'/g, '’') === 'B’10').click()"); pg.wait_for_timeout(400)
    st = pg.evaluate("(() => { const q = s => String(s).replace(/'/g, '’'); return { m: q(SV.app._iev.montage), n: SV.app._iev.D.filter(d => d.seeg).length, lab: q(document.querySelector('.ie-mont [data-m=ref]').textContent), view: q(SV.app._iev.rec.view.montage) }; })()")
    check(st == {'m': 'ref:B’10', 'n': 18, 'lab': 'Réf. B’10 ▾', 'view': 'ref:B’10'}, f'plot de référence B’10 : {st}')
    pg.screenshot(path=os.path.join(OUT, 'nav_ref.png'))
    pg.click('.ie-mont [data-m=bipolar]'); pg.wait_for_timeout(300)
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'aucune erreur dans la console' + ('' if not errs else ' : ' + ' | '.join(errs[:5])))
    b.close()
print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'tout est ok'}")
sys.exit(1 if fails else 0)
