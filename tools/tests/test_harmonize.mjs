// node tools/tests/test_harmonize.mjs — depuis la racine du dépôt (Node ≥ 22)
// Harmonisation des intensités avant MeshNet (v4.6, SV.MeshNet.harmonize / segment({harmonize})) sur l'image d'exemple
// de brainchop (t1_c, déjà conformée) — aucune donnée patient (le cas réel qui a motivé la correction : T1 sombre,
// biais de champ −19 / +17 %, texture fine ; 16,7 % du tissu sans étiquette → 3,3 %, vérifié en local seulement) :
//   1. image dégradée : assombrie (× 0,62) et biais de champ lent connu (plus sombre en avant et en haut) ;
//   2. le champ estimé suit le champ appliqué (corrélation sur la substance blanche), la substance blanche est ramenée
//      à la cible, son hétérogénéité diminue ; la segmentation n'est pas moins bonne qu'avec brainchop seul ;
//   3. second passage lissé : déclenché au-delà du seuil (ici forcé à 0), gardé seulement s'il étiquette davantage ;
//   4. l'image d'origine harmonisée reste proche de la référence brainchop (pas de dégradation d'une image « normale »).
import fs from 'fs'; import vm from 'vm'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const T1C = process.argv[2] || '/home/claude/neuroneural/brainchop/v3/data/t1_c.nii.gz';
globalThis.window = undefined;
const loadSrc = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
loadSrc('src/nifti.js'); loadSrc('src/work.js'); loadSrc('src/imaging/meshnet.js'); loadSrc('src/imaging/anat.js');
const TPL = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/template_anat.json'), 'utf8'));
const M = SV.MeshNet, spec = n => M.loadModel(fs.readFileSync(path.join(ROOT, 'assets/models', n + '.json'), 'utf8'));
const m104 = spec('model21_104class'), m5 = spec('model5_gw_ae');
let nOk = 0, nFail = 0; const ok = (c, msg) => { console.log((c ? '  ok    ' : '  ÉCHEC  ') + msg); c ? nOk++ : nFail++; };
const t1 = await SV.Nifti.read(fs.readFileSync(T1C)); t1.data = Uint8Array.from(t1.data); t1.slope = 1; t1.inter = 0;
ok(M.isConformed(t1), 't1_c conformé (256³ uint8 LIA)');
// image dégradée (k → antérieur, j → inférieur dans la grille conformée LIA) ; B = biais appliqué
const deg = new Uint8Array(t1.data.length), Bf = new Float32Array(t1.data.length);
for (let k = 0, o = 0; k < 256; k++) for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++, o++) {
  const v = t1.data[o]; if (!v) continue;
  const b = 1 + 0.1 - 0.2 * (k / 255) - 0.2 * (1 - j / 255); Bf[o] = b;   // −30 % en avant-haut → +10 % en arrière-bas
  const y = v * 0.62 * b; deg[o] = y > 255 ? 255 : y;
}
const vol = data => ({ dims: [256, 256, 256], pixdim: [1, 1, 1], data, affine: t1.affine, slope: 1, inter: 0 });
const seg = async (data, h) => { const t0 = performance.now(); const r = await M.segment(vol(data), m104, { premodel: m5, workers: 0, harmonize: h, keepImage: true }); r.s = ((performance.now() - t0) / 1000).toFixed(0); return r; };
const names = m104.labels;
const dice = (a, b) => { const A = new Float64Array(256), B = new Float64Array(256), AB = new Float64Array(256); for (let i = 0; i < a.length; i++) { A[a[i]]++; B[b[i]]++; if (a[i] === b[i]) AB[a[i]]++; } let s = 0, n = 0; for (let l = 1; l < names.length; l++) if (A[l] + B[l] > 500) { s += 2 * AB[l] / (A[l] + B[l]); n++; } return s / n; };
console.log('\n=== segmentations (fil courant, ~1 à 2 min chacune)');
const ref = await seg(t1.data, false); console.log(`    référence (t1_c, brainchop) : ${ref.s} s`);
const raw = await seg(deg, false); console.log(`    dégradée sans harmonisation : ${raw.s} s, sans étiquette ${(100 * raw.coverage.unlabeled).toFixed(1)} %`);
const har = await seg(deg, true); console.log(`    dégradée harmonisée : ${har.s} s, ${JSON.stringify(har.harmonize)}, sans étiquette ${(100 * har.coverage.unlabeled).toFixed(1)} %`);
const H = har.harmonize;
// champ estimé = dégradée / corrigée (à l'échelle près) : corrélation (log) avec le biais appliqué, sur la substance blanche de la référence
let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
for (let o = 0; o < deg.length; o++) { const l = ref.labels[o]; if ((l !== 85 && l !== 86) || !deg[o] || !har.image[o] || har.image[o] >= 255) continue; const x = Math.log(Bf[o]), y = Math.log(deg[o] / har.image[o]); sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++; }
const rho = (sxy / n - sx / n * sy / n) / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
ok(H && !H.skipped && H.field[0] < -0.1 && H.field[1] > 0.05, `biais détecté (${H.field.map(x => (100 * x).toFixed(0) + ' %').join(' → ')})`);
ok(rho > 0.8, `champ estimé ≈ champ appliqué (corrélation ${rho.toFixed(3)} sur ${n} voxels de substance blanche)`);
ok(H.wmBefore < 125 && Math.abs(H.wmAfter - H.target) <= 6, `substance blanche ${H.wmBefore} → ${H.wmAfter} (cible ${H.target})`);
ok(H.cvAfter < H.cvBefore * 0.8, `hétérogénéité de la substance blanche réduite (${H.cvBefore} → ${H.cvAfter})`);
const dRaw = dice(ref.labels, raw.labels), dHar = dice(ref.labels, har.labels);
ok(dHar >= dRaw - 0.01, `segmentation de l'image dégradée : pas moins bonne avec l'harmonisation (Dice moyen vs référence ${dRaw.toFixed(3)} → ${dHar.toFixed(3)})`);
// second passage : seuil forcé à 0 → toujours tenté ; gardé seulement s'il étiquette davantage de tissu (même masque)
const rt = await M.segment(vol(deg), m104, { premodel: m5, workers: 0, harmonize: { retry: 0 } }), R = rt.harmonize.retry;
console.log(`    second passage forcé : ${JSON.stringify(R)}`);
const keepExp = !!R && R.unlabeled[1] < R.unlabeled[0] - 0.005;
ok(!!R && (R.kept === 'lissée') === keepExp && Math.abs(rt.coverage.unlabeled - (keepExp ? R.unlabeled[1] : R.unlabeled[0])) < 1e-9, `second passage lissé : tenté au-delà du seuil, gardé seulement s'il étiquette davantage (${R ? R.kept : '—'})`);
ok(!har.harmonize.retry, 'seuil par défaut (5 %) : pas de second passage sur cette image');
const same = await seg(t1.data, true); const dSame = dice(ref.labels, same.labels);
console.log(`    t1_c harmonisée : ${same.s} s, ${JSON.stringify(same.harmonize)}`);
ok(dSame > 0.95 && !same.harmonize.retry, `image « normale » harmonisée proche de la référence brainchop (Dice ${dSame.toFixed(3)}, sans second passage)`);
// v4.8 : cascade contrôlée (brainchop → intensités corrigées → image lissée bornée au cerveau)
const quality = lab => SV.Anat.segQuality(lab, [256, 256, 256], t1.affine, TPL);
const cA = await M.segment(vol(t1.data), m104, { premodel: m5, workers: 0, cascade: { quality } });
console.log(`    cascade sur t1_c : ${JSON.stringify(cA.cascade.steps.map(x => [x.name, x.ok, x.rms, x.unlabeled]))}`);
let same0 = 0; for (let i = 0; i < ref.labels.length; i++) if (ref.labels[i] !== cA.labels[i]) same0++;
ok(cA.cascade.chosen === 'brainchop' && cA.cascade.steps.length === 1 && same0 === 0 && !cA.harmonize, `cascade, image correcte : brainchop seul, résultat identique (${same0} voxels différents), contrôle ${cA.quality.rms} mm`);
const q0 = quality(ref.labels); ok(q0.rms < 6.5 && q0.scales.every(x => x > 0.8 && x < 1.3) && q0.extent < 158 && q0.volume > 8.5e5 && q0.volume < 1.6e6, `contrôle de qualité de la référence : ${q0.rms} mm, échelles ${q0.scales.join(' / ')}, ${q0.extent} mm, ${(q0.volume / 1000).toFixed(0)} cm³`);
const cF = await M.segment(vol(deg), m104, { premodel: m5, workers: 0, cascade: { quality, limits: { unlabeled: 0 } } }), St = cF.cascade.steps;
console.log(`    cascade forcée (seuil 0 %) : ${JSON.stringify(St.map(x => [x.name, x.ok, x.score]))} → ${cF.cascade.chosen}`);
const best = St.slice().sort((a, b) => a.score - b.score)[0];
ok(St.map(x => x.name).join() === 'brainchop,intensités corrigées,image lissée' && cF.cascade.chosen === best.name, `cascade : trois tentatives quand le contrôle échoue, la meilleure gardée (${cF.cascade.chosen})`);
const E = M.envelope(ref.labels, 7, 3); let inE = 0, nL = 0; for (let i = 0; i < E.length; i++) if (ref.labels[i]) { nL++; if (E[i]) inE++; }
ok(inE === nL, 'enveloppe : contient toute la segmentation');
console.log(`\n${nOk} ok, ${nFail} échec(s)`); process.exit(nFail ? 1 : 0);
