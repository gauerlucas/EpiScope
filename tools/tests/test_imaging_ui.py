#!/usr/bin/env python3
"""Écran Imagerie : import de NIfTI, image de référence, coupes, superposition."""
import os, sys, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
FILES = sys.argv[1:] or ['/tmp/claude-0/data/sub01_T1_3D_20260301.nii.gz', '/tmp/claude-0/data/MNI_FLAIR_20260302.nii.gz']
errs = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page(); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else print('log:', m.text) if 'EPI' in m.text else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'STR-IMG') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(1000)
    pg.evaluate("SV.app.showScreen('imaging')"); pg.wait_for_timeout(500)
    pg.set_input_files('#fileNifti', FILES); pg.wait_for_timeout(6000)
    print(json.dumps(pg.evaluate("()=>SV.app.dossier.imaging.map(i=>[i.modality,i.timepoint,i.date,i.ref,i.dims,i.file])")))
    pg.wait_for_timeout(1500); pg.screenshot(path=os.path.join(OUT, 'v2_imaging.png'))
    pg.evaluate("()=>{ const A=SV.app; A.addOverlay(A.dossier.imaging[1].id); return A.renderSliceView(); }"); pg.wait_for_timeout(2500)
    print('calques:', pg.evaluate("()=>SV.app.slices.layers.map(l=>l.id+':'+l.kind)"))
    pg.screenshot(path=os.path.join(OUT, 'v2_imaging_overlay.png'))
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
