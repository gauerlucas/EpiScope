// node tools/tests/test_research.mjs — v2.0.0 : export de recherche BIDS anonymisé (contenu des fichiers, dates décalées,
// électrodes dans le repère du patient et en MNI305, dérivés, contrôle d'identité). Dossier entièrement synthétique.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/store.js', 'src/bids.js', 'src/research.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store, R = SV.Research;

// ---------------------------------------------------------------- dates et âges
assert.equal(R.shiftIso('2025-03-10', -400), '2024-02-04'); assert.equal(R.shiftIso('2025-03-10T22:15', -1), '2025-03-09T22:15:00'); assert.equal(R.shiftIso('', 3), '');
{ const s = R.newShift(() => 0.5); assert.ok(s <= -365 && s >= -1095); }
{ const d = S.newDossier({ pseudo: 'A' }); d.identity.birthDate = '2010-06-15'; assert.equal(R.ageAt(d, '2025-06-15'), 15); d.identity.birthDate = ''; d.patient.birthYear = '1930'; assert.equal(R.ageAt(d, '2025-01-01'), '89+'); }

// ---------------------------------------------------------------- en-tête EDF
{
  const h = new Uint8Array(256).fill(32), put = (o, s) => { for (let i = 0; i < s.length; i++) h[o + i] = s.charCodeAt(i); };
  put(0, '0'); put(8, 'MCH-0234567 F 02-MAY-1951 Haagse_Harry'); put(88, 'Startdate 02-MAR-2002 PSG-1234/2002 NN Telemetry03'); put(168, '02.03.02'); put(176, '22.15.00');
  const o = R.edfAnonShift(h, -10), txt = String.fromCharCode(...o);
  assert.equal(txt.slice(8, 15), 'X X X X'); assert.ok(!/Haagse|MCH|PSG/.test(txt)); assert.equal(txt.slice(168, 176), '20.02.02'); assert.ok(txt.slice(88, 168).startsWith('Startdate 20-FEB-2002 X X X'));
  assert.equal(txt.slice(176, 184), '22.15.00', 'heure gardée');
  assert.equal(R.vmrkShift('Mk1=New Segment,,1,1,0,20250210220000000000', -1), 'Mk1=New Segment,,1,1,0,20250209220000000000');
}

// ---------------------------------------------------------------- un dossier complet
const d = S.newDossier({ pseudo: 'Jean Test' }); d.subject = { label: 'HFAR0042', site: 'HFAR', n: 42 };
Object.assign(d.identity, { lastName: 'Dupontel', firstName: 'Jean', birthDate: '2008-04-02', ipp: '99887766' });
Object.assign(d.patient, { sex: 'M', handedness: 'R', dominant: 'L', etiologies: ['FCD'] });
d.anatomy = { toTemplate: [1, 0, 0, 10, 0, 1, 0, -5, 0, 0, 1, 2, 0, 0, 0, 1], method: 'affine test', fit: { rms: 2.345 } };
const ex = S.addExploration(d, { kind: 'seeg', start: '2025-03-10', end: '2025-03-20' });
ex.electrodes = [{ name: 'A’', hemi: 'L', maker: 'DIXI', real: { contacts: [[-30, 10, 5], [-33.5, 10, 5]] } }];
ex.recordings = [S.bindRec({ id: 'R1', title: 't', kind: 'ictal', fs: 512, line: 50, duration: 600, files: { edf: 'ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_task-seizure_run-01_ieeg.edf' },
  channels: [{ name: "A'1", type: 'SEEG' }, { name: "A'2", type: 'SEEG', status: 'bad' }, { name: 'ECG1', type: 'ECG' }], events: [{ onset: 100, label: 'sz start' }],
  clock: { start: '2025-03-12T14:00:00', blocks: [{ t0: 0, t1: 600, r0: 0 }] } })];
