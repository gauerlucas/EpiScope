#!/usr/bin/env python3
"""Parcours « dossier patient » dans Chromium headless (stockage navigateur, IndexedDB) :
création d'un patient, deux crises en phase 1, une SEEG, enregistrement automatique, rechargement,
export .episcope puis import dans un autre profil (le poste d'un collègue)."""
import os, sys, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
errs = []
def page(ctx):
    pg = ctx.new_page(); pg.set_viewport_size({'width': 1600, 'height': 950})
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'STR-0042') if d.type == 'prompt' else d.accept())
    return pg
with sync_playwright() as p:
    prof1 = tempfile.mkdtemp(); ctx = p.chromium.launch_persistent_context(prof1, headless=True, args=ARGS, accept_downloads=True)
    pg = page(ctx); pg.goto(URL); pg.wait_for_timeout(2500)
    print('écran initial:', pg.evaluate('SV.app.ui.screen'), '| bibliothèque:', pg.evaluate('SV.Library.describe()'))
    pg.screenshot(path=os.path.join(OUT, 'v2_patients_empty.png'))
    pg.click('#pNew'); pg.wait_for_timeout(1200)
    print('après création:', pg.evaluate('SV.app.ui.screen'), pg.evaluate('SV.app.dossier.patient.pseudo'))
    # crise 1 : saisie par l'API de l'espace de travail
    pg.evaluate("()=>SV.app.go({stage: SV.app.parcours().find(x=>x.kind==='phase1').key, view:'crises'})"); pg.wait_for_timeout(500)
    pg.click('#vsSz'); pg.wait_for_timeout(800)
    pg.evaluate("""()=>{ const A=SV.app; A.setMode('manual'); [['aura_epigastric',0],['fear',3],['loss_of_awareness',12],['oroalimentary_automatisms',15],['dystonic_posturing',20]].forEach(([s,t])=>{ document.getElementById('manT').value=t; A.addEvent(s); }); document.getElementById('eegOnset').value=-6; A.changed(); }""")
    pg.select_option('#szHabitual', 'yes'); pg.dispatch_event('#szHabitual', 'change'); pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(OUT, 'v2_work_seizure1.png'))
    # crise 2
    pg.evaluate("()=>SV.app.newSeizureHere()"); pg.wait_for_timeout(600)
    pg.evaluate("""()=>{ const A=SV.app; A.setMode('manual'); [['aura_epigastric',0],['loss_of_awareness',8]].forEach(([s,t])=>{ document.getElementById('manT').value=t; A.addEvent(s); }); }""")
    pg.wait_for_timeout(1500)
    st = pg.evaluate("()=>{ const d=SV.app.dossier; return {seizures:d.seizures.map(z=>[z.label,z.events.length,z.habitual,z.eeg_onset]), save:SV.app._saveState, crumbs:document.getElementById('crPatient').textContent+' › '+SV.app.currentStage().label} }")
    print('dossier:', json.dumps(st, ensure_ascii=False))
    # SEEG : exploration, électrodes proposées, une stimulation
    pg.evaluate("""()=>{ const A=SV.app; A.showScreen('dossier'); A.addExplorationUI('seeg'); }"""); pg.wait_for_timeout(500)
    pg.evaluate("""()=>{ const A=SV.app, d=A.dossier, ex=SV.Store.explorationsSorted(d).filter(e=>e.kind==='seeg')[0]; A.openExploration(ex.id); A.setTab('electrodes'); A.proposeElectrodes(); }"""); pg.wait_for_timeout(800)
    pg.evaluate("""()=>{ const A=SV.app; const e=A.elecs[0]; A.state.stims.push({id:'st1',eid:e.id,elec:e.name,c1:1,c2:2,mode:'train',freq:50,pulse:1,dur:5,mA:1.5,clin:true,clinText:'peur',habitual:true,ad:false,sz:false,ccep:[],note:'',t:new Date().toISOString()}); A.changed(); }"""); pg.wait_for_timeout(1500)
    print('SEEG:', pg.evaluate("()=>{ const d=SV.app.dossier, ex=d.explorations.find(e=>e.kind==='seeg'); return [ex.label, ex.electrodes.length, ex.stims.length, SV.app.ctx.seizureId] }"))
    pg.evaluate("SV.app.showScreen('dossier')"); pg.wait_for_timeout(600); pg.screenshot(path=os.path.join(OUT, 'v2_dossier.png'), full_page=True)
    pg.evaluate("SV.app.showScreen('patients')"); pg.wait_for_timeout(800); pg.screenshot(path=os.path.join(OUT, 'v2_patients.png'))
    # rechargement : le dernier contexte est rouvert
    pg.reload(); pg.wait_for_timeout(3000)
    print('après rechargement:', pg.evaluate("()=>[SV.app.ui.screen, SV.app.dossier && SV.app.dossier.patient.pseudo, SV.app.dossier && SV.app.dossier.seizures.length, SV.app.state.stims.length, SV.app.elecs.length]"))
    # export complet
    with pg.expect_download(timeout=30000) as dl:
        pg.evaluate("SV.Library.exportBundle(SV.app.dossier,{}).then(b=>SV.app.download('STR-0042.episcope', b))")
    bpath = os.path.join(OUT, 'STR-0042.episcope'); dl.value.save_as(bpath); print('archive', os.path.getsize(bpath), 'octets')
    with pg.expect_download(timeout=30000) as dl:
        pg.evaluate("SV.app.exportCohort()")
    cpath = os.path.join(OUT, 'cohorte.zip'); dl.value.save_as(cpath); print('cohorte', os.path.getsize(cpath), 'octets')
    ctx.close()
    # poste du collègue : profil vierge, import
    prof2 = tempfile.mkdtemp(); ctx2 = p.chromium.launch_persistent_context(prof2, headless=True, args=ARGS, accept_downloads=True)
    pg2 = page(ctx2); pg2.goto(URL); pg2.wait_for_timeout(2500)
    pg2.set_input_files('#fileOpen', bpath); pg2.wait_for_timeout(2500)
    print('collègue:', pg2.evaluate("()=>{ const d=SV.app.dossier; return d && [d.patient.pseudo, d.explorations.map(e=>e.label), d.seizures.length, d.explorations.find(e=>e.kind==='seeg').stims.length, d.journal.length] }"))
    pg2.screenshot(path=os.path.join(OUT, 'v2_colleague.png'))
    ctx2.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
