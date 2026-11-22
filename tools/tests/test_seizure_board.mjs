// node tools/tests/test_seizure_board.mjs — v2.0.0 : tableau des crises — crises annotées dans les fichiers (plusieurs par
// nuit), rattachement par l'heure, doublons entre exports qui se recouvrent, reprise de la sémiologie. Données synthétiques.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/store.js', 'src/ieeg.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store, IE = SV.IEEG;

// ---------------------------------------------------------------- toutes les crises d'un fichier
{
  const ev = [{ onset: 100, label: 'EEG sz start' }, { onset: 160, label: 'sz end' }, { onset: 500, label: 'note infirmière' }, { onset: 3600, label: 'Crise 2' }, { onset: 7200, label: 'début de crise' }, { onset: 7290, label: 'fin de crise' }];
  assert.deepEqual(IE.seizureEvents(ev).map(x => [x.onset, x.end]), [[100, 160], [3600, null], [7200, 7290]]);
  assert.deepEqual(IE.seizureEvents([]), []);
}

// ---------------------------------------------------------------- annotations → fiches
{
  const d = S.newDossier({ pseudo: 'TB' }), ex = S.addExploration(d, { kind: 'phase1', start: '2025-02-10' });
  const night = { id: 'RN', title: 'nuit', duration: 8 * 3600, clock: { start: '2025-02-10T22:00:00', blocks: [{ t0: 0, t1: 8 * 3600, r0: 0 }] }, marks: { user: [] },
    events: [{ onset: 1800, label: 'sz start' }, { onset: 1860, label: 'sz end' }, { onset: 14400, label: 'seizure onset' }, { onset: 21600, label: 'EEG sz' }] };
  const seg = { id: 'RS', title: 'segment', duration: 1200, clock: { start: '2025-02-11T01:50:00', blocks: [{ t0: 0, t1: 1200, r0: 0 }] }, marks: { user: [] }, events: [{ onset: 600, label: 'sz start' }] };
  ex.recordings = [night, seg];
  const z1 = S.addSeizure(d, ex.id, { datetime: '2025-02-10T22:30' });
  night.seizureId = z1.id; night.marks.onset = 1801;
  const z3 = S.addSeizure(d, ex.id, { datetime: '2025-02-11T04:01' });
  const A = S.annotatedSeizures(d, ex, IE.seizureEvents);
  const st = A.map(x => [x.recId, x.onset, x.state, x.seizureId]);
  assert.deepEqual(st, [
    ['RN', 1800, 'linked', z1.id],
    ['RN', 14400, 'free', null],
    ['RS', 600, 'duplicate', null],
    ['RN', 21600, 'match', z3.id]]);
  assert.equal(A[1].abs.slice(0, 19), '2025-02-11T02:00:00');
  assert.deepEqual(S.recordingOverlaps(ex).map(o => [o.a, o.b, o.from.slice(11, 19), o.to.slice(11, 19)]), [['RN', 'RS', '01:50:00', '02:10:00']]);
}

// ---------------------------------------------------------------- reprendre la sémiologie
{
  const d = S.newDossier({ pseudo: 'CP' }), ex = S.addExploration(d, { kind: 'phase1' });
  const a = S.addSeizure(d, ex.id, { vigilance: 'nrem' }), b = S.addSeizure(d, ex.id);
  a.events = [{ id: 7, sign_id: 'aura_epigastric', t: 0, dt: 1 }, { id: 9, sign_id: 'oral_automatisms', t: 12, dt: 1, side: 'L' }];
  assert.equal(S.copySemiology(d, a.id, b.id), 2);
  assert.deepEqual(b.events.map(e => [e.id, e.sign_id, e.t, e.side]), [[1, 'aura_epigastric', 0, undefined], [2, 'oral_automatisms', 12, 'L']]);
  assert.equal(b.vigilance, 'nrem'); assert.equal(b.semioFrom, a.id);
  b.events[0].t = 3; assert.equal(a.events[0].t, 0, 'copie indépendante');
  assert.equal(S.copySemiology(d, a.id, a.id), 0);
}
console.log('test_seizure_board : ok');