const z = S.addSeizure(d, ex.id, { datetime: '2025-03-12T14:01', habitual: 'yes' }); z.events = [{ id: 1, sign_id: 'aura_epigastric', t: 0, dt: 1, dur: 4, conf: 1 }];
S.recSetSeizure(ex.recordings[0], z.id); ex.recordings[0].marks.onset = 100; ex.recordings[0].marks.end = 160;
const rz = S.addSeizure(d, null, { datetime: '2024-12-01' });
ex.stims = [{ elec: 'A’', c1: 1, c2: 2, mode: 'HF', freq: 50, pulse: 1, dur: 5, mA: 2, clin: true }];
ex.quant = [{ id: 'Q1', name: 'EI', method: 'ei', seizureId: z.id, values: { "A’1-2": 0.9 }, unit: '' }];
d.lesions = [{ type: 'FCD', side: 'L', regions: [3] }]; d.procedures = [{ type: 'resection', side: 'L', regions: [3], date: '2025-09-01' }];
const B = R.buildSubject(d, { shift: -100, atlasLabel: i => 'REG' + i, regions: { [ex.id]: { "A'1": 'Left-Hippocampus' } }, signLabel: id => 'label ' + id });
const F = new Map(B.files.map(f => [f.path, f]));
const P = p => F.get(p) && F.get(p).text;
assert.equal(B.sub, 'HFAR0042');
const edf = F.get('sub-HFAR0042/ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_task-seizure_run-01_ieeg.edf'); assert.ok(edf && edf.src.kind === 'edf', [...F.keys()].join('\n'));
assert.match(P('sub-HFAR0042/ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_task-seizure_run-01_channels.tsv'), /^name\ttype\tunits\tlow_cutoff\thigh_cutoff\tstatus\nA'1\tSEEG\tµV\tn\/a\tn\/a\tgood\nA'2\tSEEG\tµV\tn\/a\tn\/a\tbad\nECG1\tECG/);
const ev = P('sub-HFAR0042/ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_task-seizure_run-01_events.tsv');
assert.match(ev, /^onset\tduration\ttrial_type\tvalue\tseizure_id\n100\t60\tseizure\tsz-02\tsz-02\n100\t0\tannotation\tsz start\tn\/a\n$/, ev);
const js = JSON.parse(P('sub-HFAR0042/ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_task-seizure_run-01_ieeg.json'));
assert.equal(js.TaskName, 'seizure'); assert.equal(js.SamplingFrequency, 512); assert.equal(js.SEEGChannelCount, 2); assert.equal(js.ECGChannelCount, 1);
assert.match(P('sub-HFAR0042/ses-seeg1/sub-HFAR0042_ses-seeg1_scans.tsv'), /ieeg\/sub-HFAR0042_ses-seeg1_task-seizure_run-01_ieeg\.edf\t2024-12-02T14:00:00/);
assert.match(P('sub-HFAR0042/sub-HFAR0042_sessions.tsv'), /ses-seeg1\t2024-11-30\tseeg/);
const elN = P('sub-HFAR0042/ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_space-ScanRAS_electrodes.tsv'), elM = P('sub-HFAR0042/ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_space-MNI305_electrodes.tsv');
assert.match(elN, /\nA'1\t-30\t10\t5\t5\.03\tA'\tL\tdepth\tDIXI\tLeft-Hippocampus\n/); assert.match(elM, /\nA'1\t-20\t5\t7\t/, 'MNI305 = affine appliquée');
assert.equal(JSON.parse(P('sub-HFAR0042/ses-seeg1/ieeg/sub-HFAR0042_ses-seeg1_space-MNI305_coordsystem.json')).iEEGCoordinateSystem, 'MNI305');
assert.match(P('derivatives/episcope/sub-HFAR0042/sub-HFAR0042_seizures.tsv'), /sz-01\tn\/a\treported\t2024-08-23\t.*\nsz-02\tses-seeg1\trecorded\t2024-12-02T14:01:00\tyes\t.*\t1\tsub-HFAR0042_ses-seeg1_task-seizure_run-01_ieeg\.edf\n/);
assert.match(P('derivatives/episcope/sub-HFAR0042/sub-HFAR0042_semiology.tsv'), /sz-02\t1\taura_epigastric\tlabel aura_epigastric\t0\t1\t4\tn\/a\t1/);
assert.match(P('derivatives/episcope/sub-HFAR0042/ses-seeg1/sub-HFAR0042_ses-seeg1_stimulations.tsv'), /A'1-2\tHF\t50\t1\t5\t2\t1/);
assert.match(P('derivatives/episcope/sub-HFAR0042/ses-seeg1/sub-HFAR0042_ses-seeg1_results.tsv'), /EI\tei\tn\/a\tn\/a\tsz-02\tA'1-2\t0\.9/);
const cl = JSON.parse(P('derivatives/episcope/sub-HFAR0042/sub-HFAR0042_clinical.json'));
assert.equal(cl.age_first_exploration, 16.9); assert.deepEqual(cl.lesions[0].regions, ['REG3']); assert.equal(cl.procedures[0].months_after_first_exploration, 6);
assert.deepEqual(JSON.parse(P('derivatives/episcope/sub-HFAR0042/sub-HFAR0042_from-T1w_to-MNI305_mode-image_xfm.json')).Matrix[0], [1, 0, 0, 10]);
assert.deepEqual(B.participant, { participant_id: 'sub-HFAR0042', sex: 'M', age: 16.9, handedness: 'R' });
assert.ok(![...F.keys()].some(p => /anat\//.test(p)), 'T1 exclu par défaut');

// ---------------------------------------------------------------- aucune identité dans les textes
const secrets = R.secretsOf(d); assert.ok(secrets.includes('Dupontel') && secrets.includes('02/04/2008') && secrets.includes('Jean Test'));
for (const f of B.files.concat(R.datasetFiles([B.participant], { version: '2.0.0' }))) if (f.text != null) assert.deepEqual(R.scanSecrets(f.text, secrets), [], f.path);
assert.deepEqual(R.scanSecrets('patient DUPONTEL né le 02/04/2008', secrets), ['Dupontel', '02/04/2008']);
assert.deepEqual(R.scanSecrets('Dupontél', ['Dupontel']), ['Dupontel'], 'accents ignorés');
// une annotation du fichier qui porte le nom est repérée
ex.recordings[0].events.push({ onset: 5, label: 'appel Mme Dupontel' });
const B2 = R.buildSubject(d, { shift: -100 }); assert.ok(B2.files.some(f => f.text && R.scanSecrets(f.text, secrets).length));
const D = R.datasetFiles([B.participant], { version: '2.0.0' }); assert.equal(JSON.parse(D[0].text).BIDSVersion, '1.10.0'); assert.match(D[1].text, /sub-HFAR0042\tM\t16\.9\tR/);
console.log('test_research : ok');
// v2.0.0 : identité retirée des noms importés (pièces jointes)
{ const d2 = S.newDossier({ pseudo: 'x' }); d2.subject = { label: 'HFAR0003' }; Object.assign(d2.identity, { lastName: 'Le Gall', firstName: 'Anne', birthDate: '2001-02-03' });
  assert.equal(S.scrub(d2, 'CR IRM LE_GALL Anne 03.02.2001.pdf'), 'CR IRM HFAR0003 HFAR0003 HFAR0003.pdf'); assert.equal(S.scrub(d2, 'compte rendu.pdf'), 'compte rendu.pdf'); }
console.log('test_research (noms) : ok');
