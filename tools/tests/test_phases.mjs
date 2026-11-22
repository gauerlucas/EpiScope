// node tools/tests/test_phases.mjs — v2.0.0 : crises rapportées (origine gardée après rattachement), vue d'ensemble d'une
// exploration (frise des tracés et des crises), cartes 10-20 intercritiques veille / sommeil. Données synthétiques.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/store.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store;

// ---------------------------------------------------------------- crises rapportées : visibles après rattachement
{
  const d = S.newDossier({ pseudo: 'PH' }), ex = S.addExploration(d, { kind: 'phase1', start: '2025-03-03' });
  const r1 = S.addSeizure(d, null, { datetime: '2024-11-02' }), r2 = S.addSeizure(d, null, { datetime: '2024-12-24' }), z = S.addSeizure(d, ex.id, { datetime: '2025-03-04T02:10' });
  assert.equal(r1.origin, 'reported'); assert.equal(z.origin, '');
  S.moveSeizure(d, r1.id, ex.id);
  assert.deepEqual(S.reportedSeizures(d).map(x => x.id), [r2.id], 'non rattachées');
  assert.deepEqual(S.reportedAll(d).map(x => x.id), [r1.id, r2.id], 'carte du dossier : rattachées comprises');
  assert.equal(S.addSeizure(d, null, {}).label, 'Crise rapportée 3', 'numérotation sans doublon après rattachement');
  // anciens dossiers : origine déduite
  const raw = JSON.parse(JSON.stringify(d)); for (const x of raw.seizures) delete x.origin; raw.seizures.find(x => x.id === r1.id).explorationId = ex.id;
  const dn = S.normalize(raw); assert.equal(S.byId(dn.seizures, r2.id).origin, 'reported'); assert.equal(S.byId(dn.seizures, z.id).origin, '');
}

// ---------------------------------------------------------------- vue d'ensemble : frise
{
  const d = S.newDossier({ pseudo: 'OV' }), ex = S.addExploration(d, { kind: 'phase1', start: '2025-01-06', end: '2025-01-09' });
  ex.recordings = [
    { id: 'R1', title: 'nuit 1', kind: 'inter', duration: 8 * 3600, clock: { start: '2025-01-06T21:00:00', blocks: [{ t0: 0, t1: 8 * 3600, r0: 0 }] } },
    { id: 'R2', title: 'crise', kind: 'ictal', duration: 600, clock: { start: '2025-01-08T14:50:00', blocks: [{ t0: 0, t1: 600, r0: 0 }] } },
    { id: 'R3', title: 'sans heure', kind: 'inter', duration: 60 }];
  S.addSeizure(d, ex.id, { datetime: '2025-01-08T14:56' }); const z2 = S.addSeizure(d, ex.id, { datetime: '2025-01-10' }); z2.events.push({ id: 1, sign_id: 'x', t: 0 });
  const O = S.explorationOverview(d, ex);
  assert.equal(O.t0, '2025-01-06T00:00:00'); assert.equal(O.t1, '2025-01-10T23:59:59', 'une crise après la fin élargit la frise');
  assert.deepEqual(O.days.map(x => x.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(O.recs.map(r => [r.id, r.t0 && r.t0.slice(0, 19), r.t1 && r.t1.slice(0, 19)]), [['R1', '2025-01-06T21:00:00', '2025-01-07T05:00:00'], ['R2', '2025-01-08T14:50:00', '2025-01-08T15:00:00'], ['R3', null, null]]);
  assert.deepEqual(O.seizures.map(z => [z.t, z.date, z.events]), [['2025-01-08T14:56:00', '2025-01-08', 0], ['', '2025-01-10', 1]]);
  const far = S.addSeizure(d, null, { datetime: '2023-05-01' }); S.moveSeizure(d, far.id, ex.id); const O3 = S.explorationOverview(d, ex);
  assert.equal(O3.t0, '2025-01-06T00:00:00', 'une crise rapportée ancienne n’étire pas la frise'); assert.ok(O3.seizures.find(z => z.id === far.id).outside);
  const e2 = S.addExploration(d, { kind: 'seeg' }); e2.start = ''; e2.end = ''; const O2 = S.explorationOverview(d, e2); assert.equal(O2.t0, null); assert.deepEqual(O2.days, []);
}

// ---------------------------------------------------------------- cartes 10-20 : veille / sommeil
{
  const d = S.newDossier({ pseudo: 'EEG' }), ex = S.addExploration(d, { kind: 'phase1' }); ex.eeg.map = { spikes: { Fp1: 2 }, slow: {}, ictal: {} };
  const dn = S.normalize(JSON.parse(JSON.stringify(d))), M = S.byId(dn.explorations, ex.id).eeg.map;
  assert.deepEqual(Object.keys(M).sort(), ['ictal', 'slow', 'slowS', 'slowW', 'spikes', 'spikesS', 'spikesW']);
  assert.deepEqual(M.spikes, { Fp1: 2 }, 'carte d’avant 2.0 gardée (vigilance non précisée)'); assert.deepEqual(M.spikesW, {});
  assert.deepEqual(S.EEG_MAP_KEYS, ['spikesW', 'spikesS', 'slowW', 'slowS', 'ictal']);
}
console.log('test_phases : ok');
