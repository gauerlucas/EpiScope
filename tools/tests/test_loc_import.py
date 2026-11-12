#!/usr/bin/env python3
"""SEEG › Localisation (v4.4) : scanner importé depuis la localisation (rangé dans le dossier comme CT post-implantation
puis recalé sur le T1), image déjà importée désignée comme scanner (« c'est le scanner »).
    python tools/tests/test_loc_import.py [T1.nii.gz CT.nii.gz]
Images synthétiques (tools/tests/make_synth_ct.py)."""
import os, sys, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
A = sys.argv[1:]
T1, CT = A[0:2] if len(A) >= 2 else ['/tmp/claude-0/data/sub01_T1_3D_20260301.nii.gz', '/tmp/claude-0/data/sub01_CT_postimplant_20260603.nii.gz']
errs, fails = [], []
def check(cond, msg):
    print(('ok   ' if cond else 'ÉCHEC ') + msg, flush=True)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=6000'], viewport={'width': 1500, 'height': 950})
    pg = ctx.new_page(); pg.set_default_timeout(60_000)
    pg.on('dialog', lambda d: d.accept(d.default_value or 'LOC-IMPORT') if d.type == 'prompt' else d.accept())
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(800)
    pg.evaluate("()=>SV.app.addExplorationUI('seeg')"); pg.wait_for_timeout(400)
    if pg.locator('.implant-chooser .modal-foot .ok').count(): pg.click('.implant-chooser .modal-foot .ok'); pg.wait_for_timeout(400)
    exid = pg.evaluate("()=>SV.app.dossier.explorations.find(e=>e.kind==='seeg').id")
    # T1 et « scanner » importés par Dossier › Imagerie, le scanner mal typé
    pg.evaluate("()=>SV.app.go({stage:'dossier', view:'imagerie'})"); pg.wait_for_timeout(500)
    pg.set_input_files('#fileNifti', [T1, CT]); pg.wait_for_function("()=>SV.app.dossier.imaging.length>=2", timeout=600_000); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{ const ct=SV.app.dossier.imaging.find(i=>i.modality==='CT'); ct.modality='other'; ct.timepoint='preop'; SV.app.touch(); }")
    pg.evaluate("id=>SV.app.go({stage:'ex:'+id, view:'loc'})", exid); pg.wait_for_timeout(2000)
    check(pg.locator('#locCT [data-useas]').count() == 1 and pg.locator('#locAddCT').count() == 1, 'localisation sans scanner : image du dossier proposée, import du scanner')
    pg.click('#locCT [data-useas]')
    pg.wait_for_function("()=>{ const c=SV.app.dossier.imaging.find(i=>i.modality==='CT'); return c && c.coreg && c.coreg.T }", timeout=600_000); pg.wait_for_timeout(2500)
    u = pg.evaluate("()=>{ const c=SV.app.dossier.imaging.find(i=>i.modality==='CT'); return { tp: c.timepoint, sel: SV.app.ui.ce.ctId===c.id, badge: !!document.querySelector('#locCT .badge.ok') } }")
    check(u['tp'] == 'postimplant' and u['sel'] and u['badge'], f'« c’est le scanner » : CT post-implantation, recalé, choisi ({u})')
    # un autre scanner importé depuis la localisation : rangé et recalé sans passer par Imagerie
    n0 = pg.evaluate("()=>SV.app.dossier.imaging.length")
    with pg.expect_file_chooser() as fc: pg.click('#locAddCT2')
    fc.value.set_files(CT)
    pg.wait_for_function("n=>SV.app.dossier.imaging.length>n", arg=n0, timeout=600_000)
    pg.wait_for_function("()=>{ const L=SV.app.dossier.imaging; const c=L[L.length-1]; return c.coreg && c.coreg.T }", timeout=600_000); pg.wait_for_timeout(2500)
    r = pg.evaluate("()=>{ const L=SV.app.dossier.imaging, c=L[L.length-1]; return { mod: c.modality, tp: c.timepoint, sel: SV.app.ui.ce.ctId===c.id, screen: SV.app.ui.screen, slices: !!document.querySelector('#locPanel .sv-slices'), refs: L.filter(x=>x.ref).length } }")
    check(r['mod'] == 'CT' and r['tp'] == 'postimplant' and r['sel'] and r['screen'] == 'loc' and r['slices'] and r['refs'] == 1, f'scanner importé depuis la localisation : CT post-implantation, recalé, choisi, coupes ({r})')
    # l'import par Dossier › Imagerie reste un import ordinaire (pas de recalage forcé)
    pg.evaluate("()=>SV.app.go({stage:'dossier', view:'imagerie'})"); pg.wait_for_timeout(600)
    check(pg.evaluate("()=>{ const f=document.getElementById('fileNifti'); return !!f.onchange && !/locImportCT/.test(String(f.onchange)) }"), 'Imagerie : l’import retrouve son comportement ordinaire')
    ctx.close()
real = [e for e in errs if 'favicon' not in e and 'ERR_FILE_NOT_FOUND' not in e]
print('erreurs console :', real[:8])
if real: fails.append('erreurs console')
print('\n%d échec(s)' % len(fails) + (' : ' + ' ; '.join(fails) if fails else ''))
sys.exit(1 if fails else 0)
