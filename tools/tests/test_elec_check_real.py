#!/usr/bin/env python3
"""Vérification d'électrode de bout en bout, avec l'anatomie du patient : T1 + scanner post-implantation → anatomie (MeshNet),
recalage du scanner, détection et validation des électrodes → coupes alignées sur une électrode avec l'encart « cerveau de
verre » (cortex du patient) ; vue des crises : volet « Coupes IRM », bouton « coupes » d'une électrode, clic sur un plot en 3D ;
coupes IRM dans la 3D et contraste à la souris (◐) sans rotation de la vue.
    python tools/tests/test_elec_check_real.py T1.nii[.gz] CT.nii[.gz] [dossier_captures]
Images de test locales uniquement : rien n'est copié ailleurs que dans le profil temporaire du navigateur."""
import os, sys, json, tempfile, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
T1, CT = (sys.argv[1:3] if len(sys.argv) >= 3 else ['/tmp/claude-0/data/sub01_T1_3D_20260301.nii.gz', '/tmp/claude-0/data/sub01_CT_postimplant_20260603.nii.gz'])
OUT = sys.argv[3] if len(sys.argv) > 3 else os.environ.get('EPI_SHOTS') or os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
errs, fails = [], []
def check(cond, msg):
    print(('ok   ' if cond else 'ÉCHEC ') + msg, flush=True)
    if not cond: fails.append(msg)
