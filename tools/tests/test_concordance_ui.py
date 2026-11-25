#!/usr/bin/env python3
"""v2.2.0 — tableau de concordance du staff alimenté par la phase 1 et les bilans (Chromium headless, Playwright, données
   synthétiques) : carte 10-20 « Début des crises » et pointes → colonnes EEG, bilan IRM localisé → colonne IRM ; champ
   « Localisation » d'un bilan (suggestion d'après le texte, ajout, retrait).   python3 tools/tests/test_concordance_ui.py"""
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
    pg = b.new_page(viewport={'width': 1500, 'height': 920}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'CONC' });
      const ex = S.addExploration(d, { kind: 'phase1', start: '2025-01-10' });
      S.addSeizure(d, ex.id, { datetime: '2025-01-11', label: 'Crise 1', events: [{ id: 1, sign_id: 'aura_epigastric', t: 0, dt: 1, dur: 10, conf: 1 }] });
      ex.eeg.map = { ictal: { C4: 2, T4: 1 }, spikesW: { F4: 1 }, slowS: { O1: 2 } };
      S.addExam(d, { kind: 'mri', date: '2025-01-05', conclusion: 'Hypersignal T2 AMS droite', side: 'R', loc: ['premotor'] });
      S.addExam(d, { kind: 'pet', date: '2025-01-06', conclusion: 'Hypométabolisme temporal droit', side: 'R' });
      S.addExam(d, { kind: 'mri', date: '2025-03-01', conclusion: 'IRM après le staff', side: 'L', loc: ['occipital'] });
      const m = S.addMeeting(d, { date: '2025-02-01', kind: 'post_phase1', explorationId: ex.id });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); SV.app.go({ stage: 'meet:' + m.id, view: 'preparer' }); }""")
    pg.wait_for_timeout(3000)
    T = pg.evaluate("""(() => { const out = {}; for (const td of document.querySelectorAll('#stConc td.cc')) { const v = td.textContent.trim(); if (v) out[td.dataset.row + '|' + td.dataset.col] = [v, td.title]; } return out; })()""")
    check(T.get('central:R|eeg_ic', [''])[0] == '++', f"EEG critique : central droit ++ (C4 ++) {T.get('central:R|eeg_ic')}")
    check(T.get('lateral_temporal:R|eeg_ic', [''])[0] == '+' and 'Début des crises'.lower() in T['lateral_temporal:R|eeg_ic'][1].lower(), 'EEG critique : temporal latéral droit + (T4), détail au survol')
    check(T.get('prefrontal_lateral:R|eeg_ii', [''])[0] == '+', 'EEG intercritique : pointes F4 → préfrontal latéral droit')
    check(T.get('occipital:L|eeg_ii', [''])[0] == '+', 'ondes lentes seules : « en faveur » au plus')
    check(T.get('premotor:R|mri', [''])[0] == '++' and 'AMS' in T['premotor:R|mri'][1], f"IRM localisée : prémoteur / AMS droit ++ {T.get('premotor:R|mri')}")
    pt = T.get('lateral_temporal:R|pet', ['', ''])
    check(pt[0] == '+' and 'à confirmer' in pt[1] and pg.evaluate("SV.app.dossier.exams.find(e => e.kind === 'pet').loc.length") == 0, f'TEP sans localisation confirmée : région lue dans le texte, + signalé, bilan inchangé {pt}')
    check('occipital:L|mri' not in T, 'bilan daté après le staff : ignoré')
    check(pg.evaluate("[...document.querySelectorAll('#stConc th')].filter(th => th.querySelector('i')).length") >= 6, 'colonnes EEG, TEP, neuropsychologie marquées « auto »')
    pg.screenshot(path=os.path.join(OUT, 'concordance.png'))
    # champ « Localisation » du bilan TEP : suggestion d'après le texte, puis ajout
    pg.evaluate("""() => { const d = SV.app.dossier, x = d.exams.find(e => e.kind === 'pet'); SV.app.ui.exOpen = x.id; SV.app.go({ stage: 'dossier', view: 'bilans' }); }"""); pg.wait_for_timeout(1500)
    sg = pg.evaluate("[...document.querySelectorAll('.exam.k-pet .ex-loc [data-add]')].map(b => b.dataset.add)")
    check(sg == ['lateral_temporal'], f'suggestion d’après le texte : {sg}')
    pg.click('.exam.k-pet .ex-loc [data-add=lateral_temporal]'); pg.wait_for_timeout(500)
    check(pg.evaluate("SV.app.dossier.exams.find(e => e.kind === 'pet').loc") == ['lateral_temporal'], 'localisation ajoutée au bilan')
    check(pg.evaluate("document.querySelectorAll('.exam.k-pet .ex-loc .chip.on').length") == 1, 'puce affichée')
    pg.click('.exam.k-pet .ex-loc [data-a=locadd]'); pg.wait_for_timeout(300)
    pg.click('.ctx-menu >> text=temporal mésial'); pg.wait_for_timeout(400)
    loc = pg.evaluate("SV.app.dossier.exams.find(e => e.kind === 'pet').loc")
    check(loc == ['mesial_temporal', 'lateral_temporal'], f'région ajoutée par le menu, ordre des systèmes : {loc}')
    pg.click('.exam.k-pet .ex-loc [data-rm=mesial_temporal]'); pg.wait_for_timeout(400)
    check(pg.evaluate("SV.app.dossier.exams.find(e => e.kind === 'pet').loc") == ['lateral_temporal'], 'région retirée')
    m = pg.evaluate("SV.app.dossier.meetings[0].id")
    pg.evaluate(f"SV.app.go({{ stage: 'meet:{m}', view: 'preparer' }})"); pg.wait_for_timeout(2000)
    v = pg.evaluate("(() => { const td = document.querySelector('#stConc td.cc[data-row=\"lateral_temporal:R\"][data-col=pet]'); return td ? td.textContent.trim() : null; })()")
    t2 = pg.evaluate("(() => { const td = document.querySelector('#stConc td.cc[data-row=\"lateral_temporal:R\"][data-col=pet]'); return td ? td.title : ''; })()")
    check(v == '+' and 'à confirmer' not in t2, f'TEP localisée : temporal latéral droit + dans le tableau, sans réserve ({v!r})')
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    b.close()
print('ÉCHECS : ' + ', '.join(fails) if fails else 'tout est ok'); sys.exit(1 if fails else 0)
