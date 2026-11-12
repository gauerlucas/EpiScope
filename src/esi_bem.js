/* EpiScope — esi_bem.js (v5.4) : modèle de tête réaliste à 3 couches (méthode des éléments de frontière, BEM) pour l'EEG
 * de scalp, sans dépendance, utilisable dans un worker.
 *
 *   Surfaces : scalp, crâne externe, crâne interne, emboîtées et « étoilées » autour du centre de la tête (même
 *     triangulation géodésique pour les trois : elles ne peuvent pas se croiser si leurs rayons sont ordonnés). Elles sont
 *     construites à partir de rayons mesurés (esi_ui.js : scalp du T1, masque du cerveau) comme la méthode « Brainstorm » de
 *     génération des surfaces BEM (enveloppes du cortex et de la tête, crâne entre les deux).
 *   Solveur : collocation linéaire avec déflation et approche du problème isolé pour le crâne peu conducteur (Hämäläinen &
 *     Sarvas 1989), transcription de la solution de MNE (fwd_bem_linear_collocation) ; facteur LU de la matrice conservé
 *     pour recalculer en quelques dixièmes de seconde le transfert vers des électrodes déplacées.
 *   Conductivités selon l'âge : rapport cerveau / os 50 chez l'adulte (méta-analyse de McCann 2019), ≈ 11 à 1 an
 *     (Akalin Acar 2016), ≈ 4 chez le nouveau-né dont l'os est peu ossifié (Odabaee 2014) ; épaisseurs d'os et de scalp
 *     selon l'âge (croissance rapide de l'os la 1re année, Delye 2015). Fontanelles non représentées (effet faible quand
 *     l'os du nourrisson est conducteur : Gargiulo 2015).
 *   Unités : mm ; gains en 1/(S·mm²) comme le modèle sphérique d'esi.js (comparables terme à terme). */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).bem = factory;
})(function (SV) {
  'use strict';
  const PI2 = 2 * Math.PI;

  // ================================================================ sphère géodésique (icosaèdre subdivisé ν fois)
  /** → { rr (unitaires, Float64Array 3·np), tris (Uint32Array, orientés vers l'extérieur), np, ntri, nb (voisins) } ; np = 10ν² + 2 */
  function geoSphere(nu) {
    const t = (1 + Math.sqrt(5)) / 2, V0 = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const F0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const P = [], key = new Map(), tris = [];
    const vid = p => { const n = Math.hypot(p[0], p[1], p[2]), q = [p[0] / n, p[1] / n, p[2] / n], k = q.map(x => Math.round(x * 1e6)).join(','); let i = key.get(k); if (i == null) { i = P.length; P.push(q); key.set(k, i); } return i; };
    for (const f of F0) {
      const [A, B, C] = f.map(i => V0[i]), id = [];
      let ccw = 0; { const u = B.map((x, k) => x - A[k]), v = C.map((x, k) => x - A[k]), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; ccw = n[0] * (A[0] + B[0] + C[0]) + n[1] * (A[1] + B[1] + C[1]) + n[2] * (A[2] + B[2] + C[2]) > 0; }
      const [a, b, c] = ccw ? [A, B, C] : [A, C, B];
      for (let i = 0; i <= nu; i++) { id[i] = []; for (let j = 0; i + j <= nu; j++) id[i][j] = vid([0, 1, 2].map(k => a[k] + (b[k] - a[k]) * i / nu + (c[k] - a[k]) * j / nu)); }
      for (let i = 0; i < nu; i++) for (let j = 0; i + j < nu; j++) { tris.push(id[i][j], id[i + 1][j], id[i][j + 1]); if (i + j + 1 < nu) tris.push(id[i + 1][j], id[i + 1][j + 1], id[i][j + 1]); }
    }
    const np = P.length, rr = new Float64Array(3 * np); P.forEach((p, i) => rr.set(p, 3 * i));
    const nb = Array.from({ length: np }, () => new Set()); for (let f = 0; f < tris.length; f += 3) for (let a = 0; a < 3; a++) { nb[tris[f + a]].add(tris[f + (a + 1) % 3]); nb[tris[f + a]].add(tris[f + (a + 2) % 3]); }
    return { rr, tris: Uint32Array.from(tris), np, ntri: tris.length / 3, nb: nb.map(s => Int32Array.from(s)) };
  }
  /** surface étoilée : directions unitaires u (sphère géodésique), rayons r (np) autour du centre c → { rr (mm), tris, np, ntri } */
  function radialSurface(G, c, r) { const rr = new Float64Array(3 * G.np); for (let i = 0; i < G.np; i++) for (let k = 0; k < 3; k++) rr[3 * i + k] = c[k] + G.rr[3 * i + k] * r[i]; return { rr, tris: G.tris, np: G.np, ntri: G.ntri }; }
  /** lissage d'une fonction sur la sphère (moyenne avec les voisins, w = poids du point) */
  function smoothOn(G, f, iter, w) { let a = Float64Array.from(f); w = w == null ? 0.5 : w; for (let it = 0; it < iter; it++) { const b = new Float64Array(a.length); for (let i = 0; i < G.np; i++) { let s = 0; const N = G.nb[i]; for (let k = 0; k < N.length; k++) s += a[N[k]]; b[i] = w * a[i] + (1 - w) * s / N.length; } a = b; } return a; }

  // ================================================================ paramètres selon l'âge
  const lerpTab = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i], f = (x - x0) / (x1 - x0); return y0 + (y1 - y0) * f; } return T[T.length - 1][1]; };
  /** âge (années, null = adulte) → { bscr (rapport cerveau / os), skull, scalp (épaisseurs minimales, mm), csf (mm), sigma: [scalp, os, cerveau] (S/m) } */
  function ageParams(age) {
    const a = age == null || !isFinite(age) ? 30 : Math.max(0, age);
    const bscr = lerpTab([[0, 4], [0.5, 8], [1, 11], [2, 15], [5, 22], [10, 32], [18, 50]], a);
    const skull = lerpTab([[0, 1.5], [0.5, 2.2], [1, 2.8], [2, 3.4], [5, 4.3], [10, 5.2], [18, 6.5]], a), scalp = lerpTab([[0, 2.5], [2, 3.2], [10, 4.2], [18, 5]], a), brain = 0.33;
    return { age: age == null ? null : a, bscr, skull, scalp, csf: 2.5, sigma: [0.33, brain / bscr, brain] };
  }

  // ================================================================ surfaces de la tête à partir de rayons mesurés
  /** o = { c (centre), zCut (plan sous le cervelet : en dessous, le masque n'est plus que tronc et moelle), brainAt(p) → bool,
   *  scalpAt(p) → true | false | null (hors du champ de l'IRM), ou scalpPts (points du scalp : électrodes du gabarit),
   *  P (ageParams), nu (8) } → { surfs: [scalp, crâne externe, crâne interne], G, r: { sc, os, is }, stats }.
   *  Rayons mesurés sur 5762 directions puis ramenés aux 642 sommets : enveloppe du cerveau (maximum) + LCR, scalp (médiane,
   *  oreilles et nez lissés), plan de coupe sous la tête (cou) ; os d'épaisseur fixée par l'âge, scalp d'épaisseur minimale. */
  function headSurfaces(o) {
    const P = o.P || ageParams(null), c = o.c, G = geoSphere(o.nu || 8), D = geoSphere(24), cell = new Int32Array(D.np);
    for (let d = 0; d < D.np; d++) { let b = -2, bi = 0; for (let i = 0; i < G.np; i++) { const s = D.rr[3 * d] * G.rr[3 * i] + D.rr[3 * d + 1] * G.rr[3 * i + 1] + D.rr[3 * d + 2] * G.rr[3 * i + 2]; if (s > b) { b = s; bi = i; } } cell[d] = bi; }
    const zSc = o.zCut - (P.csf + P.skull + P.scalp + 4), rb = new Float64Array(D.np), rs = new Float64Array(D.np).fill(NaN), at = (u, t) => [c[0] + u[0] * t, c[1] + u[1] * t, c[2] + u[2] * t];
    for (let d = 0; d < D.np; d++) {
      const u = [D.rr[3 * d], D.rr[3 * d + 1], D.rr[3 * d + 2]], tCut = u[2] < -1e-6 ? (o.zCut - c[2]) / u[2] : Infinity, tSc = u[2] < -1e-6 ? (zSc - c[2]) / u[2] : Infinity;
      for (let t = 0; t < Math.min(150, tCut); t += 0.5) if (o.brainAt(at(u, t))) rb[d] = t;
      if (rb[d] === 0) rb[d] = Math.min(tCut, 40);
      if (o.scalpAt) { const t0 = Math.min(170, tSc); let run = 0, first = true;
        for (let t = t0; t > rb[d]; t -= 0.5) { const v = o.scalpAt(at(u, t)); if (v == null) { run = 0; continue; } if (first) { first = false; if (v) { if (t0 === tSc) rs[d] = tSc; break; } } if (v) { if (++run >= 3) { rs[d] = Math.min(t0, t + 1); break; } } else run = 0; } }
    }
    if (o.scalpPts) {   // gabarit : rayon du scalp interpolé entre les électrodes standard (pondération angulaire), cou plan
      const Q = o.scalpPts.map(p => { const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], r = Math.hypot(v[0], v[1], v[2]); return [v[0] / r, v[1] / r, v[2] / r, r]; });
      for (let d = 0; d < D.np; d++) { const u = [D.rr[3 * d], D.rr[3 * d + 1], D.rr[3 * d + 2]]; let sw = 0, sr = 0; for (const q of Q) { const a = Math.acos(Math.max(-1, Math.min(1, u[0] * q[0] + u[1] * q[1] + u[2] * q[2]))); if (a > 0.6) continue; const w = Math.exp(-((a / 0.2) ** 2)); sw += w; sr += w * q[3]; }
        const tSc = u[2] < -1e-6 ? (zSc - c[2]) / u[2] : Infinity; rs[d] = sw > 1e-3 ? Math.min(sr / sw, tSc) : (isFinite(tSc) ? tSc : NaN); }
    }
    // sommets : enveloppe du cerveau (max de la cellule), scalp (médiane de la cellule) ; trous comblés par les voisins
    const brain = new Float64Array(G.np), cells = Array.from({ length: G.np }, () => []); for (let d = 0; d < D.np; d++) { brain[cell[d]] = Math.max(brain[cell[d]], rb[d]); if (isFinite(rs[d])) cells[cell[d]].push(rs[d]); }
    let sc = Float64Array.from(cells, a => { if (!a.length) return NaN; a.sort((x, y) => x - y); return a[a.length >> 1]; });
    for (let pass = 0; pass < 60 && sc.some(x => !isFinite(x)); pass++) { const s2 = Float64Array.from(sc); for (let i = 0; i < G.np; i++) if (!isFinite(sc[i])) { let s = 0, n = 0; for (const j of G.nb[i]) if (isFinite(sc[j])) { s += sc[j]; n++; } if (n) s2[i] = s / n; } sc = s2; }
    if (sc.some(x => !isFinite(x))) throw new Error('scalp introuvable sur l’IRM');
    const floorI = Float64Array.from(brain, x => x + 1);
    let ri = smoothOn(G, Float64Array.from(brain, x => x + P.csf), 3, 0.5); ri = ri.map((x, i) => Math.max(x, floorI[i]));
    sc = smoothOn(G, sc, 2, 0.5); sc = sc.map((x, i) => Math.max(x, ri[i] + 0.5 * (P.skull + P.scalp)));
    let ro = Float64Array.from(ri, (x, i) => { const av = sc[i] - x; return av - P.scalp >= 0.6 * P.skull ? x + Math.min(P.skull, av - P.scalp) : x + av * P.skull / (P.skull + P.scalp); });
    ro = smoothOn(G, ro, 1, 0.6).map((x, i) => Math.min(sc[i] - 1, Math.max(ri[i] + 1, x)));
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length, up = [...Array(G.np).keys()].filter(i => G.rr[3 * i + 2] > 0.2);
    const stats = { rScalp: mean(up.map(i => sc[i])), skull: mean(up.map(i => ro[i] - ri[i])), scalp: mean(up.map(i => sc[i] - ro[i])), csf: P.csf, zCut: o.zCut };
    return { G, r: { sc, os: ro, is: ri }, surfs: [radialSurface(G, c, sc), radialSurface(G, c, ro), radialSurface(G, c, ri)], stats };
  }
  /** intersection du rayon c + t·u (t > 0) avec une surface → t (ou null) */
  function rayHit(S, c, u) {
    let best = null; const t = S.tris, r = S.rr;
    for (let f = 0; f < S.ntri; f++) {
      const i0 = 3 * t[3 * f], i1 = 3 * t[3 * f + 1], i2 = 3 * t[3 * f + 2], e1 = [r[i1] - r[i0], r[i1 + 1] - r[i0 + 1], r[i1 + 2] - r[i0 + 2]], e2 = [r[i2] - r[i0], r[i2 + 1] - r[i0 + 1], r[i2 + 2] - r[i0 + 2]];
      const p = [u[1] * e2[2] - u[2] * e2[1], u[2] * e2[0] - u[0] * e2[2], u[0] * e2[1] - u[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) continue;
      const s = [c[0] - r[i0], c[1] - r[i0 + 1], c[2] - r[i0 + 2]], a = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det; if (a < -1e-9 || a > 1 + 1e-9) continue;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], b = (u[0] * q[0] + u[1] * q[1] + u[2] * q[2]) / det; if (b < -1e-9 || a + b > 1 + 1e-9) continue;
      const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; if (tt > 0 && (best == null || tt < best)) best = tt;
    }
    return best;
  }
  /** points posés sur la surface S dans leur direction depuis c */
  function onSurface(S, c, P) { return P.map(p => { const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], r = Math.hypot(v[0], v[1], v[2]) || 1, u = [v[0] / r, v[1] / r, v[2] / r], t = rayHit(S, c, u); return t == null ? p.slice() : [c[0] + u[0] * t, c[1] + u[1] * t, c[2] + u[2] * t]; }); }

  // ================================================================ BEM : coefficients de collocation linéaire (d'après MNE)
  /** coefficients du potentiel linéaire d'un triangle (sommets y1 y2 y3, normale nn, aire A) vus des points fr (3·nf) →
   *  ajoutés (signe −) dans la ligne de chaque point, colonnes des 3 sommets ; skip(i) : point appartenant au triangle */
  function triCoeffs(fr, nf, y, nn, A, cols, M, rowOff, ld, skip) {
    const e = [[y[3] - y[0], y[4] - y[1], y[5] - y[2]], [y[6] - y[3], y[7] - y[4], y[8] - y[5]], [y[0] - y[6], y[1] - y[7], y[2] - y[8]]];
    const es = e.map(v => Math.hypot(v[0], v[1], v[2])), eu = e.map((v, k) => [v[0] / es[k], v[1] / es[k], v[2] / es[k]]);
    const area2 = 2 * A, n2 = 1 / (area2 * area2);
    for (let i = 0; i < nf; i++) {
      if (skip && skip(i)) continue;
      const x0 = fr[3 * i], x1 = fr[3 * i + 1], x2 = fr[3 * i + 2];
      const a0 = y[0] - x0, a1 = y[1] - x1, a2 = y[2] - x2, b0 = y[3] - x0, b1 = y[4] - x1, b2 = y[5] - x2, c0 = y[6] - x0, c1 = y[7] - x1, c2 = y[8] - x2;
      const ab0 = a1 * b2 - a2 * b1, ab1 = a2 * b0 - a0 * b2, ab2 = a0 * b1 - a1 * b0, triple = ab0 * c0 + ab1 * c1 + ab2 * c2;
      const l1 = Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2), l2 = Math.sqrt(b0 * b0 + b1 * b1 + b2 * b2), l3 = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);
      const ss = l1 * l2 * l3 + (a0 * b0 + a1 * b1 + a2 * b2) * l3 + (a0 * c0 + a1 * c1 + a2 * c2) * l2 + (b0 * c0 + b1 * c1 + b2 * c2) * l1;
      const solid = Math.atan2(triple, ss); if (Math.abs(solid) < Math.PI / 1e6) continue;
      // « vecteur oméga » : intégrales de 1/r sur les arêtes
      const be = (p0, p1, p2, lp, q0, q1, q2, lq, k) => { const u = eu[k]; return Math.log((lp + p0 * u[0] + p1 * u[1] + p2 * u[2]) / (lq + q0 * u[0] + q1 * u[1] + q2 * u[2])) / es[k]; };
      const B0 = be(a0, a1, a2, l1, b0, b1, b2, l2, 0), B1 = be(b0, b1, b2, l2, c0, c1, c2, l3, 1), B2 = be(c0, c1, c2, l3, a0, a1, a2, l1, 2);
      const w0 = (B2 - B0) * a0 + (B0 - B1) * b0 + (B1 - B2) * c0, w1 = (B2 - B0) * a1 + (B0 - B1) * b1 + (B1 - B2) * c1, w2 = (B2 - B0) * a2 + (B0 - B1) * b2 + (B1 - B2) * c2;
      const s2 = 2 * solid, row = (rowOff + i) * ld;
      // k = 0 : diff = v3 − v2, zdots = (v2 × v3)·n ; k = 1 : v1 − v3, (v3 × v1)·n ; k = 2 : v2 − v1, (v1 × v2)·n
      const z0 = (b1 * c2 - b2 * c1) * nn[0] + (b2 * c0 - b0 * c2) * nn[1] + (b0 * c1 - b1 * c0) * nn[2];
      const z1 = (c1 * a2 - c2 * a1) * nn[0] + (c2 * a0 - c0 * a2) * nn[1] + (c0 * a1 - c1 * a0) * nn[2];
      const z2 = ab0 * nn[0] + ab1 * nn[1] + ab2 * nn[2];
      M[row + cols[0]] += n2 * (area2 * z0 * s2 - triple * ((c0 - b0) * w0 + (c1 - b1) * w1 + (c2 - b2) * w2));
      M[row + cols[1]] += n2 * (area2 * z1 * s2 - triple * ((a0 - c0) * w0 + (a1 - c1) * w1 + (a2 - c2) * w2));
      M[row + cols[2]] += n2 * (area2 * z2 * s2 - triple * ((b0 - a0) * w0 + (b1 - a1) * w1 + (b2 - a2) * w2));
    }
  }
  function triGeom(S, f) { const t = S.tris, i0 = 3 * t[3 * f], i1 = 3 * t[3 * f + 1], i2 = 3 * t[3 * f + 2], r = S.rr, y = [r[i0], r[i0 + 1], r[i0 + 2], r[i1], r[i1 + 1], r[i1 + 2], r[i2], r[i2 + 1], r[i2 + 2]];
    const u = [y[3] - y[0], y[4] - y[1], y[5] - y[2]], v = [y[6] - y[0], y[7] - y[1], y[8] - y[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]);
    return { y, nn: [n[0] / l, n[1] / l, n[2] / l], A: l / 2 }; }
  /** matrice des coefficients (ntot × ntot, ligne = point de collocation) pour des surfaces de l'extérieur vers l'intérieur */
  function linPotCoeff(surfs, progress) {
    const nps = surfs.map(s => s.np), ntot = nps.reduce((a, b) => a + b, 0), off = [0]; nps.forEach(n => off.push(off[off.length - 1] + n));
    const C = new Float64Array(ntot * ntot); let done = 0; const work = surfs.length * surfs.reduce((s, x) => s + x.ntri, 0);
    surfs.forEach((S1, a) => surfs.forEach((S2, b) => {
      for (let f = 0; f < S2.ntri; f++) {
        const g = triGeom(S2, f), tri = [S2.tris[3 * f], S2.tris[3 * f + 1], S2.tris[3 * f + 2]], cols = tri.map(v => off[b] + v);
        triCoeffs(S1.rr, S1.np, g.y, g.nn, g.A, cols, C, off[a], ntot, a === b ? i => i === tri[0] || i === tri[1] || i === tri[2] : null);
        if (progress && (++done & 255) === 0) progress(done / work);
      }
      if (a === b) {   // élément propre (singulier) : complète l'angle solide à 2π, moitié au sommet, reste aux voisins
        const memb = Array.from({ length: S1.np }, () => []); for (let f = 0; f < S1.ntri; f++) for (let k = 0; k < 3; k++) memb[S1.tris[3 * f + k]].push(f);
        for (let j = 0; j < S1.np; j++) {
          const row = (off[a] + j) * ntot; let s = 0; for (let k = 0; k < S1.np; k++) s += C[row + off[a] + k];
          let miss = PI2 - s; C[row + off[a] + j] = miss / 2; miss /= 4 * memb[j].length;
          for (const f of memb[j]) for (let k = 0; k < 3; k++) { const v = S1.tris[3 * f + k]; if (v !== j) C[row + off[a] + v] += miss; }
        }
      }
    }));
    return { C, nps, off, ntot };
  }

  // ================================================================ algèbre : LU dense à pivot partiel (ligne par ligne)
  /** LU par blocs de colonnes (panneau de NB colonnes factorisé, puis mise à jour du reste ligne par ligne : chaque ligne
   *  reste en cache pendant les NB mises à jour de rang 1 — 2 à 3 fois plus rapide que la version élémentaire) */
  function luFactor(A, n, progress) {
    const piv = new Int32Array(n), NB = 48; for (let i = 0; i < n; i++) piv[i] = i;
    for (let k0 = 0; k0 < n; k0 += NB) {
      const k1 = Math.min(n, k0 + NB);
      for (let k = k0; k < k1; k++) {   // panneau
        let p = k, mx = Math.abs(A[k * n + k]); for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > mx) { mx = v; p = i; } }
        if (p !== k) { const rk = k * n, rp = p * n; for (let j = 0; j < n; j++) { const t = A[rk + j]; A[rk + j] = A[rp + j]; A[rp + j] = t; } const t = piv[k]; piv[k] = piv[p]; piv[p] = t; }
        const rk = k * n, d = A[rk + k] || 1e-300;
        for (let i = k + 1; i < n; i++) { const ri = i * n, f = (A[ri + k] /= d); if (f !== 0) for (let j = k + 1; j < k1; j++) A[ri + j] -= f * A[rk + j]; }
      }
      for (let k = k0; k < k1; k++) { const rk = k * n; for (let i = k + 1; i < k1; i++) { const ri = i * n, f = A[ri + k]; if (f !== 0) for (let j = k1; j < n; j++) A[ri + j] -= f * A[rk + j]; } }   // U₁₂
      for (let i = k1; i < n; i++) { const ri = i * n; for (let k = k0; k < k1; k++) { const f = A[ri + k]; if (f === 0) continue; const rk = k * n; for (let j = k1; j < n; j++) A[ri + j] -= f * A[rk + j]; } }   // A₂₂ −= L₂₁ U₁₂
      if (progress) progress(1 - Math.pow(1 - k1 / n, 3));
    }
    return piv;
  }
  /** résout Aᵀ x = b avec le facteur LU de A (P A = L U) */
  function luSolveT(LU, piv, n, b) {
    const z = Float64Array.from(b);   // balayages par lignes du facteur (accès contigus)
    for (let k = 0; k < n; k++) { const r = k * n, zk = (z[k] /= LU[r + k]); if (zk) for (let i = k + 1; i < n; i++) z[i] -= LU[r + i] * zk; }   // Uᵀ z = b
    for (let k = n - 1; k > 0; k--) { const r = k * n, zk = z[k]; if (zk) for (let i = 0; i < k; i++) z[i] -= LU[r + i] * zk; }                 // Lᵀ y = z (diagonale unité)
    const x = new Float64Array(n); for (let i = 0; i < n; i++) x[piv[i]] = z[i]; return x;
  }
  function luSolve(LU, piv, n, b) {
    const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[piv[i]]; for (let k = 0; k < i; k++) s -= LU[i * n + k] * y[k]; y[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= LU[i * n + k] * y[k]; y[i] = s / LU[i * n + i]; } return y;
  }

  // ================================================================ solution BEM
  /** surfs : [scalp, crâne externe, crâne interne] ; sigma : [scalp, os, cerveau] → modèle { surfs, sigma, LU, piv, n, nps, off,
   *  ip (problème isolé : inverse homogène du crâne interne) | null, ipMult, mult (facteur source par sommet) } */
  function solve(surfs, sigma, progress) {
    const prog = progress || (() => {}), K = linPotCoeff(surfs, p => prog(0.25 * p)), { C, nps, off, ntot } = K, ns = surfs.length;
    const sg = [0].concat(sigma), gamma = (a, b) => (sg[b + 1] - sg[b]) / (sg[a + 1] + sg[a]), defl = 1 / ntot;
    // problème isolé (os peu conducteur) : solution homogène du crâne interne seul, avant que C ne soit écrasée
    const ipMult = ns === 3 ? sigma[1] / sigma[2] : 1, useIP = ns === 3 && ipMult <= 0.1; let ip = null;
    if (useIP) { const m = nps[2], o = off[2], H = new Float64Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) H[i * m + j] = (i === j ? 1 : 0) + 1 / m - C[(o + i) * ntot + o + j] / PI2;
      const pv = luFactor(H, m), I = new Float64Array(m * m), e = new Float64Array(m); for (let j = 0; j < m; j++) { e.fill(0); e[j] = 1; const x = luSolve(H, pv, m, e); for (let i = 0; i < m; i++) I[i * m + j] = x[i]; } ip = I; }
    for (let a = 0; a < ns; a++) for (let b = 0; b < ns; b++) { const g = gamma(a, b) / PI2; for (let i = off[a]; i < off[a + 1]; i++) { const r = i * ntot; for (let j = off[b]; j < off[b + 1]; j++) C[r + j] = (i === j ? 1 : 0) + defl - C[r + j] * g; } }
    const piv = luFactor(C, ntot, p => prog(0.3 + 0.7 * p));
    const mult = new Float64Array(ntot); for (let a = 0; a < ns; a++) for (let i = off[a]; i < off[a + 1]; i++) mult[i] = 2 / (sg[a + 1] + sg[a]) / (4 * Math.PI);
    prog(1); return { surfs, sigma, LU: C, piv, n: ntot, nps, off, ip, ipMult: useIP ? ipMult : 1, mult };
  }
  /** point le plus proche d'un triangle (Ericson) → { d2, w: [3] barycentriques } */
  function closestOnTri(p, a, b, c) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const d1 = dot(ab, ap), d2 = dot(ac, ap); let w;
    if (d1 <= 0 && d2 <= 0) w = [1, 0, 0]; else {
      const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp);
      if (d3 >= 0 && d4 <= d3) w = [0, 1, 0]; else { const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); w = [1 - v, v, 0]; } else { const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp);
          if (d6 >= 0 && d5 <= d6) w = [0, 0, 1]; else { const vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) { const v = d2 / (d2 - d6); w = [1 - v, 0, v]; } else { const va = d3 * d6 - d5 * d4;
              if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const v = (d4 - d3) / ((d4 - d3) + (d5 - d6)); w = [0, 1 - v, v]; } else { const den = 1 / (va + vb + vc), v = vb * den, ww = vc * den; w = [1 - v - ww, v, ww]; } } } } } }
    const q = [0, 1, 2].map(k => w[0] * a[k] + w[1] * b[k] + w[2] * c[k]); return { d2: (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2, w, q };
  }
  /** projection de points sur une surface : [{ f (triangle), w, q (point projeté) }] */
  function projectOn(S, P) {
    return P.map(p => { let best = null; for (let f = 0; f < S.ntri; f++) { const t = S.tris, i0 = 3 * t[3 * f], i1 = 3 * t[3 * f + 1], i2 = 3 * t[3 * f + 2], r = S.rr;
      const cx = (r[i0] + r[i1] + r[i2]) / 3 - p[0], cy = (r[i0 + 1] + r[i1 + 1] + r[i2 + 1]) / 3 - p[1], cz = (r[i0 + 2] + r[i1 + 2] + r[i2 + 2]) / 3 - p[2]; if (best && cx * cx + cy * cy + cz * cz > best.d2 + 900) continue;
      const c = closestOnTri(p, [r[i0], r[i0 + 1], r[i0 + 2]], [r[i1], r[i1 + 1], r[i1 + 2]], [r[i2], r[i2 + 1], r[i2 + 2]]); if (!best || c.d2 < best.d2) best = Object.assign(c, { f }); } return best; });
  }
  /** transfert vers des électrodes P (m × [x,y,z], mm, projetées sur le scalp) → T (m × n, Float64Array) : V = T · V∞ */
  function elecTransfer(B, P) {
    const S = B.surfs[0], pr = projectOn(S, P), m = P.length, n = B.n, T = new Float64Array(m * n), b = new Float64Array(n);
    pr.forEach((q, e) => {
      b.fill(0); for (let k = 0; k < 3; k++) b[S.tris[3 * q.f + k]] += q.w[k];
      const x = luSolveT(B.LU, B.piv, n, b); T.set(x, e * n);
    });
    if (B.ip) { const o = B.off[2], mI = B.nps[2], tmp = new Float64Array(mI);
      for (let e = 0; e < m; e++) { const r = e * n + o; for (let j = 0; j < mI; j++) { let s = 0; for (let i = 0; i < mI; i++) s += T[r + i] * B.ip[i * mI + j]; tmp[j] = s; } for (let j = 0; j < mI; j++) T[r + j] -= 2 * tmp[j]; } }
    for (let e = 0; e < m; e++) for (let j = 0; j < n; j++) T[e * n + j] *= B.ipMult * B.mult[j];
    return { T, m, proj: pr.map(q => q.q), dist: pr.map(q => Math.sqrt(q.d2)) };
  }
  /** sommets de toutes les surfaces (Float64Array 3·n) */
  function allVerts(B) { const R = new Float64Array(3 * B.n); let o = 0; for (const S of B.surfs) { R.set(S.rr, o); o += S.rr.length; } return R; }
  /** gain (m × 3, Float64Array) d'un dipôle en p : V∞ aux sommets puis transfert */
  function gainAt(Tr, R, n, p, out) {
    const m = Tr.m, T = Tr.T, g = out || new Float64Array(3 * m), vx = new Float64Array(n), vy = new Float64Array(n), vz = new Float64Array(n);
    for (let j = 0; j < n; j++) { const d0 = R[3 * j] - p[0], d1 = R[3 * j + 1] - p[1], d2 = R[3 * j + 2] - p[2], r2 = d0 * d0 + d1 * d1 + d2 * d2, k = 1 / (r2 * Math.sqrt(r2) || 1e-30); vx[j] = d0 * k; vy[j] = d1 * k; vz[j] = d2 * k; }
    for (let e = 0; e < m; e++) { let a = 0, b = 0, c = 0; const r = e * n; for (let j = 0; j < n; j++) { const t = T[r + j]; a += t * vx[j]; b += t * vy[j]; c += t * vz[j]; } g[3 * e] = a; g[3 * e + 1] = b; g[3 * e + 2] = c; }
    return g;
  }
  /** matrice de gain (m × 3·ns, Float32Array, ligne par électrode) pour des sources S (3·ns, mm) */
  function leadfield(Tr, R, n, S, progress) {
    const m = Tr.m, ns = S.length / 3, L = new Float32Array(m * 3 * ns), g = new Float64Array(3 * m);
    for (let j = 0; j < ns; j++) { gainAt(Tr, R, n, [S[3 * j], S[3 * j + 1], S[3 * j + 2]], g); for (let e = 0; e < m; e++) { const o = e * 3 * ns + 3 * j; L[o] = g[3 * e]; L[o + 1] = g[3 * e + 1]; L[o + 2] = g[3 * e + 2]; } if (progress && (j & 255) === 0) progress(j / ns); }
    return L;
  }
  /** distance minimale de chaque source au crâne interne (approchée par les sommets) ; sources trop proches ramenées vers le
   *  centre c pour rester à dmin (la collocation linéaire perd en précision près d'une surface) → { S (corrigé), moved } */
  function keepInside(B, S, c, dmin) {
    const I = B.surfs[B.surfs.length - 1], out = Float64Array.from(S); let moved = 0;
    for (let j = 0; j < S.length / 3; j++) {
      const p = [S[3 * j], S[3 * j + 1], S[3 * j + 2]], u = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], r = Math.hypot(u[0], u[1], u[2]) || 1;
      // rayon du crâne interne dans cette direction : sommet de direction la plus proche
      let best = -2, rI = 0; for (let i = 0; i < I.np; i++) { const v = [I.rr[3 * i] - c[0], I.rr[3 * i + 1] - c[1], I.rr[3 * i + 2] - c[2]], rv = Math.hypot(v[0], v[1], v[2]), cs = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (rv * r); if (cs > best) { best = cs; rI = rv; } }
      if (r > rI - dmin) { const k = Math.max(0.2, (rI - dmin) / r); for (let q = 0; q < 3; q++) out[3 * j + q] = c[q] + u[q] * k; moved++; }
    }
    return { S: out, moved };
  }

  // ================================================================ chaîne complète (worker)
  /** job = { surfs: [{ rr, tris, np, ntri }×3], sigma, elec (3·m), src (3·ns), center, dmin } → { L, T, m, n, LU, piv, ip, …, proj } */
  function build(job, progress) {
    const prog = progress || (() => {}), surfs = job.surfs.map(s => ({ rr: Float64Array.from(s.rr), tris: Uint32Array.from(s.tris), np: s.np, ntri: s.ntri }));
    const B = solve(surfs, job.sigma, p => prog(0.8 * p)), P = []; for (let i = 0; i < job.elec.length; i += 3) P.push([job.elec[i], job.elec[i + 1], job.elec[i + 2]]);
    const Tr = elecTransfer(B, P), R = allVerts(B), K = keepInside(B, job.src, job.center, job.dmin == null ? 3 : job.dmin);
    const L = leadfield(Tr, R, B.n, K.S, p => prog(0.82 + 0.18 * p)); prog(1);
    return { L, T: Tr.T, m: Tr.m, n: B.n, moved: K.moved, model: { surfs, LU: B.LU, piv: B.piv, n: B.n, nps: B.nps, off: B.off, ip: B.ip, ipMult: B.ipMult, mult: B.mult } };
  }
  /** électrodes ou sources changées, même tête : transfert par le facteur LU conservé puis gain (quelques secondes) */
  function relead(model, elec, src, center, dmin, progress) {
    const B = Object.assign({}, model), P = []; for (let i = 0; i < elec.length; i += 3) P.push([elec[i], elec[i + 1], elec[i + 2]]);
    const Tr = elecTransfer(B, P), R = allVerts(B), K = keepInside(B, src, center, dmin == null ? 3 : dmin), L = leadfield(Tr, R, B.n, K.S, progress);
    return { L, T: Tr.T, m: Tr.m, n: B.n, moved: K.moved };
  }

  SV.BEM = { geoSphere, radialSurface, smoothOn, ageParams, headSurfaces, rayHit, onSurface, linPotCoeff, luFactor, luSolve, luSolveT, solve, closestOnTri, projectOn, elecTransfer, allVerts, gainAt, leadfield, keepInside, build, relead };
});
