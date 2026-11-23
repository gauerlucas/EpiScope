#!/usr/bin/env python3
"""v2.0.0 — pointes intercritiques (Chromium headless, Playwright, EEG de scalp synthétique généré ici) : pointes marquées
   à la main sans détection puis moyennées, vue « papillon » à l'échelle du tracé, informations du tracé (titre, notes),
   analyses intercritiques d'un tracé qui contient aussi une crise : rangées dans « Analyses intercritiques » et reprises
   dans l'onglet Intercritique.   python3 tools/tests/test_spikes_ui.py   (après tools/build.py)"""
import os, sys, math, random, struct, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

# ---------------------------------------------------------------- EDF de scalp synthétique : 19 voies 10-20, 256 Hz, 120 s,
# pointes négatives sur F4 / C4 (et voisines) aux secondes 10, 20, … 100 ; aucune donnée de patient
FS, N = 256, 120
CH = ['Fp1', 'Fp2', 'F7', 'F3', 'Fz', 'F4', 'F8', 'T3', 'C3', 'Cz', 'C4', 'T4', 'T5', 'P3', 'Pz', 'P4', 'T6', 'O1', 'O2']
W = {'F4': 1.0, 'C4': 0.9, 'Fz': 0.4, 'F8': 0.5, 'Cz': 0.3, 'P4': 0.3, 'T4': 0.4}
SPK = [10 * k + 0.37 for k in range(1, 11)]
random.seed(3)
def sample(c, t):
    v = 12 * math.sin(2 * math.pi * 9.5 * t + CH.index(c)) + random.gauss(0, 6)
    for s in SPK:
        dt = t - s
        if -0.1 < dt < 0.3: v += -W.get(c, 0.05) * (160 * math.exp(-(dt / 0.018) ** 2) - 45 * math.exp(-((dt - 0.09) / 0.06) ** 2))
    return v
def edf(path):
    ns = len(CH); hdr = b''.join(x.ljust(n).encode('latin1')[:n] for x, n in [('0', 8), ('X X X X', 80), ('Startdate 09-JUL-2025 X X X', 80), ('09.07.25', 8), ('05.36.00', 8), (str(256 * (ns + 1)), 8), ('', 44), (str(N), 8), ('1', 8), (str(ns), 4)])
    f = lambda vals, n: b''.join(str(v).ljust(n).encode('latin1')[:n] for v in vals)
    hdr += f(['EEG ' + c for c in CH], 16) + f([''] * ns, 80) + f(['uV'] * ns, 8) + f([-3200] * ns, 8) + f([3200] * ns, 8) + f([-32768] * ns, 8) + f([32767] * ns, 8) + f([''] * ns, 80) + f([FS] * ns, 8) + f([''] * ns, 32)
    body = bytearray()
    for r in range(N):
        for c in CH: body += struct.pack('<%dh' % FS, *[max(-32768, min(32767, int(sample(c, r + i / FS) / 3200 * 32767))) for i in range(FS)])
    open(path, 'wb').write(hdr + body)
