#!/usr/bin/env python3
"""v2.0.0 — export de recherche BIDS anonymisé (Chromium headless, Playwright, données synthétiques) : archive .zip,
   arborescence BIDS, en-tête EDF anonymisé et daté autrement, électrodes ScanRAS / MNI152NLin2009bAsym, dérivés, aucune identité ;
   patient refusé quand une annotation de tracé porte son nom ; décalage des dates identique d'un export à l'autre.
   python3 tools/tests/test_research_ui.py   (après tools/build.py)"""
import os, sys, io, zipfile, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)
SETUP = """async () => { const S = SV.Store, L = SV.Library, A = SV.app;
  const mk = async (code, last, first, ann) => { const d = S.newDossier({ pseudo: first + ' ' + last }); d.subject = { label: code, site: 'HFAR', n: +code.slice(4) };
    Object.assign(d.identity, { lastName: last, firstName: first, birthDate: '2009-05-17', ipp: '55' + code.slice(4) + '0001' }); Object.assign(d.patient, { sex: 'F', handedness: 'L' });
    d.anatomy = { toTemplate: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1] };
    const ex = S.addExploration(d, { kind: 'seeg', start: '2025-04-01' }); ex.electrodes = [{ name: 'B', hemi: 'R', real: { contacts: [[20, 0, 0], [23.5, 0, 0]] } }];
    const p = `ses-seeg1/ieeg/sub-${code}_ses-seeg1_task-seizure_run-01_ieeg.edf`, h = new Uint8Array(1024).fill(32), put = (o, s) => { for (let i = 0; i < s.length; i++) h[o + i] = s.charCodeAt(i); };
    put(0, '0'); put(8, `X F 17-MAY-2009 ${last}_${first}`); put(88, 'Startdate 02-APR-2025 X X X'); put(168, '02.04.25'); put(176, '10.00.00'); put(256, ann);
    const r = S.bindRec({ id: 'R1', title: 'crise', kind: 'ictal', fs: 256, line: 50, duration: 60, files: { edf: p }, channels: [{ name: 'B1', type: 'SEEG' }], events: [{ onset: 3, label: ann }], clock: { start: '2025-04-02T10:00:00', blocks: [{ t0: 0, t1: 60, r0: 0 }] } });
    ex.recordings = [r]; const z = S.addSeizure(d, ex.id, { datetime: '2025-04-02T10:00' }); S.recSetSeizure(r, z.id); r.marks.onset = 3;
    await L.save(d); await L.writeFile(d, p, h); return d.id; };
  const a = await mk('HFAR0101', 'Martineau', 'Lise', 'sz start'), b = await mk('HFAR0102', 'Ferrandez', 'Paul', 'appel Ferrandez');
  return [a, b]; }"""
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(accept_downloads=True, viewport={'width': 1400, 'height': 900}, locale='fr-FR'); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    ids = pg.evaluate(SETUP)
    def export():
        with pg.expect_download() as dl:
            rep = pg.evaluate("async ids => await SV.app.researchExport(ids, { dir: null })", ids)
        return rep, zipfile.ZipFile(io.BytesIO(open(dl.value.path(), 'rb').read()))
    rep, z = export(); names = z.namelist()
    check(rep['subjects'] == ['HFAR0101'] and rep['refused'] and rep['refused'][0]['sub'] == 'HFAR0102', f'patient refusé si son nom est dans une annotation {rep["subjects"]} {rep["refused"]}')
    edfp = 'sub-HFAR0101/ses-seeg1/ieeg/sub-HFAR0101_ses-seeg1_task-seizure_run-01_ieeg.edf'
    need = ['dataset_description.json', 'participants.tsv', 'participants.json', 'README', edfp, 'sub-HFAR0101/ses-seeg1/ieeg/sub-HFAR0101_ses-seeg1_task-seizure_run-01_channels.tsv', 'sub-HFAR0101/ses-seeg1/ieeg/sub-HFAR0101_ses-seeg1_task-seizure_run-01_events.tsv',
            'sub-HFAR0101/ses-seeg1/ieeg/sub-HFAR0101_ses-seeg1_space-ScanRAS_electrodes.tsv', 'sub-HFAR0101/ses-seeg1/ieeg/sub-HFAR0101_ses-seeg1_space-MNI152NLin2009bAsym_electrodes.tsv', 'derivatives/episcope/sub-HFAR0101/sub-HFAR0101_seizures.tsv', 'derivatives/episcope/dataset_description.json']
    miss = [n for n in need if n not in names]
    check(not miss, f'arborescence BIDS complète (manque : {miss})')
    check(not any('HFAR0102' in n for n in names), 'rien du patient refusé dans l’archive')
    hdr = z.read(edfp)[:256].decode('latin1')
    check(hdr[8:15] == 'X X X X' and 'Martineau' not in hdr and hdr[168:176] != '02.04.25' and hdr[176:184] == '10.00.00', f'en-tête EDF anonymisé, date décalée ({hdr[168:184]})')
    allt = b''.join(z.read(n) for n in names).decode('latin1')
    check(not any(s.lower() in allt.lower() for s in ['Martineau', 'Lise Martineau', '17/05/2009', '2009-05-17', '5501010001']), 'aucune identité dans l’archive')
    part = z.read('participants.tsv').decode()
    check('sub-HFAR0101\tF\t' in part and '\tL' in part, f'participants.tsv {part!r}')
    sc = z.read('sub-HFAR0101/ses-seeg1/sub-HFAR0101_ses-seeg1_scans.tsv').decode()
    rep2, z2 = export(); sc2 = z2.read('sub-HFAR0101/ses-seeg1/sub-HFAR0101_ses-seeg1_scans.tsv').decode()
    check(sc == sc2 and '2025-04-02' not in sc, f'décalage des dates identique d’un export à l’autre ({sc.splitlines()[-1]})')
    sh = pg.evaluate("async () => { const s = await SV.Library.settings(); return s && s.shifts && s.shifts.HFAR0101; }")
    check(isinstance(sh, int) and -1095 <= sh <= -365, f'décalage gardé dans la bibliothèque ({sh})')
    # boîte de dialogue : ouvre et liste les patients
    pg.evaluate("() => SV.app.researchExportDialog()"); pg.wait_for_timeout(800)
    check(pg.evaluate("document.querySelectorAll('#rxDlg .rx-list input').length") == 2, 'boîte de dialogue : patients listés')
    check(not errs, f'aucune erreur : {errs[:3]}')
    b.close()
print('\nOK export de recherche (interface)' if not fails else f'\n{len(fails)} échec(s)')
sys.exit(1 if fails else 0)
