#!/usr/bin/env python3
"""v2.1.0 — données de recherche saisies dans le dossier (dist/EpiScope.html, Chromium headless, Playwright, stockage du
   navigateur ; données entièrement synthétiques) : histologie en vocabulaire fermé + texte libre, contacts dans la
   résection (clic sur les plots), comorbidités développementales à trois états, statut du parcours avec suggestion,
   transformation non linéaire vers MNI 2009b (adulte, et chaîne NIHPD chez l’enfant) et régions des plots figées (anatomie synthétique injectée).
   python3 tools/tests/test_research_fields_ui.py      (après python3 tools/build.py)"""
import os
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1440, 'height': 950}, locale='fr-FR'); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.add_init_script("localStorage.setItem('sv_manual_hint','1')")
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'RF' }); d.subject = { site: 'HFAR', n: 9, label: 'HFAR0009' };
      const ex = S.addExploration(d, { kind: 'seeg', start: '2025-02-01', status: 'done' });
      ex.electrodes.push({ id: 'eA', name: 'A’', hemi: 'L', real: { contacts: [[-30, 10, 5], [-33.5, 10, 5], [-37, 10, 5]], tip: [-30, 10, 5], entry: [-37, 10, 5] } }, { id: 'eB', name: 'B', hemi: 'L', real: { contacts: [[-25, -10, 0], [-28.5, -10, 0]] } });
      const p = S.addProcedure(d, { type: 'resection', side: 'L', date: '2025-06-01' }); window._pid = p.id;
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); }""")
    pg.wait_for_timeout(1200)
    # 1. intervention : histologie fermée + texte libre, contacts dans la résection
    pg.evaluate("SV.app.go({ stage: 'proc:' + window._pid })"); pg.wait_for_timeout(1200)
    check(pg.evaluate("!!document.querySelector('.histo-add') && !document.querySelector('#vpCard [data-f=histology]')"), 'histologie : liste fermée à la place du champ libre seul')
    pg.select_option('.histo-add', 'hs1'); pg.wait_for_timeout(200); pg.select_option('.histo-add', 'fcd3a'); pg.wait_for_timeout(200)
    pg.fill('.histo-t', 'gliose CA4 marquée'); pg.wait_for_timeout(200)
    r = pg.evaluate("(() => { const p = SV.Store.byId(SV.app.dossier.procedures, window._pid); return { c: p.histologyCodes, t: p.histology, chips: document.querySelectorAll('.histo-c').length }; })()")
    check(r['c'] == ['hs1', 'fcd3a'] and r['t'] == 'gliose CA4 marquée' and r['chips'] == 2, f'histologie : double pathologie et texte libre {r}')
    pg.click('.histo-c[data-k=hs1] .x'); pg.wait_for_timeout(200)
    check(pg.evaluate("SV.Store.byId(SV.app.dossier.procedures, window._pid).histologyCodes") == ['fcd3a'], 'histologie : retrait d’un diagnostic')
    n = pg.evaluate("document.querySelectorAll('.rs-c').length")
    check(n == 5, f'contacts : un bouton par plot réel ({n})')
    pg.click('.rs-c[data-e=eA][data-k="1"]'); pg.wait_for_timeout(150); pg.click('.rs-c[data-e=eA][data-k="2"]'); pg.wait_for_timeout(150)
    r = pg.evaluate("(() => { const p = SV.Store.byId(SV.app.dossier.procedures, window._pid); return { c: p.resection.contacts, head: document.querySelector('.resect .card-h').textContent, on: document.querySelectorAll('.rs-c.on').length }; })()")
    check(len(r['c']) == 2 and all(c['how'] == 'manual' for c in r['c']) and "A'1–2" in r['head'] and r['on'] == 2, f'contacts déclarés à la main, résumé « A\'1–2 » ({r["head"]})')
    check(pg.evaluate("!!document.querySelector('.rs-cav') && /Anatomie du patient/.test(document.querySelector('.rs-cav').textContent)"), 'cavité : prérequis indiqué (anatomie à calculer)')
    # v2.4.0 : contacts en bordure de la cavité signalés (pointillé, liste « à vérifier »), jamais ajoutés seuls
    r = pg.evaluate("""(() => { const A = SV.app, p = SV.Store.byId(A.dossier.procedures, window._pid);
      p.resection.cavity = { imagingId: null, postopId: null, postDate: '2025-07-01', thr: 0.3, minMl: 1, keep: [1], volumeMl: 12.5, nContacts: 0, tolMm: 1.5, margin: [{ e: 'eA', k: 3, mm: 2.4 }, { e: 'eA', k: 1, mm: 3 }], marginMm: 5, regions: [] };
      A.renderResection(); const b = document.querySelector('.rs-c[data-e=eA][data-k="3"]'), b1 = document.querySelector('.rs-c[data-e=eA][data-k="1"]');
      return { dashed: b.classList.contains('margin'), title: b.title, onNotDashed: !b1.classList.contains('margin'), txt: document.querySelector('.rs-cav').textContent, n: p.resection.contacts.length }; })()""")
    check(r['dashed'] and '2,4 mm' in r['title'] and r['onNotDashed'] and 'en bordure' in r['txt'] and r['n'] == 2, f'contacts en bordure : pointillé, distance au survol, liste à vérifier, rien d’ajouté {r["txt"][-80:]}')
    pg.screenshot(path=os.path.join(OUT, 'research_fields_proc.png'), full_page=True)
    # 2. développement (v3.4.0) : plus de pastilles de comorbidités dans « Développement actuel », texte libre seul ; le champ reste dans le dossier
    pg.evaluate("SV.app.go({ stage: 'dossier', view: 'developpement' })"); pg.wait_for_timeout(1000)
    r = pg.evaluate("() => ({ chips: document.querySelectorAll('.devc-b').length, txt: !!document.querySelector('[data-c=devNotes]'), scale: document.body.innerText.includes('seule une échelle standardisée'), dev: SV.app.dossier.patient.dev })")
    check(r['chips'] == 0 and r['txt'] and not r['scale'] and isinstance(r['dev'], dict), f'développement actuel : texte libre, sans pastilles ni phrase sur les échelles {r}')
    # 3. synthèse : statut du parcours (suggestion, motif)
    pg.evaluate("SV.app.go({ stage: 'dossier', view: 'synthese' })"); pg.wait_for_timeout(1000)
    sug = pg.evaluate("(document.querySelector('.pw-sug') || {}).textContent || ''")
    check('opéré' in sug and 'résection' in sug, f'suggestion tirée du dossier : {sug.strip()[:80]}')
    pg.click('.pw-apply'); pg.wait_for_timeout(300)
    check(pg.evaluate("SV.app.dossier.pathway.status") == 'operated' and not pg.evaluate("!!document.querySelector('.pw-sug')"), 'suggestion appliquée explicitement')
    pg.select_option('.pw-s', 'declined'); pg.wait_for_timeout(300); pg.select_option('.pw-r', 'eloquent'); pg.wait_for_timeout(300)
    r = pg.evaluate("({ w: SV.app.dossier.pathway, st: SV.Store.stage(SV.app.dossier).text })")
    check(r['w']['status'] == 'declined' and r['w']['reason'] == 'eloquent' and r['st'].startswith('récusé'), f'récusé avec motif ; étape de la liste des patients : {r["st"]}')
    check(pg.evaluate("[...document.querySelectorAll('#dxPatient [data-f]')].every(e => e.dataset.f !== 'status')"), 'champs du parcours hors liaison automatique du patient')
    # 4. MNI non linéaire et régions figées, sur une anatomie synthétique (repères déformés, parcellation constante)
    r = pg.evaluate("""async () => { const A = SV.app, d = A.dossier, tpl = A.anatAsset('template_anat'), lm = {};
      const fwd = q => [0.85 * q[0] + 2 + 6 * Math.sin(q[1] / 25), 0.82 * q[1] - 5 + 5 * Math.sin(q[2] / 22), 0.8 * q[2] + 8 + 4 * Math.cos(q[0] / 30)];
      for (const l in tpl.centroids) { const c = tpl.centroids[l]; lm[l] = [...fwd(c), c[3]]; }
      d.anatomy = { status: 'done', date: '2025-02-10T10:00:00Z', toTemplate: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], landmarks: lm, segmentation: { age: 25 } };
      A.patientAnat = { labelWorld: { labelAt: (x, y, z) => x < -32 ? 200 : 12 } };
      const R = await A.mniCompute({ quiet: true }); const ex = d.explorations[0]; const n = A.stampRegions(ex);
      return { m: R && R.method, loo: R && R.loo, n, reg: ex.electrodes[0].real.regions.map(r => r.name), st: SV.Store.contactRegionStatus(d, ex.electrodes[0]), mni: SV.Store.mniMethod(d) }; }""")
    check(r['m'] == 'tps' and r['loo']['tps'] < r['loo']['affine'] and r['mni'] == 'tps', f'transformation non linéaire retenue {r["loo"]}')
    # v3.0.0 : enfant de 9,5 ans → chaîne par le gabarit NIHPD intégré de l'âge le plus proche (7–11 ans)
    r2 = pg.evaluate("""async () => { const A = SV.app, d = A.dossier; d.anatomy.segmentation.age = 9.5; const R = await A.mniCompute({ quiet: true });
      const p = SV.Store.toMNI(d, [10, 20, 30]); d.anatomy.segmentation.age = 25; await A.mniCompute({ quiet: true });
      return { m: R && R.method, t: R && R.template && R.template.name, b: R && R.template && R.template.builtin, target: R && R.target, ok: p.every(isFinite) }; }""")
    check(r2['m'] == 'chain' and r2['b'] and 'NIHPD 7–11' in (r2['t'] or '') and r2['target'] == 'MNI152NLin2009bAsym' and r2['ok'], f'enfant : chaîne par le gabarit NIHPD de l’âge {r2}')
    check(r['n'] == 2 and r['reg'][0] != 'white-matter' and r['reg'][2] == 'white-matter' and r['st'] == 'ok', f'régions figées par plot {r["reg"]}')
    check(not errs, f'aucune erreur de page {errs[:3]}')
    b.close()
print('OK données de recherche (interface)' if not fails else 'ÉCHEC : ' + ' ; '.join(fails)); raise SystemExit(1 if fails else 0)
