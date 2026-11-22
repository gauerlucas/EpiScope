// node tools/tests/test_safety.mjs — v1.0.1 : corbeille du dossier (store.js) et historique des révisions (history.js)
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('src/history.js', 'utf8'));
const S = globalThis.SV.Store, H = globalThis.SV.History;
const strip = d => JSON.parse(JSON.stringify(d, (k, v) => k === 'journal' || k === 'trash' || k.startsWith('_') ? undefined : v));

// ---------------------------------------------------------------- dossier de travail
const d = S.newDossier({ pseudo: 'TEST' });
const ex = S.addExploration(d, { kind: 'seeg', start: '2021-06-01' }), ex2 = S.addExploration(d, { kind: 'phase1', start: '2021-01-01' });
ex2.implant = { layers: ['ex:' + ex.id, 'pj:x'] };
const sz1 = S.addSeizure(d, ex.id, { datetime: '2021-06-02' }), sz2 = S.addSeizure(d, ex.id, { datetime: '2021-06-02' });
const g = S.addGalleryItem(d, { file: 'gallery/G1.png', explorationId: ex.id, seizureId: sz1.id });
const x = S.addExam(d, { kind: 'veeg', explorationId: ex.id, attachments: [{ id: 'F1', name: 'cr.pdf', file: 'attachments/F1_cr.pdf' }] });
const m = S.addMeeting(d, { galleryIds: [g.id] }), dec = S.addDecision(d, { meetingId: m.id, type: 'seeg', createdExplorationId: ex.id });
const h1 = S.addHypothesis(d, { title: 'H', meetingId: m.id }), h2 = S.addHypothesis(d, { supersedes: h1.id });
ex.recordings = [{ id: 'R1', title: 'nuit 1', files: { edf: 'ieeg/R1/a.edf' } }, { id: 'R2', title: 'nuit 2', files: { edf: 'ieeg/R2/b.edf' } }];
S.bindRecs(d);   // tracés tels qu'à la lecture d'un dossier (v2.0.0 : rangement par crise)
const ref = strip(d);

// ---------------------------------------------------------------- exploration : cascade complète puis restauration exacte
const e1 = S.remove(d, 'exploration', ex.id);
assert.ok(e1 && d.trash.length === 1, 'une entrée de corbeille');
assert.equal(d.explorations.length, 1); assert.equal(d.seizures.length, 0);
assert.equal(g.explorationId, null); assert.equal(g.seizureId, null); assert.equal(x.explorationId, null);
assert.equal(dec.createdExplorationId, null); assert.deepEqual(ex2.implant.layers, ['pj:x']);
assert.deepEqual(e1.files.sort(), ['ieeg/R1/a.edf', 'ieeg/R2/b.edf'], 'fichiers des tracés listés');
assert.equal(d._snap, 'remove', 'instantané demandé à la bibliothèque');
const r1 = S.restoreTrash(d, e1.id); assert.ok(r1.ok); assert.equal(d.trash.length, 0);
assert.deepEqual(strip(d), ref, 'dossier identique après restauration (ordre et références)');

// ---------------------------------------------------------------- autres suppressions
S.remove(d, 'gallery', g.id); assert.deepEqual(m.galleryIds, []); S.restoreTrash(d, d.trash[0].id); assert.deepEqual(m.galleryIds, [g.id]);
S.remove(d, 'meeting', m.id); assert.equal(dec.meetingId, null); assert.equal(h1.meetingId, null); S.restoreTrash(d, d.trash[0].id); assert.equal(dec.meetingId, m.id); assert.equal(h1.meetingId, m.id);
assert.equal(h1.status, 'revised'); S.remove(d, 'hypothesis', h2.id); assert.equal(h1.status, 'proposed', 'version précédente redevient proposée');
S.restoreTrash(d, d.trash[0].id); assert.equal(h1.status, 'revised');
const eR = S.discard(d, { kind: 'recording', list: 'explorations', id: ex.id, field: 'recordings', item: ex.recordings[0] });
assert.equal(ex.recordings.length, 1); assert.deepEqual(eR.files, ['ieeg/R1/a.edf']); S.restoreTrash(d, eR.id); assert.deepEqual(ex.recordings.map(r => r.id), ['R1', 'R2']);
const eA = S.discard(d, { kind: 'attachment', list: 'exams', id: x.id, field: 'attachments', item: x.attachments[0] }); assert.equal(x.attachments.length, 0); S.restoreTrash(d, eA.id); assert.equal(x.attachments.length, 1);
assert.deepEqual(strip(d), ref, 'identique après la série');

