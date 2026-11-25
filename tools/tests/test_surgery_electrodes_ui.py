#!/usr/bin/env python3
"""v2.4.0 — interventions hémisphérotomie et résection temporale + déconnexion pariéto-occipitale (régions emportées /
   déconnectées, peinture, éditeur), électrodes verticales BM (F1 → gyrus droit) et BL (F2 → orbitofrontal) de la
   bibliothèque (Chromium headless, gabarit livré ; aucune donnée de patient).   python3 tools/tests/test_surgery_electrodes_ui.py"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], locale='fr-FR', viewport={'width': 1500, 'height': 950})
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'CHIR' }); d.patient.dominant = 'L'; await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); }"); pg.wait_for_timeout(1200)
    # ---------------------------------------------------------------- interventions
    R = pg.evaluate("""() => { const A = SV.app, T = A.surgeryTemplates, sysOf = r => A.atlas.system(r);
      const h = A.surgeryRegions('hemispherotomy', 'R'), t = A.surgeryRegions('tpo', 'L');
      const paint = A.surgeryPaint(t.regions, t.extent, []), col = r => (paint.get(r) || []).slice(0, 3).join(',');
      const tR = t.regions.filter(r => t.extent[r] !== 'disc'), tD = t.regions.filter(r => t.extent[r] === 'disc');
      return { has: !!T.hemispherotomy && !!T.tpo, types: [T.hemispherotomy.type, T.tpo.type],
        hN: h.regions.length, hDisc: h.regions.every(r => h.extent[r] === 'disc'), hSide: h.regions.every(r => A.atlas.hemiOf[r] === 'R'), hSub: h.regions.some(r => sysOf(r) === 'subcortical'),
        tRes: [...new Set(tR.map(sysOf))].sort(), tDisc: [...new Set(tD.map(sysOf))].sort(), tCentral: t.regions.some(r => ['central', 'premotor'].includes(sysOf(r))),
        colRes: col(tR[0]), colDisc: col(tD[0]), ext: [A.surgeryExt(t.extent, tD[0]), A.surgeryExt(t.extent, tR[0]), A.surgeryExt({ 5: 0.5 }, 5)],
        label: A.surgeryLabel({ template: 'tpo', side: 'L' }), note: T.tpo.note(true) }; }""")
    check(R['has'] and R['types'] == ['disconnection', 'disconnection'], f'deux gabarits de déconnexion {R["types"]}')
    check(R['hN'] == 75 and R['hDisc'] and R['hSide'] and not R['hSub'], f'hémisphérotomie droite : 75 régions corticales de l’hémisphère, toutes déconnectées, noyaux gris exclus ({R["hN"]})')
    check(R['tRes'] == ['basal_temporal', 'lateral_temporal', 'mesial_temporal'] and R['tDisc'] == ['occipital', 'parietal_lateral', 'posterior_medial'] and not R['tCentral'], f'résection temporale + déconnexion pariéto-occipitale : temporal emporté {R["tRes"]}, pariéto-occipital déconnecté {R["tDisc"]}, sensorimoteur respecté')
    check(R['colRes'] == '220,62,62' and R['colDisc'] == '150,95,205', f'peinture : résection rouge, déconnexion violette ({R["colRes"]} / {R["colDisc"]})')
    check(R['ext'] == [' (déconnecté)', '', ' (partiel)'], f'mentions des régions {R["ext"]}')
    check(R['label'] == 'résection temporale + déconnexion pariéto-occipitale gauche' and 'langage' in R['note'], f'libellé et note (côté dominant) : {R["label"]}')
    # éditeur d'intervention : options du menu, application sur une procédure
    E = pg.evaluate("""() => { const A = SV.app, o = { template: '', side: 'R', regions: [], extent: {} }, box = A.surgeryEditor(o, [], () => {}, 'procedure'); document.body.appendChild(box);
      const opts = [...box.querySelectorAll('.tpl option')].map(x => x.textContent); const sel = box.querySelector('.tpl'); sel.value = 'hemispherotomy'; sel.onchange();
      const r = { opts, n: o.regions.length, type: o.type, leg: box.querySelector('.surg-leg').textContent, lbl: box.querySelector('.surg-regs .lbl').textContent }; box.remove(); return r; }""")
    check('hémisphérotomie' in E['opts'] and 'résection temporale + déconnexion pariéto-occipitale' in E['opts'], 'éditeur : les deux interventions au menu')
    check(E['n'] == 75 and E['type'] == 'disconnection' and 'déconnectée' in E['leg'] and 'déconnectées' in E['lbl'], f'éditeur : hémisphérotomie appliquée (75 régions, type déconnexion, légende) {E["n"]}')
    # ---------------------------------------------------------------- électrodes verticales
    G = pg.evaluate("""() => { const A = SV.app, El = SV.Electrodes, out = {};
      for (const [code, tgt, ext] of [['BM', 'Gyrus-rectus', 'F1-lateral-prefrontal'], ['BL', 'Orbito-frontal-cortex', 'F2-rostral']]) for (const h of ['L', 'R']) {
        const lib = El.LIBRARY.find(l => l.code === code), e = lib && El.fromLibrary(lib, h, A.atlas, A.vol, {}), fam = r => (A.atlas.regions[r] || {}).family;
        out[code + h] = e ? { name: e.name, up: +e.dir[2].toFixed(2), first: fam(e.contacts[0].label) === tgt || fam(e.contacts[1].label) === tgt, entry: fam(e.entryLabel) === ext, n: e.nContacts, len: Math.round(e.length) } : null; }
      out.opts = [...document.querySelectorAll('#elLib option')].map(o => o.value); return out; }""")
    for k in ['BML', 'BMR', 'BLL', 'BLR']:
        g = G.get(k)
        check(bool(g) and g['up'] >= 0.9 and g['first'] and g['entry'] and g['n'] >= 10, f'{k[:2]} {"gauche" if k[2] == "L" else "droite"} : verticale (dz {g and g["up"]}), plots profonds dans la cible, entrée dans la famille de sortie, {g and g["n"]} plots / {g and g["len"]} mm')
    check(G['BML']['name'] == 'BM’' and G['BLR']['name'] == 'BL', 'noms : prime pour la gauche')
    pg.evaluate("() => { SV.app.showScreen && SV.app.showScreen('case'); SV.app.setTab && SV.app.setTab('electrodes'); }"); pg.wait_for_timeout(800)
    opts = pg.evaluate("[...document.querySelectorAll('#elLib option')].map(o => o.value)")
    check(not opts or ('BM' in opts and 'BL' in opts), f'liste « Ajouter » de l’onglet Électrodes : BM et BL ({len(opts)} trajectoires)')
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    ctx.close()
print('ÉCHECS : ' + ', '.join(fails) if fails else 'tout est ok'); sys.exit(1 if fails else 0)
