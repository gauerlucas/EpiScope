#!/usr/bin/env python3
"""v1.1.0 — provenance dans l'application (Chromium headless, Playwright) : crise SEEG synthétique (synth_seeg.mjs), EI
   calculé et enregistré → résultat avec empreinte du tracé, fenêtre, montage, réglages ; fenêtre modifiée → « périmé » ;
   recalcul → l'ancien résultat reste dans l'historique ; pastille et fenêtre de provenance dans Analyses.
   python3 tools/tests/test_provenance_ui.py   (après python3 tools/build.py)"""
import os, sys, json, glob, subprocess, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix='episcope-prov-')
subprocess.run(['node', '-e', f"import('{ROOT}/tools/tests/synth_seeg.mjs').then(m=>{{const r=m.synthSeizure({{dur:120}}); m.writeBrainVision('{TMP}','sub-synth_task-ictal',r)}})"], check=True)
FX = json.load(open(os.path.join(ROOT, 'tools/tests/fixtures/exemple_seeg_temporal_mesial_gauche.json'), encoding='utf-8'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1600, 'height': 950}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async (E) => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'PROV' }), ex = S.addExploration(d, { kind: 'seeg', start: '2021-06-01' }); ex.electrodes = E;
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true, ctx: { explorationId: ex.id } });
      const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'provfiles'; document.body.appendChild(i); }""", FX['electrodes'])
    pg.wait_for_timeout(2000); pg.set_input_files('#provfiles', sorted(glob.glob(os.path.join(TMP, '*'))))
    pg.evaluate("async () => { await SV.app.ieegImport([...document.getElementById('provfiles').files]); await SV.app.ieegOpen(SV.app.ieegEx().recordings[0], 'ei'); await SV.app.ieegComputeER(true); }"); pg.wait_for_timeout(9000)
    pg.evaluate("() => SV.app.ieegSaveQuant()"); pg.wait_for_timeout(3000)
    st = pg.evaluate("""() => { const d = SV.app.dossier, q = SV.app.state.quant[0], r = d.results.find(x => x.id === q.resultId), rec = SV.app.ieegEx().recordings[0];
      return { method: r.method, v: r.methodVersion, inputs: r.inputs.map(i => i.type), sha: (r.inputs.find(i => i.type === 'recording') || {}).sha256 === rec.sha256 && !!rec.sha256, n: Object.keys(r.outputs.values).length, params: !!(r.params && r.params.lambda), state: SV.app.provStatus(q).state }; }""")
    check(st['method'] == 'ei' and st['v'] == '1.0.0' and st['sha'] and st['n'] > 10 and st['params'], f'résultat EI rangé avec empreinte du tracé et réglages : {st}')
    check(set(['recording', 'window', 'marks', 'montage', 'excluded', 'elecMap']) <= set(st['inputs']), 'entrées complètes')
    check(st['state'] == 'current', 'jeu à jour')
    pg.evaluate("() => { const P = SV.app.ieegEIParams(); P.end = P.end - 5; }")
    check(pg.evaluate("SV.app.provStatus(SV.app.state.quant[0]).state") == 'stale', 'fenêtre modifiée → périmé')
    pg.evaluate("() => SV.app.ieegSaveQuant()"); pg.wait_for_timeout(2500)
    stt = pg.evaluate("SV.app.dossier.results.map(r => r.status)")
    check(stt == ['superseded', 'current'] and pg.evaluate("SV.app.provStatus(SV.app.state.quant[0]).state") == 'current', f'recalcul : ancien résultat gardé ({stt})')
    pg.evaluate("() => { SV.app.ieegClose && SV.app.ieegClose(); SV.app.ui.tab = 'quant'; SV.app.ensureSeeg().quantOpenId = SV.app.state.quant[0].id; SV.app.renderQuant(); }"); pg.wait_for_timeout(800)
    txt = pg.evaluate("(document.querySelector('.qx-prov') || {}).textContent || ''")
    check('à jour' in txt and 'EI 1.0.0' in txt and 'historique (1 calcul antérieur)' in txt, f'pastille de provenance : {txt!r}')
    pg.evaluate("() => document.querySelector('.qx-prov [data-a=prov]').click()"); pg.wait_for_timeout(500)
    check(pg.evaluate("document.querySelectorAll('.prov-body tbody tr').length") == 2, 'fenêtre de provenance : deux calculs')
    pg.screenshot(path=os.path.join(OUT, 'provenance.png'))
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'aucune erreur dans la console' + ('' if not errs else ' : ' + ' | '.join(errs[:5])))
    b.close()
print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'tout est ok'}")
sys.exit(1 if fails else 0)
