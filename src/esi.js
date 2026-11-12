/* EpiScope — esi.js (v5.3) : imagerie de source électrique (ESI) de l'EEG de scalp et de la SEEG, sans dépendance.
 *
 * Modèles directs
 *   - scalp : sphère à 3 couches (cerveau 0,33 S/m, os 0,33/40, scalp 0,33), solution exacte en série de Legendre
 *     (coefficients multicouches par produit de matrices 2 × 2, comme MNE ; vérifiés contre la forme close d'une sphère
 *     homogène, Lütkenhöner 1992, et contre les constantes à 4 couches de Cuffin & Cohen 1979). La tête du patient est
 *     ramenée à cette sphère par normalisation radiale locale (esprit LSMAC, Brunet / Michel) : chaque électrode est posée
 *     sur la sphère dans sa direction, chaque source garde sa profondeur relative sous le cortex de sa direction.
 *     Birot et al. (NeuroImage Clin 2014) : sphérique local, BEM et FEM donnent des localisations très voisines.
 *   - SEEG : milieu homogène infini (Caune et al., NeuroImage 2014 : dipôle équivalent sur les signaux en référence commune,
 *     précision < 10 mm quand des plots sont proches de la source ; Kalina et al., Brain Topogr 2023 : l'erreur croît avec la
 *     distance au plot le plus actif ; López-Madrona et al., NeuroImage 2023 : sources non échantillonnées jusqu'à ~40 mm,
 *     intervalle de confiance du dipôle = indicateur de fiabilité).
 *   Référence moyenne appliquée aux données et au modèle (référence d'enregistrement inconnue).
 * Inverses
 *   - sLORETA (Pascual-Marqui 2002), orientation libre : puissance standardisée JᵢᵀRᵢᵢ⁻¹Jᵢ par source ; version
 *     « covariance » (puissance moyenne d'une fenêtre : trace(Rᵢᵢ⁻¹ LᵢᵀM C M Lᵢ)) pour un rythme critique ;
 *   - dipôle de courant équivalent (ECD) : recherche sur la grille des sources puis Nelder–Mead, moment linéaire ;
 *     qualité d'ajustement (GOF) et ellipsoïde de confiance à 95 % (covariance linéarisée de la position) ;
 *   - v5.4 : blanchiment par la covariance du bruit de fond (hors pointes), formeur de voie LCMV (Van Veen 1997).
 * Signal
 *   - pointes intercritiques : détection multivoies (amplitude robuste, durées des demi-ondes, acuité), regroupement par
 *     topographie (corrélation), moyennage, puissance de champ globale (GFP) et mi-montée (Parra-Díaz et al., Epilepsia 2026 :
 *     sLORETA à mi-montée de la pointe moyennée, EEG de routine à faible densité, précision 81 %) ;
 *   - début de crise : fréquence dominante, filtre ± 1 Hz autour d'elle et ESI moyennée sur la fenêtre (Nemtsas et al.,
 *     Epilepsia 2017) ; composantes indépendantes (FastICA) classées par puissance à la fréquence critique et dipolarité
 *     (de Borman et al., J Neural Eng 2022) ; composantes principales d'une pointe moyennée (part de variance du 1er axe).   */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).esi = factory;
})(function (SV) {
  'use strict';

  // ================================================================ positions 10-20 / 10-10 (tête MNI, mm)
  /** positions standard (Oostenveld & Praamstra 2001) sur la tête MNI — fichier standard_1020.elc (FieldTrip) */
  const STD_TXT = 'LPA -86.1 -20 -48;RPA 85.8 -20 -48;Nz 0 86.8 -40;Fp1 -29.4 83.9 -7;Fpz 0.1 88.2 -1.7;Fp2 29.9 84.9 -7.1;AF9 -49 64.1 -47.7;AF7 -54.8 68.6 -10.6;AF5 -45.4 72.9 5.98;AF3 -33.7 76.8 21.2;AF1 -18.5 79.9 32.8;AFz 0.2 80.8 35.4;AF2 19.8 80.3 32.8;AF4 35.7 77.7 22;AF6 46.6 73.8 6;AF8 55.7 69.7 -10.8;AF10 50.4 63.8 -48;F9 -70.1 41.7 -49.9;F7 -70.3 42.5 -11.4;F5 -64.5 48 16.9;F3 -50.2 53.1 42.2;F1 -27.5 56.9 60.3;Fz 0.3 58.5 66.5;F2 28 57.8 60.1;F4 51.8 54.3 40.8;F6 67.9 49.8 16.4;F8 73 44.4 -12;F10 72.1 42.5 -50.5;FT9 -84.1 14.6 -50.4;FT7 -80.8 14.1 -11.1;FC5 -77.2 18.6 24.5;FC3 -60.2 22.7 55.5;FC1 -34.1 26 79.99;FCz 0.4 26.8 88.3;FC2 34.7 26.4 78.8;FC4 62.3 23.7 55.6;FC6 79.5 19.8 24.4;FT8 81.8 15.4 -11.3;FT10 84.8 14.6 -50.5;T9 -85.8 -15.8 -48;T7 -84.2 -16 -9.3;C5 -80.3 -13.8 29.2;C3 -65.4 -11.6 64.4;C1 -36.2 -10 89.8;Cz 0.4 -9.2 100.2;C2 37.7 -10 88.1;C4 67.1 -10.9 63.6;C6 83.5 -12.8 29.2;T8 85.1 -15 -9.5;T10 85.6 -16 -48.3;TP9 -85.6 -46.5 -45.7;TP7 -84.8 -46 -7.1;CP5 -79.6 -46.6 30.9;CP3 -63.6 -47 65.6;CP1 -35.5 -47.3 91.3;CPz 0.4 -47.3 99.4;CP2 38.4 -47.1 90.7;CP4 66.6 -46.6 65.6;CP6 83.4 -46.1 31.2;TP8 85.6 -45.5 -7.1;TP10 86.2 -47 -45.9;P9 -73 -73.7 -40;P7 -72.4 -73.5 -2.5;P5 -67.3 -76.3 28.4;P3 -53 -78.8 55.9;P1 -28.6 -80.5 75.4;Pz 0.3 -81.1 82.6;P2 31.9 -80.5 76.7;P4 55.7 -78.6 56.6;P6 67.9 -75.9 28.1;P8 73.1 -73.1 -2.5;P10 73.9 -74.4 -39.4;PO9 -54.9 -98 -35.5;PO7 -54.8 -97.5 2.8;PO5 -48.4 -99.3 21.6;PO3 -36.5 -101 37.2;PO1 -18.9 -102 46.5;POz 0.2 -102.2 50.1;PO2 19.9 -101.9 46.4;PO4 36.8 -100.9 36.4;PO6 49.9 -99.4 21.7;PO8 55.7 -97.6 2.7;PO10 54.9 -98 -35.6;O1 -29.4 -112.4 8.8;Oz 0.1 -114.6 14.7;O2 29.8 -112.4 8.8;O9 -29.8 -114.7 -18.3;Iz 0.1 -118.6 -23.1;O10 29.7 -114.6 -18.3;T3 -84.2 -16 -9.3;T5 -72.4 -73.5 -2.5;T4 85.1 -15 -9.5;T6 73.1 -73.1 -2.5;M1 -86.1 -45 -68;M2 85.8 -45 -68;A1 -86.1 -25 -68;A2 85.8 -25 -68';
  const STD = {}; for (const r of STD_TXT.split(';')) { const p = r.split(' '); STD[p[0]] = [+p[1], +p[2], +p[3]]; }
  const STD_UP = new Map(Object.keys(STD).map(k => [k.toUpperCase(), k]));
  /** nom d'électrode de scalp normalisé (« EEG Fp1-Ref », « FP1 », « Fp1-A1 », « EEG T3 » → Fp1, T3) ; null sinon */
  function stdName(label) {
    let s = String(label || '').trim().replace(/^(EEG|SCALP)\s+/i, '').replace(/[-_ ]*(REF|AVG|A1A2|LE|M1M2|CAR)$/i, '').replace(/[-_ ](A1|A2|M1|M2|Cz)$/i, '');
    s = s.replace(/\s+/g, ''); const k = STD_UP.get(s.toUpperCase()); return k && !/^(LPA|RPA|Nz|A1|A2|M1|M2)$/.test(k) ? k : null;
  }
  /** voies d'un enregistrement reconnues comme électrodes de scalp : [{ i, name }] (au moins 8 pour un EEG de scalp) ; aucune si
   *  l'enregistrement est bipolaire (« FP1-F7 » : la différence de deux électrodes n'est pas une électrode) */
  function scalpChannels(names) { if (recordedMontage(names).kind === 'bip') return []; const out = [], seen = new Set(); names.forEach((n, i) => { const k = stdName(n); if (k && !seen.has(k)) { seen.add(k); out.push({ i, name: k }); } }); return out; }
  /** EEG de scalp : ≥ 8 électrodes 10-20 dont ≥ 4 typiques du scalp (Fp1, Fz, Cz, O1, T3…), sans les plots numérotés d'une
   *  SEEG (F11, B'3…) ; ou montage bipolaire de scalp enregistré */
  const TYP = new Set('Fp1 Fp2 Fpz Fz Cz Pz Oz O1 O2 F7 F8 T3 T4 T5 T6 T7 T8 P7 P8'.split(' '));
  function isScalp(names) {
    if (recordedMontage(names).kind === 'bip') return true; const sc = scalpChannels(names); if (sc.length < 8 || sc.filter(x => TYP.has(x.name)).length < 4) return false;
    const seegLike = names.filter(n => /^[A-Za-z]{1,3}['’]?\d{1,2}$/.test(String(n).trim()) && !stdName(n)).length; return seegLike < sc.length / 2;
  }
  const REFN = /^(LPA|RPA|Nz|A1|A2|M1|M2)$/;
  /** voie « électrode – électrode » de deux électrodes 10-20 (« FP1-F7 », « EEG Fp1-F3 », « FZ-CZ ») → [a, b] ou null */
  function bipName(label) {
    const m = String(label || '').trim().replace(/^(EEG|SCALP)\s+/i, '').match(/^([A-Za-z]{1,3}\d{0,2})\s*[-–]\s*([A-Za-z]{1,3}\d{0,2})$/); if (!m) return null;
    const a = STD_UP.get(m[1].toUpperCase()), b = STD_UP.get(m[2].toUpperCase()); return a && b && !REFN.test(a) && !REFN.test(b) ? [a, b] : null;
  }
  /** montage d'enregistrement d'un EEG de scalp, d'après les noms des voies → { kind: 'bip' (sub 'long' | 'trans') | 'avg' |
   *  'lap' | 'ref', ref (électrode ou type de référence commune), label } */
  function recordedMontage(names) {
    const P = names.map(bipName).filter(Boolean), sec = new Map(); P.forEach(([, b]) => sec.set(b, (sec.get(b) || 0) + 1));
    const top = [...sec.entries()].sort((x, y) => y[1] - x[1])[0], common = top && top[1] >= 0.6 * P.length;
    if (P.length >= 8 && !common) {
      const adj = kind => { const S = new Set(); for (const [, ch] of CHAINS[kind]) { const L = ch.split(' '); for (let j = 0; j + 1 < L.length; j++) for (const x of [L[j], SYN[L[j]]]) for (const y of [L[j + 1], SYN[L[j + 1]]]) if (x && y) { S.add(x + '|' + y); S.add(y + '|' + x); } } return S; };
      const B = adj('banana'), T = adj('trans'), nb = P.filter(([a, b]) => B.has(a + '|' + b)).length, nt = P.filter(([a, b]) => T.has(a + '|' + b)).length, lg = nb >= nt;
      return { kind: 'bip', sub: lg ? 'long' : 'trans', label: lg ? 'bipolaire longitudinal (double banane)' : 'bipolaire transverse' };
    }
    const raw = names.map(n => String(n).trim().replace(/^(EEG|SCALP)\s+/i, '')), cnt = re => raw.filter(n => re.test(n) && stdName(n)).length;
    if (cnt(/[-_ ]?(AVG|CAR|AV)$/i) >= 8) return { kind: 'avg', label: 'référence moyenne (enregistrée)' };
    if (cnt(/[-_ ]?(LAP|HJORTH)$/i) >= 8) return { kind: 'lap', label: 'laplacien (enregistré)' };
    const ref = P.length >= 8 && common ? top[0] : cnt(/[-_ ](A1|A2|M1|M2|A1A2|M1M2|LE)$/i) >= 8 ? 'oreilles / mastoïdes' : cnt(/[-_ ]?REF$/i) >= 8 ? 'Ref' : null;
    return { kind: 'ref', ref, label: 'référence commune' + (ref ? ' (' + ref + ')' : '') };
  }
  /** interpolation par spline sphérique (Perrin et al., 1989 ; comme mne interpolate_bads : raideur 4, 50 termes de
   *  Legendre, régularisation 1e-5) des électrodes `to` à partir des électrodes `from` (noms 10-20 de STD), positions
   *  ramenées sur la sphère ajustée → matrice de poids [to × from] (chaque ligne somme à 1) */
  function splineWeights(from, to) {
    const c = fitSphere(Object.values(STD)).c, u = p => { const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], r = Math.hypot(...v); return v.map(x => x / r); };
    const G = x => { x = Math.max(-1, Math.min(1, x)); let p0 = 1, p1 = x, s = 3 / 16 * p1; for (let n = 2; n <= 50; n++) { const p2 = ((2 * n - 1) * x * p1 - (n - 1) * p0) / n; s += (2 * n + 1) / Math.pow(n * (n + 1), 4) * p2; p0 = p1; p1 = p2; } return s / (4 * Math.PI); };
    const F = from.map(n => u(STD[n])), T = to.map(n => u(STD[n])), m = F.length, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const C = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => i < m && j < m ? G(dot(F[i], F[j])) + (i === j ? 1e-5 : 0) : i === m && j === m ? 0 : 1));
    const Ci = invert(C); return T.map(t => { const g = F.map(f => G(dot(t, f))).concat([1]); return Array.from({ length: m }, (_, j) => g.reduce((q, v, i) => q + v * Ci[i][j], 0)); });
  }
  function solveLin(A, b) { const n = b.length, M = A.map((r, i) => r.concat([b[i]])); for (let k = 0; k < n; k++) { let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i; [M[k], M[p]] = [M[p], M[k]]; for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; } } const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x; }
  function invert(A) { const n = A.length; return Array.from({ length: n }, (_, j) => solveLin(A, Array.from({ length: n }, (_, i) => i === j ? 1 : 0))).reduce((R, col, j) => { col.forEach((v, i) => { (R[i] = R[i] || [])[j] = v; }); return R; }, []); }
  /** laplacien de surface (Hjorth) : pour chaque électrode, les voisines (≤ 4, à moins de 1,4 fois la plus proche) → [[indices]] */
  function hjorth(names) {
    const P = names.map(n => STD[n]);
    return names.map((n, i) => { const o = names.map((m, j) => [j === i ? Infinity : Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]), j]).sort((a, b) => a[0] - b[0]); return o.filter(([d]) => d <= 1.4 * o[0][0]).slice(0, 4).map(([, j]) => j); });
  }
  /** montages de lecture du scalp : double banane (longitudinal bipolaire) et transverse ; T3/T7, T4/T8, T5/P7, T6/P8 confondus */
  const SYN = { T7: 'T3', T3: 'T7', T8: 'T4', T4: 'T8', P7: 'T5', T5: 'P7', P8: 'T6', T6: 'P8' };
  const CHAINS = {
    banana: [['temporal G', 'Fp1 F7 T3 T5 O1'], ['parasagittal G', 'Fp1 F3 C3 P3 O1'], ['médian', 'Fz Cz Pz'], ['parasagittal D', 'Fp2 F4 C4 P4 O2'], ['temporal D', 'Fp2 F8 T4 T6 O2']],
    trans: [['frontal', 'F7 F3 Fz F4 F8'], ['central', 'T3 C3 Cz C4 T4'], ['pariétal', 'T5 P3 Pz P4 T6'], ['polaire', 'Fp1 Fp2'], ['occipital', 'O1 O2']],
  };
  /** paires d'un montage de scalp : idx (nom normalisé → indice de voie) → [{ name, a, b, elec }] */
  function scalpPairs(idx, kind) {
    const out = [], get = n => idx.has(n) ? n : SYN[n] && idx.has(SYN[n]) ? SYN[n] : null;
    for (const [grp, chain] of CHAINS[kind] || []) { const L = chain.split(' ').map(get); for (let j = 0; j + 1 < L.length; j++) if (L[j] && L[j + 1]) out.push({ name: `${L[j]}-${L[j + 1]}`, a: idx.get(L[j]), b: idx.get(L[j + 1]), elec: grp }); }
    return out;
  }
  /** région de scalp d'une électrode (bandes des montages référentiels) et rang d'affichage (gauche, ligne médiane, droite) */
  const REG_ORDER = ['frontal G', 'temporal G', 'central G', 'pariétal G', 'occipital G', 'médian', 'frontal D', 'temporal D', 'central D', 'pariétal D', 'occipital D'];
  function scalpRegion(n) {
    if (/z$/i.test(n)) return 'médian'; const s = n.replace(/\d+$/, ''), side = parseInt(n.replace(/\D+/g, ''), 10) % 2 ? 'G' : 'D';
    return (/^(Fp|AF|F|FC)$/i.test(s) ? 'frontal' : /^(T|TP|FT)$/i.test(s) ? 'temporal' : /^(C|CP)$/i.test(s) ? 'central' : /^(P|PO)$/i.test(s) ? 'pariétal' : 'occipital') + ' ' + side;
  }
  const STD_RANK = new Map(Object.keys(STD).map((k, i) => [k, i]));
  const scalpRank = n => REG_ORDER.indexOf(scalpRegion(n)) * 1000 + (STD_RANK.get(n) || 0);

  // ================================================================ algèbre linéaire (petites matrices denses, ligne par ligne)
  /** Cholesky d'une matrice symétrique définie positive n × n (Float64Array) → facteur bas L (en place dans une copie) */
  function chol(A, n) { const L = new Float64Array(A); for (let j = 0; j < n; j++) { let d = L[j * n + j]; for (let k = 0; k < j; k++) d -= L[j * n + k] * L[j * n + k]; if (d <= 0) d = 1e-12; d = Math.sqrt(d); L[j * n + j] = d; for (let i = j + 1; i < n; i++) { let s = L[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]; L[i * n + j] = s / d; } for (let k = j + 1; k < n; k++) L[j * n + k] = 0; } return L; }
  function cholSolve(L, n, b) { const y = new Float64Array(b); for (let i = 0; i < n; i++) { let s = y[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; } for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * y[k]; y[i] = s / L[i * n + i]; } return y; }
  function cholInv(L, n) { const I = new Float64Array(n * n), e = new Float64Array(n); for (let j = 0; j < n; j++) { e.fill(0); e[j] = 1; const c = cholSolve(L, n, e); for (let i = 0; i < n; i++) I[i * n + j] = c[i]; } return I; }
  /** valeurs et vecteurs propres d'une matrice symétrique (Jacobi cyclique) → { val (décroissantes), vec (colonnes, n × n) } */
  function eigSym(A0, n) {
    const A = new Float64Array(A0), V = new Float64Array(n * n); for (let i = 0; i < n; i++) V[i * n + i] = 1;
    let fro = 0; for (let i = 0; i < n * n; i++) fro += A[i] * A[i]; const tol = 1e-26 * fro;   // tolérance relative (unités quelconques)
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q]; if (off <= tol) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q]; if (apq * apq <= tol * 1e-6) continue;
        const th = (A[q * n + q] - A[p * n + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = A[k * n + p], akq = A[k * n + q]; A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = A[p * n + k], aqk = A[q * n + k]; A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k * n + p], vkq = V[k * n + q]; V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq; }
      }
    }
    const ord = [...Array(n).keys()].sort((a, b) => A[b * n + b] - A[a * n + a]), val = new Float64Array(n), vec = new Float64Array(n * n);
    ord.forEach((j, c) => { val[c] = A[j * n + j]; for (let i = 0; i < n; i++) vec[i * n + c] = V[i * n + j]; });
    return { val, vec };
  }
  function inv3(m) { const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1e-30; return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det]; }

  // ================================================================ sphère à couches
  /** sphère ajustée à des points (moindres carrés algébriques) → { c, r } */
  function fitSphere(P) {
    const n = P.length; if (n < 4) throw new Error('au moins 4 points'); const A = new Float64Array(16), B = new Float64Array(4);
    for (const p of P) { const row = [2 * p[0], 2 * p[1], 2 * p[2], 1], y = p[0] * p[0] + p[1] * p[1] + p[2] * p[2]; for (let i = 0; i < 4; i++) { B[i] += row[i] * y; for (let j = 0; j < 4; j++) A[i * 4 + j] += row[i] * row[j]; } }
    for (let i = 0; i < 4; i++) A[i * 4 + i] += 1e-9; const s = cholSolve(chol(A, 4), 4, B), c = [s[0], s[1], s[2]];
    return { c, r: Math.sqrt(Math.max(1e-9, s[3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2])) };
  }
  /** facteurs de la série multicouche (1 pour une sphère homogène) ; radii et sig de l'intérieur vers l'extérieur */
  function shellCoeffs(radii, sig, N) {
    const L = radii.length, R = radii[L - 1], out = new Float64Array(N + 1);
    for (let n = 1; n <= N; n++) {
      let m00 = 1, m01 = 0, m10 = 0, m11 = 1; const n1 = n + 1;
      for (let k = L - 2; k >= 0; k--) {
        const c1 = sig[k] / sig[k + 1], c2 = c1 - 1, cr = Math.pow(radii[k] / R, 2 * n + 1);
        const a00 = n + n1 * c1, a01 = n1 * c2 / cr, a10 = n * c2 * cr, a11 = n1 + n * c1;
        const b00 = a00 * m00 + a01 * m10, b01 = a00 * m01 + a01 * m11, b10 = a10 * m00 + a11 * m10, b11 = a10 * m01 + a11 * m11; m00 = b00; m01 = b01; m10 = b10; m11 = b11;
      }
      out[n] = L === 1 ? 1 : n * Math.pow(2 * n + 1, L - 1) / (n * m11 + n1 * m10);
    }
    return out;
  }
  /** modèle sphérique : { c, rScalp, radii, sig, N, fn } (conductivités cerveau / os / scalp, os au 1/40 du cerveau) */
  function sphereModel(o) {
    const R = o.rScalp, radii = [o.rBrain, o.rSkull, R], sig = o.sig || [0.33, 0.33 / 40, 0.33], N = o.N || 80;
    return { c: o.c.slice(), rScalp: R, rBrain: o.rBrain, radii, sig, N, fn: shellCoeffs(radii, sig, N) };
  }
  /** potentiel au point de scalp (direction e, unitaire) d'un dipôle en p (relatif au centre) : 3 composantes (série exacte) */
  function sphereGain(M, e, p, out) {
    const b = Math.hypot(p[0], p[1], p[2]), R = M.rScalp, K = 1 / (4 * Math.PI * M.sig[M.sig.length - 1] * R * R);
    let rh0 = 0, rh1 = 0, rh2 = 1; if (b > 1e-9) { rh0 = p[0] / b; rh1 = p[1] / b; rh2 = p[2] / b; }
    const c = Math.max(-1, Math.min(1, e[0] * rh0 + e[1] * rh1 + e[2] * rh2)), s = Math.sqrt(Math.max(0, 1 - c * c)), f = b / R;
    let t0 = e[0] - c * rh0, t1 = e[1] - c * rh1, t2 = e[2] - c * rh2; const tn = Math.hypot(t0, t1, t2); if (tn > 1e-12) { t0 /= tn; t1 /= tn; t2 /= tn; } else { t0 = t1 = t2 = 0; }
    let Pm2 = 1, Pm1 = c, Q2 = 0, Q1 = s, fp = 1, sr = 0, st = 0;   // P_n, P_n^1 (sans phase de Condon–Shortley)
    for (let n = 1; n <= M.N; n++) {
      let P, Q; if (n === 1) { P = c; Q = s; } else { P = ((2 * n - 1) * c * Pm1 - (n - 1) * Pm2) / n; Q = n === 2 ? 3 * c * s : ((2 * n - 1) * c * Q1 - n * Q2) / (n - 1); Pm2 = Pm1; Pm1 = P; Q2 = Q1; Q1 = Q; }
      const k = (2 * n + 1) * M.fn[n] * fp; sr += k * P; st += k * Q / n; fp *= f; if (fp < 1e-12) break;
    }
    out[0] = K * (sr * rh0 + st * t0); out[1] = K * (sr * rh1 + st * t1); out[2] = K * (sr * rh2 + st * t2); return out;
  }
  /** matrice de gain (m × 3n, Float32Array, ligne par électrode) — électrodes et sources dans l'espace de la sphère (centrées) ;
   *  E : directions unitaires des électrodes (m × 3), S : positions des sources (n × 3, mm, relatives au centre) */
  function sphereLeadfield(M, E, S, progress) {
    const m = E.length / 3, n = S.length / 3, L = new Float32Array(m * 3 * n), g = [0, 0, 0], e = [0, 0, 0], p = [0, 0, 0];
    for (let j = 0; j < n; j++) {
      p[0] = S[3 * j]; p[1] = S[3 * j + 1]; p[2] = S[3 * j + 2];
      for (let i = 0; i < m; i++) { e[0] = E[3 * i]; e[1] = E[3 * i + 1]; e[2] = E[3 * i + 2]; sphereGain(M, e, p, g); const o = i * 3 * n + 3 * j; L[o] = g[0]; L[o + 1] = g[1]; L[o + 2] = g[2]; }
      if (progress && (j & 1023) === 0) progress(j / n);
    }
    return L;
  }
  /** milieu homogène infini (SEEG) : V = Q·(r − r0) / (4πσ |r − r0|³) ; capteurs et sources en mm (gain en 1/mm²) */
  function infiniteGain(r, p, sigma, out, rmin) {
    let d0 = r[0] - p[0], d1 = r[1] - p[1], d2 = r[2] - p[2]; const d = Math.max(rmin || 2, Math.hypot(d0, d1, d2)), k = 1 / (4 * Math.PI * (sigma || 0.33) * d * d * d);
    out[0] = k * d0; out[1] = k * d1; out[2] = k * d2; return out;
  }
  function infiniteLeadfield(C, S, sigma, rmin) {
    const m = C.length / 3, n = S.length / 3, L = new Float32Array(m * 3 * n), g = [0, 0, 0], r = [0, 0, 0], p = [0, 0, 0];
    for (let j = 0; j < n; j++) { p[0] = S[3 * j]; p[1] = S[3 * j + 1]; p[2] = S[3 * j + 2]; for (let i = 0; i < m; i++) { r[0] = C[3 * i]; r[1] = C[3 * i + 1]; r[2] = C[3 * i + 2]; infiniteGain(r, p, sigma, g, rmin); const o = i * 3 * n + 3 * j; L[o] = g[0]; L[o + 1] = g[1]; L[o + 2] = g[2]; } }
    return L;
  }
  /** référence moyenne : chaque colonne du gain (m × k) centrée sur sa moyenne */
  function avgRefCols(L, m, k) { for (let j = 0; j < k; j++) { let s = 0; for (let i = 0; i < m; i++) s += L[i * k + j]; s /= m; for (let i = 0; i < m; i++) L[i * k + j] -= s; } return L; }
  function avgRefVec(v) { let s = 0; for (const x of v) s += x; s /= v.length || 1; return Float64Array.from(v, x => x - s); }

  // ================================================================ sLORETA (orientation libre)
  /** opérateur sLORETA : L (m × 3n, référence moyenne), alpha = régularisation relative (λ = alpha · trace(LLᵀ)/m) →
   *  { m, n, L, Minv (m × m), Rinv (n × 9 : blocs 3 × 3 inverses de la résolution) } */
  function sloretaOperator(L, m, n, alpha, progress) {
    const k = 3 * n, G = new Float64Array(m * m);
    for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { let s = 0; const a = i * k, b = j * k; for (let c = 0; c < k; c++) s += L[a + c] * L[b + c]; G[i * m + j] = G[j * m + i] = s; }
    let tr = 0; for (let i = 0; i < m; i++) tr += G[i * m + i]; const lam = (alpha == null ? 0.05 : alpha) * tr / m;
    // référence moyenne : G est singulière (rang m − 1) ; la régularisation la rend inversible
    for (let i = 0; i < m; i++) G[i * m + i] += lam;
    const Lc = chol(G, m), Minv = cholInv(Lc, m), Rinv = new Float64Array(9 * n), ML = new Float64Array(m * 3);
    for (let j = 0; j < n; j++) {
      for (let r = 0; r < m; r++) for (let q = 0; q < 3; q++) { let s = 0; for (let c = 0; c < m; c++) s += Minv[r * m + c] * L[c * k + 3 * j + q]; ML[r * 3 + q] = s; }
      const R9 = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) { let s = 0; for (let r = 0; r < m; r++) s += L[r * k + 3 * j + p] * ML[r * 3 + q]; R9[p * 3 + q] = s; }
      Rinv.set(inv3(R9), 9 * j); if (progress && (j & 511) === 0) progress(j / n);
    }
    return { m, n, L, Minv, Rinv, lam };
  }
  /** puissance standardisée de chaque source pour une topographie v (référence moyenne) → Float32Array n */
  function sloretaPower(O, v) {
    const { m, n, L, Minv, Rinv } = O, k = 3 * n, w = new Float64Array(m), out = new Float32Array(n);
    for (let i = 0; i < m; i++) { let s = 0; for (let c = 0; c < m; c++) s += Minv[i * m + c] * v[c]; w[i] = s; }
    for (let j = 0; j < n; j++) {
      let a = 0, b = 0, c = 0; for (let i = 0; i < m; i++) { const wi = w[i], o = i * k + 3 * j; a += L[o] * wi; b += L[o + 1] * wi; c += L[o + 2] * wi; }
      const R = Rinv.subarray(9 * j, 9 * j + 9); out[j] = a * (R[0] * a + R[1] * b + R[2] * c) + b * (R[3] * a + R[4] * b + R[5] * c) + c * (R[6] * a + R[7] * b + R[8] * c);
    }
    return out;
  }
  /** puissance standardisée moyenne d'une fenêtre (covariance C, m × m, référence moyenne) → Float32Array n */
  function sloretaPowerCov(O, C) {
    const { m, n, L, Minv, Rinv } = O, k = 3 * n, T = new Float64Array(m * m), B = new Float64Array(m * m), out = new Float32Array(n), LB = new Float64Array(3 * m);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let c = 0; c < m; c++) s += Minv[i * m + c] * C[c * m + j]; T[i * m + j] = s; }
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let c = 0; c < m; c++) s += T[i * m + c] * Minv[c * m + j]; B[i * m + j] = s; }
    for (let j = 0; j < n; j++) {
      for (let p = 0; p < 3; p++) for (let c = 0; c < m; c++) { let s = 0; for (let r = 0; r < m; r++) s += L[r * k + 3 * j + p] * B[r * m + c]; LB[p * m + c] = s; }
      const P9 = []; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) { let s = 0; for (let c = 0; c < m; c++) s += LB[p * m + c] * L[c * k + 3 * j + q]; P9.push(s); }
      const R = Rinv.subarray(9 * j, 9 * j + 9); let tr = 0; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) tr += R[p * 3 + q] * P9[q * 3 + p]; out[j] = tr;
    }
    return out;
  }

  // ================================================================ dipôle de courant équivalent
  /** ajustement linéaire du moment pour un gain g (m × 3, Float64Array) : { q, ssr } */
  function fitMoment(g, v, m) {
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0]; for (let i = 0; i < m; i++) for (let p = 0; p < 3; p++) { b[p] += g[i * 3 + p] * v[i]; for (let q = 0; q < 3; q++) A[p * 3 + q] += g[i * 3 + p] * g[i * 3 + q]; }
    const tr = A[0] + A[4] + A[8]; A[0] += 1e-9 * tr; A[4] += 1e-9 * tr; A[8] += 1e-9 * tr; const I = inv3(A), q = [I[0] * b[0] + I[1] * b[1] + I[2] * b[2], I[3] * b[0] + I[4] * b[1] + I[5] * b[2], I[6] * b[0] + I[7] * b[1] + I[8] * b[2]];
    let ssr = 0; for (let i = 0; i < m; i++) { const r = v[i] - g[i * 3] * q[0] - g[i * 3 + 1] * q[1] - g[i * 3 + 2] * q[2]; ssr += r * r; } return { q, ssr };
  }
  /** dipôle unique : gainAt(p) → gain m × 3 en référence moyenne (Float64Array) ; L, n, S : grille (recherche initiale) ;
   *  inside(p) : contrainte ; v : topographie (référence moyenne) → { p, q, gof, ssr, ci: { r: [3], axes: [[3]×3], vol } } */
  function fitDipole(o) {
    const { gainAt, v, inside } = o, m = v.length; let ss = 0; for (const x of v) ss += x * x; ss = ss || 1e-30;
    // 1. grille : meilleure source (gain précalculé)
    let best = -1, bssr = Infinity; const g = new Float64Array(m * 3);
    if (o.L) { const k = 3 * o.n; for (let j = 0; j < o.n; j++) { for (let i = 0; i < m; i++) { g[i * 3] = o.L[i * k + 3 * j]; g[i * 3 + 1] = o.L[i * k + 3 * j + 1]; g[i * 3 + 2] = o.L[i * k + 3 * j + 2]; } const f = fitMoment(g, v, m); if (f.ssr < bssr) { bssr = f.ssr; best = j; } } }
    const p0 = best >= 0 ? [o.S[3 * best], o.S[3 * best + 1], o.S[3 * best + 2]] : (o.p0 || [0, 0, 0]);
    // 2. Nelder–Mead sur la position (le moment suit linéairement)
    const cost = p => inside && !inside(p) ? 1e30 : fitMoment(gainAt(p), v, m).ssr;
    const step = o.step || 5; let simplex = [p0, [p0[0] + step, p0[1], p0[2]], [p0[0], p0[1] + step, p0[2]], [p0[0], p0[1], p0[2] + step]].map(p => ({ p, f: cost(p) }));
    for (let it = 0; it < 400; it++) {
      simplex.sort((a, b) => a.f - b.f); const [B, , , W] = simplex; if (Math.abs(W.f - B.f) <= 1e-10 * (Math.abs(B.f) + 1e-30) && it > 30) break;
      const c = [0, 1, 2].map(k => (simplex[0].p[k] + simplex[1].p[k] + simplex[2].p[k]) / 3), at = t => c.map((x, k) => x + t * (W.p[k] - x));
      const r = at(-1), fr = cost(r);
      if (fr < B.f) { const e = at(-2), fe = cost(e); simplex[3] = fe < fr ? { p: e, f: fe } : { p: r, f: fr }; }
      else if (fr < simplex[2].f) simplex[3] = { p: r, f: fr };
      else { const ct = fr < W.f ? at(-0.5) : at(0.5), fc = cost(ct); if (fc < Math.min(fr, W.f)) simplex[3] = { p: ct, f: fc }; else simplex = simplex.map((s, i) => i === 0 ? s : { p: s.p.map((x, k) => B.p[k] + 0.5 * (x - B.p[k])), f: cost(s.p.map((x, k) => B.p[k] + 0.5 * (x - B.p[k]))) }); }
    }
    simplex.sort((a, b) => a.f - b.f); const p = simplex[0].p, F = fitMoment(gainAt(p), v, m);
    // 3. ellipsoïde de confiance (95 %) : covariance linéarisée de la position, moment fixé, σ² = SSR / (m − 6)
    const h = 0.5, J = new Float64Array(m * 3), pred = q => { const G0 = gainAt(q), y = new Float64Array(m); for (let i = 0; i < m; i++) y[i] = G0[i * 3] * F.q[0] + G0[i * 3 + 1] * F.q[1] + G0[i * 3 + 2] * F.q[2]; return y; };
    for (let k = 0; k < 3; k++) { const a = p.slice(), b = p.slice(); a[k] += h; b[k] -= h; const ya = pred(a), yb = pred(b); for (let i = 0; i < m; i++) J[i * 3 + k] = (ya[i] - yb[i]) / (2 * h); }
    const JJ = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (let i = 0; i < m; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) JJ[a * 3 + b] += J[i * 3 + a] * J[i * 3 + b];
    const s2 = F.ssr / Math.max(1, m - 6), Cv = inv3(JJ).map(x => x * s2), E = eigSym(Float64Array.from(Cv), 3), chi = 7.815;
    const r = [0, 1, 2].map(i => Math.sqrt(Math.max(0, E.val[i]) * chi)), axes = [0, 1, 2].map(i => [E.vec[i], E.vec[3 + i], E.vec[6 + i]]);
    return { p, q: F.q, ssr: F.ssr, gof: Math.max(0, 1 - F.ssr / ss), ci: { r, axes, vol: 4 / 3 * Math.PI * r[0] * r[1] * r[2] }, grid: best };
  }

  // ================================================================ filtres et spectre
  function biq(type, f0, fs, Q) {
    const w = 2 * Math.PI * f0 / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * (Q || Math.SQRT1_2)); let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    const a0 = 1 + al; return [b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - al) / a0];
  }
  function runB(x, k, rev) { const [b0, b1, b2, a1, a2] = k, n = x.length, y = new Float32Array(n); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const at = i => rev ? n - 1 - i : i; x1 = x2 = x[at(0)]; y1 = y2 = x[at(0)];
    for (let i = 0; i < n; i++) { const j = at(i), v = x[j], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[j] = o; } return y; }
  /** passe-bande à phase nulle (Butterworth d'ordre 2 aller-retour, passe-haut puis passe-bas) */
  function bandpass(x, fs, f1, f2) {
    let m = 0; for (let i = 0; i < x.length; i++) m += x[i]; m /= x.length || 1; let y = Float32Array.from(x, v => v - m);
    if (f1 > 0) { const k = biq('hp', f1, fs); y = runB(runB(y, k), k, true); }
    if (f2 > 0 && f2 < fs / 2 * 0.98) { const k = biq('lp', f2, fs); y = runB(runB(y, k), k, true); }
    return y;
  }
  function fftR(re, im) {
    const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  }
  /** spectre de puissance moyen (Welch, Hann, segments de seg s, recouvrement 50 %) de plusieurs voies → { f, p } */
  function welch(chans, fs, seg) {
    let n = 1; while (n < (seg || 2) * fs) n <<= 1; const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    const p = new Float64Array(n / 2 + 1); let cnt = 0; const re = new Float64Array(n), im = new Float64Array(n);
    for (const x of chans) { if (x.length < n) { re.fill(0); im.fill(0); for (let i = 0; i < x.length; i++) re[i] = x[i] * w[Math.floor(i * n / x.length)]; fftR(re, im); for (let k = 0; k <= n / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k]; cnt++; continue; }
      for (let s = 0; s + n <= x.length; s += n >> 1) { for (let i = 0; i < n; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; } fftR(re, im); for (let k = 0; k <= n / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k]; cnt++; } }
    for (let k = 0; k <= n / 2; k++) p[k] /= cnt || 1; return { f: Float64Array.from({ length: n / 2 + 1 }, (_, k) => k * fs / n), p };
  }
  /** fréquence dominante (pic du spectre moyen entre fmin et fmax, interpolation parabolique) */
  function dominantFreq(chans, fs, fmin, fmax) {
    const S = welch(chans, fs, 2); let k0 = -1, best = -Infinity; for (let k = 1; k < S.f.length - 1; k++) if (S.f[k] >= (fmin || 1.5) && S.f[k] <= (fmax || 20) && S.p[k] > best && S.p[k] >= S.p[k - 1] && S.p[k] >= S.p[k + 1]) { best = S.p[k]; k0 = k; }
    if (k0 < 0) return { f: null, spec: S }; const a = S.p[k0 - 1], b = S.p[k0], c = S.p[k0 + 1], d = (a - c) / (2 * (a - 2 * b + c) || 1); return { f: S.f[k0] + d * (S.f[1] - S.f[0]), spec: S };
  }

  /** fréquence qui augmente le plus au début de crise : pic du rapport des spectres (fenêtre / référence préictale), lissés
   *  sur 3 points, entre fmin et fmax → { f, ratio } (repli : fréquence dominante sans référence) */
  function dominantRatio(chans, base, fs, fmin, fmax) {
    if (!base || !base[0] || base[0].length < fs) return dominantFreq(chans, fs, fmin, fmax);
    const A = welch(chans, fs, 1), B = welch(base, fs, 1), n = A.f.length, sm = p => Float64Array.from(p, (v, k) => (p[Math.max(0, k - 1)] + v + p[Math.min(n - 1, k + 1)]) / 3), a = sm(A.p), b = sm(B.p);
    let k0 = -1, best = 0; for (let k = 1; k < n - 1; k++) { if (A.f[k] < fmin || A.f[k] > fmax) continue; const r = a[k] / (b[k] || 1e-30); if (r > best) { best = r; k0 = k; } }
    return k0 < 0 ? dominantFreq(chans, fs, fmin, fmax) : { f: A.f[k0], ratio: best, spec: A };
  }

  // ================================================================ pointes intercritiques
  /** référence moyenne d'un ensemble de voies (Float32Array[]) */
  function avgRefData(X) { const m = X.length, T = X[0].length, Y = X.map(() => new Float32Array(T)); for (let t = 0; t < T; t++) { let s = 0; for (let i = 0; i < m; i++) s += X[i][t]; s /= m; for (let i = 0; i < m; i++) Y[i][t] = X[i][t] - s; } return Y; }
  function gfp(X, a, b) { const m = X.length; a = a || 0; b = b == null ? X[0].length : b; const g = new Float32Array(b - a); for (let t = a; t < b; t++) { let s = 0, s2 = 0; for (let i = 0; i < m; i++) { s += X[i][t]; s2 += X[i][t] * X[i][t]; } g[t - a] = Math.sqrt(Math.max(0, s2 / m - (s / m) * (s / m))); } return g; }
  /** écart absolu médian glissant (blocs de blk échantillons) → échelle robuste par échantillon (interpolée) */
  function robustScale(x, blk) {
    const nb = Math.max(1, Math.ceil(x.length / blk)), sc = new Float32Array(nb), tmp = [];
    for (let b = 0; b < nb; b++) { tmp.length = 0; for (let i = b * blk, e = Math.min(x.length, (b + 1) * blk); i < e; i += 2) tmp.push(Math.abs(x[i])); tmp.sort((p, q) => p - q); sc[b] = 1.4826 * (tmp[tmp.length >> 1] || 0); }
    const med = Float32Array.from(sc).sort()[nb >> 1] || 1; for (let b = 0; b < nb; b++) sc[b] = Math.max(sc[b], 0.3 * med) || med || 1; return sc;
  }
  /** détection de pointes (et ondes pointues) sur des voies en référence moyenne, filtrées 1–35 Hz :
   *  pic de |x| > k·σ robuste local, deux demi-ondes de 10 à 100 ms (montée et descente) chacune > 0,5·k·σ, acuité
   *  (dérivée seconde au pic > q·σ'' robuste) ; regroupement des voies à ± 40 ms ; temps = maximum de la GFP.
   *  o = { k: 5, q: 3, hw: [10, 100] ms, merge: 40 ms, maxRel: 25 (artefact) } → [{ t (échantillon), ch: [voies], amp, pol }] */
  function detectSpikes(X, fs, o, progress) {
    o = Object.assign({ k: 5, q: 3, hw: [10, 100], merge: 40, maxRel: 25 }, o || {});
    const m = X.length, T = X[0].length, blk = Math.round(5 * fs), h10 = Math.max(1, Math.round(0.01 * fs)), hw0 = o.hw[0] / 1000 * fs, hw1 = o.hw[1] / 1000 * fs, cand = [];
    for (let c = 0; c < m; c++) {
      const x = X[c], sc = robustScale(x, blk), d2 = new Float32Array(T); for (let t = h10; t < T - h10; t++) d2[t] = x[t + h10] - 2 * x[t] + x[t - h10];
      const sd2 = robustScale(d2, blk);
      for (let t = 2; t < T - 2; t++) {
        const v = x[t], a = Math.abs(v), s = sc[(t / blk) | 0]; if (a < o.k * s || a > o.maxRel * o.k * s) continue;
        if (!(a >= Math.abs(x[t - 1]) && a > Math.abs(x[t + 1]))) continue; const sg = Math.sign(v);
        // demi-ondes : jusqu'aux extrêmes opposés de part et d'autre du pic
        let i = t; while (i > 0 && t - i < hw1 * 1.6 && sg * x[i - 1] <= sg * x[i]) i--; let j = t; while (j < T - 1 && j - t < hw1 * 1.6 && sg * x[j + 1] <= sg * x[j]) j++;
        const rise = t - i, fall = j - t, ra = sg * (v - x[i]), fa = sg * (v - x[j]);
        if (rise < hw0 || rise > hw1 || fall < hw0 || fall > hw1 * 1.5 || ra < 0.5 * o.k * s || fa < 0.5 * o.k * s) continue;
        if (Math.abs(d2[t]) < o.q * sd2[(t / blk) | 0]) continue;
        cand.push({ t, c, amp: a / s, pol: sg });
      }
      if (progress) progress((c + 1) / m * 0.8);
    }
    cand.sort((p, q) => p.t - q.t); const out = [], mg = Math.round(o.merge / 1000 * fs);
    for (let i = 0; i < cand.length;) {
      let j = i; while (j + 1 < cand.length && cand[j + 1].t - cand[i].t <= mg) j++;
      const grp = cand.slice(i, j + 1), a = Math.max(0, grp[0].t - mg), b = Math.min(T, grp[grp.length - 1].t + mg + 1), g = gfp(X, a, b); let tm = a, gm = -1; for (let k = 0; k < g.length; k++) if (g[k] > gm) { gm = g[k]; tm = a + k; }
      const top = grp.reduce((p, q) => q.amp > p.amp ? q : p); out.push({ t: tm, ch: [...new Set(grp.map(x => x.c))], amp: top.amp, pol: top.pol, chMax: top.c });
      i = j + 1;
    }
    // un évènement par fenêtre de 150 ms (le plus ample) : pointe-onde, polypointes
    const keep = []; for (const e of out) { const l = keep[keep.length - 1]; if (l && e.t - l.t < 0.15 * fs) { if (e.amp > l.amp) keep[keep.length - 1] = e; } else keep.push(e); }
    if (progress) progress(1); return keep;
  }
  // ================================================================ détecteur de Janča et al. 2015 (Brain Topogr 28:172-183)
  /** passe-bande raide à phase nulle : Butterworth d'ordre 4 (deux biquads) aller-retour, passe-haut puis passe-bas */
  function bandpass4(x, fs, f1, f2) { let y = Float32Array.from(x); for (const Q of [0.5412, 1.3066]) { if (f1 > 0) { const k = biq('hp', f1, fs, Q); y = runB(runB(y, k), k, true); } if (f2 > 0 && f2 < fs * 0.49) { const k = biq('lp', f2, fs, Q); y = runB(runB(y, k), k, true); } } return y; }
  /** coupe-bande étroit (zéros sur le cercle, pôles à r = 0,985) aller-retour */
  function notchZP(x, f0, fs) { const w = 2 * Math.PI * f0 / fs, c = Math.cos(w), r = 0.985, k = [1, -2 * c, 1, -2 * r * c, r * r], g = (1 - 2 * r * c + r * r) / (2 - 2 * c); k[0] *= g; k[1] *= g; k[2] *= g; return runB(runB(x, k), k, true); }
  /** rééchantillonnage linéaire (après passe-bas anti-repliement) vers fo */
  function resampleTo(x, fs, fo) { if (Math.abs(fs - fo) < 1e-6) return Float32Array.from(x); const y = fs > fo ? bandpass4(x, fs, 0, 0.4 * fo) : x, n = Math.floor(x.length * fo / fs), out = new Float32Array(n), r = fs / fo; for (let i = 0; i < n; i++) { const t = i * r, j = Math.floor(t), f = t - j; out[i] = j + 1 < y.length ? y[j] * (1 - f) + y[j + 1] * f : y[y.length - 1]; } return out; }
  /** enveloppe de Hilbert (signal analytique par FFT, par blocs recouvrants) */
  function envelope(x) {
    const N = x.length, B = 1 << 15, pad = 1024, out = new Float32Array(N), re = new Float64Array(B), im = new Float64Array(B), step = B - 2 * pad;
    for (let s = -pad; s < N - pad; s += step) {
      re.fill(0); im.fill(0); for (let i = 0; i < B; i++) { const j = s + i; if (j >= 0 && j < N) re[i] = x[j]; }
      fftR(re, im); for (let k = 1; k < B / 2; k++) { re[k] *= 2; im[k] *= 2; } for (let k = B / 2 + 1; k < B; k++) { re[k] = 0; im[k] = 0; }
      for (let k = 0; k < B; k++) im[k] = -im[k]; fftR(re, im);   // FFT inverse : conjugué, FFT, conjugué (le module ne dépend pas du signe)
      for (let i = pad; i < B - pad; i++) { const j = s + i; if (j >= 0 && j < N) out[j] = Math.hypot(re[i], im[i]) / B; }
    }
    return out;
  }
  /** une voie : enveloppe du signal 10–60 Hz ; loi log-normale (μ, σ de ln enveloppe) sur des fenêtres de 5 s (pas 1 s),
   *  lissées sur 5 fenêtres, interpolées ; seuil k1·(mode + médiane), mode = e^(μ−σ²), médiane = e^μ ; maxima locaux de
   *  l'enveloppe au-dessus du seuil, maxima distants de moins de 120 ms réunis (polypointes) ; 1re et dernière seconde
   *  ignorées → [{ i (échantillon à fo), r (enveloppe / seuil), w (fonction de répartition) }] */
  function jancaChannel(x, fo, o) {
    const env = envelope(x), N = env.length, W = Math.round(o.win * fo), st = Math.round(o.step * fo), mu = [], sd = [], cen = [];
    for (let a = 0; a + W <= N; a += st) { let s = 0, s2 = 0, n = 0; for (let i = a; i < a + W; i += 2) { const v = env[i]; if (v > 0) { const l = Math.log(v); s += l; s2 += l * l; n++; } } const m = n ? s / n : -30; mu.push(m); sd.push(n > 1 ? Math.sqrt(Math.max(1e-12, (s2 - n * m * m) / (n - 1))) : 1); cen.push(a + W / 2); }
    if (!mu.length) return [];
    const sm = a => { const h = 2, o2 = a.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) { s += a[j]; n++; } return s / n; }); return o2; }, M = sm(mu), S = sm(sd);
    const at = (A, i) => { if (i <= cen[0]) return A[0]; if (i >= cen[cen.length - 1]) return A[A.length - 1]; const k = Math.min(cen.length - 2, Math.floor((i - cen[0]) / st)), f = (i - cen[k]) / st; return A[k] * (1 - f) + A[k + 1] * f; };
    const thr = i => { const m = at(M, i), s = at(S, i); return o.k1 * (Math.exp(m - s * s) + Math.exp(m)); };
    const peaks = []; let i = Math.round(fo);
    while (i < N - fo) { const th = thr(i); if (env[i] <= th) { i++; continue; } let j = i; while (j < N - fo && env[j] > thr(j)) j++;   // section au-dessus du seuil [i, j[
      for (let q = i; q < j; q++) if ((q === i || env[q] >= env[q - 1]) && (q === j - 1 || env[q] > env[q + 1])) peaks.push(q); i = j; }
    const out = [], U = Math.round(o.union * fo);
    for (let a = 0; a < peaks.length;) { let b = a; while (b + 1 < peaks.length && peaks[b + 1] - peaks[b] <= U) b++; let best = peaks[a]; for (let q = a; q <= b; q++) if (env[peaks[q]] > env[best]) best = peaks[q];
      const m = at(M, best), s = at(S, best), w = 0.5 + 0.5 * erf((Math.log(env[best]) - m) / (Math.SQRT2 * s)); out.push({ i: best, r: env[best] / thr(best), w }); a = b + 1; }
    return out;
  }
  function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
  /** pointes de toutes les voies (Janča) : X brut (référence moyenne), fs ; o = { band: [10, 60], k1: 3.65, win: 5, step: 1,
   *  union: 0.12, line: 50, merge: 40 ms, minCh: 2 } ; évènement multivoie = détections à ± merge ms, retenu s'il touche ≥ minCh
   *  voies ; temps = maximum de la GFP de Xt (signal de topographie) → [{ t, ch, amp (enveloppe/seuil max), pol, chMax }] */
  function detectSpikesJanca(X, Xt, fs, o, progress) {
    o = Object.assign({ band: [10, 60], k1: 3.65, win: 5, step: 1, union: 0.12, line: 50, merge: 40, minCh: 2 }, o || {});
    const fo = fs > 200 ? 200 : fs, f2 = Math.min(o.band[1], 0.45 * fo), m = X.length, T = X[0].length, cand = [];
    for (let c = 0; c < m; c++) {
      let y = resampleTo(X[c], fs, fo); for (let h = o.line; h > 0 && h <= 1.1 * f2 && h < fo / 2; h += o.line) y = notchZP(y, h, fo);
      for (const d of jancaChannel(bandpass4(y, fo, o.band[0], f2), fo, o)) cand.push({ t: Math.min(T - 1, Math.round(d.i * fs / fo)), c, r: d.r, w: d.w });
      if (progress) progress((c + 1) / m * 0.85);
    }
    cand.sort((p, q) => p.t - q.t); const out = [], mg = Math.round(o.merge / 1000 * fs);
    for (let i = 0; i < cand.length;) {
      let j = i; while (j + 1 < cand.length && cand[j + 1].t - cand[i].t <= mg) j++;
      const grp = cand.slice(i, j + 1), chs = [...new Set(grp.map(x => x.c))]; i = j + 1; if (chs.length < o.minCh) continue;
      const a = Math.max(0, grp[0].t - mg), b = Math.min(T, grp[grp.length - 1].t + mg + 1), g = gfp(Xt, a, b); let tm = a, gm = -1; for (let k = 0; k < g.length; k++) if (g[k] > gm) { gm = g[k]; tm = a + k; }
      const top = grp.reduce((p, q) => q.r > p.r ? q : p); out.push({ t: tm, ch: chs, amp: Math.round(top.r * 100) / 100, pol: Math.sign(Xt[top.c][tm]) || 1, chMax: top.c, w: top.w });
    }
    const keep = []; for (const e of out) { const l = keep[keep.length - 1]; if (l && e.t - l.t < 0.15 * fs) { if (e.amp > l.amp) keep[keep.length - 1] = e; } else keep.push(e); }   // une pointe par 150 ms (pointe-onde)
    if (progress) progress(1); return keep;
  }
  /** évènements donnés par un détecteur externe (SpikeNet) : temps (échantillons) ; srch (s) > 0,06 : le détecteur ne donne
   *  qu'une fenêtre (SpikeNet : 1 s), la composante aiguë y est cherchée à ± srch (pente maximale : GFP de la dérivée), puis
   *  le temps est recalé au maximum de la GFP à ± 40 ms ; voie de plus grande amplitude, polarité ; amps = score du détecteur */
  /** intervalles réunis : [[a, b]] triés, chevauchements fusionnés */
  function mergeSpans(L) { const S = L.filter(x => x && x[1] > x[0]).map(x => x.slice()).sort((p, q) => p[0] - q[0]), out = []; for (const x of S) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x); } return out; }
  function fromTimes(Y, fs, times, amps, srch) {
    const T = Y[0].length, h = Math.round(0.04 * fs), H = Math.round((srch || 0.06) * fs);
    return times.map((t0, k) => { let a = Math.max(1, t0 - H), b = Math.min(T - 1, t0 + H + 1); if (b <= a) return null;
      if (H > 1.5 * h) { let sm = -1, ts = t0; for (let i = a; i < b; i++) { let s = 0; for (const y of Y) { const d = y[i + 1] - y[i - 1]; s += d * d; } if (s > sm) { sm = s; ts = i; } } a = Math.max(0, ts - h); b = Math.min(T, ts + h + 1); }
      const g = gfp(Y, a, b); let tm = a, gm = -1; for (let i = 0; i < g.length; i++) if (g[i] > gm) { gm = g[i]; tm = a + i; }
      let c = 0; for (let i = 1; i < Y.length; i++) if (Math.abs(Y[i][tm]) > Math.abs(Y[c][tm])) c = i; return { t: tm, ch: [c], chMax: c, pol: Math.sign(Y[c][tm]) || 1, amp: amps ? Math.round(amps[k] * 100) / 100 : 1 }; }).filter(Boolean);
  }
  /** topographie d'un évènement (référence moyenne) au temps t : Float32Array m */
  const topoAt = (X, t) => Float32Array.from(X, x => x[t]);
  function corr(a, b) { let sa = 0, sb = 0, sab = 0; for (let i = 0; i < a.length; i++) { sa += a[i] * a[i]; sb += b[i] * b[i]; sab += a[i] * b[i]; } return sab / Math.sqrt(sa * sb || 1e-30); }
  /** regroupement des évènements par topographie (meneur puis réaffectation ; corrélation signée ≥ thr) →
   *  [{ idx: [indices], topo: centroïde }] triés par effectif décroissant ; minN : effectif minimal */
  function clusterTopos(topos, thr, minN) {
    thr = thr || 0.85; const ord = topos.map((t, i) => i).sort((a, b) => norm(topos[b]) - norm(topos[a])), C = [];
    function norm(v) { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s); }
    const add = (c, v) => { const nv = norm(v) || 1; for (let i = 0; i < v.length; i++) c.sum[i] += v[i] / nv; c.n++; };
    for (const i of ord) { let best = null, br = thr; for (const c of C) { const r = corr(c.sum, topos[i]); if (r >= br) { br = r; best = c; } } if (!best) { best = { sum: new Float64Array(topos[i].length), n: 0 }; C.push(best); } add(best, topos[i]); }
    const lab = topos.map(v => { let b = -1, br = thr; C.forEach((c, k) => { const r = corr(c.sum, v); if (r >= br) { br = r; b = k; } }); return b; });
    const out = C.map((c, k) => ({ idx: lab.map((l, i) => l === k ? i : -1).filter(i => i >= 0) })).filter(c => c.idx.length >= (minN || 1));
    for (const c of out) { const s = new Float64Array(topos[0].length); for (const i of c.idx) { const v = topos[i], nv = norm(v) || 1; for (let j = 0; j < s.length; j++) s[j] += v[j] / nv; } c.topo = Float32Array.from(s, x => x / c.idx.length); }
    return out.sort((a, b) => b.idx.length - a.idx.length);
  }
  /** moyenne d'époques [t − pre, t + post[ (échantillons), ligne de base sur [−pre, −pre/2[ → Float32Array[] */
  function averageEpochs(X, times, pre, post) {
    const m = X.length, T = X[0].length, L = pre + post, A = X.map(() => new Float64Array(L)); let n = 0;
    for (const t of times) { if (t - pre < 0 || t + post > T) continue; n++; for (let i = 0; i < m; i++) { const x = X[i]; for (let k = 0; k < L; k++) A[i][k] += x[t - pre + k]; } }
    const nb = Math.max(1, pre >> 1); return { avg: A.map(a => { const y = Float32Array.from(a, v => v / (n || 1)); let b = 0; for (let k = 0; k < nb; k++) b += y[k]; b /= nb; for (let k = 0; k < L; k++) y[k] -= b; return y; }), n };
  }
  /** temps caractéristiques d'une pointe moyennée (GFP) : pic dans ± win autour de c, début = minimum avant le pic
   *  (≤ 100 ms), mi-montée = premier passage à (début + pic) / 2 → indices { peak, onset, half } */
  function spikeTimes(avg, fs, c, win) {
    const g = gfp(avg), w = Math.round((win || 0.05) * fs); let pk = c, pv = -1; for (let t = Math.max(0, c - w); t <= Math.min(g.length - 1, c + w); t++) if (g[t] > pv) { pv = g[t]; pk = t; }
    let on = pk, ov = pv; for (let t = pk; t >= Math.max(0, pk - Math.round(0.1 * fs)); t--) if (g[t] < ov) { ov = g[t]; on = t; }
    const half = (ov + pv) / 2; let hf = pk; for (let t = on; t <= pk; t++) if (g[t] >= half) { hf = t; break; }
    return { peak: pk, onset: on, half: hf, gfp: g };
  }

  // ================================================================ composantes (ACP, FastICA)
  /** covariance spatiale d'un bloc (m × T) → Float64Array m × m */
  function covariance(X, a, b) { const m = X.length; a = a || 0; b = b == null ? X[0].length : b; const C = new Float64Array(m * m), N = Math.max(1, b - a); const mu = X.map(x => { let s = 0; for (let t = a; t < b; t++) s += x[t]; return s / N; }); for (let i = 0; i < m; i++) for (let j = i; j < m; j++) { let s = 0; const xi = X[i], xj = X[j], mi = mu[i], mj = mu[j]; for (let t = a; t < b; t++) s += (xi[t] - mi) * (xj[t] - mj); C[i * m + j] = C[j * m + i] = s / N; } return C; }
  /** composantes principales : { val, vec (colonnes), explained (parts de variance) } */
  function pca(X, a, b) { const m = X.length, E = eigSym(covariance(X, a, b), m); let tot = 0; for (const v of E.val) tot += Math.max(0, v); return { val: E.val, vec: E.vec, explained: Array.from(E.val, v => Math.max(0, v) / (tot || 1)), m }; }
  /** FastICA symétrique (tanh) sur k composantes principales → { A (m × k : topographies), S (k × T), W } */
  function fastica(X, k, o) {
    o = o || {}; const m = X.length, T = X[0].length, P = pca(X); k = Math.min(k || m, m, P.explained.filter(e => e > 1e-6).length);
    const mu = X.map(x => { let s = 0; for (const v of x) s += v; return s / T; });
    const Z = []; for (let c = 0; c < k; c++) { const z = new Float64Array(T), s = 1 / Math.sqrt(Math.max(1e-30, P.val[c])); for (let t = 0; t < T; t++) { let v = 0; for (let i = 0; i < m; i++) v += P.vec[i * m + c] * (X[i][t] - mu[i]); z[t] = v * s; } Z.push(z); }
    let seed = o.seed || 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;
    let W = Array.from({ length: k }, () => Float64Array.from({ length: k }, rnd));
    const sym = W0 => { const M = new Float64Array(k * k); for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { let s = 0; for (let c = 0; c < k; c++) s += W0[i][c] * W0[j][c]; M[i * k + j] = s; } const E = eigSym(M, k), D = new Float64Array(k * k); for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { let s = 0; for (let c = 0; c < k; c++) s += E.vec[i * k + c] * E.vec[j * k + c] / Math.sqrt(Math.max(1e-30, E.val[c])); D[i * k + j] = s; } return W0.map((_, i) => Float64Array.from({ length: k }, (__, j) => { let s = 0; for (let c = 0; c < k; c++) s += D[i * k + c] * W0[c][j]; return s; })); };
    W = sym(W);
    for (let it = 0; it < (o.iter || 200); it++) {
      const Wn = W.map(w => { const g1 = new Float64Array(k); let gp = 0; for (let t = 0; t < T; t++) { let y = 0; for (let c = 0; c < k; c++) y += w[c] * Z[c][t]; const th = Math.tanh(y); for (let c = 0; c < k; c++) g1[c] += Z[c][t] * th; gp += 1 - th * th; } return Float64Array.from(g1, (v, c) => v / T - gp / T * w[c]); });
      const Ws = sym(Wn); let lim = 0; for (let i = 0; i < k; i++) { let d = 0; for (let c = 0; c < k; c++) d += Ws[i][c] * W[i][c]; lim = Math.max(lim, Math.abs(Math.abs(d) - 1)); } W = Ws; if (lim < 1e-6) break;
    }
    // topographies (mélange) : A = E D^{1/2} Wᵀ ; sources S = W Z
    const A = Array.from({ length: k }, (_, j) => Float32Array.from({ length: m }, (__, i) => { let s = 0; for (let c = 0; c < k; c++) s += P.vec[i * m + c] * Math.sqrt(Math.max(0, P.val[c])) * W[j][c]; return s; }));
    const S = W.map(w => { const y = new Float32Array(T); for (let t = 0; t < T; t++) { let v = 0; for (let c = 0; c < k; c++) v += w[c] * Z[c][t]; y[t] = v; } return y; });
    return { A, S, W, k };
  }

  /** covariance du bruit de fond : échantillons hors des fenêtres ± guard (s) autour des évènements, au plus maxS secondes
   *  (Parra-Díaz 2026 : 90 à 120 s sans pointe) → { C (m × m), sec } */
  function cleanCov(Y, times, fs, guard, maxS) {
    const m = Y.length, T = Y[0].length, bad = new Uint8Array(T), g = Math.round((guard || 0.5) * fs);
    for (const t of times) for (let i = Math.max(0, t - g); i < Math.min(T, t + g); i++) bad[i] = 1;
    let free = 0; for (let i = 0; i < T; i++) if (!bad[i]) free++;
    const step = Math.max(1, Math.floor(free / ((maxS || 120) * fs))), mu = new Float64Array(m), C = new Float64Array(m * m); let N = 0;
    for (let i = 0, k = 0; i < T; i++) { if (bad[i] || (k++ % step)) continue; N++; for (let a = 0; a < m; a++) mu[a] += Y[a][i]; }
    for (let a = 0; a < m; a++) mu[a] /= N || 1;
    for (let i = 0, k = 0; i < T; i++) { if (bad[i] || (k++ % step)) continue; for (let a = 0; a < m; a++) { const xa = Y[a][i] - mu[a]; for (let b = a; b < m; b++) C[a * m + b] += xa * (Y[b][i] - mu[b]); } }
    for (let a = 0; a < m; a++) for (let b = a; b < m; b++) C[b * m + a] = C[a * m + b] /= N || 1;
    return { C, sec: N * step / fs };
  }
  /** blanchiment par une covariance de bruit en référence moyenne : régularisation (reg × moyenne de la diagonale, comme
   *  Brainstorm), projection hors de la direction commune, W = Λ^-1/2 Uᵀ sur les m − 1 axes restants → { W (r × m), r } */
  function whitener(C0, m, reg) {
    const C = new Float64Array(m * m); let tr = 0; for (let i = 0; i < m; i++) tr += C0[i * m + i]; const lam = (reg == null ? 0.1 : reg) * tr / m;
    const H = (i, j) => (i === j ? 1 : 0) - 1 / m;   // centrage (référence moyenne)
    const A = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) A[i * m + j] = C0[i * m + j] + (i === j ? lam : 0);
    const T = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += H(i, k) * A[k * m + j]; T[i * m + j] = s; }
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < m; k++) s += T[i * m + k] * H(k, j); C[i * m + j] = s; }
    const E = eigSym(C, m), r = m - 1, W = new Float64Array(r * m);
    for (let c = 0; c < r; c++) { const s = 1 / Math.sqrt(Math.max(E.val[c], 1e-30)); for (let i = 0; i < m; i++) W[c * m + i] = E.vec[i * m + c] * s; }
    return { W, r, m };
  }
  /** W (r × m) appliqué à un gain (m × k) → r × k (Float32Array) ; à un vecteur ; à une covariance (W C Wᵀ) */
  function whitenL(Wt, L, k) { const { W, r, m } = Wt, out = new Float32Array(r * k); for (let a = 0; a < r; a++) for (let i = 0; i < m; i++) { const w = W[a * m + i]; if (!w) continue; const o = a * k, q = i * k; for (let j = 0; j < k; j++) out[o + j] += w * L[q + j]; } return out; }
  function whitenV(Wt, v) { const { W, r, m } = Wt, out = new Float64Array(r); for (let a = 0; a < r; a++) { let s = 0; for (let i = 0; i < m; i++) s += W[a * m + i] * v[i]; out[a] = s; } return out; }
  function whitenC(Wt, C) { const { W, r, m } = Wt, T = new Float64Array(r * m), out = new Float64Array(r * r); for (let a = 0; a < r; a++) for (let j = 0; j < m; j++) { let s = 0; for (let i = 0; i < m; i++) s += W[a * m + i] * C[i * m + j]; T[a * m + j] = s; } for (let a = 0; a < r; a++) for (let b = 0; b < r; b++) { let s = 0; for (let j = 0; j < m; j++) s += T[a * m + j] * W[b * m + j]; out[a * r + b] = s; } return out; }
  /** formeur de voie LCMV (orientation libre, Van Veen 1997) sur des gains et données blanchis : filtre Wⱼ = (LⱼᵀC⁻¹Lⱼ)⁻¹LⱼᵀC⁻¹,
   *  indice d'activité ‖Wⱼ v‖² / trace(WⱼWⱼᵀ) (gain unitaire du bruit) — v absent : puissance de la fenêtre trace(WⱼCWⱼᵀ) =
   *  trace((LⱼᵀC⁻¹Lⱼ)⁻¹) ; C : covariance des données (r × r), régularisée → Float32Array n */
  function lcmvPower(L, r, n, C0, v, reg) {
    const C = Float64Array.from(C0); let tr = 0; for (let i = 0; i < r; i++) tr += C[i * r + i]; const lam = (reg == null ? 0.05 : reg) * tr / r; for (let i = 0; i < r; i++) C[i * r + i] += lam;
    const Ci = cholInv(chol(C, r), r), k = 3 * n, out = new Float32Array(n), CL = new Float64Array(3 * r), CCL = new Float64Array(3 * r), Cv = new Float64Array(r);
    if (v) for (let i = 0; i < r; i++) { let s = 0; for (let c = 0; c < r; c++) s += Ci[i * r + c] * v[c]; Cv[i] = s; }
    for (let j = 0; j < n; j++) {
      for (let q = 0; q < 3; q++) for (let i = 0; i < r; i++) { let s = 0; for (let c = 0; c < r; c++) s += Ci[i * r + c] * L[c * k + 3 * j + q]; CL[q * r + i] = s; }
      const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0]; for (let p = 0; p < 3; p++) { for (let i = 0; i < r; i++) b[p] += L[i * k + 3 * j + p] * Cv[i]; for (let q = 0; q < 3; q++) { let s = 0; for (let i = 0; i < r; i++) s += L[i * k + 3 * j + p] * CL[q * r + i]; A[p * 3 + q] = s; } }
      const Ai = inv3(A), y = [0, 1, 2].map(p => Ai[p * 3] * b[0] + Ai[p * 3 + 1] * b[1] + Ai[p * 3 + 2] * b[2]);
      // trace(Wⱼ Wⱼᵀ) = trace(Ai Lᵀ C⁻² L Ai)
      for (let q = 0; q < 3; q++) for (let i = 0; i < r; i++) { let s = 0; for (let c = 0; c < r; c++) s += Ci[i * r + c] * CL[q * r + c]; CCL[q * r + i] = s; }
      const B = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) { let s = 0; for (let i = 0; i < r; i++) s += L[i * k + 3 * j + p] * CCL[q * r + i]; B[p * 3 + q] = s; }
      let ng = 0; for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) { let s = 0; for (let t = 0; t < 3; t++) s += B[q * 3 + t] * Ai[t * 3 + p]; ng += Ai[p * 3 + q] * s; }
      out[j] = (v ? y[0] * y[0] + y[1] * y[1] + y[2] * y[2] : Ai[0] + Ai[4] + Ai[8]) / (ng || 1e-30);
    }
    return out;
  }

  /** détection sur des voies brutes (worker) : filtre, référence moyenne, pointes → { ev: [{ t, c, amp, pol }], topo: [[m]],
   *  noise : covariance hors pointes (± 0,5 s, ≤ 120 s), sec } */
  function spikeScan(Xs, fs, f1, f2, k, progress, o) {
    if (typeof progress === 'object' && progress) { const t = o; o = progress; progress = t; }   // (…, o, progress) depuis le worker
    o = o || {}; const Y = avgRefData(Xs.map(x => bandpass(x, fs, f1, f2)));
    const ev = o.times ? fromTimes(Y, fs, o.times, o.amps, o.srch) : o.det === 'morph' ? detectSpikes(Y, fs, { k }, progress) : detectSpikesJanca(avgRefData(Xs), Y, fs, { k1: o.k1 || 3.65, line: o.line || 50, minCh: o.minCh || 2 }, progress), N = cleanCov(Y, ev.map(e => e.t), fs, 0.5, 120);
    return { ev: ev.map(e => ({ t: e.t, c: e.chMax, amp: e.amp, pol: e.pol, n: e.ch.length })), topo: ev.map(e => Array.from(topoAt(Y, e.t))), noise: Array.from(N.C), sec: N.sec, det: o.times ? (o.det || 'ext') : o.det === 'morph' ? 'morph' : 'janca' };
  }

  SV.ESI = { bipName, recordedMontage, hjorth, splineWeights, mergeSpans, spikeScan, detectSpikesJanca, jancaChannel, envelope, bandpass4, resampleTo, cleanCov, whitener, whitenL, whitenV, whitenC, lcmvPower, STD, stdName, scalpChannels, isScalp, scalpPairs, scalpRegion, scalpRank, CHAINS, chol, cholSolve, eigSym, inv3, fitSphere, shellCoeffs, sphereModel, sphereGain, sphereLeadfield, infiniteGain, infiniteLeadfield, avgRefCols, avgRefVec,
    sloretaOperator, sloretaPower, sloretaPowerCov, fitMoment, fitDipole, bandpass, welch, dominantFreq, dominantRatio, avgRefData, gfp, robustScale, detectSpikes, topoAt, corr, clusterTopos, averageEpochs, spikeTimes, covariance, pca, fastica };
});
