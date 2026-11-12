// Correction de l'effet de volume partiel (imaging/pvc.js) sur un fantôme : cortex (coquille : 4 à gauche, 3 à droite),
// substance blanche (1), LCR central (0,2), fond 0 ; « TEP » = fantôme flouté (FWHM 6 mm). Les valeurs régionales
// corrigées doivent retrouver le fantôme : GTM exact, Müller-Gärtner à 2 % (SG), RBV et Yang itératif à 7–8 % (SG, grille
// de 2 mm pour un cortex de 4 mm), Richardson-Lucy : valeurs de SG relevées.
//   node tools/tests/test_pvc.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
globalThis.SV = {}; for (const f of ['stats.js', 'imaging/volops.js', 'imaging/pvc.js']) new Function(fs.readFileSync(path.join(SRC, f), 'utf8'))();
const SV = globalThis.SV, N = 96, dims = [N, N, N], A = [1, 0, 0, -N / 2, 0, 1, 0, -N / 2, 0, 0, 1, -N / 2, 0, 0, 0, 1];
const lab = new Uint8Array(N * N * N), truth = new Float32Array(N * N * N);
for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = i - N / 2, y = j - N / 2, z = k - N / 2, r = Math.hypot(x, y * 1.1, z * 0.9), q = i + N * j + N * N * k;
  if (r < 8) { lab[q] = 201; truth[q] = 0.2; } else if (r < 28) { lab[q] = 200; truth[q] = 1; } else if (r < 32) { lab[q] = x < 0 ? 10 : 20; truth[q] = x < 0 ? 4 : 3; }
}
const pet = SV.VolOps.gaussian(truth, dims, 6 / 2.3548, { border: 'zero' });
const want = { 10: 4, 20: 3, 200: 1, 201: 0.2 }, tol = { gtm: 0.01, mg: 0.02, rbv: 0.07, iy: 0.08 };
let fails = 0;
for (const m of ['gtm', 'rbv', 'iy', 'mg', 'rl']) {
  const r = SV.PVC.run({ pet: { dims, affine: A, data: pet, slope: 1, inter: 0 }, petT: null, lab: { dims, affine: A, pixdim: [1, 1, 1], data: lab }, method: m, fwhm: 6, res: 2, regions: 'vep', iters: 10 });
  const errs = Object.entries(want).map(([c, v]) => { const t = r.table.find(x => x.code === +c); return Math.abs(t.pvc - v) / v; }), worst = Math.max(...errs);
  const gm = r.table.filter(t => t.code === 10 || t.code === 20).map(t => t.pvc - t.obs);
  const gmErr = Math.max(errs[0], errs[1]), ok = m === 'rl' ? gm.every(x => x > 0.5) : m === 'gtm' ? worst <= tol.gtm : gmErr <= tol[m] && errs[2] <= 0.06;   // substance grise (cible), substance blanche ; LCR (valeur faible) non jugé
  console.log((ok ? 'ok   ' : 'ÉCHEC ') + `${m} : écart SG ${(100 * Math.max(errs[0], errs[1])).toFixed(1)} % · ${r.dims.join('×')} · ${r.ms} ms · ` + r.table.map(t => `${t.code}: ${t.obs.toFixed(2)} → ${t.pvc.toFixed(2)}`).join(' | '));
  if (!ok) fails++;
}
// asymétrie gauche / droite (v4.18) : régions 10 (G, 4) et 20 (D, 3) du fantôme, plus des paires symétriques de contrôle
{
  const lab2 = lab.slice(), img = new Float32Array(N * N * N); let r0 = 7;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const q = i + N * j + N * N * k, x = i - N / 2, y = j - N / 2, z = k - N / 2, rr = Math.hypot(x, y * 1.1, z * 0.9);
    if (rr >= 28 && rr < 32) { const sect = Math.floor((Math.atan2(z, y) + Math.PI) / (2 * Math.PI) * 6); lab2[q] = (x < 0 ? 30 : 40) + sect; }   // 6 paires symétriques
    r0 = (r0 * 1103515245 + 12345) & 0x7fffffff; const nz = (r0 / 0x7fffffff - 0.5) * 0.4; img[q] = (lab2[q] >= 30 ? (lab2[q] === 30 ? 3 : 4) : lab2[q] === 200 ? 1 : 0.2) + nz; }
  const st = SV.PVC.regionStats({ img: { dims, affine: A, data: img, slope: 1, inter: 0 }, imgT: null, lab: { dims, affine: A, pixdim: [1, 1, 1], data: lab2 }, res: 2 });
  const pairs = [0, 1, 2, 3, 4, 5].map(s0 => [30 + s0, 40 + s0, 'secteur ' + s0]);
  const rz = SV.PVC.asymTest(st, pairs, { stat: 'z', p: 0.05, corr: 'fdr', minAI: 5 }), rt = SV.PVC.asymTest(st, pairs, { stat: 't', p: 0.05, corr: 'bonf', minAI: 5, fwhm: 6, res: st.grid.res }), ra = SV.PVC.asymTest(st, pairs, { stat: 'abs', abs: 10 });
  const z0 = rz.find(r => r.cL === 30), sigZ = rz.filter(r => r.sig).map(r => r.cL), sigT = rt.filter(r => r.sig).map(r => r.cL), sigA = ra.filter(r => r.sig).map(r => r.cL);
  const map = SV.PVC.asymPaint(st.grid, rt, 'both'), hypo = SV.PVC.asymPaint(st.grid, rt, 'hypo'), at = c => { for (let q = 0; q < st.grid.code.length; q++) if (st.grid.code[q] === c) return [map[q], hypo[q]]; return null; };
  const okA = Math.abs(z0.ai - 200 * (3 - 4) / 7) < 1.5 && sigZ.join() === '30' && sigT.join() === '30' && sigA.join() === '30' && at(30)[0] < -20 && at(40)[0] > 20 && at(40)[1] === 0 && at(31)[0] === 0;
  console.log((okA ? 'ok   ' : 'ÉCHEC ') + `asymétrie : AI ${z0.ai.toFixed(1)} % (−28,6 attendu), z ${z0.z.toFixed(1)}, t ${rt.find(r => r.cL === 30).t.toFixed(1)} ; paires retenues z [${sigZ}] t [${sigT}] seuil [${sigA}] ; carte G ${at(30)[0].toFixed(1)} / D ${at(40)[0].toFixed(1)} (hypo seules : D ${at(40)[1]})`);
  if (!okA) fails++;
}
console.log(fails ? `${fails} échec(s)` : 'OK pvc'); process.exit(fails ? 1 : 0);
