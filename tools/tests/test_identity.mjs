// node tools/tests/test_identity.mjs — v1.1.0 : code neutre du sujet et zone d'identité (store.js)
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
const S = globalThis.SV.Store;

assert.equal(S.cleanSite(' hf-ar '), 'HFAR'); assert.equal(S.cleanSite('abcdefghijk'), 'ABCDEFGH'); assert.equal(S.cleanSite(''), '');
const s7 = S.makeSubject('hfar', 7, 4); assert.equal(s7.label, 'HFAR0007'); assert.equal(s7.n, 7); assert.equal(s7.site, 'HFAR');
assert.equal(S.makeSubject('', 12345, 3).label, 'HFAR12345', 'préfixe par défaut, numéro non tronqué');
assert.equal(S.makeSubject('X1', 0, 0).label, 'X10001', 'numéro et chiffres minimaux');
assert.ok(/^[A-Z0-9]+$/.test(s7.label), 'étiquette BIDS valide (lettres et chiffres)');

const d = S.newDossier({ pseudo: 'ESSAI' });
assert.equal(d.subject, null); assert.deepEqual(Object.keys(d.identity).sort(), ['birthDate', 'firstName', 'ipp', 'lastName', 'notes']);
assert.equal(S.summary(d).subject, '', 'résumé sans code');
d.subject = s7; d.identity.lastName = 'Synthétique';
const sm = S.summary(d); assert.equal(sm.subject, 'HFAR0007'); assert.equal(sm.subjectN, 7); assert.equal(sm.site, 'HFAR');
assert.equal(sm.display, 'SYNTHÉTIQUE', 'liste des patients : nom affiché');
d.identity.firstName = 'Jeanne'; assert.equal(S.displayName(d), 'Jeanne SYNTHÉTIQUE'); assert.equal(S.displayName(d, true), 'HFAR0007', 'masqué : code');
const d2 = S.newDossier({ pseudo: 'ALPHA' }); assert.equal(S.displayName(d2), 'ALPHA', 'sans identité : pseudonyme'); assert.equal(S.displayName(d2, true), 'Patient');
assert.deepEqual(S.parseName('DUPONT Jeanne Marie'), { lastName: 'DUPONT', firstName: 'Jeanne Marie' });
assert.deepEqual(S.parseName('Jeanne Marie DE LA TOUR'), { lastName: 'DE LA TOUR', firstName: 'Jeanne Marie' });
assert.deepEqual(S.parseName('Dupont Jeanne'), { lastName: 'Dupont', firstName: 'Jeanne' }); assert.deepEqual(S.parseName(''), { lastName: '', firstName: '' });

// anciens dossiers : identité complétée, code incomplet écarté
const old = JSON.parse(JSON.stringify(d)); delete old.identity; old.subject = { site: 'HFAR' };
S.normalize(old); assert.equal(old.subject, null); assert.equal(old.identity.ipp, '');
const part = JSON.parse(JSON.stringify(d)); part.identity = { ipp: '123' }; S.normalize(part);
assert.equal(part.identity.ipp, '123'); assert.equal(part.identity.lastName, ''); assert.equal(part.subject.label, 'HFAR0007');
// copie anonymisée pour un partage extérieur
const a0 = S.newDossier({ pseudo: 'ZORGLUB Ernest' }); a0.subject = S.makeSubject('HFAR', 9, 4);
Object.assign(a0.identity, { lastName: 'Zorglub', firstName: 'Ernest', birthDate: '1990-04-05', ipp: '99887766' });
S.log(a0, 'edit', 'patient', null, 'appel de Ernest ZORGLUB, né le 05/04/1990, IPP 99887766');
a0.patient.history = 'Monsieur Zorglub signale…';
const an = S.anonymize(a0), js = JSON.stringify(an);
for (const w of ['Zorglub', 'ZORGLUB', 'Ernest', '99887766', '1990-04-05', '05/04/1990']) assert.ok(!js.includes(w), 'retiré : ' + w);
assert.equal(an.patient.pseudo, 'HFAR0009'); assert.equal(an.identity.lastName, ''); assert.ok(an.anonymized && an.anonymized.at);
assert.ok(an.patient.history.includes('HFAR0009'), 'nom remplacé par le code dans les textes');
assert.equal(a0.identity.lastName, 'Zorglub', 'dossier d’origine intact');
console.log('OK identity');
