// node tools/tests/test_v32.mjs — v3.2.0 (données synthétiques) :
//  - intercritique SEEG pointé sur les plots : rythme lésionnel, groupes de pointes (normalisation des anciens dossiers,
//    ajout / retrait, plages, phrases du rapport, retrait d'un groupe par la corbeille) ;
//  - jeux de valeurs rattachés à une crise (rangement du tracé, q.seizureId) ; dernière intervention des calques ;
//  - cavité de résection : T1 pré-opératoire (LCR déjà présent écarté) et noyau épais (liserés de cortex écartés),
//    composition substance grise / blanche.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/imaging/cavity.js', 'src/store.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store, CV = SV.Cavity; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// ---------------------------------------------------------------- intercritique pointé
{
  const d = S.newDossier({ pseudo: 'V32' }), ex = S.addExploration(d, { kind: 'seeg' });
  ok(ex.inter.groups.length === 0 && Object.keys(ex.inter.lesional).length === 0 && ex.inter.lesionalText === '', 'nouvelle SEEG : pointage vide');
  // ancien dossier (avant 3.2.0) : pas de pointage, lignes de grapho-éléments gardées
  const old = { kind: 'seeg', inter: { wake: 'normal', spikes: [{ contacts: 'A’1-2', text: 'pointes', vig: 'V' }] } };
  const N0 = S.normalizeInter(old.inter); ok(N0.spikes.length === 1 && N0.wake === 'normal' && Array.isArray(N0.groups) && N0.lesional && typeof N0.lesional === 'object', 'ancien format : champs ajoutés, rien de perdu');
  const N1 = S.normalizeInter({ groups: [{ contacts: ['B1', 'B1', 'B2'] }, null, 'x'], lesional: [] });
  ok(N1.groups.length === 1 && N1.groups[0].contacts.join() === 'B1,B2' && N1.groups[0].id && N1.groups[0].label === 'Groupe 1' && N1.groups[0].freq === 'frequent' && !Array.isArray(N1.lesional), 'groupes normalisés (doublons, entrées invalides)');
  const g1 = S.addInterGroup(ex), g2 = S.addInterGroup(ex, { label: 'Foyer B', freq: 'rare', vig: 'S', when: 'J3 nuit', sync: false });
  ok(g1.label === 'Groupe 1' && g2.label === 'Foyer B' && ex.inter.groups.length === 2, 'groupes ajoutés');
  for (const k of ['A’1', 'A’2', 'A’3', 'B’5']) ok(S.toggleInterContact(ex, g1.id, k) === true, 'plot ajouté au groupe ' + k);
  ok(S.toggleInterContact(ex, g1.id, 'A’3') === false && !g1.contacts.includes('A’3'), 'second clic : plot retiré');
  S.toggleInterContact(ex, g2.id, 'C2'); S.toggleInterContact(ex, 'lesional', 'A’1'); S.toggleInterContact(ex, 'lesional', 'A’2');
  ok(S.toggleInterContact(ex, 'nope', 'A’1') === false, 'catégorie inconnue : rien');
  const mk = S.interMarks(ex); ok(mk['A’1'].lesional && mk['A’1'].groups.join() === g1.id && mk['C2'].groups.join() === g2.id && !mk['C2'].lesional, 'plots : catégories par plot');
  ok(S.contactRanges(['B’5', 'A’3', 'A’1', 'A’2', 'A’10', 'B’7']) === 'A’1-3, A’10, B’5, B’7', 'plages de plots : ' + S.contactRanges(['B’5', 'A’3', 'A’1', 'A’2', 'A’10', 'B’7']));
  const sm = S.interSummary(ex);
  ok(/lésionnelle sur A’1-2/.test(sm.lesional), 'phrase lésionnelle : ' + sm.lesional);
  ok(/Groupe 1 : pointes synchrones fréquentes sur A’1-2, B’5 \(veille et sommeil\)/.test(sm.irritative) && /Foyer B : pointes rares sur C2 \(sommeil\), J3 nuit/.test(sm.irritative), 'phrase irritative : ' + sm.irritative);
  // retrait d'un groupe : corbeille du dossier, restauration
  const e = S.discard(d, { kind: 'groupe de pointes', label: g2.label, list: 'explorations', id: ex.id, field: 'inter.groups', item: g2 });
  ok(e && ex.inter.groups.length === 1 && d.trash.length === 1, 'groupe retiré par la corbeille');
  const r = S.restoreTrash(d, e.id); ok(r.ok && ex.inter.groups.length === 2 && ex.inter.groups[1].id === g2.id, 'groupe restauré depuis la corbeille');
  // normalisation au chargement
  const d2 = S.normalize(JSON.parse(JSON.stringify(d))), ex2 = d2.explorations.find(x => x.id === ex.id);
  ok(ex2.inter.groups.length === 2 && ex2.inter.lesional['A’1'] === 1, 'pointage gardé après relecture');
}

