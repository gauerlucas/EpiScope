// node tools/tests/test_plan_traj.mjs — depuis la racine du dépôt
// Moteur des trajectoires de planification (v4.9, SV.PlanTraj) sur des volumes synthétiques (aucune donnée patient) :
//   enveloppe et entrée collée à la surface, choix du modèle, contrôles de faisabilité (incidence, base du crâne, face
//   médiale, ligne médiane, fond de scissure), recherche de la trajectoire la plus courte.
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
globalThis.window = globalThis;
globalThis.SV = { app: { buildElectrodeFor() { return null; } } };
const loadSrc = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
loadSrc('src/nifti.js'); loadSrc('src/electrodes.js'); loadSrc('src/plan_traj.js');
const PT = SV.PlanTraj, M4 = SV.Mat4;
let nOk = 0, nFail = 0; const ok = (c, msg) => { console.log((c ? '  ok    ' : '  ÉCHEC  ') + msg); c ? nOk++ : nFail++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

// --- modèles
ok(PT.pickModel(43.6) === 12 && PT.pickModel(25.2) === 8 && PT.pickModel(10) === 5 && PT.pickModel(120) === 18, 'modèle : le plus grand dont les plots tiennent dans le trajet (43,6 → 12 ; 25,2 → 8 ; 10 → 5 ; 120 → 18)');
ok(PT.modelN('DIXI D08-15AM') === 15 && PT.modelN('Alcis 2069-EPC-08') === 8 && PT.modelId(10, 'DIXI') === 'DIXI D08-10AM', 'modèle : identifiants DIXI / Alcis');

// --- « cerveau » synthétique : ellipsoïde (65 × 62 × 50 mm) coupé par une scissure interhémisphérique de 6 mm, grille de 2 mm
const N = 96, vx = 2, c0 = N / 2, G2W = [vx, 0, 0, -c0 * vx, 0, vx, 0, -c0 * vx, 0, 0, vx, -c0 * vx, 0, 0, 0, 1];
const inHemi = (x, y, z, s) => (x / 65) ** 2 + (y / 62) ** 2 + (z / 50) ** 2 <= 1 && s * x > 3;
const isB = (i, j, k) => { const x = (i - c0) * vx, y = (j - c0) * vx, z = (k - c0) * vx; return inHemi(x, y, z, 1) || inHemi(x, y, z, -1); };
let t0 = performance.now(); const H = PT.makeHull([N, N, N], isB, G2W, { close: 3, skull: true }); const ms = performance.now() - t0;
console.log(`    enveloppe ${N}³ : ${ms.toFixed(0)} ms`);
ok(H.inside([30, 0, 0]) && !H.inside([0, 0, 70]) && H.brain([30, 0, 0]), 'enveloppe : dedans / dehors');
ok(H.inside([0, 0, 20]), 'enveloppe : la scissure interhémisphérique (6 mm) est pontée');
const ex = PT.exitPoint(H, [33, 0, 0], [1, 0, 0]);
ok(ex && near(ex.entry[0], 65, 2.5) && near(ex.len, 32, 2.5), `entrée collée à la surface (x = ${ex && ex.entry[0].toFixed(1)} mm, trajet ${ex && ex.len.toFixed(1)} mm)`);
const n0 = H.normal(ex.entry); ok(n0[0] > 0.95, `normale sortante (${n0.map(v => v.toFixed(2)).join(', ')})`);
ok(near(H.field(ex.entry), 0.5, 0.05), 'entrée sur l’isovaleur 0,5');
const sk = H.skull.exit([33, 0, 0], [1, 0, 0]); ok(sk.t > 28 && sk.t < 36 && sk.normal[0] > 0.9, `« crâne » (enveloppe convexe) : sortie à ${sk.t.toFixed(1)} mm, normale latérale`);

const ctx = { space: 'template', hull: H, toView: p => p, fromView: p => p, toTpl: () => [0, 0, 30], labelAt: () => 0, latX: p => p[0], side: p => Math.abs(p[0]) < 4 ? '' : p[0] < 0 ? 'L' : 'R', dirView: (p, d) => d, isCb: null };
const sev = (r, re) => Math.max(0, ...r.issues.filter(i => !re || re.test(i.text)).map(i => i.sev));
const unit = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
const e1 = PT.evaluate(ctx, [33, 0, 0], [1, 0, 0], null, 'R', []);
ok(sev(e1) <= 1 && e1.incidence < 10, `latérale orthogonale : faisable (incidence ${e1.incidence}°, ${JSON.stringify(e1.issues.map(i => i.text))})`);
const d70 = unit([Math.cos(70 * Math.PI / 180), Math.sin(70 * Math.PI / 180), 0]);
const e2 = PT.evaluate(ctx, [45, -20, 0], d70, null, 'R', []);
ok(sev(e2, /incidence/) === 3 || sev(e2, /incidence/) === 2, `trajectoire rasante : signalée (incidence ${e2.incidence}°)`);
const e3 = PT.evaluate(ctx, [33, 0, -10], [0, 0, -1], null, 'R', []);
ok(sev(e3, /inférieure|base/) === 3, `sortie vers le bas : base du crâne (${JSON.stringify(e3.issues.map(i => i.text))})`);
const e4 = PT.evaluate(ctx, [-33, 0, 0], [1, 0, 0], null, 'L', []);
ok(sev(e4) === 3 && e4.issues.some(i => /retraverse|ligne médiane|autre côté|médiale/.test(i.text)), `vers l’autre hémisphère : irréalisable (${JSON.stringify(e4.issues.map(i => i.text))})`);
const e5 = PT.evaluate(ctx, [7, 0, 20], [0, 0, 1], null, 'R', []);
ok(sev(e5, /ligne médiane|sinus/) >= 2, `entrée près de la ligne médiane (vertex) : sinus sagittal (${JSON.stringify(e5.issues.map(i => i.text))})`);
const e6 = PT.evaluate(ctx, [33, 0, 0], [1, 0, 0], null, 'L', []);
ok(e6.issues.some(i => i.sev === 3 && /autre côté/.test(i.text)), 'électrode gauche entrant à droite : irréalisable');
const e7 = PT.evaluate(ctx, [80, 0, 0], [1, 0, 0], null, 'R', []);
ok(e7.issues.some(i => i.sev === 3 && /pointe hors/.test(i.text)), 'pointe hors du cerveau : irréalisable');

// --- « citerne » : creux profond (25 mm) ouvert vers l'avant dans l'hémisphère droit ; une entrée au fond est refusée
const isB2 = (i, j, k) => { const x = (i - c0) * vx, y = (j - c0) * vx, z = (k - c0) * vx; if (x > 15 && x < 45 && y > 35 && Math.abs(z) < 12) return false; return isB(i, j, k); };
const H2 = PT.makeHull([N, N, N], isB2, G2W, { close: 3, skull: true }), ctx2 = Object.assign({}, ctx, { hull: H2 });
const e8 = PT.evaluate(ctx2, [30, 20, 0], [0, 1, 0], null, 'R', []);
ok(e8.issues.some(i => i.sev === 3 && /fond d’une scissure|citerne/.test(i.text)), `entrée au fond d’un creux (citerne) : irréalisable (${JSON.stringify(e8.issues.map(i => i.text))})`);

// --- recherche : cible profonde de l'hémisphère droit → trajectoire latérale la plus courte
t0 = performance.now(); const best = PT.searchTrajectory(ctx, [20, 10, 5], 'R', []); const ms2 = performance.now() - t0;
const lat = PT.exitPoint(H, [20, 10, 5], [1, 0, 0]);
ok(best && best.entry[0] > 4 && best.incidence <= 40 && best.len <= lat.len + 0.5, `cible profonde : trajectoire faisable la plus courte (${best && best.len.toFixed(1)} mm contre ${lat.len.toFixed(1)} mm en latéral pur, incidence ${best && best.incidence}°, ${ms2.toFixed(0)} ms)`);
const other = { tip: [20, 10, 5], entry: best.entry, dir: best.dir };
const best2 = PT.searchTrajectory(ctx, [20, 14, 9], 'R', [other]);
ok(!best2 || SV.Electrodes.segDist([20, 14, 9], best2.entry, other.tip, other.entry) >= 5.9, 'recherche : à 6 mm au moins des électrodes déjà posées');
ok(!PT.searchTrajectory(ctx, [0, 0, 90], 'R', []), 'cible hors du cerveau : pas de trajectoire');

console.log(`\n${nOk} ok, ${nFail} échec(s)`); process.exit(nFail ? 1 : 0);
