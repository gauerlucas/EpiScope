// node tools/tests/test_coreg.mjs [a1 a2 a3 b c1 c2 async | stress] [--seeds=3] [--save=no] [--debug] [--opts=JSON] [--brainmask=mm]
// recalage rigide sur données synthétiques réalistes (Node 22, depuis la racine du dépôt)
//
// Référence : T1 réel (brainchop t1_c, 256³ LIA 1 mm, avec crâne) + segmentation 3 classes (1 = SG, 2 = SB) ;
// MNI ICBM152 2009a (T1 sans crâne + cartes de probabilité SG / SB) pour le cas c2.
// Images mobiles construites avec une transformation rigide aléatoire connue (±30 mm, ±15° par axe), sur d'autres grilles :
//   a1  T1 → T1 sur coupes axiales épaisses 1×1×3 mm (volume partiel, bruit)
//   a2  T2 « inversé » (LCR clair, SB sombre ; d'après la segmentation) 1×1×3 mm
//   a3  T1 postopératoire (cavité de résection, lésions de thermocoagulation) sagittal 1×1×1,2 mm, autre champ
//   b   CT post-implantation 0,5×0,5×1 mm, autre champ : air, scalp, graisse, voûte 1200–1800 HU, LCR, cerveau, 9 électrodes
//       (≈ 3000 HU + halo), bruit 10 HU, stockage Uint16 + inter −1024
//   c1  TEP-FDG 2 mm (SG ≫ SB, FWHM 6 mm, hypométabolisme focal, bruit) → T1 avec crâne
//   c2  TEP-FDG 2 mm d'après les cartes de probabilité MNI → T1 MNI sans crâne (masque cerveau fourni)
// Erreur : déplacement moyen / maximal des voxels cérébraux de la référence entre transformations estimée et vraie.
// Critères : a* moyenne < 1 mm et max < 2 mm ; b, c* moyenne < 1,5 mm. Exemples enregistrés dans /tmp/claude-0/coreg_*.nii.gz.
import fs from 'fs'; import vm from 'vm'; import zlib from 'zlib';
globalThis.window = undefined;
for (const f of ['src/nifti.js', 'src/work.js', 'src/imaging/coreg.js']) vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
const SV = globalThis.SV, M = SV.Mat4, V = SV.Vol, C = SV.Coreg;
const OUT = '/tmp/claude-0'; fs.mkdirSync(OUT, { recursive: true });
const DATA = { t1: '/home/claude/neuroneural/brainchop/v3/data/t1_c.nii.gz', lab: '/home/claude/neuroneural/brainchop/v3/data/labels.nii.gz',
  mni: '/home/claude/pkgs/nilearn/x/nilearn/datasets/data/mni_icbm152_t1_tal_nlin_sym_09a_converted.nii.gz',
  gm: '/home/claude/pkgs/nilearn/x/nilearn/datasets/data/mni_icbm152_gm_tal_nlin_sym_09a_converted.nii.gz',
  wm: '/home/claude/pkgs/nilearn/x/nilearn/datasets/data/mni_icbm152_wm_tal_nlin_sym_09a_converted.nii.gz' };
const args = process.argv.slice(2), opt = k => { const a = args.find(x => x.startsWith('--' + k)); return a ? (a.split('=')[1] ?? true) : null; };
const CASES = args.filter(a => !a.startsWith('--')); const NSEED = +(opt('seeds') || 3), SAVE = opt('save') !== 'no';
const want = c => !CASES.length || CASES.includes(c), STRESS = CASES.includes('stress') || CASES.some(c => /^s\d$/.test(c)), wantS = c => CASES.includes('stress') || CASES.includes(c);
const read = async f => SV.Nifti.read(fs.readFileSync(f));
const t = () => performance.now();

// ---------------------------------------------------------------- aléatoire reproductible
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
const U = (r, a, b) => a + (b - a) * r();

