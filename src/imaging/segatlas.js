/* EpiScope — imaging/segatlas.js : segmentation du T1 sans réseau de neurones (« atlas », type SPM), correction du biais de
 * champ indépendante du réseau, import d'une segmentation faite ailleurs (FreeSurfer / FastSurfer, CAT12, SPM, Brainstorm).
 * EpiScope v4.19.
 *
 *  1. biasCorrect(img, brain) : champ de biais multiplicatif lisse estimé conjointement avec un mélange de 3 gaussiennes
 *     (log-intensités) dans le masque du cerveau (mindgrab), sans a priori ni prémodèle (esprit N4 / segmentation unifiée) :
 *     utilisable quand le réseau échoue à cause du biais ; intensités ramenées à « classe la plus claire = 170 » (images de
 *     référence de brainchop).
 *  2. segment(conf, brain, template, meta) : dans l'esprit de la segmentation unifiée de SPM (Ashburner & Friston 2005), sans
 *     déformation non linéaire :
 *       a. recalage affine 12 ddl (information mutuelle normalisée) du T1 moyen MNI ICBM152 2009a extrait du crâne sur le
 *          cerveau du patient ; échelle de départ = racine cubique du rapport des volumes (enfants) ;
 *       b. a priori des tissus (LCR, SG, SB, hors cerveau) du gabarit transportés chez le patient, adoucis (puissance α = 0,6,
 *          plancher 0,02 : la seule transformation affine ne superpose pas les sillons) ;
 *       c. EM sur les log-intensités (blocs de 2 mm) : 4 gaussiennes initialisées par les a priori — aucune hypothèse sur l'ordre
 *          des intensités, donc contraste inversé du nourrisson admis —, champ de biais lisse (σ 25 mm) réestimé à chaque
 *          itération ;
 *       d. probabilités a posteriori à 1 mm puis champ de Markov (Potts, ICM, β = 0,4, 2 passages) ;
 *       e. étiquettes du modèle MeshNet aparc+aseg 104 (le reste de la chaîne est inchangé) : SG → classe corticale ou profonde
 *          du gabarit à cet endroit, sinon la plus proche du même côté (≤ 16 mm) ; SB → substance blanche cérébrale ou
 *          cérébelleuse, tronc, noyaux, corps calleux selon le gabarit ; LCR → ventricule du gabarit (ou le plus proche si le
 *          gabarit voit de la SB : ventricules dilatés), sinon fond.
 *     Les frontières des tissus suivent l'image du patient ; celles des régions de Desikan sont celles du gabarit après
 *     recalage affine : approximatives (quelques millimètres).
 *  3. readMGH(u8) : volumes .mgh / .mgz de FreeSurfer ; fromImport(vols, conf, meta) : segmentation importée → classes du modèle
 *     (aparc+aseg / DKT+aseg directement ; aseg seul : cortex étiqueté par le gabarit ; carte de tissus CAT12 p0, « tissues »
 *     de Brainstorm, ou c1/c2/c3 de SPM : tissus imposés à la méthode atlas).                                                */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).segatlas = factory;
})(function (SV) {
  'use strict';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const N = 256, NN = N * N, N3 = N * N * N, G4 = 64, CELL = 4, G3 = G4 * G4 * G4;
  const LOG = new Float32Array(4096); for (let v = 0; v < 4096; v++) LOG[v] = Math.log(v + 1);
  function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

  // ---------------------------------------------------------------- champ de biais : grille de 4 mm (64³) sur le volume conformé
  const ax = new Int32Array(N), af = new Float32Array(N);
  for (let x = 0; x < N; x++) { const u = Math.min(G4 - 1.000001, Math.max(0, (x - 1.5) / CELL)); ax[x] = Math.floor(u); af[x] = u - ax[x]; }
  function fieldAt(F, i, j, k) {
    const i0 = ax[i], j0 = ax[j], k0 = ax[k], fi = af[i], fj = af[j], fk = af[k], b = i0 + G4 * (j0 + G4 * k0), dj = G4, dk = G4 * G4;
    return ((F[b] * (1 - fi) + F[b + 1] * fi) * (1 - fj) + (F[b + dj] * (1 - fi) + F[b + dj + 1] * fi) * fj) * (1 - fk) +
      ((F[b + dk] * (1 - fi) + F[b + dk + 1] * fi) * (1 - fj) + (F[b + dk + dj] * (1 - fi) + F[b + dk + dj + 1] * fi) * fj) * fk;
  }
  function blur3(A, sig) {   // gaussienne séparable sur la grille 64³, bords à zéro
    const n = G4, r = Math.ceil(3 * sig), w = new Float32Array(2 * r + 1); for (let t = -r; t <= r; t++) w[t + r] = Math.exp(-t * t / (2 * sig * sig));
    let a = A, b = new Float32Array(G3);
    for (const [st, s2, s3] of [[1, n, n * n], [n, 1, n * n], [n * n, 1, n]]) {
      b.fill(0);
      for (let q = 0; q < n; q++) for (let p = 0; p < n; p++) { const base = p * s2 + q * s3;
        for (let x = 0; x < n; x++) { let acc = 0; const lo = Math.max(0, x - r), hi = Math.min(n - 1, x + r); for (let y = lo; y <= hi; y++) acc += a[base + y * st] * w[y - x + r]; b[base + x * st] = acc; } }
      const t = a === A ? new Float32Array(G3) : a; a = b; b = t;
    }
    return a;
  }
  /** convolution normalisée : champ = lissé(Σ w·r) / lissé(Σ w), repli à 3σ loin du cerveau */
  function smoothField(R, W, sig) {
    const Rs = blur3(R, sig), Ws = blur3(W, sig), Rl = blur3(R, 3 * sig), Wl = blur3(W, 3 * sig); let wmax = 0; for (const v of Ws) if (v > wmax) wmax = v;
    const F = new Float32Array(G3); for (let b = 0; b < G3; b++) F[b] = Ws[b] > 1e-3 * wmax ? Rs[b] / Ws[b] : Wl[b] > 1e-12 ? Rl[b] / Wl[b] : 0;
    return F;
  }

  /** échantillons de 2 mm : blocs 2×2×2 dont ≥ 4 voxels sont dans le masque ; log de l'intensité moyenne */
  function samples2mm(img, mask) {
    const B = 128, vox = [], y = [], cell = [];
    for (let k = 0; k < B; k++) for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
      const o = 2 * i + N * (2 * j + N * 2 * k); let c = 0, s = 0;
      for (let d = 0; d < 8; d++) { const u = o + (d & 1) + N * ((d >> 1) & 1) + NN * (d >> 2); if (mask[u]) { c++; s += img[u]; } }
      if (c < 4) continue;
      vox.push(o); y.push(Math.log(s / c + 1)); cell.push((i >> 1) + G4 * ((j >> 1) + G4 * (k >> 1)));
    }
    return { n: vox.length, vox: Int32Array.from(vox), y: Float32Array.from(y), cell: Int32Array.from(cell) };
  }

  /** EM : mélange de K gaussiennes sur les log-intensités, a priori spatiaux facultatifs (pri : n × K, adoucis), champ de biais
   *  lisse ; opts : iters, alpha, floor, biasSigma (mm), exclude (classe sans contribution au champ : hors cerveau), init {mu, s2} */
  function em(S, K, pri, opts, say) {
    const n = S.n, y = S.y, f = new Float32Array(n), mu = new Float64Array(K), s2 = new Float64Array(K), w = new Float64Array(K).fill(1 / K);
    const alpha = opts.alpha == null ? 0.6 : opts.alpha, floor = opts.floor == null ? 0.02 : opts.floor, iters = opts.iters || 20, sig = (opts.biasSigma || 25) / CELL, ex = opts.exclude == null ? -1 : opts.exclude;
    let LP = null;
    if (pri) {
      LP = new Float32Array(n * K);
      for (let s = 0; s < n; s++) { let t = 0; for (let k = 0; k < K; k++) { const v = Math.pow(pri[s * K + k] + floor, alpha); LP[s * K + k] = v; t += v; } for (let k = 0; k < K; k++) LP[s * K + k] = Math.log(LP[s * K + k] / t); }
      let ym = 0, yv = 0; for (let s = 0; s < n; s++) ym += y[s]; ym /= n; for (let s = 0; s < n; s++) yv += (y[s] - ym) ** 2; yv /= n;
      for (let k = 0; k < K; k++) {   // moyennes pondérées par les a priori bruts : pas d'hypothèse sur l'ordre des intensités
        let a = 0, b = 0, c = 0; for (let s = 0; s < n; s++) { const p = pri[s * K + k]; if (p < 0.3) continue; a += p; b += p * y[s]; c += p * y[s] * y[s]; }
        if (a < 50) { mu[k] = ym; s2[k] = 2 * yv; continue; }
        mu[k] = b / a; s2[k] = Math.max(1e-3, c / a - mu[k] * mu[k]);
      }
    } else {   // sans a priori : quantiles
      const ys = Float32Array.from(y).sort(), q = p => ys[Math.min(n - 1, Math.floor(p * n))], qs = K === 3 ? [0.08, 0.42, 0.82] : Array.from({ length: K }, (_, k) => (k + 0.5) / K);
      const sp = Math.max(1e-3, ((q(0.9) - q(0.1)) / (2 * K)) ** 2); for (let k = 0; k < K; k++) { mu[k] = q(qs[k]); s2[k] = sp; }
    }
    if (opts.init) for (let k = 0; k < K; k++) { if (opts.init.mu && opts.init.mu[k] != null) mu[k] = opts.init.mu[k]; if (opts.init.s2 && opts.init.s2[k] != null) s2[k] = opts.init.s2[k]; }
    let F = new Float32Array(G3), ll0 = -Infinity, it = 0; const R = new Float32Array(G3), W = new Float32Array(G3), r = new Float64Array(K), lg = new Float64Array(K);
    for (; it < iters; it++) {
      const A0 = new Float64Array(K), A1 = new Float64Array(K), A2 = new Float64Array(K); R.fill(0); W.fill(0); let ll = 0;
      const doBias = opts.noBias ? false : it >= 1, ls = Array.from(s2, v => 0.5 * Math.log(v)), lw = Array.from(w, v => Math.log(Math.max(v, 1e-9)));
      for (let s = 0; s < n; s++) {
        const ys = y[s], yc = ys - f[s]; let mx = -Infinity;
        for (let k = 0; k < K; k++) { const d = yc - mu[k], v = (LP ? LP[s * K + k] : lw[k]) - ls[k] - d * d / (2 * s2[k]); lg[k] = v; if (v > mx) mx = v; }
        let t = 0; for (let k = 0; k < K; k++) { r[k] = Math.exp(lg[k] - mx); t += r[k]; } ll += mx + Math.log(t);
        let a = 0, b = 0;
        for (let k = 0; k < K; k++) { const q = r[k] / t; A0[k] += q; A1[k] += q * yc; A2[k] += q * yc * yc; if (k !== ex) { const ws = q / s2[k]; a += ws; b += ws * (ys - mu[k]); } }
        if (doBias && a > 0) { const c = S.cell[s]; R[c] += b; W[c] += a; }
      }
      for (let k = 0; k < K; k++) { if (A0[k] < 1e-6) continue; mu[k] = A1[k] / A0[k]; s2[k] = Math.max(4e-4, A2[k] / A0[k] - mu[k] * mu[k]); w[k] = A0[k] / n; }
      if (doBias) {
        F = smoothField(R, W, sig); let sm = 0, sw = 0; for (let c = 0; c < G3; c++) { sm += F[c] * W[c]; sw += W[c]; } const m0 = sw ? sm / sw : 0; for (let c = 0; c < G3; c++) F[c] -= m0;
        for (let s = 0; s < n; s++) { const o = S.vox[s]; f[s] = fieldAt(F, o % N, ((o / N) | 0) % N, (o / NN) | 0); }
      }
      if (say) say((it + 1) / iters);
      const done = it > 4 && Math.abs(ll - ll0) < 2e-5 * n; ll0 = ll; if (done) { it++; break; }
    }
    return { mu: Array.from(mu), s2: Array.from(s2), w: Array.from(w), F, f, ll: ll0 / n, iters: it, alpha, floor };
  }
  function fieldRange(F, S) { let lo = Infinity, hi = -Infinity; for (let s = 0; s < S.n; s++) { const o = S.vox[s], v = fieldAt(F, o % N, ((o / N) | 0) % N, (o / NN) | 0); if (v < lo) lo = v; if (v > hi) hi = v; } return [+(Math.exp(lo) - 1).toFixed(3), +(Math.exp(hi) - 1).toFixed(3)]; }

  /** image corrigée (uint8, grille conformée) : I · exp(−champ), classe de référence ramenée à target */
  function applyField(img, F, ref, target) {
    const out = new Uint8Array(img.length), sc = target / Math.exp(ref);
    for (let k = 0, o = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, o++) { const v = img[o]; if (!v) continue; const y = (v + 1) * Math.exp(-fieldAt(F, i, j, k)) * sc - 1; out[o] = y > 255 ? 255 : y < 0 ? 0 : Math.round(y); }
    return out;
  }

  // ---------------------------------------------------------------- 1. correction du biais (sans réseau)
  /** img : volume conformé (uint8 256³) ; brain : masque 256³ (≠ 0) ; opts.target (170), iters (15), biasSigma (25 mm)
   *  → { data, stats } (même forme que MeshNet.harmonize : field, wmBefore, wmAfter, cvBefore, cvAfter, target) */
  function biasCorrect(img, brain, opts) {
    opts = opts || {}; const t0 = now(), target = opts.target || 170;
    const S = samples2mm(img, brain); if (S.n < 4000) return { data: img, stats: { skipped: 'masque du cerveau trop petit (' + S.n + ' blocs de 2 mm)' } };
    const R = em(S, 3, null, { iters: opts.iters || 15, biasSigma: opts.biasSigma || 25 });
    const order = [0, 1, 2].sort((a, b) => R.mu[a] - R.mu[b]), top = order[2], sd = Math.sqrt(R.s2[top]);
    // hétérogénéité de la classe la plus claire (SB de l'adulte) avant / après
    const cv = (corr) => { let s = 0, s2 = 0, c = 0; for (let q = 0; q < S.n; q++) { const v = S.y[q] - (corr ? R.f[q] : 0); if (Math.abs(S.y[q] - R.f[q] - R.mu[top]) > 1.5 * sd) continue; const e = Math.exp(v); s += e; s2 += e * e; c++; } const m = s / Math.max(1, c); return { m, cv: Math.sqrt(Math.max(0, s2 / Math.max(1, c) - m * m)) / m }; };
    const b0 = cv(false), b1 = cv(true);
    return { data: applyField(img, R.F, R.mu[top], target), stats: { method: 'EM 3 classes + champ lisse σ 25 mm (masque mindgrab)', target, smooth: 0, field: fieldRange(R.F, S), means: order.map(k => Math.round(Math.exp(R.mu[k]))),
      wmBefore: Math.round(b0.m), wmAfter: target, cvBefore: +b0.cv.toFixed(3), cvAfter: +b1.cv.toFixed(3), iters: R.iters, voxels: S.n, ms: Math.round(now() - t0) } };
  }

  // ---------------------------------------------------------------- 2. méthode atlas
  async function template(tj) { const v = {}; for (const k of ['t1', 'gm', 'wm', 'csf', 'seg']) v[k] = await SV.Nifti.read(b64(tj[k])); return v; }
  /** plus proche étiquette (BFS 26-voisins, ≤ maxD voxels) parmi celles acceptées */
  function nearestMap(seg, dims, accept, maxD) {
    const [nx, ny, nz] = dims, n = seg.length, lab = new Uint8Array(n), dist = new Uint8Array(n).fill(255), q = new Int32Array(n); let qh = 0, qt = 0;
    for (let o = 0; o < n; o++) if (seg[o] && accept(seg[o])) { lab[o] = seg[o]; dist[o] = 0; q[qt++] = o; }
    while (qh < qt) {
      const o = q[qh++], d = dist[o]; if (d >= maxD) continue; const i = o % nx, j = ((o / nx) | 0) % ny, k = (o / (nx * ny)) | 0;
      for (let dk = -1; dk <= 1; dk++) { const kk = k + dk; if (kk < 0 || kk >= nz) continue;
        for (let dj = -1; dj <= 1; dj++) { const jj = j + dj; if (jj < 0 || jj >= ny) continue;
          for (let di = -1; di <= 1; di++) { const ii = i + di; if (ii < 0 || ii >= nx) continue; const u = ii + nx * (jj + ny * kk); if (dist[u] !== 255) continue; dist[u] = d + 1; lab[u] = lab[o]; q[qt++] = u; } } }
    }
    return { lab, dist };
  }
  /** classes du modèle utiles aux règles d'étiquetage */
  function labelSets(names) {
    const f = re => names.map(n => re.test(n)), hemi = names.map(n => /^Left-|^ctx-lh-/.test(n) ? 'L' : /^Right-|^ctx-rh-/.test(n) ? 'R' : '');
    const ix = n => names.indexOf(n);
    return { ctx: f(/^ctx-/), deep: f(/Thalamus|Caudate|Putamen|Pallidum|Hippocampus|Amygdala|Accumbens|VentralDC/), cbc: f(/Cerebellum-Cortex/), vent: f(/Vent|^CSF$/), cc: f(/^CC_/), hemi,
      WM: { L: ix('Left-Cerebral-White-Matter'), R: ix('Right-Cerebral-White-Matter') }, CBWM: { L: ix('Left-Cerebellum-White-Matter'), R: ix('Right-Cerebellum-White-Matter') },
      LV: { L: ix('Left-Lateral-Ventricle'), R: ix('Right-Lateral-Ventricle') }, BS: ix('Brain-Stem') };
  }

  /** conf : volume conformé (uint8 256³, affine) ; brain : masque 256³ ; tj : assets/template_spm.json ; meta { names, fsCodes, hemi } ;
   *  opts : alpha (0,6), floor (0,02), beta (0,4), iters (20), tissue (Uint8Array 256³ imposée : 1 LCR, 2 SG, 3 SB — import),
   *         labelsIn (Uint8Array 256³ : étiquettes imposées hors cortex — import aseg), keepImage (image corrigée du biais)
   *  → { labels, dims, affine, labelNames, fsCodes, hemi, atlas { reg, em, volumes }, harmonize (stats de biais), ms, timings, image } */
  async function segment(conf, brain, tj, meta, opts, progress) {
    opts = opts || {}; const T0 = now(), timings = [], M4 = SV.Mat4, cb = typeof progress === 'function' ? progress : () => {};
    const say = (f, m) => { try { cb({ fraction: Math.max(0, Math.min(1, f)), message: m }); } catch (e) { /* rien */ } };
    const lap = (k, t) => timings.push({ model: 'atlas', layer: k, ms: Math.round(now() - t) });
    const img = conf.data, names = meta.names, L = labelSets(names);
    let t = now(); say(0, 'gabarit MNI ICBM152 2009a');
    const V = await template(tj), tdims = V.t1.dims, [tx, ty, tz] = tdims, txy = tx * ty, tA = M4.from(V.t1.affine);
    const TG = V.gm.data, TW = V.wm.data, TC = V.csf.data, TS = V.seg.data;
    lap('gabarit', t);
    // masque du cerveau (tissu imposé : ses voxels)
    const msk = new Uint8Array(N3); let nB = 0;
    for (let o = 0; o < N3; o++) if (opts.tissue ? opts.tissue[o] : brain[o]) { msk[o] = 1; nB++; }
    if (nB < 150000) throw new Error('masque du cerveau trop petit (' + Math.round(nB / 1000) + ' cm³)');
    // volume et centre du cerveau du gabarit → échelle de départ
    let nT = 0, ci = 0, cj = 0, ck = 0;
    for (let k = 0, o = 0; k < tz; k++) for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++, o++) if (TG[o] + TW[o] + TC[o] > 128) { nT++; ci += i; cj += j; ck += k; }
    const vx = Math.abs(tA[0] * tA[5] * tA[10]) || 8, s0 = Math.max(0.5, Math.min(1.25, Math.cbrt(nB / (nT * vx)))), cT = M4.apply(tA, ci / nT, cj / nT, ck / nT);
    const S0 = M4.identity(); for (let r = 0; r < 3; r++) { S0[5 * r] = s0; S0[4 * r + 3] = cT[r] * (1 - s0); }
    // a. recalage affine gabarit → patient (T1 du patient masqué = fixe)
    t = now(); say(0.03, 'recalage affine du gabarit sur le cerveau du patient');
    const fx = new Uint8Array(N3); for (let o = 0; o < N3; o++) if (msk[o]) fx[o] = img[o];
    const fixed = { dims: [N, N, N], pixdim: [1, 1, 1], data: fx, slope: 1, inter: 0, affine: M4.from(conf.affine) };
    const moving = { dims: tdims, pixdim: V.t1.pixdim.map(p => p * s0), data: V.t1.data, slope: 1, inter: 0, affine: M4.mul(S0, tA) };
    const reg = SV.Coreg.rigid(fixed, moving, { fixedKind: 'T1', movingKind: 'T1', dof: 12, levels: [8, 4, 2], seed: 7 },
      p => say(0.03 + 0.42 * Math.min(1, ((p && p.phase === 'affine' ? 1 : 0) + ((p && p.frac) || 0)) / 2), p && p.phase === 'affine' ? 'recalage affine du gabarit (12 ddl)' : 'recalage du gabarit (rigide)'));
    lap('recalage affine', t);
    const Tt = M4.mul(reg.T, S0), Ti = M4.inv(Tt), P2T = M4.mul(M4.inv(tA), M4.mul(Ti, M4.from(conf.affine)));   // voxel patient → voxel gabarit
    const scl = [0, 1, 2].map(c => +Math.hypot(Tt[c], Tt[4 + c], Tt[8 + c]).toFixed(3));
    // a priori trilinéaires (LCR, SG, SB, hors cerveau) au voxel gabarit (x, y, z)
    const pr = new Float64Array(4);
    const priorsAt = (x, y, z) => {
      if (!(x >= 0 && y >= 0 && z >= 0 && x < tx - 1 && y < ty - 1 && z < tz - 1)) { pr[0] = pr[1] = pr[2] = 0; pr[3] = 1; return pr; }
      const i = x | 0, j = y | 0, k = z | 0, fi = x - i, fj = y - j, fk = z - k, b = i + tx * (j + ty * k);
      const w000 = (1 - fi) * (1 - fj) * (1 - fk), w100 = fi * (1 - fj) * (1 - fk), w010 = (1 - fi) * fj * (1 - fk), w110 = fi * fj * (1 - fk), w001 = (1 - fi) * (1 - fj) * fk, w101 = fi * (1 - fj) * fk, w011 = (1 - fi) * fj * fk, w111 = fi * fj * fk;
      const smp = D => (D[b] * w000 + D[b + 1] * w100 + D[b + tx] * w010 + D[b + tx + 1] * w110 + D[b + txy] * w001 + D[b + txy + 1] * w101 + D[b + txy + tx] * w011 + D[b + txy + tx + 1] * w111) / 255;
      pr[0] = smp(TC); pr[1] = smp(TG); pr[2] = smp(TW); pr[3] = Math.max(0, 1 - pr[0] - pr[1] - pr[2]); return pr;
    };
    const tvAt = (i, j, k) => [P2T[0] * i + P2T[1] * j + P2T[2] * k + P2T[3], P2T[4] * i + P2T[5] * j + P2T[6] * k + P2T[7], P2T[8] * i + P2T[9] * j + P2T[10] * k + P2T[11]];

    let tis = opts.tissue || null, emInfo = null, harm = null, image;
    if (!tis) {
      // c. EM à 2 mm
      t = now(); say(0.45, 'classification des tissus (EM, a priori du gabarit, champ de biais)');
      const S = samples2mm(img, msk), K = 4, pri = new Float32Array(S.n * K);
      for (let s = 0; s < S.n; s++) { const o = S.vox[s], p = tvAt(o % N + 0.5, ((o / N) | 0) % N + 0.5, ((o / NN) | 0) + 0.5), q = priorsAt(p[0], p[1], p[2]); for (let k = 0; k < K; k++) pri[s * K + k] = q[k]; }
      const R = em(S, K, pri, { iters: opts.iters || 20, alpha: opts.alpha, floor: opts.floor, exclude: 3, biasSigma: opts.biasSigma || 25 }, f => say(0.45 + 0.25 * f, 'classification des tissus (EM, a priori du gabarit, champ de biais)'));
      lap('EM ' + R.iters + ' itérations', t);
      // d. a posteriori à 1 mm + champ de Markov
      t = now(); say(0.7, 'probabilités a posteriori (1 mm), champ de Markov');
      const idx = new Int32Array(nB), LPp = new Float32Array(nB * K), lab = new Uint8Array(N3), ls = R.s2.map(v => 0.5 * Math.log(v)), lg = new Float64Array(K);
      let q = 0;
      for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = i + N * (j + N * k); if (!msk[o]) continue;
        const p = tvAt(i, j, k), pp = priorsAt(p[0], p[1], p[2]), yc = LOG[img[o]] - fieldAt(R.F, i, j, k); let tt = 0, mx = -Infinity, best = 0;
        for (let c = 0; c < K; c++) { const v = Math.pow(pp[c] + R.floor, R.alpha); lg[c] = v; tt += v; }
        for (let c = 0; c < K; c++) { const d = yc - R.mu[c], v = Math.log(lg[c] / tt) - ls[c] - d * d / (2 * R.s2[c]); lg[c] = v; if (v > mx) { mx = v; best = c; } }
        let z = 0; for (let c = 0; c < K; c++) z += Math.exp(lg[c] - mx); const lz = mx + Math.log(z);
        for (let c = 0; c < K; c++) LPp[q * K + c] = lg[c] - lz;
        idx[q++] = o; lab[o] = best + 1;
      }
      const beta = opts.beta == null ? 0.4 : opts.beta, cnt = new Float64Array(K + 1); let changed = 0;
      for (let pass = 0; pass < 2; pass++) for (let r = 0; r < nB; r++) {
        const o = idx[r], i = o % N, j = ((o / N) | 0) % N, k = (o / NN) | 0; cnt.fill(0);
        if (i > 0) cnt[lab[o - 1]]++; if (i < N - 1) cnt[lab[o + 1]]++; if (j > 0) cnt[lab[o - N]]++; if (j < N - 1) cnt[lab[o + N]]++; if (k > 0) cnt[lab[o - NN]]++; if (k < N - 1) cnt[lab[o + NN]]++;
        let best = 0, bv = -Infinity; for (let c = 0; c < K; c++) { const v = LPp[r * K + c] + beta * cnt[c + 1]; if (v > bv) { bv = v; best = c; } }
        if (lab[o] !== best + 1) { changed++; lab[o] = best + 1; }
      }
      tis = new Uint8Array(N3); const MAP = [0, 1, 2, 3, 0]; for (let r = 0; r < nB; r++) { const o = idx[r]; tis[o] = MAP[lab[o]]; }
      lap('a posteriori + MRF', t);
      const vol = [0, 0, 0, 0]; for (let r = 0; r < nB; r++) vol[lab[idx[r]] - 1]++;
      emInfo = { classes: ['LCR', 'SG', 'SB', 'hors cerveau'], means: R.mu.map(m => Math.round(Math.exp(m) - 1)), sd: R.s2.map(v => +Math.sqrt(v).toFixed(3)), weights: R.w.map(v => +v.toFixed(3)), iters: R.iters, ll: +R.ll.toFixed(4), alpha: R.alpha, beta, icmChanged: changed,
        volumes: { csf: Math.round(vol[0] / 1000), gm: Math.round(vol[1] / 1000), wm: Math.round(vol[2] / 1000), other: Math.round(vol[3] / 1000) }, contrast: R.mu[2] > R.mu[1] ? 'SB > SG (T1 myélinisé)' : 'SB ≤ SG (contraste inversé ou immature)' };
      const ref = Math.max(R.mu[1], R.mu[2]);
      harm = { method: 'champ de biais de la segmentation atlas (EM 4 classes, a priori du gabarit)', target: 170, smooth: 0, field: fieldRange(R.F, S), wmBefore: Math.round(Math.exp(R.mu[2]) - 1), wmAfter: 170, iters: R.iters };
      if (opts.keepImage) image = applyField(img, R.F, ref, 170);
    }
    // e. étiquettes du modèle
    t = now(); say(0.88, 'étiquettes : cortex de Desikan, noyaux, substance blanche, ventricules (gabarit)');
    const gmOK = l => L.ctx[l] || L.deep[l] || L.cbc[l];
    const nG = { L: nearestMap(TS, tdims, l => gmOK(l) && L.hemi[l] === 'L', 8), R: nearestMap(TS, tdims, l => gmOK(l) && L.hemi[l] === 'R', 8) };
    const nV = { L: nearestMap(TS, tdims, l => L.vent[l] && L.hemi[l] !== 'R', 6), R: nearestMap(TS, tdims, l => L.vent[l] && L.hemi[l] !== 'L', 6) };
    const out = new Uint8Array(N3), Lin = opts.labelsIn || null, stat = { gmNearest: 0, gmLost: 0, csfVent: 0 };
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = i + N * (j + N * k); if (Lin && Lin[o]) { out[o] = Lin[o]; continue; }
      const c = tis[o]; if (!c) continue;
      const p = tvAt(i, j, k), ti = Math.round(p[0]), tj2 = Math.round(p[1]), tk = Math.round(p[2]), inT = ti >= 0 && tj2 >= 0 && tk >= 0 && ti < tx && tj2 < ty && tk < tz;
      const tv = inT ? ti + tx * (tj2 + ty * tk) : -1, l = inT ? TS[tv] : 0, side = (tA[0] * p[0] + tA[3]) < 0 ? 'L' : 'R';
      if (c === 2) {   // substance grise
        if (gmOK(l) || l === L.BS) out[o] = l;
        else if (inT && nG[side].dist[tv] <= 8) { out[o] = nG[side].lab[tv]; stat.gmNearest++; }
        else stat.gmLost++;
      } else if (c === 3) {   // substance blanche
        if (L.deep[l] || L.cc[l] || l === L.BS || l === L.CBWM.L || l === L.CBWM.R) out[o] = l;
        else if (L.cbc[l]) out[o] = L.CBWM[L.hemi[l] || side];
        else out[o] = L.WM[side];
      } else if (c === 1) {   // LCR
        if (L.vent[l]) out[o] = l;
        else if (l && !L.ctx[l] && !L.cbc[l] && inT && nV[side].dist[tv] <= 6) { out[o] = nV[side].lab[tv]; stat.csfVent++; }
      }
    }
    const labels = SV.MeshNet && SV.MeshNet.largestComponent ? SV.MeshNet.largestComponent(out, [N, N, N], false) : out;
    lap('étiquettes', t);
    say(1, 'segmentation atlas terminée');
    return { labels, dims: [N, N, N], affine: Float64Array.from(conf.affine), labelNames: names, fsCodes: meta.fsCodes, hemi: meta.hemi,
      atlas: { template: 'MNI ICBM152 2009a (2 mm)', reg: { T: Array.from(Tt), nmi: reg.nmi != null ? +reg.nmi.toFixed(4) : null, rel: reg.qc ? +reg.qc.rel.toFixed(3) : null, scales: scl, s0: +s0.toFixed(3), warnings: reg.warnings, ms: reg.ms },
        em: emInfo, tissueImposed: !!opts.tissue, labelsImposed: !!Lin, stats: stat, brainCm3: Math.round(nB / 1000) },
      harmonize: harm, ms: Math.round(now() - T0), timings, image };
  }

  // ---------------------------------------------------------------- 3. import
  /** .mgh (.mgz décompressé) de FreeSurfer → volume au format nifti.js */
  function readMGH(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i32 = o => dv.getInt32(o, false), f32 = o => dv.getFloat32(o, false);
    const ver = i32(0); if (ver !== 1) throw new Error('fichier MGH invalide (version ' + ver + ')');
    const dims = [i32(4), i32(8), i32(12)], nf = Math.max(1, i32(16)), type = i32(20), good = dv.getInt16(28, false);
    const T = { 0: Uint8Array, 1: Int32Array, 3: Float32Array, 4: Int16Array }[type]; if (!T) throw new Error('type MGH non pris en charge : ' + type);
    let delta = [1, 1, 1], Mdc = [-1, 0, 0, 0, 0, -1, 0, 1, 0], c = [0, 0, 0];
    if (good > 0) { delta = [f32(30), f32(34), f32(38)]; Mdc = []; for (let q = 0; q < 9; q++) Mdc.push(f32(42 + 4 * q)); c = [f32(78), f32(82), f32(86)]; }
    const A = SV.Mat4.identity();   // colonnes : directions x, y, z (Mdc[0..2], [3..5], [6..8]) × taille du voxel
    for (let col = 0; col < 3; col++) for (let r = 0; r < 3; r++) A[4 * r + col] = Mdc[3 * col + r] * delta[col];
    for (let r = 0; r < 3; r++) A[4 * r + 3] = c[r] - (A[4 * r] * dims[0] / 2 + A[4 * r + 1] * dims[1] / 2 + A[4 * r + 2] * dims[2] / 2);
    const n = dims[0] * dims[1] * dims[2], bpv = T.BYTES_PER_ELEMENT, off = 284; if (off + n * bpv > u8.byteLength) throw new Error('fichier MGH tronqué');
    const data = new T(n);
    for (let q = 0; q < n; q++) { const o = off + q * bpv; data[q] = bpv === 1 ? u8[o] : type === 1 ? dv.getInt32(o, false) : type === 3 ? dv.getFloat32(o, false) : dv.getInt16(o, false); }
    return { dims, pixdim: delta.map(Math.abs), data, slope: 1, inter: 0, affine: A, datatype: { 0: 2, 1: 8, 3: 16, 4: 4 }[type], nt: nf, descrip: 'MGH' };
  }
  /** .nii / .nii.gz / .mgh / .mgz → volume */
  async function readAny(u8, name) {
    if (SV.Nifti.isGz(u8)) u8 = await SV.Nifti.gunzip(u8);
    // contenu d'abord (en-tête NIfTI de 348 / 540 octets, ou version MGH = 1 en big-endian), extension ensuite
    const dv = new DataView(u8.buffer, u8.byteOffset, Math.min(8, u8.byteLength)), h = [dv.getInt32(0, true), dv.getInt32(0, false)];
    if (h.some(v => v === 348 || v === 540)) return SV.Nifti.parse(u8);
    if (h[1] === 1 || /\.mg[hz]$/i.test(String(name || ''))) return readMGH(u8);
    return SV.Nifti.parse(u8);
  }
  /** rééchantillonnage sur la grille conformée (plus proche voisin, valeurs mises à l'échelle) */
  function toConf(vol, conf, linear) {
    const M4 = SV.Mat4, M = M4.mul(M4.inv(vol.affine), M4.from(conf.affine)), [nx, ny, nz] = vol.dims, d = vol.data, out = new Float32Array(N3), sl = vol.slope || 1, ic = vol.inter || 0;
    let o = 0;
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
      let x = M[1] * j + M[2] * k + M[3], y = M[5] * j + M[6] * k + M[7], z = M[9] * j + M[10] * k + M[11];
      for (let i = 0; i < N; i++, o++, x += M[0], y += M[4], z += M[8]) {
        if (linear) { if (x < 0 || y < 0 || z < 0 || x > nx - 1 || y > ny - 1 || z > nz - 1) continue; out[o] = SV.Vol.sampleVox(vol, x, y, z, 0); continue; }
        const a = Math.round(x), b = Math.round(y), c = Math.round(z); if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
        out[o] = d[a + nx * (b + ny * c)] * sl + ic;
      }
    }
    return out;
  }
  const FS_TISSUE = c => [3, 42, 8, 47, 10, 11, 12, 13, 17, 18, 26, 28, 49, 50, 51, 52, 53, 54, 58, 60].includes(c) ? 2 : [2, 41, 7, 46, 16, 77, 78, 79, 251, 252, 253, 254, 255].includes(c) ? 3 : [4, 5, 14, 15, 24, 43, 44, 72].includes(c) ? 1 : 0;
  /** segmentation(s) importée(s) → { kind, labels? | tissue + labelsIn?, info } dans l'espace conformé du T1 de référence.
   *  files : [{ name, bytes }] (une segmentation, ou c1/c2/c3 de SPM, p1/p2/p3 de CAT12) ; conf : T1 conformé ; meta { names, fsCodes } */
  async function fromImport(files, conf, meta) {
    const vols = []; for (const f of files) vols.push({ name: f.name, vol: await readAny(f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes), f.name) });
    const img = conf.data, info = { files: files.map(f => f.name) };
    // contrôle d'espace : part de la segmentation tombant dans la tête du T1 (sinon : pas dans l'espace du T1 de référence)
    const inHead = arr => { let a = 0, b = 0; for (let o = 0; o < N3; o += 7) if (arr[o]) { a++; if (img[o] > 8) b++; } return a ? b / a : 0; };
    // cartes de probabilité séparées (SPM c1 SG, c2 SB, c3 LCR ; CAT12 p1, p2, p3)
    const cls = vols.map(v => { const m = /(?:^|[\\/])(?:m?w?r?)?([cp])([123])/i.exec(v.name.replace(/^.*[\\/]/, '')); return m ? +m[2] : 0; });
    if (vols.length > 1) {
      if (cls.some(c => !c)) throw new Error('plusieurs fichiers : attendus c1/c2/c3 (SPM) ou p1/p2/p3 (CAT12)');
      const P = {}; for (let q = 0; q < vols.length; q++) P[cls[q]] = toConf(vols[q].vol, conf, true);
      const tissue = new Uint8Array(N3), TO = { 1: 2, 2: 3, 3: 1 };
      for (let o = 0; o < N3; o++) { let best = 0, bv = 0.5; for (const c of [1, 2, 3]) if (P[c] && P[c][o] > bv) { bv = P[c][o]; best = c; } if (best) tissue[o] = TO[best]; }
      Object.assign(info, { kind: 'tissue', source: 'cartes de probabilité ' + cls.map(c => (/^p/i.test(vols[0].name.replace(/^.*[\\/]/, '')) ? 'p' : 'c') + c).join(', '), inHead: +inHead(tissue).toFixed(3) });
      return { kind: 'tissue', tissue, info };
    }
    const V = vols[0].vol, R = toConf(V, conf, false);
    let mx = 0, frac = false; const seen = new Set();
    for (let o = 0; o < N3; o++) { const v = R[o]; if (!v) continue; if (v > mx) mx = v; if (Math.abs(v - Math.round(v)) > 1e-3) frac = true; else if (seen.size < 400) seen.add(Math.round(v)); }
    if (!mx) throw new Error('segmentation vide une fois ramenée sur le T1 de référence (espace différent ?)');
    info.inHead = +inHead(R).toFixed(3);
    const code2idx = new Map(); (meta.fsCodes || []).forEach((c, i) => { if (i) code2idx.set(c, i); });
    if (!frac && mx > 1000) {   // aparc+aseg (Desikan) ou aparc.DKTatlas+aseg (FastSurfer)
      const labels = new Uint8Array(N3), lost = new Map(), hypo = [];
      for (let o = 0; o < N3; o++) { const c = Math.round(R[o]); if (!c) continue; const l = code2idx.get(c); if (l) labels[o] = l; else if (c === 77 || c === 78 || c === 79) hypo.push(o); else lost.set(c, (lost.get(c) || 0) + 1); }
      // hypo-intensités de la SB (77, sans côté) → SB du côté du centre le plus proche
      const wl = meta.names.indexOf('Left-Cerebral-White-Matter'), wr = meta.names.indexOf('Right-Cerebral-White-Matter'), cen = [[0, 0, 0, 0], [0, 0, 0, 0]];
      for (let o = 0; o < N3; o++) { const l = labels[o]; if (l !== wl && l !== wr) continue; const c = cen[l === wl ? 0 : 1]; c[0] += o % N; c[1] += ((o / N) | 0) % N; c[2] += (o / NN) | 0; c[3]++; }
      for (const o of hypo) { const i = o % N, j = ((o / N) | 0) % N, k = (o / NN) | 0, d = cen.map(c => c[3] ? (i - c[0] / c[3]) ** 2 + (j - c[1] / c[3]) ** 2 + (k - c[2] / c[3]) ** 2 : Infinity); labels[o] = d[0] <= d[1] ? wl : wr; }
      const dkt = !seen.has(1001) && !seen.has(2001) && (seen.has(1002) || seen.has(2002));
      Object.assign(info, { kind: 'aparcaseg', source: dkt ? 'aparc.DKTatlas+aseg (FastSurfer / FreeSurfer, atlas DKT)' : 'aparc+aseg (FreeSurfer, atlas de Desikan)', codes: seen.size, unmapped: Array.from(lost.keys()).slice(0, 20), hypo: hypo.length });
      return { kind: 'aparcaseg', labels, info };
    }
    if (mx <= 5.5) {   // carte de tissus : CAT12 p0 (1 LCR, 2 SG, 3 SB, fractionnaire) ou « tissues » de Brainstorm (1 SB, 2 SG, 3 LCR, 4 os, 5 scalp)
      const q = new Uint8Array(N3); for (let o = 0; o < N3; o++) { const v = R[o]; q[o] = v < 0.5 ? 0 : v < 1.5 ? 1 : v < 2.5 ? 2 : v < 3.5 ? 3 : 0; }
      const m = [0, 0, 0, 0], c = [0, 0, 0, 0]; for (let o = 0; o < N3; o++) if (q[o]) { m[q[o]] += img[o]; c[q[o]]++; }
      const mean = k => c[k] ? m[k] / c[k] : 0, top = c[3] ? 3 : 2, oneIsCSF = mean(1) <= mean(top);   // le LCR est la classe la plus sombre du T1, à tout âge (1 < 3 : CAT12 ; 1 > 3 : Brainstorm)
      const tissue = new Uint8Array(N3), TO = oneIsCSF ? [0, 1, 2, 3] : [0, 3, 2, 1]; for (let o = 0; o < N3; o++) tissue[o] = TO[q[o]];
      Object.assign(info, { kind: 'tissue', source: oneIsCSF ? (frac ? 'CAT12 p0 (étiquettes partielles)' : 'carte de tissus 1 LCR / 2 SG / 3 SB (CAT12 p0)') : 'carte de tissus 1 SB / 2 SG / 3 LCR (Brainstorm « tissues »)', means: [1, 2, 3].map(k => Math.round(mean(k))) });
      return { kind: 'tissue', tissue, info };
    }
    if (!frac && (seen.has(3) || seen.has(42)) && mx < 300) {   // aseg seul : structures du fichier, cortex étiqueté par le gabarit
      const labelsIn = new Uint8Array(N3), tissue = new Uint8Array(N3);
      for (let o = 0; o < N3; o++) { const c = Math.round(R[o]); if (!c) continue; tissue[o] = FS_TISSUE(c); if (c !== 3 && c !== 42) { const l = code2idx.get(c); if (l) labelsIn[o] = l; } }
      Object.assign(info, { kind: 'aseg', source: 'aseg (FreeSurfer / FastSurfer) : cortex étiqueté par le gabarit' });
      return { kind: 'aseg', tissue, labelsIn, info };
    }
    throw new Error('segmentation non reconnue : attendu aparc+aseg / aseg (FreeSurfer, FastSurfer), carte p0 (CAT12), « tissues » (Brainstorm) ou c1/c2/c3 (SPM)');
  }

  SV.SegAtlas = { biasCorrect, segment, em, samples2mm, fieldAt, nearestMap, labelSets, readMGH, readAny, toConf, fromImport };
});
