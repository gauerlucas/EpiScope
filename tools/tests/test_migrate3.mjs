// node tools/tests/test_migrate3.mjs — format 2.0 (schéma 3) : plus de séances, crises rapportées, préréglages
// d'exploration. Dossier de schéma 2 entièrement synthétique (aucune donnée de patient).
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/store.js', 'src/bids.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store;

// ---------------------------------------------------------------- dossier de schéma 2 fabriqué à la main
function schema2() {
  const d = S.newDossier({ pseudo: 'MIGR' });
  d.schema = 2; d.minReader = '1.0.0';
  const e1 = S.addExploration(d, { kind: 'phase1', start: '2024-03-04' }), e2 = S.addExploration(d, { kind: 'seeg', start: '2024-09-10' });
  e1.notes = 'Note de l’exploration.';
  d.sessions = [
    { id: 'S1', explorationId: e1.id, label: 'Séance 1', date: '2024-03-04', notes: 'nuit agitée', files: [{ name: 'nuit1.edf' }] },
    { id: 'S2', explorationId: e1.id, label: 'Séance 2', date: '2024-03-06', notes: '', files: [] },
    { id: 'S3', explorationId: e2.id, label: 'Séance 1', date: '2024-09-11', notes: '', files: ['seeg.edf'] },
    { id: 'S4', explorationId: 'E_disparue', label: 'Séance perdue', date: '2023-01-01' },
  ];
  const mk = (id, sid, dt, lbl) => ({ id, sessionId: sid, label: lbl, datetime: dt, habitual: 'yes', events: [{ id: 1, sign_id: 'fear', t: 0, dt: 1, dur: 2 }], params: {} });
  d.seizures = [mk('C1', 'S1', '2024-03-04T23:10', 'Crise 1'), mk('C2', 'S2', '', 'Crise 2'), mk('C3', 'S3', '2024-09-11T02:00', 'Crise 1'), mk('C4', 'S4', '2023-01-01T10:00', 'Crise ancienne')];
  // corbeille : une séance supprimée avec sa crise, et un correctif de liste « sessions »
  d.trash = [{ id: 'T1', at: '2024-04-01T10:00:00Z', kind: 'session', items: [
    { loc: { list: 'sessions' }, obj: { id: 'S5', explorationId: e1.id, label: 'Séance 3', date: '2024-03-07' }, index: 2 },
    { loc: { list: 'seizures' }, obj: mk('C5', 'S5', '', 'Crise 3'), index: 2 }],
    patches: [{ t: 'set', list: 'sessions', id: 'S2', field: 'notes', old: 'x' }, { t: 'set', list: 'gallery', id: 'G0', field: 'seizureId', old: 'C5' }] }];
  return { d: JSON.parse(JSON.stringify(d)), e1, e2 };
}

// ---------------------------------------------------------------- essai à blanc : migrate3 sur une copie
{
  const { d } = schema2(), copy = JSON.parse(JSON.stringify(d)), R = S.migrate3(copy);
  assert.deepEqual({ s: R.sessions, z: R.seizures, n: R.notes, o: R.orphans, t: R.trash }, { s: 4, z: 4, n: 2, o: 1, t: 1 }, 'rapport de l’essai à blanc');
  assert.ok(R.changed); assert.ok('sessions' in d, 'l’original n’est pas touché');
  assert.deepEqual(S.migrate3(copy), { sessions: 0, seizures: 0, notes: 0, orphans: 0, trash: 0, changed: false }, 'idempotente');
}

// ---------------------------------------------------------------- lecture d'un dossier de schéma 2 (normalize)
{
  const { d: raw, e1, e2 } = schema2(), d = S.normalize(raw);
  assert.equal(d.schema, 3); assert.equal(d.minReader, '2.0.0'); assert.ok(!('sessions' in d), 'plus de liste des séances');
  assert.equal(d._snap, 'migrate', 'instantané épinglé avant la première écriture au nouveau format');
  assert.ok(d.journal.some(j => /format 2\.0/.test(j.text || j.label || JSON.stringify(j))), 'migration écrite au journal');
  const z = id => S.byId(d.seizures, id);
  assert.equal(z('C1').explorationId, e1.id); assert.equal(z('C2').explorationId, e1.id); assert.equal(z('C3').explorationId, e2.id);
  assert.equal(z('C2').datetime, '2024-03-06', 'date de la séance reprise'); assert.equal(z('C1').datetime, '2024-03-04T23:10', 'date de la crise gardée');
  assert.equal(z('C4').explorationId, null, 'séance sans exploration : crise rapportée');
  assert.ok(d.seizures.every(x => !('sessionId' in x)));
  const ex1 = S.byId(d.explorations, e1.id), ex2 = S.byId(d.explorations, e2.id);
  assert.match(ex1.notes, /^Note de l’exploration\.\n\[Séance 1 du 04\/03\/2024\] nuit agitée — fichiers : nuit1\.edf$/, 'notes et fichiers versés dans l’exploration, datés');
  assert.match(ex2.notes, /\[Séance 1 du 11\/09\/2024\] fichiers : seeg\.edf/);
  const T = d.trash[0]; assert.equal(T.items.length, 1); assert.equal(T.items[0].loc.list, 'seizures'); assert.equal(T.items[0].obj.explorationId, e1.id, 'crise de la corbeille rattachée');
  assert.deepEqual(T.patches.map(p => p.list), ['gallery']);
  // restauration de la crise de la corbeille au nouveau format
  assert.ok(S.restoreTrash(d, T.id).ok); assert.equal(z('C5').explorationId, e1.id); assert.equal(S.seizuresOfExploration(d, e1.id).length, 3);
  // relu une seconde fois : rien ne change, pas de nouvel instantané
  const d2 = S.normalize(JSON.parse(JSON.stringify(d, (k, v) => k.startsWith('_') ? undefined : v)));
  assert.equal(d2._snap, undefined); assert.deepEqual(d2.seizures.map(x => x.explorationId), d.seizures.map(x => x.explorationId));
}

