/* EpiScope — imaging/anat.js : anatomie du patient à partir de son T1 (sans logiciel externe).
 *
 *   1. segmentation aparc+aseg (MeshNet 104 classes, SV.MeshNet) sur le T1 « conformé » (256³, 1 mm, LIA) ;
 *   2. transformation affine patient → gabarit fsaverage (MNI305) ajustée sur les centroïdes des 100 classes
 *      (moindres carrés pondérés, rejet itératif des points aberrants) ;
 *   3. parcellation VEP du patient : chaque voxel de cortex reçoit la région VEP du gabarit la plus proche *compatible
 *      avec sa région de Desikan* (les régions VEP subdivisent Desikan-Killiany ; table de compatibilité préparée par
 *      tools/make_template_anat.py) ; hippocampe antérieur / postérieur de même ; filtre modal pour lisser les limites ;
 *      codes « tissu » du volume VEP (200 substance blanche, 201 LCR, 202 autre) ;
 *   4. surfaces par hémisphère (SV.Mesh), version gonflée de même topologie, profondeur sulcale, étiquettes VEP par
 *      sommet, maillages des structures profondes, centroïdes des 162 régions dans l'espace du patient.
 * Les fonctions de calcul (factory 'anat') tournent dans un worker ; l'orchestration est dans anat_ui (SV.app).     */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).anat = factory;
})(function (SV) {
  'use strict';
  const M4 = SV.Mat4;

  /** affine 12 paramètres (src → dst) par moindres carrés pondérés, puis rejet des résidus > 2,5 × médiane (3 tours) */
  function robustAffine(src, dst, w) {
    let keep = src.map(() => true), T = null, res = [];
    for (let it = 0; it < 4; it++) {
      // normales : pour chaque axe de sortie, [x y z 1]ᵀ W [x y z 1] β = [x y z 1]ᵀ W y
      const AtA = new Float64Array(16), Atb = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
      for (let i = 0; i < src.length; i++) { if (!keep[i]) continue; const a = [src[i][0], src[i][1], src[i][2], 1], wi = w ? w[i] : 1; for (let r = 0; r < 4; r++) { for (let c = 0; c < 4; c++) AtA[4 * r + c] += wi * a[r] * a[c]; for (let k = 0; k < 3; k++) Atb[k][r] += wi * a[r] * dst[i][k]; } }
      const inv = M4.inv(AtA); T = M4.identity();
      for (let k = 0; k < 3; k++) for (let c = 0; c < 4; c++) { let s = 0; for (let r = 0; r < 4; r++) s += inv[4 * c + r] * Atb[k][r]; T[4 * k + c] = s; }
      res = src.map((p, i) => { const q = M4.apply(T, p[0], p[1], p[2]); return Math.hypot(q[0] - dst[i][0], q[1] - dst[i][1], q[2] - dst[i][2]); });
      const med = res.filter((_, i) => keep[i]).sort((a, b) => a - b); const m = med[med.length >> 1] || 1;
      const nk = res.map(r => r <= Math.max(2.5 * m, 3)); if (nk.every((v, i) => v === keep[i])) break; keep = nk;
    }
    const used = res.filter((_, i) => keep[i]);
    return { T, rms: Math.sqrt(used.reduce((s, r) => s + r * r, 0) / Math.max(1, used.length)), n: used.length, rejected: keep.filter(k => !k).length };
  }

  /** centroïdes (monde) des classes d'une segmentation : { label: [x, y, z, n] } */
  function centroids(labels, dims, affine, minVox) {
    const [nx, ny, nz] = dims, S = new Map();
    for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) { const l = labels[o]; if (!l) continue; let s = S.get(l); if (!s) S.set(l, s = [0, 0, 0, 0]); s[0] += i; s[1] += j; s[2] += k; s[3]++; }
    const out = {}; for (const [l, s] of S) { if (s[3] < (minVox || 20)) continue; const p = M4.apply(affine, s[0] / s[3], s[1] / s[3], s[2] / s[3]); out[l] = [p[0], p[1], p[2], s[3]]; }
    return out;
  }

  /** volume VEP du gabarit (format de assets/vep_volume.json, décodé) : étiquette au point tkrRAS */
  function tplLabeler(tv) {
    const [d0, d1, d2] = tv.dims, off = tv.off || tv.offset_vox, vox = tv.vox || 2, data = tv.data;
    return (x, y, z) => { const i = Math.round((128 - x) / vox) - off[0], j = Math.round((128 - z) / vox) - off[1], k = Math.round((y + 128) / vox) - off[2]; if (i < 0 || j < 0 || k < 0 || i >= d0 || j >= d1 || k >= d2) return 0; return data[(i * d1 + j) * d2 + k]; };
  }

  /** parcellation VEP du patient. seg : Uint8Array (grille conformée), affine : voxel → monde patient ;
   *  tpl : assets/template_anat.json ; tv : volume VEP du gabarit décodé {dims, off, vox, data}.
   *  Renvoie { vep: Uint8Array, toTemplate, fit: {rms, n, rejected}, counts } */
  function vepParcellation(seg, dims, affine, tpl, tv, progress) {
    const prog = typeof progress === 'function' ? progress : () => {};
    // 1. affine patient → gabarit sur les centroïdes des classes communes
    const pc = centroids(seg, dims, affine, 50), src = [], dst = [], w = [];
    for (const l in pc) { const t = tpl.centroids[l]; if (!t) continue; src.push(pc[l].slice(0, 3)); dst.push(t.slice(0, 3)); w.push(Math.sqrt(Math.min(pc[l][3], t[3]))); }
    if (src.length < 12) throw new Error('segmentation insuffisante pour le recalage sur le gabarit (' + src.length + ' structures)');
    const fit = robustAffine(src, dst, w), T = M4.mul(fit.T, affine);   // voxel patient → gabarit
    prog({ fraction: 0.1, message: `recalage sur le gabarit : ${fit.n} structures, écart ${fit.rms.toFixed(1)} mm` });
    // 2. attribution
    const lab = tplLabeler(tv), allowed = {}, tissue = tpl.tissue || {};
    for (const d in tpl.allowed) allowed[d] = new Set(tpl.allowed[d]);
    const offs = []; for (let dz = -7; dz <= 7; dz++) for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) { const r = dx * dx + dy * dy + dz * dz; if (r && r <= 49) offs.push([2 * dx, 2 * dy, 2 * dz, r]); }
    offs.sort((a, b) => a[3] - b[3]);
    const [nx, ny, nz] = dims, out = new Uint8Array(seg.length), counts = { direct: 0, search: 0, fallback: 0 };
    for (let k = 0, o = 0; k < nz; k++) {
      if (k % 16 === 0) prog({ fraction: 0.1 + 0.7 * k / nz, message: 'parcellation VEP : coupe ' + k });
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) {
        const d = seg[o]; if (!d) continue;
        const A = allowed[d];
        if (!A) { out[o] = tissue[d] || 202; continue; }
        if (A.size === 1) { out[o] = A.values().next().value; counts.direct++; continue; }
        const q = M4.apply(T, i, j, k), v = lab(q[0], q[1], q[2]);
        if (A.has(v)) { out[o] = v; counts.direct++; continue; }
        let f = 0; for (const of of offs) { const u = lab(q[0] + of[0], q[1] + of[1], q[2] + of[2]); if (A.has(u)) { f = u; break; } }
        if (f) { out[o] = f; counts.search++; } else { out[o] = A.values().next().value; counts.fallback++; }
      }
    }
    // 3. filtre modal (26 voisins, même classe de Desikan) : limites entre sous-régions moins bruitées
    prog({ fraction: 0.85, message: 'lissage des limites' });
    const sm = out.slice(), sxy = nx * ny;
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const o = i + nx * j + sxy * k, d = seg[o], A = allowed[d]; if (!A || A.size < 2) continue;
      const cnt = new Map(); for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = o + dx + nx * dy + sxy * dz; if (seg[q] !== d) continue; const v = out[q]; cnt.set(v, (cnt.get(v) || 0) + 1); }
      let bv = out[o], bc = 0; for (const [v, c] of cnt) if (c > bc) { bc = c; bv = v; } sm[o] = bv;
    }
    prog({ fraction: 1, message: 'parcellation VEP terminée' });
    return { vep: sm, toTemplate: Array.from(M4.mul(fit.T, M4.identity())), fit: { rms: fit.rms, n: fit.n, rejected: fit.rejected }, counts };
  }

  /** étiquettes au point monde d'un volume (grille + affine) : interface labelAt(x, y, z) des volumes d'électrodes ;
   *  pre (Mat4 facultative) : appliquée au point avant la lecture (p. ex. affichage → monde) */
  function labelVolume(vol, pre) {
    const Mi = pre ? M4.mul(M4.inv(vol.affine), pre) : M4.inv(vol.affine);
    const at = (x, y, z) => { const v = M4.apply(Mi, x, y, z); return SV.Vol.nearestVox(vol, v[0], v[1], v[2]); };
    return {
      vol, labelAt: at,
      /** point de la région idx le plus proche de p (pas de 2 mm, rayon 16 mm par défaut) — même interface que le gabarit */
      nearestOf(idx, p, radius) { radius = radius || 16; let best = null, bd = Infinity; for (let dx = -radius; dx <= radius; dx += 2) for (let dy = -radius; dy <= radius; dy += 2) for (let dz = -radius; dz <= radius; dz += 2) { const d = dx * dx + dy * dy + dz * dz; if (d >= bd) continue; if (at(p[0] + dx, p[1] + dy, p[2] + dz) === idx) { bd = d; best = [p[0] + dx, p[1] + dy, p[2] + dz]; } } return best; },
    };
  }

  // =====================================================================  dérivés anatomiques (surfaces, structures, centres)
  /** rotation la plus proche de la partie linéaire de T (décomposition polaire, itération de Newton R ← ½(R + R⁻ᵀ)) et
   *  translation telle que c → T·c : transformation rigide « d'affichage » (cerveau du patient orienté et placé comme le
   *  gabarit, à sa taille réelle) */
  function rigidPart(T, c) {
    let R = [T[0], T[1], T[2], T[4], T[5], T[6], T[8], T[9], T[10]];
    for (let it = 0; it < 40; it++) {
      const [a, b, cc, d, e, f, g, h, i] = R, A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + cc * C;
      const cof = [A, B, C, cc * h - b * i, a * i - cc * g, b * g - a * h, b * f - cc * e, cc * d - a * f, a * e - b * d];   // R⁻ᵀ = cof / det
      const N = R.map((v, k) => 0.5 * (v + cof[k] / det)); let dd = 0; for (let k = 0; k < 9; k++) dd += Math.abs(N[k] - R[k]); R = N; if (dd < 1e-12) break;
    }
    const q = M4.apply(T, c[0], c[1], c[2]), out = M4.identity();
    for (let r = 0; r < 3; r++) { for (let k = 0; k < 3; k++) out[4 * r + k] = R[3 * r + k]; out[4 * r + 3] = q[r] - (R[3 * r] * c[0] + R[3 * r + 1] * c[1] + R[3 * r + 2] * c[2]); }
    return out;
  }
  /** classes « intérieur de l'hémisphère » (cortex, substance blanche, noyaux gris, ventricules latéraux ; ni cervelet ni
   *  tronc) pour la surface piale */
  function hemiClasses(names, hemi, side) {
    const S = new Set(); names.forEach((n, i) => { if (i && hemi[i] === side && !/Cerebellum|Brain-Stem|vessel/i.test(n)) S.add(i); }); return S;
  }
  /** étape 1 (après la segmentation) : parcellation VEP, transformations, centres des régions (affichage).
   *  meta : { names, hemi } du modèle de segmentation. → { vep, toTemplate, toDisplay, fit, counts, brainCenter,
   *  centroids: {région: [x,y,z,n]} (affichage), midX (affichage), ms } */
  function prepare(seg, dims, affine, meta, tpl, tv, progress) {
    const t0 = Date.now(), prog = typeof progress === 'function' ? progress : () => {};
    const vp = vepParcellation(seg, dims, affine, tpl, tv, p => prog({ fraction: 0.9 * (p.fraction || 0), message: p.message }));
    // centre du cerveau (hors cervelet et tronc) et plan médian
    const [nx, ny, nz] = dims; let s = [0, 0, 0, 0]; const sL = [0, 0], sR = [0, 0], cere = new Uint8Array(meta.names.length);
    meta.names.forEach((n, i) => { if (/Cerebellum|Brain-Stem/.test(n)) cere[i] = 1; });
    for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) { const l = seg[o]; if (!l || cere[l]) continue; s[0] += i; s[1] += j; s[2] += k; s[3]++; }
    const cv = [s[0] / s[3], s[1] / s[3], s[2] / s[3]], c = M4.apply(affine, cv[0], cv[1], cv[2]);
    const T = M4.from(vp.toTemplate), D = rigidPart(T, c), Ad = M4.mul(D, affine);
    const cents = centroids(vp.vep, dims, Ad, 10);
    for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) { const l = seg[o]; if (!l || cere[l]) continue; const x = Ad[0] * i + Ad[1] * j + Ad[2] * k + Ad[3]; if (meta.hemi[l] === 'L') { sL[0] += x; sL[1]++; } else if (meta.hemi[l] === 'R') { sR[0] += x; sR[1]++; } }
    prog({ fraction: 1, message: 'parcellation VEP terminée' });
    return { vep: vp.vep, toTemplate: vp.toTemplate, toDisplay: M4.toArray ? M4.toArray(D) : Array.from(D), fit: vp.fit, counts: vp.counts, brainCenter: c, centroids: cents,
      midX: sL[1] && sR[1] ? 0.5 * (sL[0] / sL[1] + sR[0] / sR[1]) : 0, ms: Date.now() - t0 };
  }
  /** étape 2 (un worker par hémisphère) : surface piale (classes de l'hémisphère), gonflée (centrée sur l'origine, aire
   *  conservée : même convention que fsaverage), profondeur sulcale, région VEP de chaque sommet ; coordonnées d'affichage.
   *  side 'L' | 'R' ; vep : parcellation (même grille que seg) ; Ad : affine voxel → affichage. */
  function hemisphere(seg, vep, dims, Ad, meta, side, opts, progress) {
    opts = opts || {}; const prog = typeof progress === 'function' ? progress : () => {};
    const A = M4.from(Ad), inside = hemiClasses(meta.names, meta.hemi, side);
    let st = 0; const stages = 9;
    const r = SV.Mesh.pipelineHemisphere({ dims, affine: A, data: seg }, inside, { targetVertices: opts.targetVertices || 40000, inflate: Object.assign({ center: "origin", scale: "rms", scaleFactor: 1.36 }, opts.inflate) },
      p => prog({ fraction: Math.min(0.9, (++st) / stages), message: 'surface ' + (side === 'L' ? 'gauche' : 'droite') + (p && p.stage ? ' : ' + p.stage : '') }));
    // régions corticales de l'hémisphère seulement (1–72 gauche, 73–144 droite)
    const lo = side === 'L' ? 1 : 73, hi = side === 'L' ? 72 : 144, cort = new Uint8Array(vep.length);
    for (let i = 0; i < vep.length; i++) { const v = vep[i]; if (v >= lo && v <= hi) cort[i] = v; }
    const lab16 = SV.Mesh.sampleLabels(r.pial, r.faces, null, { dims, affine: A, data: cort }, { depths: [1, 0.5, 1.5, 2, 2.5, 0, 3, 3.5] });
    SV.Mesh.modeFilterLabels(r.faces, lab16, 2);
    const labels = new Uint8Array(lab16.length); for (let i = 0; i < labels.length; i++) labels[i] = lab16[i];
    prog({ fraction: 1, message: 'surface ' + (side === 'L' ? 'gauche' : 'droite') + ' terminée' });
    return { n: r.n, pial: r.pial, inflated: r.inflated, faces: r.faces instanceof Uint32Array ? r.faces : Uint32Array.from(r.faces), sulc: r.sulc, labels, timings: r.timings, info: { area: r.info.area, volume: r.info.volume, genus: r.info.topology && r.info.topology.genus, inflate: r.info.inflate } };
  }
  /** étape 2 bis : maillages des structures profondes VEP (145–162) ; names[index] = nom de la région */
  function structures(vep, dims, Ad, names, progress) {
    const items = []; for (let i = 145; i <= 162; i++) items.push({ name: names[i] || ('région ' + i), labels: [i] });
    const out = SV.Mesh.pipelineStructures({ dims, affine: M4.from(Ad), data: vep }, items, { targetFaces: 3000 }, p => typeof progress === 'function' && progress({ fraction: p.done / p.total, message: 'structures profondes' }));
    return out.map(s => ({ index: s.labels[0], name: s.name, vertices: s.pos, faces: s.faces instanceof Uint32Array ? s.faces : Uint32Array.from(s.faces), volume: s.info.volume }));
  }
  /** centres des régions corticales : moyenne des sommets pial de chaque région (comme le gabarit) */
  function vertexCentroids(hemis) {
    const S = new Map();
    for (const H of hemis) for (let v = 0; v < H.n; v++) { const l = H.labels[v]; if (!l) continue; let s = S.get(l); if (!s) S.set(l, s = [0, 0, 0, 0]); s[0] += H.pial[3 * v]; s[1] += H.pial[3 * v + 1]; s[2] += H.pial[3 * v + 2]; s[3]++; }
    const out = {}; for (const [l, s] of S) out[l] = [s[0] / s[3], s[1] / s[3], s[2] / s[3], s[3]]; return out;
  }

  /** qualité d'une segmentation 104 classes (grille conformée) pour la cascade de segmentation : recalage affine des
   *  centroïdes sur le gabarit (écart rms, échelles des axes), volume étiqueté (mm³ = voxels), étendue supéro-inférieure
   *  (axe j de la grille LIA). Une segmentation correcte : ~5 mm, échelles 0,9–1,2, 1,0–1,4 M voxels, 130–150 mm ;
   *  le cou ou le scalp étiquetés font monter l'écart, l'étendue et le volume, et écrasent une échelle. */
  function segQuality(seg, dims, affine, tpl) {
    const pc = centroids(seg, dims, affine, 50), src = [], dst = [], w = [];
    for (const l in pc) { const t = tpl.centroids[l]; if (!t) continue; src.push(pc[l].slice(0, 3)); dst.push(t.slice(0, 3)); w.push(Math.sqrt(Math.min(pc[l][3], t[3]))); }
    let n = 0, jmin = 1e9, jmax = -1; const [nx, ny] = dims, sxy = nx * ny;
    for (let o = 0; o < seg.length; o++) if (seg[o]) { n++; const j = ((o % sxy) / nx) | 0; if (j < jmin) jmin = j; if (j > jmax) jmax = j; }
    if (src.length < 12) return { rms: 99, n: src.length, scales: [0, 0, 0], volume: n, extent: jmax - jmin + 1 };
    const fit = robustAffine(src, dst, w), T = fit.T, scales = [0, 1, 2].map(c => +Math.hypot(T[c], T[4 + c], T[8 + c]).toFixed(3));
    return { rms: +fit.rms.toFixed(2), n: fit.n, rejected: fit.rejected, scales, volume: n, extent: jmax - jmin + 1 };
  }
  SV.Anat = { robustAffine, centroids, segQuality, tplLabeler, vepParcellation, labelVolume, rigidPart, hemiClasses, prepare, hemisphere, structures, vertexCentroids };
});
