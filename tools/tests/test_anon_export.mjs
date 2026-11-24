// node tools/tests/test_anon_export.mjs — v2.1.1 : export anonymisé (chemins des fichiers suivis) et jeu EI rattaché à sa crise
// Identités fictives uniquement.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
const S = globalThis.SV.Store;

// ---------------------------------------------------------------- chemins anonymisés avec le dossier
// prénom court (« Ana ») contenu dans « anat » : l'ancien remplacement en sous-chaîne coupait derivatives/anat/…
const d0 = S.newDossier({ pseudo: 'ZORGLUB Ana' }); d0.subject = S.makeSubject('HFAR', 12, 4);
Object.assign(d0.identity, { lastName: 'Zorglub', firstName: 'Ana', birthDate: '1990-04-05', ipp: '99887766' });
const surf = 'derivatives/anat/sub-HFAR0012/sub-HFAR0012_pial.mesh', vep = 'derivatives/anat/sub-HFAR0012/sub-HFAR0012_desc-vep_dseg.nii.gz';
const legacy = 'derivatives/anat/sub-ZorglubAna/sub-ZorglubAna_desc-aseg_dseg.nii.gz';   // dérivé nommé d'après l'ancien pseudonyme
const att = 'gallery/IRM_Zorglub_2019.pdf', light = 'imaging/sub-ZorglubAna_T1w.nii.gz';    // pièce jointe ; fichier absent d'un export allégé
d0.anatomy = { status: 'done', files: { surf, vep, seg: legacy } };
d0.gallery = [{ id: 'g1', file: att, title: 'IRM de Ana Zorglub' }];
d0.imaging = [{ id: 'i1', file: light }];
d0.patient.history = 'Ana Zorglub, anatomie normale.';
const paths = [surf, vep, legacy, att, 'dossier.json', 'ses-01/ieeg/sub-HFAR0012_ses-01_task-seizure_run-01_ieeg.edf'];
const { d, pathMap } = S.anonymizer(d0, paths);

assert.equal(d.anatomy.files.surf, surf, 'chemin fixe intact (anat ne contient pas le prénom en mot entier)');
assert.equal(d.anatomy.files.vep, vep);
assert.equal(pathMap.has(surf) || pathMap.has(vep), false, 'fichiers sans secret non renommés');
const seg = pathMap.get(legacy); assert.ok(seg, 'dérivé à l’ancien pseudonyme renommé');
assert.equal(seg, 'derivatives/anat/sub-HFAR0012/sub-HFAR0012_desc-aseg_dseg.nii.gz');
assert.equal(d.anatomy.files.seg, seg, 'la référence du dossier suit le renommage du fichier');
assert.equal(d.gallery[0].file, pathMap.get(att)); assert.ok(!/Zorglub/i.test(d.gallery[0].file));
assert.equal(d.imaging[0].file, 'imaging/sub-HFAR0012_T1w.nii.gz', 'chemin d’un fichier absent de l’archive : même règle');
for (const q of pathMap.values()) assert.ok(!/zorglub|ana(?![a-z])|99887766/i.test(q.replace(/anat/g, '')), 'aucun secret dans un nom de l’archive : ' + q);
const js = JSON.stringify(d);
for (const w of ['Zorglub', 'ZORGLUB', '99887766', '1990-04-05', '05/04/1990', 'ZorglubAna']) assert.ok(!js.includes(w), 'retiré : ' + w);
assert.equal(d.patient.history, 'HFAR0012 HFAR0012, anatomie normale.', 'texte libre anonymisé, mots voisins intacts');
assert.equal(S.anonymize(d0).anatomy.files.surf, surf, 'S.anonymize (sans liste de fichiers) ne coupe plus les chemins');
assert.equal(d0.anatomy.files.seg, legacy, 'dossier d’origine intact');

// ---------------------------------------------------------------- jeu EI enregistré sans sa crise (avant 2.1.1)
const e = S.newDossier({ pseudo: 'T' }), ex = S.addExploration(e, { kind: 'seeg' });
const sz = S.addSeizure(e, ex.id, { label: 'Crise 1' });
const rec = { id: 'r1', title: 'tracé', seizureId: sz.id, sz: { [sz.id]: { marks: { onset: 10, end: 60, user: [] }, ei: { quantId: 'q1' } } }, free: {} };
ex.recordings = [rec];
ex.quant = [{ id: 'q1', name: 'EI · tracé', method: 'ei', ieeg: 'r1', values: { A1: 1 } }, { id: 'q2', name: 'EI · autre', method: 'ei', ieeg: 'r1', values: { A1: 1 } },
  { id: 'q3', name: 'pointes', method: 'spikes', ieeg: 'r1', values: { A1: 1 } }];
assert.equal(S.eiSetSeizures(e), 1);
assert.equal(ex.quant[0].seizureId, sz.id, 'EI : crise retrouvée dans le rangement du tracé');
assert.ok(!ex.quant[1].seizureId && !ex.quant[2].seizureId, 'jeu non référencé / autre méthode : inchangé');
assert.equal(S.eiSetSeizures(e), 0, 'idempotent');
const n = S.normalize(JSON.parse(JSON.stringify(Object.assign(e, { explorations: e.explorations.map(x => Object.assign({}, x, { quant: x.quant.map(q => Object.assign({}, q, { seizureId: undefined })) })) }))));
assert.equal(n.explorations[0].quant[0].seizureId, sz.id, 'normalize répare les anciens dossiers');
console.log('OK anon_export');
