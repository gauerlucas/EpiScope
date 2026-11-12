// node tools/tests/test_store.mjs — modèle du dossier : migration v1, crises, hypothèses versionnées, aller-retour espace de travail
import fs from 'fs'; import vm from 'vm'; import assert from 'assert';
vm.runInThisContext(fs.readFileSync('src/store.js', 'utf8'));
const S = globalThis.SV.Store;
const c1 = JSON.parse(fs.readFileSync('tools/tests/fixtures/exemple_temporal_mesial_gauche.json', 'utf8'));
const c2 = JSON.parse(fs.readFileSync('tools/tests/fixtures/exemple_seeg_temporal_mesial_gauche.json', 'utf8'));
const { dossier: d, seizure: s1 } = S.migrateCase(c1);
assert.equal(d.explorations[0].kind, 'phase1'); assert.equal(d.seizures.length, 1);
const { seizure: s2 } = S.migrateCase(c2, d);
assert.equal(d.explorations.length, 2, 'SEEG ajoutée'); assert.equal(d.explorations[1].kind, 'seeg');
assert.equal(d.explorations[1].electrodes.length, c2.electrodes.length);
// espace de travail
const st = S.toWorkspace(d, s2.id); assert.equal(st.stims.length, c2.stims.length); assert.equal(st.events.length, c2.events.length);
st.events = st.events.concat([{ id: 99, sign_id: 'fear', t: 30, dt: 1, dur: 3, side: '', topography: '', conf: 1, note: '' }]); st.patient.eeg_onset = -12; st.patient.lesion = [145];
assert.ok(S.fromWorkspace(d, s2.id, st).changed); assert.equal(S.byId(d.seizures, s2.id).events.length, c2.events.length + 1); assert.equal(S.byId(d.seizures, s2.id).eeg_onset, -12);
assert.deepEqual(S.lesionRegions(d), [145]);
assert.ok(!S.fromWorkspace(d, s2.id, S.toWorkspace(d, s2.id)).changed, 'pas de changement');
// exploration sans crise : la première saisie crée séance + crise
const ex3 = S.addExploration(d, { kind: 'seeg' }); const w3 = S.toWorkspace(d, { explorationId: ex3.id }); assert.equal(w3.events.length, 0);
w3.stims.push({ id: 's1', elec: 'A', c1: 1, c2: 2 }); let r3 = S.fromWorkspace(d, { explorationId: ex3.id }, w3); assert.ok(r3.changed && !r3.ctx.seizureId); assert.equal(ex3.stims.length, 1);
w3.events.push({ id: 1, sign_id: 'fear', t: 0, dt: 1, dur: 3 }); r3 = S.fromWorkspace(d, r3.ctx, w3); assert.ok(r3.ctx.seizureId); assert.equal(S.seizuresOfExploration(d, ex3.id).length, 1);
S.remove(d, 'exploration', ex3.id);
// hypothèses versionnées
const m = S.addMeeting(d, { kind: 'post_phase1' });
const h1 = S.addHypothesis(d, { title: 'Temporal mésial G', side: 'L', ez: [145, 147], meetingId: m.id });
const h2 = S.addHypothesis(d, { supersedes: h1.id, title: 'Temporal plus G', ez: [145, 147, 40] });
assert.equal(h2.version, 2); assert.equal(h2.lineage, h1.lineage); assert.equal(h1.status, 'revised');
assert.equal(S.latestHypotheses(d).length, 1); assert.equal(S.latestHypotheses(d)[0].id, h2.id);
const dec = S.addDecision(d, { meetingId: m.id, type: 'seeg', hypothesisIds: [h2.id] }); assert.ok(m.decisionIds.includes(dec.id));
// une lésion ajoutée dans le dossier (hors espace de travail) n'est pas effacée par l'enregistrement de la crise
const w4 = S.toWorkspace(d, s2.id); S.addLesion(d, { label: 'SH', regions: [146], source: 'radiology' }); S.fromWorkspace(d, s2.id, w4);
assert.deepEqual(S.lesionRegions(d).sort(), [145, 146]); assert.deepEqual(w4.patient.lesion.sort(), [145, 146]);
w4.patient.lesion = [146]; S.fromWorkspace(d, s2.id, w4); assert.deepEqual(S.lesionRegions(d), [146], 'retrait fait dans l’espace de travail');
console.log('stage:', S.stage(d).text, '| ILAE:', S.ilaeText(S.deriveIlae(s1, null)), '| journal', d.journal.length, 'entrées');
// normalisation après sérialisation
const d2 = S.normalize(JSON.parse(JSON.stringify(d))); assert.equal(d2.seizures.length, 2);
S.remove(d2, 'exploration', d2.explorations[0].id); assert.equal(d2.seizures.length, 1);
// v4.7 : projets d'implantation d'une SEEG
{ const exP = S.addExploration(d, { kind: 'seeg' }); exP.electrodes = [{ id: 'e1', name: 'A', target: [1, 2, 3] }, { id: 'e2', name: 'B', target: [4, 5, 6] }];
  const p1 = S.ensureProject(exP); assert.equal(p1.name, 'Projet 1'); assert.equal(S.projectsOf(exP).length, 1);
  const p2 = S.addProject(d, exP, { copy: true, name: 'Variante' }); assert.equal(exP.project.id, p2.id); assert.equal(exP.electrodes.length, 2); assert.notEqual(exP.electrodes[0].id, 'e1', 'copie : nouveaux identifiants');
  exP.electrodes.pop(); assert.equal(S.projectsOf(exP).find(p => p.name === 'Projet 1').n, 2);
  assert.ok(S.switchProject(d, exP, p1.id)); assert.deepEqual(exP.electrodes.map(e => e.id), ['e1', 'e2']); assert.equal(S.projectsOf(exP).find(p => p.name === 'Variante').n, 1, 'variante gardée avec sa modification');
  assert.ok(S.renameProject(d, exP, p2.id, 'Variante courte')); assert.ok(S.projectsOf(exP).some(p => p.name === 'Variante courte'));
  const p3 = S.addProject(d, exP, {}); assert.equal(exP.electrodes.length, 0); assert.equal(p3.name, 'Projet 3');
  assert.ok(S.removeProject(d, exP, p3.id)); assert.equal(S.projectsOf(exP).length, 2); assert.ok(exP.electrodes.length > 0, 'projet actif supprimé : le plus récent des autres est ouvert');
  exP.electrodes[0].real = { contacts: [[0, 0, 0]] }; assert.ok(S.projectLocked(exP)); assert.ok(!S.switchProject(d, exP, S.projectsOf(exP).find(p => !p.active).id), 'implantation posée : plus de bascule');
  const dj = S.normalize(JSON.parse(JSON.stringify(d))), exJ = S.byId(dj.explorations, exP.id); assert.equal(S.projectsOf(exJ).length, 2, 'projets gardés à la sérialisation');
  S.remove(d, 'exploration', exP.id); }
