"""Parcours SpikeNet2 (v2.1.0) dans dist/EpiScope.html : sans poids, le détecteur est proposé « poids à ajouter » et ne lance
rien ; ajout des poids depuis un point de contrôle SYNTHÉTIQUE (tools/tests/fixtures/spikenet2_synth.ckpt : poids aléatoires,
architecture réduite) ; détection sur un EEG de scalp synthétique (workers) ; empreinte notée ; retrait → corbeille des modèles ;
les poids ne vont ni dans le dossier ni dans l'export du patient."""
import os, sys, math, struct, random, tempfile
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CKPT = os.path.join(ROOT, 'tools', 'tests', 'fixtures', 'spikenet2_synth.ckpt')
ok = True
def check(c, m):
    global ok; print(('ok   ' if c else 'ÉCHEC'), m); ok = ok and bool(c)
CH = ['Fp1', 'F3', 'C3', 'P3', 'F7', 'T3', 'T5', 'O1', 'Fz', 'Cz', 'Pz', 'Fp2', 'F4', 'C4', 'P4', 'F8', 'T4', 'T6', 'O2']
FS, N = 256, 90
random.seed(5)
def edf(path):
    ns = len(CH); hdr = b''.join(x.ljust(n).encode('latin1')[:n] for x, n in [('0', 8), ('X X X X', 80), ('Startdate 09-JUL-2025 X X X', 80), ('09.07.25', 8), ('05.36.00', 8), (str(256 * (ns + 1)), 8), ('', 44), (str(N), 8), ('1', 8), (str(ns), 4)])
    f = lambda vals, n: b''.join(str(v).ljust(n).encode('latin1')[:n] for v in vals)
    hdr += f(['EEG ' + c for c in CH], 16) + f([''] * ns, 80) + f(['uV'] * ns, 8) + f([-3200] * ns, 8) + f([3200] * ns, 8) + f([-32768] * ns, 8) + f([32767] * ns, 8) + f([''] * ns, 80) + f([FS] * ns, 8) + f([''] * ns, 32)
    body = bytearray()
    for r in range(N):
        for k, c in enumerate(CH): body += struct.pack('<%dh' % FS, *[max(-32768, min(32767, int((15 * math.sin(2 * math.pi * 9 * (r + i / FS) + k) + random.gauss(0, 8)) / 3200 * 32767))) for i in range(FS)])
    open(path, 'wb').write(hdr + body)
tmp = tempfile.mkdtemp(); EDF = os.path.join(tmp, 'scalp_synth.edf'); edf(EDF)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1500, 'height': 950}, locale='fr-FR'); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.add_init_script("localStorage.setItem('sv_manual_hint','1')")
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'SN2' }), ex = S.addExploration(d, { kind: 'phase1', start: '2025-07-08' });
      await L.save(d); await SV.app.openDossier(d.id, { quiet: true }); SV.app.go({ stage: 'ex:' + ex.id, view: 'analyses' }); }""")
    pg.wait_for_timeout(1500)
    pg.evaluate("() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'sn2edf'; document.body.appendChild(i); }")
    pg.set_input_files('#sn2edf', EDF)
    pg.evaluate("async () => { await SV.app.ieegImport([...document.getElementById('sn2edf').files]); await SV.app.ieegOpen(SV.app.ieegEx().recordings[0]); }"); pg.wait_for_timeout(2000)
    # 1. sans poids : proposé « à ajouter », rien n'est lancé
    r = pg.evaluate("""async () => { const A = SV.app, V = A._iev; V.meth = 'esp'; A.ieegTabs && A.ieegTabs(); await A.sn2Refresh(); const P = A.esiP('esp'); P.det = 'spikenet2'; A.esiRender();
      const opt = [...document.querySelectorAll('.e-det option')].find(o => o.value === 'spikenet2'); await A.esiSpikeDetect({ replace: true }); await new Promise(r => setTimeout(r, 800)); const dlg = !!document.querySelector('.sn2-file');
      document.querySelectorAll('.modal').forEach(m => m.remove()); return { opt: opt && opt.textContent, last: !!(V.rec.esp && V.rec.esp.last), dlg, btn: !!document.querySelector('.e-sn2') }; }""")
    check(r['opt'] and 'poids à ajouter' in r['opt'] and not r['last'] and r['dlg'] and r['btn'], f'sans poids : détecteur « {r["opt"]} », aucune détection, fenêtre d’ajout ouverte')
    # 2. ajout des poids (point de contrôle synthétique) par la fenêtre
    pg.evaluate("() => SV.app.sn2Dialog()"); pg.wait_for_timeout(300)
    pg.set_input_files('.sn2-file', CKPT)
    pg.wait_for_function("() => !document.querySelector('.sn2-file')", timeout=60000)
    r = pg.evaluate("async () => { const H = await SV.app.sn2Refresh(); return H && { sha: H.sha, stages: H.cfg.stages.length, src: H.source, n: H.nParams }; }")
    check(r and r['stages'] == 7 and r['src'] == 'spikenet2_synth.ckpt', f'poids ajoutés : {r and r["n"]} paramètres, empreinte {r and r["sha"][:12]}')
    # 3. détection SpikeNet2 (workers)
    r = pg.evaluate("""async () => { const A = SV.app, V = A._iev, P = A.esiP('esp'); P.det = 'spikenet2'; P.thr = 0.3; P.start = 0; P.end = 80; A.esiRender();
      await A.esiSpikeDetect({ replace: true }); const Lr = V.rec.esp.last; return { det: Lr && Lr.det, model: Lr && Lr.model, n: Lr && Lr.n, pm: Lr && Lr.pm && Lr.pm.length, work: SV.Work.available }; }""")
    check(r['det'] == 'spikenet2' and r['model'] and r['model']['name'] == 'SpikeNet2' and r['pm'] >= 79 and r['work'], f'détection SpikeNet2 (workers) : {r["n"]} pointes, empreinte du modèle notée {r["model"]}')
    # 4. les poids ne sont ni dans le dossier ni dans l'export du patient
    r = pg.evaluate("""async () => { const d = SV.app.dossier; const L = SV.Library, files = d ? await L.listFiles(d) : [];
      return { files: files.filter(f => /epsn2|ckpt|model/i.test(f)), json: d ? /EPSN2|"cfg"/.test(JSON.stringify(d)) : null }; }""")
    check(not r['files'] and r['json'] is False, f'poids absents des fichiers et du dossier du patient {r}')
    # 5. retrait → corbeille des modèles
    r = pg.evaluate("""async () => { await SV.Library.removeModel('spikenet2'); const H = await SV.app.sn2Refresh(); return { H, again: !!(await SV.Library.getModel('spikenet2')) }; }""")
    check(r['H'] is None and not r['again'], 'poids retirés (rangés dans la corbeille des modèles)')
    check(not errs, f'aucune erreur de page {errs[:3]}')
    b.close()
print('OK SpikeNet2 (interface)' if ok else 'ÉCHEC'); sys.exit(0 if ok else 1)