tmp = tempfile.mkdtemp(); EDF = os.path.join(tmp, 'scalp_synth.edf'); edf(EDF)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1500, 'height': 950}, locale='fr-FR'); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'SPK' }), ex = S.addExploration(d, { kind: 'phase1', start: '2025-07-08' });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); SV.app.go({ stage: 'ex:' + ex.id, view: 'analyses' }); }""")
    pg.wait_for_timeout(1500)
    pg.evaluate("() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'spkfile'; document.body.appendChild(i); }")
    pg.set_input_files('#spkfile', EDF)
    pg.evaluate("async () => { await SV.app.ieegImport([...document.getElementById('spkfile').files]); await SV.app.ieegOpen(SV.app.ieegEx().recordings[0]); }"); pg.wait_for_timeout(2500)
    # pointes marquées à la main, sans détection
    r = pg.evaluate("""async (T) => { const A = SV.app, V = A._iev; for (const t of T) await A.esiSpikeManual(t); await new Promise(r => setTimeout(r, 1500)); await A.esiSpikeAverage(0);
      const Lr = V.rec.esp.last; return { det: Lr.det, n: Lr.n, cl: Lr.clusters.length, avg: !!V.espAvg, pre: V.espAvg && V.espAvg.pre, dpre: V.espAvg && V.espAvg.disp && V.espAvg.disp.pre, fs: V.mem.fs, ch: Lr.events.map(e => e.c) }; }""", SPK[:6])
    check(r['det'] == 'manual' and r['n'] == 6 and r['cl'] == 1 and r['avg'], f'pointes marquées à la main puis moyennées {r}')
    check(r['dpre'] and r['dpre'] > r['pre'], f'papillon à l’échelle du tracé (fenêtre ±{(r["dpre"] or 0) / r["fs"]:.2f} s au lieu de ±0,3 s)')
    check(all(c in ('F4', 'C4', 'F8') for c in r['ch']), f'voie de la pointe {set(r["ch"])}')
    pg.evaluate("() => { const A = SV.app, V = A._iev; V.meth = 'esp'; V.t = 15; A.ieegTabs && A.ieegTabs(); A.esiRender(); A.ieegDraw(); }"); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(ROOT, 'tools', 'tests', 'out', 'spikes_manual.png'))
    # informations du tracé
    pg.click('.ie-title'); pg.wait_for_timeout(300)
    check(pg.is_visible('#recInfoDlg'), 'informations du tracé : fenêtre ouverte depuis le titre')
    pg.fill('#recInfoDlg .ri-t', 'EEG nuit J1'); pg.fill('#recInfoDlg .ri-n', 'sevrage J1'); pg.select_option('#recInfoDlg .ri-k', 'both'); pg.click('#recInfoDlg .ri-ok'); pg.wait_for_timeout(300)
    ri = pg.evaluate("() => { const r = SV.app.ieegEx().recordings[0]; return { t: r.title, n: r.notes, k: r.kind, i: r.inter, h: document.querySelector('.ie-title').textContent }; }")
    check(ri['t'] == 'EEG nuit J1' and ri['n'] == 'sevrage J1' and ri['i'] is True and ri['h'] == 'EEG nuit J1', f'titre, notes et nature enregistrés {ri}')
    # tracé avec crise et intercritique : les pointes vont dans « Analyses intercritiques » et dans l'onglet Intercritique
    pg.evaluate("""() => { const A = SV.app, S = SV.Store, d = A.dossier, ex = d.explorations[0], r = ex.recordings[0], z = S.addSeizure(d, ex.id, { datetime: '2025-07-09T05:37' });
      S.recSetSeizure(r, z.id); r.marks.onset = 60; r.kind = 'ictal'; r.inter = true; A.touch(); A.ieegClose && A.ieegClose(); A.go({ stage: 'ex:' + ex.id, view: 'analyses' }); }"""); pg.wait_for_timeout(1500)
    sec = pg.evaluate("""() => [...document.querySelectorAll('.rc-sec')].map(s => ({ h: s.querySelector('.rc-sec-h').textContent, spk: [...s.querySelectorAll('[data-go=esp]')].length }))""")
    check(len(sec) == 2 and sec[0]['spk'] == 0 and sec[1]['spk'] == 1, f'pointes rangées dans « Analyses intercritiques » {sec}')
    pg.evaluate("() => SV.app.go({ stage: 'ex:' + SV.app.dossier.explorations[0].id, view: 'inter' })"); pg.wait_for_timeout(1000)
    check(pg.evaluate("!!document.querySelector('#p1InterAn .p1-an-r [data-go=esp]')"), 'onglet Intercritique : analyses des pointes reprises')
    check(not errs, f'aucune erreur : {errs[:3]}')
    b.close()
print('\nOK pointes intercritiques (interface)' if not fails else f'\n{len(fails)} échec(s)')
sys.exit(1 if fails else 0)
