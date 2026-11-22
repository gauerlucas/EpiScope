#!/usr/bin/env python3
"""v1.1.0 — noms de fichiers BIDS dans dist/EpiScope.html (Chromium headless, Playwright, stockage du navigateur) :
   import d'un tracé sous son nom BIDS, renommage des fichiers d'un ancien dossier (carte du Journal).
   Données entièrement synthétiques (EDF+D de make_synth_edfd.py ; « NOMFICTIF » joue le nom d'origine d'un export).
   python3 tools/tests/test_bids_ui.py      (après python3 tools/build.py)"""
import os, sys, subprocess, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
EDF = os.path.join(tempfile.mkdtemp(prefix='episcope-bids-'), 'NOMFICTIF Prenom crise.edf')
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'tests', 'make_synth_edfd.py'), EDF], check=True, capture_output=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { await SV.Library.saveSettings({ site: 'TST' }); const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'BIDS' }), ex = S.addExploration(d, { kind: 'seeg', start: '2021-06-01' });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true, ctx: { explorationId: ex.id } });
      const i = document.createElement('input'); i.type = 'file'; i.id = 'bfile'; document.body.appendChild(i); }""")
    pg.wait_for_timeout(1200); pg.set_input_files('#bfile', EDF)
    pg.evaluate("async () => { await SV.app.ieegImport([...document.getElementById('bfile').files]); await SV.app.flushSave(); }"); pg.wait_for_timeout(2500)
    st = pg.evaluate("""async () => { const d = SV.app.dossier, r = SV.app.ieegEx().recordings[0]; return { code: d.subject.label, edf: r.files.edf, title: r.title,
      json: JSON.stringify(d).includes('NOMFICTIF'), files: (await SV.Library.listFiles(d)).join('|') } }""")
    check(st['code'] == 'TST0001', f"code du sujet : {st['code']}")
    check(st['edf'].endswith('/sub-TST0001_ses-seeg1_task-seizure_run-01_ieeg.edf') or st['edf'].endswith('/sub-TST0001_ses-seeg1_task-monitoring_run-01_ieeg.edf') or st['edf'].endswith('/sub-TST0001_ses-seeg1_task-interictal_run-01_ieeg.edf'), f"tracé rangé sous son nom BIDS : {st['edf'].split('/')[-1]}")
    check('NOMFICTIF' not in st['title'] and not st['json'] and 'NOMFICTIF' not in st['files'], f"nom d’origine absent du dossier et des fichiers (titre : {st['title']})")
    check(pg.evaluate("async () => { const m = await SV.app.ieegMem(SV.app.ieegEx().recordings[0]); return !!(m && m.nSamples) }"), 'le tracé renommé se relit')
    ck = pg.evaluate("(() => { const r = SV.app.ieegEx().recordings[0]; return r.clock && [r.clock.start, r.clock.blocks.length] })()")
    check(ck == ['2021-06-02T23:30:00.000', 3], f'horloge du tracé enregistrée dans le dossier : {ck}')
    ab = pg.evaluate("""async () => { const A = SV.app, r = A.ieegEx().recordings[0], d = A.dossier, z = SV.Store.addSeizure(d, A.ieegEx().id, { label: 'Crise A' });
      r.seizureId = z.id; r.marks = { onset: 751, end: 780, user: [] }; A.touch(); await A.flushSave(); return [r.marks.abs && r.marks.abs.onset, z.onsetAbs] }""")
    check(ab == ['2021-06-02T23:57:30.000', '2021-06-02T23:57:30.000'], f'heure absolue des marques et début absolu de la crise enregistrés : {ab}')
    # ancien dossier : fichiers et titres au nom d'origine
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = SV.app.dossier, ex = SV.app.ieegEx(), r0 = ex.recordings[0], b = await L.readFile(d, r0.files.edf);
      await L.writeFile(d, 'ieeg/RLEG/NOMFICTIF Prenom.edf', b);
      const hdr = 'Brain Vision Data Exchange Header File Version 1.0\\r\\n[Common Infos]\\r\\nDataFile=NOMFICTIF.eeg\\r\\nMarkerFile=NOMFICTIF.vmrk\\r\\n';
      await L.writeFile(d, 'ieeg/RBV/NOMFICTIF.vhdr', hdr); await L.writeFile(d, 'ieeg/RBV/NOMFICTIF.vmrk', 'Brain Vision Data Exchange Marker File, Version 1.0\\r\\nDataFile=NOMFICTIF.eeg\\r\\n'); await L.writeFile(d, 'ieeg/RBV/NOMFICTIF.eeg', new Uint8Array(16));
      ex.recordings.push(Object.assign(JSON.parse(JSON.stringify(r0)), { id: 'RLEG', title: 'NOMFICTIF Prenom', files: { edf: 'ieeg/RLEG/NOMFICTIF Prenom.edf' } }));
      ex.recordings.push({ id: 'RBV', kind: 'inter', title: 'NOMFICTIF nuit', format: 'brainvision', files: { vhdr: 'ieeg/RBV/NOMFICTIF.vhdr', vmrk: 'ieeg/RBV/NOMFICTIF.vmrk', eeg: 'ieeg/RBV/NOMFICTIF.eeg' } });
      SV.app.ensureSeeg && SV.app.ensureSeeg(); (SV.app.state.quant = SV.app.state.quant || []).push({ id: 'qleg', name: 'EI · NOMFICTIF Prenom', unit: '', values: {} });
      SV.app.touch(); await SV.app.flushSave(); await SV.app.openDossier(d.id, { quiet: true }); }""")
    pg.wait_for_timeout(1000)
    pg.evaluate("SV.app.go({ stage: 'dossier', view: 'journal' })"); pg.wait_for_timeout(1200)
    check(pg.evaluate("!!document.querySelector('.bids-card')"), 'carte « Noms de fichiers d’origine » dans le Journal')
    pg.screenshot(path=os.path.join(OUT, 'bids_card.png'))
    check(pg.evaluate("!!document.querySelector('.bids-card [data-a=apply]')"), 'bouton « Renommer selon BIDS »')
    res = pg.evaluate("async () => SV.app.bidsApply()"); pg.wait_for_timeout(1500)
    check(res['files'] == 4 and not res['errors'], f'renommage appliqué : {res}')
    st2 = pg.evaluate("""async () => { const L = SV.Library, d = await L.load(SV.app.dossier.id), ex = d.explorations[0], R = id => ex.recordings.find(r => r.id === id);
      const vh = await (await L.readFile(d, R('RBV').files.vhdr)).text(), vm = await (await L.readFile(d, R('RBV').files.vmrk)).text();
      return { json: JSON.stringify(Object.assign({}, d, { trash: [] })).includes('NOMFICTIF'), files: (await L.listFiles(d)).filter(f => !f.startsWith('trash/') && !f.startsWith('history/')).join('|'),
        leg: R('RLEG').files.edf, bv: R('RBV').files.vhdr, vh, vm, hist: (await L.listHistory(d)).map(x => x.reason), card: !!document.querySelector('.bids-card'), q: JSON.stringify((ex.quant || []).map(q => [q.id, q.name])), sq: JSON.stringify((SV.app.state.quant || []).map(q => q.name)) } }""")
    check(st2['leg'].endswith('sub-TST0001_ses-seeg1_task-seizure_run-02_ieeg.edf') or 'run-02' in st2['leg'], f"ancien tracé EDF renommé : {st2['leg'].split('/')[-1]}")
    check('NOMFICTIF' not in st2['files'], 'plus aucun fichier au nom d’origine (hors corbeille)')
    base = st2['bv'].split('/')[-1][:-5]
    check(f'DataFile={base}.eeg' in st2['vh'] and f'MarkerFile={base}.vmrk' in st2['vh'] and f'DataFile={base}.eeg' in st2['vm'], 'en-têtes BrainVision réécrits')
    check(not st2['json'] and 'qleg' in st2['q'] and 'NOMFICTIF' not in st2['sq'], f"titres, jeux d’analyses et journal neutralisés {st2['q']}")
    check('migrate' in st2['hist'], f"version épinglée avant le renommage : {st2['hist']}")
    check(not st2['card'], 'carte retirée une fois les noms en ordre')
    check(pg.evaluate("async () => { const ex = SV.app.ieegEx() || SV.app.dossier.explorations[0], m = await SV.app.ieegMem(ex.recordings.find(r => r.id === 'RLEG')); return !!(m && m.nSamples) }"), 'ancien tracé relu après renommage')
    # export anonymisé : aucune trace de l'identité dans l'archive (octets des fichiers compris)
    an = pg.evaluate("""async () => { const L = SV.Library, d = SV.app.dossier; Object.assign(d.identity, { lastName: 'NOMFICTIF', firstName: 'Prenomfictif', ipp: '55443322' });
      const ex = d.explorations[0], r = ex.recordings[0], b = await L.readFile(d, r.files.edf), u = new Uint8Array(await b.arrayBuffer());
      const t = 'NOMFICTIF Prenomfictif'; for (let i = 0; i < t.length; i++) u[8 + i] = t.charCodeAt(i); await L.writeFile(d, r.files.edf, u);
      SV.app.touch(); await SV.app.flushSave();
      const z = await SV.Zip.read(await L.exportBundle(d, { anon: true })); let hit = [], n = 0;
      for (const name of z.names) { const s = new TextDecoder('latin1').decode(await z.bytes(name)); n++;
        for (const w of ['NOMFICTIF', 'Prenomfictif', '55443322']) if (s.includes(w)) hit.push(name + ':' + w); }
      const zn = await SV.Zip.read(await L.exportBundle(d, {})); let named = false;
      named = (await zn.text('dossier.json')).includes('NOMFICTIF');
      return { hit, n, named } }""")
    check(an['n'] > 2 and not an['hit'], f"export anonymisé sans identité ({an['n']} fichiers) : {an['hit'][:3]}")
    check(an['named'], 'export interne : identité conservée')
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    b.close()

print('\n' + ('OK noms BIDS (interface)' if not fails else f'{len(fails)} échec(s)'))
raise SystemExit(1 if fails else 0)
