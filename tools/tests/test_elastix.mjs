// node tools/tests/test_elastix.mjs — v3.5.0 : recalage fin par elastix embarqué (src/imaging/elastix_wasm.js, assets/elastix.json)
// et relecture de ses transformations (src/imaging/elastix.js), sur données synthétiques :
//   1. conversion NIfTI (RAS) ↔ image itk-wasm (LPS), affine oblique ;
//   2. T1 du gabarit (3 mm) déformé par une transformation connue (affine + déformation lisse) : elastix (affine puis B-spline)
//      la retrouve ; notre application des cartes (ordre de composition, B-spline cubique, LPS → RAS) reproduit l'image
//      rééchantillonnée par elastix ; erreur par rapport à la vérité < 1 mm ;
//   3. forme compacte (fichier dérivé) identique ; inverse par point fixe ; déterminant jacobien positif.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import assert from 'assert'; import { pathToFileURL } from 'url'; import { createRequire } from 'module';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
globalThis.window = undefined; globalThis.SV = {}; globalThis.require = createRequire(import.meta.url);
for (const f of ['src/nifti.js', 'src/imaging/elastix_wasm.js', 'src/imaging/elastix.js']) await import(pathToFileURL(path.join(ROOT, f)).href);
const X = SV.Elastix; let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', m); };
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 1. RAS ↔ LPS
{ const th = 0.3, A = [Math.cos(th), -Math.sin(th), 0, -80, Math.sin(th), Math.cos(th), 0, -100, 0, 0, 1.5, -60, 0, 0, 0, 1];
  const vol = { dims: [4, 5, 6], affine: A, data: Float32Array.from({ length: 120 }, (_, i) => i), slope: 2, inter: 1 }, I = X.itkImage(vol), V = X.fromItk(I);
  // point de l'index (1,2,3) : RAS par l'affine, LPS par origine + direction·pas
  const ras = [A[0] + 2 * A[1] + 3 * A[2] + A[3], A[4] + 2 * A[5] + 3 * A[6] + A[7], A[8] + 2 * A[9] + 3 * A[10] + A[11]];
  const lps = [0, 1, 2].map(r => I.origin[r] + I.direction[3 * r] * I.spacing[0] * 1 + I.direction[3 * r + 1] * I.spacing[1] * 2 + I.direction[3 * r + 2] * I.spacing[2] * 3);
  ok(d3([-ras[0], -ras[1], ras[2]], lps) < 1e-9 && Math.abs(I.data[7] - 15) < 1e-6 && Array.from(V.affine).every((v, i) => Math.abs(v - A[i]) < 1e-9), 'NIfTI RAS ↔ itk-wasm LPS (affine oblique, pente / ordonnée)'); }

// 2. recalage synthétique
const tj = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/template_t1.json'), 'utf8')), T1 = await SV.Nifti.read(zlib.gunzipSync(Buffer.from(tj.t1, 'base64')));
const ds = (v, f) => { const [nx, ny, nz] = v.dims, mx = Math.floor(nx / f), my = Math.floor(ny / f), mz = Math.floor(nz / f), o = new Float32Array(mx * my * mz), s = v.slope || 1, b = v.inter || 0;
  for (let k = 0; k < mz; k++) for (let j = 0; j < my; j++) for (let i = 0; i < mx; i++) { let a = 0; for (let c = 0; c < f; c++) for (let bb = 0; bb < f; bb++) for (let aa = 0; aa < f; aa++) a += v.data[(f * i + aa) + nx * ((f * j + bb) + ny * (f * k + c))]; o[i + mx * (j + my * k)] = a / f ** 3 * s + b; }
  const A = Array.from(v.affine); for (const r of [0, 4, 8]) { for (const c of [0, 1, 2]) A[r + c] *= f; A[r + 3] += (f - 1) / 2 * (v.affine[r] + v.affine[r + 1] + v.affine[r + 2]); } return { dims: [mx, my, mz], affine: A, data: o, slope: 1, inter: 0 }; };