// ---------------------------------------------------------------- morphologie / filtres (grille 1 mm isotrope)
/** remplissage depuis les bords : 1 = voxel non relié au bord par des voxels où inside == 0 */
function fill(inside, dims) {
  const [nx, ny, nz] = dims, n = nx * ny * nz, out = new Uint8Array(n).fill(1), Q = new Int32Array(n); let h = 0, q = 0;
  const push = i => { if (out[i] && !inside[i]) { out[i] = 0; Q[q++] = i; } };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (!i || !j || !k || i === nx - 1 || j === ny - 1 || k === nz - 1) push(i + nx * (j + ny * k));
  while (h < q) { const p = Q[h++], i = p % nx, j = ((p - i) / nx) % ny, k = (p - i - nx * j) / (nx * ny); if (i) push(p - 1); if (i < nx - 1) push(p + 1); if (j) push(p - nx); if (j < ny - 1) push(p + nx); if (k) push(p - nx * ny); if (k < nz - 1) push(p + nx * ny); }
  return out;
}
/** transformée de distance euclidienne exacte (Felzenszwalb–Huttenlocher), distance (mm) aux voxels où src ≠ 0 */
function edt(src, dims) {
  const [nx, ny, nz] = dims, n = nx * ny * nz, INF = 1e20, D = new Float32Array(n); for (let i = 0; i < n; i++) D[i] = src[i] ? 0 : INF;
  const L = Math.max(nx, ny, nz), f = new Float64Array(L), d = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  const line = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let p = v[k], s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      while (s <= z[k]) { k--; p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const o = nx * (j + ny * k); for (let i = 0; i < nx; i++) f[i] = D[o + i]; line(nx); for (let i = 0; i < nx; i++) D[o + i] = d[i]; }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) f[j] = D[i + nx * (j + ny * k)]; line(ny); for (let j = 0; j < ny; j++) D[i + nx * (j + ny * k)] = d[j]; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { for (let k = 0; k < nz; k++) f[k] = D[i + nx * (j + ny * k)]; line(nz); for (let k = 0; k < nz; k++) D[i + nx * (j + ny * k)] = d[k]; }
  for (let i = 0; i < n; i++) D[i] = Math.sqrt(D[i]);
  return D;
}
/** flou gaussien séparable (σ en voxels), Float32 */
function blur(src, dims, sig) {
  const [nx, ny, nz] = dims, r = Math.ceil(3 * sig), K = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) s += (K[i + r] = Math.exp(-i * i / (2 * sig * sig))); for (let i = 0; i < K.length; i++) K[i] /= s;
  const a = Float32Array.from(src), b = new Float32Array(a.length), cl = (q, n) => q < 0 ? 0 : q >= n ? n - 1 : q, P = nx * ny;
  for (let l = 0; l < ny * nz; l++) { const o = l * nx; for (let i = 0; i < nx; i++) { let s = 0; for (let t = -r; t <= r; t++) s += K[t + r] * a[o + cl(i + t, nx)]; b[o + i] = s; } }
  a.fill(0);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const d = nx * (j + ny * k); for (let t = -r; t <= r; t++) { const w = K[t + r], s = nx * (cl(j + t, ny) + ny * k); for (let i = 0; i < nx; i++) a[d + i] += w * b[s + i]; } }
  b.fill(0);
  for (let k = 0; k < nz; k++) { const d = P * k; for (let t = -r; t <= r; t++) { const w = K[t + r], s = P * cl(k + t, nz); for (let i = 0; i < P; i++) b[d + i] += w * a[s + i]; } }
  return b;
}

// ---------------------------------------------------------------- anatomie de référence
/** masques et distances sur la grille de référence ; brain : Uint8 (SG ∪ SB) ; t1 : intensités */
function anatomy(ref, brain, headThr) {
  const dims = ref.dims, n = brain.length, t1 = ref.data;
  const head = headThr != null ? (() => { const m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = t1[i] > headThr ? 1 : 0; return fill(m, dims); })() : null;
  const dB = edt(brain, dims);                                          // distance au cerveau
  const dil = new Uint8Array(n); for (let i = 0; i < n; i++) dil[i] = dB[i] <= 3 ? 1 : 0;
  const icv = fill(dil, dims);                                          // endocrâne (cerveau + LCR, ventricules)
  let dOut = null; if (head) { const bg = new Uint8Array(n); for (let i = 0; i < n; i++) bg[i] = head[i] ? 0 : 1; dOut = edt(bg, dims); }
  let c = [0, 0, 0], nb = 0; const [nx, ny] = dims;
  for (let p = 0; p < n; p++) if (brain[p]) { c[0] += p % nx; c[1] += Math.floor(p / nx) % ny; c[2] += Math.floor(p / (nx * ny)); nb++; }
  const cb = M.apply(ref.affine, c[0] / nb, c[1] / nb, c[2] / nb);
  return { head, brain, dB, icv, dOut, cb };
}
const worldOf = (vol, p) => { const [nx, ny] = vol.dims, i = p % nx, j = Math.floor(p / nx) % ny, k = Math.floor(p / (nx * ny)); return M.apply(vol.affine, i, j, k); };

// ---------------------------------------------------------------- grilles et synthèse
/** grille : axes (colonnes, vecteurs unitaires monde), taille de voxel, dimensions, centre monde */
function grid(dims, vox, axes, center) {
  const A = new Float64Array(16); A[15] = 1;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) A[4 * r + c] = axes[c][r] * vox[c];
  const h = dims.map(d => (d - 1) / 2);
  for (let r = 0; r < 3; r++) A[4 * r + 3] = center[r] - (A[4 * r] * h[0] + A[4 * r + 1] * h[1] + A[4 * r + 2] * h[2]);
  return { dims, affine: A };
}
/** image mobile : source (Float32 sur la grille de référence) vue à travers Ttrue (monde mobile → monde référence),
 *  moyenne de sub[0]×sub[1]×sub[2] sous-échantillons par voxel (volume partiel) */