def wait_job(pg, expr, label, limit=1800):
    t0 = time.time(); pg.evaluate("()=>{ window.__job='run'; (%s).then(()=>window.__job='ok', e=>window.__job='ERR '+e.message); }" % expr)
    while pg.evaluate("()=>window.__job") == 'run' and time.time() - t0 < limit: time.sleep(4)
    print('  %s : %s (%.0f s)' % (label, pg.evaluate("()=>window.__job"), time.time() - t0), flush=True)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=6000'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page(); pg.set_default_timeout(3600_000)
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'ELEC-CHECK') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(800)
    pg.evaluate("()=>SV.app.addExplorationUI('seeg')"); pg.wait_for_timeout(400)
    if pg.locator('.implant-chooser .modal-foot .ok').count(): pg.click('.implant-chooser .modal-foot .ok'); pg.wait_for_timeout(400)
    pg.evaluate("SV.app.showScreen('imaging')"); pg.wait_for_timeout(400)
    pg.set_input_files('#fileNifti', [T1, CT]); pg.wait_for_function("()=>SV.app.dossier.imaging.length>=2", timeout=600_000); pg.wait_for_timeout(1500)
    wait_job(pg, "SV.app.computeAnatomy()", 'anatomie')
    check(pg.evaluate("()=>!!SV.app.patientAnat"), 'anatomie du patient calculée')
    wait_job(pg, "SV.app.coregImage(SV.app.dossier.imaging.find(i=>i.modality==='CT'), true)", 'recalage du scanner')
    pg.evaluate("()=>SV.app.openExploration(SV.app.dossier.explorations.find(e=>e.kind==='seeg').id, 'loc')"); pg.wait_for_timeout(2500)   # v3 : SEEG › Localisation
    pg.click('#ceDetect'); pg.wait_for_function("()=>{ const ex=SV.app.dossier.explorations.find(e=>e.kind==='seeg'); return ex.ctDetect && ex.ctDetect.items.length }", timeout=600_000); pg.wait_for_timeout(2000)
    pg.click('#ceValidate'); pg.wait_for_timeout(2500)
    names = pg.evaluate("()=>SV.app.dossier.explorations.find(e=>e.kind==='seeg').electrodes.filter(e=>e.real).map(e=>e.name+':'+e.real.contacts.length)")
    print('électrodes réelles :', names); check(len(names) >= 3, 'électrodes validées')
    # ---- Localisation : électrode alignée, encart avec le cortex du patient
    key = pg.evaluate("()=>{ const L=SV.app.worldElectrodes().list.filter(e=>e.kind==='real').sort((a,b)=>b.pts.length-a.pts.length); return L[0].key }")
    pg.evaluate("k=>{ SV.app.slvState().elecK=4; SV.app.checkElectrode(k, true); }", key); pg.wait_for_timeout(2500)
    ins = pg.evaluate("()=>{ const S=SV.app.slices; return { pts: S.inset ? S.inset.points.length/3 : 0, views: S.inset ? S.inset.views.map(v=>v.title) : [] } }")
    check(ins['pts'] > 5000, f"encart : cortex du patient ({ins['pts']} points), vues {ins['views']}")
    pg.screenshot(path=os.path.join(OUT, 'real_elec_check.png'))
    # ---- vue des crises : volet, bouton « coupes », clic sur un plot
    pg.evaluate("()=>{ SV.app.setAnatomy('patient'); SV.app.openExploration(SV.app.dossier.explorations.find(e=>e.kind==='seeg').id); }"); pg.wait_for_timeout(3000)
    pg.evaluate("()=>SV.app.setTab('electrodes')"); pg.wait_for_timeout(800)
    n = pg.locator('.elec-card [data-a=slices]').count()
    if not n and pg.locator('#tab-electrodes .pe-row').count():   # v4.9 : planification, liste compacte (le bouton est dans la fiche ouverte)
        pg.locator('#tab-electrodes .pe-row').nth(min(2, pg.locator('#tab-electrodes .pe-row').count() - 1)).click(); pg.wait_for_timeout(800)
    sel = '.elec-card [data-a=slices]' if n else '#tab-electrodes .pe-det [data-a=slices]'; n = pg.locator(sel).count(); print('boutons « coupes » :', n)
    if n:
        pg.locator(sel).nth(min(2, n - 1)).click(); pg.wait_for_timeout(3000)
        check(pg.evaluate("()=>!!SV.app.ui.slv.elec && SV.app._ipHost===document.getElementById('sliceDock') && !!SV.app.slices.oblique"), 'bouton « coupes » : volet aligné sur l’électrode')
        pg.screenshot(path=os.path.join(OUT, 'real_dock_elec.png'))
        # clic sur un plot d'une autre électrode dans la 3D : le volet suit
        other = pg.evaluate("()=>{ const e=SV.app.elecs.find(x=>SV.app.worldKeyOf(x.id)!==SV.app.ui.slv.elec); return e ? e.id : null }")
        if other:
            pg.evaluate("id=>{ SV.app.viewer.lastPick={kind:'contact', eid:id, k:2}; SV.app.onPick(0,'click',{}); }", other); pg.wait_for_timeout(1500)
            check(pg.evaluate("id=>SV.app.ui.slv.elec===SV.app.worldKeyOf(id) && SV.app.ui.slv.elecK===1", other), 'clic sur un plot en 3D : le volet passe à cette électrode, plot 2')
    pg.evaluate("()=>SV.app.exitElectrodeCheck()"); pg.wait_for_timeout(800)
    # ---- coupes IRM dans la 3D + contraste à la souris sans rotation
    pg.evaluate("()=>{ SV.app.viewer.setCellConfig(0,{slices3d:true}); return SV.app.updateSlices3d(true); }"); pg.wait_for_timeout(3500)
    def wl():   # v4.5 : en planification, ◐ est dans « Affichage ▾ » (barre allégée)
        if pg.evaluate("()=>document.body.classList.contains('cplan')"): pg.click('#btnPlanOpts', timeout=30_000); pg.wait_for_timeout(300); pg.click('.plan-menu [data-a=wl]', timeout=30_000)
        else: pg.click('#btn3dWL', timeout=30_000)
    wl(); pg.wait_for_timeout(300); check(pg.evaluate("()=>!!SV.app.ui.wl3d"), '◐ 3D actif avec les coupes IRM')
    cam0 = pg.evaluate("()=>SV.app.viewer.cells[0].camera.position.toArray()"); w0 = pg.evaluate("()=>SV.app.viewer._sl.base.win.slice()")
    b = pg.locator('#view3d').bounding_box(); x, y = b['x'] + b['width'] * 0.45, b['y'] + b['height'] * 0.5
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 150, y - 40, steps=10); pg.mouse.up(); pg.wait_for_timeout(1500)
    cam1 = pg.evaluate("()=>SV.app.viewer.cells[0].camera.position.toArray()"); w1 = pg.evaluate("()=>SV.app.viewer._sl.base.win.slice()")
    check(max(abs(a - b) for a, b in zip(cam0, cam1)) < 1e-6, 'glisser en mode ◐ : la vue 3D ne tourne pas')
    check((w1[1] - w1[0]) < (w0[1] - w0[0]) * 0.7, f'glisser en mode ◐ : contraste des coupes 3D ({w0[1]-w0[0]:.0f} → {w1[1]-w1[0]:.0f})')
    check(pg.evaluate("()=>{ const s=SV.app.slices, b=s&&s.layers.find(l=>l.id==='base'); return !!b && Math.abs(b.win[1]-b.win[0] - (SV.app.viewer._sl.base.win[1]-SV.app.viewer._sl.base.win[0]))<1e-6 }"), 'même fenêtre dans le volet de coupes')
    pg.screenshot(path=os.path.join(OUT, 'real_3d_wl.png'))
    wl(); pg.wait_for_timeout(200)
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 120, y, steps=8); pg.mouse.up(); pg.wait_for_timeout(800)
    cam2 = pg.evaluate("()=>SV.app.viewer.cells[0].camera.position.toArray()")
    check(max(abs(a - b) for a, b in zip(cam1, cam2)) > 1, '◐ désactivé : la vue tourne de nouveau')
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
print('ÉCHECS :', fails if fails else 'aucun')
sys.exit(1 if fails or errs else 0)
