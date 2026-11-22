// node tools/tests/test_staff_notes.mjs — v1.1.0 : commentaires de staff (store.js) et date de naissance liée à l'identité
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
const S = globalThis.SV.Store;
const d = S.newDossier({ pseudo: 'NOTES' }); assert.deepEqual(d.staffNotes, []);
const x = S.addExam(d, { kind: 'neuropsy', date: '2025-01-05', conclusion: 'Pas de difficulté franche.' });
const m1 = S.addMeeting(d, { date: '2025-02-01', kind: 'post_phase1' }), m2 = S.addMeeting(d, { date: '2025-06-01', kind: 'post_seeg' });
const T = `exam:${x.id}:conclusion`;
const n1 = S.addStaffNote(d, { target: T, meetingId: m1.id, text: ' Moins bien que décrit. ', by: 'LG' });
assert.equal(n1.text, 'Moins bien que décrit.'); assert.equal(S.addStaffNote(d, { target: T, text: '  ' }), null, 'commentaire vide refusé');
S.addStaffNote(d, { target: T, meetingId: m2.id, text: 'Revu : confirmé.' });
assert.equal(x.conclusion, 'Pas de difficulté franche.', 'la donnée n’est pas modifiée');
assert.equal(S.notesFor(d, T).length, 2); assert.equal(S.notesFor(d, T, m1.date).length, 1, 'staff du 01/02 : ses commentaires et les antérieurs seulement');
assert.equal(S.notesFor(d, 'exam:autre:conclusion').length, 0);
// corbeille
S.remove(d, 'staffNote', n1.id); assert.equal(S.notesFor(d, T).length, 1); assert.ok(d.trash.length >= 1); S.restoreTrash(d, d.trash[d.trash.length - 1].id); assert.equal(S.notesFor(d, T).length, 2, 'restauré');
// notes de page de la première version → commentaires de page
const old = JSON.parse(JSON.stringify(d)); delete old.staffNotes; old.meetings[0].deck = { items: { history: { note: 'on peut douter de la dominance' } } };
S.normalize(old); const pn = old.staffNotes.find(n => n.target === 'page:history');
assert.ok(pn && pn.meetingId === m1.id && !old.meetings[0].deck.items.history.note, 'note de page reprise en commentaire');
// date de naissance : identité → mois et année
d.identity.birthDate = '2008-02-01'; assert.equal(S.syncBirth(d), true); assert.equal(d.patient.birthYear, '2008'); assert.equal(d.patient.birthMonth, '2'); assert.equal(S.syncBirth(d), false, 'déjà à jour');
d.identity.birthDate = ''; assert.equal(S.syncBirth(d), false, 'sans date : mois et année saisis à la main gardés'); assert.equal(d.patient.birthYear, '2008');
console.log('OK staff_notes');
