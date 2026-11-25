// node tools/tests/test_concordance_inputs.mjs — v2.2.0 : données de la phase 1 et des bilans pour le tableau de concordance
// (cartes 10-20 → systèmes, localisation d'un bilan : suggestion d'après le texte, normalisation)
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
const S = globalThis.SV.Store;

// ---------------------------------------------------------------- carte 10-20 → systèmes
const m = S.eegMapSystems({ C4: 2, T4: 1, F8: 1, P4: 1 });
assert.equal(m['central:R'].v, 2, 'C4 (++) : central droit, principal');
assert.equal(m['premotor:R'].v, 1, 'C4 : prémoteur, voisin, plafonné à 1');
assert.deepEqual(m['lateral_temporal:R'].els.sort(), ['F8', 'T4']);
assert.ok(!Object.keys(m).some(k => k.endsWith(':L')), 'électrodes paires : côté droit seulement');
const z = S.eegMapSystems({ Cz: 3 });
assert.ok(z['central:L'] && z['central:R'] && z['central:L'].v === 3, 'électrode médiane : les deux côtés');
assert.deepEqual(S.eegMapSystems({ Fp1: 0, X9: 2 }), {}, 'valeur nulle, électrode inconnue : rien');
assert.ok(S.eegMapSystems({ Fp1: 1 })['orbitofrontal:L'], 'Fp1 : orbitofrontal gauche (préfixe Fp)');

// ---------------------------------------------------------------- localisation d'un bilan : suggestion d'après le texte
const sug = c => S.examLocSuggest({ conclusion: c });
assert.deepEqual(sug('Hypersignal T2 AMS droite'), ['premotor'], 'AMS → prémoteur (et T2 n’est pas une région)');
assert.deepEqual(sug('Sclérose hippocampique gauche'), ['mesial_temporal']);
assert.deepEqual(sug('Hypométabolisme temporal droit'), ['lateral_temporal'], '« temporal » sans précision → latéral');
assert.deepEqual(sug('Dysplasie du fond du sillon frontal supérieur, opercule'), ['insulo_opercular', 'prefrontal_lateral']);
assert.deepEqual(sug('Lésion pariétale inférieure et précunéus'), ['parietal_lateral', 'posterior_medial']);
assert.deepEqual(sug(''), []);
assert.deepEqual(S.examLocSuggest({ domains: { memory: 'déficit de la mémoire verbale, profil temporal interne' } }), ['mesial_temporal'], 'domaines de la neuropsychologie lus');

// ---------------------------------------------------------------- champ x.loc : création et anciens dossiers
const d = S.newDossier({ pseudo: 'T' }), x = S.addExam(d, { kind: 'mri', conclusion: 'AMS droite', side: 'R' });
assert.deepEqual(x.loc, [], 'nouveau bilan : localisation vide (la suggestion n’est jamais appliquée seule)');
const old = JSON.parse(JSON.stringify(d)); delete old.exams[0].loc; old.exams.push({ id: 'X2', kind: 'pet', loc: ['premotor', 'nimporte', 3] });
const n = S.normalize(old);
assert.deepEqual(n.exams[0].loc, []); assert.deepEqual(n.exams[1].loc, ['premotor'], 'valeurs inconnues retirées');
assert.equal(Object.keys(S.V.systems).length, 12);
console.log('OK concordance_inputs');