const F = ds(T1, 3), [nx, ny, nz] = F.dims, A = F.affine, P = (i, j, k) => [A[0] * i + A[3], A[5] * j + A[7], A[10] * k + A[11]];
const samp = (vol, p) => { const fi = (p[0] - A[3]) / A[0], fj = (p[1] - A[7]) / A[5], fk = (p[2] - A[11]) / A[10], i = Math.floor(fi), j = Math.floor(fj), k = Math.floor(fk); if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return 0; const a = fi - i, b = fj - j, c = fk - k; let s = 0; for (const [di, wa] of [[0, 1 - a], [1, a]]) for (const [dj, wb] of [[0, 1 - b], [1, b]]) for (const [dk, wc] of [[0, 1 - c], [1, c]]) s += wa * wb * wc * vol.data[(i + di) + nx * ((j + dj) + ny * (k + dk))]; return s; };
// vérité (RAS) : y = Aff(x + w(x)) + t
const th = 0.12, Af = [1.06 * Math.cos(th), -Math.sin(th), 0, Math.sin(th), 0.96 * Math.cos(th), 0, 0, 0.04, 1.08], tr = [5, -4, 3];
const w = p => [3 * Math.sin(p[1] / 25), 2 * Math.cos(p[2] / 30), 2.5 * Math.sin(p[0] / 20)];
const truth = p => { const d = w(p), q = [p[0] + d[0], p[1] + d[1], p[2] + d[2]]; return [0, 1, 2].map(i => Af[3 * i] * q[0] + Af[3 * i + 1] * q[1] + Af[3 * i + 2] * q[2] + tr[i]); };
const det = Af[0] * (Af[4] * Af[8] - Af[5] * Af[7]) - Af[1] * (Af[3] * Af[8] - Af[5] * Af[6]) + Af[2] * (Af[3] * Af[7] - Af[4] * Af[6]);
const Ai = [(Af[4] * Af[8] - Af[5] * Af[7]) / det, -(Af[1] * Af[8] - Af[2] * Af[7]) / det, (Af[1] * Af[5] - Af[2] * Af[4]) / det, -(Af[3] * Af[8] - Af[5] * Af[6]) / det, (Af[0] * Af[8] - Af[2] * Af[6]) / det, -(Af[0] * Af[5] - Af[2] * Af[3]) / det, (Af[3] * Af[7] - Af[4] * Af[6]) / det, -(Af[0] * Af[7] - Af[1] * Af[6]) / det, (Af[0] * Af[4] - Af[1] * Af[3]) / det];
const Mv = { dims: F.dims, affine: A, data: new Float32Array(F.data.length), slope: 1, inter: 0 };
for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const y = P(i, j, k), z = [y[0] - tr[0], y[1] - tr[1], y[2] - tr[2]], u = [0, 1, 2].map(r => Ai[3 * r] * z[0] + Ai[3 * r + 1] * z[1] + Ai[3 * r + 2] * z[2]); let x = u.slice(); for (let it = 0; it < 25; it++) { const d = w(x); x = [u[0] - d[0], u[1] - d[1], u[2] - d[2]]; } Mv.data[i + nx * (j + ny * k)] = samp(F, x); }
const gz = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/elastix.json'), 'utf8')).wasm;
X.MAPS_CHANGES.test = { affine: { NumberOfResolutions: ['3'] }, bspline: { NumberOfResolutions: ['3'], GridSpacingSchedule: ['2', '1.4142135623730951', '1'], FinalGridSpacingInPhysicalUnits: ['12'] } };
const t0 = Date.now(), R = await X.register(gz, F, null, Mv, null, 'test', { result: true });
ok(R.tpo.length === 2 && R.tpo[0].Transform[0] === 'AffineTransform' && R.tpo[1].Transform[0] === 'BSplineTransform', `elastix exécuté dans EpiScope (WebAssembly, ${((Date.now() - t0) / 1000).toFixed(0)} s) : affine puis B-spline`);
const tpo = X.unpack(R.tpo), Tf = X.compile(tpo);
let e = 0, eR = 0, cnt = 0;
for (let k = 6; k < nz - 6; k += 2) for (let j = 8; j < ny - 8; j += 2) for (let i = 6; i < nx - 6; i += 2) { const p = P(i, j, k); if (F.data[i + nx * (j + ny * k)] < 20) continue; const q = Tf(p); e += d3(q, truth(p)); eR += Math.abs(samp(Mv, q) - R.result.data[i + nx * (j + ny * k)]); cnt++; }
e /= cnt; eR /= cnt; let mean = 0; for (const v of F.data) mean += v; mean /= F.data.length;
ok(e < 1.5, `transformation retrouvée (moins d’un demi-voxel) : écart moyen à la vérité ${e.toFixed(2)} mm (voxels du cerveau, grille de 3 mm)`);
ok(eR < 0.05 * mean, `nos cartes appliquées = image rééchantillonnée par elastix (écart moyen ${eR.toFixed(2)}, ${(100 * eR / mean).toFixed(1)} % de l’intensité moyenne)`);
// 3. forme compacte, inverse, jacobien
const back = X.unpack(JSON.parse(JSON.stringify(R.tpo))), Tb = X.compile(back), pt = [10, -20, 15];
ok(d3(Tb(pt), Tf(pt)) < 1e-9, 'forme compacte relue à l’identique');
const Ti = X.inverse(tpo), y = Tf(pt); ok(d3(Ti(y), pt) < 0.01, 'inverse par point fixe (< 0,01 mm)');
ok(R.jac.negPct === 0 && R.jac.min > 0, `déterminant jacobien positif partout (min ${R.jac.min})`);
console.log(`test_elastix : ${n} vérifications OK`);