// v4.11 : un schéma fait de trajectoires du patient (plan.tip / plan.entry, sans cible sur le gabarit) se reprend
{ const a = S.addExploration(d, { kind: 'seeg' }), b = S.addExploration(d, { kind: 'seeg' });
  a.electrodes = [{ id: 'x1', name: 'A’', target: [1, 2, 3] }, { id: 'x2', name: 'B’', plan: { tip: [0, 0, 0], entry: [40, 0, 0], snap: true } }, { id: 'x3', name: 'Z' }];
  const r = S.importImplantation(d, a, b, 'replace'); assert.equal(r.added, 2); assert.equal(r.noTarget, 1); assert.ok(b.electrodes.some(e => e.name === 'B’' && e.plan && e.plan.tip), 'trajectoire du patient reprise');
  assert.equal(S.implantations(d).find(it => it.ex === a).nPlan, 2, 'trajectoires prévues comptées (gabarit et patient)');
  S.remove(d, 'exploration', a.id); S.remove(d, 'exploration', b.id); }
// v5 : titres « Crise n » renumérotés dans l'ordre chronologique (les titres libres sont gardés)
{ const ex = S.addExploration(d, { kind: 'seeg', label: 'SEEG test' }), ses = S.addSession(d, ex.id, { date: '2024-01-10' });
  const z1 = S.addSeizure(d, ses.id, { datetime: '2024-01-12T15:00' }), z2 = S.addSeizure(d, ses.id, { datetime: '2024-01-11T03:00' }), z3 = S.addSeizure(d, ses.id, { datetime: '2024-01-13T08:00', label: 'Crise nocturne' });
  assert.equal(z1.label, 'Crise 1'); assert.equal(z2.label, 'Crise 2');
  assert.equal(S.renumberSeizures(d, ex.id), 2, 'deux titres renumérotés'); assert.equal(z2.label, 'Crise 1'); assert.equal(z1.label, 'Crise 2'); assert.equal(z3.label, 'Crise nocturne', 'titre libre gardé');
  assert.equal(S.renumberSeizures(d, ex.id), 0, 'stable'); S.remove(d, 'exploration', ex.id); }
console.log('OK store');
