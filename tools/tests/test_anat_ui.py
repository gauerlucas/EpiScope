#!/usr/bin/env python3
"""Anatomie du patient de bout en bout dans le navigateur : import du T1 (et d'un CT), segmentation MeshNet, parcellation
VEP, surfaces, bascule gabarit ↔ patient, coupes 3D, relecture du dossier.
    python tools/tests/test_anat_ui.py T1.nii[.gz] [CT.nii[.gz]]     (images de test locales ; rien n'est copié ailleurs)"""
import os, sys, json, tempfile, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('EPI_SHOTS') or os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
FILES = sys.argv[1:] or ['/tmp/claude-0/data/sub01_T1_3D_20260301.nii.gz']
errs = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=6000'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page(); pg.set_default_timeout(3600_000)
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'ANAT-TEST') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(1000)
    pg.evaluate("SV.app.showScreen('imaging')"); pg.wait_for_timeout(500)
    t0 = time.time(); pg.set_input_files('#fileNifti', FILES)
    pg.wait_for_function("()=>SV.app.dossier.imaging.length>=%d" % len(FILES), timeout=600_000); pg.wait_for_timeout(1500)
    print('import %.0f s' % (time.time() - t0), json.dumps(pg.evaluate("()=>SV.app.dossier.imaging.map(i=>[i.modality,i.timepoint,i.ref,i.dims])")))
    t0 = time.time(); pg.evaluate("()=>{ window.__anat='run'; SV.app.computeAnatomy().then(()=>window.__anat='ok', e=>window.__anat='ERR '+e.message); }")
    last = ''
    while True:
        st = pg.evaluate("()=>[window.__anat, SV.app.ui.anatJob ? SV.app.ui.anatJob.message : '', (document.querySelector('#jobBar')||{}).innerText||'']")
        msg = (st[1] or '')[:90]
        if msg != last: print('  %4.0f s  %s' % (time.time() - t0, msg)); last = msg
        if st[0] != 'run' and not pg.evaluate("()=>!!SV.app.ui.anatJob"): break
        time.sleep(5)
    an = pg.evaluate("()=>SV.app.dossier.anatomy")
    print('résultat', pg.evaluate("()=>window.__anat"), '%.0f s' % (time.time() - t0))
    if an: print(json.dumps({k: an.get(k) for k in ('qc', 'fit', 'timings', 'workers')}, ensure_ascii=False)[:1500])
    pg.wait_for_timeout(1500); pg.screenshot(path=os.path.join(OUT, 'anat_imaging.png'))
    pg.evaluate("()=>{ SV.app.slvState().labels='vep'; return SV.app.renderSliceView(); }"); pg.wait_for_timeout(2500); pg.screenshot(path=os.path.join(OUT, 'anat_slices_vep.png'))
    pg.evaluate("()=>{ SV.app.setAnatomy('patient'); SV.app.newSeizureIn(SV.app.dossier.explorations[0]); }"); pg.wait_for_timeout(3000)
    pg.screenshot(path=os.path.join(OUT, 'anat_3d_patient.png'))
    pg.evaluate("()=>{ SV.app.viewer.setLayout && SV.app.viewer.setLayout('quad'); }"); pg.wait_for_timeout(2500); pg.screenshot(path=os.path.join(OUT, 'anat_3d_patient_quad.png'))
    pg.evaluate("()=>{ SV.app.viewer.setLayout('single'); SV.app.viewer.setCellConfig(0,{slices3d:true, clip:'axial', view: (SV.VIEWS.top?'top':Object.keys(SV.VIEWS)[0])}); return SV.app.updateSlices3d(true); }"); pg.wait_for_timeout(3500)
    pg.screenshot(path=os.path.join(OUT, 'anat_3d_slices.png'))
    pg.evaluate("()=>{ SV.app.setAnatomy('template'); }"); pg.wait_for_timeout(2500); pg.screenshot(path=os.path.join(OUT, 'anat_3d_template_slices.png'))
    # relecture : on recharge l'application et on rouvre le dossier
    did = pg.evaluate("()=>SV.app.dossier.id"); pg.evaluate("()=>SV.app.setAnatomy('patient')"); pg.wait_for_timeout(1500)
    pg.evaluate("()=>SV.app.flushSave()"); pg.wait_for_timeout(1000); pg.reload(); pg.wait_for_timeout(3500)
    pg.evaluate("id=>SV.app.openDossier(id)", did); pg.wait_for_timeout(6000)
    print('après relecture : mode', pg.evaluate("()=>SV.app.anatMode"), 'anatomie', pg.evaluate("()=>!!SV.app.patientAnat"), 'sommets', pg.evaluate("()=>SV.app.patientAnat && SV.app.patientAnat.atlas.hemis.lh.n"))
    pg.screenshot(path=os.path.join(OUT, 'anat_reopen.png'))
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
