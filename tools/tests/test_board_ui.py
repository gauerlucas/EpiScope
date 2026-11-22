#!/usr/bin/env python3
"""v2.0.0 — tableau des crises (Chromium headless, Playwright, données synthétiques) : pastilles d'état, crises annotées
   dans un tracé sans fiche (créer, rattacher), tracés qui se recouvrent, « Reprendre la sémiologie de… ».
   python3 tools/tests/test_board_ui.py   (après tools/build.py)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1500, 'height': 950}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'BOARD' }), ex = S.addExploration(d, { kind: 'phase1', start: '2025-02-10', end: '2025-02-12' });
      const rec = (id, title, h, start, events) => ({ id, title, kind: 'inter', duration: h * 3600, nch: 21, fs: 256, nSamples: 1, channels: [], files: {}, marks: { user: [] }, events, clock: { start, blocks: [{ t0: 0, t1: h * 3600, r0: 0 }] } });
      ex.recordings = [rec('RN', 'EEG · nuit 1', 8, '2025-02-10T22:00:00', [{ onset: 1800, label: 'sz start' }, { onset: 14400, label: 'seizure onset' }, { onset: 21600, label: 'EEG sz' }]),
        rec('RS', 'EEG · segment', 0.33, '2025-02-11T01:50:00', [{ onset: 600, label: 'sz start' }])];
      const z1 = S.addSeizure(d, ex.id, { datetime: '2025-02-10T22:30', habitual: 'yes' }); z1.events = [{ id: 1, sign_id: 'aura_epigastric', t: 0, dt: 1, dur: 3, conf: 1 }, { id: 2, sign_id: 'oral_automatisms', t: 10, dt: 1, dur: 20, conf: 1 }];
      ex.recordings[0].seizureId = z1.id; ex.recordings[0].marks.onset = 1800;
      S.addSeizure(d, ex.id, { datetime: '2025-02-11T04:01' });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); SV.app.go({ stage: 'ex:' + ex.id, view: 'crises' }); }""")
    pg.wait_for_timeout(1500)
    st = pg.evaluate("() => [...document.querySelectorAll('#vsSessions tr[data-id]')].map(tr => [...tr.querySelectorAll('.szs')].map(s => s.className.replace('szs', '').trim() + ':' + s.textContent))")
    check(len(st) == 2 and st[0][0] == 'ok:sémiologie : 2' and st[0][2] == 'ok:tracé' and st[1][0] == 'no:à décrire', f'pastilles d’état {st}')
    ann = pg.evaluate("() => [...document.querySelectorAll('#vsAnn tr[data-i]')].map(tr => tr.textContent.replace(/\\s+/g, ' ').trim())")
    check(len(ann) == 3 and 'sans fiche' in ann[0] and 'en double' in ann[1] and 'même heure' in ann[2], f'crises annotées listées {ann}')
    check(pg.evaluate("!!document.querySelector('#vsAnn .hint') && /recouvrent/.test(document.querySelector('#vsAnn .hint').textContent)"), 'tracés qui se recouvrent signalés')
    pg.screenshot(path=os.path.join(OUT, 'board.png'), full_page=True)
    pg.click('#vsAnn [data-a=link]'); pg.wait_for_timeout(600)
    pg.click('#vsAnn [data-a=new]'); pg.wait_for_timeout(800)
    r = pg.evaluate("""() => { const d = SV.app.dossier, ex = d.explorations[0], S = SV.Store, A = S.annotatedSeizures(d, ex, SV.IEEG.seizureEvents);
      return { n: S.seizuresOfExploration(d, ex.id).length, states: A.map(x => x.state), rows: document.querySelectorAll('#vsAnn tr[data-i]').length, labels: S.seizuresOfExploration(d, ex.id).map(z => z.label + '@' + String(z.datetime).slice(11, 16)) }; }""")
    check(r['n'] == 3 and r['states'] == ['linked', 'linked', 'duplicate', 'linked'] and r['rows'] == 1, f'fiche créée et crise rattachée {r}')
    check(r['labels'] == ['Crise 1@22:30', 'Crise 2@02:00', 'Crise 3@04:01'], f'numérotation chronologique {r["labels"]}')
    sl = pg.evaluate("""() => { const d = SV.app.dossier, r = d.exploration ? null : d.explorations[0].recordings[0], S = SV.Store, L = S.seizuresOfExploration(d, d.explorations[0].id);
      const on = id => r.sz[id] && r.sz[id].marks.onset; const j = JSON.parse(JSON.stringify(r)); SV.app.ieegSetSeizure(r, L[0].id); const a = r.marks.onset; SV.app.ieegSetSeizure(r, L[2].id); const b = r.marks.onset;
      return { n: Object.keys(r.sz).length, a, b, o0: on(L[0].id), top: 'marks' in j || 'bySz' in j }; }""")
    check(sl['n'] == 3 and sl['a'] == 1800 and sl['b'] == 21600 and not sl['top'], f'un rangement par crise dans le tracé, changement de crise sans permutation {sl}')
    # reprendre la sémiologie de la crise 1 dans la crise 2
    rows = pg.query_selector_all('#vsSessions tr[data-id]'); target = rows[1]
    target.query_selector('[data-a=more]').click(); pg.wait_for_timeout(300)
    pg.click('text=Reprendre la sémiologie de…'); pg.wait_for_timeout(300)
    pg.click('text=Crise 1 · 2025-02-10 22:30'); pg.wait_for_timeout(600)
    cp = pg.evaluate("() => { const S = SV.Store, d = SV.app.dossier, L = S.seizuresOfExploration(d, d.explorations[0].id); return { n: L[1].events.length, from: L[1].semioFrom === L[0].id }; }")
    check(cp['n'] == 2 and cp['from'], f'sémiologie reprise {cp}')
    # vue d'ensemble : rappel
    pg.evaluate("() => SV.app.go({ stage: 'ex:' + SV.app.dossier.explorations[0].id, view: 'apercu' })"); pg.wait_for_timeout(800)
    check(pg.evaluate("/recouvrent/.test((document.querySelector('#ovTl .note') || {}).textContent || '')"), 'vue d’ensemble : recouvrement signalé')
    # rien ne se perd : une stimulation retirée part dans la corbeille du dossier
    tr = pg.evaluate("""() => { const A = SV.app, d = A.dossier, ex = d.explorations[0]; ex.stims = [{ id: 's1', elec: 'A', c1: 1, c2: 2, mode: 'LF', mA: 1 }]; A.ctx = { explorationId: ex.id, seizureId: null }; A.state.stims = ex.stims;
      const n0 = d.trash.length; A.wsDiscard('stims', ex.stims[0], 'stimulation', 'A1-2'); const e = d.trash[d.trash.length - 1]; const ok = SV.Store.restoreTrash(d, e.id).ok; return { n: d.trash.length - n0, left: ex.stims.length, ok }; }""")
    check(tr['left'] == 1 and tr['ok'], f'stimulation retirée → corbeille → restaurée {tr}')
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    b.close()
print('\nOK tableau des crises (interface)' if not fails else f'\n{len(fails)} échec(s)')
sys.exit(1 if fails else 0)
