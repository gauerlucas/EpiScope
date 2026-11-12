#!/usr/bin/env python3
"""Écran Imagerie : T1 + scanner post-implantation synthétique → détection (worker), validation, export BIDS."""
import os, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'dist', 'screenshots'); URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
errs = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page(); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'STR-CT') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(800)
    pg.evaluate("()=>{ SV.app.addExplorationUI('seeg'); SV.app.showScreen('imaging'); }"); pg.wait_for_timeout(500)
    pg.set_input_files('#fileNifti', ['/tmp/claude-0/data/sub01_T1_3D_20260301.nii.gz', '/tmp/claude-0/data/sub01_CT_postimplant_20260603.nii.gz']); pg.wait_for_timeout(9000)
    print(pg.evaluate("()=>SV.app.dossier.imaging.map(i=>[i.modality,i.timepoint,i.ref])"))
    # scanner déjà dans le monde du T1 (synthétique) : recalage identité
    pg.evaluate("()=>{ const d=SV.app.dossier, ct=d.imaging.find(i=>i.modality==='CT'); ct.coreg={T:Array.from(SV.Mat4.identity()), text:'identité (test)'}; SV.app.touch(); SV.app.openExploration(SV.app.dossier.explorations.find(e=>e.kind==='seeg').id, 'loc'); }"); pg.wait_for_timeout(2500)
    pg.click('#ceDetect'); pg.wait_for_timeout(15000)
    det = pg.evaluate("()=>{ const ex=SV.app.dossier.explorations.find(e=>e.kind==='seeg'); return ex.ctDetect ? ex.ctDetect.items.map(i=>[i.name,i.n,Math.round(i.length)]) : null }")
    print('détection:', det)
    pg.wait_for_timeout(1500); pg.screenshot(path=os.path.join(OUT, 'v2_ct_detect.png'))
    pg.click('#ceValidate'); pg.wait_for_timeout(2500)
    print('validées:', pg.evaluate("()=>{ const ex=SV.app.dossier.explorations.find(e=>e.kind==='seeg'); return ex.electrodes.filter(e=>e.real).map(e=>e.name+':'+e.real.contacts.length) }"))
    print('fichiers:', pg.evaluate("()=>SV.Library.listFiles(SV.app.dossier)"))
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
