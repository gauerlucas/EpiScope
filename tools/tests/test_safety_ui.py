#!/usr/bin/env python3
"""v1.0.1 — parcours « rien ne se perd » dans dist/EpiScope.html (Chromium headless, Playwright, stockage du navigateur).
   python3 tools/tests/test_safety_ui.py      (après python3 tools/build.py)
   Données entièrement synthétiques ; captures dans tools/tests/out/ (ignoré par git)."""
import os, sys, json
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept('TEST-SAFE') if d.type == 'prompt' else d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    check(pg.evaluate("SV.Library.mode") == 'browser', 'bibliothèque dans le navigateur (mode de test)')
    # patient synthétique avec deux explorations, une crise, une capture liée
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'TEST-SAFE' });
      const e1 = S.addExploration(d, { kind: 'phase1', start: '2025-01-10' }), s1 = e1; S.addSeizure(d, e1.id, { datetime: '2025-01-11', label: 'Crise 1' });
      const e2 = S.addExploration(d, { kind: 'seeg', start: '2025-06-01' }), s2 = e2, z = S.addSeizure(d, e2.id, { datetime: '2025-06-02', label: 'Crise SEEG' });
      S.addGalleryItem(d, { file: 'gallery/Gtest.png', explorationId: e2.id, seizureId: z.id, title: 'page' });
      await L.writeFile(d, 'gallery/Gtest.png', new Uint8Array([137, 80, 78, 71]));
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); }""")
    pg.wait_for_timeout(1500)
    check(pg.evaluate("SV.app.dossier && SV.app.dossier.patient.pseudo") == 'TEST-SAFE', 'dossier ouvert')
    # deuxième enregistrement : instantané « ouverture » de la séance
    pg.evaluate("async () => { SV.app.dossier.patient.notes = 'modif 1'; SV.app.touch(); await SV.app.flushSave(); }")
    h1 = pg.evaluate("async () => (await SV.Library.listHistory(SV.app.dossier)).map(x => x.reason)")
    check(len(h1) >= 1, f'historique après enregistrement : {h1}')
    # suppression de l'exploration SEEG (cascade : crise, lien de la capture)
    pg.evaluate("""async () => { const a = SV.app, d = a.dossier, ex = d.explorations.find(e => e.kind === 'seeg'); SV.Store.remove(d, 'exploration', ex.id);
      SV.Store.remove(d, 'gallery', d.gallery[0].id); await SV.Library.removeFile(d, 'gallery/Gtest.png'); a.touch(); await a.flushSave(); }""")
    st = pg.evaluate("async () => { const d = SV.app.dossier; return { ex: d.explorations.length, sz: d.seizures.length, trash: d.trash.length, file: !!(await SV.Library.readFile(d, 'gallery/Gtest.png')), inTrash: !!(await SV.Library.readFile(d, 'trash/gallery/Gtest.png')), hist: (await SV.Library.listHistory(d)).map(x => x.reason) } }")
    check(st['ex'] == 1 and st['sz'] == 1 and st['trash'] == 2, f'suppression enregistrée dans la corbeille : {st}')
    check(not st['file'] and st['inTrash'], 'fichier de la capture rangé dans trash/')
    check('remove' in st['hist'], 'instantané « avant une suppression » dans l’historique')
    # écran Journal : corbeille et versions
    pg.evaluate("SV.app.go({ stage: 'dossier', view: 'journal' })"); pg.wait_for_timeout(1200)
    pg.screenshot(path=os.path.join(OUT, 'safety_journal.png'), full_page=False)
    n_rows = pg.evaluate("document.querySelectorAll('.sf-trash tr[data-id]').length")
    check(n_rows == 2, f'corbeille affichée ({n_rows} lignes)')
    check(pg.evaluate("document.querySelectorAll('.sf-hist tr[data-n]').length") >= 2, 'versions affichées')
    # restauration depuis l'interface : la capture d'abord (dernière supprimée), puis l'exploration
    pg.click('.sf-trash tr[data-id] [data-a=restore]'); pg.wait_for_timeout(1200)
    pg.click('.sf-trash tr[data-id] [data-a=restore]'); pg.wait_for_timeout(1500)
    st2 = pg.evaluate("async () => { const d = SV.app.dossier; return { ex: d.explorations.length, sz: d.seizures.length, trash: d.trash.length, g: d.gallery.length, link: d.gallery[0] && !!d.gallery[0].seizureId, file: !!(await SV.Library.readFile(d, 'gallery/Gtest.png')) } }")
    check(st2 == {'ex': 2, 'sz': 2, 'trash': 0, 'g': 1, 'link': True, 'file': True}, f'restauration exacte (objets, liens, fichier) : {st2}')
    # retour à une version : celle « avant une suppression » (2 explorations), puis annulation possible
    pg.evaluate("async () => { const d = SV.app.dossier; SV.Store.remove(d, 'exploration', d.explorations[0].id); SV.app.touch(); await SV.app.flushSave(); }")
    name = pg.evaluate("async () => (await SV.Library.listHistory(SV.app.dossier)).find(x => x.reason === 'remove').name")
    pg.evaluate(f"SV.app.restoreRevision({json.dumps(name)})"); pg.wait_for_timeout(2500)
    st3 = pg.evaluate("async () => { const d = SV.app.dossier; return { ex: d.explorations.length, hist: (await SV.Library.listHistory(d)).map(x => x.reason) } }")
    check(st3['ex'] == 2 and 'restore' in st3['hist'], f'retour à une version, état précédent gardé : {st3}')
    # point de restauration volontaire
    pg.evaluate("SV.app.go({ stage: 'dossier', view: 'journal' })"); pg.wait_for_timeout(800)
    pg.click('.sf-hist [data-a=point]'); pg.wait_for_timeout(1200)
    check('manual' in pg.evaluate("async () => (await SV.Library.listHistory(SV.app.dossier)).map(x => x.reason)"), 'point de restauration créé')
    # corbeille de la bibliothèque
    did = pg.evaluate("SV.app.dossier.id")
    pg.evaluate("async () => { await SV.app.closeDossier(); SV.app.go({ stage: 'patients' }); }"); pg.wait_for_timeout(1200)
    if pg.evaluate("!!document.getElementById('pTrash')"):
        pg.click(f'tr[data-id="{did}"] [data-a=del]'); pg.wait_for_timeout(1500)
        lst = pg.evaluate("async () => ({ live: (await SV.Library.list()).map(x => x.id), del: (await SV.Library.list({ deleted: true })).map(x => x.id) })")
        check(did not in lst['live'] and did in lst['del'], 'patient mis à la corbeille de la bibliothèque')
        pg.click('#pTrash'); pg.wait_for_timeout(800); pg.screenshot(path=os.path.join(OUT, 'safety_libtrash.png'))
        pg.click(f'.sf-libtrash tr[data-id="{did}"] [data-a=undel]'); pg.wait_for_timeout(1200)
        check(did in pg.evaluate("async () => (await SV.Library.list()).map(x => x.id)"), 'patient restauré')
    else:
        check(False, 'bouton Corbeille de la liste des patients')
    # polarité : la visionneuse partage SV.Wave
    check(pg.evaluate("SV.Wave.negUp === true && SV.Wave.y(10, 0, 1) > 0"), 'polarité par défaut : négatif en haut')
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'aucune erreur dans la console' + ('' if not errs else ' : ' + ' | '.join(errs[:5])))
    b.close()
print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'tout est ok'}")
sys.exit(1 if fails else 0)
