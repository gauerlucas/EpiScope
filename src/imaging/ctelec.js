/* EpiScope — imaging/ctelec.js : électrodes SEEG réelles sur le scanner post-implantation, à la manière de Brainstorm
 * (Medina Villalon et al. 2018 pour la détection automatique ; Brainstorm « SEEG contact localization » : pointe, entrée,
 * modèle d'électrode → plots placés depuis la pointe au pas du modèle).
 *
 *   detect(ct, opts, progress) : seuil du métal (HU) dans le cerveau (masque de la référence, ou intérieur du crâne
 *     estimé sur le scanner), regroupement en grille de 1 mm, composantes connexes, droites (ACP ; RANSAC pour séparer
 *     des électrodes qui se touchent), fusion des fragments alignés, sens pointe → entrée, nombre de plots d'après le
 *     profil d'intensité, ajustement du peigne de plots (2 mm, pas de 3,5 mm) le long de l'axe.
 *   refine(ct, opts, a, b) : droite ajustée sur le métal autour d'un segment saisi à la main (deux clics).
 *   contacts(tip, dir, n, pitch) : centres des plots depuis la pointe (plot 1 = le plus profond).
 * Coordonnées de sortie : monde de l'image de référence (opts.T = monde CT → monde référence).
 * Fabrique 'ctelec' (utilisable dans un worker : ne dépend que de SV.Mat4 / SV.Vol de nifti.js). */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).ctelec = factory;
})(function (SV) {
  'use strict';
  const M4 = SV.Mat4, PITCH = 3.5, CLEN = 2, MODEL_N = [5, 8, 10, 12, 15, 18];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, d, s) => [a[0] + d[0] * s, a[1] + d[1] * s, a[2] + d[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm = a => Math.hypot(a[0], a[1], a[2]), unit = a => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

  /** centres des plots depuis la pointe : plot k à 1 + (k − 1)·pas mm (plot de 2 mm affleurant la pointe) */
  function contacts(tip, dir, n, pitch) { if (Array.isArray(pitch)) return pitch.slice(0, n || pitch.length).map(o => add(tip, dir, o)); const out = []; for (let k = 1; k <= n; k++) out.push(add(tip, dir, CLEN / 2 + (k - 1) * (pitch || PITCH))); return out; }
  /** gabarit du peigne : intervalles [début, fin] de chaque plot depuis la pointe — pas régulier (nombre), ou modèle
   *  { offsets (centres), lens (longueurs, 2 mm par défaut) } (groupes espacés, haute résolution ; v4.21) */
  function combOf(pitchOrModel, maxLen) {
    if (pitchOrModel && typeof pitchOrModel === 'object' && pitchOrModel.offsets) { const o = pitchOrModel.offsets, L = pitchOrModel.lens || []; return o.map((c, k) => { const l = L[k] || (pitchOrModel.hd && k > 0 ? 1 : CLEN); return [c - l / 2, c + l / 2]; }).filter(iv => iv[0] < maxLen + 1); }
    const pitch = pitchOrModel || PITCH, out = []; for (let x0 = 0; x0 + CLEN <= maxLen + 1; x0 += pitch) out.push([x0, x0 + CLEN]); return out;
  }

  /** ACP pondérée d'un nuage (points [x,y,z], poids) → { c, axis, l1, l2 } (méthode de la puissance sur la covariance 3×3) */
  function pca(pts, w) {
    let W = 0; const c = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const wi = w ? w[i] : 1; W += wi; c[0] += pts[i][0] * wi; c[1] += pts[i][1] * wi; c[2] += pts[i][2] * wi; }
    c[0] /= W; c[1] /= W; c[2] /= W; const C = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < pts.length; i++) { const wi = w ? w[i] : 1, x = pts[i][0] - c[0], y = pts[i][1] - c[1], z = pts[i][2] - c[2]; C[0] += wi * x * x; C[1] += wi * x * y; C[2] += wi * x * z; C[3] += wi * y * y; C[4] += wi * y * z; C[5] += wi * z * z; }
    for (let k = 0; k < 6; k++) C[k] /= W;
    const mul = v => [C[0] * v[0] + C[1] * v[1] + C[2] * v[2], C[1] * v[0] + C[3] * v[1] + C[4] * v[2], C[2] * v[0] + C[4] * v[1] + C[5] * v[2]];
    let v = [0.57, 0.58, 0.58]; for (let it = 0; it < 60; it++) v = unit(mul(v));
    const l1 = dot(v, mul(v)), tr = C[0] + C[3] + C[5];
    return { c, axis: v, l1, l2: Math.max(0, (tr - l1) / 2) };
  }
  /** distance d'un point à une droite (c, axe unitaire) et abscisse */
  function lineDist(p, c, u) { const d = sub(p, c), t = dot(d, u); return [Math.hypot(d[0] - u[0] * t, d[1] - u[1] * t, d[2] - u[2] * t), t]; }

  /** échantillonneur du scanner en coordonnées monde de la référence (moyenne sur un petit disque autour de l'axe) */
  function ctSampler(ct, T) {
    const Mv = M4.mul(M4.inv(ct.affine), T ? M4.inv(M4.from(T)) : M4.identity());
    const at = p => { const v = M4.apply(Mv, p[0], p[1], p[2]); return SV.Vol.sampleVox(ct, v[0], v[1], v[2], -1000); };
    return { at, disk(p, u, r) { // maximum sur l'axe et 6 points à r mm (robuste à un léger décentrage)
      const a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = unit([u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]]), e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
      let m = at(p); for (let k = 0; k < 6; k++) { const t = k * Math.PI / 3, q = [p[0] + r * (Math.cos(t) * e1[0] + Math.sin(t) * e2[0]), p[1] + r * (Math.cos(t) * e1[1] + Math.sin(t) * e2[1]), p[2] + r * (Math.cos(t) * e1[2] + Math.sin(t) * e2[2])]; const v = at(q); if (v > m) m = v; } return m; } };
  }

  /** profil d'intensité le long de l'axe depuis la pointe : nombre de plots et décalage du peigne */
  function fitComb(sampler, tip, dir, maxLen, pitch) {
    const step = 0.25, n = Math.max(8, Math.ceil((maxLen + 3) / step)), prof = new Float32Array(n), comb = combOf(pitch, maxLen);
    for (let i = 0; i < n; i++) prof[i] = sampler.disk(add(tip, dir, -2 + i * step), dir, 0.6);
    // peigne (plots du gabarit, isolants entre eux) ; décalage o ∈ [−1,5 ; 1,5] mm autour de la pointe métallique
    const inGap = x => { for (let k = 0; k + 1 < comb.length; k++) if (x > comb[k][1] + 0.3 && x < comb[k + 1][0] - 0.3) return true; return false; }, inPlot = x => comb.some(iv => x >= iv[0] && x < iv[1]);
    let best = { o: 0, s: -Infinity };
    for (let o = -1.5; o <= 1.51; o += 0.25) {
      let inC = 0, nIn = 0, outC = 0, nOut = 0;
      for (let i = 0; i < n; i++) { const x = -2 + i * step - o; if (x < 0 || x > maxLen) continue; if (inPlot(x)) { inC += prof[i]; nIn++; } else if (inGap(x)) { outC += prof[i]; nOut++; } }
      const s = (nIn ? inC / nIn : 0) - (nOut ? outC / nOut : 0); if (s > best.s) best = { o, s };
    }
    // chaque plot : pic sur ses 2 mm et creux sur l'intervalle qui suit. Un plot compte si le pic reste élevé ET que le
    // contraste pic − creux persiste : au-delà du dernier plot, le fil (pic bas) ou la vis d'ancrage (métal continu, sans
    // creux) arrêtent le compte ; un plot isolé plus pâle est toléré
    const win = (a, b, f) => { let m = f === 'max' ? -Infinity : 0, c = 0; for (let i = 0; i < n; i++) { const x = -2 + i * step; if (x < a || x > b) continue; if (f === 'max') m = Math.max(m, prof[i]); else { m += prof[i]; c++; } } return f === 'max' ? m : c ? m / c : NaN; };
    const peaks = [], gaps = [];
    for (let k = 0; k < comb.length; k++) { const [a0, a1] = comb[k], nx0 = k + 1 < comb.length ? comb[k + 1][0] : a1 + (a1 - a0) * 0.75; if (a1 + best.o > maxLen + 1) break; peaks.push(win(a0 + best.o, a1 + best.o, 'max')); gaps.push(win(a1 + best.o + 0.35, nx0 + best.o - 0.35, 'mean')); }
    const m0 = Math.min(5, peaks.length), med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
    const ref = med(peaks.slice(0, m0)), refC = med(peaks.slice(0, m0).map((p, k) => p - (isNaN(gaps[k]) ? 0 : gaps[k])));
    let nC = 0, miss = 0;
    for (let k = 0; k < peaks.length; k++) {
      const c = peaks[k] - (isNaN(gaps[k]) ? 0 : gaps[k]), next = k + 1 < peaks.length ? peaks[k + 1] - (isNaN(gaps[k + 1]) ? 0 : gaps[k + 1]) : 0;
      const isC = peaks[k] >= 0.55 * ref && (c >= 0.3 * refC || (k + 1 < peaks.length && next >= 0.3 * refC && peaks[k] >= 0.75 * ref && gaps[k] < 0.9 * peaks[k]));
      if (isC) { nC = k + 1; miss = 0; } else if (++miss >= 2) break;
    }
    return { offset: best.o, contrast: best.s, n: Math.max(1, nC), peaks: Array.from(peaks), gaps };
  }
  /** modèle (nombre de plots disponible) le plus proche du compte observé */
  function snapModel(nObs) { let b = MODEL_N[0]; for (const m of MODEL_N) if (Math.abs(m - nObs) < Math.abs(b - nObs) || (Math.abs(m - nObs) === Math.abs(b - nObs) && m > b)) b = m; return b; }

  /** détection automatique ; opts : { T, mask: {dims, data, affine} (référence, cerveau dilaté), center: [x,y,z] (centre du
   *  cerveau, monde référence), threshold (HU), pitch, minLen (mm) } */
  function detect(ct, opts, progress) {
    opts = opts || {}; const t0 = Date.now(), prog = typeof progress === 'function' ? progress : () => {};
    const T = opts.T ? M4.from(opts.T) : M4.identity(), toRef = M4.mul(T, ct.affine), d = ct.data, sl = ct.slope || 1, ic = ct.inter || 0, [nx, ny, nz] = ct.dims;
    // seuil : 2500 HU si le scanner est calibré, sinon les 0,03 % de voxels les plus intenses
    let thr = opts.threshold;
    if (thr == null) { const q = SV.Vol.quantiles(ct, [0.5, 0.9997, 1]); thr = q[2] > 2800 && q[0] < 200 ? 2500 : q[1]; }
    const rawThr = (thr - ic) / sl;
    // masque : cerveau de la référence (dilaté) ; sinon intérieur du crâne estimé sur le scanner (coupe par coupe)
    let inMask;
    if (opts.mask) { const mk = opts.mask, Mm = M4.inv(mk.affine); inMask = p => { const v = M4.apply(Mm, p[0], p[1], p[2]); return SV.Vol.nearestVox(mk, v[0], v[1], v[2]) > 0; }; }
    else inMask = skullInterior(ct, toRef);
    prog({ fraction: 0.05, message: 'seuil du métal ' + Math.round(thr) + ' HU' });
    // voxels métalliques regroupés en cellules de 1 mm (monde référence)
    const cells = new Map(); let nMetal = 0;
    for (let k = 0; k < nz; k++) {
      if (k % 32 === 0) prog({ fraction: 0.05 + 0.45 * k / nz, message: 'métal : coupe ' + k + '/' + nz });
      for (let j = 0; j < ny; j++) { let o = nx * (j + ny * k); for (let i = 0; i < nx; i++, o++) {
        if (d[o] < rawThr) continue;
        const p = M4.apply(toRef, i, j, k); if (!inMask(p)) continue; nMetal++;
        const key = Math.round(p[0]) + 2048 + 4096 * (Math.round(p[1]) + 2048) + 4096 * 4096 * (Math.round(p[2]) + 2048);
        const c = cells.get(key); if (c) { c.n++; c.s += d[o] * sl + ic; } else cells.set(key, { x: Math.round(p[0]), y: Math.round(p[1]), z: Math.round(p[2]), n: 1, s: d[o] * sl + ic, comp: -1 });
      } }
    }
    prog({ fraction: 0.55, message: nMetal + ' voxels métalliques, regroupement' });
    // composantes connexes sur les cellules, voisinage de rayon 3 mm : les plots d'une électrode (séparés de 1,5 mm sur
    // un scanner fin, cellules en diagonale) restent reliés ; deux électrodes sont toujours à plus de 6 mm l’une de l’autre
    const keyOf = (x, y, z) => (x + 2048) + 4096 * (y + 2048) + 4096 * 4096 * (z + 2048), comps = [], R = opts.linkRadius || 3;
    for (const [, c] of cells) {
      if (c.comp >= 0) continue; const id = comps.length, list = [c]; c.comp = id;
      for (let q = 0; q < list.length; q++) { const a = list[q]; for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy + dz * dz > R * R + 1) continue; const b = cells.get(keyOf(a.x + dx, a.y + dy, a.z + dz)); if (b && b.comp < 0) { b.comp = id; list.push(b); } } }
      comps.push(list);
    }
    // droites : ACP si la composante est allongée et fine, sinon extraction RANSAC successive
    const minLen = opts.minLen || 7, lines = [];   // fragments ≥ 7 mm (fusionnés ensuite) ; électrodes retenues ≥ opts.minElec (10 mm)
    let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const fitLine = pts => { const P = pts.map(c => [c.x, c.y, c.z]), w = pts.map(c => c.n), f = pca(P, w), ds = []; let tmin = Infinity, tmax = -Infinity, rms = 0, W = 0; for (let i = 0; i < P.length; i++) { const [dd, t] = lineDist(P[i], f.c, f.axis); ds.push(dd); rms += w[i] * dd * dd; W += w[i]; if (t < tmin) tmin = t; if (t > tmax) tmax = t; } ds.sort((a, b) => a - b); return { c: f.c, u: f.axis, tmin, tmax, rms: Math.sqrt(rms / W), p95: ds[Math.floor(0.95 * (ds.length - 1))] || 0, n: W, cells: pts.length, pts }; };
    for (const comp of comps) {
      if (comp.length < 3) continue;
      let L = fitLine(comp);
      if (L.tmax - L.tmin >= minLen && L.rms < 1.6 && L.p95 < 2.6) { lines.push(L); continue; }   // halo métallique réel : ~1–1,5 mm
      let rest = comp.slice();
      for (let iter = 0; iter < 12 && rest.length >= 5; iter++) {
        let best = null;
        for (let t = 0; t < 300; t++) {
          const a = rest[Math.floor(rnd() * rest.length)], b = rest[Math.floor(rnd() * rest.length)], u = sub([b.x, b.y, b.z], [a.x, a.y, a.z]), l = norm(u); if (l < 6) continue;
          const uu = [u[0] / l, u[1] / l, u[2] / l], c0 = [a.x, a.y, a.z]; let inl = 0; for (const c of rest) if (lineDist([c.x, c.y, c.z], c0, uu)[0] < 1.8) inl += c.n;
          if (!best || inl > best.inl) best = { inl, c0, uu };
        }
        if (!best) break;
        const inliers = rest.filter(c => lineDist([c.x, c.y, c.z], best.c0, best.uu)[0] < 1.8);
        if (inliers.length < 4) break; L = fitLine(inliers);
        if (L.tmax - L.tmin >= minLen) lines.push(L);
        // retire aussi le halo de la droite trouvée (sinon il redonne une droite parallèle presque confondue)
        rest = rest.filter(c => { const [dd, t] = lineDist([c.x, c.y, c.z], L.c, L.u); return !(dd < 2.8 && t >= L.tmin - 2 && t <= L.tmax + 2); });
      }
    }
    // fusion des fragments alignés (un plot moins dense coupe la chaîne) : directions proches, écart < 12 mm, et la
    // droite ajustée sur l'union reste fine
    for (let merged = true; merged;) {
      merged = false;
      outer: for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
        const A = lines[i], B = lines[j]; if (Math.abs(dot(A.u, B.u)) < Math.cos(12 * Math.PI / 180)) continue;
        const bc = add(B.c, B.u, (B.tmin + B.tmax) / 2), dd = lineDist(bc, A.c, A.u); if (dd[0] > 3) continue;
        const gap = Math.max(0, Math.max(dd[1] - (B.tmax - B.tmin) / 2 - A.tmax, A.tmin - dd[1] - (B.tmax - B.tmin) / 2)); if (gap > 12) continue;
        // doublon (droites qui se recouvrent, à moins de 3 mm) ou fragment aligné : la droite de l'union reste fine
        const overlap = gap === 0 && dd[0] < 3, U = fitLine(A.pts.concat(B.pts)); if (U.rms > (overlap ? 1.9 : 1.6) || U.p95 > 3) continue;
        lines[i] = U; lines.splice(j, 1); merged = true; break outer;
      }
    }
    prog({ fraction: 0.8, message: lines.length + ' trajectoires, plots' });
    // orientation, plots
    const center = opts.center || [0, 0, 0], sampler = ctSampler(ct, T), pitch = opts.pitch || PITCH, out = [], minElec = opts.minElec || 10;
    for (const Ln of lines) {
      if (Ln.tmax - Ln.tmin < minElec) continue;
      if (Ln.cells / Math.max(1, Ln.tmax - Ln.tmin) < (opts.minDensity || 0.4)) continue;   // nuage clairsemé (reste de halo, artefact) : pas une électrode
      let a = add(Ln.c, Ln.u, Ln.tmin), b = add(Ln.c, Ln.u, Ln.tmax);
      if (norm(sub(a, center)) > norm(sub(b, center))) [a, b] = [b, a];   // a = pointe (la plus profonde), b = entrée
      const dir = unit(sub(b, a)), len = norm(sub(b, a)), fit = fitComb(sampler, a, dir, len + 25, pitch);
      const tip = add(a, dir, fit.offset), nObs = fit.n, n = snapModel(nObs);
      out.push({ tip, entry: b, dir, length: len, nObs, n, contacts: contacts(tip, dir, n, pitch), contrast: fit.contrast, rms: Ln.rms, cells: Ln.cells, score: Math.min(1, Ln.cells / 40) * Math.max(0, 1 - Ln.rms / 1.5) });
    }
    out.sort((x, y) => (x.tip[0] - y.tip[0]) || (x.tip[1] - y.tip[1]));
    prog({ fraction: 1, message: out.length + ' électrodes' });
    return { electrodes: out, threshold: thr, nMetal, ms: Date.now() - t0 };
  }

  // morphologie 2D (carré ±R, filtres séparables par comptage glissant) et remplissage du fond depuis le bord
  function dil2(src, nx, ny, R) {
    const tmp = new Uint8Array(nx * ny), out = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) { let c = 0; const o = nx * j; for (let i = 0; i < Math.min(R, nx); i++) c += src[o + i]; for (let i = 0; i < nx; i++) { if (i + R < nx) c += src[o + i + R]; if (i - R - 1 >= 0) c -= src[o + i - R - 1]; tmp[o + i] = c > 0 ? 1 : 0; } }
    for (let i = 0; i < nx; i++) { let c = 0; for (let j = 0; j < Math.min(R, ny); j++) c += tmp[i + nx * j]; for (let j = 0; j < ny; j++) { if (j + R < ny) c += tmp[i + nx * (j + R)]; if (j - R - 1 >= 0) c -= tmp[i + nx * (j - R - 1)]; out[i + nx * j] = c > 0 ? 1 : 0; } }
    return out;
  }
  function ero2(src, nx, ny, R) { const inv = new Uint8Array(nx * ny); for (let q = 0; q < inv.length; q++) inv[q] = src[q] ? 0 : 1; const d = dil2(inv, nx, ny, R); for (let q = 0; q < d.length; q++) d[q] = d[q] ? 0 : 1; return d; }
  /** fond extérieur d'une coupe : voxels non bloquants atteints depuis le bord */
  function exterior2(block, nx, ny, st) {
    const out = new Uint8Array(nx * ny); let sp = 0;
    const push = q => { if (out[q] || block[q]) return; out[q] = 1; st[sp++] = q; };
    for (let i = 0; i < nx; i++) { push(i); push(i + nx * (ny - 1)); } for (let j = 0; j < ny; j++) { push(nx * j); push(nx - 1 + nx * j); }
    while (sp) { const q = st[--sp], i = q % nx; if (i > 0) push(q - 1); if (i < nx - 1) push(q + 1); if (q >= nx) push(q - nx); if (q < nx * (ny - 1)) push(q + nx); }
    return out;
  }
  /** cerveau estimé sur le scanner seul (sans T1) : (1) intérieur de l'anneau osseux, coupe par coupe, après fermeture de
   *  l'os (les trous de trépan ne laissent pas entrer le fond) ; (2) tissus mous (−100 à 150 HU) de cet intérieur ;
   *  (3) grandes composantes 3D (≥ 20 % de la plus grande : écarte câbles, air des boucles, cavité buccale) ; (4) trous
   *  de chaque coupe remplis (électrodes et artefacts métalliques entourés de cerveau) ; test avec une marge de 2 mm. */
  function skullInterior(ct, toRef) {
    const [nx, ny, nz] = ct.dims, nxy = nx * ny, n = nxy * nz, d = ct.data, sl = ct.slope || 1, ic = ct.inter || 0, bone = (300 - ic) / sl, lo = (-100 - ic) / sl, hi = (150 - ic) / sl;
    const R = Math.max(2, Math.round(2.5 / Math.min(ct.pixdim[0], ct.pixdim[1]))), st = new Int32Array(nxy), soft = new Uint8Array(n), bm = new Uint8Array(nxy);
    for (let k = 0; k < nz; k++) {
      const base = nxy * k; for (let q = 0; q < nxy; q++) bm[q] = d[base + q] >= bone ? 1 : 0;
      const ext = exterior2(ero2(dil2(bm, nx, ny, R), nx, ny, R), nx, ny, st);
      for (let q = 0; q < nxy; q++) { const v = d[base + q]; if (!ext[q] && !bm[q] && v > lo && v < hi) soft[base + q] = 1; }
    }
    // composantes 6-connexes
    const comp = new Int32Array(n), stack = new Int32Array(n), sizes = [0]; let id = 0, big = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!soft[s0] || comp[s0]) continue; id++; let sp = 0, size = 0; stack[sp++] = s0; comp[s0] = id;
      while (sp) { const q = stack[--sp]; size++; const i = q % nx, j = ((q / nx) | 0) % ny, k = (q / nxy) | 0;
        if (i > 0 && soft[q - 1] && !comp[q - 1]) { comp[q - 1] = id; stack[sp++] = q - 1; } if (i < nx - 1 && soft[q + 1] && !comp[q + 1]) { comp[q + 1] = id; stack[sp++] = q + 1; }
        if (j > 0 && soft[q - nx] && !comp[q - nx]) { comp[q - nx] = id; stack[sp++] = q - nx; } if (j < ny - 1 && soft[q + nx] && !comp[q + nx]) { comp[q + nx] = id; stack[sp++] = q + nx; }
        if (k > 0 && soft[q - nxy] && !comp[q - nxy]) { comp[q - nxy] = id; stack[sp++] = q - nxy; } if (k < nz - 1 && soft[q + nxy] && !comp[q + nxy]) { comp[q + nxy] = id; stack[sp++] = q + nxy; } }
      sizes.push(size); if (size > big) big = size;
    }
    const brain = soft; brain.fill(0); const keepC = sizes.map(z => z >= 0.2 * big);
    for (let k = 0; k < nz; k++) {
      const base = nxy * k; let any = 0; for (let q = 0; q < nxy; q++) { bm[q] = keepC[comp[base + q]] ? 1 : 0; any |= bm[q]; }
      if (!any) continue;
      const closed = ero2(dil2(bm, nx, ny, 3), nx, ny, 3), ext = exterior2(closed, nx, ny, st);
      for (let q = 0; q < nxy; q++) if (!ext[q]) brain[base + q] = 1;
    }
    const Mi = M4.inv(toRef), rad = Math.max(1, Math.round(2 / Math.min(...ct.pixdim)));
    let nb = 0; for (let q = 0; q < n; q++) nb += brain[q];
    let ns = 0; for (let q = 0; q < n; q++) ns += comp[q] ? 1 : 0;
    skullInterior.last = { soft: ns, components: id, largest: big, kept: keepC.filter(Boolean).length, brainVoxels: nb };
    return p => {
      const v = M4.apply(Mi, p[0], p[1], p[2]), i0 = Math.round(v[0]), j0 = Math.round(v[1]), k0 = Math.round(v[2]);
      if (i0 >= 0 && j0 >= 0 && k0 >= 0 && i0 < nx && j0 < ny && k0 < nz && brain[i0 + nx * (j0 + ny * k0)]) return true;
      for (let dk = -rad; dk <= rad; dk += rad) for (let dj = -rad; dj <= rad; dj += rad) for (let di = -rad; di <= rad; di += rad) { const i = i0 + di, j = j0 + dj, k = k0 + dk; if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue; if (brain[i + nx * (j + ny * k)]) return true; }
      return false;
    };
  }

  /** droite ajustée sur le métal autour d'un segment saisi (a = pointe, b = entrée, monde référence) */
  function refine(ct, opts, a, b) {
    const T = opts && opts.T ? M4.from(opts.T) : M4.identity(), toRef = M4.mul(T, ct.affine), toCT = M4.inv(toRef), sl = ct.slope || 1, ic = ct.inter || 0;
    const u0 = unit(sub(b, a)), L = norm(sub(b, a)), thr = opts && opts.threshold != null ? opts.threshold : 2000, raw = (thr - ic) / sl;
    // boîte englobante du cylindre (rayon 3 mm, ±6 mm aux extrémités) dans la grille du scanner
    const ends = [add(a, u0, -6), add(b, u0, 6)], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const e of ends) for (const dx of [-3, 3]) for (const dy of [-3, 3]) for (const dz of [-3, 3]) { const v = M4.apply(toCT, e[0] + dx, e[1] + dy, e[2] + dz); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); } }
    const [nx, ny, nz] = ct.dims, pts = [], w = [];
    for (let k = Math.max(0, Math.floor(lo[2])); k <= Math.min(nz - 1, Math.ceil(hi[2])); k++) for (let j = Math.max(0, Math.floor(lo[1])); j <= Math.min(ny - 1, Math.ceil(hi[1])); j++) for (let i = Math.max(0, Math.floor(lo[0])); i <= Math.min(nx - 1, Math.ceil(hi[0])); i++) {
      const v = ct.data[i + nx * (j + ny * k)]; if (v < raw) continue; const p = M4.apply(toRef, i, j, k), [dd, t] = lineDist(p, a, u0);
      if (dd <= 3 && t >= -6 && t <= L + 6) { pts.push(p); w.push(v * sl + ic - thr + 1); }
    }
    if (pts.length < 5) return { tip: a, entry: b, dir: u0, refined: false };
    const f = pca(pts, w); let u = dot(f.axis, u0) < 0 ? f.axis.map(x => -x) : f.axis;
    let tmin = Infinity, tmax = -Infinity; for (const p of pts) { const t = dot(sub(p, f.c), u); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
    const tip = add(f.c, u, tmin), entry = add(f.c, u, Math.min(tmax, dot(sub(b, f.c), u)));
    const model = opts && opts.model && opts.model.offsets ? opts.model : null, fit = fitComb(ctSampler(ct, T), tip, u, norm(sub(entry, tip)), model || ((opts && opts.pitch) || PITCH));
    return { tip: add(tip, u, fit.offset), entry, dir: u, refined: true, nObs: fit.n, n: model ? model.offsets.length : snapModel(fit.n) };
  }

  SV.CTElec = { detect, refine, contacts, combOf, fitComb, snapModel, pca, PITCH, MODEL_N };
});
