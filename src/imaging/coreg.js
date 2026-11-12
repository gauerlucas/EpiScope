/* EpiScope — imaging/coreg.js : recalage rigide (6 ddl) multimodal dans le navigateur, sans dépendance.
 *
 *   const r = SV.Coreg.rigid(fixe, mobile, { movingKind: 'CT' }, progress);   // r.T : monde(mobile) → monde(fixe)
 *   const r = await SV.Coreg.rigidAsync(fixe, mobile, opts, onProgress);       // idem dans un worker (SV.Work)
 *   SV.Vol.resample(mobile, fixe, r.T)                                         // image mobile sur la grille fixe
 *
 * Méthode (dans l'esprit de spm_coreg et FLIRT) :
 *   - pyramide (8, 4, 2 mm par défaut) : gaussienne séparable + décimation entière par axe ; les deux images ont la même
 *     résolution effective à chaque niveau quelle que soit leur grille (CT 0,45 mm, FLAIR 1×1×3 mm, TEP 2 mm) ;
 *   - coût : information mutuelle normalisée (Studholme, (H(F)+H(M))/H(F,M)) sur un histogramme conjoint de Parzen
 *     (ordre 0 côté fixe, B-spline cubique côté mobile, Mattes 2003) ; échantillons tirés une fois par niveau dans le
 *     masque de tête fixe (positions sous-voxel aléatoires : pas d'artefact de grille), valeurs mobiles trilinéaires ;
 *     échantillons hors champ mobile ou sur le métal ignorés ;
 *   - optimiseur : Powell (directions conjuguées) + recherche linéaire de Brent sur un coût déterministe (échantillons
 *     fixes) ; sans gradient, robuste au bruit d'interpolation, ~300 évaluations par niveau ; paramètres en « mm
 *     équivalents » (rotation × 70 mm) pour que translations et rotations aient la même échelle ;
 *   - initialisation 'auto' : alignement des centres de masse des masques de tête (Otsu + remplissage depuis les bords)
 *     et de l'en-tête, puis recherche grossière de rotations (45 orientations, translations optimisées) au niveau
 *     le plus grossier ; les meilleures sont affinées en 6 ddl, la meilleure est poursuivie aux niveaux fins ;
 *   - CT : HU → [0,1] par morceaux (air, graisse, parties molles dilatées pour séparer LCR / cerveau, os) ; métal
 *     (> 2500 HU) remplacé par du parenchyme avant lissage, puis exclu là où sa fraction projetée dépasse 15 % (NaN) ;
 *     niveau final 1 mm par défaut ; TEP : résolution native ≥ 2 mm gérée par la pyramide, centre de masse sur le masque
 *     cerveau fixe s'il est fourni ;
 *   - contrôle final : coût à ±2 mm / ±1,6° de l'optimum (pic de NMI, optimum non atteint) → r.qc, r.warnings.
 * Conventions de nifti.js (volumes, matrices 4×4 par lignes, monde RAS mm). La fabrique ne dépend que de SV (Mat4) et
 * des API standard (injectée dans les workers par work.js). */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).coreg = factory;
})(function (SV) {
  'use strict';
  const M4 = () => SV.Mat4;   // résolu à l'appel : coreg.js peut être chargé avant nifti.js
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const DEG = Math.PI / 180, RHO = 70;   // 1 unité de rotation = 1 mm de déplacement à 70 mm du centre

  // ---------------------------------------------------------------- utilitaires
  /** générateur reproductible (mulberry32) */
  function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const colNorms = A => [Math.hypot(A[0], A[4], A[8]), Math.hypot(A[1], A[5], A[9]), Math.hypot(A[2], A[6], A[10])];
  function scaleCols(A, f) { const B = Float64Array.from(A); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) B[4 * r + c] *= f[c]; return B; }
  /** paramètres (mm équivalents) → paramètres de Mat4.rigid (mm, rad) */
  const qToP = q => [q[0], q[1], q[2], q[3] / RHO, q[4] / RHO, q[5] / RHO];
  /** affine 9 / 12 ddl autour de c : rigide(q[0..5]) · échelles exp(q[6..8] / RHO) · cisaillements q[9..11] / RHO (même unité :
   *  1 ≈ 1 mm de déplacement à RHO mm du centre) */
  function affM(q, c) {
    const Mt = M4(), R = Mt.rigid(qToP(q), c), sx = Math.exp(q[6] / RHO), sy = Math.exp(q[7] / RHO), sz = Math.exp(q[8] / RHO);
    const hxy = q.length > 9 ? q[9] / RHO : 0, hxz = q.length > 10 ? q[10] / RHO : 0, hyz = q.length > 11 ? q[11] / RHO : 0;
    const A = [sx, hxy, hxz, 0, sy, hyz, 0, 0, sz], S = Mt.identity();
    for (let r = 0; r < 3; r++) { for (let k = 0; k < 3; k++) S[4 * r + k] = A[3 * r + k]; S[4 * r + 3] = c[r] - (A[3 * r] * c[0] + A[3 * r + 1] * c[1] + A[3 * r + 2] * c[2]); }
    return Mt.mul(R, S);
  }
  /** quantiles d'un tableau (NaN ignorés ; filtre optionnel keep(v)) par histogramme fin */
  function hquant(d, qs, keep) {
    let lo = Infinity, hi = -Infinity, n = 0;
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (v !== v || (keep && !keep(v))) continue; if (v < lo) lo = v; if (v > hi) hi = v; n++; }
    if (!n) return qs.map(() => 0); if (!(hi > lo)) return qs.map(() => lo);
    const NB = 8192, H = new Float64Array(NB), w = (NB - 1) / (hi - lo);
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (v !== v || (keep && !keep(v))) continue; H[((v - lo) * w) | 0]++; }
    return qs.map(q => { const t = q * n; let c = 0, k = 0; for (; k < NB; k++) { c += H[k]; if (c >= t) break; } return lo + (k + 0.5) / w; });
  }
  /** seuil d'Otsu (valeurs écrêtées au 99,5e centile) */
  function otsu(d) {
    const [lo, hi] = hquant(d, [0, 0.995]); if (!(hi > lo)) return lo;
    const NB = 256, H = new Float64Array(NB), w = (NB - 1) / (hi - lo); let n = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { let v = d[i]; if (v !== v) continue; if (v > hi) v = hi; if (v < lo) v = lo; const b = ((v - lo) * w) | 0; H[b]++; n++; sum += b; }
    let wb = 0, sb = 0, best = -1, bt = 0;
    for (let t = 0; t < NB; t++) { wb += H[t]; if (!wb) continue; const wf = n - wb; if (!wf) break; sb += t * H[t]; const mb = sb / wb, mf = (sum - sb) / wf, s = wb * wf * (mb - mf) * (mb - mf); if (s > best) { best = s; bt = t; } }
    return lo + (bt + 0.5) / w;
  }
  /** interpolation trilinéaire en voxels sur un niveau (NaN hors champ ou invalide) */
  function tri(L, x, y, z) {
    const [nx, ny, nz] = L.dims; if (!(x >= 0 && y >= 0 && z >= 0 && x <= nx - 1 && y <= ny - 1 && z <= nz - 1)) return NaN;
    const ix = Math.min(nx - 2, x | 0), iy = Math.min(ny - 2, y | 0), iz = Math.min(nz - 2, z | 0), fx = x - ix, fy = y - iy, fz = z - iz, d = L.data, sxy = nx * ny, i = ix + nx * (iy + ny * iz);
    const c00 = d[i] + fx * (d[i + 1] - d[i]), c10 = d[i + nx] + fx * (d[i + nx + 1] - d[i + nx]), c01 = d[i + sxy] + fx * (d[i + sxy + 1] - d[i + sxy]), c11 = d[i + sxy + nx] + fx * (d[i + sxy + nx + 1] - d[i + sxy + nx]);
    const c0 = c00 + fy * (c10 - c00), c1 = c01 + fy * (c11 - c01); return c0 + fz * (c1 - c0);
  }

  // ---------------------------------------------------------------- intensités
  // CT : HU → [0,1] par morceaux : air, graisse, fenêtre parties molles dilatée (LCR ≈ 5, cerveau 30–40 HU séparables), os
  const CT_X = [-1000, -200, -50, 100, 300, 2000], CT_Y = [0, 0.05, 0.15, 0.55, 0.65, 1];
  function ctMap(h) {
    if (!(h > -1000)) return 0; if (h >= 2000) return 1;
    let k = 1; while (h > CT_X[k]) k++;
    return CT_Y[k - 1] + (h - CT_X[k - 1]) * (CT_Y[k] - CT_Y[k - 1]) / (CT_X[k] - CT_X[k - 1]);
  }
  /** type d'image : 'CT' | 'PET' | 'MR' (CT détecté si ≥ 2 % de valeurs < −500) */
  function kindOf(vol, kind) {
    if (kind) { const k = String(kind).toUpperCase(); return k === 'CT' ? 'CT' : (k === 'PET' || k === 'TEP' || k === 'SPECT') ? 'PET' : 'MR'; }
    return SV.Vol && SV.Vol.quantiles(vol, [0.02])[0] < -500 ? 'CT' : 'MR';
  }
  /** transformation d'intensité ; CT : métal (> metalHU) remplacé par du parenchyme (30 HU) et rendu invalide */
  function mapperOf(kind, opts) {
    if (kind === 'CT') { const metal = opts.metalHU || 2500; return { map: ctMap, invalid: h => h > metal, fill: ctMap(30) }; }
    return { map: null, invalid: null, fill: 0 };
  }

  // ---------------------------------------------------------------- pyramide (gaussienne séparable + décimation)
  function kernel(sig) {
    if (!(sig > 0.15)) return new Float32Array([1]);
    const r = Math.max(1, Math.ceil(3 * sig)), K = new Float32Array(2 * r + 1); let s = 0;
    for (let t = -r; t <= r; t++) s += (K[t + r] = Math.exp(-0.5 * t * t / (sig * sig)));
    for (let t = 0; t < K.length; t++) K[t] /= s; return K;
  }
  /** convolution + décimation (pas f) d'une ligne ; bords répétés */
  function conv1(line, n, f, K, out, o, m) {
    const r = (K.length - 1) >> 1, nk = K.length;
    for (let q = 0; q < m; q++) {
      const c = q * f; let s = 0;
      if (c - r >= 0 && c + r < n) for (let t = 0, p = c - r; t < nk; t++, p++) s += K[t] * line[p];
      else for (let t = -r; t <= r; t++) { let p = c + t; p = p < 0 ? 0 : p >= n ? n - 1 : p; s += K[t + r] * line[p]; }
      out[o + q] = s;
    }
  }
  const outLen = (n, f) => Math.floor((n - 1) / f) + 1;
  /** premier niveau depuis les données natives, plan par plan (mémoire ≈ taille du niveau de sortie, aucune copie Float32 du
   *  volume natif) : mise à l'échelle, transformation d'intensité, NaN → 0, voxels invalides (métal) remplacés par mp.fill et
   *  listés (indices natifs) ; x et y lissés / décimés dans le plan, z accumulé dans la sortie */
  function firstLevel(vol, mp, f, Ks) {
    const [nx, ny, nz] = vol.dims, d = vol.data, sl = vol.slope || 1, ic = vol.inter || 0, m = [0, 1, 2].map(a => outLen(vol.dims[a], f[a]));
    const map = mp.map, inv = mp.invalid, fill = mp.fill, [Kx, Ky, Kz] = Ks, ry = (Ky.length - 1) >> 1, rz = (Kz.length - 1) >> 1;
    // table de correspondance pour les types entiers 8/16 bits (bad : valeur brute invalide)
    let lut = null, bad = null, off = 0;
    const nl = d instanceof Uint8Array || d instanceof Int8Array ? 256 : d instanceof Uint16Array || d instanceof Int16Array ? 65536 : 0;
    if (nl) {
      off = d instanceof Int8Array ? 128 : d instanceof Int16Array ? 32768 : 0; lut = new Float32Array(nl); if (inv) bad = new Uint8Array(nl);
      for (let r = 0; r < nl; r++) { const v = (r - off) * sl + ic; if (inv && inv(v)) { bad[r] = 1; lut[r] = fill; } else lut[r] = map ? map(v) : v; }
    }
    // contributions en z : plan natif k → [(plan de sortie, poids)…] (bords répétés)
    const zc = Array.from({ length: nz }, () => []);
    for (let q = 0; q < m[2]; q++) for (let t = -rz; t <= rz; t++) { let p = q * f[2] + t; p = p < 0 ? 0 : p >= nz ? nz - 1 : p; zc[p].push(q, Kz[t + rz]); }
    const P = m[0] * m[1], out = new Float32Array(P * m[2]), line = new Float32Array(nx), px = new Float32Array(m[0] * ny), py = new Float32Array(P);
    let ML = new Int32Array(1024), nm = 0;
    const addBad = i => { if (nm === ML.length) { const g = new Int32Array(2 * nm); g.set(ML); ML = g; } ML[nm++] = i; };
    for (let k = 0; k < nz; k++) {
      const Z = zc[k]; if (!Z.length) continue;   // plan non utilisé (décimation sans lissage)
      for (let j = 0; j < ny; j++) {
        const o = nx * (j + ny * k);
        if (lut) { for (let i = 0; i < nx; i++) line[i] = lut[d[o + i] + off]; if (bad) for (let i = 0; i < nx; i++) if (bad[d[o + i] + off]) addBad(o + i); }
        else for (let i = 0; i < nx; i++) { const v = d[o + i] * sl + ic; if (v !== v) line[i] = 0; else if (inv && inv(v)) { line[i] = fill; addBad(o + i); } else line[i] = map ? map(v) : v; }
        conv1(line, nx, f[0], Kx, px, j * m[0], m[0]);
      }
      py.fill(0);
      for (let q = 0; q < m[1]; q++) { const c = q * f[1], dst = q * m[0]; for (let t = -ry; t <= ry; t++) { let p = c + t; p = p < 0 ? 0 : p >= ny ? ny - 1 : p; const w = Ky[t + ry], src = p * m[0]; for (let i = 0; i < m[0]; i++) py[dst + i] += w * px[src + i]; } }
      for (let u = 0; u < Z.length; u += 2) { const dst = Z[u] * P, w = Z[u + 1]; for (let i = 0; i < P; i++) out[dst + i] += w * py[i]; }
    }
    // plus de 3 % de voxels « métal » : échelle d'intensité probablement erronée → pas d'exclusion
    return { V: out, dims: m, metal: nm && nm < 0.03 * d.length ? ML.subarray(0, nm) : null };
  }
  /** fraction de métal au niveau (dims, facteurs F cumulés, σ cumulés en voxels natifs) : projection creuse des voxels
   *  invalides avec le noyau gaussien composé (équivaut à la convolution de l'indicatrice, sans la coûteuse passe dense) */
  function metalFraction(ML, nd, dims, F, sigN) {
    const [mx, my, mz] = dims, out = new Float32Array(mx * my * mz), W = [[], [], []], Q0 = [0, 0, 0];
    const Z = sigN.map(sg => { if (!(sg > 0.3)) return 1; let z = 0; const r = Math.ceil(3 * sg); for (let t = -r; t <= r; t++) z += Math.exp(-0.5 * t * t / (sg * sg)); return z; });
    const axisW = (a, c) => {   // poids sur les indices du niveau pour un voxel natif c
      const sg = sigN[a], w = W[a]; w.length = 0;
      if (!(sg > 0.3)) { if (c % F[a] === 0) { Q0[a] = c / F[a]; w.push(1); } else Q0[a] = 0; return; }
      const r = 3 * sg, q0 = Math.max(0, Math.ceil((c - r) / F[a])), q1 = Math.min(dims[a] - 1, Math.floor((c + r) / F[a])); Q0[a] = q0;
      for (let q = q0; q <= q1; q++) { const t = q * F[a] - c; w.push(Math.exp(-0.5 * t * t / (sg * sg)) / Z[a]); }
    };
    const nx = nd[0], ny = nd[1];
    for (let n = 0; n < ML.length; n++) {
      const p = ML[n], i = p % nx, j = ((p - i) / nx) % ny, k = (p - i - nx * j) / (nx * ny);
      axisW(0, i); axisW(1, j); axisW(2, k); const [wx, wy, wz] = W, [qx, qy, qz] = Q0;
      for (let c = 0; c < wz.length; c++) for (let b = 0; b < wy.length; b++) { const o = qx + mx * (qy + b + my * (qz + c)), w = wz[c] * wy[b]; for (let a = 0; a < wx.length; a++) out[o + a] += w * wx[a]; }
    }
    return out;
  }
  /** passage générique sur un axe (Float32) ; y et z vectorisés sur x (accès contigus) */
  function passAxis(V, dims, axis, f, K) {
    const [nx, ny, nz] = dims, r = (K.length - 1) >> 1;
    if (axis === 0) {
      const m = outLen(nx, f), L = ny * nz, out = new Float32Array(m * L);
      for (let l = 0; l < L; l++) conv1(V.subarray(l * nx, l * nx + nx), nx, f, K, out, l * m, m);
      return { V: out, dims: [m, ny, nz] };
    }
    if (axis === 1) {
      const m = outLen(ny, f), out = new Float32Array(nx * m * nz);
      for (let k = 0; k < nz; k++) for (let q = 0; q < m; q++) {
        const c = q * f, dst = nx * (q + m * k);
        for (let t = -r; t <= r; t++) { let p = c + t; p = p < 0 ? 0 : p >= ny ? ny - 1 : p; const w = K[t + r], src = nx * (p + ny * k); for (let i = 0; i < nx; i++) out[dst + i] += w * V[src + i]; }
      }
      return { V: out, dims: [nx, m, nz] };
    }
    const m = outLen(nz, f), P = nx * ny, out = new Float32Array(P * m);
    for (let q = 0; q < m; q++) {
      const c = q * f, dst = P * q;
      for (let t = -r; t <= r; t++) { let p = c + t; p = p < 0 ? 0 : p >= nz ? nz - 1 : p; const w = K[t + r], src = P * p; for (let i = 0; i < P; i++) out[dst + i] += w * V[src + i]; }
    }
    return { V: out, dims: [nx, ny, m] };
  }
  /** pyramide d'un volume : niveaux du plus grossier au plus fin ; niveau = { s, dims, vox, affine, w2v, data (Float32, NaN = invalide) }
   *  résolution effective du niveau s : σ ≈ s/2 mm (voxel natif supposé de σ = d/2), au moins fwhm/2,355 si fwhm est donné ;
   *  voxels où la fraction de métal dépasse opts.metalFrac (0,15) : NaN (ignorés par le coût) */
  function pyramid(vol, kind, levels, opts, fwhm) {
    const mp = mapperOf(kind, opts || {}), asc = levels.slice().sort((a, b) => a - b), out = [], thr = (opts && opts.metalFrac) || 0.15;
    const sMin = (fwhm || 0) / 2.3548, d0 = colNorms(vol.affine);
    let cur = null, metal = null, sg = d0.map(x => x / 2), F = [1, 1, 1];   // σ effectif (mm), facteurs cumulés
    const sAdd = [0, 0, 0];   // σ² ajoutés (mm²) depuis la grille native
    for (const s of asc) {
      const d = cur ? cur.vox : d0, n = cur ? cur.dims : vol.dims, st = Math.max(s / 2, sMin);
      const f = [0, 1, 2].map(a => { let k = Math.max(1, Math.round(s / d[a])); while (k > 1 && outLen(n[a], k) < 6) k--; return k; });
      const sig = [0, 1, 2].map(a => Math.sqrt(Math.max(0, st * st - sg[a] * sg[a])) / d[a]);
      for (let a = 0; a < 3; a++) { if (sig[a] > 0.15) sAdd[a] += (sig[a] * d[a]) ** 2; F[a] *= f[a]; }
      sg = sg.map(x => Math.max(x, st));
      let V, dims;
      if (!cur) { const r = firstLevel(vol, mp, f, sig.map(kernel)); V = r.V; dims = r.dims; metal = r.metal; }
      else { V = cur.V; dims = cur.dims; for (const a of [0, 1, 2]) if (f[a] > 1 || sig[a] > 0.15) ({ V, dims } = passAxis(V, dims, a, f[a], kernel(sig[a]))); }
      const affine = scaleCols(cur ? cur.affine : vol.affine, f);
      cur = { V, dims, vox: d.map((x, a) => x * f[a]), affine };
      let data = V;
      if (metal) {
        const fr = metalFraction(metal, vol.dims, dims, F, sAdd.map((x, a) => Math.sqrt(x) / d0[a]));
        data = Float32Array.from(V); for (let i = 0; i < data.length; i++) if (fr[i] > thr) data[i] = NaN;
      }
      out.push({ s, dims: dims.slice(), vox: cur.vox.slice(), affine, w2v: M4().inv(affine), data });
    }
    return out.reverse();
  }

  // ---------------------------------------------------------------- masques
  /** masque de tête : voxels non reliés au bord par des voxels sous le seuil (remplit crâne sombre, ventricules) */
  function headMask(L, thr) {
    const [nx, ny, nz] = L.dims, n = nx * ny * nz, d = L.data, bg = new Uint8Array(n), Q = new Int32Array(n); let h = 0, t = 0;
    const push = i => { if (!bg[i] && d[i] < thr) { bg[i] = 1; Q[t++] = i; } };   // NaN (métal) : pas du fond
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) push(i + nx * (j + ny * k));
    while (h < t) {
      const p = Q[h++], i = p % nx, j = ((p - i) / nx) % ny, k = (p - i - nx * j) / (nx * ny);
      if (i > 0) push(p - 1); if (i < nx - 1) push(p + 1); if (j > 0) push(p - nx); if (j < ny - 1) push(p + nx); if (k > 0) push(p - nx * ny); if (k < nz - 1) push(p + nx * ny);
    }
    for (let i = 0; i < n; i++) bg[i] = bg[i] ? 0 : 1;
    return bg;
  }
  /** dilatation (6-voisinage alterné 18, r itérations) */
  function dilate(m, dims, r) {
    const [nx, ny, nz] = dims, sxy = nx * ny; let a = m;
    for (let it = 0; it < r; it++) {
      const b = a.slice();
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0, p = nx * (j + ny * k); i < nx; i++, p++) {
        if (a[p]) continue;
        if ((i > 0 && a[p - 1]) || (i < nx - 1 && a[p + 1]) || (j > 0 && a[p - nx]) || (j < ny - 1 && a[p + nx]) || (k > 0 && a[p - sxy]) || (k < nz - 1 && a[p + sxy])) b[p] = 1;
        else if (it & 1 && ((i > 0 && j > 0 && a[p - 1 - nx]) || (i < nx - 1 && j < ny - 1 && a[p + 1 + nx]) || (i > 0 && j < ny - 1 && a[p - 1 + nx]) || (i < nx - 1 && j > 0 && a[p + 1 - nx]) ||
          (k > 0 && ((i > 0 && a[p - sxy - 1]) || (i < nx - 1 && a[p - sxy + 1]) || (j > 0 && a[p - sxy - nx]) || (j < ny - 1 && a[p - sxy + nx]))) ||
          (k < nz - 1 && ((i > 0 && a[p + sxy - 1]) || (i < nx - 1 && a[p + sxy + 1]) || (j > 0 && a[p + sxy - nx]) || (j < ny - 1 && a[p + sxy + nx]))))) b[p] = 1;
      }
      a = b;
    }
    return a;
  }
  /** centre de masse (monde) d'un masque sur un niveau */
  function centroid(L, m) {
    const [nx, ny] = L.dims; let sx = 0, sy = 0, sz = 0, n = 0;
    for (let p = 0; p < m.length; p++) if (m[p]) { const i = p % nx, j = ((p - i) / nx) % ny, k = (p - i - nx * j) / (nx * ny); sx += i; sy += j; sz += k; n++; }
    if (!n) return M4().apply(L.affine, (L.dims[0] - 1) / 2, (L.dims[1] - 1) / 2, (L.dims[2] - 1) / 2);
    return M4().apply(L.affine, sx / n, sy / n, sz / n);
  }
  const autoMask = L => headMask(L, 0.5 * otsu(L.data));
  /** masque d'un niveau P transporté sur la grille d'un niveau L (plus proche voisin) */
  function regrid(m, P, L) {
    const X = M4().mul(P.w2v, L.affine), [nx, ny, nz] = L.dims, [px, py, pz] = P.dims, out = new Uint8Array(nx * ny * nz); let o = 0;
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
      let x = X[1] * j + X[2] * k + X[3] + 0.5, y = X[5] * j + X[6] * k + X[7] + 0.5, z = X[9] * j + X[10] * k + X[11] + 0.5;
      for (let i = 0; i < nx; i++, o++, x += X[0], y += X[4], z += X[8]) {
        const a = Math.floor(x), b = Math.floor(y), c = Math.floor(z);
        if (a >= 0 && b >= 0 && c >= 0 && a < px && b < py && c < pz) out[o] = m[a + px * (b + py * c)];
      }
    }
    return out;
  }
  /** masques fixes par niveau { core, samp } (samp = domaine d'échantillonnage) :
   *  - masque fourni : sous-échantillonné (seuil 0,5), dilaté de opts.maskDilate mm ; niveaux < 2 mm : niveau supérieur transporté ;
   *  - sinon tête automatique, calculée une fois au niveau le plus proche de 4 mm, dilatée de 4 mm (interface tête / air incluse),
   *    transportée (plus proche voisin) sur les autres niveaux */
  /** masque fixe sous forme de Uint8Array sur la grille fixe : un masque porté par une autre grille ({ dims, affine, data },
   *  ex. segmentation 1 mm conformée) est rééchantillonné (plus proche voisin) ; un masque inutilisable (taille, vide) est
   *  abandonné au profit de la tête automatique, avec un avertissement (v4.21) */
  function maskOnFixed(fixed, mask, warnings) {
    if (!mask) return null; const n = fixed.dims[0] * fixed.dims[1] * fixed.dims[2];
    let m = mask;
    if (!(m instanceof Uint8Array) && m && m.data && m.dims && m.affine) {
      const same = m.dims.length === 3 && m.dims.every((v, k) => v === fixed.dims[k]) && Array.from(m.affine).every((v, k) => Math.abs(v - fixed.affine[k]) < 1e-3);
      if (same) m = m.data instanceof Uint8Array ? m.data : Uint8Array.from(m.data, v => v ? 1 : 0);
      else { const r = SV.Vol.resample({ dims: m.dims, affine: Float64Array.from(m.affine), data: m.data, slope: 1, inter: 0 }, fixed, null, 'nearest', Uint8Array); m = r.data; for (let i = 0; i < m.length; i++) m[i] = m[i] ? 1 : 0; }
    } else if (m && !(m instanceof Uint8Array) && m.length === n) m = Uint8Array.from(m, v => v ? 1 : 0);
    if (!(m instanceof Uint8Array) || m.length !== n) { if (warnings) warnings.push(`masque fixe inutilisable (${m && m.length != null ? m.length : '?'} voxels pour ${n}) : tête automatique`); return null; }
    let c = 0; for (let i = 0; i < m.length; i += 7) if (m[i]) c++;
    if (c * 7 < Math.min(2000, 0.02 * n)) { if (warnings) warnings.push('masque fixe presque vide : tête automatique'); return null; }
    return m;
  }
  function fixedMasks(fixed, PF, mask, levels, opts) {
    const out = new Array(PF.length);
    if (mask) {
      const n = fixed.dims[0] * fixed.dims[1] * fixed.dims[2]; if (mask.length !== n) throw new Error('fixedMask : ' + mask.length + ' voxels, volume fixe : ' + n);
      const mv = { dims: fixed.dims, affine: fixed.affine, data: mask, slope: 1, inter: 0 };
      const PK = pyramid(mv, 'MR', levels, {});
      PF.forEach((L, l) => {
        if (l > 0 && L.s < 2) { const P = PF[l - 1], o = out[l - 1]; out[l] = { core: regrid(o.core, P, L), samp: regrid(o.samp, P, L) }; return; }
        const b = new Uint8Array(PK[l].data.length); for (let i = 0; i < b.length; i++) b[i] = PK[l].data[i] >= 0.5 ? 1 : 0;
        const r = Math.round((opts.maskDilate || 0) / L.s); out[l] = { core: b, samp: r > 0 ? dilate(b, L.dims, r) : b };
      });
      return out;
    }
    let b = 0; PF.forEach((L, l) => { if (Math.abs(Math.log(L.s / 4)) < Math.abs(Math.log(PF[b].s / 4))) b = l; });
    const B = PF[b], core = autoMask(B), samp = dilate(core, B.dims, Math.max(1, Math.round(4 / B.s)));
    PF.forEach((L, l) => { out[l] = l === b ? { core, samp } : { core: regrid(core, B, L), samp: regrid(samp, B, L) }; });
    return out;
  }

  // ---------------------------------------------------------------- échantillons et coût
  /** échantillons fixes : positions monde (aléatoires sous-voxel si jitter) dans le masque, valeurs fixes trilinéaires */
  function makeSamples(F, mask, nWanted, rnd, jitter) {
    let nm = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) nm++;
    const k = jitter ? Math.max(1, Math.ceil(nWanted / Math.max(1, nm))) : 1, p = Math.min(1, nWanted / Math.max(1, nm * k));
    const cap = Math.ceil(nm * k * p * 1.2) + 64, pos = new Float64Array(3 * cap), val = new Float32Array(cap), A = F.affine;
    const [nx, ny, nz] = F.dims; let n = 0;
    for (let z = 0, idx = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, idx++) {
      if (!mask[idx]) continue;
      for (let r = 0; r < k; r++) {
        if (p < 1 && rnd() >= p) continue; if (n >= cap) break;
        let u = x, v = y, w = z;
        if (jitter) { u = Math.min(nx - 1, Math.max(0, x + rnd() - 0.5)); v = Math.min(ny - 1, Math.max(0, y + rnd() - 0.5)); w = Math.min(nz - 1, Math.max(0, z + rnd() - 0.5)); }
        const f = jitter ? tri(F, u, v, w) : F.data[idx]; if (f !== f) continue;
        pos[3 * n] = A[0] * u + A[1] * v + A[2] * w + A[3]; pos[3 * n + 1] = A[4] * u + A[5] * v + A[6] * w + A[7]; pos[3 * n + 2] = A[8] * u + A[9] * v + A[10] * w + A[11];
        val[n++] = f;
      }
    }
    return { n, pos: pos.subarray(0, 3 * n), val: val.subarray(0, n) };
  }
  /** fonction de coût −NMI (ou −MI) : U = monde fixe → voxel mobile (4×4) ; out reçoit { nmi, mi, frac } */
  function makeCost(S, Mv, nb, lof, hif, lom, him, metric, minFrac) {
    const nbm = nb + 3, H = new Float64Array(nb * nbm), pf = new Float64Array(nb), pm = new Float64Array(nbm), n = S.n, P = S.pos;
    const R = new Int32Array(n), wf = nb / (hif - lof);
    for (let s = 0; s < n; s++) { let b = Math.floor((S.val[s] - lof) * wf); b = b < 0 ? 0 : b >= nb ? nb - 1 : b; R[s] = b * nbm; }
    const [nx, ny, nz] = Mv.dims, d = Mv.data, sxy = nx * ny, xm = nx - 1, ym = ny - 1, zm = nz - 1, sc = (nb - 1) / (him - lom), useMI = metric === 'mi';
    let evals = 0;
    const fn = function (U, out) {
      evals++; H.fill(0); let nv = 0;
      const a0 = U[0], a1 = U[1], a2 = U[2], a3 = U[3], a4 = U[4], a5 = U[5], a6 = U[6], a7 = U[7], a8 = U[8], a9 = U[9], a10 = U[10], a11 = U[11];
      for (let s = 0, p = 0; s < n; s++, p += 3) {
        const X = P[p], Y = P[p + 1], Z = P[p + 2];
        const x = a0 * X + a1 * Y + a2 * Z + a3; if (!(x >= 0 && x < xm)) continue;
        const y = a4 * X + a5 * Y + a6 * Z + a7; if (!(y >= 0 && y < ym)) continue;
        const z = a8 * X + a9 * Y + a10 * Z + a11; if (!(z >= 0 && z < zm)) continue;
        const ix = x | 0, iy = y | 0, iz = z | 0, fx = x - ix, fy = y - iy, fz = z - iz, i = ix + nx * (iy + ny * iz);
        const d0 = d[i], d1 = d[i + nx], d2 = d[i + sxy], d3 = d[i + sxy + nx];
        const c00 = d0 + fx * (d[i + 1] - d0), c10 = d1 + fx * (d[i + nx + 1] - d1), c01 = d2 + fx * (d[i + sxy + 1] - d2), c11 = d3 + fx * (d[i + sxy + nx + 1] - d3);
        const c0 = c00 + fy * (c10 - c00), v = c0 + fz * (c01 + fy * (c11 - c01) - c0);
        if (v !== v) continue;
        let t = (v - lom) * sc + 1; if (t < 1) t = 1; else if (t > nb) t = nb;
        const t0 = t | 0, u = t - t0, u2 = u * u, u3 = u2 * u, o = R[s] + t0 - 1;
        H[o] += (1 - 3 * u + 3 * u2 - u3) / 6; H[o + 1] += (4 - 6 * u2 + 3 * u3) / 6; H[o + 2] += (1 + 3 * u + 3 * u2 - 3 * u3) / 6; H[o + 3] += u3 / 6;
        nv++;
      }
      const frac = n ? nv / n : 0;
      if (nv < 64 || frac < minFrac) { if (out) { out.nmi = 1; out.mi = 0; out.frac = frac; } return 0; }   // recouvrement insuffisant : pire coût
      pm.fill(0); let sj = 0, sf = 0, sm = 0;
      for (let a = 0, ro = 0; a < nb; a++, ro += nbm) {
        let rs = 0;
        for (let b = 0; b < nbm; b++) { const h = H[ro + b]; if (h > 0) { sj += h * Math.log(h); rs += h; pm[b] += h; } }
        pf[a] = rs; if (rs > 0) sf += rs * Math.log(rs);
      }
      for (let b = 0; b < nbm; b++) if (pm[b] > 0) sm += pm[b] * Math.log(pm[b]);
      const lN = Math.log(nv), Hj = lN - sj / nv, Hf = lN - sf / nv, Hm = lN - sm / nv, nmi = (Hf + Hm) / Hj, mi = Hf + Hm - Hj;
      if (out) { out.nmi = nmi; out.mi = mi; out.frac = frac; }
      return useMI ? -mi : -nmi;
    };
    fn.evals = () => evals;
    return fn;
  }

  // ---------------------------------------------------------------- optimisation (Powell + Brent)
  /** Brent sur [min(ax,cx), max(ax,cx)], minimum provisoire bx (f = fbx) ; tol absolue */
  function brent(g, ax, bx, cx, fbx, tol, maxIt) {
    const CG = 0.3819660; let a = Math.min(ax, cx), b = Math.max(ax, cx), x = bx, w = bx, v = bx, fx = fbx, fw = fbx, fv = fbx, d = 0, e = 0;
    for (let it = 0; it < maxIt; it++) {
      const xm = 0.5 * (a + b), tol1 = tol, tol2 = 2 * tol1;
      if (Math.abs(x - xm) <= tol2 - 0.5 * (b - a)) break;
      if (Math.abs(e) > tol1) {
        const r = (x - w) * (fx - fv); let q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r; q = 2 * (q - r); if (q > 0) p = -p; q = Math.abs(q);
        const et = e; e = d;
        if (Math.abs(p) >= Math.abs(0.5 * q * et) || p <= q * (a - x) || p >= q * (b - x)) { e = x >= xm ? a - x : b - x; d = CG * e; }
        else { d = p / q; const u = x + d; if (u - a < tol2 || b - u < tol2) d = xm - x >= 0 ? tol1 : -tol1; }
      } else { e = x >= xm ? a - x : b - x; d = CG * e; }
      const u = Math.abs(d) >= tol1 ? x + d : x + (d >= 0 ? tol1 : -tol1), fu = g(u);
      if (fu <= fx) { if (u >= x) a = x; else b = x; v = w; w = x; x = u; fv = fw; fw = fx; fx = fu; }
      else { if (u < x) a = u; else b = u; if (fu <= fw || w === x) { v = w; w = u; fv = fw; fw = fu; } else if (fu <= fv || v === x || v === w) { v = u; fv = fu; } }
    }
    return { x, f: fx };
  }
  /** minimisation de f le long de q + α·dir : encadrement (pas initial o.step, |α| ≤ o.hmax) puis Brent */
  function lineMin(f, q, dir, f0, o) {
    const n = q.length, tmp = new Float64Array(n);
    const g = a => { for (let i = 0; i < n; i++) tmp[i] = q[i] + a * dir[i]; return f(tmp); };
    const done = (a, fa) => { const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = q[i] + a * dir[i]; return { q: r, f: fa, a }; };
    let a = 0, fa = f0, b = o.step, fb = g(b), c, fc;
    if (fb > fa) {
      c = -o.step; fc = g(c);
      if (fc >= fa) { const r = brent(g, c, 0, b, f0, o.tol, o.brentIt || 24); return done(r.x, r.f); }
      b = c; fb = fc;
    }
    for (;;) {
      c = b + 1.618034 * (b - a);
      if (Math.abs(c) >= o.hmax) { c = Math.sign(c) * o.hmax; if (Math.abs(b) >= o.hmax - 1e-9) return done(b, fb); fc = g(c); if (fc < fb) return done(c, fc); break; }
      fc = g(c); if (fc >= fb) break;
      a = b; fa = fb; b = c; fb = fc;
    }
    const r = brent(g, a, b, c, fb, o.tol, o.brentIt || 24);
    return done(r.x, r.f);
  }
  /** méthode de Powell (Numerical Recipes, remplacement de la direction de plus forte baisse) ; dirs : directions initiales */
  function powell(f, q0, dirs, o) {
    let q = Float64Array.from(q0), fq = f(q); const xi = dirs.map(d => Float64Array.from(d)), n = q.length; let it = 0;
    for (; it < o.maxIter; it++) {
      const qs = q.slice(), fs = fq; let big = 0, del = 0;
      for (let i = 0; i < xi.length; i++) { const r = lineMin(f, q, xi[i], fq, o); if (fq - r.f > del) { del = fq - r.f; big = i; } q = r.q; fq = r.f; }
      const dq = new Float64Array(n); let mv = 0; for (let i = 0; i < n; i++) { dq[i] = q[i] - qs[i]; mv += dq[i] * dq[i]; } mv = Math.sqrt(mv);
      if (mv < o.xtol || fs - fq < (o.ftol || 0)) { it++; break; }
      if (xi.length < 2) continue;
      const qe = new Float64Array(n); for (let i = 0; i < n; i++) qe[i] = q[i] + dq[i]; const fe = f(qe);
      if (fe < fs) {
        const t = 2 * (fs - 2 * fq + fe) * (fs - fq - del) ** 2 - del * (fs - fe) ** 2;
        if (t < 0) { for (let i = 0; i < n; i++) dq[i] /= mv; const r = lineMin(f, q, dq, fq, o); q = r.q; fq = r.f; xi[big] = xi[xi.length - 1]; xi[xi.length - 1] = dq; }
      }
    }
    return { q, f: fq, iter: it };
  }
  const unitDirs = (n, idx) => idx.map(k => { const d = new Float64Array(n); d[k] = 1; return d; });

  // ---------------------------------------------------------------- recalage rigide
  /** écart maximal (mm) entre deux transformations sur une sphère de rayon r autour de c */
  function tdist(A, B, c, r) {
    let m = 0; const Mt = M4();
    for (const [dx, dy, dz] of [[0, 0, 0], [r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]]) {
      const a = Mt.apply(A, c[0] + dx, c[1] + dy, c[2] + dz), b = Mt.apply(B, c[0] + dx, c[1] + dy, c[2] + dz); m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
    return m;
  }
  function defaultSamples(s, finest, nFinest) { return Math.round(s >= 6 ? Math.min(nFinest, 12000) : s > finest ? Math.min(nFinest, 30000) : nFinest); }

  /** recalage rigide 6 ddl de `moving` sur `fixed` (volumes nifti.js) ; progress({ phase, frac, level, cost }).
   *  opts : movingKind / fixedKind ('T1'|'T2'|'FLAIR'|'MRI'|'PET'|'CT' ; CT détecté automatiquement, défaut fixe : IRM),
   *         fixedMask (Uint8Array sur la grille fixe ; défaut : tête automatique), maskDilate (mm, avec fixedMask),
   *         init ('auto' | 'com' | 'header' | matrice 16 monde mobile → monde fixe : pas de recherche), search (bool),
   *         searchAngles ([[rx…], [ry…], [rz…]] °, défaut [±20, ±10, 0] × [±10, 0] × [±10, 0]), searchKeep (4),
   *         levels (mm ; [8,4,2], CT [8,4,2,1]), bins (48 ; 32 au niveau ≥ 6 mm), samples (niveau final, 60000), samplesPerLevel,
   *         maxIter (8, par niveau), metric ('nmi' | 'mi'), seed, metalHU (2500), metalFrac (0,15), minOverlap (0,1),
   *         fixedFWHM / movingFWHM (lissage minimal imposé, mm ; défaut 0), retry (true : recherche large si contrôle faible),
   *         minPeak (seuil de qc.rel : 0,06 ; TEP 0,045), dof (6 ; 9 ou 12 : affine affinée après le rigide, v4.19)
   *  → { T (Float64Array 16, monde mobile → monde fixe), params ([tx,ty,tz mm, rx,ry,rz rad] : T = Mat4.rigid(params, center)),
   *      center, cost (−NMI au niveau final), nmi, overlap, qc { peak, rel, better }, warnings [], quality (= quality(fixed, moving, T)),
   *      ms, msPyramid, evals,
   *      init { method, angles, retry, T0 }, kinds, history } */
  function rigid(fixed, moving, opts, progress) {
    const t0 = now(), Mt = M4(); opts = opts || {}; const prog = typeof progress === 'function' ? progress : () => {};
    for (const v of [fixed, moving]) if (!v || !v.dims || v.dims.some(n => n < 3)) throw new Error('coregistration : volume 3D requis (≥ 3 voxels par axe)');
    const kf = kindOf(fixed, opts.fixedKind), km = kindOf(moving, opts.movingKind), history = [];
    // CT : niveau final 1 mm (os fin, électrodes ; ≈ ×4 plus précis que 2 mm en simulation)
    const levels = (opts.levels || (km === 'CT' ? [8, 4, 2, 1] : [8, 4, 2])).slice().sort((a, b) => b - a), finest = levels[levels.length - 1];
    const nb = Math.max(16, Math.min(128, opts.bins || 48)), metric = opts.metric === 'mi' ? 'mi' : 'nmi', rnd = rng(opts.seed || 12345);
    const minFrac = opts.minOverlap == null ? 0.1 : opts.minOverlap, nFinest = opts.samples || 60000;
    const say = (o) => { try { prog(o); } catch (e) { /* rien */ } };
    say({ phase: 'pyramid', frac: 0 });
    const PF = pyramid(fixed, kf, levels, opts, opts.fixedFWHM), PM = pyramid(moving, km, levels, opts, opts.movingFWHM);
    const maskWarn = []; opts = Object.assign({}, opts, { fixedMask: maskOnFixed(fixed, opts.fixedMask, maskWarn) });
    const MK = fixedMasks(fixed, PF, opts.fixedMask, levels, opts);
    const tPyr = now() - t0;
    // centres de masse : fixe (tête auto, ou masque fourni pour la TEP), mobile (tête auto)
    const L0 = PF[0], M0 = PM[0];
    const cF = centroid(L0, km === 'PET' && opts.fixedMask ? MK[0].core : (opts.fixedMask ? autoMask(L0) : MK[0].core));
    const cM = centroid(M0, autoMask(M0));
    const c = cF;   // centre de rotation

    // contexte de coût par niveau (échantillons tirés à la demande)
    const ctx = PF.map((F, l) => {
      let S = null, cost = null;
      return {
        s: F.s, get cost() {
          if (cost) return cost;
          const n = opts.samplesPerLevel ? opts.samplesPerLevel[l] : defaultSamples(F.s, finest, nFinest);
          S = makeSamples(F, MK[l].samp, n, rnd, true);
          const [lof, hif] = hquant(S.val, [0.002, 0.998]), Mv = PM[l], thr = 0.5 * otsu(Mv.data);
          const lom = hquant(Mv.data, [0.002])[0], him = hquant(Mv.data, [0.998], v => v >= thr)[0];
          return (cost = makeCost(S, Mv, F.s >= 6 ? Math.min(nb, 32) : nb, lof, hif > lof ? hif : lof + 1, lom, him > lom ? him : lom + 1, metric, minFrac));
        }, get n() { return S ? S.n : 0; },
      };
    });
    const Tof = (q, base) => Mt.mul(Mt.rigid(qToP(q), c), base);
    const objective = (l, base) => { const cf = ctx[l].cost, w2v = PM[l].w2v; return q => cf(Mt.mul(w2v, Mt.inv(Tof(q, base)))); };
    const zero6 = new Float64Array(6);

    // ---- recherche grossière : orientations × bases, translations optimisées, meilleures affinées en 6 ddl (niveau 0)
    const s0 = PF[0].s;
    function search(bases, ang, tag) {
      const cands = [], nTot = bases.length * ang[0].length * ang[1].length * ang[2].length; let k = 0;
      for (const [name, B] of bases) for (const rx of ang[0]) for (const ry of ang[1]) for (const rz of ang[2]) {
        const base = Mt.mul(Mt.rigid([0, 0, 0, rx * DEG, ry * DEG, rz * DEG], c), B);
        const r = powell(objective(0, base), zero6, unitDirs(6, [0, 1, 2]), { step: s0, hmax: 60, tol: 0.5, xtol: 1, maxIter: 2, brentIt: 10 });
        cands.push({ name, ang: [rx, ry, rz], T: Tof(r.q, base), f: r.f });
        if (++k % 9 === 0) say({ phase: tag, frac: k / nTot, cost: r.f });
      }
      cands.sort((a, b) => a.f - b.f);
      const top = []; for (const cd of cands) { if (top.length >= (opts.searchKeep || 4)) break; if (top.every(t => tdist(t.T, cd.T, c, RHO) > 6)) top.push(cd); }
      let best = null;
      for (const cd of top) {
        const r = powell(objective(0, cd.T), zero6, unitDirs(6, [0, 1, 2, 3, 4, 5]), { step: s0 / 2, hmax: 4 * s0, tol: 0.03 * s0, xtol: 0.1 * s0, maxIter: opts.maxIter || 8 });
        history.push({ phase: tag, level: s0, base: cd.name, angles: cd.ang, cost0: cd.f, cost: r.f, iter: r.iter });
        if (!best || r.f < best.f) best = { f: r.f, T: Tof(r.q, cd.T), cd };
      }
      return { T: best.T, init: { method: best.cd.name, angles: best.cd.ang, candidates: cands.length } };
    }
    // ---- niveaux grossier → fin (à partir de `from`)
    function refine(T, from) {
      for (let l = from; l < levels.length; l++) {
        const s = PF[l].s, tl = now(), cf = ctx[l].cost, e0 = cf.evals();
        const r = powell(objective(l, T), zero6, unitDirs(6, [0, 1, 2, 3, 4, 5]), { step: Math.max(0.5, s / 2), hmax: 4 * s, tol: 0.02 * s, xtol: 0.05 * s, maxIter: opts.maxIter || 8 });
        T = Tof(r.q, T);
        history.push({ phase: 'level', level: s, cost: r.f, iter: r.iter, evals: cf.evals() - e0, samples: ctx[l].n, ms: Math.round(now() - tl) });
        say({ phase: 'levels', level: s, frac: (l + 1) / levels.length, cost: r.f });
      }
      return T;
    }
    // ---- contrôle : coût au voisinage de l'optimum (±2 mm, ±1,6°) au niveau final ; peak : baisse moyenne de NMI,
    //      rel = peak / (NMI − 1) (≈ 0,15–0,5 si réussi, < 0,05 sur un minimum local en simulation), better : directions meilleures
    const lf = levels.length - 1;
    function check(T) {
      const out = {}, fo = objective(lf, T), f = ctx[lf].cost(Mt.mul(PM[lf].w2v, Mt.inv(T)), out), q = new Float64Array(6); let peak = 0, better = 0;
      for (let k = 0; k < 6; k++) for (const sg of [-2, 2]) { q.fill(0); q[k] = sg; const fk = fo(q); peak += (fk - f) / 12; if (fk < f - 1e-9) better++; }
      return { f, nmi: out.nmi, frac: out.frac, peak, better, rel: peak / Math.max(1e-9, out.nmi - 1) };
    }
    const REL = opts.minPeak || (km === 'PET' ? 0.045 : 0.06), weak = k => k.rel < REL || k.better > 0;   // TEP : pic plus large (0,08–0,09 réussi, 0,02–0,03 échec)

    let T, init, Q;
    if (opts.init && opts.init.length === 16) { init = { method: 'given' }; T = refine(Mt.from(opts.init), 0); Q = check(T); }
    else {
      const comT = Mt.identity(); comT[3] = cF[0] - cM[0]; comT[7] = cF[1] - cM[1]; comT[11] = cF[2] - cM[2];
      const mode = opts.init === 'header' ? 'header' : opts.init === 'com' ? 'com' : 'auto';
      const bases = mode === 'header' ? [['header', Mt.identity()]] : [['com', comT]];
      if (mode === 'auto' && Math.hypot(comT[3], comT[7], comT[11]) > 10) bases.push(['header', Mt.identity()]);
      const doSearch = opts.search != null ? !!opts.search : mode === 'auto';
      if (doSearch) { const r = search(bases, opts.searchAngles || [[-20, -10, 0, 10, 20], [-10, 0, 10], [-10, 0, 10]], 'search'); init = r.init; T = refine(r.T, 1); }
      else { init = { method: bases[0][0] }; T = refine(bases[0][1], 0); }
      Q = check(T);
      // reprise : pic faible ou optimum non atteint → recherche large (±40°, pas de 20°), on garde le meilleur coût final
      if (mode === 'auto' && opts.retry !== false && weak(Q)) {
        const A = [-40, -20, 0, 20, 40], r = search(bases, [A, A, A], 'retry'), T2 = refine(r.T, 1), Q2 = check(T2);
        history.push({ phase: 'retry', cost: Q2.f, previous: Q.f, rel: Q2.rel, previousRel: Q.rel });
        if (Q2.f < Q.f) { T = T2; Q = Q2; init = r.init; init.retry = 'adopted'; } else init.retry = 'rejected';
      }
      init.T0 = Mt.toArray(bases[0][1]);
    }
    // ---- affine (opts.dof 9 : + échelles ; 12 : + cisaillements) : niveaux grossier → fin à partir du rigide (gabarit → patient,
    //      enfants : taille et proportions du cerveau différentes de l'adulte)
    const dof = opts.dof >= 12 ? 12 : opts.dof >= 9 ? 9 : 6;
    if (dof > 6) {
      const zq = new Float64Array(dof), dirs = unitDirs(dof, Array.from({ length: dof }, (_, k) => k));
      for (let l = 0; l < levels.length; l++) {
        const s = PF[l].s, cf = ctx[l].cost, w2v = PM[l].w2v, base = T, obj = q => cf(Mt.mul(w2v, Mt.inv(Mt.mul(affM(q, c), base))));
        const r = powell(obj, zq, dirs, { step: Math.max(0.5, s / 2), hmax: 6 * s, tol: 0.02 * s, xtol: 0.05 * s, maxIter: opts.maxIter || 8 });
        T = Mt.mul(affM(r.q, c), base); history.push({ phase: 'affine', dof, level: s, cost: r.f, iter: r.iter });
        say({ phase: 'affine', level: s, frac: (l + 1) / levels.length, cost: r.f });
      }
      Q = check(T);
    }
    const warnings = maskWarn.slice();
    if (Q.frac < 0.3) warnings.push('recouvrement faible (' + Math.round(100 * Q.frac) + ' % des échantillons dans le champ mobile)');
    if (Q.better) warnings.push('optimum incertain : coût plus faible dans ' + Q.better + ' direction(s) à ±2 mm');
    if (Q.rel < REL) warnings.push('pic de similarité peu marqué (minimum local possible) : vérifier visuellement');
    let evals = 0; for (const x of ctx) if (x.n) evals += x.cost.evals();
    // mêmes indicateurs que quality() (NMI 32 classes, corrélation) sur le niveau le plus proche de 2 mm : inutile de rappeler quality()
    let lq = 0; PF.forEach((L, l) => { if (Math.abs(L.s - 2) < Math.abs(PF[lq].s - 2)) lq = l; });
    const quality = qualityOn(PF[lq], PM[lq], opts.fixedMask ? MK[lq].core : autoMask(PF[lq]), 32, 200000)(T);
    const dec = decompose(T, c);
    return { T, params: [dec.translation[0], dec.translation[1], dec.translation[2], dec.rotations[0] * DEG, dec.rotations[1] * DEG, dec.rotations[2] * DEG], center: c.slice(),
      cost: Q.f, nmi: Q.nmi, overlap: Q.frac, qc: { peak: Q.peak, rel: Q.rel, better: Q.better }, warnings, quality, ms: Math.round(now() - t0), msPyramid: Math.round(tPyr), evals, init, kinds: [kf, km], history, dof,
      scales: dof > 6 ? [0, 1, 2].map(k => +Math.hypot(T[k], T[4 + k], T[8 + k]).toFixed(4)) : undefined };
  }

  /** idem dans un worker (copie des volumes, l'appelant les conserve) ; repli dans le fil courant sans Worker */
  function plain(v) { return { dims: v.dims, pixdim: v.pixdim, data: v.data, slope: v.slope, inter: v.inter, affine: v.affine, datatype: v.datatype }; }
  async function rigidAsync(fixed, moving, opts, onProgress) {
    const W = SV.Work;
    if (!W || !W.available || SV._inWorker) return rigid(fixed, moving, opts, onProgress);
    const o = Object.assign({}, opts || {}); delete o.progress;
    return W.run(['nifti', 'coreg'], 'Coreg.rigid', [plain(fixed), plain(moving), o], [], onProgress);
  }

  // ---------------------------------------------------------------- points homologues
  function toPts(a) { if (a.length && typeof a[0] === 'number') { const r = []; for (let i = 0; i + 2 < a.length; i += 3) r.push([a[i], a[i + 1], a[i + 2]]); return r; } return a; }
  /** affine 12 ddl (moindres carrés pondérés) src → dst ; repli sur rigidFromPoints si mal conditionné (< 4 points, coplanaires) */
  function affineFromPoints(src, dst, w) {
    const S = toPts(src), D = toPts(dst), n = Math.min(S.length, D.length);
    if (n < 4) return rigidFromPoints(S, D, w);
    const A = new Float64Array(16), B = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
    for (let i = 0; i < n; i++) {
      const wi = w ? +w[i] : 1, x = [S[i][0], S[i][1], S[i][2], 1];
      for (let r = 0; r < 4; r++) { for (let c = 0; c < 4; c++) A[4 * r + c] += wi * x[r] * x[c]; for (let k = 0; k < 3; k++) B[k][r] += wi * x[r] * D[i][k]; }
    }
    // élimination de Gauss avec pivot partiel (3 seconds membres)
    const M = Array.from({ length: 4 }, (_, r) => [A[4 * r], A[4 * r + 1], A[4 * r + 2], A[4 * r + 3], B[0][r], B[1][r], B[2][r]]);
    let scale = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) scale = Math.max(scale, Math.abs(M[r][c]));
    for (let c = 0; c < 4; c++) {
      let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-10 * scale) return rigidFromPoints(S, D, w);
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < 4; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j < 7; j++) M[r][j] -= k * M[c][j]; }
    }
    const T = new Float64Array(16); T[15] = 1;
    for (let k = 0; k < 3; k++) for (let c = 0; c < 4; c++) T[4 * k + c] = M[c][4 + k] / M[c][c];
    return T;
  }
  /** valeurs / vecteurs propres d'une matrice symétrique (Jacobi) */
  function jacobi(A, n) {
    const a = A.slice(), V = new Float64Array(n * n); for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2; if (off < 1e-22) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]; if (Math.abs(apq) < 1e-300) continue;
        const th = (a[q * n + q] - a[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
        for (let k = 0; k < n; k++) { const akp = a[k * n + p], akq = a[k * n + q]; a[k * n + p] = cs * akp - sn * akq; a[k * n + q] = sn * akp + cs * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p * n + k], aqk = a[q * n + k]; a[p * n + k] = cs * apk - sn * aqk; a[q * n + k] = sn * apk + cs * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k * n + p], vkq = V[k * n + q]; V[k * n + p] = cs * vkp - sn * vkq; V[k * n + q] = sn * vkp + cs * vkq; }
      }
    }
    return { values: Array.from({ length: n }, (_, i) => a[i * n + i]), V };
  }
  /** rigide (Kabsch / quaternion de Horn, pondéré) src → dst : Float64Array(16), rotation propre (det = +1) */
  function rigidFromPoints(src, dst, w) {
    const S = toPts(src), D = toPts(dst), n = Math.min(S.length, D.length); let sw = 0; const cs = [0, 0, 0], cd = [0, 0, 0];
    for (let i = 0; i < n; i++) { const wi = w ? +w[i] : 1; sw += wi; for (let k = 0; k < 3; k++) { cs[k] += wi * S[i][k]; cd[k] += wi * D[i][k]; } }
    const T = M4().identity(); if (!(sw > 0)) return T;
    for (let k = 0; k < 3; k++) { cs[k] /= sw; cd[k] /= sw; }
    const H = new Float64Array(9);
    for (let i = 0; i < n; i++) { const wi = w ? +w[i] : 1; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) H[3 * a + b] += wi * (S[i][a] - cs[a]) * (D[i][b] - cd[b]); }
    const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = H;
    const N = new Float64Array([Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx, Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz, Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy, Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]);
    const { values, V } = jacobi(N, 4); let k = 0; for (let i = 1; i < 4; i++) if (values[i] > values[k]) k = i;
    const q0 = V[k], qx = V[4 + k], qy = V[8 + k], qz = V[12 + k];
    const R = [q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy), 2 * (qy * qx + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx), 2 * (qz * qx - q0 * qy), 2 * (qz * qy + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz];
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) T[4 * r + c] = R[3 * r + c]; T[4 * r + 3] = cd[r] - (R[3 * r] * cs[0] + R[3 * r + 1] * cs[1] + R[3 * r + 2] * cs[2]); }
    return T;
  }
  /** erreur résiduelle (RMS, max en mm) d'une transformation sur des paires de points */
  function residual(T, src, dst) {
    const S = toPts(src), D = toPts(dst), n = Math.min(S.length, D.length); let s = 0, m = 0;
    for (let i = 0; i < n; i++) { const p = M4().apply(T, S[i][0], S[i][1], S[i][2]), e = Math.hypot(p[0] - D[i][0], p[1] - D[i][1], p[2] - D[i][2]); s += e * e; m = Math.max(m, e); }
    return { rms: n ? Math.sqrt(s / n) : 0, max: m };
  }

  // ---------------------------------------------------------------- affichage, contrôle qualité
  /** décomposition pour affichage : translation (mm ; de la matrice, ou du centre c s'il est donné : T·c − c),
   *  rotations (°, convention Mat4.rigid R = Rz·Ry·Rx), angle total (°), écart à l'orthogonalité */
  function decompose(T, c) {
    const R = [T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]];
    const ry = Math.asin(Math.max(-1, Math.min(1, -R[6]))), rx = Math.atan2(R[7], R[8]), rz = Math.atan2(R[3], R[0]);
    const tr = (R[0] + R[4] + R[8] - 1) / 2, angle = Math.acos(Math.max(-1, Math.min(1, tr))) / DEG;
    let ortho = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { let s = 0; for (let k = 0; k < 3; k++) s += R[3 * k + a] * R[3 * k + b]; ortho = Math.max(ortho, Math.abs(s - (a === b ? 1 : 0))); }
    let t = [T[3], T[7], T[11]];
    if (c) { const p = M4().apply(T, c[0], c[1], c[2]); t = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; }
    return { translation: t, rotations: [rx / DEG, ry / DEG, rz / DEG], angle, ortho };
  }
  /** contrôle qualité réutilisable : (T) → { nmi, corr, n, overlap } sur la grille fixe à `level` mm (2 par défaut),
   *  dans `mask` (Uint8Array grille fixe) ou la tête automatique ; NMI à 32 classes (ordre 0), corrélation de Pearson */
  function qualityFn(fixed, moving, mask, opts) {
    opts = opts || {}; const s = opts.level || 2;
    const kf = kindOf(fixed, opts.fixedKind), km = kindOf(moving, opts.movingKind);
    const F = pyramid(fixed, kf, [s], opts)[0], Mv = pyramid(moving, km, [s], opts)[0];
    const mk = maskOnFixed(fixed, mask, null);
    return qualityOn(F, Mv, mk ? fixedMasks(fixed, [F], mk, [s], opts)[0].core : autoMask(F), opts.bins || 32, opts.samples || 200000);
  }
  /** idem sur des niveaux déjà construits (F fixe, Mv mobile, msk sur la grille de F) */
  function qualityOn(F, Mv, msk, nb, nS) {
    const S = makeSamples(F, msk, nS, rng(7), false);
    const [lof, hif] = hquant(S.val, [0.002, 0.998]), thr = 0.5 * otsu(Mv.data), lom = hquant(Mv.data, [0.002])[0], him = hquant(Mv.data, [0.998], v => v >= thr)[0];
    const H = new Float64Array(nb * nb);
    return T => {
      const U = M4().mul(Mv.w2v, M4().inv(T)); H.fill(0); let n = 0, sf = 0, sm = 0, sff = 0, smm = 0, sfm = 0;
      for (let k = 0; k < S.n; k++) {
        const X = S.pos[3 * k], Y = S.pos[3 * k + 1], Z = S.pos[3 * k + 2];
        const v = tri(Mv, U[0] * X + U[1] * Y + U[2] * Z + U[3], U[4] * X + U[5] * Y + U[6] * Z + U[7], U[8] * X + U[9] * Y + U[10] * Z + U[11]);
        if (v !== v) continue; const f = S.val[k];
        let a = Math.floor((f - lof) / (hif - lof || 1) * nb), b = Math.floor((v - lom) / (him - lom || 1) * nb); a = a < 0 ? 0 : a >= nb ? nb - 1 : a; b = b < 0 ? 0 : b >= nb ? nb - 1 : b;
        H[a * nb + b]++; n++; sf += f; sm += v; sff += f * f; smm += v * v; sfm += f * v;
      }
      if (n < 10) return { nmi: 0, corr: 0, n, overlap: S.n ? n / S.n : 0 };
      const pf = new Float64Array(nb), pm = new Float64Array(nb); let hj = 0;
      for (let a = 0; a < nb; a++) for (let b = 0; b < nb; b++) { const h = H[a * nb + b]; if (h) { hj -= h / n * Math.log(h / n); pf[a] += h; pm[b] += h; } }
      let hf = 0, hm = 0; for (let a = 0; a < nb; a++) { if (pf[a]) hf -= pf[a] / n * Math.log(pf[a] / n); if (pm[a]) hm -= pm[a] / n * Math.log(pm[a] / n); }
      const cov = sfm / n - sf / n * sm / n, corr = cov / Math.sqrt(Math.max(1e-30, (sff / n - (sf / n) ** 2) * (smm / n - (sm / n) ** 2)));
      return { nmi: hj > 0 ? (hf + hm) / hj : 0, corr, n, overlap: n / S.n };
    };
  }
  function quality(fixed, moving, T, mask, opts) { return qualityFn(fixed, moving, mask, opts)(T || M4().identity()); }

  SV.Coreg = { rigid, rigidAsync, affineFromPoints, rigidFromPoints, residual, quality, qualityFn, decompose,
    _util: { pyramid, fixedMasks, maskOnFixed, headMask, otsu, dilate, centroid, ctMap, kindOf, hquant, rng, powell, makeSamples, makeCost } };
});