function synth(src, ref, G, Ttrue, sub, outside) {
  const Mx = M.mul(M.inv(ref.affine), M.mul(Ttrue, G.affine)), [nx, ny, nz] = ref.dims, [mx, my, mz] = G.dims, out = new Float32Array(mx * my * mz), sxy = nx * ny;
  const offs = []; for (let a = 0; a < sub[0]; a++) for (let b = 0; b < sub[1]; b++) for (let c = 0; c < sub[2]; c++) offs.push([(a + 0.5) / sub[0] - 0.5, (b + 0.5) / sub[1] - 0.5, (c + 0.5) / sub[2] - 0.5]);
  const sample = (x, y, z) => {
    if (!(x >= 0 && y >= 0 && z >= 0 && x < nx - 1 && y < ny - 1 && z < nz - 1)) return outside;
    const i0 = x | 0, j0 = y | 0, k0 = z | 0, fx = x - i0, fy = y - j0, fz = z - k0, i = i0 + nx * (j0 + ny * k0), d = src;
    return ((d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + nx] * (1 - fx) + d[i + nx + 1] * fx) * fy) * (1 - fz) + ((d[i + sxy] * (1 - fx) + d[i + sxy + 1] * fx) * (1 - fy) + (d[i + sxy + nx] * (1 - fx) + d[i + sxy + nx + 1] * fx) * fy) * fz;
  };
  let o = 0;
  for (let k = 0; k < mz; k++) for (let j = 0; j < my; j++) for (let i = 0; i < mx; i++, o++) {
    let s = 0; for (const [a, b, c] of offs) { const u = i + a, v = j + b, w = k + c; s += sample(Mx[0] * u + Mx[1] * v + Mx[2] * w + Mx[3], Mx[4] * u + Mx[5] * v + Mx[6] * w + Mx[7], Mx[8] * u + Mx[9] * v + Mx[10] * w + Mx[11]); }
    out[o] = s / offs.length;
  }
  return out;
}
function randomRigid(r, c, tm = 30, rm = 15) { const D = Math.PI / 180; return { p: [U(r, -tm, tm), U(r, -tm, tm), U(r, -tm, tm), U(r, -rm, rm) * D, U(r, -rm, rm) * D, U(r, -rm, rm) * D], c }; }
/** déplacement entre transformations estimée et vraie aux voxels cérébraux de la référence (1 voxel sur 8) */
function errorOf(ref, brain, Test, Ttrue) {
  const D = M.mul(Test, M.inv(Ttrue)), [nx, ny, nz] = ref.dims; let s = 0, mx = 0, n = 0;
  for (let k = 0; k < nz; k += 2) for (let j = 0; j < ny; j += 2) for (let i = 0; i < nx; i += 2) {
    if (!brain[i + nx * (j + ny * k)]) continue; const x = M.apply(ref.affine, i, j, k), y = M.apply(D, x[0], x[1], x[2]), e = Math.hypot(y[0] - x[0], y[1] - x[1], y[2] - x[2]); s += e; if (e > mx) mx = e; n++;
  }
  return { mean: s / n, max: mx };
}
const vol = (G, data, extra) => Object.assign({ dims: G.dims, pixdim: [0, 1, 2].map(c => Math.hypot(G.affine[c], G.affine[4 + c], G.affine[8 + c])), data, slope: 1, inter: 0, affine: G.affine }, extra || {});
function addNoise(d, r, sd, rician) { for (let i = 0; i < d.length; i++) { if (rician) { const a = d[i] + sd * gauss(r), b = sd * gauss(r); d[i] = Math.hypot(a, b); } else d[i] += sd * gauss(r); } return d; }
async function save(name, v) { fs.writeFileSync(`${OUT}/coreg_${name}.nii.gz`, await SV.Nifti.encodeGz(v)); }

// ---------------------------------------------------------------- générateurs de cas
const AX = { RAS: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], LPS: [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], SAG: [[0, 1, 0], [0, 0, 1], [1, 0, 0]] };

