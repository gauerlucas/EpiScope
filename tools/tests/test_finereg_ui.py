#!/usr/bin/env python3
"""v3.5.0 — recalage fin et modèle de tête fin dans dist/EpiScope.html (Chromium headless, Playwright ; données synthétiques) :
   elastix embarqué exécuté dans un worker sans réseau (T1 du gabarit déplacé d'une translation connue, retrouvée) ; transformation
   rangée dans le dossier, relue (fineMniLoad) et utilisée par S.toMNI (« MNI fin (research-grade) » dans la carte), retour au
   rapide ; choix « BEM fin » du modèle de tête et surfaces lues sur un T1 synthétique dans la page.
   python3 tools/tests/test_finereg_ui.py      (après python3 tools/build.py)"""
import os
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 950}, locale='fr-FR'); pg = ctx.new_page(); errs = []; net = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    ctx.on('request', lambda r: net.append(r.url) if r.url.startswith('http') else None)
    pg.add_init_script("localStorage.setItem('sv_manual_hint','1')")
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    check(pg.evaluate("SV.app.fineAvailable() && !!SV.Elastix && !!SV._factories.elastixwasm"), 'elastix embarqué (fabriques et binaire WebAssembly)')
    # 1. elastix dans un worker : T1 du gabarit ramené à 4 mm, déplacé de (6, −4, 3) mm ; affine seule, rapide
    r = pg.evaluate("""async () => { const A = SV.app, tj = A.anatAsset('template_t1'), T1 = await SV.Nifti.read(SV.b64ToArray(tj.t1, Uint8Array));
      const f = 4, [nx, ny, nz] = T1.dims, mx = Math.floor(nx / f), my = Math.floor(ny / f), mz = Math.floor(nz / f), D = new Float32Array(mx * my * mz), s = T1.slope || 1, b0 = T1.inter || 0;
      for (let k = 0; k < mz; k++) for (let j = 0; j < my; j++) for (let i = 0; i < mx; i++) { let a = 0; for (let c = 0; c < f; c++) for (let bb = 0; bb < f; bb++) for (let aa = 0; aa < f; aa++) a += T1.data[(f * i + aa) + nx * ((f * j + bb) + ny * (f * k + c))]; D[i + mx * (j + my * k)] = a / f ** 3 * s + b0; }
      const Af = Array.from(T1.affine); for (const r of [0, 4, 8]) { for (const c of [0, 1, 2]) Af[r + c] *= f; Af[r + 3] += (f - 1) / 2 * (T1.affine[r] + T1.affine[r + 1] + T1.affine[r + 2]); }
      const F = { dims: [mx, my, mz], affine: Af, data: D, slope: 1, inter: 0 }, t = [6, -4, 3], M = { dims: F.dims, affine: Af.slice(), data: D, slope: 1, inter: 0 }; M.affine[3] -= t[0]; M.affine[7] -= t[1]; M.affine[11] -= t[2];
      const t0 = performance.now(), R = await SV.Work.run(['nifti', 'elastixwasm', 'elastix'], 'Elastix.register', [A.anatAsset('elastix').wasm, F, null, M, null, 'coreg', { linearOnly: true, changes: { affine: { NumberOfResolutions: ['2'], MaximumNumberOfIterations: ['200'] } } }], [], () => {});
      const tf = SV.Elastix.compile(SV.Elastix.unpack(JSON.parse(JSON.stringify(R.tpo)))), q = tf([10, 20, 30]); window._tpo = R.tpo;
      return { q, secs: (performance.now() - t0) / 1000, v: R.version, neg: R.jac.negPct }; }""")
    e = [r['q'][0] - 10 + 6, r['q'][1] - 20 - 4, r['q'][2] - 30 + 3]
    check(max(abs(x) for x in e) < 1.5 and r['neg'] == 0, f"elastix {r['v']} dans un worker : translation retrouvée à {max(abs(x) for x in e):.2f} mm près ({r['secs']:.0f} s)")
    # 2. transformation fine rangée dans le dossier, relue, utilisée par S.toMNI ; carte « MNI fin » ; retour au rapide
    r = pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, A = SV.app, d = S.newDossier({ pseudo: 'FR' }); d.subject = { site: 'HFAR', n: 11, label: 'HFAR0011' };
      d.anatomy = { status: 'done', date: '2025-02-10T10:00:00Z', toTemplate: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], segmentation: { age: 25 } };
      await L.save(d); await A.openDossier(d.id, { quiet: true }); const dd = A.dossier, file = 'derivatives/anat/sub-HFAR0011_from-T1w_to-' + S.TEMPLATE_SPACE + '_mode-elastix_xfm.json.gz';
      await L.writeFile(dd, file, await SV.Nifti.gzip(new TextEncoder().encode(JSON.stringify(window._tpo))));
      const before = S.toMNI(dd, [10, 20, 30]), g0 = S.mniGrade(dd);
      dd.anatomy.mni = { method: 'elastix', target: S.TEMPLATE_SPACE, file, date: S.now(), previous: null, elastix: { version: 'test', jac: { negPct: 0 } } };
      const g1 = S.mniGrade(dd); await A.fineMniLoad(dd); const after = S.toMNI(dd, [10, 20, 30]), g2 = S.mniGrade(dd), html = A.mniLine(dd.anatomy);
      dd.anatomy.mni = null; const g3 = S.mniGrade(dd);
      return { before, after, g0, g1, g2, g3, fine: /MNI fin \\(research-grade\\)/.test(html), redo: /Refaire le recalage fin/.test(html), approx: /MNI rapide/.test(A.mniLine(dd.anatomy)) }; }""")
    check(r['g0'] == 'approx' and r['g1'] == 'approx' and r['g2'] == 'research' and r['g3'] == 'approx', f"degré des coordonnées MNI : rapide → fin une fois la transformation relue → rapide {r['g0']}, {r['g1']}, {r['g2']}, {r['g3']}")
    check(abs(r['after'][0] - r['before'][0] + 6) < 1.5 and abs(r['after'][1] - r['before'][1] - 4) < 1.5, f"S.toMNI suit la transformation fine {r['before']} → {[round(x, 1) for x in r['after']]}")
    check(r['fine'] and r['redo'] and r['approx'], 'carte MNI : « MNI fin (research-grade) », refaire ; sinon « MNI rapide » et bouton du recalage fin')
    # 3. modèle de tête fin : choix proposé, surfaces lues sur un T1 synthétique dans la page
    r = pg.evaluate("""() => { const A = SV.app; A.esiHeadDialog(); const dlg = document.querySelector('#esiHeadDlg'), opt = dlg && dlg.querySelector('input[value=bemfine]'); const has = !!opt; dlg && dlg.remove();
      const B = SV.BEM, P = B.ageParams(null), nrm = p => Math.hypot(...p), t1At = p => { const r = nrm(p); return r < 70 ? 120 : r < 72.5 ? 55 : r < 79 ? 12 : r < 85 ? 105 : 2; };
      const H = B.headSurfacesTissue({ c: [0, 0, 0], zCut: -40, P, brainAt: p => nrm(p) < 70, scalpAt: p => t1At(p) > 20, t1At, nu: 12 });
      const up = [...Array(H.G.np).keys()].filter(i => H.G.rr[3 * i + 2] > 0.3), m = f => up.reduce((s, i) => s + f(i), 0) / up.length;
      return { has, np: H.G.np, is: m(i => H.r.is[i]), os: m(i => H.r.os[i]) }; }""")
    check(r['has'] and r['np'] == 1442 and abs(r['is'] - 72.5) < 1 and abs(r['os'] - 79) < 1, f"modèle de tête : choix « BEM fin », crâne lu sur le T1 (interne {r['is']:.1f}, externe {r['os']:.1f} mm)")
    check(not net, f'aucune requête réseau {net[:3]}')
    check(not errs, f'aucune erreur de page {errs[:3]}')
    b.close()
print('ÉCHECS :', fails) if fails else print('test_finereg_ui : tout est bon')
raise SystemExit(1 if fails else 0)
