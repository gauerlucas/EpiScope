/* EpiScope — imaging/cavity.js (v2.1.0) : cavité de résection sur le T1 post-opératoire recalé, et contacts qu'elle contient.
 *
 * Méthode (différence pré / post, sans apprentissage) : dans l'espace du T1 pré-opératoire de référence, un voxel est
 * candidat s'il était du parenchyme avant l'intervention (régions VEP 1–162 ou substance blanche de la parcellation du
 * patient) et s'il a, sur le T1 post-opératoire recalé (rigide), une intensité de LCR. L'intensité est normalisée entre le
 * LCR (0) et la substance blanche (1), lus sur l'image post-opératoire : substance blanche = médiane des voxels étiquetés
 * substance blanche ; LCR = médiane des voxels du cerveau nettement plus sombres que le cortex (sous cortex − (SB − cortex)),
 * à défaut estimé par le contraste T1 habituel (cortex ≈ 0,6 entre LCR et SB). v2.4.0 : l'étiquette « LCR » de la
 * parcellation n'est plus la référence — mince et prise en volume partiel avec le cortex, sa médiane pouvait tomber au
 * niveau du cortex, qui passait alors entier sous le seuil (cavité de plusieurs centaines de ml, contacts en excès).
 * Contrôle : le cortex doit tomber entre 0,3 et 0,9 ; sinon, erreur (recalage ou séquence à vérifier). Seuil par défaut 0,3. Ouverture (1 voxel) contre les
 * liserés d'un recalage imparfait au fond des sillons, fermeture (2 voxels) qui réunit une cavité morcelée, composantes
 * 26-connexes ≥ 1 ml. La plus grande composante du côté opéré est proposée ; l'utilisateur garde ou écarte chaque
 * composante. Pour chaque région VEP : fraction emportée (voxels de la cavité / voxels de la région avant l'intervention).
 * Les réseaux appris (p. ex. Arnold et al., NeuroImage Clin 2022, entraîné sur des résections temporales) visent la même
 * cavité sur l'image post-opératoire seule ; ici la segmentation pré-opératoire du patient sert de référence, ce qui vaut
 * pour toute localisation mais demande un bon recalage. Contrôle visuel indispensable (coupes) avant de retenir les contacts.
 *   SV.Cavity.segment(o, progress) — o = { img, imgT, lab, thr, minMl, side, hemi } (worker 'cavity')
 *   SV.Cavity.select(R, keep) — masque et fractions des composantes gardées (sans recalcul)
 *   SV.Cavity.contactsIn(points, vol, tolMm) — contacts dans la cavité (tolérance : demi-longueur du contact et recalage)
 *   SV.Cavity.distances(points, vol, maxMm) — distance (mm) de chaque contact à la cavité (0 dedans, Infinity au-delà de maxMm) */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).cavity = factory;
})(function (SV) {
  'use strict';
  function inv4(m) {
    const [a, b, c, d, e, f, g, h, i, j, k, l] = m, det = a * (f * k - g * j) - b * (e * k - g * i) + c * (e * j - f * i);
    if (Math.abs(det) < 1e-12) throw new Error('matrice non inversible');
    const r = [(f * k - g * j) / det, (c * j - b * k) / det, (b * g - c * f) / det, 0, (g * i - e * k) / det, (a * k - c * i) / det, (c * e - a * g) / det, 0, (e * j - f * i) / det, (b * i - a * j) / det, (a * f - b * e) / det, 0, 0, 0, 0, 1];
    r[3] = -(r[0] * d + r[1] * h + r[2] * l); r[7] = -(r[4] * d + r[5] * h + r[6] * l); r[11] = -(r[8] * d + r[9] * h + r[10] * l); return r;
  }
  const mul4 = (A, B) => { const C = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) C[4 * r + c] += A[4 * r + k] * B[4 * k + c]; return C; };
  const ap = (M, x, y, z) => [M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]];
  /** lecture trilinéaire (0 hors du volume) */
  function sampler(v) {
    const [nx, ny, nz] = v.dims, D = v.data, s = v.slope || 1, b = v.inter || 0, sxy = nx * ny;
    return (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x > nx - 1 || y > ny - 1 || z > nz - 1) return 0;
      const i = Math.min(nx - 2, Math.floor(x)), j = Math.min(ny - 2, Math.floor(y)), k = Math.min(nz - 2, Math.floor(z)), fx = x - i, fy = y - j, fz = z - k, o = i + nx * j + sxy * k;
      const c00 = D[o] * (1 - fx) + D[o + 1] * fx, c10 = D[o + nx] * (1 - fx) + D[o + nx + 1] * fx, c01 = D[o + sxy] * (1 - fx) + D[o + sxy + 1] * fx, c11 = D[o + sxy + nx] * (1 - fx) + D[o + sxy + nx + 1] * fx;
      return ((c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz) * s + b;
    };
  }
  const median = a => { if (!a.length) return NaN; const s = Float32Array.from(a).sort(); return s[s.length >> 1]; };
  /** érosion / dilatation 6-connexe d'un pas, limitée à `allow` pour la dilatation */
  function morph(m, dims, erode, allow) {
    const [nx, ny, nz] = dims, sxy = nx * ny, out = new Uint8Array(m.length);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const o = i + nx * j + sxy * k, nb = [i > 0 ? m[o - 1] : 0, i < nx - 1 ? m[o + 1] : 0, j > 0 ? m[o - nx] : 0, j < ny - 1 ? m[o + nx] : 0, k > 0 ? m[o - sxy] : 0, k < nz - 1 ? m[o + sxy] : 0];
      out[o] = erode ? (m[o] && nb.every(Boolean) ? 1 : 0) : ((m[o] || nb.some(Boolean)) && (!allow || allow[o]) ? 1 : 0);
    }
    return out;
  }
  /** composantes 26-connexes → carte (Uint16, 1…n) et tailles */
  function components(m, dims) {
    const [nx, ny, nz] = dims, sxy = nx * ny, lab = new Uint16Array(m.length), sizes = [0], q = new Int32Array(m.length); let n = 0;
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || lab[s]) continue; if (n >= 65534) break; n++; let h = 0, t = 0; q[t++] = s; lab[s] = n; let cnt = 0;
      while (h < t) {
        const o = q[h++]; cnt++; const k = Math.floor(o / sxy), j = Math.floor((o - k * sxy) / nx), i = o - k * sxy - j * nx;
        for (let dz = -1; dz <= 1; dz++) { const kk = k + dz; if (kk < 0 || kk >= nz) continue; for (let dy = -1; dy <= 1; dy++) { const jj = j + dy; if (jj < 0 || jj >= ny) continue; for (let dx = -1; dx <= 1; dx++) { const ii = i + dx; if (ii < 0 || ii >= nx) continue; const p = ii + nx * jj + sxy * kk; if (m[p] && !lab[p]) { lab[p] = n; q[t++] = p; } } } }
      }
      sizes.push(cnt);
    }
    return { lab, sizes, n };
  }

  /** o.img, o.imgT (monde post-op → monde du T1, ou null), o.lab (parcellation VEP du patient : 1–162 régions, 200 SB,
   *  201 LCR, 202 autre ; grille du T1), o.thr (0,3), o.minMl (1), o.side ('L' | 'R' | ''), o.hemi (code → 1 gauche, 2 droite) */
  function segment(o, progress) {
    const prog = typeof progress === 'function' ? progress : () => {}, L = o.lab, [nx0, ny0, nz0] = L.dims, A = Array.from(L.affine), thr = o.thr == null ? 0.3 : +o.thr, minMl = o.minMl == null ? 1 : +o.minMl, hemi = o.hemi || [];
    // 1. boîte du cerveau dans la grille des étiquettes (marge 3 voxels)
    let lo = [nx0, ny0, nz0], hi = [-1, -1, -1];
    for (let k = 0, q = 0; k < nz0; k++) for (let j = 0; j < ny0; j++) for (let i = 0; i < nx0; i++, q++) if (L.data[q]) { if (i < lo[0]) lo[0] = i; if (j < lo[1]) lo[1] = j; if (k < lo[2]) lo[2] = k; if (i > hi[0]) hi[0] = i; if (j > hi[1]) hi[1] = j; if (k > hi[2]) hi[2] = k; }
    if (hi[0] < 0) throw new Error('parcellation du patient vide');
    lo = lo.map(v => Math.max(0, v - 3)); hi = hi.map((v, a) => Math.min([nx0, ny0, nz0][a] - 1, v + 3));
    const dims = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1], [nx, ny, nz] = dims, N = nx * ny * nz, sxy = nx * ny;
    const aff = mul4(A, [1, 0, 0, lo[0], 0, 1, 0, lo[1], 0, 0, 1, lo[2], 0, 0, 0, 1]), vox = Math.abs(A[0] * (A[5] * A[10] - A[6] * A[9]) - A[1] * (A[4] * A[10] - A[6] * A[8]) + A[2] * (A[4] * A[9] - A[5] * A[8]));
    const lab = new Uint8Array(N); for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const src = (lo[0]) + nx0 * (lo[1] + j) + nx0 * ny0 * (lo[2] + k); lab.set(L.data.subarray ? L.data.subarray(src, src + nx) : Array.prototype.slice.call(L.data, src, src + nx), nx * j + sxy * k); }
    // 2. image post-opératoire lue dans la grille
    const toImg = mul4(inv4(Array.from(o.img.affine)), mul4(o.imgT ? inv4(Array.from(o.imgT)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], aff)), smp = sampler(o.img), I = new Float32Array(N);
    for (let k = 0, q = 0; k < nz; k++) { if (k % 16 === 0) prog({ fraction: 0.4 * k / nz, message: 'lecture de l’IRM post-opératoire' }); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) { if (!lab[q]) continue; const p = ap(toImg, i, j, k); I[q] = smp(p[0], p[1], p[2]); } }
    // 3. normalisation LCR → 0, substance blanche → 1
    const wmv = [], gmv = []; for (let q = 0; q < N; q++) { const c = lab[q]; if (c === 200) wmv.push(I[q]); else if (c >= 1 && c <= 162) gmv.push(I[q]); }
    const wm = median(wmv), gm = median(gmv);
    if (!(wm > gm)) throw new Error('contraste inattendu : la substance blanche n’est pas plus claire que le cortex (T1 post-opératoire attendu, recalé)');
    const lim = gm - (wm - gm), dark = []; for (let q = 0; q < N; q++) { const c = lab[q]; if (c && c !== 202 && I[q] < lim) dark.push(I[q]); }
    const minDark = Math.ceil(2000 / vox), csf = dark.length >= minDark ? median(dark) : gm - 1.14 * (wm - gm), gmNorm = (gm - csf) / (wm - csf);
    if (!(gmNorm > 0.3 && gmNorm < 0.9)) throw new Error(`contraste inattendu : cortex à ${gmNorm.toFixed(2)} entre LCR (0) et substance blanche (1) sur l’IRM post-opératoire (0,3–0,9 attendu) — recalage ou séquence à vérifier`);
    const paren = c => (c >= 1 && c <= 162) || c === 200, cand = new Uint8Array(N), brain = new Uint8Array(N), nrm = new Float32Array(N);
    for (let q = 0; q < N; q++) { const c = lab[q]; if (!c || c === 202) continue; brain[q] = 1; const v = (I[q] - csf) / (wm - csf); nrm[q] = v; if (paren(c) && v < thr) cand[q] = 1; }
    prog({ fraction: 0.55, message: 'nettoyage du masque' });
    // 4. ouverture 1, fermeture 2 (dans le cerveau d'avant l'intervention)
    let m = morph(morph(cand, dims, true), dims, false, brain);
    m = morph(morph(morph(morph(m, dims, false, brain), dims, false, brain), dims, true), dims, true);
    for (let q = 0; q < N; q++) if (!brain[q] || !paren(lab[q])) m[q] = 0;
    // 5. composantes
    prog({ fraction: 0.75, message: 'composantes' });
    const C = components(m, dims), minVox = Math.ceil(minMl * 1000 / vox), pre = new Map(); for (let q = 0; q < N; q++) { const c = lab[q]; if (paren(c)) pre.set(c, (pre.get(c) || 0) + 1); }
    const comps = [], idx = new Int32Array(C.n + 1).fill(-1);
    for (let c = 1; c <= C.n; c++) if (C.sizes[c] >= minVox) { idx[c] = comps.length; comps.push({ id: comps.length + 1, voxels: C.sizes[c], ml: +(C.sizes[c] * vox / 1000).toFixed(2), sx: 0, sy: 0, sz: 0, L: 0, R: 0, counts: {}, nrm: 0 }); }
    const map = new Uint8Array(N);   // composante gardée (1…255) de chaque voxel
    for (let k = 0, q = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, q++) {
      const c = C.lab[q]; if (!c || idx[c] < 0) continue; const X = comps[idx[c]], cd = lab[q]; if (X.id > 255) continue; map[q] = X.id;
      X.sx += i; X.sy += j; X.sz += k; X.counts[cd] = (X.counts[cd] || 0) + 1; X.nrm += nrm[q]; if (hemi[cd] === 1) X.L++; else if (hemi[cd] === 2) X.R++;
    }
    for (const X of comps) { const p = ap(aff, X.sx / X.voxels, X.sy / X.voxels, X.sz / X.voxels); X.center = p.map(v => +v.toFixed(1)); X.hemi = X.L > 2 * X.R ? 'L' : X.R > 2 * X.L ? 'R' : ''; X.meanNorm = +(X.nrm / X.voxels).toFixed(2); delete X.sx; delete X.sy; delete X.sz; delete X.nrm; delete X.L; delete X.R; }
    comps.sort((a, b) => b.voxels - a.voxels);
    const side = comps.filter(X => !o.side || X.hemi === o.side || !X.hemi), chosen = side.length ? [side[0].id] : comps.length ? [comps[0].id] : [];
    prog({ fraction: 1, message: `${comps.length} composante${comps.length > 1 ? 's' : ''}` });
    return { dims, affine: aff, voxMm3: vox, map, comps, chosen, pre: Object.fromEntries(pre), norm: { wm, gm, csf, thr, gmNorm: +gmNorm.toFixed(2), csfFrom: dark.length >= minDark ? 'image' : 'contrast' }, nCandidates: C.n };
  }
  /** masque des composantes gardées + fractions par région VEP (sans recalcul) */
  function select(R, keep) {
    const K = new Set(keep), mask = new Uint8Array(R.map.length); let n = 0; for (let q = 0; q < mask.length; q++) if (R.map[q] && K.has(R.map[q])) { mask[q] = 1; n++; }
    const cnt = {}; for (const X of R.comps) if (K.has(X.id)) for (const c in X.counts) cnt[c] = (cnt[c] || 0) + X.counts[c];
    const regions = Object.keys(cnt).map(c => ({ code: +c, n: cnt[c], ml: +(cnt[c] * R.voxMm3 / 1000).toFixed(2), frac: R.pre[c] ? +(cnt[c] / R.pre[c]).toPrecision(3) : null })).sort((a, b) => b.n - a.n);
    return { mask, volumeMl: +(n * R.voxMm3 / 1000).toFixed(2), regions };
  }
  /** points (monde du T1) dans le masque { dims, affine, data } à tol mm près → booléens */
  function contactsIn(points, vol, tolMm) {
    const Mi = inv4(Array.from(vol.affine)), [nx, ny, nz] = vol.dims, D = vol.data, A = vol.affine, vs = Math.cbrt(Math.abs(A[0] * (A[5] * A[10] - A[6] * A[9]) - A[1] * (A[4] * A[10] - A[6] * A[8]) + A[2] * (A[4] * A[9] - A[5] * A[8]))) || 1, r = Math.ceil((tolMm == null ? 1.5 : tolMm) / vs);
    return points.map(p => {
      const v = ap(Mi, p[0], p[1], p[2]).map(Math.round);
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if ((dx * dx + dy * dy + dz * dz) * vs * vs > (tolMm == null ? 1.5 : tolMm) ** 2 + 1e-9) continue; const i = v[0] + dx, j = v[1] + dy, k = v[2] + dz;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue; if (D[i + nx * j + nx * ny * k]) return true;
      }
      return false;
    });
  }
  /** v2.4.0 : distance (mm) de chaque point (monde du T1) au masque, recherche jusqu'à maxMm (au-delà : Infinity) */
  function distances(points, vol, maxMm) {
    const Mi = inv4(Array.from(vol.affine)), [nx, ny, nz] = vol.dims, D = vol.data, A = vol.affine, vs = Math.cbrt(Math.abs(A[0] * (A[5] * A[10] - A[6] * A[9]) - A[1] * (A[4] * A[10] - A[6] * A[8]) + A[2] * (A[4] * A[9] - A[5] * A[8]))) || 1, r = Math.ceil((maxMm || 5) / vs);
    return points.map(p => {
      const v = ap(Mi, p[0], p[1], p[2]).map(Math.round); let best = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const d2 = (dx * dx + dy * dy + dz * dz) * vs * vs; if (d2 >= best * best || d2 > (maxMm || 5) ** 2 + 1e-9) continue; const i = v[0] + dx, j = v[1] + dy, k = v[2] + dz;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue; if (D[i + nx * j + nx * ny * k]) best = Math.sqrt(d2);
      }
      return best;
    });
  }
  SV.Cavity = { segment, select, contactsIn, distances, components, morph };
});
