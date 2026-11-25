#!/usr/bin/env python3
"""v2.3.1 — reprise du schéma d'une autre exploration dans la SEEG ouverte (bandeau « Le reprendre ici », menu des projets
   « → dans … » et « → nouveau projet ») et restauration depuis la corbeille d'un élément de l'exploration ouverte : la reprise
   ne doit plus être effacée par l'espace de travail (Chromium headless, données synthétiques).
   python3 tools/tests/test_implant_reprise_ui.py"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], locale='fr-FR', viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'Projet B') if d.type == 'prompt' else d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    # phase 1 avec un schéma proposé (12 électrodes sur le gabarit), SEEG 1 = ce schéma, SEEG 2 vide
    pg.evaluate("async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'REPRISE' }); S.addExploration(d, { kind: 'phase1' }); await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); }"); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const A = SV.app, S = SV.Store, d = A.dossier, ex = d.explorations[0];
      const sz = S.addSeizure(d, ex.id, { habitual: 'yes', datetime: '2026-03-12T10:00' });
      sz.events = [['aura_epigastric', 0], ['fear', 3], ['loss_of_awareness', 12], ['oroalimentary_automatisms', 15]].map(([s, t], k) => ({ id: k + 1, sign_id: s, t, dt: 1, dur: 8, side: '', topography: '', conf: 1, note: '' }));
      A.touch(); A.openSeizure(sz.id); }"""); pg.wait_for_timeout(1500)
    pg.evaluate("() => { const A = SV.app; A.setTab('electrodes'); document.getElementById('elMax').value = 12; A.proposeElectrodes(); A.persistWorkspace(); }"); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const A = SV.app, S = SV.Store, d = A.dossier, p1 = d.explorations[0];
      const s1 = S.addExploration(d, { kind: 'seeg', status: 'done' }); S.importImplantation(d, p1, s1, 'replace');
      S.addExploration(d, { kind: 'seeg', status: 'planned' }); A.touch(); }"""); pg.wait_for_timeout(500)
    n1 = pg.evaluate("SV.app.dossier.explorations[1].electrodes.length")
    check(n1 >= 6, f'SEEG 1 : schéma de {n1} électrodes')
    ex2 = "SV.app.dossier.explorations[2]"
    pg.evaluate(f"() => {{ const A = SV.app; A.openExploration({ex2}.id); A.setTab('electrodes'); }}"); pg.wait_for_timeout(1500)
    # 1. bandeau « Le reprendre ici »
    pg.click('.implant-head .ih-go'); pg.wait_for_timeout(1200)
    st = pg.evaluate(f"(() => {{ const A = SV.app; A.persistWorkspace(); return [{ex2}.electrodes.length, A.state.electrodes.length, !!({ex2}.implant && {ex2}.implant.source)]; }})()")
    check(st[0] == n1 and st[1] == n1 and st[2], f'« Le reprendre ici » : {n1} électrodes dans SEEG 2 et dans l’espace de travail, gardées après enregistrement de l’espace de travail {st}')
    # 2. menu des projets → nouveau projet d'après SEEG 1
    pg.evaluate(f"() => SV.app.projectMenu({ex2}, document.querySelector('.implant-head') || document.body)"); pg.wait_for_timeout(300)
    pg.locator('.ctx-menu .ctx-item', has_text='→ nouveau projet').first.click(); pg.wait_for_timeout(1200)
    st = pg.evaluate(f"(() => {{ const A = SV.app, ex = {ex2}; A.persistWorkspace(); return [ex.electrodes.length, A.state.electrodes.length, ex.project.name, (ex.projects || []).length]; }})()")
    check(st[0] == n1 and st[1] == n1 and st[2].startswith('D’après') and st[3] == 1, f'menu « → nouveau projet » : projet « D’après SEEG 1 » de {n1} électrodes, l’ancien projet gardé {st}')
    # 3. « → dans le projet ouvert » après l'avoir vidé
    pg.evaluate(f"() => {{ const A = SV.app; A.state.electrodes.slice().forEach(e => A.removeElectrode(e.id)); A.persistWorkspace(); }}"); pg.wait_for_timeout(300)
    check(pg.evaluate(f"{ex2}.electrodes.length") == 0, 'projet vidé (électrodes en corbeille)')
    pg.evaluate(f"() => SV.app.projectMenu({ex2}, document.querySelector('.implant-head') || document.body)"); pg.wait_for_timeout(300)
    pg.locator('.ctx-menu .ctx-item', has_text='→ dans').first.click(); pg.wait_for_timeout(1200)
    st = pg.evaluate(f"(() => {{ const A = SV.app; A.persistWorkspace(); return [{ex2}.electrodes.length, A.state.electrodes.length]; }})()")
    check(st == [n1, n1], f'menu « → dans le projet ouvert » : {n1} électrodes {st}')
    # 4. corbeille : restaurer une électrode retirée de l'exploration ouverte
    pg.evaluate(f"() => {{ const A = SV.app, e = A.state.electrodes[0]; A.removeElectrode(e.id); A.persistWorkspace(); }}"); pg.wait_for_timeout(300)
    tid = pg.evaluate("SV.app.dossier.trash.filter(t => t.kind === 'électrode').at(-1).id")
    pg.evaluate(f"async () => {{ await SV.app.trashRestore('{tid}'); }}"); pg.wait_for_timeout(1200)
    st = pg.evaluate(f"(() => {{ const A = SV.app; A.persistWorkspace(); return [{ex2}.electrodes.length, A.state.electrodes.length]; }})()")
    check(st == [n1, n1], f'corbeille : électrode restaurée dans l’exploration ouverte, gardée après enregistrement de l’espace de travail {st}')
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    ctx.close()
print('ÉCHECS : ' + ', '.join(fails) if fails else 'tout est ok'); sys.exit(1 if fails else 0)
