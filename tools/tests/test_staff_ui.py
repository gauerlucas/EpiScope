#!/usr/bin/env python3
"""Parcours complet : phase 1 (3 crises), staff post-phase 1 (concordance, hypothèses du modèle, décision SEEG →
exploration + schéma), SEEG (stimulations, quantification), staff post-SEEG (révision d'hypothèse), compte rendu."""
import os, json, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'dist', 'screenshots'); os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')
errs = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], accept_downloads=True, viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept(d.default_value or 'STR-0007') if d.type == 'prompt' else d.accept())
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#pNew'); pg.wait_for_timeout(1000)
    pg.evaluate("""()=>{ const A=SV.app, S=SV.Store, d=A.dossier; d.patient.birthYear=1992; d.patient.sex='F'; d.patient.handedness='R'; d.patient.onsetAge=14; d.patient.mri='lesional'; d.patient.etiology='structural';
      S.addLesion(d,{label:'Sclérose hippocampique G', type:'HS', side:'L', regions:[145,146], source:'radiology', confidence:'high'});
      const ex=d.explorations[0], ses=S.sessionsOf(d,ex.id)[0];
      const seqs=[[['aura_epigastric',0],['fear',3],['loss_of_awareness',12],['oroalimentary_automatisms',15],['dystonic_posturing',20,'R']],[['aura_epigastric',0],['loss_of_awareness',9],['oroalimentary_automatisms',12],['gestural_automatisms_distal',15,'L']],[['loss_of_awareness',0],['oroalimentary_automatisms',4],['head_version',30,'R'],['fbtcs',35]]];
      seqs.forEach((q,i)=>{ const sz=S.addSeizure(d,ses.id,{habitual:i<2?'yes':'no', datetime:'2026-03-1'+(i+2)+'T0'+(i+3)+':15', eeg_onset:i===0?-6:null}); sz.events=q.map(([s,t,side],k)=>({id:k+1,sign_id:s,t,dt:1,dur:8,side:side||'',topography:'',conf:1,note:''})); });
      ex.start='2026-03-10'; ex.end='2026-03-17'; ex.status='done'; A.touch(); A.newMeeting(); }""")
    pg.wait_for_timeout(1500)
    m = pg.evaluate("()=>{ const A=SV.app; return {n:A._cons.n, pL:A._cons.pL.toFixed(2), hyps:A._cons.hyps.slice(0,3).map(x=>x.name+' '+x.hemi+' '+x.top+'/'+x.n)} }"); print('consensus:', json.dumps(m, ensure_ascii=False))
    # hypothèse depuis le modèle (première du menu) + une hypothèse manuelle « temporal plus »
    pg.click('#stHypModel'); pg.wait_for_timeout(300); pg.click('.ctx-menu .ctx-item >> nth=0'); pg.wait_for_timeout(500)
    pg.evaluate("""()=>{ const A=SV.app, S=SV.Store, d=A.dossier, m=A.currentMeeting(); const H=S.addHypothesis(d,{meetingId:m.id,title:'Temporal plus gauche',side:'L',ez:[145,147],prop:[40,41],confidence:'low'}); H.argsFor.push({text:'automatismes précoces, peur'}); A.touch(); A.renderStaff();
      m.concordance.cells['mesial_temporal:L']={eeg_ii:{v:'++',note:'pointes T1-T3 G'}, pet:{v:'+',note:'hypométabolisme temporal antérieur G'}}; A.touch(); A.renderConcordance(m); }""")
    pg.wait_for_timeout(500)
    pg.click('#stDecNew'); pg.wait_for_timeout(300)
    pg.click('#stDecs button:has-text("Créer l’exploration SEEG")'); pg.wait_for_timeout(800)
    pg.click('.implant-chooser .modal-foot .ok'); pg.wait_for_timeout(1500)
    info = pg.evaluate("()=>{ const d=SV.app.dossier; const ex=d.explorations.find(e=>e.kind==='seeg'); return {expl:ex&&ex.label, elec:ex&&ex.electrodes.map(e=>e.name), hyp:d.hypotheses.map(h=>h.title+' v'+h.version+' '+h.status), dec:d.decisions.map(x=>x.type+' '+x.status)} }")
    print('après décision:', json.dumps(info, ensure_ascii=False))
    pg.screenshot(path=os.path.join(OUT, 'v2_staff1.png'), full_page=True)
    # SEEG : stimulation déclenchant une crise habituelle, quantification EI
    pg.evaluate("""()=>{ const A=SV.app, S=SV.Store, d=A.dossier, ex=d.explorations.find(e=>e.kind==='seeg'); ex.start='2026-06-02'; ex.end='2026-06-16'; ex.status='done'; A.openExploration(ex.id);
      const e=A.elecs.find(x=>/^B|^A/.test(x.name))||A.elecs[0]; A.state.stims.push({id:'s1',eid:e.id,elec:e.name,c1:1,c2:2,mode:'shock',freq:1,pulse:3,dur:30,mA:2,clin:true,clinText:'peur',habitual:true,ad:true,adDur:12,sz:true,szHabitual:true,ccep:[],note:'',t:'2026-06-08T10:00:00'});
      const vals={}; A.elecs.forEach(x=>{ for(let k=1;k<Math.min(x.nContacts,6);k++) vals[x.name+k+'-'+(k+1)] = x===e ? 0.9-k*0.1 : 0.1; }); A.state.quant.push({id:'q1',name:'EI',unit:'',cmap:'viridis',mode:'color',min:0,max:1,source:'test',values:vals,unmatched:[]}); A.changed(); }""")
    pg.wait_for_timeout(1200)
    pg.evaluate("""()=>{ const A=SV.app; A.showScreen('dossier'); A.newMeeting(); }"""); pg.wait_for_timeout(1500)
    rows = pg.evaluate("()=>[...document.querySelectorAll('#stConc tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.trim()).join(' | ')).slice(0,6)")
    print('concordance post-SEEG:'); [print('  ', r) for r in rows]
    # révision de H1 dans le staff post-SEEG
    pg.click('#stHyps .hypc >> nth=0 >> [data-a=revise]'); pg.wait_for_timeout(500)
    print('versions:', pg.evaluate("()=>SV.app.dossier.hypotheses.map(h=>h.title+' v'+h.version+' '+h.status)"))
    pg.evaluate("document.getElementById('scr-staff').scrollTop=0"); pg.wait_for_timeout(200); pg.screenshot(path=os.path.join(OUT, 'v2_staff2_top.png'))
    pg.evaluate("document.getElementById('scr-staff').scrollTop=99999"); pg.wait_for_timeout(200); pg.screenshot(path=os.path.join(OUT, 'v2_staff2.png'))
    pg.click('#stReport'); pg.wait_for_timeout(500)
    print('dialogue :', pg.evaluate("()=>document.querySelector('.report-dlg .rd-body').innerText.replace(/\\s+/g,' ').slice(0,300)"))
    with pg.expect_download(timeout=600000) as dl:
        pg.click('.report-dlg .ok')
    rp = os.path.join(OUT, 'staff_report.html'); dl.value.save_as(rp); print('compte rendu', os.path.getsize(rp), 'octets')
    import re; txt = open(rp, encoding='utf-8').read(); print('titres :', [re.sub('<[^>]+>', '', t)[:60] for t in re.findall(r'<h[23][^>]*>(.*?)</h[23]>', txt)][:30])
    # rapport du dossier complet (bouton Rapport)
    pg.evaluate("SV.app.showScreen('dossier')"); pg.wait_for_timeout(500)
    pg.click('#btnReport'); pg.wait_for_timeout(500)
    with pg.expect_download(timeout=600000) as dl2:
        pg.click('.report-dlg .ok')
    rp2 = os.path.join(OUT, 'dossier_report.html'); dl2.value.save_as(rp2); print('rapport du dossier', os.path.getsize(rp2), 'octets')
    txt = open(rp2, encoding='utf-8').read(); print('titres :', [re.sub('<[^>]+>', '', t)[:60] for t in re.findall(r'<h[23][^>]*>(.*?)</h[23]>', txt)][:40])
    print('contexte restauré :', pg.evaluate("()=>[SV.app.ui.screen, JSON.stringify(SV.app.ctx)]"))
    print(pg.evaluate("()=>SV.app.meetingText(SV.app.currentMeeting())")[:900])
    pg.evaluate("SV.app.showScreen('dossier')"); pg.wait_for_timeout(600); pg.screenshot(path=os.path.join(OUT, 'v2_dossier2.png'))
    ctx.close()
print('erreurs console:', errs[:12] if errs else 'aucune')
