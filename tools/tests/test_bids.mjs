// node tools/tests/test_bids.mjs — v1.1.0 : noms de fichiers BIDS (bids.js) ; données synthétiques
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('src/bids.js', 'utf8'));
const S = globalThis.SV.Store, B = globalThis.SV.BIDS;

assert.equal(B.label('sé-ance 1_x'), 'seance1x');
assert.equal(B.name({ run: 3, sub: 'HFAR0007', task: 'seizure', ses: 'seeg1', suffix: 'ieeg', ext: 'edf' }), 'sub-HFAR0007_ses-seeg1_task-seizure_run-03_ieeg.edf', 'ordre des entités, run sur 2 chiffres');
assert.equal(B.name({ sub: 'A', ses: '', desc: 'EI', space: 'MNI152NLin2009cAsym', suffix: 'stats', ext: '.tsv' }), 'sub-A_space-MNI152NLin2009cAsym_desc-EI_stats.tsv', 'entités vides omises');
const p = B.parse('ieeg/R1/sub-HFAR0007_ses-seeg1_task-seizure_run-03_ieeg.vhdr');
assert.deepEqual(p, { sub: 'HFAR0007', ses: 'seeg1', task: 'seizure', run: '03', suffix: 'ieeg', ext: '.vhdr' });
assert.ok(B.parse('sub-01_T1w.nii.gz').ext === '.nii.gz'); assert.ok(!B.isBids('EXPORT 2025 crise.edf')); assert.ok(!B.isBids('patient_x.edf'));

// dossier synthétique : deux SEEG, un scalp, tracés aux noms d'origine
const d = S.newDossier({ pseudo: 'ESSAI' }); d.subject = S.makeSubject('HFAR', 7, 4);
const ph = S.addExploration(d, { kind: 'phase1', start: '2024-01-01' }), s2 = S.addExploration(d, { kind: 'seeg', start: '2025-09-01' }), s1 = S.addExploration(d, { kind: 'seeg', start: '2025-03-01' });
assert.equal(B.sesOf(d, ph), 'scalp1'); assert.equal(B.sesOf(d, s1), 'seeg1'); assert.equal(B.sesOf(d, s2), 'seeg2', 'rang par date de début');
assert.equal(B.subOf(d), 'HFAR0007'); assert.ok(/^X[A-Za-z0-9]+$/.test(B.subOf({ id: 'D_ab-12' })), 'sans code : repère tiré de l’identifiant interne');
s1.recordings = [
  { id: 'R1', kind: 'ictal', startDate: '2025-03-02', startTime: '22:03:43', title: 'Origine 1', files: { edf: 'ieeg/R1/Origine 1.edf' } },
  { id: 'R2', kind: 'ictal', title: 'Origine 2', files: { vhdr: 'ieeg/R2/o2.vhdr', vmrk: 'ieeg/R2/o2.vmrk', eeg: 'ieeg/R2/o2.eeg', channels: 'ieeg/R2/o2_channels.tsv' } },
  { id: 'R3', kind: 'inter', title: 'Nuit', files: { edf: 'ses-seeg1/ieeg/sub-HFAR0007_ses-seeg1_task-interictal_run-01_ieeg.edf' } }];
ph.recordings = [{ id: 'R4', kind: 'ictal', title: 'Scalp', files: { edf: 'ieeg/R4/x.BDF' } }];
assert.equal(B.taskOf(s1.recordings[0]), 'seizure'); assert.equal(B.runOf(s1, s1.recordings[1]), 2); assert.equal(B.runOf(s1, { id: 'Rnew', kind: 'inter' }), 2, 'nouveau tracé : run suivant');
assert.equal(B.runOf({ recordings: [{ id: 'a', kind: 'ictal', files: { edf: 'ses-seeg1/ieeg/sub-X_ses-seeg1_task-seizure_run-05_ieeg.edf' } }] }, { id: 'b', kind: 'ictal' }), 6, 'numéro jamais réutilisé'); assert.equal(B.runOf(s1, s1.recordings[2]), 1);
assert.equal(B.recPath(d, s1, s1.recordings[0], 'edf', 'Origine 1.edf'), 'ses-seeg1/ieeg/sub-HFAR0007_ses-seeg1_task-seizure_run-01_ieeg.edf');
assert.equal(B.recPath(d, ph, ph.recordings[0], 'edf', 'x.BDF'), 'ses-scalp1/eeg/sub-HFAR0007_ses-scalp1_task-seizure_run-01_eeg.bdf', 'scalp : eeg, extension bdf');
assert.equal(B.recPath(d, s1, s1.recordings[1], 'channels'), 'ses-seeg1/ieeg/sub-HFAR0007_ses-seeg1_task-seizure_run-02_channels.tsv');
assert.equal(B.recTitle(s1.recordings[0], 1), 'Crise · 02/03/2025 22:03 · run 01');