function sourceT1(ref) { const s = new Float32Array(ref.data.length); for (let i = 0; i < s.length; i++) s[i] = ref.data[i] / 255; return s; }
/** contraste T2 (LCR clair, SG > SB, os sombre, graisse moyenne) depuis la segmentation */
function sourceT2(ref, gm, wm, an) {
  const n = gm.length, s = new Float32Array(n), t1 = ref.data;
  for (let i = 0; i < n; i++) {
    const rest = Math.max(0, 1 - gm[i] - wm[i]);
    s[i] = 0.55 * gm[i] + 0.36 * wm[i] + rest * (an.icv[i] ? 1.0 : !an.head[i] ? 0 : an.dB[i] < 10 && an.dOut[i] > 3 ? 0.04 : 0.15 + 0.5 * Math.min(1, Math.max(0, (t1[i] - 60) / 140)));
  }
  return blur(s, ref.dims, 0.5);
}
/** T1 postopératoire : cavité de résection (LCR) + 4 lésions de thermocoagulation (centre hyper, couronne hypo) */
function sourcePostop(ref, lab, an, r) {
  const s = sourceT1(ref), [nx, ny, nz] = ref.dims, W2V = M.inv(ref.affine);
  const lesions = [{ c: [an.cb[0] + 38, an.cb[1] + 5, an.cb[2] - 22], r: 17, cav: true }];
  for (let k = 0; k < 4; k++) lesions.push({ c: [an.cb[0] - 30 + U(r, -5, 5), an.cb[1] - 20 + 10 * k, an.cb[2] + U(r, -10, 10)], r: 3.5, cav: false });
  for (const L of lesions) {
    const v = M.apply(W2V, ...L.c), R = Math.ceil(L.r + 3);
    for (let k = Math.max(0, Math.round(v[2]) - R); k <= Math.min(nz - 1, Math.round(v[2]) + R); k++) for (let j = Math.max(0, Math.round(v[1]) - R); j <= Math.min(ny - 1, Math.round(v[1]) + R); j++) for (let i = Math.max(0, Math.round(v[0]) - R); i <= Math.min(nx - 1, Math.round(v[0]) + R); i++) {
      const p = i + nx * (j + ny * k); if (!an.icv[p]) continue; const d = Math.hypot(i - v[0], j - v[1], k - v[2]);
      if (L.cav) { if (d < L.r) s[p] = 0.06; else if (d < L.r + 2) s[p] = Math.min(s[p], 0.35); }
      else { if (d < L.r * 0.5) s[p] = 0.75; else if (d < L.r) s[p] = 0.2; else if (d < L.r + 1.5) s[p] *= 0.8; }
    }
  }
  return s;
}
/** CT (HU) sur la grille de référence : air, scalp (graisse d'après le T1), voûte (tables / diploé), LCR, SG, SB */
function sourceCT(ref, gm, wm, an) {
  const n = gm.length, s = new Float32Array(n), t1 = ref.data;
  for (let i = 0; i < n; i++) {
    if (!an.head[i]) { s[i] = -1000; continue; }
    let o;
    if (an.icv[i]) o = 8;
    else if (an.dB[i] < 10.5 && an.dOut[i] > 2.5) { const u = (an.dB[i] - 3.5) / 7; o = 1050 + 750 * Math.min(1, Math.abs(2 * u - 1) ** 0.6); }   // tables 1800, diploé 1050
    else o = 45 - 125 * Math.min(1, Math.max(0, (t1[i] - 110) / 90));   // muscle / peau 45, graisse −80
    s[i] = 38 * gm[i] + 28 * wm[i] + Math.max(0, 1 - gm[i] - wm[i]) * o;
  }
  return s;
}
/** électrodes SEEG (monde de référence) : pointe dans le cerveau, entrée orthogonale latérale, 15 mm hors du scalp */
function electrodes(ref, an, r, n) {
  const W2V = M.inv(ref.affine), [nx, ny] = ref.dims, inHead = p => { const v = M.apply(W2V, ...p).map(Math.round); const [i, j, k] = v; if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= ref.dims[2]) return false; return !!an.head[i + nx * (j + ny * k)]; };
  const out = [];
  for (let e = 0; e < n; e++) {
    const side = e % 2 ? 1 : -1, tip = [an.cb[0] + side * U(r, 4, 22), an.cb[1] + U(r, -55, 40), an.cb[2] + U(r, -25, 30)];
    const d = [side, U(r, -0.25, 0.25), U(r, -0.2, 0.35)], nd = Math.hypot(...d); for (let k = 0; k < 3; k++) d[k] /= nd;
    let L = 10; while (L < 150 && inHead(tip.map((x, k) => x + d[k] * L))) L += 1;
    out.push({ tip, dir: d, len: L + 15, inside: L });
  }
  return out;
}
/** métal : 3000 HU aux plots (2 mm / pas 3,5 mm), 1800 entre plots, halo de diffusion ; dans le monde mobile */
function burnElectrodes(G, hu, els, TtrueInv) {
  const [mx, my, mz] = G.dims, W2V = M.inv(G.affine), vox = [0, 1, 2].map(c => Math.hypot(G.affine[c], G.affine[4 + c], G.affine[8 + c]));
  for (const e of els) {
    const a = M.apply(TtrueInv, ...e.tip), bw = e.tip.map((x, k) => x + e.dir[k] * e.len), b = M.apply(TtrueInv, ...bw), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); for (let k = 0; k < 3; k++) d[k] /= L;
    const va = M.apply(W2V, ...a), vb = M.apply(W2V, ...b), R = 4;
    const lo = [0, 1, 2].map(k => Math.max(0, Math.floor(Math.min(va[k], vb[k]) - R / vox[k]))), hi = [0, 1, 2].map(k => Math.min(G.dims[k] - 1, Math.ceil(Math.max(va[k], vb[k]) + R / vox[k])));
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
      const w = M.apply(G.affine, i, j, k), px = w[0] - a[0], py = w[1] - a[1], pz = w[2] - a[2]; let s = px * d[0] + py * d[1] + pz * d[2]; s = Math.max(0, Math.min(L, s));
      const rr = Math.hypot(px - s * d[0], py - s * d[1], pz - s * d[2]); if (rr > R) continue;
      const contact = s < e.inside && (s % 3.5) < 2, amp = s >= e.inside ? 2600 : contact ? 3400 : 1800;
      const add = amp * Math.exp(-rr * rr / (2 * 0.42 * 0.42)) + 350 * Math.exp(-rr * rr / (2 * 1.3 * 1.3)), p = i + mx * (j + my * k);
      hu[p] = Math.max(hu[p], Math.min(3071, hu[p] + add));
    }
  }
}
/** TEP : SG 1, SB 0,3, LCR 0,05, scalp 0,12, os 0,03 ; hypométabolisme sphérique ; FWHM 6 mm */
function sourcePET(ref, gm, wm, icv, head, an, hypo) {
  const n = gm.length, s = new Float32Array(n), W2V = M.inv(ref.affine), hv = M.apply(W2V, ...hypo.c), [nx, ny] = ref.dims;
  for (let p = 0; p < n; p++) {
    let v = gm[p] * 1.0 + wm[p] * 0.3 + Math.max(0, 1 - gm[p] - wm[p]) * (icv[p] ? 0.05 : head && head[p] ? (an.dB[p] < 10 && an.dOut[p] > 3 ? 0.03 : 0.12) : 0);
    if (gm[p] > 0) { const i = p % nx, j = Math.floor(p / nx) % ny, k = Math.floor(p / (nx * ny)), d = Math.hypot(i - hv[0], j - hv[1], k - hv[2]); if (d < hypo.r + 4) v -= gm[p] * 0.45 * Math.min(1, Math.max(0, (hypo.r + 4 - d) / 4)); }
    s[p] = v;
  }
  return blur(s, ref.dims, 6 / 2.3548);
}

