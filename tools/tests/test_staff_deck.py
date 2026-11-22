#!/usr/bin/env python3
"""v1.1.0 — diaporama du staff page par page (Chromium headless, Playwright, données synthétiques) : carte « Diapositives »
   de Préparer (masquer, monter, page libre), présentation (page masquée absente, page libre présente, notes M,
   renommage), instantané enregistré puis consulté.   python3 tools/tests/test_staff_deck.py   (après tools/build.py)"""
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
    pg.on('dialog', lambda d: d.accept('Titre modifié') if d.type == 'prompt' else d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'STAFF' }); d.patient.clin.epilepsyHistory = 'Crises depuis l’âge de 4 ans.';
      const ex = S.addExploration(d, { kind: 'phase1', start: '2025-01-10' }), s = ex;
      S.addSeizure(d, ex.id, { datetime: '2025-01-11', label: 'Crise 1', events: [{ id: 1, sign_id: 'aura_epigastric', t: 0, dt: 1, dur: 10, conf: 1 }] });
      S.addExam(d, { kind: 'neuropsy', date: '2025-01-05', title: 'Bilan synthétique', conclusion: 'Pas de difficulté franche.' });
      const m = S.addMeeting(d, { date: '2025-02-01', kind: 'post_phase1', explorationId: ex.id }); m.conclusion = 'SEEG proposée.';
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); SV.app.go({ stage: 'meet:' + m.id, view: 'preparer' }); }""")
    pg.wait_for_timeout(2500)
    n0 = pg.evaluate("document.querySelectorAll('.st-deck .dk-row').length"); check(n0 >= 4, f'carte « Diapositives » ({n0} pages)')
    first = pg.evaluate("document.querySelector('.st-deck .dk-row').dataset.k")
    pg.click('.st-deck .dk-row:nth-child(2) .dk-eye'); pg.wait_for_timeout(500)
    hidden = pg.evaluate("document.querySelector('.st-deck .dk-row:nth-child(2)').dataset.k")
    check(pg.evaluate("document.querySelector('.st-deck .dk-row:nth-child(2)').classList.contains('off')"), 'page masquée')
    pg.click('.st-deck .dk-row:nth-child(3) .dk-up'); pg.wait_for_timeout(400)
    check(pg.evaluate("!!SV.app.currentMeeting().deck.order"), 'ordre enregistré')
    pg.click('.st-deck [data-a=free]'); pg.wait_for_timeout(500)
    pg.fill('.dk-ft', 'Questions pour le staff'); pg.fill('.dk-fx', '# Points à trancher\n- latéralisation\n- intérêt d’une TEP'); pg.click('.dk-ok'); pg.wait_for_timeout(600)
    check(pg.evaluate("SV.app.currentMeeting().deck.custom.length") == 1, 'page libre créée')
    pg.screenshot(path=os.path.join(OUT, 'staff_deck.png'))
    # présentation
    pg.evaluate("() => SV.app.openPresentation(SV.app.currentMeeting())"); pg.wait_for_timeout(1500)
    keys = pg.evaluate("SV.app._pres.slides.map(s => s.deckKey)")
    check(hidden not in keys, 'page masquée absente du diaporama'); check(any(k.startswith('c:') for k in keys), 'page libre dans le diaporama')
    i = [k for k in keys].index(next(k for k in keys if k.startswith('c:')))
    pg.evaluate(f"SV.app.presentShow({i})"); pg.wait_for_timeout(1800)
    check('latéralisation' in pg.evaluate("document.querySelector('#presentation .pr-body').textContent"), 'texte de la page libre affiché')
    # Éditer / Commenter (E) : la donnée modifiée dans le dossier, ou un commentaire accroché sans la modifier
    pg.keyboard.press('e'); pg.wait_for_timeout(1200)
    check(pg.evaluate("document.querySelector('#presentation').classList.contains('pr-editing')"), 'mode édition (E)')
    ni = pg.evaluate("SV.app._pres.slides.findIndex(s => s.deckKey === 'x:np')")
    pg.evaluate(f"SV.app.presentShow({ni})"); pg.wait_for_timeout(1500)
    host = "#presentation .pr-concl[data-ed] + .stcm-host"
    check(pg.evaluate(f"!!document.querySelector('{host} [data-cm-a=ed]') && !!document.querySelector('{host} [data-cm-a=add]')"), 'boutons « Éditer » et « Commenter » sous la conclusion du bilan')
    pg.click(f'{host} [data-cm-a=ed]'); pg.wait_for_timeout(300)
    pg.fill('#presentation .stcm-in textarea', 'Pas de difficulté franche. Fragilité exécutive à revoir.'); pg.click('#presentation .stcm-in [data-k=ok]'); pg.wait_for_timeout(1500)
    cc = pg.evaluate("SV.app.dossier.exams.find(x => x.kind === 'neuropsy').conclusion")
    check(cc == 'Pas de difficulté franche. Fragilité exécutive à revoir.', f'Éditer : donnée modifiée dans le dossier : {cc!r}')
    check('Fragilité exécutive' in pg.evaluate("document.querySelector('#presentation .pr-concl').textContent"), 'page redessinée avec la nouvelle valeur')
    pg.click(f'{host} [data-cm-a=add]'); pg.wait_for_timeout(300)
    pg.fill('#presentation .stcm-in textarea', 'Moins bien que décrit dans le bilan.'); pg.keyboard.press('Control+Enter'); pg.wait_for_timeout(1500)
    st = pg.evaluate("(() => { const d = SV.app.dossier, x = d.exams.find(e => e.kind === 'neuropsy'); return { n: d.staffNotes.map(n => [n.target, n.text, n.meetingId === SV.app.currentMeeting().id]), c: x.conclusion, shown: [...document.querySelectorAll('#presentation .pr-concl + .stcm-host .stcm-n .stcm-t')].map(e => e.textContent) } })()")
    check(len(st['n']) == 1 and st['n'][0][0].endswith(':conclusion') and st['n'][0][2], f"Commenter : note de staff accrochée à la donnée {st['n']}")
    check(st['c'] == cc, 'Commenter ne modifie pas la donnée'); check(st['shown'] == ['Moins bien que décrit dans le bilan.'], f"commentaire affiché sous la donnée : {st['shown']}")
    pg.click('#presentation .stcm-page [data-cm-a=add]'); pg.wait_for_timeout(300)
    pg.fill('#presentation .stcm-in textarea', 'Bilan à refaire avant la SEEG.'); pg.keyboard.press('Control+Enter'); pg.wait_for_timeout(1800)
    check(pg.evaluate("SV.app.dossier.staffNotes.some(n => n.target === 'page:x:np')"), 'commentaire de la page entière')
    snapnp = pg.evaluate("(() => { const x = SV.app._pres.snap.get('x:np'); return x ? x.html : '' })()")
    check('Fragilité exécutive' in snapnp and 'Moins bien que décrit' in snapnp and 'Bilan à refaire' in snapnp and 'data-cm-a' not in snapnp, 'page capturée avec données modifiées et commentaires, sans boutons (instantané)')
    pg.keyboard.press('e'); pg.wait_for_timeout(800)
    check(pg.evaluate("!document.querySelector('#presentation .stcm-tools') && !!document.querySelector('#presentation .stcm-n')"), 'hors édition : commentaires visibles, boutons cachés')
    rep = pg.evaluate("(() => { const A = SV.app, m = A.currentMeeting(); return A.cmInjectHtml(A.reportExams(A.dossier, m.date), m.date) })()")
    a, b2 = rep.find('Fragilité exécutive'), rep.find('Moins bien que décrit')
    check(a > 0 and b2 > a and '</li>' in rep[b2:] and rep.find('</li>', a) > b2, 'compte rendu : commentaire placé juste sous la donnée, pas en fin de document')
    pg.evaluate("SV.app.presentShow(0)"); pg.wait_for_timeout(1800)
    pg.click('#presentation [data-a=snap]'); pg.wait_for_timeout(1500)
    sn = pg.evaluate("SV.app.currentMeeting().snapshots"); check(len(sn) == 1 and sn[0]['n'] >= 2, f'instantané enregistré ({sn[0]["n"] if sn else 0} pages montrées)')
    pg.screenshot(path=os.path.join(OUT, 'staff_present.png'))
    pg.evaluate("() => SV.app.closePresentation()"); pg.wait_for_timeout(1200)
    pg.evaluate("() => SV.app.currentMeeting().conclusion = 'Conclusion modifiée après le staff.'")
    pg.click('.st-deck [data-snap]'); pg.wait_for_timeout(1200)
    n = pg.evaluate("document.querySelectorAll('#presentation.snapshot .pr-nav [data-i]').length"); check(n == sn[0]['n'], f'instantané consulté ({n} pages)')
    pg.screenshot(path=os.path.join(OUT, 'staff_snapshot.png'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # staff ultérieur : donnée d'origine (modifiée par Éditer) et commentaire du staff précédent, en lecture
    pg.evaluate("() => { const S = SV.Store, d = SV.app.dossier, m2 = S.addMeeting(d, { date: '2025-06-01', kind: 'post_seeg' }); SV.app.touch(); SV.app.openPresentation(m2); }"); pg.wait_for_timeout(1500)
    ni2 = pg.evaluate("SV.app._pres.slides.findIndex(s => s.deckKey === 'x:np')"); pg.evaluate(f"SV.app.presentShow({ni2})"); pg.wait_for_timeout(1500)
    later = pg.evaluate("[...document.querySelectorAll('#presentation .stcm-n')].map(e => e.textContent)")
    check(any('staff du 01/02/2025' in t and 'Moins bien que décrit' in t for t in later), f'staff suivant : commentaire du staff précédent visible ({len(later)})')
    check(pg.evaluate("!document.querySelector('#presentation .stcm-x')"), 'commentaires d’un autre staff non modifiables')
    pg.evaluate("() => SV.app.closePresentation()"); pg.wait_for_timeout(500)
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'aucune erreur dans la console' + ('' if not errs else ' : ' + ' | '.join(errs[:5])))
    b.close()
print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'tout est ok'}")
sys.exit(1 if fails else 0)
