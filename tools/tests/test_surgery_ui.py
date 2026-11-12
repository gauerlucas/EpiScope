#!/usr/bin/env python3
"""Proposition chirurgicale : décision de chirurgie au staff, lobectomie temporale antérieure réglée droite et
amygdalo-hippocampectomie sélective, vues (résection vs ZE), procédure créée, vue 3D ; devenir (recul calculé, mémo)."""
import os, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('EPI_SHOTS') or os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
errs = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'SURG-01') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(1000)
    pg.evaluate("""()=>{ const A=SV.app, S=SV.Store, d=A.dossier, a=A.atlas; d.patient.dominant='L';
      const H=S.addHypothesis(d,{title:'Temporal mésial droit',side:'R',ez:[a.idx('Hippocampus-anterior','R'),a.idx('Amygdala','R'),a.idx('Temporal-pole','R')],prop:[a.idx('Insula-gyri-brevi','R')],status:'confirmed'});
      A.touch(); A.newMeeting(); const m=A.currentMeeting(); m.kind='post_seeg'; H.meetingId=m.id; S.addDecision(d,{meetingId:m.id,type:'surgery',hypothesisIds:[H.id]}); A.renderStaff(); }""")
    pg.wait_for_timeout(1200)
    pg.select_option('#stDecs .surg-ed select.side', 'R'); pg.select_option('#stDecs .surg-ed select.tpl', 'atl'); pg.wait_for_timeout(3500)
    print('ATL D :', pg.evaluate("()=>{ const A=SV.app, x=A.dossier.decisions[0]; return {text:x.text, n:x.targets.length, regs:x.targets.map(r=>A.atlas.label(r)+(x.extent[r]?' (partiel)':'')).join(', '), cov:document.querySelector('.surg-cov').innerText}; }"))
    pg.evaluate("document.querySelector('#stDecs').scrollIntoView()"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(OUT, 'surg_atl.png'))
    pg.select_option('#stDecs .surg-ed select.tpl', 'sah'); pg.wait_for_timeout(3500)
    print('AHS D :', pg.evaluate("()=>{ const A=SV.app, x=A.dossier.decisions[0]; return {text:x.text, regs:x.targets.map(r=>A.atlas.label(r)).join(', '), cov:document.querySelector('.surg-cov').innerText}; }"))
    pg.screenshot(path=os.path.join(OUT, 'surg_sah.png'))
    pg.click('#stDecs button:has-text("Programmer la procédure")'); pg.wait_for_timeout(800)
    print('procédure :', pg.evaluate("()=>{ const p=SV.app.dossier.procedures[0]; return [p.type,p.template,p.side,p.regions.length,p.target]; }"))
    # devenir : recul auto depuis les dates
    pg.evaluate("""()=>{ const A=SV.app, S=SV.Store, d=A.dossier, p=d.procedures[0]; p.date='2025-01-15'; S.addOutcome(d,{procedureId:p.id, date:'2026-07-20', engel:'IA', ilae:'1'}); A.touch(); A.go({stage:'followup'}); }"""); pg.wait_for_timeout(1200)
    print('recul :', pg.evaluate("()=>{ const o=SV.app.dossier.outcomes[0], i=document.querySelector('#vfList input.months'); return [i.value, i.className, SV.Store.outcomeMonths(SV.app.dossier,o)]; }"))
    pg.click('#vfList .memo[data-memo=engel]'); pg.wait_for_timeout(400); pg.screenshot(path=os.path.join(OUT, 'surg_outcome_memo.png'))
    pg.keyboard.press('Escape'); pg.mouse.click(5, 990); pg.wait_for_timeout(300)
    pg.fill('#vfList input.months', '17'); pg.dispatch_event('#vfList input.months', 'change'); pg.wait_for_timeout(500)
    print('recul saisi :', pg.evaluate("()=>{ const o=SV.app.dossier.outcomes[0]; return [o.months, o.monthsManual, SV.Store.outcomeMonths(SV.app.dossier,o), !!document.querySelector('#vfList .reauto')]; }"))
    pg.evaluate("()=>{ SV.app.ui.meetingId=SV.app.dossier.meetings[0].id; SV.app.showScreen('staff'); }"); pg.wait_for_timeout(1500)
    pg.click('#stDecs .surg-ed .show3d'); pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(OUT, 'surg_3d.png'))
    print('légende :', pg.evaluate("()=>document.getElementById('hypLegend').innerText"))
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
