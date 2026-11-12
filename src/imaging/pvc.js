/* EpiScope — imaging/pvc.js : correction de l'effet de volume partiel (TEP, TEMP) sur la segmentation du T1, d'après les
 * méthodes de PETPVC (Thomas et al., Phys Med Biol 2016 ; https://github.com/UCL/PETPVC), réécrites sans dépendance pour
 * tourner dans un worker du navigateur. La PSF est une gaussienne isotrope de largeur à mi-hauteur FWHM (mm) — résolution
 * effective de l'image reconstruite, à demander au service de médecine nucléaire.
 *
 *   SV.PVC.run({ pet, petT, lab, method, fwhm, res, regions, iters }, progress) → { data, dims, affine, pixdim, table, … }
 *     pet   : volume TEP (src/nifti.js : dims, affine, data, slope, inter)
 *     petT  : recalage de la TEP sur le T1 (monde TEP → monde du T1, 16 valeurs, ligne par ligne) ou null
 *     lab   : étiquettes du patient dans le monde du T1 (parcellation VEP : 1–162 régions, 200 substance blanche, 201 LCR)
 *     method: 'rbv' (Thomas 2011 : GTM puis correction voxel à voxel de Yang) | 'iy' (Yang itératif, Erlandsson 2012) |
 *             'mg' (Müller-Gärtner 1992, substance grise) | 'gtm' (Rousset 1998 : valeurs régionales) |
 *             'rl' (Richardson-Lucy, déconvolution sans segmentation)
 *     regions: 'vep' (régions VEP + substance blanche + LCR + extra-cérébral) | 'tissue' (SG, SB, LCR, extra-cérébral)
 *     res   : pas de la grille de calcul (mm, alignée sur les étiquettes, défaut 2)
 * Tout se calcule dans l'espace du T1 (grille res mm englobant le cerveau) : la TEP est rééchantillonnée en trilinéaire,
 * les fractions de tissu de chaque voxel viennent des étiquettes à 1 mm (blocs de res³ voxels). Le résultat est une image
 * dérivée recalée par construction sur le T1, et un tableau des valeurs régionales avant / après correction.
 *
 *   v4.18 — asymétrie gauche / droite : labelGrid (grille de res mm sur les étiquettes), regionStats (moyenne, écart-type et
 *   effectif de chaque région, image lue au voxel d'étiquette), asymTest (AI des paires homologues ; z robuste, t de Welch à
 *   effectif efficace ou seuil fixe ; FDR / Bonferroni, SV.Stat), asymPaint (carte signée des paires retenues).          */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).pvc = factory;
})(function (SV) {
  'use strict';
  const BG = -1, WM = 200, CSF = 201;
  const ap = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]];
  function inv4(m) {   // inverse d'une matrice affine 4×4 (ligne par ligne)
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; if (!det) throw new Error('matrice non inversible');
    const r = [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, 0, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, 0, C / det, -(a * h - b * g) / det, (a * e - b * d) / det, 0, 0, 0, 0, 1];
    const t = [m[3], m[7], m[11]]; r[3] = -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]); r[7] = -(r[4] * t[0] + r[5] * t[1] + r[6] * t[2]); r[11] = -(r[8] * t[0] + r[9] * t[1] + r[10] * t[2]); return r;
  }
  const mul4 = (A, B) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[4 * i + j] += A[4 * i + k] * B[4 * k + j]; return r; };
  /** trilinéaire (valeur réelle = data*slope+inter), NaN hors du champ */
  function sampler(vol) {
    const [nx, ny, nz] = vol.dims, D = vol.data, s = vol.slope || 1, o = vol.inter || 0, sxy = nx * ny;
    return (x, y, z) => {
      if (x < -0.5 || y < -0.5 || z < -0.5 || x > nx - 0.5 || y > ny - 0.5 || z > nz - 0.5) return NaN;
      x = Math.max(0, Math.min(nx - 1, x)); y = Math.max(0, Math.min(ny - 1, y)); z = Math.max(0, Math.min(nz - 1, z));
      const i = Math.min(nx - 2, Math.floor(x)), j = Math.min(ny - 2, Math.floor(y)), k = Math.min(nz - 2, Math.floor(z)), fx = x - i, fy = y - j, fz = z - k, b = i + nx * j + sxy * k;
      if (nx < 2 || ny < 2 || nz < 2) return D[Math.round(x) + nx * Math.round(y) + sxy * Math.round(z)] * s + o;
      const c00 = D[b] * (1 - fx) + D[b + 1] * fx, c10 = D[b + nx] * (1 - fx) + D[b + nx + 1] * fx, c01 = D[b + sxy] * (1 - fx) + D[b + sxy + 1] * fx, c11 = D[b + sxy + nx] * (1 - fx) + D[b + sxy + nx + 1] * fx;
      return ((c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz) * s + o;
    };
  }
  /** flou gaussien séparable (bords à zéro) d'un volume dims, sigma en voxels */
  function blur(src, dims, sig) { return SV.VolOps.gaussian(src, dims, sig, { border: 'zero', truncate: 3 }); }
  /** résolution d'un système linéaire dense (pivot partiel) */
  function solve(A, b, n) {
    const M = A.map((r, i) => r.slice().concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) continue; [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; if (!f) continue; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => Math.abs(r[i]) < 1e-12 ? b[i] : r[n] / r[i]);
  }

  function run(o, progress) {
    const t0 = Date.now(), P = typeof progress === 'function' ? progress : () => { }, method = o.method || 'rbv', fwhm = +o.fwhm || 6, iters = Math.max(1, Math.min(50, +o.iters || 10));
    const lab = o.lab, [lx, ly, lz] = lab.dims, LD = lab.data, lsxy = lx * ly, lpix = lab.pixdim || [1, 1, 1];
    const f = Math.max(1, Math.round((+o.res || 2) / Math.min(...lpix))), K = f * f * f;
    // boîte du cerveau (étiquettes non nulles) + marge de 3 sigmas
    let bmin = [lx, ly, lz], bmax = [-1, -1, -1];
    for (let k = 0; k < lz; k++) for (let j = 0; j < ly; j++) for (let i = 0, q = lx * j + lsxy * k; i < lx; i++, q++) if (LD[q] > 0) { if (i < bmin[0]) bmin[0] = i; if (i > bmax[0]) bmax[0] = i; if (j < bmin[1]) bmin[1] = j; if (j > bmax[1]) bmax[1] = j; if (k < bmin[2]) bmin[2] = k; if (k > bmax[2]) bmax[2] = k; }
    if (bmax[0] < 0) throw new Error('segmentation vide : calculez d’abord l’anatomie du patient');
    const sigMm = fwhm / 2.3548, marg = lpix.map(p => Math.ceil((3 * sigMm + 2 * f * p) / p));
    const i0 = [0, 1, 2].map(a => Math.max(0, bmin[a] - marg[a])), i1 = [0, 1, 2].map(a => Math.min([lx, ly, lz][a] - 1, bmax[a] + marg[a]));
    const dims = [0, 1, 2].map(a => Math.floor((i1[a] - i0[a] + 1) / f)), [nx, ny, nz] = dims, n = nx * ny * nz, sxy = nx * ny;
    const LA = Array.from(lab.affine), S = [f, 0, 0, i0[0] + (f - 1) / 2, 0, f, 0, i0[1] + (f - 1) / 2, 0, 0, f, i0[2] + (f - 1) / 2, 0, 0, 0, 1], affine = mul4(LA, S);
    const pix = [0, 1, 2].map(a => Math.hypot(affine[a], affine[4 + a], affine[8 + a])), sig = pix.map(p => sigMm / p);
    P({ fraction: 0.05, message: 'TEP rééchantillonnée sur la grille du T1' });
    // TEP sur la grille (monde du T1 → monde TEP → voxel TEP)
    const toPet = mul4(inv4(Array.from(o.pet.affine)), o.petT ? inv4(Array.from(o.petT)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), Mg = mul4(toPet, affine), smp = sampler(o.pet);
    const pet = new Float32Array(n), valid = new Uint8Array(n);
    for (let k = 0, q = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) { const v = ap(Mg, i, j, k), x = smp(v[0], v[1], v[2]); if (x === x) { pet[q] = x; valid[q] = 1; } }
    // régions : codes des étiquettes → indices ; chaque voxel de la grille porte K sous-voxels (fractions)
    const code = l => l >= 1 && l <= 162 ? (o.regions === 'tissue' ? 0 : l) : l === WM ? WM : l === CSF ? CSF : l > 0 ? (o.regions === 'tissue' ? 0 : l) : BG;
    const codes = new Map(), list = []; const idxOf = c => { let r = codes.get(c); if (r === undefined) { r = list.length; codes.set(c, r); list.push(c); } return r; };
    const sub = new Uint16Array(n * K);
    for (let k = 0, q = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) {
      let e = q * K; for (let c = 0; c < f; c++) for (let b = 0; b < f; b++) for (let a = 0; a < f; a++) { const li = i0[0] + i * f + a, lj = i0[1] + j * f + b, lk = i0[2] + k * f + c; sub[e++] = idxOf(code(LD[li + lx * lj + lsxy * lk])); }
    }
    const R = list.length, N = new Float64Array(R), obs = new Float64Array(R), bb = list.map(() => ({ min: [nx, ny, nz], max: [-1, -1, -1] }));
    for (let k = 0, q = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) for (let e = q * K, E = e + K; e < E; e++) {
      const r = sub[e], B = bb[r]; if (i < B.min[0]) B.min[0] = i; if (i > B.max[0]) B.max[0] = i; if (j < B.min[1]) B.min[1] = j; if (j > B.max[1]) B.max[1] = j; if (k < B.min[2]) B.min[2] = k; if (k > B.max[2]) B.max[2] = k;
      if (valid[q]) { N[r] += 1 / K; obs[r] += pet[q] / K; }
    }
    for (let r = 0; r < R; r++) obs[r] = N[r] ? obs[r] / N[r] : 0;
    /** matrice de transfert géométrique (GTM) : W[j][i] = part du signal de la région i (après PSF) vue dans la région j */
    const gtm = (done0, span) => {
      const W = Array.from({ length: R }, () => new Float64Array(R)), mg = sig.map(s => Math.ceil(3 * s) + 1);
      for (let r = 0; r < R; r++) {
        const B = bb[r]; if (B.max[0] < 0) continue;
        const a0 = B.min.map((v, a) => Math.max(0, v - mg[a])), a1 = B.max.map((v, a) => Math.min(dims[a] - 1, v + mg[a])), cd = [0, 1, 2].map(a => a1[a] - a0[a] + 1), cn = cd[0] * cd[1] * cd[2], c = new Float32Array(cn);
        for (let k = 0, p = 0; k < cd[2]; k++) for (let j = 0; j < cd[1]; j++) for (let i = 0; i < cd[0]; i++, p++) { const q = (a0[0] + i) + nx * (a0[1] + j) + sxy * (a0[2] + k); let m = 0; for (let e = q * K, E = e + K; e < E; e++) if (sub[e] === r) m++; c[p] = m / K; }
        const sm = blur(c, cd, sig);
        for (let k = 0, p = 0; k < cd[2]; k++) for (let j = 0; j < cd[1]; j++) for (let i = 0; i < cd[0]; i++, p++) { const s = sm[p]; if (s < 1e-7) continue; const q = (a0[0] + i) + nx * (a0[1] + j) + sxy * (a0[2] + k); if (!valid[q]) continue; for (let e = q * K, E = e + K; e < E; e++) W[sub[e]][r] += s / K; }
        if (r % 8 === 0) P({ fraction: done0 + span * r / R, message: `matrice de transfert (GTM) : ${r}/${R} régions` });
      }
      for (let j = 0; j < R; j++) if (N[j]) for (let i = 0; i < R; i++) W[j][i] /= N[j];
      const use = list.map((c, r) => N[r] > 0.5), idx = list.map((c, r) => r).filter(r => use[r]);
      const T = solve(idx.map(j => idx.map(i => W[j][i])), idx.map(j => obs[j]), idx.length), out = new Float64Array(R);
      idx.forEach((r, k) => { out[r] = T[k]; }); return out;
    };
    const synth = vals => { const s = new Float32Array(n); for (let q = 0; q < n; q++) { let v = 0; for (let e = q * K, E = e + K; e < E; e++) v += vals[sub[e]]; s[q] = v / K; } return s; };
    const yang = (vals) => { const s = synth(vals), sm = blur(s, dims, sig), out = new Float32Array(n); let mx = 0; for (let q = 0; q < n; q++) if (s[q] > mx) mx = s[q]; const eps = 1e-3 * (mx || 1); for (let q = 0; q < n; q++) out[q] = valid[q] ? (Math.abs(sm[q]) > eps ? pet[q] * s[q] / sm[q] : pet[q]) : 0; return out; };
    /** moyennes régionales d'une image corrigée : voxels « purs » (≥ 75 % de la région), sinon pondérées par la fraction */
    const means = img => {
      const m = new Float64Array(R), w = new Float64Array(R), mp = new Float64Array(R), wp = new Float64Array(R), cnt = new Uint8Array(R);
      for (let q = 0; q < n; q++) { if (!valid[q]) continue; const e0 = q * K; for (let e = e0; e < e0 + K; e++) { const r = sub[e]; m[r] += img[q] / K; w[r] += 1 / K; cnt[r]++; } for (let e = e0; e < e0 + K; e++) { const r = sub[e]; if (cnt[r]) { if (cnt[r] / K >= 0.75) { mp[r] += img[q]; wp[r]++; } cnt[r] = 0; } } }
      for (let r = 0; r < R; r++) m[r] = wp[r] >= 3 ? mp[r] / wp[r] : w[r] ? m[r] / w[r] : 0; return m;
    };
    let data, gtmVals = null;
    if (method === 'gtm' || method === 'rbv') {
      gtmVals = gtm(0.1, 0.75); P({ fraction: 0.88, message: method === 'rbv' ? 'correction voxel à voxel (Yang)' : 'image des valeurs régionales' });
      data = method === 'rbv' ? yang(gtmVals) : synth(gtmVals);
    } else if (method === 'iy') {
      let vals = obs.slice(); data = null;
      for (let it = 0; it < iters; it++) { data = yang(vals); vals = means(data); P({ fraction: 0.15 + 0.8 * (it + 1) / iters, message: `Yang itératif : ${it + 1}/${iters}` }); }
    } else if (method === 'mg') {
      // valeurs de SB, LCR, extra-cérébral : GTM sur les tissus ; image de la substance grise seule
      const isG = Uint8Array.from(list, c => c !== WM && c !== CSF && c !== BG ? 1 : 0);
      gtmVals = gtm(0.1, 0.6);
      const gmF = new Float32Array(n), rest = new Float32Array(n);
      for (let q = 0; q < n; q++) for (let e = q * K, E = e + K; e < E; e++) { const r = sub[e]; if (isG[r]) gmF[q] += 1 / K; else rest[q] += gtmVals[r] / K; }
      const sG = blur(gmF, dims, sig), sR = blur(rest, dims, sig); data = new Float32Array(n);
      for (let q = 0; q < n; q++) data[q] = valid[q] && gmF[q] > 0 && sG[q] > 0.1 ? Math.max(0, (pet[q] - sR[q]) / sG[q]) : 0;
    } else if (method === 'rl') {
      let fimg = Float32Array.from(pet, v => Math.max(0, v)); const g = Float32Array.from(pet, v => Math.max(0, v));
      for (let it = 0; it < iters; it++) {
        const c = blur(fimg, dims, sig), r = new Float32Array(n); for (let q = 0; q < n; q++) r[q] = c[q] > 1e-6 ? g[q] / c[q] : 0;
        const cr = blur(r, dims, sig); for (let q = 0; q < n; q++) fimg[q] *= cr[q];
        P({ fraction: 0.1 + 0.85 * (it + 1) / iters, message: `Richardson-Lucy : ${it + 1}/${iters}` });
      }
      for (let q = 0; q < n; q++) if (!valid[q]) fimg[q] = 0; data = fimg;
    } else throw new Error('méthode inconnue : ' + method);
    const after = means(data), table = list.map((c, r) => ({ code: c, n: +(N[r] * pix[0] * pix[1] * pix[2]).toFixed(0), obs: obs[r], pvc: method === 'gtm' ? gtmVals[r] : method === 'mg' && (c === WM || c === CSF || c === BG) ? gtmVals[r] : after[r], gtm: gtmVals ? gtmVals[r] : null })).filter(x => x.n > 0);
    P({ fraction: 1, message: 'terminé' });
    return { data, dims, affine: Float64Array.from(affine), pixdim: pix, table, method, fwhm, res: pix[0], regions: o.regions || 'vep', ms: Date.now() - t0, nRegions: R };
  }

  // ================================================================ asymétrie gauche / droite (v4.18)
  /** grille de calcul de res mm alignée sur les étiquettes, englobant le cerveau (marge de 2 voxels de grille) : code de chaque
   *  voxel = étiquette au centre de son bloc → { dims, affine (voxel de grille → monde du T1), code: Int16Array, res } */
  function labelGrid(lab, res) {
    const [lx, ly, lz] = lab.dims, LD = lab.data, lsxy = lx * ly, lpix = lab.pixdim || [1, 1, 1], f = Math.max(1, Math.round((+res || 2) / Math.min(...lpix)));
    let bmin = [lx, ly, lz], bmax = [-1, -1, -1];
    for (let k = 0; k < lz; k++) for (let j = 0; j < ly; j++) for (let i = 0, q = lx * j + lsxy * k; i < lx; i++, q++) if (LD[q] > 0) { if (i < bmin[0]) bmin[0] = i; if (i > bmax[0]) bmax[0] = i; if (j < bmin[1]) bmin[1] = j; if (j > bmax[1]) bmax[1] = j; if (k < bmin[2]) bmin[2] = k; if (k > bmax[2]) bmax[2] = k; }
    if (bmax[0] < 0) throw new Error('parcellation vide : calculez d’abord l’anatomie du patient');
    const i0 = [0, 1, 2].map(a => Math.max(0, bmin[a] - 2 * f)), i1 = [0, 1, 2].map(a => Math.min([lx, ly, lz][a] - 1, bmax[a] + 2 * f)), dims = [0, 1, 2].map(a => Math.max(1, Math.floor((i1[a] - i0[a] + 1) / f))), [nx, ny, nz] = dims;
    const S = [f, 0, 0, i0[0] + (f - 1) / 2, 0, f, 0, i0[1] + (f - 1) / 2, 0, 0, f, i0[2] + (f - 1) / 2, 0, 0, 0, 1], affine = mul4(Array.from(lab.affine), S), code = new Int16Array(nx * ny * nz), h = f >> 1;
    for (let k = 0, q = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) code[q] = LD[(i0[0] + i * f + h) + lx * (i0[1] + j * f + h) + lsxy * (i0[2] + k * f + h)];
    const vox = mul4(Array.from(lab.affine), [f, 0, 0, i0[0] + h, 0, f, 0, i0[1] + h, 0, 0, f, i0[2] + h, 0, 0, 0, 1]);   // voxel de grille → monde du voxel d'étiquette échantillonné
    return { dims, affine, vox, code, res: Math.hypot(affine[0], affine[4], affine[8]) };
  }
  /** statistiques régionales d'une image (TEP native recalée, ou image dérivée dans l'espace du T1) sur la grille des étiquettes :
   *  o { img, imgT (monde de l'image → monde du T1, ou null), lab, res } → { codes, n, mean, sd, grid } (régions 1–162 et 200–202) */
  function regionStats(o, progress) {
    const P = typeof progress === 'function' ? progress : () => { }, G = labelGrid(o.lab, o.res), [nx, ny, nz] = G.dims, smp = sampler(o.img);
    const toImg = mul4(inv4(Array.from(o.img.affine)), o.imgT ? inv4(Array.from(o.imgT)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), Mg = mul4(toImg, G.vox);   // image lue au voxel d'étiquette qui donne le code (pas de mélange avec la région voisine)
    const n = new Float64Array(256), s1 = new Float64Array(256), s2 = new Float64Array(256);
    for (let k = 0, q = 0; k < nz; k++) { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) { const c = G.code[q]; if (c <= 0 || c > 255) continue; const v = ap(Mg, i, j, k), x = smp(v[0], v[1], v[2]); if (x !== x) continue; n[c]++; s1[c] += x; s2[c] += x * x; } if (k % 16 === 0) P({ fraction: k / nz, message: 'valeurs régionales' }); }
    const codes = [], N = [], mean = [], sd = [];
    for (let c = 1; c < 256; c++) if (n[c] >= 2) { const m = s1[c] / n[c]; codes.push(c); N.push(n[c]); mean.push(m); sd.push(Math.sqrt(Math.max(0, (s2[c] - n[c] * m * m) / (n[c] - 1)))); }
    return { codes, n: N, mean, sd, grid: G };
  }

  /** asymétrie de chaque paire de régions homologues : AI = 200 (G − D) / (G + D) (%), et significativité :
   *  stat 'z' (z robuste de l'AI parmi les paires : médiane, MAD ; p bilatéral), 't' (t de Welch sur les voxels, effectif
   *  efficace n × res³ / FWHM³ : voxels corrélés par la résolution de l'image), 'abs' (|AI| ≥ o.abs %) ; correction 'fdr'
   *  (Benjamini–Hochberg), 'bonf' ou 'none' ; |AI| ≥ minAI exigé en plus. pairs [[codeG, codeD, nom]] ; o.means : moyennes
   *  imposées (valeurs régionales de la PVC) → lignes { name, cL, cR, mL, mR, ai, z | t, p, q, sig } */
  function asymTest(st, pairs, o) {
    o = Object.assign({ stat: 'z', p: 0.05, corr: 'fdr', minAI: 5, abs: 10, fwhm: 8, res: 2, means: null }, o || {}); const X = SV.Stat, at = new Map(st.codes.map((c, i) => [c, i])), rows = [];
    for (const [cL, cR, name] of pairs) {
      const a = at.get(cL), b = at.get(cR); if (a == null || b == null) continue; const mL = o.means && o.means[cL] != null ? o.means[cL] : st.mean[a], mR = o.means && o.means[cR] != null ? o.means[cR] : st.mean[b]; if (!(mL + mR > 0)) continue;
      rows.push({ name, cL, cR, nL: st.n[a], nR: st.n[b], mL, mR, sL: st.sd[a], sR: st.sd[b], ai: 200 * (mL - mR) / (mL + mR) });
    }
    if (o.stat === 'z') { const R = X.robustZ(rows.map(r => r.ai)); rows.forEach((r, i) => { r.z = R.z[i]; r.p = 2 * (1 - X.normCdf(Math.abs(r.z))); }); rows.med = R.med; rows.sd = R.sd; }
    else if (o.stat === 't') { const k = Math.pow(o.res, 3) / Math.pow(o.fwhm, 3); rows.forEach(r => { const nL = Math.max(2, r.nL * k), nR = Math.max(2, r.nR * k), w = X.welch(r.mL, r.sL * r.sL, nL, r.mR, r.sR * r.sR, nR); r.t = w.t; r.df = w.df; r.p = w.p; r.nE = [nL, nR]; }); }
    if (o.stat !== 'abs') { const q = X.adjust(rows.map(r => r.p), o.corr); rows.forEach((r, i) => { r.q = q[i]; r.sig = q[i] < o.p && Math.abs(r.ai) >= o.minAI; }); }
    else rows.forEach(r => { r.sig = Math.abs(r.ai) >= o.abs; });
    return rows;
  }
  /** carte : chaque région d'une paire significative porte son asymétrie signée (froid : moins de fixation que l'homologue,
   *  chaud : plus) ; show 'hypo' : régions hypofixantes seules → Float32Array sur la grille */
  function asymPaint(grid, rows, show) {
    const v = new Float32Array(256); for (const r of rows) if (r.sig) { v[r.cL] = r.ai; v[r.cR] = -r.ai; }
    if (show === 'hypo') for (let c = 0; c < 256; c++) if (v[c] > 0) v[c] = 0;
    const out = new Float32Array(grid.code.length); for (let q = 0; q < out.length; q++) { const c = grid.code[q]; if (c > 0 && c < 256) out[q] = v[c]; }
    return out;
  }

  // ================================================================ asymétrie voxel à voxel par réflexion (v5)
  /* Limites de l'asymétrie « par régions » (v4.18) : (1) la valeur d'une région mélange cortex, substance blanche et LCR
   * de façon différente à gauche et à droite (épaisseur, atrophie, parcellation affine qui n'est pas symétrique) ; (2) un
   * hypométabolisme focal dans une grande région est dilué ; (3) le test « z parmi les paires » n'a pas de distribution de
   * référence. Approche classique (TEP en épilepsie) : amener l'image dans un espace symétrique, comparer chaque voxel à
   * son homologue miroir, lisser largement pour absorber l'asymétrie anatomique résiduelle (recalage affine), restreindre à
   * la substance grise, puis normaliser (z robuste sur le cerveau du patient : la distribution des AI d'un cerveau sans
   * asymétrie métabolique est centrée, les foyers sont des valeurs extrêmes). Ici, sans rééchantillonner : le point
   * homologue de p (monde du T1) est p' = A⁻¹ · F · A · p avec A l'affine 12 ddl patient → gabarit symétrique (MNI305 /
   * fsaverage) et F la réflexion x → −x ; l'image est lue par interpolation au point et à son miroir. Résultat sur la
   * grille des étiquettes (espace du T1), donc directement en calque sur les coupes et retransportable en MNI pour les
   * cohortes.
   *   o = { img, imgT, lab, res, mirror (4×4 monde → monde), fwhm (mm, défaut 10), gm (true : substance grise seule),
   *         thrZ (défaut 2,5), minAI (%, défaut 5), show 'both' | 'hypo', codesGM: [codes VEP corticaux + profonds] }
   *   → { ai, z, sig (Float32Array : AI signé des voxels retenus, 0 ailleurs), grid, med, mad, nSig, rows: [{ code, name?, n,
   *       meanAI, fracSig, z }] (régions), vol: fraction du cerveau retenue } */
  function asymVoxel(o, progress) {
    const P = typeof progress === 'function' ? progress : () => { }, G = labelGrid(o.lab, o.res || 2), [nx, ny, nz] = G.dims, N = nx * ny * nz, smp = sampler(o.img), fwhm = o.fwhm || 10, thrZ = o.thrZ || 2.5, minAI = o.minAI == null ? 5 : o.minAI;
    const toImg = mul4(inv4(Array.from(o.img.affine)), o.imgT ? inv4(Array.from(o.imgT)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);   // monde du T1 → voxel de l'image
    const labInv = inv4(Array.from(o.lab.affine)), [lx, ly, lz] = o.lab.dims, LD = o.lab.data, lsxy = lx * ly;
    const codeAt = (x, y, z) => { const i = Math.round(labInv[0] * x + labInv[1] * y + labInv[2] * z + labInv[3]), j = Math.round(labInv[4] * x + labInv[5] * y + labInv[6] * z + labInv[7]), k = Math.round(labInv[8] * x + labInv[9] * y + labInv[10] * z + labInv[11]); return i < 0 || j < 0 || k < 0 || i >= lx || j >= ly || k >= lz ? 0 : LD[i + lx * j + lsxy * k]; };
    const gmSet = o.codesGM ? new Set(o.codesGM) : null, isGM = c => c > 0 && (!gmSet || gmSet.has(c)), Mr = o.mirror;
    const ai = new Float32Array(N), mask = new Uint8Array(N), gmm = new Uint8Array(N);
    for (let k = 0, q = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) {
        const c = G.code[q]; if (c <= 0 || c > 255) continue;
        const p = ap(G.vox, i, j, k), pm = [Mr[0] * p[0] + Mr[1] * p[1] + Mr[2] * p[2] + Mr[3], Mr[4] * p[0] + Mr[5] * p[1] + Mr[6] * p[2] + Mr[7], Mr[8] * p[0] + Mr[9] * p[1] + Mr[10] * p[2] + Mr[11]];
        const cm = codeAt(pm[0], pm[1], pm[2]); if (cm <= 0) continue;   // homologue hors cerveau : pas d'asymétrie mesurable
        const v = ap(toImg, p[0], p[1], p[2]), vm = ap(toImg, pm[0], pm[1], pm[2]), a = smp(v[0], v[1], v[2]), b = smp(vm[0], vm[1], vm[2]);
        if (!(a === a) || !(b === b) || !(a + b > 0)) continue;
        ai[q] = 200 * (a - b) / (a + b); mask[q] = 1; if (isGM(c) && isGM(cm)) gmm[q] = 1;
      }
      if (k % 8 === 0) P({ fraction: 0.6 * k / nz, message: 'asymétrie voxel à voxel' });
    }
    // lissage par convolution normalisée dans le masque (le dehors ne « fuit » pas dedans), sigma = FWHM / 2,355
    const sg = fwhm / 2.3548 / G.res, w = new Float32Array(N), num = new Float32Array(N); for (let q = 0; q < N; q++) { w[q] = mask[q]; num[q] = mask[q] ? ai[q] : 0; }
    const sNum = blur(num, G.dims, sg), sW = blur(w, G.dims, sg), sm = new Float32Array(N); for (let q = 0; q < N; q++) sm[q] = mask[q] && sW[q] > 0.05 ? sNum[q] / sW[q] : 0;
    P({ fraction: 0.8, message: 'statistiques' });
    // z robuste sur la substance grise (ou tout le cerveau) : médiane et MAD des |voxels| (la carte est antisymétrique : la
    // médiane vaut ≈ 0 ; l'échelle vient de la dispersion des valeurs absolues)
    const sel = o.gm === false ? mask : gmm, vals = []; for (let q = 0; q < N; q++) if (sel[q]) vals.push(sm[q]);
    vals.sort((a, b) => a - b); const med = vals.length ? vals[vals.length >> 1] : 0; const dev = vals.map(v => Math.abs(v - med)).sort((a, b) => a - b), mad = dev.length ? 1.4826 * dev[dev.length >> 1] : 1;
    const z = new Float32Array(N), sig = new Float32Array(N); let nSig = 0;
    for (let q = 0; q < N; q++) { if (!sel[q]) continue; z[q] = mad > 0 ? (sm[q] - med) / mad : 0; const keep = Math.abs(z[q]) >= thrZ && Math.abs(sm[q]) >= minAI && (o.show !== 'hypo' || sm[q] < 0 || true); if (keep) { sig[q] = sm[q]; nSig++; } }
    if (o.show === 'hypo') for (let q = 0; q < N; q++) if (sig[q] > 0) sig[q] = 0;   // hypofixation = côté de moindre fixation : AI négatif ici (G − D < 0) ou positif pour l'homologue
    // régions : moyenne de l'AI lissé et fraction de voxels retenus
    const R = new Map();
    for (let q = 0; q < N; q++) { if (!sel[q]) continue; const c = G.code[q]; let r = R.get(c); if (!r) R.set(c, r = { code: c, n: 0, s: 0, ns: 0, sz: 0 }); r.n++; r.s += sm[q]; r.sz += z[q]; if (sig[q]) r.ns++; }
    const rows = [...R.values()].filter(r => r.n >= 5).map(r => ({ code: r.code, n: r.n, meanAI: r.s / r.n, z: r.sz / r.n, fracSig: r.ns / r.n })).sort((a, b) => Math.abs(b.meanAI) - Math.abs(a.meanAI));
    P({ fraction: 1, message: 'terminé' });
    return { ai: sm, z, sig, grid: G, med, mad, nSig, nVox: vals.length, rows };
  }
  SV.PVC = { run, labelGrid, regionStats, asymTest, asymPaint, asymVoxel, inv4, mul4, METHODS: { rbv: 'RBV (GTM + Yang)', iy: 'Yang itératif', mg: 'Müller-Gärtner (substance grise)', gtm: 'GTM (valeurs régionales)', rl: 'Richardson-Lucy (sans segmentation)' } };
});
