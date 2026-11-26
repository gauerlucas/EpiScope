#!/usr/bin/env python3
"""v3.2.0 — interface (Chromium headless, Playwright ; électrodes du cas d'exemple synthétique, volumes générés ici) :
   intercritique pointé sur les plots (catégories, clic, glisser, groupe repris d'un jeu de valeurs, phrases du rapport) ;
   onglet « Quantifs » d'une crise ; cortex et plots de la crise dans « Affichage ▾ » ; calques supplémentaires des coupes
   (volume de résection segmenté, avec son contour) ; écran de l'intervention (coupes à côté des contacts, légendes) ;
   écran Imagerie dans l'espace du gabarit MNI (images du patient ramenées par l'affine).
   python3 tools/tests/test_v32_ui.py   (après python3 tools/build.py)"""
import os, sys, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
FX = json.load(open(os.path.join(ROOT, 'tools/tests/fixtures/exemple_seeg_temporal_mesial_gauche.json'), encoding='utf-8'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

# volumes synthétiques : « T1 » (boule claire dans une tête), cavité (petite boule), dans le même espace
VOLS = """async (d) => { const S = SV.Store, L = SV.Library, n = 48, A = [4, 0, 0, -96, 0, 4, 0, -110, 0, 0, 4, -80, 0, 0, 0, 1];
  const mk = f => { const data = new Int16Array(n * n * n); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[i + n * j + n * n * k] = f(i, j, k); return { dims: [n, n, n], pixdim: [4, 4, 4], affine: Float64Array.from(A), data, slope: 1, inter: 0 }; };
  const t1 = mk((i, j, k) => { const r = Math.hypot(i - 24, j - 26, k - 22); return r < 18 ? (r < 12 ? 100 : 65) : r < 21 ? 20 : 5; });
  const cav = mk((i, j, k) => Math.hypot(i - 15, j - 30, k - 22) < 4 ? 1 : 0);
  const out = {};
  for (const [key, vol, o] of [['t1', t1, { modality: 'T1', timepoint: 'preop', date: '2021-01-10', ref: true }], ['cav', cav, { modality: 'T1', timepoint: 'postop', date: '2022-06-21', label: 'T1 · cavité de résection', coreg: { T: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], text: 'identité (test)' }, derived: { kind: 'cavity', short: 'Cavité', cmap: 'red', win: [0, 1] } }]]) {
    const u8 = await SV.Nifti.encodeGz(vol), im = S.addImaging(d, Object.assign({ bytes: u8.length, dims: vol.dims, pixdim: vol.pixdim }, o)); im.file = 'imaging/' + im.id + '.nii.gz'; await L.writeFile(d, im.file, u8); out[key] = im.id; }
  return out; }"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1700, 'height': 1000}, locale='fr-FR'); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    ids = pg.evaluate("""async (E) => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'V32UI' }), ex = S.addExploration(d, { kind: 'seeg', start: '2021-06-01' }); ex.electrodes = E;
      const z = S.addSeizure(d, ex.id, { label: 'Crise 1' }); await L.save(d); await SV.app.openDossier(d.id, { quiet: true, ctx: { explorationId: ex.id } });
      return { d: d.id, ex: ex.id, z: z.id }; }""", FX['electrodes'])
    pg.wait_for_timeout(2000)

    # ---------------------------------------------------------------- intercritique pointé
    pg.evaluate("(id) => SV.app.go({ stage: 'ex:' + id, view: 'inter' })", ids['ex']); pg.wait_for_timeout(1500)
    check(pg.locator('#inMarks .im-card').count() == 1, 'onglet Intercritique : carte « Pointage des plots »')
    nchips = pg.locator('#inMarks .im-grid .im-c').count(); check(nchips > 40, f'plots de toutes les électrodes ({nchips})')
    # rythme lésionnel : trois clics
    for i in range(3): pg.locator('#inMarks .im-grid .im-c').nth(i).click(); pg.wait_for_timeout(120)
    les = pg.evaluate("(id) => Object.keys(SV.app.dossier.explorations.find(e => e.id === id).inter.lesional)", ids['ex'])
    check(len(les) == 3, f'rythme lésionnel : trois plots pointés {les}')
    # groupe de pointes : glisser sur les plots 5 à 9 de la première électrode
    pg.click('#inMarks [data-a=add]'); pg.wait_for_timeout(300)
    row = pg.locator('#inMarks .im-grid .sz-el').nth(1); chips = row.locator('.im-c')
    b0, b4 = chips.nth(0).bounding_box(), chips.nth(4).bounding_box()
    pg.mouse.move(b0['x'] + 5, b0['y'] + 5); pg.mouse.down(); pg.mouse.move(b4['x'] + 5, b4['y'] + 5, steps=12); pg.mouse.up(); pg.wait_for_timeout(400)
    G = pg.evaluate("(id) => { const ex = SV.app.dossier.explorations.find(e => e.id === id); return ex.inter.groups.map(g => ({ l: g.label, n: g.contacts.length, c: g.contacts })); }", ids['ex'])
    check(len(G) == 1 and G[0]['n'] == 5, f'groupe de pointes : glisser sur cinq plots {G}')
    pg.select_option('#inMarks [data-g=freq]', 'rare'); pg.fill('#inMarks [data-g=when]', 'J3 nuit'); pg.wait_for_timeout(300)
    pg.click('#inMarks [data-a=dup]'); pg.wait_for_timeout(300)
    G2 = pg.evaluate("(id) => SV.app.dossier.explorations.find(e => e.id === id).inter.groups.map(g => [g.label, g.contacts.length, g.freq])", ids['ex'])
    check(len(G2) == 2 and G2[1][1] == 5 and 'autre moment' in G2[1][0], f'groupe dupliqué pour un autre moment {G2}')
    sug = pg.evaluate("(id) => { const A = SV.app, ex = A.dossier.explorations.find(e => e.id === id); return { i: A.seegSuggest(ex, 'irritative'), l: A.seegSuggest(ex, 'lesional') }; }", ids['ex'])
    check('pointes synchrones rares' in sug['i'] and 'J3 nuit' in sug['i'] and 'lésionnelle' in sug['l'], f'rapport SEEG : phrases proposées {sug}')
    # jeu de valeurs intercritique → groupe
    pg.evaluate("""(id) => { const A = SV.app, ex = A.dossier.explorations.find(e => e.id === id), q = { id: 'qInter', name: 'Taux de pointes · test', unit: '/min', cmap: 'inferno', mode: 'both', min: 0, max: 10, values: { 'A’1-2': 9, 'A’2-3': 6, 'B’1-2': 2 } };
      (A.state.quant = A.state.quant || []).push(q); ex.quant = ex.quant || []; if (!ex.quant.includes(q)) ex.quant.push(q); A.go({ stage: 'ex:' + id, view: 'inter' }); }""", ids['ex']); pg.wait_for_timeout(1200)
    check(pg.locator('#inMarks .im-q .im-qrow').count() == 1, 'quantifications intercritiques listées dans la carte')
    pg.click('#inMarks .im-q .im-tog'); pg.wait_for_timeout(400)
    G3 = pg.evaluate("(id) => { const g = SV.app.dossier.explorations.find(e => e.id === id).inter.groups.slice(-1)[0]; return g.contacts.slice().sort(); }", ids['ex'])
    check(G3 == sorted(['A’1', 'A’2', 'A’3']), f'« → groupe » : plots ≥ 50 % du maximum repris {G3}')
    pg.screenshot(path=os.path.join(OUT, 'v32_intercritique.png'))

    # ---------------------------------------------------------------- crise : onglet Quantifs, cortex et plots de la crise
    r = pg.evaluate("""async (o) => { const A = SV.app, S = SV.Store, ex = A.dossier.explorations.find(e => e.id === o.ex);
      await A.openSeizure(o.z); await new Promise(r => setTimeout(r, 1500));
      const q = { id: 'qEI', name: 'EI · Crise 1', cmap: 'inferno', mode: 'both', min: 0, max: 1, method: 'ei', seizureId: o.z, values: { 'A’1-2': 0.9, 'A’2-3': 0.7, 'B’4-5': 0.3 } };
      A.state.quant.push(q); if (ex.quant !== A.state.quant) ex.quant.push(q);
      const sz = A.currentSeizure(); sz.seeg = sz.seeg || { onset: {} }; sz.seeg.onset = { 'A’1': 'onset', 'A’2': 'onset', 'B’4': 'early', 'B’5': 'late' };
      A.setTab('szquant'); A.refreshMarkers(); await new Promise(r => setTimeout(r, 500));
      return { wm: A.ui.wm, tabs: [...document.querySelectorAll('#tabs [data-tab]')].filter(b => !b.hidden).map(b => b.dataset.tab), rows: document.querySelectorAll('#tab-szquant .szq-row').length, agree: (document.querySelector('#tab-szquant .szq-agree') || {}).textContent || '',
        paint: A.viewer && A.viewer.paints && A.viewer.paints.szOnset ? A.viewer.paints.szOnset.size : -1, marks: A.onsetMarkers().length }; }""", ids)
    check(r['wm'] == 'semioSeeg' and r['tabs'][:3] == ['seegsz', 'szquant', 'network'], f'onglet « Quantifs » à côté d’Électrique : {r["tabs"]}')
    check(r['rows'] == 1 and '2/2' in r['agree'], f'jeu de la crise listé ({r["rows"]}), accord avec l’analyse visuelle : {r["agree"]!r}')
    check(r['marks'] == 4, f'plots marqués dans la vue 3D ({r["marks"]})')
    check(r['paint'] >= 1, f'peinture des régions des plots marqués ({r["paint"]} régions)')
    pg.screenshot(path=os.path.join(OUT, 'v32_seizure_quant.png'))
    d3 = pg.evaluate("""async () => { const A = SV.app, V3 = A.viewer, html = A.dispExtraHtml(V3.active); A.planMenu(document.getElementById('btnDisp') || document.body, V3.active); await new Promise(r => setTimeout(r, 300));
      const btn = k => document.querySelector('.disp-menu [data-szc="' + k + '"]'); const out = { html: html.includes('Crise SEEG') };
      btn('onset').click(); out.onset = V3.activeCfg.paint; btn('none').click(); out.none = [V3.activeCfg.neutral, V3.activeCfg.paint]; btn('act').click(); out.act = [V3.activeCfg.neutral, V3.activeCfg.paint];
      const m = document.querySelector('.disp-menu [data-szm]'); m.click(); out.marks = V3.activeCfg.onsetMarks; m.click(); A.closeMenu(); return out; }""")
    check(d3['html'] and d3['onset'] == 'szOnset' and d3['none'] == [True, None] and d3['act'] == [False, None], f'« Affichage ▾ › Crise SEEG » : activation, plots marqués, aucune {d3}')
    check(d3['marks'] is False, 'plots de début et de propagation masquables dans la vue 3D')
    lab = pg.evaluate("() => { const L = SV.app.sliceLabelLayer('onset', 'tpl'); return L ? { n: L.lut.size, name: L.name } : null; }")
    check(lab and lab['n'] >= 1, f'coupes : parcellation « régions des plots de la crise » {lab}')

    # ---------------------------------------------------------------- intervention : coupes à côté des contacts, calques
    v = pg.evaluate("async () => { const f = " + VOLS + "; return f(SV.app.dossier); }")
    pid = pg.evaluate("""(v) => { const A = SV.app, S = SV.Store, d = A.dossier, ex0 = d.explorations[0]; ex0.electrodes[0].real = { contacts: [[-20, -10, -15], [-23.5, -10, -15], [-27, -10, -15], [-30.5, -10, -15]] };
      const p = S.addProcedure(d, { type: 'resection', date: '2022-06-01', side: 'L', regions: [] }); p.postopImagingId = null;
      p.resection.cavity = { imagingId: v.cav, postopId: null, volumeMl: 16.9, thr: 0.3, nContacts: 0, regions: [] }; A.touch(); A.go({ stage: 'proc:' + p.id }); return p.id; }""", v)
    pg.wait_for_timeout(4000)
    lay = pg.evaluate("""() => ({ cols: !!document.querySelector('.resect .rs-cols'), side: !!document.querySelector('.resect .rs-side #vpSlices'), lone: document.querySelectorAll('.card > .surg-slices').length,
      leg: document.querySelectorAll('.resect .rs-leg > span').length, groups: [...document.querySelectorAll('.ssl-leg .ssl-g')].map(g => g.textContent.replace(/\\s+/g, ' ').trim()),
      layers: SV.app.slices ? SV.app.slices.layers.map(l => l.id) : [], contours: SV.app.slices ? SV.app.slices.contours.length : -1 })""")
    check(lay['cols'] and lay['side'] and lay['lone'] == 0, f'coupes à côté des contacts (plus de carte en dessous) {lay}')
    check(lay['leg'] == 4, f'légende des contacts : quatre états ({lay["leg"]})')
    check(any('Volume de résection segmenté' in g for g in lay['groups']) and any('Zone épileptogène' in g and 'hors intervention' in g for g in lay['groups']), f'légende des coupes rangée par objet {lay["groups"]}')
    check('xl:cavity' in lay['layers'] and lay['contours'] >= 1, f'calque « volume de résection segmenté » et son contour {lay["layers"]}')
    pg.screenshot(path=os.path.join(OUT, 'v32_intervention.png'))
    pg.evaluate("() => { const cb = document.querySelector('.ssl-leg [data-xl=cavity]'); cb.click(); }"); pg.wait_for_timeout(1200)
    check(pg.evaluate("() => !SV.app.slices.layers.some(l => l.id === 'xl:cavity')"), 'case décochée : calque retiré')

    # ---------------------------------------------------------------- Imagerie : espace du gabarit MNI
    pg.evaluate("() => SV.app.go({ stage: 'dossier', view: 'imagerie' })"); pg.wait_for_timeout(3000)
    sp = pg.evaluate("() => { const b = document.querySelector('#imPanel .ip-space [data-sp=tpl]'); return b ? { dis: b.disabled } : null; }")
    check(sp and sp['dis'], f'bouton « Gabarit » présent, inactif sans anatomie calculée {sp}')
    # anatomie simulée : transformation patient → gabarit (translation)
    tp = pg.evaluate("""async (v) => { const A = SV.app, M4 = SV.Mat4, T = M4.identity(); T[3] = 2; T[7] = -3; T[11] = 4; A.patientAnat = Object.assign(A.patientAnat || {}, { toTemplate: T, fromTemplate: M4.inv(T) });
      A.renderImagingBar(); A.slvState().overlays = [{ id: v.cav, on: true, opacity: 0.6 }]; A.setDockSpace('tpl'); await new Promise(r => setTimeout(r, 3500));
      const L = A.slices.layers, ov = L.find(l => l.id === 'ov:' + v.cav); return { space: A.slvSpace(), base: L[0].name, ov: !!ov, T: ov && ov.T ? [ov.T[3], ov.T[7], ov.T[11]] : null, on: !!document.querySelector('#imPanel .ip-space [data-sp=tpl].on'), lay: !!document.querySelector('#imPanel [data-a=layers]') }; }""", v)
    check(tp['space'] == 'tpl' and 'MNI' in tp['base'] and tp['on'], f'écran Imagerie dans l’espace du gabarit {tp}')
    check(tp['ov'] and tp['T'] == [2, -3, 4] and tp['lay'], f'image du patient ramenée par l’affine patient → gabarit {tp}')
    pg.screenshot(path=os.path.join(OUT, 'v32_imagerie_mni.png'))
    pg.evaluate("() => SV.app.setDockSpace('pat')"); pg.wait_for_timeout(2000)
    check(pg.evaluate("SV.app.slvSpace()") == 'pat', 'retour à l’espace du patient')

    # ---------------------------------------------------------------- coupes de la crise : plots marqués, calque « plots de la crise »
    sl = pg.evaluate("""async (o) => { const A = SV.app; await A.openSeizure(o.z); await new Promise(r => setTimeout(r, 1500)); A.ui.dockSpace = 'tpl'; document.getElementById('btnDock').click(); await new Promise(r => setTimeout(r, 3500));
      const S3 = A.slices, m = S3 ? (S3.markers || []).filter(x => x.szk) : []; return { space: A.slvSpace(), wm: A.ui.wm, n: m.length, onset: m.filter(x => x.color === '#ff4d5e').map(x => x.szk).sort(), kinds: A.extraLayerKinds().map(x => x.k) }; }""", ids)
    check(sl['wm'] == 'semioSeeg' and sl['n'] == 4 and sl['onset'] == ['A’1', 'A’2'], f'coupes de la crise : plots début / précoce / tardive {sl}')
    check('onset' in sl['kinds'], f'calques supplémentaires proposés dans la crise : {sl["kinds"]}')
    pg.screenshot(path=os.path.join(OUT, 'v32_seizure_slices.png'))
    errs = [e for e in errs if 'favicon' not in e]
    check(not errs, 'aucune erreur dans la console' + ('' if not errs else ' : ' + ' | '.join(errs[:5])))
    b.close()
print(f"\n{'ÉCHECS : ' + str(len(fails)) if fails else 'tout est ok'}")
sys.exit(1 if fails else 0)
