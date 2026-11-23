/* EpiScope — imaging/warp.js (v2.1.0) : transformation non linéaire du T1 du patient vers le gabarit MNI305 (fsaverage).
 *
 * EpiScope ne recale pas les intensités : le patient et le gabarit sont segmentés par le même réseau (aparc+aseg, ~100
 * classes), et la transformation affine actuelle (imaging/anat.js) s'ajuste sur les centres de ces structures. On la
 * complète ici par une spline de plaque mince 3D régularisée (Bookstein 1989 ; noyau biharmonique U(r) = −r, terme affine
 * inclus) ajustée sur les mêmes repères, pondérés comme l'affine (√ du nombre de voxels) :
 *     min Σ wᵢ ‖yᵢ − f(xᵢ)‖² + λ J(f),  J = énergie de flexion.
 * λ est choisi par validation croisée « un exclu » (résidu exact eᵢ / (1 − Hᵢᵢ) d'un lisseur linéaire, sans refaire n
 * ajustements) sur une grille, et comparé à l'affine au même critère : si la spline ne prédit pas mieux les repères exclus,
 * l'affine est gardée. Garde-fou anatomique : déterminant jacobien relatif ≥ 0,2 sur une grille de 6 mm couvrant les
 * repères (pas de repliement) — sinon λ plus grand. Les repères aberrants (segmentation en défaut) sont écartés comme pour
 * l'affine (résidu > max(2,5 × médiane, 3 mm)).
 * Limites, à dire : correction à l'échelle des structures (quelques millimètres), pas un recalage voxel à voxel (ANTs SyN) ;
 * l'affichage 3D « gabarit » reste affine, les coordonnées MNI (exports, cohorte, requêtes) suivent la transformation retenue.
 * Chaîne : [patient → gabarit de l'âge, gabarit de l'âge → MNI305] quand un gabarit adapté à l'âge est installé.     */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).warp = factory;
})(function (SV) {
  'use strict';
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  /** A (n×n, ligne par ligne) X = B (n×m) ; pivot partiel ; A et B recopiés */
  function solve(A0, B0, n, m) {
    const A = Float64Array.from(A0), B = Float64Array.from(B0);
    for (let c = 0; c < n; c++) {
      let p = c, mx = Math.abs(A[c * n + c]); for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r * n + c]); if (v > mx) { mx = v; p = r; } }
      if (mx < 1e-12) throw new Error('système singulier (repères alignés ou en double ?)');
      if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } for (let k = 0; k < m; k++) { const t = B[c * m + k]; B[c * m + k] = B[p * m + k]; B[p * m + k] = t; } }
      const iv = 1 / A[c * n + c];
      for (let r = c + 1; r < n; r++) { const f = A[r * n + c] * iv; if (!f) continue; for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k]; for (let k = 0; k < m; k++) B[r * m + k] -= f * B[c * m + k]; }
    }
    for (let c = n - 1; c >= 0; c--) { const iv = 1 / A[c * n + c]; for (let k = 0; k < m; k++) { let s = B[c * m + k]; for (let j = c + 1; j < n; j++) s -= A[c * n + j] * B[j * m + k]; B[c * m + k] = s * iv; } }
    return B;
  }

  // ------------------------------------------------------------------ affine pondérée (moindres carrés), résidus « un exclu »
  function affineFit(src, dst, w) {
    const n = src.length, AtA = new Float64Array(16), Atb = new Float64Array(12);
    for (let i = 0; i < n; i++) { const a = [1, src[i][0], src[i][1], src[i][2]], wi = w[i]; for (let r = 0; r < 4; r++) { for (let c = 0; c < 4; c++) AtA[4 * r + c] += wi * a[r] * a[c]; for (let k = 0; k < 3; k++) Atb[3 * r + k] += wi * a[r] * dst[i][k]; } }
    const X = solve(AtA, Atb, 4, 3), inv = solve(AtA, Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), 4, 4);
    const T = [X[3], X[6], X[9], X[0], X[4], X[7], X[10], X[1], X[5], X[8], X[11], X[2], 0, 0, 0, 1];   // ligne par ligne (x' = T·[x y z 1])
    const loo = [], res = [];
    for (let i = 0; i < n; i++) {
      const a = [1, src[i][0], src[i][1], src[i][2]]; let h = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) h += a[r] * inv[4 * r + c] * a[c]; h *= w[i];
      const q = applyAffine(T, src[i]), e = dist(q, dst[i]); res.push(e); loo.push(e / Math.max(1e-6, 1 - h));
    }
    return { T, res, loo };
  }
  const applyAffine = (T, p) => [T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3], T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7], T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11]];
  /** rejet itératif des repères aberrants sur l'affine (même règle que imaging/anat.js) */
  function inliers(src, dst, w) {
    let keep = src.map(() => true);
    for (let it = 0; it < 4; it++) {
      const I = keep.map((k, i) => k ? i : -1).filter(i => i >= 0), F = affineFit(I.map(i => src[i]), I.map(i => dst[i]), I.map(i => w[i]));
      const r = src.map((p, i) => dist(applyAffine(F.T, p), dst[i])), med = I.map(i => r[i]).sort((a, b) => a - b)[I.length >> 1] || 1;
      const nk = r.map(v => v <= Math.max(2.5 * med, 3)); if (nk.every((v, i) => v === keep[i])) break; keep = nk;
    }
    return keep;
  }

  // ------------------------------------------------------------------ spline de plaque mince régularisée
  /** système [[K + λ W⁻¹, P], [Pᵀ, 0]] ; K_ij = −‖xᵢ − xⱼ‖ ; P = [1 x y z] */
  function system(src, w, lambda) {
    const n = src.length, N = n + 4, M = new Float64Array(N * N);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) M[i * N + j] = -dist(src[i], src[j]) + (i === j ? lambda / w[i] : 0);
      const a = [1, src[i][0], src[i][1], src[i][2]]; for (let c = 0; c < 4; c++) { M[i * N + n + c] = a[c]; M[(n + c) * N + i] = a[c]; }
    }
    return M;
  }
  function tpsFit(src, dst, w, lambda) {
    const n = src.length, N = n + 4, M = system(src, w, lambda), R = new Float64Array(N * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) R[i * 3 + k] = dst[i][k];
    const X = solve(M, R, N, 3), c = [], a = [];
    for (let i = 0; i < n; i++) c.push([X[i * 3], X[i * 3 + 1], X[i * 3 + 2]]); for (let r = 0; r < 4; r++) a.push([X[(n + r) * 3], X[(n + r) * 3 + 1], X[(n + r) * 3 + 2]]);
    return { kind: 'tps', pts: src.map(p => p.map(v => +v.toFixed(3))), c, a, lambda };
  }
  function tpsApply(T, p) {
    const a = T.a, o = [a[0][0] + a[1][0] * p[0] + a[2][0] * p[1] + a[3][0] * p[2], a[0][1] + a[1][1] * p[0] + a[2][1] * p[1] + a[3][1] * p[2], a[0][2] + a[1][2] * p[0] + a[2][2] * p[1] + a[3][2] * p[2]];
    for (let i = 0; i < T.pts.length; i++) { const u = -dist(p, T.pts[i]), c = T.c[i]; o[0] += c[0] * u; o[1] += c[1] * u; o[2] += c[2] * u; }
    return o;
  }
  /** résidus et résidus « un exclu » (diagonale de la matrice chapeau : colonnes de l'identité en second membre) */
  function tpsLoo(src, dst, w, lambda) {
    const n = src.length, N = n + 4, M = system(src, w, lambda), E = new Float64Array(N * n); for (let i = 0; i < n; i++) E[i * n + i] = 1;
    const C = solve(M, E, N, n), T = tpsFit(src, dst, w, lambda), res = [], loo = [];
    for (let i = 0; i < n; i++) {
      // Hᵢᵢ = Σⱼ K⁰ᵢⱼ Cⱼᵢ + Σ_c Pᵢc C₍ₙ₊c₎ᵢ (K⁰ sans le terme λ)
      let h = 0; for (let j = 0; j < n; j++) h += -dist(src[i], src[j]) * C[j * n + i]; const a = [1, src[i][0], src[i][1], src[i][2]]; for (let c = 0; c < 4; c++) h += a[c] * C[(n + c) * n + i];
      const e = dist(tpsApply(T, src[i]), dst[i]); res.push(e); loo.push(e / Math.max(1e-6, 1 - h));
    }
    return { T, res, loo };
  }
  /** plus petit déterminant jacobien relatif (à celui de l'affine) sur une grille couvrant les repères */
  function minJacobian(T, src, step) {
    step = step || 6; const lo = [0, 1, 2].map(k => Math.min(...src.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...src.map(p => p[k])));
    const a = T.a, detA = a[1][0] * (a[2][1] * a[3][2] - a[3][1] * a[2][2]) - a[2][0] * (a[1][1] * a[3][2] - a[3][1] * a[1][2]) + a[3][0] * (a[1][1] * a[2][2] - a[2][1] * a[1][2]);
    let mn = Infinity; const h = 0.5;
    for (let x = lo[0]; x <= hi[0]; x += step) for (let y = lo[1]; y <= hi[1]; y += step) for (let z = lo[2]; z <= hi[2]; z += step) {
      const J = [0, 1, 2].map(k => { const e = [0, 0, 0]; e[k] = h; const p = tpsApply(T, [x + e[0], y + e[1], z + e[2]]), m = tpsApply(T, [x - e[0], y - e[1], z - e[2]]); return [(p[0] - m[0]) / (2 * h), (p[1] - m[1]) / (2 * h), (p[2] - m[2]) / (2 * h)]; });
      const det = J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[1][0] * (J[0][1] * J[2][2] - J[0][2] * J[2][1]) + J[2][0] * (J[0][1] * J[1][2] - J[0][2] * J[1][1]);
      mn = Math.min(mn, det / detA);
    }
    return mn;
  }
  const rms = (a, w) => { let s = 0, sw = 0; a.forEach((v, i) => { s += w[i] * v * v; sw += w[i]; }); return Math.sqrt(s / Math.max(1e-12, sw)); };

  /** repères appariés { étiquette: [x, y, z, n] } (patient, monde) et (gabarit) → transformation retenue et son contrôle :
   *  { method: 'tps' | 'affine', steps: [ … ], lambda, loo: { affine, tps } (RMS mm), fitRms, n, rejected, minJac, grid } */
  function estimate(srcL, dstL, opts) {
    opts = opts || {}; const src = [], dst = [], w = [], labels = [];
    for (const l of Object.keys(srcL)) { const t = dstL[l]; if (!t) continue; src.push(srcL[l].slice(0, 3)); dst.push(t.slice(0, 3)); w.push(Math.sqrt(Math.min(srcL[l][3] || 1, t[3] || 1))); labels.push(l); }
    if (src.length < 20) throw new Error(`repères insuffisants pour une transformation non linéaire (${src.length} structures communes, 20 au moins)`);
    const mw = w.reduce((a, b) => a + b, 0) / w.length; for (let i = 0; i < w.length; i++) w[i] /= mw;
    const keep = inliers(src, dst, w), S = src.filter((_, i) => keep[i]), D = dst.filter((_, i) => keep[i]), Wt = w.filter((_, i) => keep[i]);
    const A = affineFit(S, D, Wt), looA = rms(A.loo, Wt);
    let scale = 0; for (let i = 0; i < S.length; i++) for (let j = 0; j < i; j++) scale += dist(S[i], S[j]); scale /= (S.length * (S.length - 1) / 2);
    const grid = (opts.lambdas || [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]).map(e => scale * Math.pow(10, e));
    const tried = []; let best = null;
    for (const lam of grid) {
      try { const r = tpsLoo(S, D, Wt, lam), L = rms(r.loo, Wt); tried.push({ lambda: +lam.toPrecision(4), loo: +L.toFixed(2) }); if (!best || L < best.L) best = { lam, L, r }; } catch (e) { tried.push({ lambda: +lam.toPrecision(4), error: String(e.message || e) }); }
    }
    let jac = best ? minJacobian(best.r.T, S, opts.jacStep) : null;
    // repliement : λ plus grand jusqu'à un jacobien relatif ≥ 0,2
    for (let g = best ? grid.indexOf(best.lam) + 1 : grid.length; best && jac < 0.2 && g < grid.length; g++) { const r = tpsLoo(S, D, Wt, grid[g]); best = { lam: grid[g], L: rms(r.loo, Wt), r }; jac = minJacobian(r.T, S, opts.jacStep); }
    const useTps = !!best && jac >= 0.2 && best.L < looA * (opts.gain || 0.97);
    const out = { method: useTps ? 'tps' : 'affine', n: S.length, rejected: keep.filter(k => !k).length, rejectedLabels: labels.filter((_, i) => !keep[i]),
      loo: { affine: +looA.toFixed(2), tps: best ? +best.L.toFixed(2) : null }, fitRms: { affine: +rms(A.res, Wt).toFixed(2), tps: best ? +rms(best.r.res, Wt).toFixed(2) : null },
      lambda: best ? +best.lam.toPrecision(4) : null, lambdaRel: best ? +(best.lam / scale).toPrecision(3) : null, minJac: jac == null ? null : +jac.toFixed(3), grid: tried,
      why: !best ? 'spline impossible à ajuster' : jac < 0.2 ? 'spline repliée même très régularisée : affine gardée' : useTps ? `spline retenue : erreur de prédiction des repères exclus ${best.L.toFixed(1)} mm contre ${looA.toFixed(1)} mm pour l’affine` : `la spline ne prédit pas mieux les repères exclus (${best.L.toFixed(1)} contre ${looA.toFixed(1)} mm) : affine gardée` };
    out.steps = [useTps ? best.r.T : { kind: 'affine', T: A.T.map(v => +v.toFixed(6)) }];
    return out;
  }
  function applyStep(s, p) { return s.kind === 'tps' ? tpsApply(s, p) : applyAffine(s.T, p); }
  /** applique une chaîne d'étapes (patient → gabarit de l'âge → MNI305) */
  function applyChain(steps, p) { let q = p; for (const s of steps || []) q = applyStep(s, q); return q; }
  SV.Warp = { estimate, applyChain, applyStep, tpsFit, tpsApply, tpsLoo, affineFit, applyAffine, minJacobian, inliers, solve };
});