// restauration quand le parent a disparu : signalée, rien d'autre ne casse
const eS = S.remove(d, 'seizure', sz2.id), eE = S.remove(d, 'exploration', ex.id);
const rS = S.restoreTrash(d, eS.id); assert.ok(rS.ok); S.restoreTrash(d, eE.id); assert.equal(d.seizures.length, 2);

// purge : fichiers orphelins seulement
const eG = S.remove(d, 'gallery', g.id), P = S.purgeTrash(d); assert.equal(P.n, 1); assert.deepEqual(P.files, ['gallery/G1.png']); assert.equal(d.trash.length, 0);
// enregistrement JSON : normalize garde la corbeille
const back = S.normalize(JSON.parse(JSON.stringify(Object.assign(S.newDossier(), { trash: [{ id: 'T1' }] }))));
assert.equal(back.trash.length, 1); assert.ok(Array.isArray(S.normalize(JSON.parse(JSON.stringify(Object.assign(S.newDossier(), { trash: null })))).trash));
assert.ok(S.cmpVersion('1.0.10', '1.0.9') > 0 && S.cmpVersion('2.0.0-rc.1', '2.0.0') === 0 && S.cmpVersion('1.1', '1.1.0') === 0);
assert.ok(S.bundlePolicy('ieeg/R1/a.edf', false) && !S.bundlePolicy('history/x.json.gz', false) && !S.bundlePolicy('trash/gallery/G1.png', false));

// ---------------------------------------------------------------- historique
const n = H.name(12, '2026-11-21T15:30:02.123Z', 'remove'); assert.equal(n, 'dossier.r000012.20261121T153002Z.remove.json.gz');
const p = H.parse('history/' + n); assert.equal(p.rev, 12); assert.equal(p.t, '2026-11-21T15:30:02Z'); assert.ok(p.pinned);
assert.equal(H.parse('dossier.json'), null);
const now = Date.parse('2026-11-21T12:00:00Z');
assert.equal(H.due(null, null, now), 'open'); assert.equal(H.due(null, now - 60e3, now), null); assert.equal(H.due(null, now - 11 * 60e3, now), 'auto'); assert.equal(H.due('Remove!', now, now), 'remove');
// rétention : 48 h complètes, puis une par jour, puis une par mois, épinglées toujours, 20 plus récentes toujours
const names = []; let rev = 0;
for (let k = 0; k < 400 * 24; k += 3) names.push(H.name(++rev, new Date(now - k * 3600e3).toISOString(), 'auto'));   // une toutes les 3 h sur 400 jours
names.push(H.name(++rev, new Date(now - 300 * 864e5).toISOString(), 'remove'));
const K = H.keep(names.concat(['notes.txt']), now), kept = names.filter(x => K.has(x)).map(H.parse);
assert.ok(K.has('notes.txt'), 'fichier inconnu jamais supprimé');
assert.equal(kept.filter(e => now - e.ms < 48 * 3600e3).length, 16, 'toutes les révisions des 48 h');
const recent = new Set(names.map(H.parse).sort((a, b) => b.ms - a.ms).slice(0, 20).map(e => e.name)), mid = kept.filter(e => !recent.has(e.name) && !e.pinned && now - e.ms >= 48 * 3600e3 && now - e.ms < 90 * 864e5);
assert.equal(mid.length, new Set(mid.map(e => e.t.slice(0, 10))).size, 'une par jour entre 48 h et 90 j');
const old = kept.filter(e => !e.pinned && now - e.ms >= 90 * 864e5); assert.equal(old.length, new Set(old.map(e => e.t.slice(0, 7))).size, 'une par mois au-delà');
assert.ok(kept.some(e => e.reason === 'remove'), 'épinglée gardée');
assert.ok(kept.length < 140, 'élagage effectif : ' + kept.length);
// gzip aller-retour
const txt = JSON.stringify(d); assert.equal(await H.gunzip(await H.gzip(txt)), txt);
console.log('OK safety (corbeille, historique) —', kept.length, 'révisions gardées sur', names.length);
