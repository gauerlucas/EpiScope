/* EpiScope — sleep.js (v5.5) : stadification automatique du sommeil d'un EEG de scalp — portage de YASA (Vallat & Walker,
 * eLife 2021;10:e70092 ; yasa 0.8.1, licence BSD-3), classifieur LightGBM entraîné sur > 30 000 h de polysomnographies
 * (NSRR) cotées selon l'AASM : éveil, N1, N2, N3, sommeil paradoxal ; accord avec les experts ≈ 85 % (comparable à l'accord
 * entre experts). Le modèle n'est pas réentraîné ici : ses 2 000 arbres (5 stades × 400 itérations) sont relus tels quels
 * (assets/models/yasa_eeg*.json) et les 65 descripteurs sont recalculés comme dans SleepStaging.fit() :
 *   une voie EEG (de préférence C4-M1 / C3-M2), rééchantillonnée à 100 Hz, filtrée 0,4–30 Hz (RIF à phase nulle, comme
 *   mne.filter_data), époques de 30 s ; écart-type, écart interquartile, asymétrie, aplatissement, passages par zéro,
 *   mobilité et complexité de Hjorth ; spectre de Welch (Hamming 5 s, recouvrement 50 %, médiane des segments) →
 *   puissances relatives 0,4–1, 1–4, 4–8, 8–12, 12–16, 16–30 Hz (Simpson), rapports δ/θ, δ/σ, δ/β, α/θ, puissance absolue
 *   0,4–30 Hz ; entropie de permutation (ordre 3), dimensions fractales de Higuchi (kmax 10) et de Petrosian ;
 *   puis moyenne glissante centrée (fenêtre triangulaire de 15 époques) et moyenne des 4 dernières époques, chacune
 *   normalisée (médiane, quantiles 5–95 %) ; heure depuis le début et temps relatif ; âge et sexe (modèle « + démographie »).
 * Fonctions de calcul utilisables dans un worker (SV._factories.sleep).                                                   */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).sleep = factory;
})(function (SV) {
  'use strict';
  const FS = 100, EP = 30 * FS, NWIN = 500, BANDS = [[0.4, 1, 'sdelta'], [1, 4, 'fdelta'], [4, 8, 'theta'], [8, 12, 'alpha'], [12, 16, 'sigma'], [16, 30, 'beta']];

  // ------------------------------------------------------------------ filtres
  /** passe-bas RIF à fenêtre de Hamming, gain continu unité (scipy.signal.firwin) */
  function firLP(n, fc, fs) { const h = new Float64Array(n), c = (n - 1) / 2, b = fc / fs; let g = 0; for (let i = 0; i < n; i++) { const t = i - c; h[i] = (t === 0 ? 2 * b : Math.sin(2 * Math.PI * b * t) / (Math.PI * t)) * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1))); g += h[i]; } for (let i = 0; i < n; i++) h[i] /= g; return h; }
  /** passe-bande comme mne.filter.create_filter (RIF « firwin », Hamming) : un passe-bas par transition, chacun de la longueur
   *  qu'impose sa bande de transition (3,3 / Δf), centrés et soustraits ; Δf bas = min(max(f1/4, 2), f1), haut = min(max(f2/4, 2), fs/2 − f2) */
  function firBand(n, f1, f2, fs) {
    const t1 = Math.min(Math.max(f1 * 0.25, 2), f1), t2 = Math.min(Math.max(f2 * 0.25, 2), fs / 2 - f2), odd = v => v + 1 - v % 2;
    n = n || odd(Math.round(3.3 * fs / (f1 > 0 ? Math.min(t1, t2) : t2))); const h = new Float64Array(n), add = (k, sg) => { const o = (n - k.length) >> 1; for (let i = 0; i < k.length; i++) h[o + i] += sg * k[i]; };
    add(firLP(odd(Math.round(3.3 * fs / t2)), f2 + t2 / 2, fs), 1); if (f1 > 0) add(firLP(odd(Math.round(3.3 * fs / t1)), f1 - t1 / 2, fs), -1);
    return h;
  }
  /** filtrage à phase nulle par un RIF symétrique (centré), bords prolongés par réflexion */
  function firApply(x, h) {
    const n = x.length, m = h.length, c = (m - 1) >> 1, y = new Float32Array(n), at = i => { if (i < 0) i = -i; if (i >= n) i = 2 * n - 2 - i; return x[Math.max(0, Math.min(n - 1, i))]; };
    for (let i = 0; i < n; i++) { let s = 0; const o = i - c; if (o >= 0 && o + m <= n) for (let k = 0; k < m; k++) s += h[k] * x[o + k]; else for (let k = 0; k < m; k++) s += h[k] * at(o + k); y[i] = s; }
    return y;
  }
  /** rééchantillonnage à 100 Hz : passe-bas RIF (52 Hz, transition 8 Hz : rien ne se replie sous 37,5 Hz, au-delà du filtre 0,4–30 Hz) puis décimation entière ou interpolation linéaire */
  function to100(x, fs) {
    if (Math.abs(fs - FS) < 1e-9) return Float32Array.from(x);
    const r = fs / FS, y = fs > FS ? firApply(x, firLP((Math.round(3.3 * fs / 8) | 1), 52, fs)) : x, n = Math.floor(x.length / r), out = new Float32Array(n);
    if (Math.abs(r - Math.round(r)) < 1e-9) { const k = Math.round(r); for (let i = 0; i < n; i++) out[i] = y[i * k]; return out; }
    for (let i = 0; i < n; i++) { const t = i * r, j = Math.floor(t), f = t - j; out[i] = j + 1 < y.length ? y[j] * (1 - f) + y[j + 1] * f : y[y.length - 1]; }
    return out;
  }

  // ------------------------------------------------------------------ descripteurs d'une époque
  const HAM = Float64Array.from({ length: NWIN }, (_, i) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / NWIN));   // fenêtre périodique (scipy)
  const KMAX = 151, COS = new Float64Array(KMAX * NWIN), SIN = new Float64Array(KMAX * NWIN);   // DFT de 500 points : bins 0 à 30 Hz
  for (let k = 0; k < KMAX; k++) for (let i = 0; i < NWIN; i++) { COS[k * NWIN + i] = Math.cos(2 * Math.PI * k * i / NWIN); SIN[k * NWIN + i] = Math.sin(2 * Math.PI * k * i / NWIN); }
  const medBias = n => { let s = 1; for (let k = 1; k <= (n - 1) >> 1; k++) s += 1 / (2 * k + 1) - 1 / (2 * k); return s; };
  /** Welch (Hamming 500, recouvrement 250, tendance constante retirée, densité, unilatéral, médiane des segments) → psd[0..150] */
  function welchMed(e) {
    const nseg = Math.floor((e.length - NWIN) / 250) + 1, P = Array.from({ length: KMAX }, () => new Float64Array(nseg)), seg = new Float64Array(NWIN); let U = 0; for (const w of HAM) U += w * w;
    for (let s = 0; s < nseg; s++) { let m = 0; for (let i = 0; i < NWIN; i++) m += e[s * 250 + i]; m /= NWIN; for (let i = 0; i < NWIN; i++) seg[i] = (e[s * 250 + i] - m) * HAM[i];
      for (let k = 0; k < KMAX; k++) { let re = 0, im = 0; const o = k * NWIN; for (let i = 0; i < NWIN; i++) { re += seg[i] * COS[o + i]; im -= seg[i] * SIN[o + i]; } P[k][s] = (re * re + im * im) / (FS * U) * (k === 0 ? 1 : 2); } }
    const b = medBias(nseg); return P.map(a => { const q = Float64Array.from(a).sort(); return (nseg % 2 ? q[nseg >> 1] : (q[nseg / 2 - 1] + q[nseg / 2]) / 2) / b; });
  }
  /** règle de Simpson (scipy.integrate.simpson, pas constant, correction de Cartwright pour un nombre pair de points) */
  function simpson(y, dx) {
    const N = y.length; if (N < 2) return 0; if (N === 2) return dx * (y[0] + y[1]) / 2;
    const basic = n => { let s = 0; for (let i = 0; i + 2 < n; i += 2) s += y[i] + 4 * y[i + 1] + y[i + 2]; return s * dx / 3; };
    if (N % 2) return basic(N); return basic(N - 1) + dx * (5 / 12 * y[N - 1] + 2 / 3 * y[N - 2] - 1 / 12 * y[N - 3]);
  }
  const quant = (s, q) => { const p = (s.length - 1) * q, i = Math.floor(p), f = p - i; return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * f : s[i]; };
  function permEnt(e) { const c = new Float64Array(6), LUT = [5, 7, 0, 19, 11, 0, 15, 21], RM = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 5], n = e.length - 2;
    for (let i = 0; i < n; i++) { const a = e[i], b = e[i + 1], d = e[i + 2]; c[RM[LUT[((a <= b) << 2) | ((a <= d) << 1) | (b <= d)]]]++; }
    let h = 0; for (const v of c) if (v) { const p = v / n; h -= p * Math.log2(p); } return Math.min(1, Math.max(0, h / Math.log2(6))); }
  function higuchi(x, kmax) {
    const N = x.length, X = [], Y = [];
    for (let k = 1; k <= kmax; k++) { let mlm = 0; for (let m = 0; m < k; m++) { const nmax = Math.floor((N - m - 1) / k); let ll = 0; for (let j = 1; j <= nmax; j++) ll += Math.abs(x[m + j * k] - x[m + (j - 1) * k]); ll = ll / k * (N - 1) / (k * nmax); mlm += ll; } mlm /= k; X.push(Math.log(1 / k)); Y.push(mlm > 0 ? Math.log(mlm) : -Infinity); }
    let sx = 0, sy = 0, sxy = 0, sx2 = 0; const n = X.length; for (let j = 0; j < n; j++) { sx += X[j]; sy += Y[j]; sxy += X[j] * Y[j]; sx2 += X[j] * X[j]; } return (n * sxy - sx * sy) / (n * sx2 - sx * sx + 1e-12);
  }
  const nzc = x => { let c = 0; for (let i = 1; i < x.length; i++) if ((x[i] < 0 || Object.is(x[i], -0)) !== (x[i - 1] < 0 || Object.is(x[i - 1], -0))) c++; return c; };   // np.signbit
  function epochFeat(e) {
    const n = e.length; let m = 0; for (const v of e) m += v; m /= n; let m2 = 0, m3 = 0, m4 = 0; for (const v of e) { const d = v - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; } m2 /= n; m3 /= n; m4 /= n;
    const s = Float64Array.from(e).sort(), dx = new Float64Array(n - 1), ddx = new Float64Array(n - 2); for (let i = 0; i < n - 1; i++) dx[i] = e[i + 1] - e[i]; for (let i = 0; i < n - 2; i++) ddx[i] = dx[i + 1] - dx[i];
    const vr = a => { let q = 0, q2 = 0; for (const v of a) { q += v; q2 += v * v; } q /= a.length; return q2 / a.length - q * q; }, vx = m2, vdx = vr(dx), vddx = vr(ddx), hmob = Math.sqrt(vdx / vx), hcomp = Math.sqrt(vddx / vdx) / hmob;
    const psd = welchMed(e), lo = 2, hi = 150, sub = (a, b) => psd.slice(Math.round(a / 0.2), Math.round(b / 0.2) + 1), tot = simpson(psd.slice(lo, hi + 1), 0.2), f = {};
    for (const [a, b, k] of BANDS) f[k] = simpson(sub(a, b), 0.2) / tot;
    const dl = f.sdelta + f.fdelta; f.dt = dl / f.theta; f.ds = dl / f.sigma; f.db = dl / f.beta; f.at = f.alpha / f.theta;
    let ap = 0; const ps = psd.slice(lo, hi + 1); for (let i = 0; i + 1 < ps.length; i++) ap += (ps[i] + ps[i + 1]) / 2 * 0.2; f.abspow = ap;
    Object.assign(f, { std: Math.sqrt(m2 * n / (n - 1)), iqr: quant(s, 0.75) - quant(s, 0.25), skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) - 3, nzc: nzc(e), hmob, hcomp, perm: permEnt(e), higuchi: higuchi(e, 10) });
    f.petrosian = (() => { const N = n, z = nzc(dx); return Math.log10(N) / (Math.log10(N) + Math.log10(N / (N + 0.4 * z))); })();
    return f;
  }

  // ------------------------------------------------------------------ descripteurs du tracé
  const KEYS = ['abspow', 'alpha', 'at', 'beta', 'db', 'ds', 'dt', 'fdelta', 'hcomp', 'higuchi', 'hmob', 'iqr', 'kurt', 'nzc', 'perm', 'petrosian', 'sdelta', 'sigma', 'skew', 'std', 'theta'];
  function robust(col) { const s = Float64Array.from(col.filter(v => v === v)).sort(), med = quant(s, 0.5), sc = (quant(s, 0.95) - quant(s, 0.05)) || 1; return col.map(v => (v - med) / sc); }
  /** x : voie EEG (µV) à fs → { names, X (époques × descripteurs, ordre des noms), times (s) } ; o = { age, male } */
  function features(x, fs, o, progress) {
    o = o || {}; const y = firApply(to100(x, fs), firBand(0, 0.4, 30, FS)), ne = Math.floor(y.length / EP); if (ne < 1) throw new Error('moins de 30 s de signal');
    const F = []; for (let k = 0; k < ne; k++) { F.push(epochFeat(y.subarray(k * EP, (k + 1) * EP))); if (progress && k % 20 === 0) progress(k / ne); }
    const W = [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1].map(v => v / 8), cols = {};
    for (const key of KEYS) {
      const a = F.map(f => f[key]), c = a.map((_, i) => { let s = 0, w = 0; for (let j = -7; j <= 7; j++) { const v = a[i + j]; if (v === undefined || v !== v) continue; s += W[j + 7] * v; w += W[j + 7]; } return w ? s / w : NaN; });
      const p = a.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - 3); j <= i; j++) if (a[j] === a[j]) { s += a[j]; n++; } return n ? s / n : NaN; });
      cols['eeg_' + key] = a; cols['eeg_' + key + '_c7min_norm'] = robust(c); cols['eeg_' + key + '_p2min_norm'] = robust(p);
    }
    const times = Array.from({ length: ne }, (_, k) => k * 30); cols.time_hour = times.map(t => t / 3600); cols.time_norm = times.map(t => ne > 1 ? t / times[ne - 1] : 0);
    if (o.age != null) cols.age = times.map(() => Math.trunc(o.age)); if (o.male != null) cols.male = times.map(() => o.male ? 1 : 0);
    const names = Object.keys(cols).sort(); return { names, X: names.map(k => Float32Array.from(cols[k])), times, n: ne };
  }

  // ------------------------------------------------------------------ classifieur (arbres LightGBM)
  const unb64 = (s, T) => { const b = typeof atob === 'function' ? Uint8Array.from(atob(s), c => c.charCodeAt(0)) : Uint8Array.from(Buffer.from(s, 'base64')); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
  function loadModel(J) { return Object.assign({}, J, { F: unb64(J.f, Uint8Array), T: unb64(J.t, Float64Array), L: unb64(J.l, Int8Array), R: unb64(J.r, Int8Array), V: unb64(J.v, Float32Array) }); }
  /** probabilités des stades (softmax des sommes d'arbres par classe) ; Fe = descripteurs (features) → [{ stage, p: [classes] }] */
  function predict(M, Fe) {
    const idx = M.features.map(n => Fe.names.indexOf(n)); if (idx.some(i => i < 0)) throw new Error('descripteurs manquants : ' + M.features.filter((n, i) => idx[i] < 0).join(', '));
    const K = M.ntpi, nt = M.off.length, out = [], row = new Float64Array(idx.length);
    for (let e = 0; e < Fe.n; e++) {
      for (let j = 0; j < idx.length; j++) { const v = Fe.X[idx[j]][e]; row[j] = v === v ? v : 0; }   // NaN → 0 (missing_type « None »)
      const sc = new Float64Array(K);
      for (let t = 0; t < nt; t++) { const o = M.off[t], lo = M.loff[t]; let n = 0; for (;;) { const c = row[M.F[o + n]] <= M.T[o + n] ? M.L[o + n] : M.R[o + n]; if (c < 0) { sc[t % K] += M.V[lo + ~c]; break; } n = c; } }
      let mx = -Infinity; for (const v of sc) mx = Math.max(mx, v); let s = 0; const p = Array.from(sc, v => { const q = Math.exp(v - mx); s += q; return q; }).map(q => q / s);
      let b = 0; for (let k = 1; k < K; k++) if (p[k] > p[b]) b = k; out.push({ stage: M.classes[b], p });
    }
    return out;
  }
  SV.Sleep = { features, predict, loadModel, epochFeat, to100, firBand, firLP, firApply, welchMed, simpson, permEnt, higuchi };
});
