#!/usr/bin/env python3
"""v1.1.0 — identité des patients dans dist/EpiScope.html : réglages de la bibliothèque, code neutre, zone d'identité,
   table de correspondance (Chromium headless, Playwright, stockage du navigateur). Données entièrement synthétiques.
   python3 tools/tests/test_identity_ui.py      (après python3 tools/build.py)"""
import os, json
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'tests', 'out'); os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, msg):
    print(('ok    ' if c else 'ÉCHEC ') + msg)
    if not c: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('dialog', lambda d: d.accept('ESSAI Jeanne') if d.type == 'prompt' else d.accept())
    pg.goto('file://' + os.path.join(ROOT, 'dist', 'EpiScope.html')); pg.wait_for_timeout(2500)
    check(pg.evaluate("SV.Library.mode") == 'browser', 'bibliothèque dans le navigateur (mode de test)')
    check(pg.evaluate("async () => await SV.Library.settings()") is None, 'bibliothèque pas encore initialisée')
    # premier patient : fenêtre d'initialisation, préfixe TST
    pg.evaluate("SV.app.showRaw('patients')"); pg.wait_for_timeout(800)
    check(pg.evaluate("[...document.querySelectorAll('.ptable th')].some(t => t.textContent === 'Code')"), 'colonne « Code » dans la liste des patients')
    pg.click('#pNew'); pg.wait_for_selector('.ls-site', timeout=5000)
    check(pg.evaluate("document.querySelector('.ls-ex').textContent").endswith('HFAR0001'), 'préfixe proposé par défaut : HFAR')
    pg.fill('.ls-site', 'ts-t'); pg.click('.ls-ok'); pg.wait_for_timeout(2500)
    d1 = pg.evaluate("SV.app.dossier && { s: SV.app.dossier.subject && SV.app.dossier.subject.label, p: SV.app.dossier.patient.pseudo, n: SV.app.dname(SV.app.dossier) }")
    check(d1 == {'s': 'TST0001', 'p': 'TST0001', 'n': 'Jeanne ESSAI'}, f'patient créé avec un code neutre et son nom : {d1}')
    # zone d'identité dans la synthèse
    pg.evaluate("SV.app.go({ stage: 'dossier', view: 'synthese' })"); pg.wait_for_timeout(1200)
    check(pg.evaluate("!!document.querySelector('#dxPatient .idz')"), 'zone « Identité » affichée')
    pg.fill('#dxPatient .idz [data-f=lastName]', 'Synthetique'); pg.fill('#dxPatient .idz [data-f=ipp]', '000111')
    pg.fill('#dxPatient .idz [data-f=birthDate]', '2008-02-01'); pg.wait_for_timeout(300)
    bt = pg.evaluate("(() => { const P = SV.app.dossier.patient, y = document.querySelector('#dxPatient [data-f=birthYear]'); return [P.birthYear, P.birthMonth, y.disabled, y.value] })()")
    check(bt == ['2008', '2', True, '2008'], f'naissance du patient reprise de l’identité : {bt}')
    lay = pg.evaluate("(() => { const r = s => document.querySelector('#dxPatient .idz [data-f=' + s + ']').getBoundingClientRect().top; return [Math.round(r('lastName')) === Math.round(r('firstName')), r('birthDate') > r('lastName') + 10, r('ipp') > r('birthDate') + 10] })()")
    check(lay == [True, True, True], f'zone Identité sur trois lignes (nom-prénom / naissance / IPP) : {lay}')
    pg.evaluate("async () => { for (let i = 0; i < 40 && SV.app._saveState !== 'saved'; i++) await new Promise(r => setTimeout(r, 250)); }")
    st = pg.evaluate("async () => { const d = await SV.Library.load(SV.app.dossier.id); return { n: d.identity.lastName, ipp: d.identity.ipp, j: JSON.stringify(d.journal) } }")
    check(st['n'] == 'Synthetique' and st['ipp'] == '000111', f'identité enregistrée dans le dossier : {st["n"]!r} {st["ipp"]!r}')
    check('Synthetique' not in st['j'] and '000111' not in st['j'], 'identité absente du journal')
    pg.click('#dxPatient .idz-eye'); pg.wait_for_timeout(200)
    check(pg.evaluate("document.querySelector('#dxPatient .idz').classList.contains('hide')"), 'identité masquable à l’écran')
    pg.screenshot(path=os.path.join(OUT, 'identity_synthese.png'))
    pg.click('#dxPatient .idz-eye')
    # ancien dossier sans code : code attribué à l'ouverture
    pg.evaluate("""async () => { const S = SV.Store, d = S.newDossier({ pseudo: 'ANCIEN' }); S.addExploration(d, { kind: 'phase1' }); await SV.Library.save(d);
      await SV.app.openDossier(d.id, { quiet: true }); await SV.app.flushSave(); }"""); pg.wait_for_timeout(800)
    check(pg.evaluate("SV.app.dossier.subject && SV.app.dossier.subject.label") == 'TST0002', 'ancien dossier : code attribué à l’ouverture')
    check(pg.evaluate("SV.app.dossier.journal.some(j => /code attribué/.test(j.text || ''))"), 'attribution notée au journal')
    # compteur remis en arrière (copie de bibliothèque) : pas de doublon
    n3 = pg.evaluate("async () => { const L = SV.Library, st = await L.settings(); st.next = 1; await L.saveSettings(st); return (await L.nextSubject()).label }")
    check(n3 == 'TST0003', f'numéro suivant au-delà des codes existants : {n3}')
    # préfixe figé une fois des codes attribués
    pg.evaluate("SV.app.showRaw('patients')"); pg.wait_for_timeout(1000)
    codes = pg.evaluate("[...document.querySelectorAll('.ptable tbody td.mono')].map(t => t.textContent)")
    check('TST0001' in codes and 'TST0002' in codes, f'codes dans la liste : {codes}')
    names = pg.evaluate("[...document.querySelectorAll('.ptable tbody tr td:nth-child(2) b')].map(t => t.textContent)")
    check('Jeanne SYNTHETIQUE' in names, f'nom affiché par défaut dans la liste : {names}')
    pg.click('.anon-btn'); pg.wait_for_timeout(800)
    names2 = pg.evaluate("[...document.querySelectorAll('.ptable tbody tr td:nth-child(2) b')].map(t => t.textContent)")
    check('TST0001' in names2 and not any('SYNTHETIQUE' in n for n in names2), f'noms masqués : {names2}')
    pg.click('.anon-btn'); pg.wait_for_timeout(800)
    pg.click('.ls-btn'); pg.wait_for_selector('.ls-site', timeout=5000)
    check(pg.evaluate("document.querySelector('.ls-site').disabled"), 'préfixe figé après les premiers codes')
    pg.click('.ls-cancel')
    # table de correspondance
    with pg.expect_download() as dl: pg.click('#pIdTable')
    txt = open(dl.value.path(), encoding='utf-8-sig', newline='').read()
    lines = txt.strip().split('\r\n')
    check(lines[0].startswith('code;pseudonyme;nom') and len(lines) == 3, f'table de correspondance : {len(lines) - 1} patients')
    check('TST0001;TST0001;Synthetique;Jeanne' in txt and '000111' in txt, 'code relié à l’identité')
    pg.wait_for_timeout(800)
    check(pg.evaluate("async () => (await SV.Library.load((await SV.Library.list()).find(x => x.subject === 'TST0001').id)).journal.some(j => /table de correspondance/.test(j.text || ''))"), 'export noté au journal du dossier')
    # v2.1.1 : archive anonymisée — fichiers renommés avec le dossier, anatomie relue après l'import (identité fictive)
    ab = pg.evaluate("""async () => { const S = SV.Store, L = SV.Library, d = S.newDossier({ pseudo: 'ZORGLUB Ana' }); d.subject = await L.nextSubject();
      Object.assign(d.identity, { lastName: 'Zorglub', firstName: 'Ana', ipp: '424242' }); const c = d.subject.label;
      const files = { surf: `derivatives/anat/sub-${c}/sub-${c}_pial.mesh`, vep: `derivatives/anat/sub-${c}/sub-${c}_desc-vep_dseg.nii.gz`, seg: 'derivatives/anat/sub-ZorglubAna/sub-ZorglubAna_desc-aseg_dseg.nii.gz' };
      d.anatomy = { status: 'done', files }; await L.save(d);
      for (const [k, f] of Object.entries(files)) await L.writeFile(d, f, new Blob([k]));
      const blob = await L.exportBundle(d, { anon: true }), B = await L.readBundle(blob), names = [...B.files.keys()];
      const imp = await L.importBundle(B, 'copy'), got = await Promise.all(Object.values(imp.anatomy.files).map(async f => { const x = await L.readBytes(imp, f); return x ? new TextDecoder().decode(x) : null; }));
      return { names, refs: Object.values(B.dossier.anatomy.files), got, json: JSON.stringify(B.dossier) }; }""")
    check(ab['got'] == ['surf', 'vep', 'seg'], f'archive anonymisée : anatomie relue après l’import {ab["got"]}')
    check(all(r in ab['names'] for r in ab['refs']), 'références du dossier = fichiers de l’archive')
    check(not any('zorglub' in n.lower() or '424242' in n for n in ab['names']), f'aucun nom dans les fichiers de l’archive : {ab["names"]}')
    check(all(r.startswith('derivatives/anat/sub-TST') for r in ab['refs']) and 'Zorglub' not in ab['json'] and '424242' not in ab['json'], 'chemins fixes intacts, identité absente du dossier exporté')
    check(not errs, f'aucune erreur dans la console : {errs[:3]}')
    b.close()

print('\n' + ('OK identité (interface)' if not fails else f'{len(fails)} échec(s)'))
raise SystemExit(1 if fails else 0)