// ---------------------------------------------------------------- tests unitaires (points, décomposition)
function unitTests() {
  const r = rng(99), T = M.rigid([12, -7, 25, 0.2, -0.1, 0.3], [5, 10, -3]), A = Float64Array.from(T); A[0] *= 1.05; A[5] *= 0.97; A[1] += 0.02;
  const src = [], dstR = [], dstA = []; for (let i = 0; i < 12; i++) { const p = [U(r, -60, 60), U(r, -60, 60), U(r, -60, 60)]; src.push(p); dstR.push(M.apply(T, ...p).map(x => x + 0.01 * gauss(r))); dstA.push(M.apply(A, ...p)); }
  const R = C.rigidFromPoints(src, dstR), Af = C.affineFromPoints(src, dstA), dec = C.decompose(T);
  const eR = C.residual(R, src, dstR), eA = C.residual(Af, src, dstA);
  const ok = eR.rms < 0.05 && eA.max < 1e-6 && Math.abs(dec.rotations[0] - 0.2 * 180 / Math.PI) < 1e-9 && Math.abs(dec.rotations[2] - 0.3 * 180 / Math.PI) < 1e-9;
  // matrices réfléchies : Kabsch doit rester une rotation propre
  const Rf = C.rigidFromPoints(src, src.map(p => [-p[0], p[1], p[2]])), det = Rf[0] * (Rf[5] * Rf[10] - Rf[6] * Rf[9]) - Rf[1] * (Rf[4] * Rf[10] - Rf[6] * Rf[8]) + Rf[2] * (Rf[4] * Rf[9] - Rf[5] * Rf[8]);
  console.log(`points : rigide rms ${eR.rms.toFixed(4)} mm, affine max ${eA.max.toExponential(1)} mm, décomposition ${dec.rotations.map(x => x.toFixed(2)).join('/')}°, det(réflexion) ${det.toFixed(3)} → ${ok && det > 0.999 ? 'OK' : 'ÉCHEC'}`);
  return ok && det > 0.999;
}

// ---------------------------------------------------------------- exécution
const results = []; let allOk = unitTests();
const t1 = await read(DATA.t1), labV = await read(DATA.lab);
// segmentation : rééchantillonnée par son propre affine (décalée de 0,35 mm en y par rapport au T1 : en-tête exact, vérifié
// indépendamment par corrélation sous-voxel), sous forme de fractions SG / SB (volume partiel)
const frac = c => V.resample({ dims: labV.dims, affine: labV.affine, data: Float32Array.from(labV.data, v => Math.round(v) === c ? 1 : 0), slope: 1, inter: 0 }, t1, null, 'linear').data;
const gmT1 = frac(1), wmT1 = frac(2), lab = new Uint8Array(gmT1.length);
for (let i = 0; i < lab.length; i++) lab[i] = gmT1[i] + wmT1[i] < 0.5 ? 0 : gmT1[i] >= wmT1[i] ? 1 : 2;
const brain = new Uint8Array(lab.length); for (let i = 0; i < lab.length; i++) brain[i] = lab[i] > 0 ? 1 : 0;
let T0 = t(); const an = anatomy(t1, brain, 20); console.log(`anatomie T1 : ${((t() - T0) / 1000).toFixed(1)} s, centre cerveau ${an.cb.map(x => x.toFixed(1))}`);