const plan = B.renamePlan(d);
assert.equal(plan.files.length, 6, 'R1 (1) + R2 (4) + R4 (1) ; R3 déjà BIDS'); assert.ok(!plan.files.some(f => f.recId === 'R3'));
const vh = plan.files.find(f => f.key === 'vhdr'); assert.deepEqual(vh.rewrite, { dataFile: 'sub-HFAR0007_ses-seeg1_task-seizure_run-02_ieeg.eeg', markerFile: 'sub-HFAR0007_ses-seeg1_task-seizure_run-02_ieeg.vmrk' });
assert.deepEqual(plan.titles.map(t => t.id).sort(), ['R1', 'R2', 'R4'], 'titres d’origine remplacés pour les tracés renommés');
assert.ok(plan.files.every(f => !/Origine|o2\b|x\.BDF/.test(f.to)), 'aucun nom d’origine dans les noms cibles');

// en-tête BrainVision : octets latin-1 conservés
const hdr = 'Brain Vision Data Exchange Header File Version 1.0\r\n[Common Infos]\r\nDataFile=Nom Origine.eeg\r\nMarkerFile=Nom Origine.vmrk\r\n[Channel Infos]\r\nCh1=A\xe91,,0.1,\xb5V\r\n';
const u = Uint8Array.from(hdr, c => c.charCodeAt(0)), out = B.vhdrRename(u, 'new_ieeg.eeg', 'new_ieeg.vmrk'), back = String.fromCharCode(...out);
assert.ok(back.includes('DataFile=new_ieeg.eeg\r\n') && back.includes('MarkerFile=new_ieeg.vmrk\r\n') && !back.includes('Origine'));
assert.ok(back.includes('Ch1=A\xe91,,0.1,\xb5V'), 'caractères latin-1 intacts');

// imagerie
const im = S.addImaging(d, { modality: 'T1c', timepoint: 'preop', date: '2025-01-10', label: 'NOM_ORIGINE.nii.gz', source: 'NOM_ORIGINE.nii.gz' });
assert.equal(B.imagingLabel(im), 'T1c · preop · 2025-01-10');
assert.equal(B.imagingPath(d, im), 'sub-HFAR0007/ses-preop/anat/sub-HFAR0007_ses-preop_ce-gadolinium_T1w.nii.gz');
assert.ok(B.renamePlan(d).titles.some(t => t.kind === 'imaging' && t.to === 'T1c · preop · 2025-01-10'));
// titres neutres : reprises de l'ancien titre corrigées partout
s1.quant = [{ id: 'q1', name: 'EI · Origine 1', source: 'EI · Origine 1 · cascade' }]; d.gallery.push({ id: 'G1', title: 'page Origine 1' });
d.results = [{ id: 'r1', name: 'EI · Origine 1', inputs: [{ type: 'recording', id: 'R1', title: 'Origine 1' }] }];
const pl2 = B.renamePlan(d), nt = B.applyTitles(d, pl2.titles);
for (const f of pl2.files) { const r = [].concat(...d.explorations.map(e => e.recordings || [])).find(x => x.id === f.recId); r.files[f.key] = f.to; }
assert.ok(nt >= 8, 'titres et reprises : ' + nt);
assert.ok(!JSON.stringify(d).includes('Origine') && !JSON.stringify(d).includes('NOM_ORIGINE'), 'plus aucun nom d’origine dans le dossier');
assert.equal(s1.quant[0].name, 'EI · Crise · 02/03/2025 22:03 · run 01'); assert.equal(im.source, 'NIfTI');
// en-tête EDF anonymisé (copie)
const H = new Uint8Array(512).fill(32); const put = (o, t) => { for (let i = 0; i < t.length; i++) H[o + i] = t.charCodeAt(i); };
put(0, '0'); put(8, 'MCH-0234567 F 02-MAY-1951 Nom_Fictif'); put(88, 'Startdate 02-JUN-2021 EMR123 TechX Machine'); put(168, '02.06.21'); H[300] = 7;
const A2 = B.edfAnon(H), hs = String.fromCharCode(...A2.subarray(0, 256));
assert.equal(hs.slice(8, 88).trim(), 'X X X X'); assert.equal(hs.slice(88, 168).trim(), 'Startdate 02-JUN-2021 X X X');
assert.equal(hs.slice(168, 176), '02.06.21', 'date de début gardée'); assert.equal(A2[300], 7, 'reste inchangé'); assert.ok(String.fromCharCode(...H.subarray(8, 30)).startsWith('MCH'), 'original intact');
console.log('OK bids');
