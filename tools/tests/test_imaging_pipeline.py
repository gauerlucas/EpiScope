#!/usr/bin/env python3
"""Chaîne d'imagerie complète dans le navigateur (« Tout traiter ») : T1 + images à recaler (FLAIR, TEP, scanner
post-implantation) → recalages, anatomie du patient, détection des électrodes, validation, vues 3D patient / gabarit.
    python tools/tests/test_imaging_pipeline.py T1.nii CT.nii [FLAIR.nii PET.nii …]   (images de test locales)"""
import os, sys, json, tempfile, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('EPI_SHOTS') or os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
FILES = sys.argv[1:]
errs = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=6000'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page(); pg.set_default_timeout(3600_000)
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'PIPE-TEST') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(1000)
    pg.evaluate("()=>{ const d=SV.app.dossier; SV.Store.addExploration(d,{kind:'seeg', start:'2026-01-10'}); SV.app.touch(); SV.app.showScreen('imaging'); }"); pg.wait_for_timeout(500)
    t0 = time.time()
    for f in FILES:
        pg.set_input_files('#fileNifti', [f]); n = FILES.index(f) + 1
        pg.wait_for_function("n=>SV.app.dossier.imaging.length>=n", arg=n, timeout=600_000); pg.wait_for_timeout(800)
    print('import %.0f s' % (time.time() - t0), json.dumps(pg.evaluate("()=>SV.app.dossier.imaging.map(i=>[i.modality,i.timepoint,i.ref,i.dims])")))
    t0 = time.time(); pg.evaluate("()=>{ window.__run='run'; SV.app.processAll().then(()=>window.__run='ok', e=>window.__run='ERR '+e.message); }")
    last = ''
    while True:
        st = pg.evaluate("()=>[window.__run, [...document.querySelectorAll('#jobBar .job')].map(j=>j.innerText.replace(/\\s+/g,' ')).join(' | ')]")
        msg = st[1][:150]
        if msg != last: print('  %4.0f s  %s' % (time.time() - t0, msg)); last = msg
        if st[0] != 'run': break
        time.sleep(4)
    print('processAll', pg.evaluate("()=>window.__run"), '%.0f s' % (time.time() - t0))
    # v3 : la détection des électrodes se lance dans SEEG › Localisation
    t0 = time.time(); pg.evaluate("()=>{ window.__run='run'; const d=SV.app.dossier, ct=d.imaging.find(i=>i.modality==='CT'); SV.app.openExploration(d.explorations.find(e=>e.kind==='seeg').id, 'loc'); SV.app.detectElectrodes(ct).then(()=>window.__run='ok', e=>window.__run='ERR '+e.message); }")
    while pg.evaluate("()=>window.__run") == 'run': time.sleep(4)
    print('détection', pg.evaluate("()=>window.__run"), '%.0f s' % (time.time() - t0))
    print(json.dumps(pg.evaluate("()=>SV.app.dossier.imaging.map(i=>[i.modality, i.coreg ? i.coreg.text : null])"), ensure_ascii=False))
    det = pg.evaluate("()=>{ const ex=SV.app.dossier.explorations.find(e=>e.kind==='seeg'); return ex && ex.ctDetect ? ex.ctDetect.items.map(it=>[it.name, it.n, it.nObs, Math.round(it.length), Math.round(it.score*100), it.tip.map(v=>Math.round(v))]) : null; }")
    print('électrodes détectées', len(det or []), json.dumps(det))
    pg.wait_for_timeout(1500); pg.screenshot(path=os.path.join(OUT, 'pipe_imaging.png'))
    pg.evaluate("()=>{ const d=SV.app.dossier, ex=d.explorations.find(e=>e.kind==='seeg'), ct=d.imaging.find(i=>i.modality==='CT'); return SV.app.validateElectrodes(ct, ex); }"); pg.wait_for_timeout(1500)
    print('validées', pg.evaluate("()=>SV.app.dossier.explorations.find(e=>e.kind==='seeg').electrodes.filter(e=>e.real).length"))
    pg.evaluate("()=>SV.app.openExploration(SV.app.dossier.explorations.find(e=>e.kind==='seeg').id)"); pg.wait_for_timeout(2500)
    pg.evaluate("()=>{ SV.app.setAnatomy('patient'); SV.app.showScreen(null); SV.app.viewer.setCellConfig(0,{opacity:0.35, sub:false}); }"); pg.wait_for_timeout(3500)
    print('électrodes affichées', pg.evaluate("()=>SV.app.elecs.length"), pg.evaluate("()=>SV.app.elecs.slice(0,3).map(e=>[e.name, e.nContacts, [...e.regions.keys()].slice(0,4).map(r=>SV.app.atlas.labelEn(r))])"))
    pg.screenshot(path=os.path.join(OUT, 'pipe_3d_patient_elec.png'))
    pg.evaluate("()=>{ SV.app.viewer.setCellConfig(0,{opacity:1, slices3d:true, clip:'axial'}); return SV.app.updateSlices3d(true); }"); pg.wait_for_timeout(3500)
    pg.screenshot(path=os.path.join(OUT, 'pipe_3d_patient_slices.png'))
    pg.evaluate("()=>{ SV.app.setAnatomy('template'); SV.app.viewer.setCellConfig(0,{opacity:0.35, slices3d:false, clip:''}); }"); pg.wait_for_timeout(3000)
    pg.screenshot(path=os.path.join(OUT, 'pipe_3d_template_elec.png'))
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