async function runCase(name, seed, make, crit, regOpts, ref, brainRef) {
  if (opt('brainmask') && !regOpts.fixedMask) regOpts = Object.assign({}, regOpts, { fixedMask: brainRef, maskDilate: +opt('brainmask') });   // --brainmask=mm
  if (opt('opts')) regOpts = Object.assign({}, regOpts, JSON.parse(opt('opts')));   // --opts='{"levels":[8,4,2,1]}' (_range : [mm, °] de la vérité)
  const r = rng(1000 * (name.charCodeAt(0) + 7 * name.length + (name.charCodeAt(1) || 0)) + seed + 1), ts = t();
  const rg = regOpts._range || [30, 15], truth = randomRigid(r, an && ref === t1 ? an.cb : regOpts._cb, rg[0], rg[1]), Ttrue = M.rigid(truth.p, truth.c);
  const moving = make(r, Ttrue); const tg = t() - ts;
  let prog = 0; const cpu0 = process.cpuUsage(); const res = C.rigid(ref, moving, Object.assign({}, regOpts, { _cb: undefined, _range: undefined }), () => prog++);
  const cu = process.cpuUsage(cpu0), cpu = (cu.user + cu.system) / 1e6;
  const e = errorOf(ref, brainRef, res.T, Ttrue), e0 = errorOf(ref, brainRef, M.identity(), Ttrue);
  const ok = e.mean < crit.mean && (crit.max == null || e.max < crit.max); if (!crit.info) allOk = allOk && ok;
  const q = res.quality;
  const row = { case: name, seed, err0: e0.mean, mean: e.mean, max: e.max, s: res.ms / 1000, cpu, pyr: res.msPyramid / 1000, evals: res.evals, init: res.init.method + (res.init.angles ? ' ' + res.init.angles.join('/') : '') + (res.init.retry ? ' (reprise ' + res.init.retry + ')' : ''), rel: res.qc.rel, nmi: q.nmi, corr: q.corr, ok };
  results.push(row);
  console.log(`${name} #${seed}  écart initial ${e0.mean.toFixed(1)} mm → moyenne ${e.mean.toFixed(2)} mm, max ${e.max.toFixed(2)} mm   ${(res.ms / 1000).toFixed(1)} s, CPU ${cpu.toFixed(1)} s (pyramide ${(res.msPyramid / 1000).toFixed(1)} s, ${res.evals} éval.)  init ${row.init}  NMI ${q.nmi.toFixed(3)} r ${q.corr.toFixed(2)} QC rel ${res.qc.rel.toFixed(2)}${res.init.retry ? ' reprise ' + res.init.retry : ''}${res.warnings.length ? ' ⚠ ' + res.warnings.join(' ; ') : ''}  [synthèse ${(tg / 1000).toFixed(1)} s]  ${ok ? 'OK' : 'ÉCHEC'}`);
  if (opt('debug')) { const dd = C.decompose(M.mul(res.T, M.inv(Ttrue)), an.cb); console.log('  résidu : t', dd.translation.map(x => x.toFixed(2)).join(','), 'mm, rot', dd.rotations.map(x => x.toFixed(2)).join(','), '°  ', JSON.stringify(res.history.filter(h => h.phase === 'level'))); }
  if (SAVE && seed === 0 && !crit.info) {
    await save(name + '_moving', moving);
    const reg = V.resample(moving, ref, res.T); await save(name + '_registered', reg);
  }
  return res;
}

if (want('a1')) for (let s = 0; s < NSEED; s++) await runCase('a1', s, (r, Tt) => {
  const G = grid([230, 230, 52], [1, 1, 3], AX.RAS, M.apply(M.inv(Tt), an.cb[0] + U(r, -10, 10), an.cb[1] + U(r, -10, 10), an.cb[2] + U(r, -5, 15)));
  const d = addNoise(synth(sourceT1(t1), t1, G, Tt, [1, 1, 3], 0), r, 0.02, true); return vol(G, d, { descrip: 'synthetic T1 1x1x3' });
}, { mean: 1, max: 2 }, { movingKind: 'T1' }, t1, brain);

if (want('a2')) { const src = sourceT2(t1, gmT1, wmT1, an); for (let s = 0; s < NSEED; s++) await runCase('a2', s, (r, Tt) => {
  const G = grid([230, 230, 50], [1, 1, 3], AX.RAS, M.apply(M.inv(Tt), an.cb[0] + U(r, -10, 10), an.cb[1] + U(r, -10, 10), an.cb[2] + U(r, -5, 15)));
  const d = addNoise(synth(src, t1, G, Tt, [1, 1, 3], 0), r, 0.025, true); return vol(G, d, { descrip: 'synthetic T2 1x1x3' });
}, { mean: 1, max: 2 }, { movingKind: 'T2' }, t1, brain); }

if (want('a3')) for (let s = 0; s < NSEED; s++) await runCase('a3', s, (r, Tt) => {
  const src = sourcePostop(t1, lab, an, r);
  const G = grid([200, 240, 150], [1, 1, 1.2], AX.SAG, M.apply(M.inv(Tt), an.cb[0] + U(r, -5, 5), an.cb[1] + U(r, -10, 10), an.cb[2] + U(r, 0, 25)));
  const d = addNoise(synth(src, t1, G, Tt, [1, 1, 1], 0), r, 0.02, true); return vol(G, d, { descrip: 'synthetic postop T1' });
}, { mean: 1, max: 2 }, { movingKind: 'T1' }, t1, brain);

