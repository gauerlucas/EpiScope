/* EpiScope — spikenet.js (v5.6) : détection des pointes intercritiques de l'EEG de scalp par SpikeNet (Jing et al.,
 * JAMA Neurol 2020;77:103-108) — réseau convolutif entraîné sur 9 571 EEG de scalp, 13 262 candidats annotés par 8
 * neurophysiologistes ; sortie calibrée = proportion d'experts qui jugeraient la fenêtre comme une pointe (AUC 0,980,
 * au-dessus des experts et de Persyst 13). Poids publics (github.com/bdsp-core/SpikeNet1, licence CC BY-NC 4.0 : usage
 * non commercial, citation), exportés par tools/export_spikenet1.py dans assets/models/spikenet1.json.
 *
 * Entrée du modèle, comme run_spikenet.py : 19 électrodes 10-20 (µV) rééchantillonnées à 128 Hz, passe-haut 0,5 Hz et
 * coupe-bande du secteur (RIF de MNE), 37 voies = 19 en référence moyenne + 18 en double banane, fenêtres de 1 s.
 * Les auteurs calculent une fenêtre par échantillon ; ici, une fenêtre tous les `step` échantillons (8 = 62,5 ms par
 * défaut) et un calcul exact mais incrémental : les convolutions sont calculées une fois sur le signal continu, et
 * seules les positions que Keras remplit de zéros aux bords de chaque fenêtre sont recalculées — même résultat que la
 * fenêtre calculée isolément (vérifié contre la sortie publiée des auteurs), environ dix fois moins de calcul.
 * Fonctions utilisables dans un worker (SV._factories.spikenet).                                                         */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).spikenet = factory;
})(function (SV) {
  'use strict';
  const FS = 128, W = 128, LR = 0.3;
  const unb64 = s => { const b = typeof atob === 'function' ? Uint8Array.from(atob(s), c => c.charCodeAt(0)) : Uint8Array.from(Buffer.from(s, 'base64')); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
  let cache = null;
  /** modèle décodé (gardé en mémoire du worker) : C (8×8×32), K (15×32, conv2∘conv1 hors bords), w3, w4…w8, biais, dense */
  function load(J) {
    if (cache && cache.J === J.name + J.bd) return cache.M;
    const M = { mono: J.mono, bip: J.bip, C: unb64(J.C), b1: unb64(J.b1), w3: unb64(J.w3), wd: unb64(J.wd), bd: J.bd, filt: {} };
    for (const n of [4, 5, 6, 7, 8]) { M['w' + n] = unb64(J['w' + n]); M['b' + n] = unb64(J['b' + n]); M['s' + n] = J['s' + n]; }
    for (const k in J.filt) M.filt[k] = unb64(J.filt[k]);
    M.K = new Float32Array(15 * 32); for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) for (let o = 0; o < 32; o++) M.K[(i + j) * 32 + o] += M.C[(j * 8 + i) * 32 + o];
    // noyaux effectifs des 16 positions de bord d'une fenêtre (t = 0…7 et 120…127) : la sortie de conv1 hors de la fenêtre
    // vaut zéro (remplissage de conv2), soit les seuls termes j ≥ 3 − t à gauche, j ≤ 130 − t à droite
    M.KE = new Float32Array(16 * 15 * 32);
    for (let e = 0; e < 16; e++) { const t = e < 8 ? e : 112 + e; for (let j = 0; j < 8; j++) { const u = t + j - 3; if (u < 0 || u > 127) continue; for (let i = 0; i < 8; i++) for (let o = 0; o < 32; o++) M.KE[(e * 15 + i + j) * 32 + o] += M.C[(j * 8 + i) * 32 + o]; } }
    cache = { J: J.name + J.bd, M }; return M;
  }

  // ------------------------------------------------------------------ prétraitement
  function firLP(n, fc, fs) { const h = new Float64Array(n), c = (n - 1) / 2, b = fc / fs; let g = 0; for (let i = 0; i < n; i++) { const t = i - c; h[i] = (t === 0 ? 2 * b : Math.sin(2 * Math.PI * b * t) / (Math.PI * t)) * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1))); g += h[i]; } for (let i = 0; i < n; i++) h[i] /= g; return h; }
  function fft(re, im, inv) {
    const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const u = i + k, v = u + len / 2, xr = re[v] * cr - im[v] * ci, xi = re[v] * ci + im[v] * cr; re[v] = re[u] - xr; im[v] = im[u] - xi; re[u] += xr; im[u] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  /** filtrage RIF à phase nulle (réponse centrée) par FFT et blocs recouvrants ; bords prolongés par réflexion impaire */
  function firZP(x, h) {
    const n = x.length, m = h.length, c = (m - 1) >> 1, ext = Math.min(c, n - 1), N = n + 2 * ext, X = new Float32Array(N);
    for (let i = 0; i < N; i++) { const j = i - ext; X[i] = j < 0 ? 2 * x[0] - x[-j] : j >= n ? 2 * x[n - 1] - x[2 * n - 2 - j] : x[j]; }   // réflexion impaire (MNE, reflect_limited)
    let B = 1; while (B < 4 * m) B <<= 1; const step = B - m + 1, Hr = new Float64Array(B), Hi = new Float64Array(B); for (let i = 0; i < m; i++) Hr[i] = h[i]; fft(Hr, Hi, false);
    const Y = new Float64Array(N + m), re = new Float64Array(B), im = new Float64Array(B);
    for (let a = 0; a < N; a += step) { re.fill(0); im.fill(0); for (let i = 0; i < step && a + i < N; i++) re[i] = X[a + i]; fft(re, im, false);
      for (let k = 0; k < B; k++) { const r = re[k] * Hr[k] - im[k] * Hi[k]; im[k] = re[k] * Hi[k] + im[k] * Hr[k]; re[k] = r; } fft(re, im, true); for (let i = 0; i < B && a + i < N + m; i++) Y[a + i] += re[i]; }
    const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = Y[i + ext + c]; return out;
  }
  /** rééchantillonnage à 128 Hz : passe-bas RIF (50 Hz, transition 10 Hz) puis décimation entière ou interpolation linéaire */
  function to128(x, fs) {
    if (Math.abs(fs - FS) < 1e-9) return Float32Array.from(x);
    const y = fs > FS ? firZP(x, firLP((Math.round(3.3 * fs / 10) | 1), 55, fs)) : x, r = fs / FS, n = Math.floor(x.length / r), out = new Float32Array(n);
    if (Math.abs(r - Math.round(r)) < 1e-9) { const k = Math.round(r); for (let i = 0; i < n; i++) out[i] = y[i * k]; return out; }
    for (let i = 0; i < n; i++) { const t = i * r, j = Math.floor(t), f = t - j; out[i] = j + 1 < y.length ? y[j] * (1 - f) + y[j + 1] * f : y[y.length - 1]; }
    return out;
  }
  /** X : 19 voies dans l'ordre M.mono (µV, null si absente) à fs ; line : 50, 60 ou 0 → 19 voies filtrées à 128 Hz */
  function prep(J, X, fs, line, progress) {
    const M = load(J), h = M.filt[String(line || 0)] || M.filt['50'], n0 = X.find(Boolean).length, n = Math.floor(n0 * FS / fs), out = [];
    X.forEach((x, k) => { out.push(x ? firZP(to128(x, fs), h).subarray(0, n) : new Float32Array(n)); if (progress) progress((k + 1) / X.length); });
    return out;
  }
  /** 37 voies (référence moyenne des électrodes présentes, puis double banane) d'un segment [a, b[ */
  function montage(M, D, a, b, present) {
    const n = b - a, ok = present || D.map(() => true), np = ok.filter(Boolean).length, avg = new Float32Array(n), out = [];
    for (let k = 0; k < 19; k++) if (ok[k]) { const d = D[k]; for (let i = 0; i < n; i++) avg[i] += d[a + i] / np; }
    for (let k = 0; k < 19; k++) { const o = new Float32Array(n), d = D[k]; if (ok[k]) for (let i = 0; i < n; i++) o[i] = d[a + i] - avg[i]; out.push(o); }
    for (const pr of M.bip) { const [p, q] = pr.split('-').map(e => M.mono.indexOf(e)), o = new Float32Array(n); if (ok[p] && ok[q]) for (let i = 0; i < n; i++) o[i] = D[p][a + i] - D[q][a + i]; out.push(o); }
    return out;
  }

  // ------------------------------------------------------------------ réseau
  /** convolution « same » de Keras (noyau 8 : 3 avant, 4 après, zéros hors [0, L[) à la position p, biais (normalisation
   *  fondue) puis LeakyReLU ; inp [L × cin], w [8 × cin × cout] → out[off…off+cout[ */
  function convAt(inp, L, cin, w, b, cout, p, out, off) {
    for (let o = 0; o < cout; o++) out[off + o] = b[o];
    for (let j = 0; j < 8; j++) { const q = p + j - 3; if (q < 0 || q >= L) continue; const ib = q * cin, wb = j * cin * cout;
      for (let c = 0; c < cin; c++) { const v = inp[ib + c]; if (v === 0) continue; let wr = wb + c * cout; for (let o = off, e = off + cout; o < e; o++, wr++) out[o] += v * w[wr]; } }
    for (let o = off, e = off + cout; o < e; o++) { const y = out[o]; out[o] = y > 0 ? y : LR * y; }
  }
  /** probabilités des fenêtres de 1 s commençant tous les `step` échantillons (multiple de 4) d'un segment D (19 voies à
   *  128 Hz, longueur n) ; o = { present, wd, bd (couche finale adaptée au patient), feat (renvoyer les 256 descripteurs) }
   *  → { p: Float32Array, f: Float32Array | null } */
  function scan(J, D, step, o, progress) {
    o = o || {}; const M = load(J), n = D[0].length, nw = n >= W ? Math.floor((n - W) / step) + 1 : 0, P = new Float32Array(nw), F = o.feat ? new Float32Array(nw * 256) : null; if (!nw) return { p: P, f: F };
    if (step % 4) throw new Error('pas multiple de 4');
    const X = montage(M, D, 0, n, o.present), nq = n >> 2, wd = M.wd, bd = M.bd, K = M.K, KE = M.KE, b1 = M.b1, w3 = M.w3;
    // 1. continu : conv2∘conv1 (15 coefficients) + normalisation + LeakyReLU, maximum par 4 → P1 [nq × 37 × 32]
    const P1 = new Float32Array(nq * 37 * 32), a = new Float32Array(32);
    for (let c = 0; c < 37; c++) { const x = X[c];
      for (let q = 0; q < nq; q++) { const pb = (q * 37 + c) * 32; for (let o2 = 0; o2 < 32; o2++) P1[pb + o2] = -Infinity;
        for (let t = 4 * q; t < 4 * q + 4; t++) { for (let o2 = 0; o2 < 32; o2++) a[o2] = b1[o2];
          for (let m = 0; m < 15; m++) { const u = t + m - 6; if (u < 0 || u >= n) continue; const v = x[u]; if (v === 0) continue; const kb = m * 32; for (let o2 = 0; o2 < 32; o2++) a[o2] += v * K[kb + o2]; }
          for (let o2 = 0; o2 < 32; o2++) { const y = a[o2] > 0 ? a[o2] : LR * a[o2]; if (y > P1[pb + o2]) P1[pb + o2] = y; } } } }
    // 2. conv3 (mélange des 37 voies), 3. conv4, 4. conv5 en continu
    const conv3 = (src, so, dst, d0) => { for (let g = 0; g < 32; g++) dst[d0 + g] = 0; for (let cf = 0; cf < 37 * 32; cf++) { const v = src[so + cf]; if (v === 0) continue; const wb = cf * 32; for (let g = 0; g < 32; g++) dst[d0 + g] += v * w3[wb + g]; } };
    const B = new Float32Array(nq * 32); for (let q = 0; q < nq; q++) conv3(P1, q * 37 * 32, B, q * 32);
    const Cc = new Float32Array(nq * 64), Dc = new Float32Array(nq * 64);
    for (let q = 0; q < nq; q++) convAt(B, nq, 32, M.w4, M.b4, 64, q, Cc, q * 64);
    for (let q = 0; q < nq; q++) convAt(Cc, nq, 64, M.w5, M.b5, 64, q, Dc, q * 64);
    // 5. par fenêtre : bords recalculés (remplissage par des zéros propre à la fenêtre), puis couches 6 à 8 et sortie
    const P1w = new Float32Array(32 * 37 * 32), Bw = new Float32Array(32 * 32), Cw = new Float32Array(32 * 64), Dw = new Float32Array(32 * 64), E0 = new Float32Array(8 * 64), E1 = new Float32Array(8 * 96), E2 = new Float32Array(8 * 96), G0 = new Float32Array(2 * 96), G1 = new Float32Array(2 * 128);
    const EDGE_T = [0, 1, 2, 3, 4, 5, 6, 7, 120, 121, 122, 123, 124, 125, 126, 127], acc = new Float32Array(32);
    for (let w = 0; w < nw; w++) {
      const s = w * step, q0 = s >> 2;
      P1w.set(P1.subarray(q0 * 37 * 32, (q0 + 32) * 37 * 32));
      for (const pq of [0, 1, 30, 31]) for (let c = 0; c < 37; c++) { const pb = (pq * 37 + c) * 32; for (let o2 = 0; o2 < 32; o2++) P1w[pb + o2] = -Infinity; }
      for (let e = 0; e < 16; e++) { const t = EDGE_T[e], pq = t >> 2, eb = e * 15;
        for (let c = 0; c < 37; c++) { const x = X[c]; for (let o2 = 0; o2 < 32; o2++) acc[o2] = b1[o2];
          for (let m = 0; m < 15; m++) { const r = t + m - 6; if (r < 0 || r > 127) continue; const v = x[s + r]; if (v === 0) continue; let kb = (eb + m) * 32; for (let o2 = 0; o2 < 32; o2++, kb++) acc[o2] += v * KE[kb]; }
          const pb = (pq * 37 + c) * 32; for (let o2 = 0; o2 < 32; o2++) { const y = acc[o2] > 0 ? acc[o2] : LR * acc[o2]; if (y > P1w[pb + o2]) P1w[pb + o2] = y; } } }
      Bw.set(B.subarray(q0 * 32, (q0 + 32) * 32)); for (const p of [0, 1, 30, 31]) conv3(P1w, p * 37 * 32, Bw, p * 32);
      Cw.set(Cc.subarray(q0 * 64, (q0 + 32) * 64)); for (let p = 0; p < 32; p++) if (p < 5 || p > 25) convAt(Bw, 32, 32, M.w4, M.b4, 64, p, Cw, p * 64);
      Dw.set(Dc.subarray(q0 * 64, (q0 + 32) * 64)); for (let p = 0; p < 32; p++) if (p < 8 || p > 21) convAt(Cw, 32, 64, M.w5, M.b5, 64, p, Dw, p * 64);
      for (let p = 0; p < 8; p++) for (let o2 = 0; o2 < 64; o2++) { let m = -Infinity; for (let k = 0; k < 4; k++) m = Math.max(m, Dw[(4 * p + k) * 64 + o2]); E0[p * 64 + o2] = m; }
      for (let p = 0; p < 8; p++) convAt(E0, 8, 64, M.w6, M.b6, 96, p, E1, p * 96);
      for (let p = 0; p < 8; p++) convAt(E1, 8, 96, M.w7, M.b7, 96, p, E2, p * 96);
      for (let p = 0; p < 2; p++) for (let o2 = 0; o2 < 96; o2++) { let m = -Infinity; for (let k = 0; k < 4; k++) m = Math.max(m, E2[(4 * p + k) * 96 + o2]); G0[p * 96 + o2] = m; }
      for (let p = 0; p < 2; p++) convAt(G0, 2, 96, M.w8, M.b8, 128, p, G1, p * 128);
      let z = bd; for (let k = 0; k < 256; k++) z += G1[k] * wd[k]; P[w] = 1 / (1 + Math.exp(-z)); if (F) F.set(G1, w * 256);
      if (progress && w % 200 === 0) progress(w / nw);
    }
    return { p: P, f: F };
  }
  /** évènements d'une courbe de probabilité (fenêtres tous les `step` échantillons à 128 Hz) : sections au-dessus du seuil
   *  (trous de moins de 150 ms réunis), un évènement au maximum ; temps = centre de la fenêtre (s) → [{ t, p }] */
  function events(P, step, thr, t0) {
    const out = [], n = P.length, gap = Math.max(1, Math.round(0.15 * FS / step)); let i = 0;
    while (i < n) { if (P[i] < thr) { i++; continue; } let j = i, last = i; while (j < n && j - last <= gap) { if (P[j] >= thr) last = j; j++; } let m = i; for (let k = i; k <= last; k++) if (P[k] > P[m]) m = k; out.push({ t: (t0 || 0) + (m * step + W / 2) / FS, p: P[m] }); i = last + 1; }
    return out;
  }
  // ------------------------------------------------------------------ filtre propre au patient (relecture de l'expert)
  /** classifieur des évènements détectés, appris sur la relecture : X descripteurs (256) de la fenêtre centrée sur chaque
   *  évènement, y (1 gardé, 0 rejeté), I indices → { w, b } ; régression logistique sur descripteurs centrés-réduits, classes
   *  équilibrées, a priori = couche finale d'origine (L2 0,1), Adam 300 itérations. Il ne fait que retirer des détections. */
  function fitHead(M, X, y, I) {
    const n = I.length, mu = new Float64Array(256), sd = new Float64Array(256), np = I.filter(i => y[i]).length; for (const i of I) for (let k = 0; k < 256; k++) mu[k] += X[i][k] / n;
    for (const i of I) for (let k = 0; k < 256; k++) sd[k] += (X[i][k] - mu[k]) ** 2 / n; for (let k = 0; k < 256; k++) sd[k] = Math.sqrt(sd[k]) + 1e-3;
    const Z = I.map(i => Float64Array.from(X[i], (x, k) => (x - mu[k]) / sd[k])), cw = I.map(i => 0.5 / Math.max(1, y[i] ? np : n - np)), w0 = Float64Array.from(M.wd, (w, k) => w * sd[k]), w = Float64Array.from(w0);
    let b = M.bd; for (let k = 0; k < 256; k++) b += M.wd[k] * mu[k]; const G = new Float64Array(257), m = new Float64Array(257), v = new Float64Array(257);
    for (let it = 1; it <= 300; it++) { G.fill(0); I.forEach((i, j) => { const x = Z[j]; let z = b; for (let k = 0; k < 256; k++) z += w[k] * x[k]; const e = (1 / (1 + Math.exp(-z)) - y[i]) * cw[j]; for (let k = 0; k < 256; k++) G[k] += e * x[k]; G[256] += e; });
      for (let k = 0; k < 256; k++) G[k] += 0.1 * (w[k] - w0[k]); for (let k = 0; k < 257; k++) { m[k] = 0.9 * m[k] + 0.1 * G[k]; v[k] = 0.999 * v[k] + 0.001 * G[k] * G[k]; const st = 0.05 * (m[k] / (1 - 0.9 ** it)) / (Math.sqrt(v[k] / (1 - 0.999 ** it)) + 1e-8); if (k < 256) w[k] -= st; else b -= st; } }
    const wd = Float64Array.from(w, (x, k) => x / sd[k]); for (let k = 0; k < 256; k++) b -= wd[k] * mu[k]; return { w: wd, b };
  }
  const head = (W, x) => { let z = W.b; for (let k = 0; k < 256; k++) z += W.w[k] * x[k]; return 1 / (1 + Math.exp(-z)); };
  /** validation croisée en 5 parts → { sens : part des gardés conservés, spec : part des rejetés retirés, bal } ; tick(f) */
  function filterCV(M, X, y, thr, tick) {
    const all = X.map((_, i) => i), keep = new Array(X.length);
    for (let f = 0; f < 5; f++) { const W = fitHead(M, X, y, all.filter(i => i % 5 !== f)); for (let i = f; i < X.length; i += 5) keep[i] = head(W, X[i]) >= thr; if (tick) tick(f); }
    const P = all.filter(i => y[i]), Q = all.filter(i => !y[i]), sens = P.filter(i => keep[i]).length / (P.length || 1), spec = Q.filter(i => !keep[i]).length / (Q.length || 1);
    return { sens, spec, bal: (sens + spec) / 2 };
  }
  SV.SpikeNet = { load, prep, scan, events, montage, to128, firZP, fitHead, filterCV, head, FS, W };
});
