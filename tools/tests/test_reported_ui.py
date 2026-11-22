#!/usr/bin/env python3
"""v2.0.0 — crises sans séances (Chromium headless, Playwright, données synthétiques) : crise rapportée créée depuis
   « Histoire de la maladie », décrite dans l'espace de travail, puis rattachée à une phase 1 créée ensuite ; préréglage
   « Vidéo-EEG post-opératoire » ; dossier de l'ancien format (séances) lu et converti, instantané épinglé.
   python3 tools/tests/test_reported_ui.py   (après tools/build.py)"""
import os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1500, 'height': 920}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'REPORT' });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); SV.app.go({ stage: 'dossier', view: 'maladie' }); }""")
    pg.wait_for_timeout(1500)
    check(pg.is_visible('#hxReported .rep-card'), 'carte « Crises rapportées » dans Histoire de la maladie')
    pg.click('#hxReported [data-a=new]'); pg.wait_for_timeout(500)
    check(pg.is_visible('#szInfoDlg'), 'fiche de la nouvelle crise')
    check(pg.evaluate("document.querySelector('#szInfoDlg .z-ex').value") == '', 'rattachée au dossier par défaut')
    pg.fill('#szInfoDlg .z-dt', '2024-12-24T18:30'); pg.click('#szInfoDlg .z-ok'); pg.wait_for_timeout(1500)
    st = pg.evaluate("() => { const A = SV.app, S = SV.Store; return { scr: A.ui.screen, ex: A.ctx && A.ctx.explorationId, sz: A.ctx && A.ctx.seizureId, rep: S.reportedSeizures(A.dossier).length, sb: document.querySelector('.sb-sz b') && document.querySelector('.sb-sz b').textContent }; }")
    check(st['scr'] == 'work' and st['ex'] == pg.evaluate('SV.Store.REPORTED'), f'sémiologie de la crise rapportée ouverte {st}')
    check(st['rep'] == 1 and st['sb'] == 'Crise rapportée 1', 'crise rapportée enregistrée, titre dans la barre')
    # une saisie dans l'espace de travail est écrite dans la crise
    pg.evaluate("() => { const A = SV.app; A.state.events.push({ id: 1, sign_id: 'aura_epigastric', t: 0, dt: 1, dur: 5, conf: 1 }); A.persistWorkspace(); }")
    check(pg.evaluate("SV.Store.reportedSeizures(SV.app.dossier)[0].events.length") == 1, 'signe saisi enregistré dans la crise rapportée')
    pg.screenshot(path=os.path.join(OUT, 'reported_semio.png'))
    # phase 1 créée ensuite, rattachement depuis la liste des crises
    pg.evaluate("() => SV.app.newExplorationStage('phase1')"); pg.wait_for_timeout(1200)
    check(pg.evaluate("SV.app.loc.view") == 'apercu', 'nouvelle phase 1 : ouverte sur la vue d’ensemble')
    pg.evaluate("() => SV.app.go({ stage: 'ex:' + SV.app.dossier.explorations[0].id, view: 'crises' })"); pg.wait_for_timeout(800)
    check(pg.is_visible('#vsSessions'), 'liste des crises de la phase 1')
    pg.click('#vsMore'); pg.wait_for_timeout(300)
    pg.click('text=Rattacher une crise rapportée du dossier'); pg.wait_for_timeout(400)
    check(pg.is_visible('#szAttachDlg'), 'fenêtre de rattachement')
    pg.check('#szAttachDlg input[data-id]'); pg.click('#szAttachDlg .z-ok'); pg.wait_for_timeout(800)
    at = pg.evaluate("() => { const A = SV.app, S = SV.Store, d = A.dossier, ex = d.explorations[0]; return { n: S.seizuresOfExploration(d, ex.id).length, rep: S.reportedSeizures(d).length, lbl: S.seizuresOfExploration(d, ex.id)[0].label, ev: S.seizuresOfExploration(d, ex.id)[0].events.length, rows: document.querySelectorAll('#vsSessions tr[data-id]').length }; }")
    check(at['n'] == 1 and at['rep'] == 0 and at['ev'] == 1, f'crise rattachée avec sa sémiologie {at}')
    check(at['lbl'] == 'Crise rapportée 1' and at['rows'] == 1, 'titre libre gardé, liste rafraîchie')
    # la crise rattachée reste visible dans la carte du dossier, avec son exploration
    pg.evaluate("() => SV.app.go({ stage: 'dossier', view: 'maladie' })"); pg.wait_for_timeout(800)
    rc = pg.evaluate("() => { const tr = document.querySelector('#hxReported tr[data-id]'); const s = tr && tr.querySelector('[data-a=to]'); return { n: document.querySelectorAll('#hxReported tr[data-id]').length, sel: s && s.options[s.selectedIndex].textContent }; }")
    check(rc['n'] == 1 and 'rattachée à' in (rc['sel'] or ''), f'crise rattachée encore listée dans « Crises rapportées » {rc}')
    # vue d'ensemble de la phase 1 : premier onglet, frise, crises
    pg.evaluate("() => SV.app.openExploration(SV.app.dossier.explorations[0].id)"); pg.wait_for_timeout(900)
    ov = pg.evaluate("() => ({ v: SV.app.loc.view, tabs: [...document.querySelectorAll('.subbar .vtab, .vtabs button, [data-view]')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 8), tl: !!document.querySelector('#ovTl svg, #ovTl .hint'), sz: document.querySelectorAll('#ovSz tr[data-sz]').length, f: !!document.querySelector('.ov .ex-form [data-f=start]') })")
    check(ov['v'] == 'apercu' and ov['tl'] and ov['sz'] == 1 and ov['f'], f'vue d’ensemble ouverte par défaut {ov}')
    pg.screenshot(path=os.path.join(OUT, 'phase_overview.png'))
    # intercritique : cartes 10-20 en veille et au sommeil
    pg.evaluate("() => SV.app.go({ stage: 'ex:' + SV.app.dossier.explorations[0].id, view: 'inter' })"); pg.wait_for_timeout(800)
    mp = pg.evaluate("() => [...document.querySelectorAll('.eeg-mapcard figure[data-cat]')].map(f => f.dataset.cat)")
    check(mp == ['spikesW', 'slowW', 'spikesS', 'slowS'], f'cartes intercritiques veille / sommeil {mp}')
    pg.click('.eeg-mapcard figure[data-cat=spikesS] .eh-el[data-el=T4]'); pg.wait_for_timeout(200)
    check(pg.evaluate("SV.app.dossier.explorations[0].eeg.map.spikesS.T4") == 1, 'clic sur la carte du sommeil enregistré')
    lg = pg.evaluate("""() => { const A = SV.app, ex = A.dossier.explorations[0]; ex.eeg.map.spikes = { Fp1: 2 }; A.go({ stage: 'ex:' + ex.id, view: 'apercu' }); A.go({ stage: 'ex:' + ex.id, view: 'inter' });
      const b = document.querySelector('[data-mv="spikes:spikesW"]'); if (!b) return { btn: false }; b.click(); return { btn: true, w: ex.eeg.map.spikesW.Fp1, old: Object.keys(ex.eeg.map.spikes).length, row: !!document.querySelector('[data-mv]') }; }""")
    check(lg['btn'] and lg['w'] == 2 and lg['old'] == 0 and not lg['row'], f'carte d’avant 2.0 rangée en veille {lg}')
    # staff : une crise rapportée non rattachée apparaît avant les explorations
    st = pg.evaluate("""() => { const A = SV.app, S = SV.Store, d = A.dossier, r = S.addSeizure(d, null, { datetime: '2024-06-01' }); r.events.push({ id: 1, sign_id: 'aura_epigastric', t: 0, dt: 1, dur: 3, conf: 1 });
      const m = S.addMeeting(d, { date: '2026-01-01' }); const sc = A.staffScope(m), sl = A.presentSlides(m);
      const div = document.createElement('div'); document.body.appendChild(div); A.prSeizure(div, r, S.reportedEx(d), () => true); const ok = div.innerHTML.length > 50; div.remove();
      return { ok, first: sc.seizures[0] && sc.seizures[0].sz.id === r.id, sec: (sl.find(x => x.key === 'sz:' + r.id) || {}).section || (sl.find(x => x.key === 'sz:' + r.id) || {}).sec, idx: sl.findIndex(x => x.key === 'sz:' + r.id), p1: sl.findIndex(x => /^eegint:|^sz:/.test(x.key || '') && x.key !== 'sz:' + r.id) }; }""")
    check(st['ok'] and st['first'] and st['idx'] >= 0 and (st['p1'] < 0 or st['idx'] < st['p1']), f'crise rapportée au staff, avant les explorations {st}')
    # préréglage post-opératoire
    pg.evaluate("() => SV.app.newExplorationStage('other', { context: 'postop' })"); pg.wait_for_timeout(800)
    po = pg.evaluate("() => { const ex = SV.app.dossier.explorations[1]; return { l: ex.label, c: ex.context, h: SV.app.stageTitle(SV.app.currentStage()) }; }")
    check(po['l'] == 'Vidéo-EEG post-opératoire' and po['c'] == 'postop' and 'post-opératoire' in po['h'], f'préréglage post-opératoire {po}')
    # dossier de l'ancien format : séances converties à la lecture
    mg = pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'ANCIEN' }), ex = S.addExploration(d, { kind: 'phase1', start: '2023-02-01' });
      const raw = JSON.parse(JSON.stringify(d)); raw.schema = 2; raw.minReader = '1.0.0';
      raw.sessions = [{ id: 'S1', explorationId: ex.id, label: 'Séance 1', date: '2023-02-02', notes: 'nuit', files: [] }];
      raw.seizures = [{ id: 'C1', sessionId: 'S1', label: 'Crise 1', datetime: '', habitual: 'yes', events: [], params: {} }];
      await L.save(raw, { raw: true }).catch(() => L.save(raw)); await SV.app.openDossier(raw.id, { quiet: true }); await new Promise(r => setTimeout(r, 1200));
      const D = SV.app.dossier, z = D.seizures[0];
      return { schema: D.schema, ses: 'sessions' in D, ex: z.explorationId === ex.id, dt: z.datetime, notes: D.explorations[0].notes, ro: !!SV.app.readonly, log: D.journal.some(j => /format 2\\.0/.test(JSON.stringify(j))) }; }""")
    check(mg['schema'] == 3 and not mg['ses'] and mg['ex'] and mg['dt'] == '2023-02-02', f'ancien dossier converti {mg}')
    check('[Séance 1 du 02/02/2023] nuit' in (mg['notes'] or '') and mg['log'] and not mg['ro'], 'notes de séance gardées, conversion au journal, dossier modifiable')
    # essai à blanc depuis la liste des patients (un ancien dossier encore jamais ouvert)
    dr = pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'ESSAI' }), ex = S.addExploration(d, { kind: 'seeg', start: '2022-05-01' });
      const raw = JSON.parse(JSON.stringify(d)); raw.schema = 2; raw.sessions = [{ id: 'S9', explorationId: ex.id, label: 'Séance 1', date: '2022-05-02', notes: '', files: [] }];
      raw.seizures = [{ id: 'C9', sessionId: 'S9', label: 'Crise 1', datetime: '', events: [], params: {} }]; await L.save(raw);
      SV.app.showRaw('patients'); await SV.app.renderPatients(); const has = !!document.querySelector('#pOldDry'); document.querySelector('#pOldDry').click(); await new Promise(r => setTimeout(r, 800));
      const back = await L.loadRaw(raw.id); return { has, rows: document.querySelectorAll('#migDlg tbody tr').length, txt: document.querySelector('#migDlg tbody').textContent, still: Array.isArray(back.sessions) }; }""")
    check(dr['has'] and dr['rows'] == 1 and dr['still'], f'essai à blanc : un dossier, rien d’écrit {dr}')
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    b.close()
print('\nOK crises sans séances (interface)' if not fails else f'\n{len(fails)} échec(s)')
sys.exit(1 if fails else 0)
