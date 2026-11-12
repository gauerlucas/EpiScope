/* EpiScope — imaging/volops.js : opérations sur volumes binaires et d'étiquettes (lissage, morphologie, composantes,
 * distances, remplissage), sans dépendance. Conventions de src/nifti.js : x le plus rapide, idx = i + nx*(j + ny*k).
 *
 *   masque : TypedArray quelconque, non nul = objet ; les résultats binaires sont des Uint8Array (0/1)
 *   boîte  : { min:[i,j,k], max:[i,j,k] } bornes incluses ; pour crop elle peut déborder de la grille (remplissage 0)
 *   distances en unités voxel (ou mm si opts.spacing), carrées sauf mention contraire
 * Les opérations coûteuses travaillent sur la boîte englobante de l'objet (+ marge) puis recopient le résultat.
 * Fabrique autonome (SV + API standard) : utilisable dans les workers de work.js (nom 'volops').             */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).volops = factory;   // fabrique réutilisée dans les workers (voir work.js)
})(function (SV) {
  'use strict';
  const INF = Infinity;
  // arguments optionnels : un appel par work.js ajoute une fonction de progression en dernier argument
  const obj = o => (o && typeof o === 'object' ? o : {});

  // ---------------------------------------------------------------- boîtes englobantes, recadrage
  /** boîte englobante des voxels non nuls (null si vide) ; pad : marge (nombre ou [px,py,pz]) ;
   *  opts.clamp (défaut true) : borne la boîte à la grille */
  function bbox(data, dims, pad, opts) {
    const [nx, ny, nz] = dims; let x0 = nx, y0 = ny, z0 = nz, x1 = -1, y1 = -1, z1 = -1;
    for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++, o += nx) {
      let a = -1, b = -1;
      for (let i = 0; i < nx; i++) if (data[o + i]) { a = i; break; }
      if (a < 0) continue;
      for (let i = nx - 1; i >= a; i--) if (data[o + i]) { b = i; break; }
      if (a < x0) x0 = a; if (b > x1) x1 = b; if (j < y0) y0 = j; if (j > y1) y1 = j; if (k < z0) z0 = k; z1 = k;
    }
    if (x1 < 0) return null;
    const p = Array.isArray(pad) ? pad : typeof pad === 'number' ? [pad, pad, pad] : [0, 0, 0], clamp = obj(opts).clamp !== false;
    const min = [x0 - p[0], y0 - p[1], z0 - p[2]], max = [x1 + p[0], y1 + p[1], z1 + p[2]];
    if (clamp) for (let a = 0; a < 3; a++) { min[a] = Math.max(0, min[a]); max[a] = Math.min(dims[a] - 1, max[a]); }
    return { min, max };
  }
  const bbDims = bb => [bb.max[0] - bb.min[0] + 1, bb.max[1] - bb.min[1] + 1, bb.max[2] - bb.min[2] + 1];
  /** union de deux boîtes (null toléré) */
  function bboxUnion(a, b) { if (!a) return b; if (!b) return a; return { min: a.min.map((v, k) => Math.min(v, b.min[k])), max: a.max.map((v, k) => Math.max(v, b.max[k])) }; }

  /** extrait la boîte bb (pouvant déborder : 0 hors grille) → { data, dims, bb } */
  function crop(data, dims, bb, Type) {
    const [nx, ny, nz] = dims, sd = bbDims(bb), [sx, sy] = sd, T = Type && Type.BYTES_PER_ELEMENT ? Type : data.constructor, out = new T(sd[0] * sd[1] * sd[2]);
    const i0 = Math.max(0, bb.min[0]), i1 = Math.min(nx - 1, bb.max[0]), len = i1 - i0 + 1; if (len <= 0) return { data: out, dims: sd, bb };
    const same = data.constructor === T && typeof data.subarray === 'function';
    for (let k = Math.max(0, bb.min[2]); k <= Math.min(nz - 1, bb.max[2]); k++) for (let j = Math.max(0, bb.min[1]); j <= Math.min(ny - 1, bb.max[1]); j++) {
      const s = i0 + nx * (j + ny * k), d = (i0 - bb.min[0]) + sx * ((j - bb.min[1]) + sy * (k - bb.min[2]));
      if (same) out.set(data.subarray(s, s + len), d); else for (let i = 0; i < len; i++) out[d + i] = data[s + i];
    }
    return { data: out, dims: sd, bb };
  }
  /** recopie un sous-volume (boîte bb) dans un volume complet (base ou nouveau, rempli de 0) ; parties hors grille ignorées */
  function uncrop(sub, bb, dims, Type, base) {
    const [nx, ny, nz] = dims, [sx, sy] = bbDims(bb), out = base || new (Type || sub.constructor)(nx * ny * nz);
    const i0 = Math.max(0, bb.min[0]), i1 = Math.min(nx - 1, bb.max[0]), len = i1 - i0 + 1; if (len <= 0) return out;
    const same = sub.constructor === out.constructor;
    for (let k = Math.max(0, bb.min[2]); k <= Math.min(nz - 1, bb.max[2]); k++) for (let j = Math.max(0, bb.min[1]); j <= Math.min(ny - 1, bb.max[1]); j++) {
      const d = i0 + nx * (j + ny * k), s = (i0 - bb.min[0]) + sx * ((j - bb.min[1]) + sy * (k - bb.min[2]));
      if (same) out.set(sub.subarray(s, s + len), d); else for (let i = 0; i < len; i++) out[d + i] = sub[s + i];
    }
    return out;
  }
  /** affine (lignes, 16) de la grille recadrée : voxel (0,0,0) du sous-volume = voxel bb.min de l'original */
  function cropAffine(A, bb) {
    const M = Float64Array.from(A), [x, y, z] = bb.min;
    M[3] = A[0] * x + A[1] * y + A[2] * z + A[3]; M[7] = A[4] * x + A[5] * y + A[6] * z + A[7]; M[11] = A[8] * x + A[9] * y + A[10] * z + A[11];
    return M;
  }

  // ---------------------------------------------------------------- utilitaires de masque
  /** masque binaire lo ≤ v ≤ hi (hi optionnel) */
  function threshold(data, lo, hi) { const n = data.length, out = new Uint8Array(n), h = typeof hi === 'number' ? hi : INF; for (let i = 0; i < n; i++) { const v = data[i]; out[i] = v >= lo && v <= h ? 1 : 0; } return out; }
  /** masque des voxels dont l'étiquette appartient à values (Set, tableau ou fonction v → bool) */
  function maskOf(labels, values) {
    const n = labels.length, out = new Uint8Array(n);
    if (typeof values === 'function') { for (let i = 0; i < n; i++) if (labels[i] && values(labels[i])) out[i] = 1; return out; }
    const S = values instanceof Set ? values : new Set(values), L = [...S];
    if (L.length === 1) { const a = L[0]; for (let i = 0; i < n; i++) if (labels[i] === a) out[i] = 1; return out; }
    // table directe si étiquettes entières modestes, sinon Set
    const maxL = Math.max(...L.map(Number)); if (L.every(v => Number.isInteger(v) && v >= 0) && maxL < 1 << 20) {
      const T = new Uint8Array(maxL + 1); for (const v of L) T[v] = 1;
      for (let i = 0; i < n; i++) { const v = labels[i]; if (v > 0 && v <= maxL && T[v] && v === (v | 0)) out[i] = 1; }
      return out;
    }
    for (let i = 0; i < n; i++) if (labels[i] && S.has(labels[i])) out[i] = 1; return out;
  }
  function count(data) { let c = 0; for (let i = 0; i < data.length; i++) if (data[i]) c++; return c; }
  const toBin = m => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 1 : 0; return o; };

  // ---------------------------------------------------------------- lissage gaussien séparable
  function gaussKernel(s, trunc) {
    const R = Math.max(1, Math.floor(trunc * s + 0.5)), w = new Float64Array(2 * R + 1); let sum = 0;   // rayon comme scipy.ndimage
    for (let t = -R; t <= R; t++) { const v = Math.exp(-t * t / (2 * s * s)); w[t + R] = v; sum += v; }
    for (let t = 0; t < w.length; t++) w[t] /= sum; return w;
  }
  function convX(a, b, n, nx, w, zero) {   // x : lignes contiguës
    const R = (w.length - 1) / 2, W = w.length;
    for (let o = 0; o < n; o += nx) {
      for (let i = 0; i < nx; i++) {
        let s = 0;
        if (i >= R && i < nx - R) { const q0 = o + i - R; for (let t = 0; t < W; t++) s += w[t] * a[q0 + t]; }
        else for (let t = -R; t <= R; t++) { let q = i + t; if (q < 0 || q >= nx) { if (zero) continue; q = q < 0 ? 0 : nx - 1; } s += w[t + R] * a[o + q]; }
        b[o + i] = s;
      }
    }
  }
  function convRows(a, b, N, stride, outer, outerStride, rowLen, w, zero, acc) {   // y ou z : somme pondérée de lignes entières
    const R = (w.length - 1) / 2;
    for (let k = 0; k < outer; k++) {
      const base = outerStride * k;
      for (let j = 0; j < N; j++) {
        acc.fill(0, 0, rowLen);
        for (let t = -R; t <= R; t++) {
          let q = j + t; if (q < 0 || q >= N) { if (zero) continue; q = q < 0 ? 0 : N - 1; }
          const s = base + stride * q, wt = w[t + R];
          for (let i = 0; i < rowLen; i++) acc[i] += wt * a[s + i];
        }
        const d = base + stride * j; for (let i = 0; i < rowLen; i++) b[d + i] = acc[i];
      }
    }
  }
  /** flou gaussien 3D (sigma en voxels, nombre ou [sx,sy,sz]) → Float32Array ;
   *  opts.border 'clamp' (défaut, réplique le bord) | 'zero' ; opts.truncate (défaut 3 sigmas) */
  function gaussian(data, dims, sigma, opts) {
    opts = obj(opts);
    const sg = Array.isArray(sigma) ? sigma : [sigma, sigma, sigma], zero = opts.border === 'zero', trunc = opts.truncate || 3;
    const [nx, ny, nz] = dims, n = nx * ny * nz, sxy = nx * ny;
    let a = new Float32Array(n), b = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = data[i];
    if (sg[0] > 0) { convX(a, b, n, nx, gaussKernel(sg[0], trunc), zero); const t = a; a = b; b = t; }
    if (sg[1] > 0) { convRows(a, b, ny, nx, nz, sxy, nx, gaussKernel(sg[1], trunc), zero, new Float64Array(nx)); const t = a; a = b; b = t; }
    if (sg[2] > 0) { convRows(a, b, nz, sxy, 1, 0, sxy, gaussKernel(sg[2], trunc), zero, new Float64Array(sxy)); const t = a; a = b; b = t; }
    return a;
  }

  // ---------------------------------------------------------------- transformée de distance euclidienne exacte
  /* Felzenszwalb & Huttenlocher (2012) : enveloppe inférieure de paraboles, une passe 1D par axe.
   * f : coûts (0 = point source, Infinity = aucun) ; w2 = pas² ; border : points sources virtuels en −1 et n. */
  function edt1d(f, n, w2, d, arg, v, z, border) {
    let k = -1;
    const q0 = border ? -1 : 0, q1 = border ? n : n - 1;
    for (let q = q0; q <= q1; q++) {
      const fq = q < 0 || q >= n ? 0 : f[q]; if (fq === INF) continue;
      const gq = fq + w2 * q * q; let s = 0;
      while (k >= 0) { const r = v[k], fr = r < 0 || r >= n ? 0 : f[r]; s = (gq - (fr + w2 * r * r)) / (2 * w2 * (q - r)); if (s <= z[k]) k--; else break; }
      if (k < 0) { k = 0; v[0] = q; z[0] = -INF; z[1] = INF; } else { k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
    }
    if (k < 0) { for (let p = 0; p < n; p++) { d[p] = INF; arg[p] = -1; } return; }
    for (let p = 0, j = 0; p < n; p++) {
      while (z[j + 1] < p) j++;
      const r = v[j], out = r < 0 || r >= n, fr = out ? 0 : f[r];
      d[p] = w2 * (p - r) * (p - r) + fr; arg[p] = out ? -1 : r;
    }
  }
  /** distance euclidienne au plus proche voxel source (mask non nul ; opts.invert : sources = voxels nuls)
   *  opts.spacing [sx,sy,sz] (défaut 1) ; opts.indices : indice plat du plus proche voxel source (Int32Array, −1 si aucun) ;
   *  opts.borderFeature : l'extérieur de la grille compte comme source (indices alors −1 pour ces cas) ;
   *  opts.sqrt : distances (et non carrés). → { d2 | dist : Float32Array, idx } */
  function edt(mask, dims, opts) {
    opts = obj(opts);
    const [nx, ny, nz] = dims, n = nx * ny * nz, sxy = nx * ny, sp = opts.spacing || [1, 1, 1], inv = !!opts.invert, border = !!opts.borderFeature;
    const D = new Float32Array(n), I = opts.indices ? new Int32Array(n) : null;
    const L = Math.max(nx, ny, nz), B = 16;   // B colonnes traitées ensemble (accès mémoire groupés en y/z)
    const f = new Float64Array(L), d = new Float64Array(L), arg = new Int32Array(L), v = new Int32Array(L + 2), z = new Float64Array(L + 3);
    const lf = new Float64Array(B * L), li = new Int32Array(B * L);
    // passe x
    const w2x = sp[0] * sp[0];
    for (let o = 0; o < n; o += nx) {
      let any = border;
      for (let i = 0; i < nx; i++) { const src = inv ? !mask[o + i] : !!mask[o + i]; f[i] = src ? 0 : INF; if (src) any = true; }
      if (!any) { D.fill(INF, o, o + nx); if (I) I.fill(-1, o, o + nx); continue; }
      edt1d(f, nx, w2x, d, arg, v, z, border);
      for (let i = 0; i < nx; i++) { D[o + i] = d[i]; if (I) I[o + i] = arg[i] >= 0 ? o + arg[i] : -1; }
    }
    // passes y et z : blocs de B colonnes contiguës en x
    const pass = (N, stride, outerN, outerStride, rowLen, w2) => {
      for (let ko = 0; ko < outerN; ko++) for (let i0 = 0; i0 < rowLen; i0 += B) {
        const nb = Math.min(B, rowLen - i0), base = ko * outerStride + i0;
        for (let j = 0; j < N; j++) { const s = base + stride * j; for (let b = 0; b < nb; b++) { lf[b * L + j] = D[s + b]; if (I) li[b * L + j] = I[s + b]; } }
        for (let b = 0; b < nb; b++) {
          let any = border; const off = b * L;
          for (let j = 0; j < N; j++) { const x = lf[off + j]; f[j] = x; if (x !== INF) any = true; }
          if (!any) continue;   // colonne sans source : reste à l'infini
          edt1d(f, N, w2, d, arg, v, z, border);
          for (let j = 0; j < N; j++) { const s = base + stride * j + b; D[s] = d[j]; if (I) { const r = arg[j]; I[s] = r >= 0 ? li[off + r] : -1; } }
        }
      }
    };
    pass(ny, nx, nz, sxy, nx, sp[1] * sp[1]);
    pass(nz, sxy, 1, 0, sxy, sp[2] * sp[2]);
    if (opts.sqrt) { for (let i = 0; i < n; i++) D[i] = Math.sqrt(D[i]); return { dist: D, idx: I }; }
    return { d2: D, idx: I };
  }
  /** carte de distance (mm si spacing) à l'objet (> 0 dehors, 0 dedans) */
  function distanceMap(mask, dims, opts) { return edt(mask, dims, Object.assign({}, opts, { sqrt: true })).dist; }

  /** étiquette de chaque voxel du masque = étiquette du plus proche voxel étiqueté (labels ≠ 0) ;
   *  opts.maxDist (voxels ou mm avec spacing) : au-delà, 0 ; opts.keepOutside : conserve les étiquettes hors masque (sinon 0).
   *  → même type que labels */
  function nearestLabelFill(labels, dims, maskToFill, opts) {
    opts = obj(opts);
    const n = labels.length, out = new labels.constructor(n);
    let bb = bboxUnion(bbox(labels, dims, 0), bbox(maskToFill, dims, 0)); if (!bb) return out;
    const L = crop(labels, dims, bb), M = crop(maskToFill, dims, bb, Uint8Array);
    const e = edt(L.data, L.dims, { indices: true, spacing: opts.spacing }), lim = opts.maxDist != null ? opts.maxDist * opts.maxDist : INF;
    const sub = new labels.constructor(L.data.length);
    for (let v = 0; v < sub.length; v++) {
      if (M.data[v]) { const r = e.idx[v]; if (r >= 0 && e.d2[v] <= lim) sub[v] = L.data[r]; }
      else if (opts.keepOutside) sub[v] = L.data[v];
    }
    return uncrop(sub, bb, dims, labels.constructor, out);
  }

  // ---------------------------------------------------------------- morphologie binaire
  /* boule de rayon r (voxels, réel) par transformée de distance : dilatation = {d²(x, M) ≤ r²}, érosion = {d²(x, ∁M) > r²}
   * (identique à scipy.ndimage avec l'élément structurant {|o|² ≤ r²}, extérieur de la grille = fond).
   * opts.conn (6 | 18 | 26) : itérations de voisinage (r itérations) au lieu de la boule. */
  const NB = {};
  function nbOffsets(conn) {
    if (NB[conn]) return NB[conn]; const L = [];
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const m = Math.abs(di) + Math.abs(dj) + Math.abs(dk); if (!m) continue;
      if (conn === 6 && m > 1) continue; if (conn === 18 && m > 2) continue; L.push([di, dj, dk]);
    }
    return NB[conn] = L;
  }
  function iterMorph(mask, dims, r, conn, dil) {
    const bb = bbox(mask, dims, r + 1, { clamp: false }); if (!bb) return new Uint8Array(mask.length);
    const c = crop(mask, dims, bb, Uint8Array), [sx, sy, sz] = c.dims, sxy = sx * sy, offs = nbOffsets(conn).map(([a, b, d]) => a + sx * (b + sy * d));
    let A = toBin(c.data), Bf = new Uint8Array(A.length);
    for (let it = 0; it < r; it++) {
      Bf.set(A);
      for (let k = 1; k < sz - 1; k++) for (let j = 1; j < sy - 1; j++) for (let i = 1, o = 1 + sx * j + sxy * k; i < sx - 1; i++, o++) {
        if (dil) { if (A[o]) continue; for (const q of offs) if (A[o + q]) { Bf[o] = 1; break; } }
        else { if (!A[o]) continue; for (const q of offs) if (!A[o + q]) { Bf[o] = 0; break; } }
      }
      const t = A; A = Bf; Bf = t;
    }
    return uncrop(A, bb, dims, Uint8Array);
  }
  function dilate(mask, dims, r, opts) {
    opts = obj(opts); if (!(r > 0)) return toBin(mask);
    if (opts.conn) return iterMorph(mask, dims, Math.round(r), opts.conn, true);
    const bb = bbox(mask, dims, Math.ceil(r) + 1); if (!bb) return new Uint8Array(mask.length);
    const c = crop(mask, dims, bb, Uint8Array), e = edt(c.data, c.dims), r2 = r * r + 1e-9, o = new Uint8Array(c.data.length);
    for (let v = 0; v < o.length; v++) o[v] = e.d2[v] <= r2 ? 1 : 0;
    return uncrop(o, bb, dims, Uint8Array);
  }
  function erode(mask, dims, r, opts) {
    opts = obj(opts); if (!(r > 0)) return toBin(mask);
    if (opts.conn) return iterMorph(mask, dims, Math.round(r), opts.conn, false);
    const bb = bbox(mask, dims, 1, { clamp: false }); if (!bb) return new Uint8Array(mask.length);
    const c = crop(mask, dims, bb, Uint8Array), e = edt(c.data, c.dims, { invert: true }), r2 = r * r + 1e-9, o = new Uint8Array(c.data.length);
    for (let v = 0; v < o.length; v++) o[v] = e.d2[v] > r2 ? 1 : 0;
    return uncrop(o, bb, dims, Uint8Array);
  }
  /** fermeture (dilatation puis érosion) dans un domaine sans bord (marge hors grille : pas d'effet de bord) */
  function close(mask, dims, r, opts) {
    opts = obj(opts); if (!(r > 0)) return toBin(mask);
    const R = Math.ceil(r) + 2, bb = bbox(mask, dims, R, { clamp: false }); if (!bb) return new Uint8Array(mask.length);
    const c = crop(mask, dims, bb, Uint8Array);
    let m;
    if (opts.conn) { const ri = Math.round(r); m = iterMorph(iterMorph(c.data, c.dims, ri, opts.conn, true), c.dims, ri, opts.conn, false); }
    else {
      const r2 = r * r + 1e-9; let e = edt(c.data, c.dims); m = new Uint8Array(c.data.length);
      for (let v = 0; v < m.length; v++) m[v] = e.d2[v] <= r2 ? 1 : 0;
      e = edt(m, c.dims, { invert: true }); for (let v = 0; v < m.length; v++) m[v] = e.d2[v] > r2 ? 1 : 0;
    }
    return uncrop(m, bb, dims, Uint8Array);
  }
  /** ouverture (érosion puis dilatation) */
  function open(mask, dims, r, opts) { return dilate(erode(mask, dims, r, opts), dims, r, opts); }

  // ---------------------------------------------------------------- composantes connexes
  /* étiquetage par parcours en profondeur (pile explicite) dans l'ordre de balayage (x le plus rapide) ;
   * eq : les voisins doivent porter la même valeur (sinon : toute valeur non nulle) */
  function labelCore(val, dims, conn, eq) {
    const [nx, ny, nz] = dims, n = nx * ny * nz, sxy = nx * ny, offs = nbOffsets(conn || 26), no = offs.length;
    const flat = offs.map(([a, b, d]) => a + nx * (b + ny * d)), di = offs.map(o => o[0]), dj = offs.map(o => o[1]), dk = offs.map(o => o[2]);
    const lab = new Int32Array(n), sizes = [0]; let stack = new Int32Array(4096);
    for (let s = 0; s < n; s++) {
      if (!val[s] || lab[s]) continue;
      const id = sizes.length, x = val[s]; let top = 0, cnt = 0; lab[s] = id; stack[top++] = s;
      while (top) {
        const v = stack[--top]; cnt++;
        const i = v % nx, t = (v - i) / nx, j = t % ny, k = (t - j) / ny;
        const interior = i > 0 && j > 0 && k > 0 && i < nx - 1 && j < ny - 1 && k < nz - 1;
        for (let q = 0; q < no; q++) {
          if (!interior) { const a = i + di[q], b = j + dj[q], c = k + dk[q]; if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue; }
          const u = v + flat[q], w = val[u];
          if (!w || lab[u] || (eq && w !== x)) continue;
          lab[u] = id; if (top >= stack.length) { const ns = new Int32Array(stack.length * 2); ns.set(stack); stack = ns; } stack[top++] = u;
        }
      }
      sizes.push(cnt);
    }
    return { labels: lab, sizes: Int32Array.from(sizes), count: sizes.length - 1 };
  }
  /** composantes connexes d'un masque (conn 6 | 18 | 26, défaut 26) → { labels: Int32Array (0 = fond), sizes (indice = étiquette), count } */
  function components(mask, dims, opts) { const conn = typeof opts === 'number' ? opts : (opts && opts.conn) || 26; return labelCore(mask, dims, conn, false); }
  /** ne garde que la plus grande composante → Uint8Array */
  function keepLargest(mask, dims, opts) {
    const C = components(mask, dims, opts), out = new Uint8Array(mask.length); if (!C.count) return out;
    let best = 1; for (let c = 2; c <= C.count; c++) if (C.sizes[c] > C.sizes[best]) best = c;
    const L = C.labels; for (let i = 0; i < L.length; i++) if (L[i] === best) out[i] = 1;
    return out;
  }
  /** volume d'étiquettes (en place) : pour chaque étiquette, seul son plus grand amas connexe (défaut 26) est conservé,
   *  les autres voxels sont mis à 0 (à combler ensuite, p. ex. nearestLabelFill) → { removed, clusters, labels } */
  function largestPerLabel(labels, dims, opts) {
    const conn = typeof opts === 'number' ? opts : (opts && opts.conn) || 26;
    const C = labelCore(labels, dims, conn, true), L = C.labels, n = L.length;
    const valOf = new Float64Array(C.count + 1); for (let v = 0; v < n; v++) if (L[v]) valOf[L[v]] = labels[v];
    const best = new Map();
    for (let c = 1; c <= C.count; c++) { const b = best.get(valOf[c]); if (b === undefined || C.sizes[c] > C.sizes[b]) best.set(valOf[c], c); }
    const keep = new Uint8Array(C.count + 1); for (const c of best.values()) keep[c] = 1;
    let removed = 0; for (let v = 0; v < n; v++) if (L[v] && !keep[L[v]]) { labels[v] = 0; removed++; }
    return { removed, clusters: C.count, labels: best.size };
  }
  /** comble les cavités : fond non relié au bord du volume (connexité du fond 6 par défaut) → Uint8Array */
  function fillHoles(mask, dims, opts) {
    const conn = typeof opts === 'number' ? opts : (opts && opts.conn) || 6;
    const bb = bbox(mask, dims, 1, { clamp: false }); if (!bb) return new Uint8Array(mask.length);
    const c = crop(mask, dims, bb, Uint8Array), [sx, sy, sz] = c.dims, n = c.data.length, m = c.data;
    const offs = nbOffsets(conn), flat = offs.map(([a, b, d]) => a + sx * (b + sy * d));
    const reach = new Uint8Array(n); let stack = new Int32Array(1 << 16), top = 0;
    const seed = v => { if (!m[v] && !reach[v]) { reach[v] = 1; if (top >= stack.length) { const ns = new Int32Array(stack.length * 2); ns.set(stack); stack = ns; } stack[top++] = v; } };
    for (let k = 0; k < sz; k++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) if (i === 0 || j === 0 || k === 0 || i === sx - 1 || j === sy - 1 || k === sz - 1) seed(i + sx * (j + sy * k));
    while (top) {
      const v = stack[--top], i = v % sx, t = (v - i) / sx, j = t % sy, k = (t - j) / sy;
      if (i === 0 || j === 0 || k === 0 || i === sx - 1 || j === sy - 1 || k === sz - 1) {
        for (let q = 0; q < offs.length; q++) { const a = i + offs[q][0], b = j + offs[q][1], d = k + offs[q][2]; if (a < 0 || b < 0 || d < 0 || a >= sx || b >= sy || d >= sz) continue; seed(v + flat[q]); }
      } else for (let q = 0; q < flat.length; q++) seed(v + flat[q]);
    }
    const o = new Uint8Array(n); for (let v = 0; v < n; v++) o[v] = reach[v] ? 0 : 1;
    return uncrop(o, bb, dims, Uint8Array);
  }

  // ---------------------------------------------------------------- correction topologique (croissance homotopique)
  /* Points simples pour le couple (6,18) (objet 6-connexe, fond 18-connexe ; Bertrand & Malandain 1994) : x est simple
   * ssi T6(x, X) = 1 et T18(x, X̄) = 1 (nombres topologiques sur voisinages géodésiques du cube 3×3×3, codés en bits ;
   * bit p = (dx+1) + 3(dy+1) + 9(dz+1), centre = 13). Ce couple correspond exactement au marching cubes avec faces
   * ambiguës « séparées » (Mesh.marchingCubes, ambiguity: 'separate'). Le complément se traite par dualité : x est simple
   * pour le fond (18,6) ssi isSimple618(~cfg) l'est pour l'objet. */
  let A6 = null, A18 = null, M6 = 0, M18 = 0, M26 = 0;
  function topoInit() {
    if (A6) return;
    const pos = p => [p % 3 - 1, ((p / 3) | 0) % 3 - 1, ((p / 9) | 0) - 1], d1 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]), dm = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const a6 = new Int32Array(27), a18 = new Int32Array(27);
    for (let p = 0; p < 27; p++) {
      if (p === 13) continue; const P = pos(p), r = d1(P, [0, 0, 0]);
      M26 |= 1 << p; if (r <= 2) M18 |= 1 << p; if (r === 1) M6 |= 1 << p;
      for (let q = 0; q < 27; q++) { if (q === 13 || q === p) continue; const Q = pos(q); if (dm(P, Q) > 1) continue; const s = d1(P, Q); if (s === 1) a6[p] |= 1 << q; if (s <= 2) a18[p] |= 1 << q; }
    }
    A6 = a6; A18 = a18;
  }
  function nComp(set, adj) {   // composantes d'un ensemble de bits (s'arrête dès 2)
    let n = 0;
    while (set) {
      let front = set & -set; set &= ~front;
      while (front) { const lb = front & -front, b = 31 - Math.clz32(lb); front ^= lb; const nb = adj[b] & set; set &= ~nb; front |= nb; }
      if (++n > 1) return n;
    }
    return n;
  }
  /** x (configuration 27 bits de l'objet autour de x, centre ignoré) est-il simple pour (6,18) ? */
  function isSimple618(cfg) {
    if (!A6) topoInit();
    const n1 = cfg & M6; if (!n1) return false;
    const bg = ~cfg & M26, b1 = bg & M18; if (!b1) return false;
    let g = n1; for (let s = n1; s;) { const lb = s & -s; s ^= lb; g |= A6[31 - Math.clz32(lb)]; } g &= cfg & M18;
    if (nComp(g, A6) !== 1) return false;
    let h = b1; for (let s = b1; s;) { const lb = s & -s; s ^= lb; h |= A18[31 - Math.clz32(lb)]; } h &= bg;
    return nComp(h, A18) === 1;
  }
  /** croissance homotopique d'un masque : on part du voxel le plus profond (distance au fond maximale) et on ajoute, par
   *  priorité décroissante, les voxels du masque qui sont des points simples (6,18). Résultat ⊆ masque, topologiquement une
   *  boule (une composante, ni cavité ni anse) ; les anses sont coupées là où le masque est le plus fin.
   *  opts.dual : croissance du fond depuis le bord (couple (18,6), priorité = distance à l'objet) : résultat ⊇ masque, cavités
   *  et tunnels bouchés à leur endroit le plus étroit. opts.priority : Float32Array (plus grand = traité d'abord).
   *  → { mask: Uint8Array, removed | added } */
  function topoGrow(mask, dims, opts) {
    opts = obj(opts); topoInit();
    const dual = !!opts.dual, bb = bbox(mask, dims, dual ? 2 : 1, { clamp: false }), n0 = mask.length;
    if (!bb) return { mask: new Uint8Array(n0), removed: 0, added: 0 };
    const C = crop(mask, dims, bb, Uint8Array), [sx, sy, sz] = C.dims, sxy = sx * sy, n = C.data.length, M = C.data;
    const dom = new Uint8Array(n); for (let v = 0; v < n; v++) dom[v] = (M[v] ? 1 : 0) ^ (dual ? 1 : 0);   // domaine de croissance
    const pr = opts.priority ? crop(opts.priority, dims, bb, Float32Array).data : edt(M, C.dims, { invert: !dual }).d2;
    const R = new Uint8Array(n), st = new Uint8Array(n), next = new Int32Array(n);   // st : 0 libre, 1 en file, 2 acquis, 3 en attente
    // dual + opts.maxDist : le fond au-delà de maxDist de l'objet est acquis d'emblée (seuls les tunnels plus étroits que
    // ~2·maxDist peuvent alors être bouchés ; beaucoup plus rapide)
    if (dual && opts.maxDist > 0) { const L2 = opts.maxDist * opts.maxDist; for (let v = 0; v < n; v++) if (dom[v] && pr[v] > L2) { dom[v] = 0; R[v] = 1; st[v] = 2; } }
    const onBorder = v => { const i = v % sx, t = (v - i) / sx, j = t % sy, k = (t - j) / sy; return i === 0 || j === 0 || k === 0 || i === sx - 1 || j === sy - 1 || k === sz - 1; };
    let pmax = -Infinity, pmin = Infinity, seed = -1;
    for (let v = 0; v < n; v++) if (dom[v]) { if (pr[v] > pmax) { pmax = pr[v]; seed = v; } if (pr[v] < pmin) pmin = pr[v]; }
    // seaux FIFO (croissance en largeur à priorité égale : fronts compacts ; LIFO donnerait des « tentacules »)
    const NBK = 4096, sc = (NBK - 1) / ((pmax - pmin) || 1), head = new Int32Array(NBK).fill(-1), tail = new Int32Array(NBK); let cur = NBK - 1;
    const push = v => { const b = Math.min(Math.round((pr[v] - pmin) * sc), cur); next[v] = -1; if (head[b] < 0) head[b] = v; else next[tail[b]] = v; tail[b] = v; st[v] = 1; };
    const off = new Int32Array(27); for (let p = 0; p < 27; p++) off[p] = (p % 3 - 1) + sx * ((((p / 3) | 0) % 3 - 1) + sy * (((p / 9) | 0) - 1));
    const cand = []; for (let p = 0; p < 27; p++) if (p !== 13 && (dual ? (M18 >> p) & 1 : (M6 >> p) & 1)) cand.push(off[p]);   // voisins candidats (6 pour l'objet, 18 pour le fond)
    const grow = v => { for (let q = 0; q < cand.length; q++) { const u = v + cand[q]; if (dom[u] && st[u] === 0) push(u); } for (let p = 0; p < 27; p++) { const u = v + off[p]; if (st[u] === 3) push(u); } };
    if (dual) {   // fond initial : coque du sous-volume ; candidats : couche suivante
      for (let v = 0; v < n; v++) if (onBorder(v)) { R[v] = 1; st[v] = 2; dom[v] = 0; }
      for (let v = 0; v < n; v++) if (!R[v] && dom[v]) { for (let p = 0; p < 27; p++) { const u = v + off[p]; if (u >= 0 && u < n && R[u]) { push(v); break; } } }
    } else { R[seed] = 1; st[seed] = 2; grow(seed); }
    for (; cur >= 0; cur--) {
      while (head[cur] >= 0) {
        const v = head[cur]; head[cur] = next[v];
        let cfg = 0; for (let p = 0; p < 27; p++) if (R[v + off[p]]) cfg |= 1 << p;
        if (isSimple618(dual ? ~cfg & M26 : cfg)) { R[v] = 1; st[v] = 2; grow(v); } else st[v] = 3;
      }
    }
    let changed = 0; const out = new Uint8Array(n);
    for (let v = 0; v < n; v++) { out[v] = dual ? 1 - R[v] : R[v]; if (out[v] !== M[v]) changed++; }
    const res = { mask: uncrop(out, bb, dims, Uint8Array) }; if (dual) res.added = changed; else res.removed = changed;
    return res;
  }
  /** correction topologique en deux temps (surface de genre 0) : (1) croissance duale du fond (limitée à opts.fillRadius
   *  voxels de l'objet, défaut 4), les « bouchons » laissés (tunnels, cavités) de taille ≤ opts.fillMax voxels (défaut 60,
   *  amas 26-connexes) sont ajoutés à l'objet ; (2) croissance de l'objet, qui coupe les anses restantes à leur endroit le
   *  plus fin. → { mask, added, removed } */
  function topoCorrect(mask, dims, opts) {
    opts = obj(opts);
    const fillMax = opts.fillMax != null ? opts.fillMax : 60, fr = opts.fillRadius != null ? opts.fillRadius : 4;
    const bb = bbox(mask, dims, Math.ceil(fr) + 3, { clamp: false }); if (!bb) return { mask: new Uint8Array(mask.length), added: 0, removed: 0 };
    const C = crop(mask, dims, bb, Uint8Array), cd = C.dims, M0 = toBin(C.data); let m = M0, added = 0;
    if (fillMax > 0) {
      const g = topoGrow(M0, cd, { dual: true, maxDist: fr }), plug = new Uint8Array(M0.length); let any = 0;
      for (let v = 0; v < plug.length; v++) if (g.mask[v] && !M0[v]) { plug[v] = 1; any++; }
      if (any) {
        const L = labelCore(plug, cd, 26, false); m = M0.slice();
        for (let v = 0; v < plug.length; v++) { const c = L.labels[v]; if (c && L.sizes[c] <= fillMax) { m[v] = 1; added++; } }
      }
    }
    const g2 = topoGrow(m, cd);
    return { mask: uncrop(g2.mask, bb, dims, Uint8Array), added, removed: g2.removed };
  }

  // ---------------------------------------------------------------- sous-échantillonnage
  /** réduction par facteur entier f (blocs f³, derniers blocs partiels moyennés sur les voxels présents) ;
   *  opts.mode 'mean' (défaut) | 'mode' (étiquettes) | 'max' | 'min' ; opts.ignoreZero (mode) ; opts.affine → affine réduite */
  function downsample(data, dims, f, opts) {
    opts = obj(opts); f = Math.max(1, Math.round(f));
    const mode = opts.mode || 'mean', [nx, ny, nz] = dims, d2 = [Math.ceil(nx / f), Math.ceil(ny / f), Math.ceil(nz / f)];
    const Out = mode === 'mean' ? Float32Array : data.constructor, out = new Out(d2[0] * d2[1] * d2[2]);
    const vals = new Float64Array(f * f * f), cnts = new Int32Array(f * f * f);
    for (let K = 0, o = 0; K < d2[2]; K++) for (let J = 0; J < d2[1]; J++) for (let I = 0; I < d2[0]; I++, o++) {
      let m = 0, s = 0, mx = -INF, mn = INF;
      for (let k = K * f; k < Math.min(nz, K * f + f); k++) for (let j = J * f; j < Math.min(ny, J * f + f); j++) for (let i = I * f; i < Math.min(nx, I * f + f); i++) {
        const v = data[i + nx * (j + ny * k)]; s += v; if (v > mx) mx = v; if (v < mn) mn = v;
        if (mode === 'mode') { if (opts.ignoreZero && !v) continue; let q = 0; while (q < m && vals[q] !== v) q++; if (q === m) { vals[m] = v; cnts[m++] = 0; } cnts[q]++; } else m++;
      }
      if (mode === 'mean') out[o] = m ? s / m : 0; else if (mode === 'max') out[o] = mx; else if (mode === 'min') out[o] = mn;
      else { let b = -1; for (let q = 0; q < m; q++) if (b < 0 || cnts[q] > cnts[b]) b = q; out[o] = b >= 0 ? vals[b] : 0; }
    }
    const res = { data: out, dims: d2 };
    if (opts.affine) {   // voxel réduit (I,J,K) = centre du bloc (f·I + (f−1)/2, …)
      const A = opts.affine, M = new Float64Array(16), h = (f - 1) / 2;
      for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) M[4 * r + c] = A[4 * r + c] * f; M[4 * r + 3] = A[4 * r + 3] + h * (A[4 * r] + A[4 * r + 1] + A[4 * r + 2]); }
      M[15] = 1; res.affine = M;
    }
    return res;
  }

  SV.VolOps = {
    bbox, bboxUnion, bbDims, crop, uncrop, cropAffine, threshold, maskOf, count,
    gaussian, edt, distanceMap, nearestLabelFill,
    dilate, erode, open, close, components, keepLargest, largestPerLabel, fillHoles, downsample, topoGrow, topoCorrect, isSimple618,
  };
});