if (want('b')) { const src = sourceCT(t1, gmT1, wmT1, an); for (let s = 0; s < NSEED; s++) await runCase('b', s, (r, Tt) => {
  const G = grid([440, 440, 150], [0.5, 0.5, 1], AX.LPS, M.apply(M.inv(Tt), an.cb[0] + U(r, -8, 8), an.cb[1] + U(r, -8, 8), an.cb[2] + U(r, 0, 15)));
  const hu = synth(src, t1, G, Tt, [1, 1, 1], -1000), els = electrodes(t1, an, r, 9); burnElectrodes(G, hu, els, M.inv(Tt)); addNoise(hu, r, 10);
  const d = new Uint16Array(hu.length); for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(4095, Math.round(hu[i] + 1024)));
  return vol(G, d, { inter: -1024, descrip: 'synthetic CT SEEG' });
}, { mean: 1.5 }, { movingKind: 'CT' }, t1, brain); }

if (want('c1')) for (let s = 0; s < NSEED; s++) await runCase('c1', s, (r, Tt) => {
  const src = sourcePET(t1, gmT1, wmT1, an.icv, an.head, an, { c: [an.cb[0] - 42 + U(r, -4, 4), an.cb[1] + U(r, -15, 5), an.cb[2] - 18], r: 14 });
  const G = grid([128, 128, 90], [2, 2, 2], AX.RAS, M.apply(M.inv(Tt), an.cb[0] + U(r, -10, 10), an.cb[1] + U(r, -10, 10), an.cb[2] + U(r, -10, 10)));
  const d = synth(src, t1, G, Tt, [2, 2, 2], 0); for (let i = 0; i < d.length; i++) d[i] = Math.max(0, d[i] + 0.06 * Math.sqrt(Math.max(d[i], 0.01)) * gauss(r)) * 10000;
  return vol(G, d, { descrip: 'synthetic FDG PET' });
}, { mean: 1.5 }, { movingKind: 'PET' }, t1, brain);

if (want('c2')) {
  const mni = await read(DATA.mni), gmV = await read(DATA.gm), wmV = await read(DATA.wm), n = mni.data.length;
  const gm = new Float32Array(n), wm = new Float32Array(n), bm = new Uint8Array(n);
  for (let i = 0; i < n; i++) { gm[i] = gmV.data[i] / 255; wm[i] = wmV.data[i] / 255; bm[i] = mni.data[i] > 0 ? 1 : 0; }
  const brainM = new Uint8Array(n); for (let i = 0; i < n; i++) brainM[i] = gm[i] + wm[i] > 0.5 ? 1 : 0;
  const anM = anatomy(mni, brainM, null); anM.dOut = null;
  for (let s = 0; s < NSEED; s++) await runCase('c2', s, (r, Tt) => {
    const src = sourcePET(mni, gm, wm, bm, null, anM, { c: [-40 + U(r, -4, 4), -15 + U(r, -10, 10), -20], r: 14 });
    const G = grid([128, 128, 90], [2, 2, 2], AX.RAS, M.apply(M.inv(Tt), anM.cb[0] + U(r, -10, 10), anM.cb[1] + U(r, -10, 10), anM.cb[2] + U(r, -10, 10)));
    const d = synth(src, mni, G, Tt, [2, 2, 2], 0); for (let i = 0; i < d.length; i++) d[i] = Math.max(0, d[i] + 0.06 * Math.sqrt(Math.max(d[i], 0.01)) * gauss(r)) * 10000;
    return vol(G, d, { descrip: 'synthetic FDG PET (MNI)' });
  }, { mean: 1.5 }, { movingKind: 'PET', fixedMask: bm, maskDilate: 4, _cb: anM.cb }, mni, brainM);
}

// asynchrone (repli dans le fil courant sous Node) et contrôle qualité
if (want('async')) {
  const r = rng(5), Tt = M.rigid([5, -4, 8, 0.05, 0.02, -0.04], an.cb);
  const G = grid([200, 200, 60], [1.1, 1.1, 2.5], AX.RAS, M.apply(M.inv(Tt), ...an.cb)), mv = vol(G, synth(sourceT1(t1), t1, G, Tt, [1, 1, 2], 0));
  const res = await C.rigidAsync(t1, mv, { init: 'com' }, () => {}), e = errorOf(t1, brain, res.T, Tt);
  const q0 = C.quality(t1, mv, M.identity()), q1 = C.quality(t1, mv, res.T);
  // r.quality (niveau 2 mm déjà construit) doit égaler quality() ; Mat4.rigid(params, center) doit redonner T
  const dq = Math.abs(res.quality.nmi - q1.nmi), Tp = M.rigid(res.params, res.center); let dT = 0; for (let i = 0; i < 16; i++) dT = Math.max(dT, Math.abs(Tp[i] - res.T[i]));
  const ok = e.mean < 1 && q1.nmi > q0.nmi && q1.corr > 0.9 && dq < 1e-3 && dT < 1e-6 && !res.warnings.length; allOk = allOk && ok;
  console.log(`rigidAsync (Node : fil courant) init com : ${e.mean.toFixed(2)} mm ; QC avant NMI ${q0.nmi.toFixed(3)} r ${q0.corr.toFixed(2)} → après NMI ${q1.nmi.toFixed(3)} r ${q1.corr.toFixed(2)} (r.quality ${res.quality.nmi.toFixed(3)}) ; params → T ${dT.toExponential(1)} ${ok ? 'OK' : 'ÉCHEC'}`);
}


