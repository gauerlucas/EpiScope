// node tools/tests/test_rec_slots.mjs — v2.0.0 : marques et résultats rangés par crise dans un tracé (rec.sz, rec.free),
// plus de permutation ; lecture des tracés d'avant 2.0 (bySz + premier niveau), enregistrement, corbeille. Synthétique.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/store.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store;

// ---------------------------------------------------------------- tracé d'avant 2.0 : crise active au premier niveau, autres dans bySz
{
  const d = S.newDossier({ pseudo: 'SL' }), ex = S.addExploration(d, { kind: 'seeg', start: '2025-01-01' });
  const a = S.addSeizure(d, ex.id), b = S.addSeizure(d, ex.id);
  ex.recordings = [{ id: 'R', title: 'nuit', duration: 3600, clock: { start: '2025-01-01T22:00:00', blocks: [{ t0: 0, t1: 3600, r0: 0 }] },
    seizureId: a.id, marks: { onset: 100, end: 160, user: [] }, ei: { last: { v: 1 } }, quantIds: { ei: 'Q1' },
    bySz: { [b.id]: { marks: { onset: 2000, end: null, user: [] }, ei: { last: { v: 2 } } } } }];
  const raw = JSON.parse(JSON.stringify(d)), dn = S.normalize(raw), r = dn.explorations[0].recordings[0];
  assert.deepEqual(Object.keys(r.sz).sort(), [a.id, b.id].sort(), 'chaque crise a son rangement');
  assert.equal(r.marks.onset, 100); assert.equal(r.ei.last.v, 1);
  assert.deepEqual(Object.keys(r.bySz), [b.id], 'bySz : les autres crises'); assert.equal(r.bySz[b.id].marks.onset, 2000);
  // changer de crise : rien n'est déplacé
  const before = JSON.stringify(r.sz);
  assert.ok(S.recSetSeizure(r, b.id)); assert.equal(r.marks.onset, 2000); assert.equal(r.ei.last.v, 2);
  assert.equal(JSON.stringify(r.sz), before, 'rangements inchangés'); assert.deepEqual(Object.keys(r.bySz), [a.id]);
  r.ei = { last: { v: 3 } }; assert.equal(r.sz[b.id].ei.last.v, 3, 'écriture dans la crise active');
  assert.equal(r.sz[a.id].ei.last.v, 1, 'l’autre crise intacte');
  assert.equal(r.cei, null); assert.deepEqual(r.sz[b.id].quantIds === undefined ? {} : r.quantIds, {});
  // écriture par l'ancienne vue bySz (code d'avant) : nouvelle crise
  r.bySz = r.bySz || {}; r.bySz.C9 = { marks: { onset: 3000, end: null, user: [] } }; assert.equal(r.sz.C9.marks.onset, 3000);
  delete r.bySz.C9; assert.ok(!('C9' in r.sz));
  // enregistrement : pas de champs au premier niveau, ni de bySz
  const j = JSON.parse(JSON.stringify(dn)).explorations[0].recordings[0];
  assert.ok(!('marks' in j) && !('ei' in j) && !('bySz' in j), JSON.stringify(Object.keys(j)));
  assert.equal(j.sz[a.id].marks.onset, 100); assert.equal(j.seizureId, b.id);
  // relu : identique
  const r2 = S.normalize(JSON.parse(JSON.stringify(dn))).explorations[0].recordings[0]; assert.equal(r2.marks.onset, 2000); assert.equal(r2.bySz[a.id].ei.last.v, 1);
  // heures absolues : toutes les crises
  S.stampAll(dn); assert.equal(r.sz[a.id].marks.abs.onset.slice(11, 19), '22:01:40'); assert.equal(r.marks.abs.onset.slice(11, 19), '22:33:20');
  assert.equal(S.byId(dn.seizures, a.id).onsetAbs.slice(11, 19), '22:01:40');
  // retirer une crise du tracé
  S.recDropSeizure(r, b.id); assert.equal(r.seizureId, a.id); assert.ok(!(b.id in r.sz)); assert.equal(r.marks.onset, 100);
}

// ---------------------------------------------------------------- marques posées hors crise → première crise choisie
{
  const r = S.bindRec({ id: 'R2', marks: { onset: 50, end: null, user: [] } });
  assert.equal(r.free.marks.onset, 50); assert.equal(r.marks.onset, 50);
  S.recSetSeizure(r, 'CX'); assert.equal(r.marks.onset, 50); assert.equal(r.sz.CX.marks.onset, 50); assert.deepEqual(r.free, {});
  S.recSetSeizure(r, 'CY'); assert.equal(r.marks.onset, null, 'nouvelle crise : marques vierges'); r.marks.onset = 70; assert.equal(r.sz.CY.marks.onset, 70);
  S.recSetSeizure(r, null); assert.equal(r.marks.onset, null); assert.equal(S.recSetSeizure(r, null), false);
  assert.equal(S.bindRec(r), r, 'idempotent');
}

// ---------------------------------------------------------------- corbeille : tracé supprimé puis restauré, toujours relié
{
  const d = S.newDossier({ pseudo: 'TR' }), ex = S.addExploration(d, { kind: 'seeg' }), z = S.addSeizure(d, ex.id);
  ex.recordings = [S.bindRec({ id: 'R3', title: 't', files: {}, seizureId: null })]; S.recSetSeizure(ex.recordings[0], z.id); ex.recordings[0].marks.onset = 12;
  const e = S.discard(d, { kind: 'recording', label: 't', list: 'explorations', id: ex.id, field: 'recordings', item: ex.recordings[0] });
  assert.equal(ex.recordings.length, 0);
  const d2 = S.normalize(JSON.parse(JSON.stringify(d))); assert.ok(S.restoreTrash(d2, e.id).ok);
  const r = d2.explorations[0].recordings[0]; assert.equal(r.marks.onset, 12); assert.equal(r.bySz && Object.keys(r.bySz).length, 0);
}
console.log('test_rec_slots : ok');
