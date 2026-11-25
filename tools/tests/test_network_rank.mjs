// node tools/tests/test_network_rank.mjs — v2.3.0 : hypothèses de réseau du staff classées par la sémiologie ET le tableau de concordance
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
const S = globalThis.SV.Store;
const cell = (col, v, label) => ({ col, v, label: label || col });
// sémiologie : réseau central gauche un peu devant le réseau prémoteur droit ; le reste du tableau désigne prémoteur / AMS droit
const pool = [
  { key: 'central|L', name: 'central → prémoteur', hemi: 'L', w: 1.0, n: 2, top: 1, ez: ['central:L'], prop: ['premotor:L'] },
  { key: 'premotor|R', name: 'prémoteur → central', hemi: 'R', w: 0.8, n: 2, top: 1, ez: ['premotor:R'], prop: ['central:R'] },
  { key: 'insula|L', name: 'insulo-operculaire', hemi: 'L', w: 0.5, n: 1, top: 0, ez: ['insulo_opercular:L'], prop: [] },
];
const rows = {
  'central:L': { cells: [cell('semio', '++')] },
  'premotor:R': { cells: [cell('semio', '++'), cell('mri', '++', 'IRM'), cell('eeg_ic', '+', 'EEG critique (scalp)')] },
  'central:R': { cells: [cell('eeg_ic', '++', 'EEG critique (scalp)')] },
  'insulo_opercular:L': { cells: [cell('semio', '++'), cell('pet', '−', 'TEP')] },
  'mesial_temporal:R': { cells: [cell('eeg_ii', '++', 'EEG intercritique'), cell('neuropsy', '+', 'Neuropsychologie')] },
};
const L = S.networkRank(pool, rows, { sysLabel: k => ({ premotor: 'prémoteur / AMS', central: 'central', mesial_temporal: 'temporal mésial', insulo_opercular: 'insulo-operculaire' })[k] || k });
assert.equal(L[0].key, 'premotor|R', 'la concordance (IRM ++, EEG critique +) fait passer le réseau prémoteur droit devant');
assert.ok(Math.abs(L[0].semio - 0.8) < 1e-9 && Math.abs(L[0].conc - (3 + 0.5 * 2) / 3) < 1e-9, 'scores : sémiologie relative, concordance (ZE + ½ propagation) / max');
assert.ok(L[0].forC.some(t => /IRM \+\+ \(prémoteur \/ AMS D\)/.test(t)) && L[0].forC.some(t => /propagation/.test(t)), 'arguments pour lisibles, propagation forte citée');
const c = L.find(x => x.key === 'central|L'); assert.equal(c.conc, 0, 'aucune donnée hors sémiologie : concordance nulle');
assert.ok(c.againstC.some(t => /zone plus concordante : prémoteur \/ AMS D/.test(t)), 'zone plus concordante ailleurs : argument contre');
const ins = L.find(x => x.key === 'insula|L'); assert.ok(ins.conc < 0 && ins.againstC.some(t => /TEP −/.test(t)), 'case « − » : concordance négative, argument contre');
const t = L.find(x => x.from === 'concordance'); assert.ok(t && t.ez[0] === 'mesial_temporal:R' && t.semio === 0, 'zone concordante sans trajectoire du modèle : proposée d’après la concordance');
assert.ok(L.some(x => x.from === 'concordance' && x.ez[0] === 'central:R'), 'zone en propagation d’une hypothèse mais concordante (R ≥ 2) : aussi proposée comme ZE');
assert.ok(!L.some(x => x.from === 'concordance' && x.ez[0] === 'premotor:R'), 'zone déjà ZE d’une trajectoire : pas de doublon');
assert.deepEqual(S.networkRank([], {}), [], 'rien à classer');
const only = S.networkRank([], { 'occipital:L': { cells: [cell('mri', '++', 'IRM')] } });
assert.equal(only.length, 1); assert.equal(only[0].from, 'concordance', 'sans crise : propositions d’après la concordance seule');
console.log('OK network_rank');
