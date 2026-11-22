// node tools/tests/test_provenance.mjs — v1.1.0 : résultats et provenance (provenance.js, store.addResult, migration des anciens jeux)
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
globalThis.window = globalThis; globalThis.SV = {}; globalThis.EPISCOPE_BRAND = { version: '1.1.0', build: 'abc1234' };
for (const f of ['src/provenance.js', 'src/store.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const P = SV.Prov, S = SV.Store;
// empreintes
assert.equal(P.hashJSON({ b: 1, a: [1, 2] }), P.hashJSON({ a: [1, 2], b: 1 }), 'JSON canonique : ordre des clés indifférent');
assert.notEqual(P.hashJSON({ a: 1 }), P.hashJSON({ a: 2 }));
assert.equal(await P.sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 (vecteur de référence)');
// enregistrement
const inputs = [{ type: 'recording', id: 'R1', sha256: 'aaa' }, { type: 'window', t0: 20, t1: 100 }, { type: 'montage', kind: 'bipolar' }, { type: 'elecMap', hash: 'h1' }];
const r1 = P.make({ method: 'ei', by: 'LG', scope: { recordingId: 'R1', seizureId: 'C1', slot: 'q1' }, inputs, params: { nu: 0.5, lambda: 8 }, outputs: { values: { 'B’1-B’2': 1 } }, label: 'EI · nuit' });
assert.equal(r1.methodVersion, P.versionOf('ei')); assert.deepEqual(r1.app, { version: '1.1.0', build: 'abc1234' }); assert.equal(r1.status, 'current');
assert.match(P.chip(r1), /^EI 1\.0\.0 · \d\d\/\d\d\/\d{4} · EpiScope 1\.1\.0 · LG$/);
// état face à l'état actuel
const cur = { recording: { sha256: 'aaa' }, window: { t0: 20, t1: 100 }, montage: { kind: 'bipolar' }, elecMap: { hash: 'h1' }, params: { lambda: 8, nu: 0.5 } };
assert.equal(P.status(r1, cur).state, 'current');
assert.equal(P.status(r1, Object.assign({}, cur, { window: { t0: 20, t1: 120 } })).state, 'stale', 'fin de crise déplacée');
assert.equal(P.status(r1, Object.assign({}, cur, { recording: { sha256: 'bbb' } })).state, 'stale', 'fichier différent');
assert.equal(P.status(r1, Object.assign({}, cur, { params: { nu: 0.6, lambda: 8 } })).state, 'stale', 'réglages');
const old = Object.assign(JSON.parse(JSON.stringify(r1)), { methodVersion: '0.9.0' }); assert.equal(P.status(old, cur).state, 'old-method', 'version de méthode dépassée');
// rangement : le recalcul remplace sans effacer
const d = S.newDossier({ pseudo: 'T' }); S.addResult(d, r1);
const r2 = P.make({ method: 'ei', scope: { recordingId: 'R1', seizureId: 'C1', slot: 'q1' }, inputs, outputs: { values: { 'B’1-B’2': 0.9 } } }); S.addResult(d, r2);
const r3 = P.make({ method: 'ei', scope: { recordingId: 'R1', seizureId: 'C2', slot: 'q2' }, inputs }); S.addResult(d, r3);
assert.equal(r1.status, 'superseded'); assert.equal(r2.supersedes, r1.id); assert.equal(r2.status, 'current'); assert.equal(r3.status, 'current', 'autre crise : autre lignée');
assert.deepEqual(S.resultLineage(d, r2.id).map(x => x.id).sort(), [r1.id, r2.id].sort()); assert.equal(d.results.length, 3);
assert.ok(d.journal.some(j => j.action === 'compute'), 'calcul inscrit au journal');
// ancien dossier : jeux d'Analyses sans provenance → résultat « antérieur », une seule fois
const old2 = S.newDossier({ pseudo: 'V' }), ex = S.addExploration(old2, { kind: 'seeg' }); ex.quant = [{ id: 'qA', name: 'EI ancien', method: 'ei', ieeg: 'R9', values: { 'A1-A2': 0.7 } }, { id: 'qB', name: 'vide', values: {} }];
delete old2.results; const n1 = S.normalize(JSON.parse(JSON.stringify(old2)));
assert.equal(n1.results.length, 1); assert.ok(n1.results[0].legacy); assert.equal(n1.explorations[0].quant[0].resultId, n1.results[0].id);
assert.equal(P.status(n1.results[0]).state, 'legacy'); assert.match(P.chip(n1.results[0]), /antérieur à la version 1\.1/);
assert.equal(S.normalize(JSON.parse(JSON.stringify(n1))).results.length, 1, 'migration idempotente');
assert.equal(P.methodOf('hfo:taux croisé'), 'hfo'); assert.equal(P.methodOf(''), 'import');
console.log('OK provenance (empreintes, états, lignées, migration des anciens jeux)');