// ---------------------------------------------------------------- jeux d'une crise, dernière intervention
{
  const d = S.newDossier({ pseudo: 'V32b' }), ex = S.addExploration(d, { kind: 'seeg' }), z1 = S.addSeizure(d, ex.id, {}), z2 = S.addSeizure(d, ex.id, {});
  const rec = S.bindRec({ id: 'r1', title: 'crises', seizureId: z1.id }); (ex.recordings = ex.recordings || []).push(rec);
  rec.quantIds = { cei: 'qA' }; rec.ei = { quantId: 'qB' }; S.recSetSeizure(rec, z2.id); rec.quantIds = { pei: 'qC' };
  ex.quant.push({ id: 'qD', seizureId: z1.id, values: {} }, { id: 'qE', values: {} });
  const A1 = S.seizureQuantIds(d, z1.id), A2 = S.seizureQuantIds(d, z2.id);
  ok([...A1].sort().join() === 'qA,qB,qD', 'jeux de la crise 1 : ' + [...A1].join());
  ok([...A2].join() === 'qC', 'jeux de la crise 2 (crise active du tracé) : ' + [...A2].join());
  ok(S.seizureQuantIds(d, null).size === 0, 'sans crise : aucun jeu');
  ok(S.lastSurgery(d) === null, 'pas d’intervention');
  const p1 = S.addProcedure(d, { date: '2024-01-02', regions: [5] }), p2 = S.addProcedure(d, { date: '2024-06-01', regions: [] });
  ok(S.lastSurgery(d) === p1, 'intervention sans région ni cavité ignorée');
  p2.resection.cavity = { imagingId: 'I1' }; ok(S.lastSurgery(d) === p2, 'cavité segmentée : intervention retenue');
}

// ---------------------------------------------------------------- cavité : T1 pré-opératoire et noyau épais
{
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
  const nn = 80, N = nn ** 3, lab = new Uint8Array(N), post = new Float32Array(N), pre = new Float32Array(N), c0 = [40, 40, 40], Rr = [30, 34, 28], cav = [26, 44, 46], cyst = [52, 52, 36];
  for (let k = 0; k < nn; k++) for (let j = 0; j < nn; j++) for (let i = 0; i < nn; i++) {
    const q = i + nn * j + nn * nn * k, e = Math.hypot((i - c0[0]) / Rr[0], (j - c0[1]) / Rr[1], (k - c0[2]) / Rr[2]); let L = 0, v = 5;
    if (e < 1) { const depth = (1 - e) * 30; if (depth < 1.2) { L = 201; v = 20; } else if (depth < 4.5) { L = i < 40 ? 10 : 90; v = 65; } else { L = 200; v = 100; } }
    lab[q] = L; let vp = v;
    if (L && L !== 201 && Math.hypot(i - cav[0], j - cav[1], k - cav[2]) < 10) v = 20;   // cavité
    if (L && L !== 201 && Math.hypot(i - cyst[0], j - cyst[1], k - cyst[2]) < 6) { v = 20; vp = 20; }   // kyste : sombre avant et après
    if ((L === 10 || L === 90) && j < 20 && Math.abs(k - 40) < 8 && Math.abs(i - 40) < 10) v = 20;   // liseré mince de cortex (sillon mal recalé)
    post[q] = v + 3 * gauss(); pre[q] = vp + 3 * gauss();
  }
  const hemi = new Uint8Array(256); hemi[10] = 1; hemi[90] = 2; const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], V = data => ({ dims: [nn, nn, nn], affine: I4, data });
  const R0 = CV.segment({ img: V(post), imgT: null, lab: V(lab), thr: 0.3, minMl: 0.1, side: '', hemi });
  const R1 = CV.segment({ img: V(post), imgT: null, lab: V(lab), pre: V(pre), thr: 0.3, minMl: 0.1, side: '', hemi });
  const near = (R, p, r) => R.comps.some(c => Math.hypot(c.center[0] - p[0], c.center[1] - p[1], c.center[2] - p[2]) < r);
  ok(near(R0, cyst, 4), 'sans T1 pré-opératoire, le kyste passe pour une cavité');
  ok(!near(R1, cyst, 4) && R1.preop && R1.preop.excludedMl > 0.3, `T1 pré-opératoire : kyste écarté (${R1.preop && R1.preop.excludedMl} ml)`);
  ok(near(R1, cav, 3), 'la cavité est trouvée');
  ok(R0.core.removedMl > 0.3 && !R1.comps.some(c => c.center[1] < 20) && R1.core && R1.core.removedMl > 0.3, `liseré mince de cortex écarté (noyau ${R1.core && R1.core.erodeMm} mm, ${R1.core && R1.core.removedMl} ml)`);
  const Sel = CV.select(R1, R1.comps.filter(c => near({ comps: [c] }, cav, 3)).map(c => c.id));
  ok(Sel.tissue && Sel.tissue.wmMl > 0 && Sel.tissue.gmMl >= 0 && Math.abs(Sel.tissue.wmMl + Sel.tissue.gmMl - Sel.volumeMl) < 0.05, `composition : SG ${Sel.tissue.gmMl} ml, SB ${Sel.tissue.wmMl} ml / ${Sel.volumeMl} ml`);
}
console.log(n + ' vérifications — v3.2.0 (intercritique pointé, jeux d’une crise, cavité contrainte)');
