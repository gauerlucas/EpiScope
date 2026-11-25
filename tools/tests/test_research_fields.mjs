// node tools/tests/test_research_fields.mjs — v2.1.0 : données de recherche rangées dans le dossier (store.js) et leurs calculs
// (imaging/warp.js, imaging/cavity.js) : histologie en vocabulaire fermé, comorbidités développementales, statut du parcours,
// contacts dans la résection (liste ou cavité segmentée), région VEP figée par plot, transformation non linéaire vers MNI 2009b.
// Données synthétiques.
import fs from 'fs'; import vm from 'vm'; import assert from 'assert/strict';
globalThis.window = globalThis; globalThis.SV = globalThis.SV || {};
for (const f of ['src/core.js', 'src/imaging/warp.js', 'src/imaging/cavity.js', 'src/store.js', 'src/bids.js', 'src/research.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const S = SV.Store, W = SV.Warp, CV = SV.Cavity; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * 1.41; };

// ---------------------------------------------------------------- dossier neuf et ancien dossier
{
  const d = S.newDossier({ pseudo: 'RF' }), p = S.addProcedure(d, { type: 'resection', date: '2025-01-10' });
  ok(d.patient.dev.id === '' && d.pathway.status === '' && Array.isArray(p.histologyCodes) && p.resection.contacts.length === 0, 'valeurs par défaut (non renseigné ≠ non)');
  const raw = JSON.parse(JSON.stringify(d)); delete raw.patient.dev; delete raw.pathway; delete raw.procedures[0].histologyCodes; delete raw.procedures[0].resection;
  raw.procedures[0].histology = 'FCD IIb'; const dn = S.normalize(raw);
  ok(dn.patient.dev.asd === '' && dn.pathway.status === '' && dn.procedures[0].histologyCodes.length === 0 && dn.procedures[0].histology === 'FCD IIb', 'ancien dossier complété, texte libre gardé, aucun code inventé');
  const bad = JSON.parse(JSON.stringify(d)); bad.patient.dev = { id: 'beaucoup', asd: 'yes' }; bad.pathway = { status: 'operated', reason: 'noEz' }; bad.procedures[0].histologyCodes = ['fcd2b', 'xyz', 'fcd2b']; bad.procedures[0].resection = { contacts: [{ e: 'e1', k: '3', how: '?' }, { k: 2 }] };
  const db = S.normalize(bad);
  ok(db.patient.dev.id === '' && db.patient.dev.asd === 'yes' && db.pathway.reason === '' && db.procedures[0].histologyCodes.join() === 'fcd2b' && db.procedures[0].resection.contacts.length === 1 && db.procedures[0].resection.contacts[0].k === 3 && db.procedures[0].resection.contacts[0].how === 'manual', 'valeurs hors vocabulaire écartées');
}
// ---------------------------------------------------------------- histologie, comorbidités, parcours
{
  const d = S.newDossier({ pseudo: 'RF2' }), p = S.addProcedure(d, { date: '2025-01-10', histologyCodes: ['hs1', 'fcd3a'], histology: 'gliose CA4' });
  ok(S.histologyGroup('fcd3a') === 'fcd' && S.histologyGroup('hs1') === 'hs' && S.histologyText(p) === 'HS ILAE type 1 ; FCD IIIa (avec sclérose hippocampique) ; gliose CA4', 'histologie : groupes, double pathologie, texte libre à côté');
  ok(S.V.histology.flatMap(g => g[2]).length === new Set(S.V.histology.flatMap(g => g[2].map(x => x[0]))).size, 'codes histologiques uniques');
  ok(S.devText(d.patient) === null, 'comorbidités : rien de renseigné → null');
  d.patient.dev = Object.assign(S.newDev(), { id: 'moderate', asd: 'yes', spasms: 'no' });
  ok(S.devText(d.patient) === 'déficience intellectuelle moyenne, trouble du spectre de l’autisme' && S.devText(d.patient, true) === 'DI moyenne, TSA', 'comorbidités : « non » non cité, sévérité de la DI');
  ok(S.pathwaySuggest(d).status === 'operated' && /résection/.test(S.pathwaySuggest(d).why), 'parcours suggéré : opéré (procédure datée)');
  const d2 = S.newDossier({}), ex = S.addExploration(d2, { kind: 'seeg', start: '2025-02-01' }), m = S.addMeeting(d2, { date: '2025-03-01', kind: 'post_seeg' }); S.addDecision(d2, { meetingId: m.id, type: 'none' });
  ok(S.pathwaySuggest(d2).status === 'declined' && d2.pathway.status === '', 'parcours suggéré : récusé (décision « pas de chirurgie ») — jamais écrit seul');
  S.setPathway(d2, { status: 'declined', reason: 'multifocal', date: '2025-03-01' }); ok(d2.pathway.reason === 'multifocal' && d2.pathway.at, 'statut explicite avec motif');
  S.setPathway(d2, { status: 'lost' }); ok(d2.pathway.reason === '', 'motif seulement pour « récusé »');
  ok(S.pathwaySuggest(S.newDossier({})).status === '', 'dossier vide : pas de suggestion');
  void ex;
}
// ---------------------------------------------------------------- contacts dans la résection, régions figées
{
  const d = S.newDossier({}), ex = S.addExploration(d, { kind: 'seeg', start: '2025-02-01' });
  ex.electrodes.push({ id: 'eA', name: 'A’', real: { contacts: [[0, 0, 0], [3.5, 0, 0], [7, 0, 0]] } }, { id: 'eB', name: 'B', real: { contacts: [[0, 10, 0], [3.5, 10, 0]] } });
  const p = S.addProcedure(d, { date: '2025-06-01' });
  ok(S.resectionExploration(d, p) === ex, 'exploration de référence : dernière SEEG avec électrodes réelles');
  S.toggleResected(d, p, 'eB', 2); S.setResected(d, p, [{ e: 'eA', k: 1 }, { e: 'eA', k: 2 }, { e: 'eB', k: 2 }], 'cavity');
  ok(p.resection.contacts.length === 3 && p.resection.contacts.find(c => c.e === 'eB').how === 'manual', 'cavité : ajout à la main gardé, pas de doublon');
  S.setResected(d, p, [{ e: 'eA', k: 3 }], 'cavity'); ok(p.resection.contacts.map(c => c.e + c.k).sort().join() === 'eA3,eB2', 'nouvelle cavité : remplace seulement les contacts qu’elle avait déduits');
  d.anatomy = { date: '2025-02-10T10:00:00Z', toTemplate: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  ok(S.contactRegionStatus(d, ex.electrodes[0]) === 'missing', 'régions : manquantes avant étiquetage');
  S.stampContactRegions(d, ex.electrodes[0], [{ code: 12, name: 'Left-Hippocampus-anterior' }, { code: 12, name: 'Left-Hippocampus-anterior' }, { code: 200, name: 'white-matter' }]);
  const rc = S.resectedContacts(d, p);
  ok(S.contactRegionStatus(d, ex.electrodes[0]) === 'ok' && rc.find(c => c.name === "A'3").region.name === 'white-matter', 'régions figées à la validation, lues par la requête');
  d.anatomy = Object.assign({}, d.anatomy, { date: '2026-01-01T00:00:00Z' });
  ok(S.contactRegionStatus(d, ex.electrodes[0]) === 'stale' && S.contactRegion(ex.electrodes[0], 1).code === 12, 'anatomie recalculée : régions gardées, signalées');
  ex.electrodes[1].name = 'B'; ex.electrodes.splice(1, 1); ok(S.resectedContacts(d, p).length === 1, 'électrode disparue : contact ignoré, liste intacte');
}
// ---------------------------------------------------------------- transformation non linéaire vers MNI 2009b
{
  const tpl = {}, pat = {}, patA = {}, fwd = q => { const s = [0.85 * q[0] + 2, 0.82 * q[1] - 5, 0.8 * q[2] + 8]; return [s[0] + 6 * Math.sin(q[1] / 25), s[1] + 5 * Math.sin(q[2] / 22), s[2] + 4 * Math.cos(q[0] / 30)]; };
  for (let l = 1; l <= 100; l++) { const q = [70 * (2 * rnd() - 1), 90 * (2 * rnd() - 1), 60 * (2 * rnd() - 1)], w = 200 + 3000 * rnd(); tpl[l] = [...q, w]; pat[l] = [...fwd(q).map(v => v + gauss()), w]; patA[l] = [...[0.85 * q[0] + 2, 0.82 * q[1] - 5, 0.8 * q[2] + 8].map(v => v + gauss()), w]; }
  pat[7] = [pat[7][0] + 25, pat[7][1], pat[7][2], pat[7][3]];
  const R = W.estimate(pat, tpl);
  ok(R.method === 'tps' && R.loo.tps < 0.8 * R.loo.affine && R.rejectedLabels.includes('7') && R.minJac >= 0.2, `spline retenue (repères exclus : ${R.loo.tps} contre ${R.loo.affine} mm affine), aberrant écarté, sans repliement`);
  let eA = 0, eT = 0; const Ta = W.affineFit(Object.keys(pat).filter(l => l !== '7').map(l => pat[l].slice(0, 3)), Object.keys(pat).filter(l => l !== '7').map(l => tpl[l].slice(0, 3)), Object.keys(pat).filter(l => l !== '7').map(() => 1)).T;
  for (let k = 0; k < 200; k++) { const q = [60 * (2 * rnd() - 1), 80 * (2 * rnd() - 1), 50 * (2 * rnd() - 1)], p = fwd(q), a = W.applyAffine(Ta, p), t = W.applyChain(R.steps, p); eA += (a[0] - q[0]) ** 2 + (a[1] - q[1]) ** 2 + (a[2] - q[2]) ** 2; eT += (t[0] - q[0]) ** 2 + (t[1] - q[1]) ** 2 + (t[2] - q[2]) ** 2; }
  ok(Math.sqrt(eT / 200) < 0.6 * Math.sqrt(eA / 200), `points tests hors repères : ${Math.sqrt(eT / 200).toFixed(1)} mm contre ${Math.sqrt(eA / 200).toFixed(1)} mm (affine)`);
  ok(W.estimate(patA, tpl).method === 'affine', 'déformation purement affine : affine gardée');
  // énergie de flexion ≥ 0 pour c ⟂ P (noyau −r conditionnellement défini positif)
  { const P = Object.values(tpl).slice(0, 30).map(x => x.slice(0, 3)), T = W.tpsFit(P, P.map(p => [p[0] + 3 * Math.sin(p[1] / 20), p[1], p[2]]), P.map(() => 1), 1e-6); let E = 0; for (let i = 0; i < P.length; i++) for (let j = 0; j < P.length; j++) E += -Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]) * T.c[i][0] * T.c[j][0]; ok(E >= -1e-9, 'énergie de flexion positive'); }
  // dans le dossier : toMNI suit la transformation retenue
  const d = S.newDossier({}); d.anatomy = { date: 'x', toTemplate: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1] };
  ok(S.toMNI(d, [0, 0, 0]).join() === '1,2,3' && S.mniMethod(d) === 'affine', 'MNI : affine par défaut');
  d.anatomy.mni = { method: 'tps', steps: R.steps }; const q = S.toMNI(d, fwd([10, 20, 30]));
  ok(Math.hypot(q[0] - 10, q[1] - 20, q[2] - 30) < 3 && S.mniMethod(d) === 'tps', 'MNI : non linéaire quand elle est retenue');
  // chaîne patient → gabarit de l’âge → MNI 2009b
  const ch = [{ kind: 'affine', T: [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, { kind: 'affine', T: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1] }];
  ok(W.applyChain(ch, [1, 1, 1]).join() === '12,2,2', 'chaîne de transformations composée dans l’ordre');
}
// ---------------------------------------------------------------- cavité de résection (différence pré / post, synthétique)
{
  const nn = 80, N = nn ** 3, lab = new Uint8Array(N), img = new Float32Array(N), truth = new Uint8Array(N), c0 = [40, 40, 40], Rr = [30, 34, 28], cav = [26, 44, 46];
  for (let k = 0; k < nn; k++) for (let j = 0; j < nn; j++) for (let i = 0; i < nn; i++) {
    const q = i + nn * j + nn * nn * k, e = Math.hypot((i - c0[0]) / Rr[0], (j - c0[1]) / Rr[1], (k - c0[2]) / Rr[2]); let L = 0, v = 5;
    if (e < 1) { const depth = (1 - e) * 30; if (depth < 1.2) { L = 201; v = 20; } else if (depth < 4.5) { L = i < 40 ? 10 : 90; v = 65; } else { L = 200; v = 100; } if (Math.hypot(i - 40, j - 40, k - 40) < 4) { L = 201; v = 20; } }
    lab[q] = L; if (L && L !== 201 && Math.hypot(i - cav[0], j - cav[1], k - cav[2]) < 10) { v = 20; truth[q] = 1; }
    if ((L === 10 || L === 90) && rnd() < 0.01) v = 20; img[q] = v + 4 * gauss();
  }
  // seconde « cavité » à droite (plus petite) : la composante du côté opéré est proposée
  for (let k = 0; k < nn; k++) for (let j = 0; j < nn; j++) for (let i = 0; i < nn; i++) { const q = i + nn * j + nn * nn * k; if (lab[q] && lab[q] !== 201 && Math.hypot(i - 58, j - 30, k - 36) < 6) img[q] = 20 + 4 * gauss(); }
  const hemi = new Uint8Array(256); hemi[10] = 1; hemi[90] = 2; const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const R = CV.segment({ img: { dims: [nn, nn, nn], affine: I4, data: img }, imgT: null, lab: { dims: [nn, nn, nn], affine: I4, data: lab }, thr: 0.3, minMl: 0.5, side: 'L', hemi });
  ok(R.comps.length === 2 && R.comps.find(c => c.id === R.chosen[0]).hemi === 'L', `composantes : ${R.comps.map(c => c.ml + ' ml ' + c.hemi).join(', ')} ; côté opéré proposé`);
  const Sel = CV.select(R, R.chosen), [nx, ny, nz] = R.dims, off = [R.affine[3], R.affine[7], R.affine[11]]; let inter = 0, a = 0, b = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const m = Sel.mask[i + nx * j + nx * ny * k], t = truth[(i + off[0]) + nn * (j + off[1]) + nn * nn * (k + off[2])]; inter += m && t; a += m; } for (let q = 0; q < N; q++) b += truth[q];
  ok(2 * inter / (a + b) > 0.9, `Dice ${(2 * inter / (a + b)).toFixed(3)} (sphère de 10 mm, bruit, liserés isolés)`);
  ok(Sel.regions[0].code === 200 && Sel.regions.every(r => r.frac > 0 && r.frac < 1), 'fractions emportées par région');
  const both = CV.select(R, R.comps.map(c => c.id)); ok(both.volumeMl > Sel.volumeMl, 'garder une composante de plus agrandit la cavité (sans recalcul)');
  const vol = { dims: R.dims, affine: R.affine, data: Sel.mask }; ok(CV.contactsIn([cav, [cav[0] + 9, cav[1], cav[2]], [cav[0] + 13, cav[1], cav[2]], [60, 40, 40]], vol, 1.5).join() === 'true,true,false,false', 'contacts dans la cavité (tolérance 1,5 mm)');
  assert.throws(() => CV.segment({ img: { dims: [nn, nn, nn], affine: I4, data: img.map(v => 120 - v) }, lab: { dims: [nn, nn, nn], affine: I4, data: lab } }), /contraste inattendu/); n++;
  // v2.4.0 : étiquette « LCR » prise en volume partiel avec le cortex (intensité de cortex) : la référence du LCR vient de
  // l'image (voxels nettement plus sombres que le cortex) — avant, le cortex entier passait sous le seuil
  const imgPV = img.map((v, q) => lab[q] === 201 ? 62 + 4 * gauss() : v);
  const R2 = CV.segment({ img: { dims: [nn, nn, nn], affine: I4, data: imgPV }, imgT: null, lab: { dims: [nn, nn, nn], affine: I4, data: lab }, thr: 0.3, minMl: 0.5, side: 'L', hemi });
  const S2 = CV.select(R2, R2.chosen); ok(Math.abs(S2.volumeMl - Sel.volumeMl) < 0.4 * Sel.volumeMl && R2.norm.csfFrom === 'image' && R2.norm.gmNorm > 0.4 && R2.norm.gmNorm < 0.7, `LCR de la parcellation en volume partiel : cavité ${S2.volumeMl} ml (attendu ≈ ${Sel.volumeMl}), cortex à ${R2.norm.gmNorm}`);
  const dd = CV.distances([cav, [cav[0] + 12, cav[1], cav[2]], [cav[0] + 15, cav[1], cav[2]], [60, 40, 40]], vol, 8);
  ok(dd[0] === 0 && dd[1] > 0 && dd[1] <= 3 && dd[2] > 3 && dd[2] <= 8 && dd[3] === Infinity, `distances à la cavité : ${dd.map(x => x === Infinity ? '∞' : x.toFixed(1)).join(', ')} mm`);
}
// ---------------------------------------------------------------- export de recherche : champs lus tels qu'établis
{
  const d = S.newDossier({ pseudo: 'EXP' }); d.subject = { site: 'HFAR', n: 7, label: 'HFAR0007' }; d.patient.sex = 'F'; d.patient.dev = Object.assign(S.newDev(), { id: 'mild', spasms: 'yes', asd: 'no' });
  const ex = S.addExploration(d, { kind: 'seeg', start: '2025-02-01' }); ex.electrodes.push({ id: 'eA', name: 'A’', hemi: 'L', real: { contacts: [[-30, 10, 5], [-33.5, 10, 5]] } });
  d.anatomy = { status: 'done', date: '2025-02-10T10:00:00Z', toTemplate: [1, 0, 0, 10, 0, 1, 0, -5, 0, 0, 1, 2, 0, 0, 0, 1] };
  S.stampContactRegions(d, ex.electrodes[0], [{ code: 12, name: 'Left-Hippocampus-anterior' }, { code: 200, name: 'white-matter' }]);
  const p = S.addProcedure(d, { type: 'resection', side: 'L', date: '2025-09-01', histologyCodes: ['hs1', 'fcd3a'] }); S.setResected(d, p, [{ e: 'eA', k: 1 }], 'manual');
  S.setPathway(d, { status: 'operated', date: '2025-09-01' });
  const B = SV.Research.buildSubject(d, { shift: -10 }), F = new Map(B.files.map(f => [f.path, f.text]));
  const el = F.get('sub-HFAR0007/ses-seeg1/ieeg/sub-HFAR0007_ses-seeg1_space-ScanRAS_electrodes.tsv');
  ok(/\nA'1\t-30\t10\t5\t5\.03\tA'\tL\tdepth\tn\/a\tLeft-Hippocampus-anterior\ttrue\n/.test(el) && /\nA'2\t[^\n]*\twhite-matter\tfalse\n/.test(el), 'electrodes.tsv : région figée, colonne resected');
  ok(!!F.get('sub-HFAR0007/ses-seeg1/ieeg/sub-HFAR0007_ses-seeg1_electrodes.json'), 'colonnes décrites (electrodes.json)');
  const cl = JSON.parse(F.get('derivatives/episcope/sub-HFAR0007/sub-HFAR0007_clinical.json'));
  ok(cl.procedures[0].histology_codes.join() === 'hs1,fcd3a' && cl.procedures[0].resected_contacts.join() === "A'1" && cl.developmental_comorbidities.id === 'mild' && cl.developmental_comorbidities.language === null && cl.pathway.status === 'operated', 'clinical.json : histologie, contacts réséqués, comorbidités (null = non renseigné), parcours');
  ok(B.participant.pathway_status === 'operated' && !F.has('derivatives/episcope/sub-HFAR0007/sub-HFAR0007_from-T1w_to-MNI152NLin2009bAsym_mode-points_xfm.json'), 'participants : statut ; affine seule : pas de fichier de points');
  // MNI non linéaire retenue : coordonnées et description suivent
  d.anatomy.mni = { method: 'tps', n: 90, lambda: 1, loo: { affine: 4.1, tps: 2.3 }, steps: [W.tpsFit([[0, 0, 0], [50, 0, 0], [0, 50, 0], [0, 0, 50], [40, 40, 40]], [[1, 1, 1], [52, 0, 0], [0, 51, 0], [0, 0, 49], [41, 42, 38]], [1, 1, 1, 1, 1], 0)] };
  const B2 = SV.Research.buildSubject(d, { shift: -10 }), F2 = new Map(B2.files.map(f => [f.path, f.text])), q = S.toMNI(d, [-30, 10, 5]);
  const elM = F2.get('sub-HFAR0007/ses-seeg1/ieeg/sub-HFAR0007_ses-seeg1_space-MNI152NLin2009bAsym_electrodes.tsv'), cs = JSON.parse(F2.get('sub-HFAR0007/ses-seeg1/ieeg/sub-HFAR0007_ses-seeg1_space-MNI152NLin2009bAsym_coordsystem.json'));
  ok(elM.includes(`A'1\t${Math.round(q[0] * 100) / 100}\t${Math.round(q[1] * 100) / 100}\t`) && /non linéaire/.test(cs.iEEGCoordinateProcessingDescription) && F2.has('derivatives/episcope/sub-HFAR0007/sub-HFAR0007_from-T1w_to-MNI152NLin2009bAsym_mode-points_xfm.json'), 'MNI 2009b non linéaire : coordonnées, description, transformation exportée');
}
console.log(`${n} vérifications — données de recherche du dossier`);