// ---------------------------------------------------------------- nouveau dossier : crises rattachées, crises rapportées
{
  const d = S.newDossier({ pseudo: 'NEW' });
  assert.equal(d.schema, 3); assert.ok(!('sessions' in d));
  const ex = S.addExploration(d, { kind: 'phase1', start: '2025-02-03' });
  const a = S.addSeizure(d, ex.id, { datetime: '2025-02-03T22:00' }), b = S.addSeizure(d, ex.id, { datetime: '2025-02-05T04:00' }), c = S.addSeizure(d, ex.id, { datetime: '2025-02-05T09:30' });
  assert.equal(a.explorationId, ex.id); assert.equal(c.label, 'Crise 3');
  assert.deepEqual(S.seizureDays(d, ex.id).map(x => [x.day, x.n, x.seizures.length]), [['2025-02-03', 1, 1], ['2025-02-05', 3, 2]], 'jours J1, J3');
  const r = S.addSeizure(d, null, { datetime: '2024-12-24' });
  assert.equal(r.explorationId, null); assert.equal(r.label, 'Crise rapportée 1'); assert.deepEqual(S.reportedSeizures(d).map(x => x.id), [r.id]);
  assert.throws(() => S.addSeizure(d, 'E_inconnue'), /exploration inconnue/);
  // ouvrir une crise rapportée : pseudo-exploration non enregistrée
  const c0 = S.contextOf(d, r.id); assert.equal(c0.exploration.id, S.REPORTED); assert.equal(c0.exploration, S.reportedEx(d), 'même objet pour le dossier');
  const w = S.toWorkspace(d, r.id); w.events.push({ id: 1, sign_id: 'fear', t: 0, dt: 1, dur: 3 });
  assert.ok(S.fromWorkspace(d, r.id, w).changed); assert.equal(r.events.length, 1);
  assert.ok(!JSON.stringify(d).includes(S.REPORTED), 'la pseudo-exploration n’est jamais enregistrée');
  // contexte des crises rapportées sans crise : la première saisie crée une crise rapportée
  const w2 = S.toWorkspace(d, { explorationId: S.REPORTED }); w2.events.push({ id: 2, sign_id: 'fear', t: 0, dt: 1, dur: 3 });
  const r2 = S.fromWorkspace(d, { explorationId: S.REPORTED }, w2); assert.ok(r2.ctx.seizureId); assert.equal(S.byId(d.seizures, r2.ctx.seizureId).explorationId, null);
  // rattacher plus tard, puis replacer au dossier
  assert.ok(S.moveSeizure(d, r.id, ex.id)); assert.equal(r.explorationId, ex.id); assert.equal(S.reportedSeizures(d).length, 1);
  assert.equal(S.moveSeizure(d, r.id, ex.id), false, 'déjà rattachée'); assert.equal(S.moveSeizure(d, r.id, 'E_x'), false);
  assert.ok(S.moveSeizure(d, r.id, null)); assert.equal(r.explorationId, null);
  // supprimer l'exploration : ses crises vont à la corbeille avec elle, les crises rapportées restent
  S.remove(d, 'exploration', ex.id); assert.equal(d.seizures.length, 2); assert.ok(d.seizures.every(x => x.explorationId === null));
  assert.ok(S.restoreTrash(d, d.trash[d.trash.length - 1].id).ok); assert.equal(S.seizuresOfExploration(d, ex.id).length, 3);
}

// ---------------------------------------------------------------- préréglages : EEG ambulatoire, post-opératoire
{
  const d = S.newDossier({ pseudo: 'PRE' });
  const amb = S.addExploration(d, { kind: 'other', context: 'ambu', start: '2023-05-01' }), p1 = S.addExploration(d, { kind: 'phase1', start: '2024-01-01' });
  const po = S.addExploration(d, { kind: 'other', context: 'postop', start: '2025-06-01' }), po2 = S.addExploration(d, { kind: 'other', context: 'postop', start: '2025-12-01' }), oth = S.addExploration(d, { kind: 'other' });
  assert.equal(amb.label, 'EEG ambulatoire'); assert.equal(po.label, 'Vidéo-EEG post-opératoire'); assert.equal(po2.label, 'Vidéo-EEG post-opératoire (2)'); assert.equal(oth.label, 'Exploration 1');
  assert.equal(p1.context, ''); assert.equal(S.V.explorationContext.ambu, 'EEG ambulatoire');
  assert.equal(SV.BIDS.sesOf(d, amb), 'ambu1'); assert.equal(SV.BIDS.sesOf(d, po2), 'postop2'); assert.equal(SV.BIDS.sesOf(d, oth), 'expl1'); assert.equal(SV.BIDS.sesOf(d, p1), 'scalp1');
  const dn = S.normalize(JSON.parse(JSON.stringify(d))); assert.equal(S.byId(dn.explorations, po.id).context, 'postop');
}
console.log('test_migrate3 : ok');
