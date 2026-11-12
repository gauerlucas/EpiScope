#!/usr/bin/env python3
"""Schémas d'implantation : schéma proposé en phase 1 (12 électrodes) → décision de SEEG au staff → reprise du schéma,
complété pour les hypothèses retenues → SEEG ouverte (en-tête de l'onglet Électrodes, badges) → carte Implantations."""
import os, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('EPI_SHOTS') or os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
errs = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], accept_downloads=True, viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'IMPL-01') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(1000)
    pg.evaluate("""()=>{ const A=SV.app, S=SV.Store, d=A.dossier, ex=d.explorations[0], ses=S.sessionsOf(d,ex.id)[0];
      const seqs=[[['aura_epigastric',0],['fear',3],['loss_of_awareness',12],['oroalimentary_automatisms',15],['dystonic_posturing',20,'R']],[['aura_epigastric',0],['loss_of_awareness',9],['oroalimentary_automatisms',12]]];
      seqs.forEach((q,i)=>{ const sz=S.addSeizure(d,ses.id,{habitual:'yes', datetime:'2026-03-1'+(i+2)+'T10:00'}); sz.events=q.map(([s,t,side],k)=>({id:k+1,sign_id:s,t,dt:1,dur:8,side:side||'',topography:'',conf:1,note:''})); });
      ex.start='2026-03-10'; ex.end='2026-03-17'; ex.status='done'; A.touch(); A.openSeizure(d.seizures[0].id); }""")
    pg.wait_for_timeout(1500)
    pg.evaluate("()=>{ const A=SV.app; A.setTab('electrodes'); document.getElementById('elMax').value=12; A.proposeElectrodes(); }"); pg.wait_for_timeout(1500)
    print('phase 1 : schéma proposé', pg.evaluate("()=>SV.app.state.electrodes.map(e=>e.name).join(' ')"))
    pg.evaluate("()=>{ SV.app.persistWorkspace(); SV.app.newMeeting(); }"); pg.wait_for_timeout(1500)
    pg.click('#stHypModel'); pg.wait_for_timeout(300); pg.click('.ctx-menu .ctx-item >> nth=0'); pg.wait_for_timeout(500)
    # hypothèse supplémentaire non couverte par le schéma : insula antérieure G + opercule
    pg.evaluate("""()=>{ const A=SV.app, S=SV.Store, d=A.dossier, m=A.currentMeeting(), I=A.atlas.idx('Insula-gyri-brevi','L'), O=A.atlas.idx('Orbito-frontal-cortex','L'); S.addHypothesis(d,{meetingId:m.id,title:'Insulo-orbitaire gauche',side:'L',ez:[I,O],prop:[],confidence:'medium'}); A.touch(); A.renderStaff(); }""")
    pg.click('#stDecNew'); pg.wait_for_timeout(300)
    pg.evaluate("()=>{ const A=SV.app, m=A.currentMeeting(), x=A.dossier.decisions.find(z=>z.meetingId===m.id); x.hypothesisIds=A.meetingHypotheses(m).map(H=>H.id); A.renderDecisions(m); }")
    pg.click('#stDecs button:has-text("Créer l’exploration SEEG")'); pg.wait_for_timeout(1200)
    print('choix proposé :', pg.evaluate("()=>[...document.querySelectorAll('.implant-chooser .ic-opt')].map(o=>(o.querySelector('input').checked?'[x] ':'[ ] ')+o.innerText.replace(/\\s+/g,' ').slice(0,160))"))
    pg.screenshot(path=os.path.join(OUT, 'impl_chooser.png'))
    pg.click('.implant-chooser .modal-foot .ok'); pg.wait_for_timeout(1500)
    info = pg.evaluate("()=>{ const d=SV.app.dossier, ex=d.explorations.find(e=>e.kind==='seeg'); return {n:ex.electrodes.length, names:ex.electrodes.map(e=>e.name+(e.origin&&e.origin.kind==='staff'?'*':'')).join(' '), src:ex.implant&&ex.implant.source}; }")
    print('SEEG :', json.dumps(info, ensure_ascii=False))
    pg.evaluate("()=>{ const A=SV.app, ex=A.dossier.explorations.find(e=>e.kind==='seeg'); A.openExploration(ex.id); A.setTab('electrodes'); }"); pg.wait_for_timeout(1500)
    print('en-tête :', pg.evaluate("()=>document.querySelector('.implant-head').innerText.replace(/\\s+/g,' ')"))
    pg.screenshot(path=os.path.join(OUT, 'impl_seeg_tab.png'))
    pg.evaluate("SV.app.showScreen('dossier')"); pg.wait_for_timeout(800)
    print('carte :', pg.evaluate("()=>document.getElementById('dxImplants').innerText.replace(/\\s+/g,' ').slice(0,500)"))
    pg.screenshot(path=os.path.join(OUT, 'impl_dossier.png'))
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
