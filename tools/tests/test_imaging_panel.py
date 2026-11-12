#!/usr/bin/env python3
"""Panneau de coupes : mode contraste à la souris (sans bouger le curseur), calques, vérification d'électrode (coupes
alignées sur la trajectoire, plots, encart), volet « Coupes IRM » de la vue des crises.
Données de test : T1 et scanner synthétiques (gabarit MNI, pas de données de patient)."""
import os, json, tempfile, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
errs, fails = [], []
def check(cond, msg):
    print(('ok   ' if cond else 'ÉCHEC ') + msg)
    if not cond: fails.append(msg)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page(); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'IMG-PANEL') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(800)
    pg.evaluate("()=>{ SV.app.addExplorationUI('seeg'); SV.app.showScreen('imaging'); }"); pg.wait_for_timeout(500)
    if pg.locator('.implant-chooser .modal-foot .ok').count(): pg.click('.implant-chooser .modal-foot .ok'); pg.wait_for_timeout(500)
    pg.evaluate("SV.app.showScreen('imaging')"); pg.wait_for_timeout(300)
    pg.set_input_files('#fileNifti', ['/tmp/claude-0/data/sub01_T1_3D_20260301.nii.gz', '/tmp/claude-0/data/sub01_CT_postimplant_20260603.nii.gz']); pg.wait_for_timeout(9000)
    pg.evaluate("()=>{ const d=SV.app.dossier, ct=d.imaging.find(i=>i.modality==='CT'); ct.coreg={T:Array.from(SV.Mat4.identity()), text:'identité (test)'}; SV.app.touch(); return SV.app.renderImaging(); }"); pg.wait_for_timeout(2500)
    check(pg.locator('#imPanel .ip-bar .ip-mode button').count() == 3, 'barre : trois modes de souris')
    # ---- mode contraste : glisser change la fenêtre, pas le curseur
    pg.click('#imPanel .ip-mode [data-m=wl]'); pg.wait_for_timeout(200)
    before = pg.evaluate("()=>({c:SV.app.slices.cursor.slice(), w:SV.app.slices.layers.find(l=>l.id==='base').win.slice()})")
    box = pg.locator('#imPanel .sl-pane').nth(0).bounding_box(); x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 120, y - 60, steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
    after = pg.evaluate("()=>({c:SV.app.slices.cursor.slice(), w:SV.app.slices.layers.find(l=>l.id==='base').win.slice(), st:SV.app.ui.slv.baseWin})")
    wb, wa = before['w'][1] - before['w'][0], after['w'][1] - after['w'][0]
    check(before['c'] == after['c'], 'mode ◐ : le curseur ne bouge pas')
    check(wa < wb * 0.7, f'glisser → : contraste augmenté (largeur {wb:.0f} → {wa:.0f})')
    check((after['w'][0] + after['w'][1]) / 2 < (before['w'][0] + before['w'][1]) / 2, 'glisser ↑ : plus clair (niveau abaissé)')
    check(after['st'] is not None, 'fenêtre mémorisée dans l’état partagé')
    pg.screenshot(path=os.path.join(OUT, 'panel_wl.png'))
    # ---- calques : le scanner en superposition, palette, opacité, ordre
    pg.click('#imPanel [data-a=layers]'); pg.wait_for_timeout(300)
    pg.select_option('.ip-layers .ipl-add', index=1); pg.wait_for_timeout(1500)
    n_ov = pg.evaluate("()=>SV.app.slices.layers.filter(l=>l.id.startsWith('ov:')).length")
    check(n_ov == 1, 'calques : superposition du scanner ajoutée')
    pg.screenshot(path=os.path.join(OUT, 'panel_layers.png'))
    pg.locator('.ip-layers .ipl-row[data-i] .on').first.uncheck(); pg.wait_for_timeout(300)
    check(pg.evaluate("()=>SV.app.slices.layers.find(l=>l.id.startsWith('ov:')).visible") is False, 'calques : œil → superposition masquée')
    pg.locator('.ip-layers .ipl-row[data-i] .on').first.check(); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('#imPanel .ip-mode [data-m=cursor]')
    # ---- électrodes réelles (détection sur le scanner synthétique, validation)
    pg.evaluate("()=>SV.app.openExploration(SV.app.dossier.explorations.find(e=>e.kind==='seeg').id, 'loc')"); pg.wait_for_timeout(2000)   # v3 : SEEG › Localisation
    pg.click('#ceDetect'); pg.wait_for_timeout(15000); pg.click('#ceValidate'); pg.wait_for_timeout(2500)
    pg.evaluate("()=>SV.app.go({stage:'dossier', view:'imagerie'})"); pg.wait_for_timeout(2500)
    real = pg.evaluate("()=>{ const ex=SV.app.dossier.explorations.find(e=>e.kind==='seeg'); return ex.electrodes.filter(e=>e.real).map(e=>e.name) }")
    check(len(real) >= 3, f'électrodes réelles validées : {len(real)}')
    pg.click('#imPanel [data-a=elec]'); pg.wait_for_timeout(300)
    items = pg.locator('.menu .item, .ctx-menu .item, .popup .item').all_inner_texts() if pg.locator('.menu .item, .ctx-menu .item, .popup .item').count() else []
    print('menu électrode :', items[:6])
    key = pg.evaluate("()=>{ const L=SV.app.worldElectrodes().list.filter(e=>e.kind==='real'); return L.length ? L[0].key : null }")
    pg.keyboard.press('Escape')
    pg.evaluate(f"()=>SV.app.checkElectrode('{key}')"); pg.wait_for_timeout(1500)
    fr = pg.evaluate("()=>{ const S=SV.app.slices; return {obl:!!S.oblique, keys:S.frames.map(f=>f.key), ins:!!S.inset && !S.insetCv.hidden, ct:SV.app.ui.slv.overlays.length} }")
    check(fr['obl'] and fr['keys'] == ['long1', 'long2', 'trans'], 'vérification : coupes obliques le long de l’axe + transverse')
    check(fr['ins'], 'vérification : encart « verre » affiché')
    geo = pg.evaluate("""()=>{ const A=SV.app, E=A.findWorldElectrode(A.ui.slv.elec), S=A.slices, d=[E.entry[0]-E.tip[0],E.entry[1]-E.tip[1],E.entry[2]-E.tip[2]], n=Math.hypot(...d), u=S.frames[0].U, N=S.frames[2].N||[0,0,0];
       return { along: Math.abs((d[0]*u[0]+d[1]*u[1]+d[2]*u[2])/n), transN: Math.abs((d[0]*N[0]+d[1]*N[1]+d[2]*N[2])/n), atContact: Math.hypot(...S.cursor.map((v,i)=>v-E.pts[0][i])) } }""")
    check(geo['along'] > 0.999 and geo['transN'] > 0.999, f"axe de l’électrode horizontal dans les coupes longitudinales ({geo['along']:.3f}), normal à la transverse")
    check(geo['atContact'] < 0.01, 'curseur sur le plot 1')
    pg.locator('#imPanel .sv-slices').focus(); pg.keyboard.press('ArrowRight'); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(400)
    k = pg.evaluate("()=>SV.app.ui.slv.elecK"); txt = pg.locator('#imPanel .ip-k').inner_text()
    check(k == 2 and txt == '3', f'flèche → : plot suivant (k={k}, affiché {txt})')
    pg.wait_for_timeout(800); pg.screenshot(path=os.path.join(OUT, 'panel_elec_check.png'))
    pg.click('#imPanel [data-a=ortho]'); pg.wait_for_timeout(400)
    check(pg.evaluate("()=>SV.app.slices.frames.map(f=>f.key).join()") == 'axial,coronal,sagittal' and pg.evaluate("()=>SV.app.slices.insetCv.hidden"), 'retour aux coupes orthogonales, encart masqué')
    # ---- volet de la vue des crises
    pg.evaluate("()=>SV.app.openExploration(SV.app.dossier.explorations.find(e=>e.kind==='seeg').id, 'planif')"); pg.wait_for_timeout(1200)   # v3 : SEEG › Planification
    pg.click('#btnDock'); pg.wait_for_timeout(2500)
    check(pg.evaluate("()=>!document.getElementById('sliceDock').hidden && !!document.querySelector('#sliceDock .sv-slices canvas') && SV.app._ipHost===document.getElementById('sliceDock')"), 'volet « Coupes IRM » ouvert à côté de la 3D')
    # v4.5 : en planification, une seule image (T1 injecté, sinon T1, sinon FLAIR), sans superposition ; boutons rapides
    check(pg.evaluate("()=>SV.app._slvKey.startsWith('plan:') && !SV.app.slices.layers.some(l=>l.id.startsWith('ov:'))"), 'volet de la planification : une seule image, sans calque')
    pg.evaluate("()=>SV.app.setTab && SV.app.setTab('electrodes')"); pg.wait_for_timeout(800)
    # (sans anatomie du patient, les électrodes réelles n'ont pas de position sur le gabarit : pas de carte dans la vue des crises)
    if pg.locator('#tab-electrodes .pe-row').count(): pg.locator('#tab-electrodes .pe-row').first.click(); pg.wait_for_timeout(600)   # v4.9 : liste compacte
    sel = '.elec-card [data-a=slices], #tab-electrodes .pe-det [data-a=slices]'
    nb = pg.locator(sel).count(); print('boutons « coupes » :', nb)
    if nb: pg.locator(sel).first.click()
    else: pg.evaluate("()=>{ const ex=SV.app.dossier.explorations.find(e=>e.kind==='seeg'); return SV.app.checkElectrodeInDock(ex.electrodes.find(e=>e.real).id, 3) }")
    pg.wait_for_timeout(1800)
    check(pg.evaluate("()=>!!SV.app.ui.slv.elec && !!SV.app.slices.oblique"), 'bouton « coupes » : volet aligné sur l’électrode')
    t0 = pg.evaluate("()=>SV.app.ui.t")
    pg.locator('#sliceDock .sv-slices').focus(); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(300)
    check(pg.evaluate("()=>SV.app.ui.t") == t0, 'flèches dans le volet : le temps de la crise ne bouge pas')
    pg.wait_for_timeout(1000); pg.screenshot(path=os.path.join(OUT, 'panel_dock.png'))
    pg.click('#btnPlanOpts'); pg.wait_for_timeout(300); pg.click('.plan-menu [data-a=wl]'); pg.wait_for_timeout(300)   # v4.5 : ◐ dans « Affichage ▾ »
    check(pg.evaluate("()=>!SV.app.ui.wl3d"), '◐ 3D refusé sans coupes IRM dans la vue (message)')
    pg.click('#btnDock'); pg.wait_for_timeout(500)
    check(pg.evaluate("()=>document.getElementById('sliceDock').hidden && !SV.app.slices"), 'volet refermé')
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
print('ÉCHECS :', fails if fails else 'aucun')
sys.exit(1 if fails or errs else 0)