// ---------------------------------------------------------------- robustesse (facultatif : `node … stress`, sans effet sur le code de sortie)
if (STRESS) {
  const src2 = sourceT2(t1, gmT1, wmT1, an), info = { mean: 1, max: 2, info: true };
  // s1 : grands écarts initiaux (±60 mm, ±30° par axe)
  if (wantS('s1')) for (let s = 0; s < NSEED; s++) await runCase('s1-large', s, (r, Tt) => {
    const G = grid([230, 230, 52], [1, 1, 3], AX.RAS, M.apply(M.inv(Tt), an.cb[0], an.cb[1], an.cb[2] + 5));
    return vol(G, addNoise(synth(src2, t1, G, Tt, [1, 1, 3], 0), r, 0.025, true));
  }, info, { movingKind: 'T2', _range: [60, 30] }, t1, brain);
  // s2 : lame partielle (16 coupes de 3 mm = 48 mm, centrée sur les lobes temporaux), T2
  if (wantS('s2')) for (let s = 0; s < NSEED; s++) await runCase('s2-slab', s, (r, Tt) => {
    const G = grid([230, 230, 16], [1, 1, 3], AX.RAS, M.apply(M.inv(Tt), an.cb[0], an.cb[1] + 5, an.cb[2] - 15));
    return vol(G, addNoise(synth(src2, t1, G, Tt, [1, 1, 3], 0), r, 0.025, true));
  }, info, { movingKind: 'T2' }, t1, brain);
  // s3 : T2 très bruité (σ = 10 % du LCR)
  if (wantS('s3')) for (let s = 0; s < NSEED; s++) await runCase('s3-noisy', s, (r, Tt) => {
    const G = grid([230, 230, 50], [1, 1, 3], AX.RAS, M.apply(M.inv(Tt), an.cb[0], an.cb[1], an.cb[2] + 5));
    return vol(G, addNoise(synth(src2, t1, G, Tt, [1, 1, 3], 0), r, 0.10, true));
  }, info, { movingKind: 'T2' }, t1, brain);
  // s4 : CT clinique volumineux 0,45×0,45×0,6 mm (512×512×300, 79 M voxels), int16
  if (wantS('s4')) { const src = sourceCT(t1, gmT1, wmT1, an); for (let s = 0; s < 1; s++) await runCase('s4-bigCT', s, (r, Tt) => {
    const G = grid([512, 512, 300], [0.45, 0.45, 0.6], AX.LPS, M.apply(M.inv(Tt), an.cb[0], an.cb[1], an.cb[2]));
    const hu = synth(src, t1, G, Tt, [1, 1, 1], -1000); burnElectrodes(G, hu, electrodes(t1, an, r, 12), M.inv(Tt)); addNoise(hu, r, 12);
    const d = new Int16Array(hu.length); for (let i = 0; i < d.length; i++) d[i] = Math.round(hu[i]); return vol(G, d);
  }, { mean: 1.5, info: true }, { movingKind: 'CT' }, t1, brain); }
  // s5 : TEP avec masque cerveau fixe (recommandé) au lieu de la tête entière
  if (wantS('s5')) for (let s = 0; s < NSEED; s++) await runCase('s5-PETmask', s, (r, Tt) => {
    const src = sourcePET(t1, gmT1, wmT1, an.icv, an.head, an, { c: [an.cb[0] - 42, an.cb[1] - 5, an.cb[2] - 18], r: 14 });
    const G = grid([128, 128, 90], [2, 2, 2], AX.RAS, M.apply(M.inv(Tt), ...an.cb));
    const d = synth(src, t1, G, Tt, [2, 2, 2], 0); for (let i = 0; i < d.length; i++) d[i] = Math.max(0, d[i] + 0.06 * Math.sqrt(Math.max(d[i], 0.01)) * gauss(r));
    return vol(G, d);
  }, { mean: 1.5, info: true }, { movingKind: 'PET', fixedMask: brain, maskDilate: 4 }, t1, brain);
}

// ---------------------------------------------------------------- synthèse
if (results.length) {
  console.log('\n| cas | graine | écart initial (mm) | moyenne (mm) | max (mm) | durée (s) | CPU (s) | init | QC rel | NMI | r | |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of results) console.log(`| ${x.case} | ${x.seed} | ${x.err0.toFixed(1)} | ${x.mean.toFixed(2)} | ${x.max.toFixed(2)} | ${x.s.toFixed(1)} | ${x.cpu.toFixed(1)} | ${x.init} | ${x.rel.toFixed(2)} | ${x.nmi.toFixed(3)} | ${x.corr.toFixed(2)} | ${x.ok ? 'OK' : 'ÉCHEC'} |`);
}
console.log(allOk ? '\nTOUS LES TESTS OK' : '\nÉCHECS');
process.exitCode = allOk ? 0 : 1;
