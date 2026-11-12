/* EpiScope — imaging/mesh.js : maillages de surface à partir de volumes (marching cubes), nettoyage, lissage, décimation
 * (métrique d'erreur quadrique), gonflement type FreeSurfer, profondeur sulcale, entrées/sorties GIfTI et binaire compact.
 *
 * Conventions : un maillage est { pos: Float32Array xyz (monde RAS mm), faces: Uint32Array (3 indices / triangle) } ;
 * triangles orientés dans le sens direct vu de l'extérieur (normale (b−a)×(c−a) sortante) ; volumes comme src/nifti.js
 * (dims, data x le plus rapide, affine voxel → monde en lignes). Structure interne pour l'édition : table des coins
 * (coin c = 3f + k ; V[c] sommet ; O[c] coin opposé à travers l'arête (V[n(c)], V[p(c)])).
 * Fabrique autonome (dépend de SV.VolOps pour les chaînes complètes, de SV.Mat4 pour l'échantillonnage d'étiquettes) :
 * utilisable dans les workers de work.js (noms 'nifti', 'volops', 'mesh').                                          */
(function (factory) {
  const G = typeof window !== 'undefined' ? (window.SV = window.SV || {}) : (globalThis.SV = globalThis.SV || {});
  factory(G); (G._factories = G._factories || {}).mesh = factory;   // fabrique réutilisée dans les workers (voir work.js)
})(function (SV) {
  'use strict';
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const NX = c => (c % 3 === 2 ? c - 2 : c + 1), PV = c => (c % 3 === 0 ? c + 2 : c - 1);   // coin suivant / précédent du triangle
  const det3 = A => A[0] * (A[5] * A[10] - A[6] * A[9]) - A[1] * (A[4] * A[10] - A[6] * A[8]) + A[2] * (A[4] * A[9] - A[5] * A[8]);
  const posOf = m => m.pos || m.pial;
  // arguments optionnels : un appel par work.js ajoute une fonction de progression en dernier argument
  const isArr = a => ArrayBuffer.isView(a) || Array.isArray(a), num = (x, d) => (typeof x === 'number' ? x : d), obj = o => (o && typeof o === 'object' ? o : {});
  const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);   // Math.hypot est lent sous V8

  // =====================================================================  marching cubes
  /* Tables construites à la demande, par configuration (8 bits) et décision sur les faces ambiguës (6 bits) :
   * sur chaque face du cube, segments de contour orientés (intérieur à droite vu de l'extérieur), décision des faces
   * ambiguës par le test asymptotique (valeur du col bilinéaire) — ne dépend que des 4 valeurs de la face, donc
   * identique pour les deux cubes voisins : surface fermée et variété (chaque arête de contour partagée par 2 triangles).
   * Les boucles sont triangulées en éventail sans diagonale joignant deux arêtes d'une même face (sinon l'arête serait
   * aussi créée par le cube voisin) ; à défaut (rare), un sommet central est ajouté. */
  const MC_C = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const MC_E = [[0, 1], [1, 2], [3, 2], [0, 3], [4, 5], [5, 6], [7, 6], [4, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const MC_F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
  const MC_FN = [[0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0]];
  const MC_T = new Array(256 * 64); let MC_EF = null, MC_AMB = null;
  function mcInit() {
    if (MC_EF) return;
    MC_EF = new Uint8Array(12);
    for (let e = 0; e < 12; e++) for (let f = 0; f < 6; f++) if (MC_F[f].includes(MC_E[e][0]) && MC_F[f].includes(MC_E[e][1])) MC_EF[e] |= 1 << f;
    MC_AMB = [];
    for (let c = 0; c < 256; c++) { const L = []; for (let f = 0; f < 6; f++) { const s = MC_F[f].map(k => (c >> k) & 1); if (s[0] === s[2] && s[1] === s[3] && s[0] !== s[1]) L.push(f); } MC_AMB.push(L); }
  }
  const mcEdge = (a, b) => MC_E.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const mcMid = e => { const [a, b] = MC_E[e]; return [0, 1, 2].map(k => (MC_C[a][k] + MC_C[b][k]) / 2); };
  function triQ(a, b, c) {   // qualité 4√3·aire / Σ l² (1 = équilatéral)
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const n = len3(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    const s = u[0] ** 2 + u[1] ** 2 + u[2] ** 2 + v[0] ** 2 + v[1] ** 2 + v[2] ** 2 + w[0] ** 2 + w[1] ** 2 + w[2] ** 2;
    return s > 0 ? 2 * Math.sqrt(3) * n / s : 0;
  }
  function mcCase(c, bits) {
    const next = new Int8Array(12).fill(-1);
    for (let f = 0; f < 6; f++) {
      const fc = MC_F[f], s = fc.map(k => (c >> k) & 1), E = m => mcEdge(fc[m], fc[(m + 1) % 4]);   // E(m) : arête entre positions m et m+1
      const cuts = [0, 1, 2, 3].filter(m => s[m] !== s[(m + 1) % 4]); if (!cuts.length) continue;
      const segs = [];
      if (cuts.length === 2) segs.push([E(cuts[0]), E(cuts[1]), fc[s.indexOf(1)], 1]);
      else { const conn = (bits >> f) & 1; for (let m = 0; m < 4; m++) if (conn ? !s[m] : s[m]) segs.push([E((m + 3) % 4), E(m), fc[m], s[m]]); }   // coins isolés
      for (const [e0, e1, q, qin] of segs) {
        const a = mcMid(e0), b = mcMid(e1), p = MC_C[q], n = MC_FN[f];
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
        const sg = (d[1] * w[2] - d[2] * w[1]) * n[0] + (d[2] * w[0] - d[0] * w[2]) * n[1] + (d[0] * w[1] - d[1] * w[0]) * n[2];
        let from = e0, to = e1; if (qin ? sg > 0 : sg < 0) { from = e1; to = e0; }
        if (next[from] >= 0) throw new Error('marching cubes : table incohérente (' + c + ',' + bits + ')');
        next[from] = to;
      }
    }
    const used = new Uint8Array(12), tris = [], centers = [];
    for (let e = 0; e < 12; e++) {
      if (next[e] < 0 || used[e]) continue;
      const L = []; let x = e; while (!used[x]) { used[x] = 1; L.push(x); x = next[x]; if (x < 0) throw new Error('marching cubes : boucle ouverte'); }
      const m = L.length;
      if (m === 3) { tris.push(L[0], L[1], L[2]); continue; }
      let best = -1, bq = -1;
      for (let i = 0; i < m; i++) {
        let ok = true; for (let j = 0; j < m && ok; j++) { if (j === i || j === (i + 1) % m || j === (i + m - 1) % m) continue; if (MC_EF[L[i]] & MC_EF[L[j]]) ok = false; }
        if (!ok) continue;
        let q = 1; for (let t = 1; t < m - 1; t++) q = Math.min(q, triQ(mcMid(L[i]), mcMid(L[(i + t) % m]), mcMid(L[(i + t + 1) % m])));
        if (q > bq) { bq = q; best = i; }
      }
      if (best >= 0) for (let t = 1; t < m - 1; t++) tris.push(L[best], L[(best + t) % m], L[(best + t + 1) % m]);
      else { const code = 12 + centers.length; centers.push(L); for (let t = 0; t < m; t++) tris.push(code, L[t], L[(t + 1) % m]); }
    }
    return { tris: Int8Array.from(tris), centers };
  }

  /** isosurface {field > iso} → { pos (monde mm via affine), faces } ; un sommet par arête coupée de la grille ;
   *  bbox {min,max} (voxels inclus) : seule cette région est traitée, l'extérieur compte comme « dehors » (surface fermée) ;
   *  opts.outside (valeur hors région, défaut min(0, iso−1)), opts.minT (écart minimal aux nœuds, défaut 1e−3 voxel),
   *  opts.ambiguity : 'decider' (défaut, test asymptotique), 'separate' (coins intérieurs jamais reliés par une face ambiguë :
   *  topologie (6,18) des voxels > iso, cf. VolOps.topoGrow) ou 'join' (18,6) */
  function marchingCubes(field, dims, iso, affine, bbox, opts) {
    mcInit(); opts = obj(opts); iso = +iso; if (!(bbox && bbox.min)) bbox = null; if (!isArr(affine)) affine = null;
    const [nx, ny] = dims;
    const bb = bbox ? { min: bbox.min.map(v => Math.max(0, v)), max: bbox.max.map((v, k) => Math.min(dims[k] - 1, v)) } : { min: [0, 0, 0], max: dims.map(d => d - 1) };
    const outside = opts.outside != null ? +opts.outside : Math.min(0, iso - 1), tE = opts.minT != null ? opts.minT : 1e-3;
    const ambMode = opts.ambiguity === 'separate' ? 0 : opts.ambiguity === 'join' ? 2 : 1;   // 'separate' ≡ topologie (6,18) de {field > iso}, 'join' ≡ (18,6)
    const ox = bb.min[0] - 1, oy = bb.min[1] - 1, oz = bb.min[2] - 1, Rx = bb.max[0] - bb.min[0] + 3, Ry = bb.max[1] - bb.min[1] + 3, Rz = bb.max[2] - bb.min[2] + 3;
    const A = affine || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], flip = det3(A) < 0, np = Rx * Ry;
    let P0 = new Float32Array(np), P1 = new Float32Array(np), X0 = new Int32Array(np), Y0 = new Int32Array(np), X1 = new Int32Array(np), Y1 = new Int32Array(np);
    const Z = new Int32Array(np);
    let pos = new Float32Array(3 << 15), nV = 0, fc = new Uint32Array(3 << 15), nF3 = 0;
    const addV = (x, y, z) => {
      if (nV * 3 + 3 > pos.length) { const t = new Float32Array(pos.length * 2); t.set(pos); pos = t; }
      const o = nV * 3; pos[o] = A[0] * x + A[1] * y + A[2] * z + A[3]; pos[o + 1] = A[4] * x + A[5] * y + A[6] * z + A[7]; pos[o + 2] = A[8] * x + A[9] * y + A[10] * z + A[11];
      return nV++;
    };
    const lerp = (a, b) => { const t = (iso - a) / (b - a); return t > tE ? (t < 1 - tE ? t : 1 - tE) : tE; };
    const fill = (Pl, kk) => {
      const gk = oz + kk, inK = gk >= bb.min[2] && gk <= bb.max[2];
      for (let jj = 0, p = 0; jj < Ry; jj++) {
        const gj = oy + jj, inJ = inK && gj >= bb.min[1] && gj <= bb.max[1], row = nx * (gj + ny * gk);
        for (let ii = 0; ii < Rx; ii++, p++) { const gi = ox + ii; Pl[p] = inJ && gi >= bb.min[0] && gi <= bb.max[0] ? field[gi + row] : outside; }
      }
    };
    const planeV = (Pl, X, Y, kk) => {
      for (let jj = 0, p = 0; jj < Ry; jj++) for (let ii = 0; ii < Rx; ii++, p++) {
        const a = Pl[p], ia = a > iso; X[p] = -1; Y[p] = -1;
        if (ii < Rx - 1) { const b = Pl[p + 1]; if ((b > iso) !== ia) X[p] = addV(ox + ii + lerp(a, b), oy + jj, oz + kk); }
        if (jj < Ry - 1) { const b = Pl[p + Rx]; if ((b > iso) !== ia) Y[p] = addV(ox + ii, oy + jj + lerp(a, b), oz + kk); }
      }
    };
    fill(P0, 0); planeV(P0, X0, Y0, 0);
    const val = new Float64Array(8), ev = new Int32Array(24);
    for (let kk = 0; kk < Rz - 1; kk++) {
      fill(P1, kk + 1); planeV(P1, X1, Y1, kk + 1);
      for (let jj = 0, p = 0; jj < Ry; jj++) for (let ii = 0; ii < Rx; ii++, p++) { const a = P0[p], b = P1[p]; Z[p] = (a > iso) !== (b > iso) ? addV(ox + ii, oy + jj, oz + kk + lerp(a, b)) : -1; }
      for (let jj = 0; jj < Ry - 1; jj++) for (let ii = 0, p = Rx * jj; ii < Rx - 1; ii++, p++) {
        const v0 = P0[p], v1 = P0[p + 1], v2 = P0[p + 1 + Rx], v3 = P0[p + Rx], v4 = P1[p], v5 = P1[p + 1], v6 = P1[p + 1 + Rx], v7 = P1[p + Rx];
        const c = (v0 > iso ? 1 : 0) | (v1 > iso ? 2 : 0) | (v2 > iso ? 4 : 0) | (v3 > iso ? 8 : 0) | (v4 > iso ? 16 : 0) | (v5 > iso ? 32 : 0) | (v6 > iso ? 64 : 0) | (v7 > iso ? 128 : 0);
        if (c === 0 || c === 255) continue;
        let bits = 0; const amb = MC_AMB[c];
        if (amb.length && ambMode !== 0) {
          if (ambMode === 2) for (const f of amb) bits |= 1 << f; else {
          val[0] = v0 - iso; val[1] = v1 - iso; val[2] = v2 - iso; val[3] = v3 - iso; val[4] = v4 - iso; val[5] = v5 - iso; val[6] = v6 - iso; val[7] = v7 - iso;
          for (const f of amb) { const F = MC_F[f], pa = val[F[0]] * val[F[2]], pb = val[F[1]] * val[F[3]]; if ((c >> F[0]) & 1 ? pa > pb : pb > pa) bits |= 1 << f; }   // col intérieur ⇒ coins intérieurs reliés
        } }
        const key = c | (bits << 8), T = MC_T[key] || (MC_T[key] = mcCase(c, bits));
        ev[0] = X0[p]; ev[1] = Y0[p + 1]; ev[2] = X0[p + Rx]; ev[3] = Y0[p]; ev[4] = X1[p]; ev[5] = Y1[p + 1]; ev[6] = X1[p + Rx]; ev[7] = Y1[p];
        ev[8] = Z[p]; ev[9] = Z[p + 1]; ev[10] = Z[p + 1 + Rx]; ev[11] = Z[p + Rx];
        for (let L = 0; L < T.centers.length; L++) {   // sommet central (barycentre des sommets de la boucle)
          const lp = T.centers[L]; let sx = 0, sy = 0, sz = 0;
          for (const e of lp) { const o = ev[e] * 3; sx += pos[o]; sy += pos[o + 1]; sz += pos[o + 2]; }
          if (nV * 3 + 3 > pos.length) { const t = new Float32Array(pos.length * 2); t.set(pos); pos = t; }
          pos[nV * 3] = sx / lp.length; pos[nV * 3 + 1] = sy / lp.length; pos[nV * 3 + 2] = sz / lp.length; ev[12 + L] = nV++;
        }
        const tr = T.tris;
        if (nF3 + tr.length > fc.length) { const t = new Uint32Array(Math.max(fc.length * 2, nF3 + tr.length)); t.set(fc); fc = t; }
        for (let t = 0; t < tr.length; t += 3) {
          const a = ev[tr[t]], b = ev[tr[t + 1]], d = ev[tr[t + 2]];
          fc[nF3++] = a; if (flip) { fc[nF3++] = d; fc[nF3++] = b; } else { fc[nF3++] = b; fc[nF3++] = d; }
        }
      }
      let t = P0; P0 = P1; P1 = t; t = X0; X0 = X1; X1 = t; t = Y0; Y0 = Y1; Y1 = t;
    }
    return { pos: pos.slice(0, nV * 3), faces: fc.slice(0, nF3) };
  }

  // =====================================================================  table des coins, topologie
  /** coins opposés (−1 : bord, arête non-variété ou orientation incohérente) */
  function opposites(V, nv) {
    const nc = V.length, off = new Int32Array(nv + 1), he = new Int32Array(nc), O = new Int32Array(nc).fill(-1);
    for (let c = 0; c < nc; c++) off[V[NX(c)] + 1]++;
    for (let v = 0; v < nv; v++) off[v + 1] += off[v];
    const fp = off.slice(0, nv); for (let c = 0; c < nc; c++) he[fp[V[NX(c)]]++] = c;   // demi-arête du coin c : V[n(c)] → V[p(c)]
    for (let c = 0; c < nc; c++) {
      const s = V[NX(c)], e = V[PV(c)]; let found = -1, m = 0;
      for (let t = off[e], te = off[e + 1]; t < te; t++) { const d = he[t]; if (V[PV(d)] === s) { found = d; m++; } }
      if (m === 1) O[c] = found;
    }
    // réciprocité : une demi-arête dupliquée rend la recherche de sa jumelle ambiguë (m > 1), ce qui invalide les deux
    for (let c = 0; c < nc; c++) if (O[c] >= 0 && O[O[c]] !== c) O[c] = -1;
    return O;
  }
  function uf(n) { const p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i; const find = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }; return { p, find, union(a, b) { a = find(a); b = find(b); if (a !== b) p[a < b ? b : a] = a < b ? a : b; } }; }

  /** bilan topologique : V (sommets référencés), E, F, χ = V − E + F, arêtes de bord / non-variétés / à orientation
   *  incohérente, sommets non-variétés (plusieurs éventails), composantes, genre (si fermé et variété) */
  function topology(mesh, facesArg) {
    if (!isArr(facesArg)) facesArg = null;
    const pos = facesArg ? mesh : posOf(mesh), F = facesArg || mesh.faces, nv = pos.length / 3, nc = F.length, nf = nc / 3;
    const V = F instanceof Int32Array ? F : Int32Array.from(F);
    const off = new Int32Array(nv + 1); for (let c = 0; c < nc; c++) { const a = V[NX(c)], b = V[PV(c)]; off[Math.min(a, b) + 1]++; }
    for (let v = 0; v < nv; v++) off[v + 1] += off[v];
    const fp = off.slice(0, nv), oth = new Int32Array(nc), dir = new Int8Array(nc);
    for (let c = 0; c < nc; c++) { const a = V[NX(c)], b = V[PV(c)], k = fp[Math.min(a, b)]++; oth[k] = Math.max(a, b); dir[k] = a < b ? 1 : -1; }
    let E = 0, bndE = 0, nonMan = 0, flipped = 0;
    for (let v = 0; v < nv; v++) {
      const s = off[v], e = off[v + 1];
      for (let i = s + 1; i < e; i++) { const x = oth[i], d = dir[i]; let j = i - 1; while (j >= s && oth[j] > x) { oth[j + 1] = oth[j]; dir[j + 1] = dir[j]; j--; } oth[j + 1] = x; dir[j + 1] = d; }
      for (let i = s; i < e;) { let j = i + 1, sd = dir[i]; while (j < e && oth[j] === oth[i]) { sd += dir[j]; j++; } const m = j - i; E++; if (m === 1) bndE++; else if (m === 2) { if (sd !== 0) flipped++; } else nonMan++; i = j; }
    }
    const used = new Uint8Array(nv); for (let c = 0; c < nc; c++) used[V[c]] = 1; let Vr = 0; for (let v = 0; v < nv; v++) Vr += used[v];
    // sommets : nombre d'éventails de coins (circulation par les coins opposés)
    const O = opposites(V, nv), voff = new Int32Array(nv + 1); for (let c = 0; c < nc; c++) voff[V[c] + 1]++; for (let v = 0; v < nv; v++) voff[v + 1] += voff[v];
    const vfp = voff.slice(0, nv), vc = new Int32Array(nc); for (let c = 0; c < nc; c++) vc[vfp[V[c]]++] = c;
    const seen = new Uint8Array(nc); let nmv = 0;
    for (let v = 0; v < nv; v++) {
      let fans = 0;
      for (let t = voff[v]; t < voff[v + 1]; t++) {
        const c0 = vc[t]; if (seen[c0]) continue; fans++;
        let q = c0, guard = 0; do { seen[q] = 1; const o = O[NX(q)]; if (o < 0) break; q = NX(o); } while (q !== c0 && ++guard < 100000);
        q = c0; guard = 0; for (;;) { const o = O[PV(q)]; if (o < 0) break; q = PV(o); if (q === c0 || seen[q] || ++guard > 100000) break; seen[q] = 1; }
      }
      if (fans > 1) nmv++;
    }
    const U = uf(nv); for (let c = 0; c < nc; c += 3) { U.union(V[c], V[c + 1]); U.union(V[c], V[c + 2]); }
    let comps = 0; for (let v = 0; v < nv; v++) if (used[v] && U.find(v) === v) comps++;
    const euler = Vr - E + nf, closed = bndE === 0, manifold = nonMan === 0 && nmv === 0 && flipped === 0;
    return { V: Vr, E, F: nf, euler, boundaryEdges: bndE, nonManifoldEdges: nonMan, flippedEdges: flipped, nonManifoldVertices: nmv, components: comps, closed, manifold, genus: closed && manifold ? (2 * comps - euler) / 2 : null };
  }

  /** retire les faces non retenues (keep[f] = 0) et les sommets non référencés ; extra : tableaux par sommet à réindexer */
  function compact(pos, faces, keep, extra) {
    if (!isArr(keep)) keep = null; if (!(extra && typeof extra === 'object')) extra = null;
    const nv = pos.length / 3, nf = faces.length / 3, map = new Int32Array(nv).fill(-1); let m = 0, kf = 0;
    for (let f = 0; f < nf; f++) if (!keep || keep[f]) { kf++; for (let k = 0; k < 3; k++) { const v = faces[3 * f + k]; if (map[v] < 0) map[v] = -2; } }
    for (let v = 0; v < nv; v++) if (map[v] === -2) map[v] = m++;
    const P = new Float32Array(3 * m), Fo = new Uint32Array(3 * kf);
    for (let v = 0; v < nv; v++) { const w = map[v]; if (w >= 0) { P[3 * w] = pos[3 * v]; P[3 * w + 1] = pos[3 * v + 1]; P[3 * w + 2] = pos[3 * v + 2]; } }
    for (let f = 0, o = 0; f < nf; f++) if (!keep || keep[f]) { Fo[o++] = map[faces[3 * f]]; Fo[o++] = map[faces[3 * f + 1]]; Fo[o++] = map[faces[3 * f + 2]]; }
    const out = { pos: P, faces: Fo, map };
    if (extra) { out.extra = {}; for (const k in extra) { const a = extra[k], w = a.length / nv, b = new a.constructor(m * w); for (let v = 0; v < nv; v++) if (map[v] >= 0) for (let q = 0; q < w; q++) b[map[v] * w + q] = a[v * w + q]; out.extra[k] = b; } }
    return out;
  }
  /** composantes connexes (par sommets partagés) → { comp: Int32Array par face, count, sizes (faces par composante) } */
  function faceComponents(faces, nv) {
    const nf = faces.length / 3, U = uf(nv); for (let c = 0; c < faces.length; c += 3) { U.union(faces[c], faces[c + 1]); U.union(faces[c], faces[c + 2]); }
    const id = new Int32Array(nv).fill(-1), comp = new Int32Array(nf), sizes = []; let n = 0;
    for (let f = 0; f < nf; f++) { const r = U.find(faces[3 * f]); if (id[r] < 0) { id[r] = n++; sizes.push(0); } comp[f] = id[r]; sizes[id[r]]++; }
    return { comp, count: n, sizes: Int32Array.from(sizes) };
  }
  /** plus grande composante connexe (en nombre de faces) */
  function largestComponent(mesh) {
    const pos = posOf(mesh), C = faceComponents(mesh.faces, pos.length / 3); if (C.count <= 1) return { pos, faces: mesh.faces };
    let b = 0; for (let i = 1; i < C.count; i++) if (C.sizes[i] > C.sizes[b]) b = i;
    const keep = new Uint8Array(C.comp.length); for (let f = 0; f < keep.length; f++) keep[f] = C.comp[f] === b ? 1 : 0;
    const r = compact(pos, mesh.faces, keep); return { pos: r.pos, faces: r.faces };
  }
  /** retire les composantes de moins de minFaces faces */
  function removeSmallComponents(mesh, minFaces) {
    const pos = posOf(mesh), C = faceComponents(mesh.faces, pos.length / 3), keep = new Uint8Array(C.comp.length);
    for (let f = 0; f < keep.length; f++) keep[f] = C.sizes[C.comp[f]] >= minFaces ? 1 : 0;
    const r = compact(pos, mesh.faces, keep); return { pos: r.pos, faces: r.faces, components: C.sizes.filter(s => s >= minFaces).length };
  }

  // =====================================================================  maillage éditable (effondrements, bascules)
  function editable(pos, faces) {
    const nv = pos.length / 3, nc = faces.length;
    const P = Float64Array.from(pos), V = Int32Array.from(faces), O = opposites(V, nv);
    const VC = new Int32Array(nv).fill(-1); for (let c = 0; c < nc; c++) VC[V[c]] = c;
    const deadF = new Uint8Array(nc / 3), bnd = new Uint8Array(nv);
    for (let c = 0; c < nc; c++) if (O[c] < 0) { bnd[V[NX(c)]] = 1; bnd[V[PV(c)]] = 1; }
    const mark = new Int32Array(nv), MAXR = 2048, ringA = new Int32Array(MAXR), ringB = new Int32Array(MAXR);
    const E = { P, V, O, VC, deadF, bnd, nv, nc, nfAlive: nc / 3, ringA, ringB, na: 0, nb: 0, stamp: 0 };
    /** coins autour du sommet de start (cycle fermé) ; −1 si bord ou valence excessive */
    E.ring = (start, out) => { let q = start, m = 0; do { if (m >= MAXR) return -1; out[m++] = q; const t = O[NX(q)]; if (t < 0) return -1; q = NX(t); } while (q !== start); return m; };
    /** condition de lien pour l'effondrement de l'arête opposée au coin c (a = V[n(c)], b = V[p(c)]) ; remplit ringA/ringB */
    E.linkOK = c => {
      const o = O[c]; if (o < 0) return false;
      const cn = NX(c), cp = PV(c), a = V[cn], b = V[cp];
      if (bnd[a] || bnd[b] || V[c] === V[o] || E.nfAlive <= 4) return false;
      const na = E.ring(cn, ringA); if (na < 0) return false; const nb = E.ring(cp, ringB); if (nb < 0) return false;
      const st = ++E.stamp; for (let i = 0; i < na; i++) mark[V[NX(ringA[i])]] = st;
      let common = 0; for (let i = 0; i < nb; i++) if (mark[V[NX(ringB[i])]] === st) common++;
      E.na = na; E.nb = nb; return common === 2;
    };
    /** triangles voisins après déplacement en (x,y,z) : pas de retournement (cos > cosMin) ; si qMin > 0, la qualité minimale
     *  du voisinage (triangles supprimés compris) ne doit pas se dégrader sous qMin (un effondrement qui retire un triangle
     *  effilé reste permis) */
    const triq = (a, b, c) => {   // qualité 4√3·aire/Σl² des sommets a, b, c (indices ×3)
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2], wx = P[c] - P[b], wy = P[c + 1] - P[b + 1], wz = P[c + 2] - P[b + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, s = ux * ux + uy * uy + uz * uz + vx * vx + vy * vy + vz * vz + wx * wx + wy * wy + wz * wz;
      return s > 0 ? 3.4641016 * Math.sqrt(nx * nx + ny * ny + nz * nz) / s : 0;
    };
    E.moveOK = (c, x, y, z, cosMin, qMin) => {
      const t0 = (c / 3) | 0, t1 = (O[c] / 3) | 0;
      let qOld = qMin > 0 ? Math.min(triq(3 * V[3 * t0], 3 * V[3 * t0 + 1], 3 * V[3 * t0 + 2]), triq(3 * V[3 * t1], 3 * V[3 * t1 + 1], 3 * V[3 * t1 + 2])) : 0, qNew = 1;
      for (let r = 0; r < 2; r++) {
        const R = r ? ringB : ringA, n = r ? E.nb : E.na;
        for (let i = 0; i < n; i++) {
          const q = R[i], t = (q / 3) | 0; if (t === t0 || t === t1) continue;
          const v = V[q] * 3, u = V[NX(q)] * 3, w = V[PV(q)] * 3;
          const ux = P[u] - P[v], uy = P[u + 1] - P[v + 1], uz = P[u + 2] - P[v + 2], wx = P[w] - P[v], wy = P[w + 1] - P[v + 1], wz = P[w + 2] - P[v + 2];
          const ox = uy * wz - uz * wy, oy = uz * wx - ux * wz, oz = ux * wy - uy * wx;
          const Ux = P[u] - x, Uy = P[u + 1] - y, Uz = P[u + 2] - z, Wx = P[w] - x, Wy = P[w + 1] - y, Wz = P[w + 2] - z;
          const nx = Uy * Wz - Uz * Wy, ny = Uz * Wx - Ux * Wz, nz = Ux * Wy - Uy * Wx;
          const lo = Math.sqrt(ox * ox + oy * oy + oz * oz), ln = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (lo > 1e-12 && ox * nx + oy * ny + oz * nz <= cosMin * lo * ln) return false;
          if (qMin > 0) {
            const vx = P[u] - P[w], vy = P[u + 1] - P[w + 1], vz = P[u + 2] - P[w + 2], l2 = vx * vx + vy * vy + vz * vz;
            const qn = 3.4641016 * ln / (Ux * Ux + Uy * Uy + Uz * Uz + Wx * Wx + Wy * Wy + Wz * Wz + l2 || 1), qo = 3.4641016 * lo / (ux * ux + uy * uy + uz * uz + wx * wx + wy * wy + wz * wz + l2 || 1);
            if (qn < qNew) qNew = qn; if (qo < qOld) qOld = qo;
          }
        }
      }
      return !(qMin > 0 && qNew < qMin && qNew < qOld);
    };
    /** effondrement (après linkOK) : b est fusionné dans a, placé en (x,y,z) ; retourne les coins des triangles autour de a */
    E.collapse = (c, x, y, z) => {
      const o = O[c], cn = NX(c), cp = PV(c), on = NX(o), op = PV(o), a = V[cn], b = V[cp], xv = V[c], yv = V[o];
      const u0 = O[cn], w0 = O[cp], u1 = O[on], w1 = O[op];
      O[u0] = w0; O[w0] = u0; O[u1] = w1; O[w1] = u1;   // arêtes (x,b)+(x,a) et (y,a)+(y,b) fusionnées
      for (let i = 0; i < E.nb; i++) V[ringB[i]] = a;
      P[3 * a] = x; P[3 * a + 1] = y; P[3 * a + 2] = z;
      const t0 = (c / 3) | 0, t1 = (o / 3) | 0; deadF[t0] = 1; deadF[t1] = 1; E.nfAlive -= 2;
      VC[a] = NX(w0); VC[xv] = PV(w0); VC[yv] = NX(u1); VC[b] = -1;
      return { a, b, t0, t1 };
    };
    /** bascule de l'arête opposée au coin c : (x,a,b)+(y,b,a) → (x,a,y)+(y,b,x) si x et y ne sont pas déjà voisins */
    E.flipOK = c => {
      const o = O[c]; if (o < 0) return false; const xv = V[c], yv = V[o]; if (xv === yv || bnd[V[NX(c)]] || bnd[V[PV(c)]]) return false;
      const n = E.ring(VC[xv], ringA); if (n < 0) return false;
      for (let i = 0; i < n; i++) if (V[NX(ringA[i])] === yv) return false;
      return true;
    };
    E.flip = c => {
      const o = O[c], cn = NX(c), cp = PV(c), on = NX(o), op = PV(o), a = V[cn], b = V[on], xv = V[c], yv = V[o];
      const u1 = O[on], u0 = O[cn];
      V[cp] = yv; V[op] = xv;
      O[c] = u1; O[u1] = c; O[o] = u0; O[u0] = o; O[cn] = on; O[on] = cn;
      VC[a] = cn; VC[b] = on; VC[xv] = c; VC[yv] = o;
    };
    E.result = () => { const r = compact(P, V, Uint8Array.from(deadF, d => 1 - d)); return { pos: r.pos, faces: r.faces }; };
    return E;
  }

  /** nettoyage : faces à indices répétés, faces en double (paires opposées retirées toutes deux), arêtes quasi nulles
   *  effondrées (condition de lien), triangles d'aire nulle « en chapeau » corrigés par bascule de la plus longue arête,
   *  sommets non référencés retirés. opts.eps (longueur, défaut 1e−5 mm), opts.epsArea (aire relative, défaut 1e−7) */
  function cleanup(mesh, opts) {
    opts = obj(opts); const eps = opts.eps != null ? opts.eps : 1e-5, epsA = opts.epsArea != null ? opts.epsArea : 1e-7;
    const pos = posOf(mesh), F = mesh.faces, nv = pos.length / 3, nf = F.length / 3, keep = new Uint8Array(nf).fill(1);
    const st = { repeated: 0, duplicate: 0, collapsed: 0, flipped: 0, degenerateLeft: 0 };
    // table de hachage des triplets triés
    let H = 1; while (H < nf * 2) H <<= 1; const tab = new Int32Array(H).fill(-1), mask = H - 1;
    for (let f = 0; f < nf; f++) {
      const a = F[3 * f], b = F[3 * f + 1], c = F[3 * f + 2];
      if (a === b || b === c || a === c) { keep[f] = 0; st.repeated++; continue; }
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mi = a + b + c - lo - hi;
      let h = (Math.imul(lo, 73856093) ^ Math.imul(mi, 19349663) ^ Math.imul(hi, 83492791)) & mask;
      for (;;) {
        const g = tab[h]; if (g < 0) { tab[h] = f; break; }
        const A = F[3 * g], B = F[3 * g + 1], C = F[3 * g + 2];
        if (Math.min(A, B, C) === lo && Math.max(A, B, C) === hi && A + B + C - lo - hi === mi) {
          const par = (p, q, r) => { const m = Math.min(p, q, r); return m === p ? q < r : m === q ? r < p : p < q; };   // orientation du triplet
          if (par(a, b, c) === par(A, B, C)) { keep[f] = 0; st.duplicate++; } else if (keep[g]) { keep[f] = 0; keep[g] = 0; st.duplicate += 2; } else keep[f] = 0;
          break;
        }
        h = (h + 1) & mask;
      }
    }
    let cur = compact(pos, F, keep); st.unreferenced = nv - cur.pos.length / 3;
    // effondrements / bascules des triangles dégénérés
    const E = editable(cur.pos, cur.faces), P = E.P, V = E.V;
    for (let pass = 0; pass < 8; pass++) {
      let changed = 0;
      for (let t = 0; t < E.deadF.length; t++) {
        if (E.deadF[t]) continue;
        const c0 = 3 * t, l = [0, 1, 2].map(k => { const p = V[c0 + (k + 1) % 3] * 3, q = V[c0 + (k + 2) % 3] * 3; return len3(P[p] - P[q], P[p + 1] - P[q + 1], P[p + 2] - P[q + 2]); });   // l[k] : arête opposée au coin k
        const kmin = l[0] <= l[1] && l[0] <= l[2] ? 0 : l[1] <= l[2] ? 1 : 2, kmax = l[0] >= l[1] && l[0] >= l[2] ? 0 : l[1] >= l[2] ? 1 : 2;
        if (l[kmin] < eps) {
          const c = c0 + kmin; if (!E.linkOK(c)) continue;
          const a = V[NX(c)] * 3, b = V[PV(c)] * 3; E.collapse(c, (P[a] + P[b]) / 2, (P[a + 1] + P[b + 1]) / 2, (P[a + 2] + P[b + 2]) / 2); changed++; st.collapsed++;
          continue;
        }
        const p0 = V[c0] * 3, p1 = V[c0 + 1] * 3, p2 = V[c0 + 2] * 3;
        const ux = P[p1] - P[p0], uy = P[p1 + 1] - P[p0 + 1], uz = P[p1 + 2] - P[p0 + 2], wx = P[p2] - P[p0], wy = P[p2 + 1] - P[p0 + 1], wz = P[p2 + 2] - P[p0 + 2];
        const ar = len3(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
        if (ar < epsA * l[kmax] * l[kmax]) { const c = c0 + kmax; if (E.flipOK(c)) { E.flip(c); changed++; st.flipped++; } }
      }
      if (!changed) break;
    }
    for (let t = 0; t < E.deadF.length; t++) {
      if (E.deadF[t]) continue; const c0 = 3 * t, p0 = V[c0] * 3, p1 = V[c0 + 1] * 3, p2 = V[c0 + 2] * 3;
      const ux = P[p1] - P[p0], uy = P[p1 + 1] - P[p0 + 1], uz = P[p1 + 2] - P[p0 + 2], wx = P[p2] - P[p0], wy = P[p2 + 1] - P[p0 + 1], wz = P[p2 + 2] - P[p0 + 2];
      if (len3(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) < 1e-12) st.degenerateLeft++;
    }
    cur = E.result();
    return { pos: cur.pos, faces: cur.faces, stats: st };
  }

  // =====================================================================  normales, aires, voisinages, lissage
  function faceNormalsRaw(pos, faces) {
    const nf = faces.length / 3, N = new Float64Array(nf * 3);
    for (let f = 0; f < nf; f++) {
      const a = faces[3 * f] * 3, b = faces[3 * f + 1] * 3, c = faces[3 * f + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      N[3 * f] = uy * vz - uz * vy; N[3 * f + 1] = uz * vx - ux * vz; N[3 * f + 2] = ux * vy - uy * vx;
    }
    return N;
  }
  /** normales de sommets (moyenne pondérée par l'aire des faces), unitaires */
  function normals(pos, faces, out) {
    const nv = pos.length / 3, N = isArr(out) ? out : new Float32Array(nv * 3); N.fill(0);
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f] * 3, b = faces[f + 1] * 3, c = faces[f + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let v = 0; v < nv * 3; v += 3) { const l = len3(N[v], N[v + 1], N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
    return N;
  }
  /** aires des faces (mm²) */
  function areas(pos, faces) { const R = faceNormalsRaw(pos, faces), A = new Float32Array(faces.length / 3); for (let f = 0; f < A.length; f++) A[f] = 0.5 * len3(R[3 * f], R[3 * f + 1], R[3 * f + 2]); return A; }
  function area(pos, faces) { const R = faceNormalsRaw(pos, faces); let s = 0; for (let f = 0; f < R.length; f += 3) s += len3(R[f], R[f + 1], R[f + 2]); return s / 2; }
  /** volume signé (mm³, > 0 si normales sortantes) */
  function volume(pos, faces) {
    let s = 0;
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f] * 3, b = faces[f + 1] * 3, c = faces[f + 2] * 3;
      s += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    }
    return s / 6;
  }
  function meanEdge(pos, faces) { let s = 0; for (let f = 0; f < faces.length; f += 3) for (let k = 0; k < 3; k++) { const a = faces[f + k] * 3, b = faces[f + (k + 1) % 3] * 3; s += len3(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]); } return s / faces.length; }
  /** voisins uniques de chaque sommet (CSR) → { off: Int32Array(nv+1), nbr: Int32Array } */
  function adjacency(faces, nv) {
    const off = new Int32Array(nv + 1); for (let c = 0; c < faces.length; c++) off[faces[c] + 1] += 2;
    for (let v = 0; v < nv; v++) off[v + 1] += off[v];
    const tmp = new Int32Array(off[nv]), fp = off.slice(0, nv);
    for (let f = 0; f < faces.length; f += 3) { const a = faces[f], b = faces[f + 1], c = faces[f + 2]; tmp[fp[a]++] = b; tmp[fp[a]++] = c; tmp[fp[b]++] = c; tmp[fp[b]++] = a; tmp[fp[c]++] = a; tmp[fp[c]++] = b; }
    const mark = new Int32Array(nv).fill(-1), o2 = new Int32Array(nv + 1), nbr = new Int32Array(off[nv]); let m = 0;
    for (let v = 0; v < nv; v++) { o2[v] = m; for (let t = off[v]; t < off[v + 1]; t++) { const u = tmp[t]; if (mark[u] !== v) { mark[u] = v; nbr[m++] = u; } } }
    o2[nv] = m; return { off: o2, nbr: nbr.slice(0, m) };
  }
  function umbrellaStep(X, Y, adj, lam) {
    const { off, nbr } = adj, nv = off.length - 1;
    for (let v = 0; v < nv; v++) {
      const s = off[v], e = off[v + 1], o = 3 * v; if (e === s) { Y[o] = X[o]; Y[o + 1] = X[o + 1]; Y[o + 2] = X[o + 2]; continue; }
      let mx = 0, my = 0, mz = 0; for (let t = s; t < e; t++) { const u = 3 * nbr[t]; mx += X[u]; my += X[u + 1]; mz += X[u + 2]; }
      const k = 1 / (e - s); Y[o] = X[o] + lam * (mx * k - X[o]); Y[o + 1] = X[o + 1] + lam * (my * k - X[o + 1]); Y[o + 2] = X[o + 2] + lam * (mz * k - X[o + 2]);
    }
  }
  /** lissage laplacien uniforme (λ ∈ ]0,1]) → Float32Array */
  function smoothLaplacian(pos, faces, iters, lambda, opts) {
    const adj = obj(opts).adj || adjacency(faces, pos.length / 3), lam = num(lambda, 0.5), n = num(iters, 1);
    let X = Float64Array.from(pos), Y = new Float64Array(X.length);
    for (let it = 0; it < n; it++) { umbrellaStep(X, Y, adj, lam); const t = X; X = Y; Y = t; }
    return Float32Array.from(X);
  }
  /** lissage de Taubin (λ|μ, filtre passe-bas sans rétrécissement) → Float32Array */
  function smoothTaubin(pos, faces, iters, lambda, mu, opts) {
    const adj = obj(opts).adj || adjacency(faces, pos.length / 3), lam = num(lambda, 0.5), m = num(mu, -0.53), n = num(iters, 1);
    let X = Float64Array.from(pos), Y = new Float64Array(X.length);
    for (let it = 0; it < n; it++) { umbrellaStep(X, Y, adj, lam); umbrellaStep(Y, X, adj, m); }
    return Float32Array.from(X);
  }

  // =====================================================================  décimation (Garland–Heckbert)
  /** effondrements d'arêtes par erreur quadrique (plans des faces pondérés par l'aire), position optimale (repli : extrémités
   *  ou milieu), condition de lien (variété et topologie conservées), pas de retournement de face ni de dégradation sous
   *  opts.minQuality (défaut 0.1). opts.maxNormalCos (défaut 0.2 : rotation max ~78°), opts.maxError (mm², défaut ∞).
   *  Arêtes et sommets de bord figés. → { pos, faces, stats } */
  function decimate(pos, faces, targetFaces, opts) {
    opts = obj(opts);
    const t0 = now(), E = editable(pos, faces), { P, V, O, deadF } = E, nv = E.nv, nc = E.nc;
    const cosMin = opts.maxNormalCos != null ? opts.maxNormalCos : 0.2, qMin = opts.minQuality != null ? opts.minQuality : 0.1, maxErr = opts.maxError != null ? opts.maxError : Infinity;
    const Q = new Float64Array(10 * nv);
    for (let c = 0; c < nc; c += 3) {
      const a = V[c] * 3, b = V[c + 1] * 3, d = V[c + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = len3(nx, ny, nz); if (!(l > 0)) continue;
      nx /= l; ny /= l; nz /= l; const dd = -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2]), w = l / 2;
      for (let k = 0; k < 3; k++) { const q = 10 * V[c + k]; Q[q] += w * nx * nx; Q[q + 1] += w * nx * ny; Q[q + 2] += w * nx * nz; Q[q + 3] += w * nx * dd; Q[q + 4] += w * ny * ny; Q[q + 5] += w * ny * nz; Q[q + 6] += w * ny * dd; Q[q + 7] += w * nz * nz; Q[q + 8] += w * nz * dd; Q[q + 9] += w * dd * dd; }
    }
    const X = new Float64Array(3), q = new Float64Array(10);
    const qerr = (x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
    function edgeCost(c) {
      const a = V[NX(c)], b = V[PV(c)], qa = 10 * a, qb = 10 * b;
      for (let k = 0; k < 10; k++) q[k] = Q[qa + k] + Q[qb + k];
      const ax = P[3 * a], ay = P[3 * a + 1], az = P[3 * a + 2], bx = P[3 * b], by = P[3 * b + 1], bz = P[3 * b + 2];
      const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2, L2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
      const c00 = q[4] * q[7] - q[5] * q[5], c01 = q[2] * q[5] - q[1] * q[7], c02 = q[1] * q[5] - q[2] * q[4];
      const det = q[0] * c00 + q[1] * c01 + q[2] * c02, tr = q[0] + q[4] + q[7];
      if (Math.abs(det) > 1e-9 * tr * tr * tr) {
        const r0 = -q[3], r1 = -q[6], r2 = -q[8];
        const c11 = q[0] * q[7] - q[2] * q[2], c12 = q[1] * q[2] - q[0] * q[5], c22 = q[0] * q[4] - q[1] * q[1];
        const x = (c00 * r0 + c01 * r1 + c02 * r2) / det, y = (c01 * r0 + c11 * r1 + c12 * r2) / det, z = (c02 * r0 + c12 * r1 + c22 * r2) / det;
        if ((x - mx) ** 2 + (y - my) ** 2 + (z - mz) ** 2 <= L2) { X[0] = x; X[1] = y; X[2] = z; return Math.max(0, qerr(x, y, z)); }
      }
      const ea = qerr(ax, ay, az), eb = qerr(bx, by, bz), em = qerr(mx, my, mz);
      if (em <= ea && em <= eb) { X[0] = mx; X[1] = my; X[2] = mz; return Math.max(0, em); }
      if (ea <= eb) { X[0] = ax; X[1] = ay; X[2] = az; return Math.max(0, ea); }
      X[0] = bx; X[1] = by; X[2] = bz; return Math.max(0, eb);
    }
    // tas binaire indexé par coin (une entrée par arête : coin canonique min(c, O[c]))
    const cost = new Float64Array(nc), hpos = new Int32Array(nc).fill(-1), heap = new Int32Array(nc); let hn = 0;
    const up = i => { const c = heap[i], w = cost[c]; while (i > 0) { const pi = (i - 1) >> 1, pc = heap[pi]; if (cost[pc] <= w) break; heap[i] = pc; hpos[pc] = i; i = pi; } heap[i] = c; hpos[c] = i; };
    const down = i => { const c = heap[i], w = cost[c]; for (;;) { let l = 2 * i + 1; if (l >= hn) break; const r = l + 1; if (r < hn && cost[heap[r]] < cost[heap[l]]) l = r; if (cost[heap[l]] >= w) break; heap[i] = heap[l]; hpos[heap[i]] = i; i = l; } heap[i] = c; hpos[c] = i; };
    const remove = c => { const i = hpos[c]; if (i < 0) return; hpos[c] = -1; hn--; if (i === hn) return; const last = heap[hn]; heap[i] = last; hpos[last] = i; up(i); down(hpos[last]); };
    const seen = new Int32Array(nc); let pass = 0;   // une seule réévaluation par arête et par effondrement
    const refresh = c => {
      const o = O[c]; if (o < 0) { remove(c); return; }
      const k = o < c ? o : c, other = k === c ? o : c; if (seen[k] === pass) return; seen[k] = pass; remove(other);
      if (E.bnd[V[NX(k)]] || E.bnd[V[PV(k)]]) { remove(k); return; }
      cost[k] = edgeCost(k); if (hpos[k] >= 0) { up(hpos[k]); down(hpos[k]); } else { heap[hn] = k; hpos[k] = hn; hn++; up(hn - 1); }
    };
    for (let c = 0; c < nc; c++) { const o = O[c]; if (o < 0 || o < c || E.bnd[V[NX(c)]] || E.bnd[V[PV(c)]]) continue; cost[c] = edgeCost(c); heap[hn] = c; hpos[c] = hn++; }
    for (let i = (hn >> 1) - 1; i >= 0; i--) down(i);
    const target = Math.max(4, targetFaces | 0); let collapses = 0, rejected = 0;
    while (E.nfAlive > target && hn > 0) {
      const c = heap[0]; if (cost[c] > maxErr) break; remove(c);
      if (deadF[(c / 3) | 0]) continue;
      if (!E.linkOK(c)) { rejected++; continue; }
      edgeCost(c);
      if (!E.moveOK(c, X[0], X[1], X[2], cosMin, qMin)) { rejected++; continue; }
      const r = E.collapse(c, X[0], X[1], X[2]); pass++;
      for (let k = 0; k < 3; k++) { remove(3 * r.t0 + k); remove(3 * r.t1 + k); }
      for (let k = 0; k < 10; k++) Q[10 * r.a + k] += Q[10 * r.b + k];
      for (let s = 0; s < 2; s++) {
        const R = s ? E.ringB : E.ringA, n = s ? E.nb : E.na;
        for (let i = 0; i < n; i++) { const cq = R[i], t = (cq / 3) | 0; if (t === r.t0 || t === r.t1) continue; refresh(NX(cq)); refresh(PV(cq)); }
      }
      collapses++;
    }
    const res = E.result();
    res.stats = { faces: res.faces.length / 3, vertices: res.pos.length / 3, collapses, rejected, ms: Math.round(now() - t0) };
    return res;
  }

  // =====================================================================  gonflement, profondeur sulcale
  // noyaux monomorphes (Float64Array / Int32Array) pour les boucles itératives
  function normals64(X, F, N) {
    N.fill(0);
    for (let f = 0; f < F.length; f += 3) {
      const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2];
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz; N[b] += nx; N[b + 1] += ny; N[b + 2] += nz; N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let v = 0; v < N.length; v += 3) { const l = Math.sqrt(N[v] * N[v] + N[v + 1] * N[v + 1] + N[v + 2] * N[v + 2]) || 1; N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
  }
  function inflStep(X, Y, N, off, nbr, lam, tang) {   // laplacien : composante normale entière, tangentielle × tang
    const nv = off.length - 1;
    for (let v = 0; v < nv; v++) {
      const s = off[v], e = off[v + 1], o = 3 * v; if (e === s) { Y[o] = X[o]; Y[o + 1] = X[o + 1]; Y[o + 2] = X[o + 2]; continue; }
      let mx = 0, my = 0, mz = 0; for (let t = s; t < e; t++) { const u = 3 * nbr[t]; mx += X[u]; my += X[u + 1]; mz += X[u + 2]; }
      const k = 1 / (e - s), Lx = mx * k - X[o], Ly = my * k - X[o + 1], Lz = mz * k - X[o + 2];
      const d = Lx * N[o] + Ly * N[o + 1] + Lz * N[o + 2], nx = d * N[o], ny = d * N[o + 1], nz = d * N[o + 2];
      Y[o] = X[o] + lam * (nx + tang * (Lx - nx)); Y[o + 1] = X[o + 1] + lam * (ny + tang * (Ly - ny)); Y[o + 2] = X[o + 2] + lam * (nz + tang * (Lz - nz));
    }
  }
  function centroidRms(X) {
    const n = X.length / 3; let cx = 0, cy = 0, cz = 0; for (let i = 0; i < X.length; i += 3) { cx += X[i]; cy += X[i + 1]; cz += X[i + 2]; }
    cx /= n; cy /= n; cz /= n; let s = 0; for (let i = 0; i < X.length; i += 3) s += (X[i] - cx) ** 2 + (X[i + 1] - cy) ** 2 + (X[i + 2] - cz) ** 2;
    return { c: [cx, cy, cz], r: Math.sqrt(s / n) };
  }
  /** surface gonflée (même topologie) : lissage laplacien uniforme itératif (λ = opts.lambda, défaut 0.9 ; les sillons
   *  s'effacent, la forme lobaire reste), puis recentrage et mise à l'échelle. opts.sigma (mm, défaut 18) : échelle de
   *  lissage (itérations ≈ 2σ²/(λ·ℓ²), ℓ = arête moyenne) ou opts.iterations ; opts.tangential (défaut 1 = laplacien complet ;
   *  < 1 : composante tangentielle atténuée, moins de glissement des sommets mais plus de replis) ;
   *  opts.scale : 'rms' (défaut, rayon quadratique moyen du pial × opts.scaleFactor (1)), 'area' (aire du pial conservée,
   *  comme FreeSurfer : surface ~1.3× plus grande), nombre (facteur sur 'rms') ; opts.center : 'keep' (défaut, centroïde du
   *  pial) | 'origin' | [x,y,z] ; opts.untangle (défaut vrai : dépliage local des faces repliées, cf. untangle) ;
   *  opts.stats : objet complété par { iterations, foldedBefore, foldedAfter }. → Float32Array */
  function inflate(pos, faces, opts) {
    opts = obj(opts);
    const nv = pos.length / 3, adj = opts.adj || adjacency(faces, nv), lam = opts.lambda || 0.9, tang = opts.tangential != null ? opts.tangential : 1;
    const l = meanEdge(pos, faces), sigma = opts.sigma != null ? opts.sigma : 18;
    const iters = opts.iterations || Math.max(5, Math.min(20000, Math.round(2 * sigma * sigma / (lam * l * l)))); if (opts.stats) opts.stats.iterations = iters;
    const { off, nbr } = adj, N = new Float64Array(3 * nv), F = faces instanceof Int32Array ? faces : Int32Array.from(faces);
    let X = Float64Array.from(pos), Y = new Float64Array(X.length);
    const nEvery = opts.normalEvery || 2;
    for (let it = 0; it < iters; it++) {
      if (tang >= 1) umbrellaStep(X, Y, adj, lam);   // laplacien complet (défaut) : pas de normales
      else { if (it % nEvery === 0) normals64(X, F, N); inflStep(X, Y, N, off, nbr, lam, tang); }
      const t = X; X = Y; Y = t;
    }
    if (opts.untangle !== false) { const u = untangle(X, faces, { adj }); X = Float64Array.from(u.pos); if (opts.stats) Object.assign(opts.stats, { foldedBefore: u.initial, foldedAfter: u.folded }); }
    const P0 = centroidRms(pos), P1 = centroidRms(X), mode = opts.scale || 'rms';
    let s = P0.r / (P1.r || 1); if (mode === 'area') s = Math.sqrt(area(pos, faces) / (area(X, faces) || 1)); else if (typeof mode === 'number') s *= mode; else s *= opts.scaleFactor || 1;
    const C = Array.isArray(opts.center) ? opts.center : opts.center === 'origin' ? [0, 0, 0] : P0.c;
    const out = new Float32Array(X.length);
    for (let i = 0; i < X.length; i += 3) for (let k = 0; k < 3; k++) out[i + k] = C[k] + (X[i + k] - P1.c[k]) * s;
    return out;
  }
  /** faces repliées : normale opposée à la somme des normales de ses sommets → Int32Array d'indices de faces */
  function foldedFaces(X, F) {
    const N = normals(X, F), out = [];
    for (let f = 0; f < F.length; f += 3) {
      const a = 3 * F[f], b = 3 * F[f + 1], d = 3 * F[f + 2];
      const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[d] - X[a], vy = X[d + 1] - X[a + 1], vz = X[d + 2] - X[a + 2];
      if ((uy * vz - uz * vy) * (N[a] + N[b] + N[d]) + (uz * vx - ux * vz) * (N[a + 1] + N[b + 1] + N[d + 1]) + (ux * vy - uy * vx) * (N[a + 2] + N[b + 2] + N[d + 2]) < 0) out.push(f / 3);
    }
    return Int32Array.from(out);
  }
  /** dépliage local : autour des faces repliées (+ opts.rings anneaux, croissant à chaque tour), relaxation laplacienne
   *  jusqu'à convergence (Gauss–Seidel, opts.iters = 200) à bord fixe — solution harmonique sans repli si le bord est
   *  quasi plan (surfaces lisses : gonflée). Déconseillé sur le pial (fentes fines : déplacements importants).
   *  → { pos: Float32Array, folded (restantes), initial } */
  function untangle(pos, faces, opts) {
    opts = obj(opts);
    const n = pos.length / 3, adj = opts.adj || adjacency(faces, n), X = Float64Array.from(pos), mark = new Uint8Array(n), F = faces;
    const rounds = opts.rounds || 12, iters = opts.iters || 200, r0 = opts.rings || 2; let fl = foldedFaces(X, F); const initial = fl.length;
    let best = fl.length, stall = 0;
    for (let r = 0; r < rounds && fl.length && stall < 2; r++) {   // arrêt après 2 tours sans progrès
      mark.fill(0); let front = [];
      for (const f of fl) for (let k = 0; k < 3; k++) { const v = F[3 * f + k]; if (!mark[v]) { mark[v] = 1; front.push(v); } }
      for (let g = 0; g < Math.min(r0 + r, 8); g++) { const nf = []; for (const v of front) for (let s = adj.off[v]; s < adj.off[v + 1]; s++) { const u = adj.nbr[s]; if (!mark[u]) { mark[u] = 1; nf.push(u); } } front = nf; }
      const L = []; for (let v = 0; v < n; v++) if (mark[v]) L.push(v);
      for (let it = 0; it < iters; it++) for (const v of L) {
        const s = adj.off[v], e = adj.off[v + 1]; let mx = 0, my = 0, mz = 0;
        for (let t = s; t < e; t++) { const u = 3 * adj.nbr[t]; mx += X[u]; my += X[u + 1]; mz += X[u + 2]; }
        const k = 1 / (e - s); X[3 * v] = mx * k; X[3 * v + 1] = my * k; X[3 * v + 2] = mz * k;
      }
      fl = foldedFaces(X, F); if (fl.length < best) { best = fl.length; stall = 0; } else stall++;
    }
    return { pos: Float32Array.from(X), folded: fl.length, initial };
  }
  function quantileAbs(d, q) { const a = Float32Array.from(d, Math.abs).sort(); return a[Math.min(a.length - 1, Math.floor(q * a.length))] || 1; }
  function median(d) { const a = Float32Array.from(d).sort(); return a.length ? a[a.length >> 1] : 0; }
  /** profondeur sulcale brute (mm) : déplacement signé du pial vers une surface lissée (gonflée fournie, ramenée par
   *  similitude au centroïde/rayon du pial, ou gonflement d'échelle opts.sigma, défaut 18 mm), le long de la normale de la surface
   *  lissée ; centrée sur la médiane. Convention FreeSurfer : > 0 = sillon (fond), < 0 = crête gyrale. */
  function sulcRaw(pos, faces, inflated, opts) {
    opts = obj(opts); if (!isArr(inflated)) inflated = null;
    const S = inflated || inflate(pos, faces, { sigma: opts.sigma, adj: opts.adj });
    const A = centroidRms(pos), B = centroidRms(S), s = A.r / (B.r || 1), T = new Float32Array(S.length);
    for (let i = 0; i < S.length; i += 3) for (let k = 0; k < 3; k++) T[i + k] = A.c[k] + (S[i + k] - B.c[k]) * s;
    const N = normals(T, faces), d = new Float32Array(pos.length / 3);
    for (let v = 0; v < d.length; v++) { const o = 3 * v; d[v] = (T[o] - pos[o]) * N[o] + (T[o + 1] - pos[o + 1]) * N[o + 1] + (T[o + 2] - pos[o + 2]) * N[o + 2]; }
    const m = median(d); for (let v = 0; v < d.length; v++) d[v] -= m;
    return d;
  }
  /** profondeur sulcale codée Int8 (±127) : le quantile opts.robust (0.99) des |valeurs| vaut opts.target (100), comme la
   *  distribution du gabarit fsaverage5 de l'atlas (p1/p99 ≈ −74/+94) */
  function sulc(pos, faces, inflated, opts) {
    opts = obj(opts); if (!isArr(inflated)) inflated = null;
    const d = sulcRaw(pos, faces, inflated, opts), q = quantileAbs(d, opts.robust || 0.99), k = (opts.target || 100) / q, out = new Int8Array(d.length);
    for (let v = 0; v < d.length; v++) out[v] = Math.max(-127, Math.min(127, Math.round(k * d[v])));
    return out;
  }

  // =====================================================================  étiquettes par sommet
  /** étiquette de chaque sommet : vote majoritaire des étiquettes non nulles échantillonnées (plus proche voxel) le long de
   *  −normale (vers l'intérieur) aux profondeurs opts.depths (mm, défaut [1, 0.5, 1.5, 2, 2.5, 0]) ; sommets sans étiquette
   *  comblés par propagation sur le maillage (opts.fill, défaut vrai). opts.Type (défaut Uint16Array). */
  function sampleLabels(pos, faces, nrm, labelVol, opts) {
    opts = obj(opts);
    const depths = opts.depths || [1, 0.5, 1.5, 2, 2.5, 0], nv = pos.length / 3, out = new (opts.Type || Uint16Array)(nv), N = isArr(nrm) ? nrm : normals(pos, faces);
    const W = SV.Mat4 ? SV.Mat4.inv(labelVol.affine) : null; if (!W) throw new Error('SV.Mat4 requis (nifti.js)');
    const [nx, ny, nz] = labelVol.dims, D = labelVol.data, vals = new Float64Array(depths.length), cnt = new Int32Array(depths.length);
    for (let v = 0; v < nv; v++) {
      let m = 0;
      for (const dep of depths) {
        const x = pos[3 * v] - dep * N[3 * v], y = pos[3 * v + 1] - dep * N[3 * v + 1], z = pos[3 * v + 2] - dep * N[3 * v + 2];
        const i = Math.round(W[0] * x + W[1] * y + W[2] * z + W[3]), j = Math.round(W[4] * x + W[5] * y + W[6] * z + W[7]), k = Math.round(W[8] * x + W[9] * y + W[10] * z + W[11]);
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
        const L = D[i + nx * (j + ny * k)]; if (!L) continue;
        let q = 0; while (q < m && vals[q] !== L) q++; if (q === m) { vals[m] = L; cnt[m++] = 0; } cnt[q]++;
      }
      let b = -1; for (let q = 0; q < m; q++) if (b < 0 || cnt[q] > cnt[b]) b = q;
      if (b >= 0) out[v] = vals[b];
    }
    if (opts.fill !== false) fillVertexLabels(faces, out);
    return out;
  }
  /** propage (en place) les étiquettes non nulles vers les sommets à 0 (parcours en largeur multi-sources) */
  function fillVertexLabels(faces, labels, adjArg) {
    const nv = labels.length, adj = adjArg && adjArg.off ? adjArg : adjacency(faces, nv), q = new Int32Array(nv); let h = 0, t = 0;
    for (let v = 0; v < nv; v++) if (labels[v]) q[t++] = v;
    while (h < t) { const v = q[h++]; for (let s = adj.off[v]; s < adj.off[v + 1]; s++) { const u = adj.nbr[s]; if (!labels[u]) { labels[u] = labels[v]; q[t++] = u; } } }
    return labels;
  }
  /** filtre majoritaire (en place) : un sommet prend l'étiquette majoritaire de son voisinage (lui compris) si elle y est
   *  strictement majoritaire ; régularise les frontières */
  function modeFilterLabels(faces, labels, iters, adjArg) {
    const nv = labels.length, adj = adjArg && adjArg.off ? adjArg : adjacency(faces, nv), vals = [], cnt = [];
    for (let it = 0; it < num(iters, 1); it++) {
      const src = labels.slice();
      for (let v = 0; v < nv; v++) {
        vals.length = 0; cnt.length = 0; let tot = 0;
        const add = L => { tot++; const i = vals.indexOf(L); if (i < 0) { vals.push(L); cnt.push(1); } else cnt[i]++; };
        add(src[v]); for (let s = adj.off[v]; s < adj.off[v + 1]; s++) add(src[adj.nbr[s]]);
        let b = 0; for (let i = 1; i < vals.length; i++) if (cnt[i] > cnt[b]) b = i;
        if (2 * cnt[b] > tot) labels[v] = vals[b];
      }
    }
    return labels;
  }

  // =====================================================================  entrées / sorties
  /** Wavefront OBJ (texte) */
  function toObj(mesh, opts) {
    const P = posOf(mesh), F = mesh.faces, L = [obj(opts).comment ? '# ' + opts.comment : '# EpiScope'];
    for (let i = 0; i < P.length; i += 3) L.push('v ' + P[i].toFixed(4) + ' ' + P[i + 1].toFixed(4) + ' ' + P[i + 2].toFixed(4));
    for (let i = 0; i < F.length; i += 3) L.push('f ' + (F[i] + 1) + ' ' + (F[i + 1] + 1) + ' ' + (F[i + 2] + 1));
    return L.join('\n') + '\n';
  }
  function fromObj(text) {
    const P = [], F = [];
    for (const line of text.split('\n')) {
      if (line[0] === 'v' && line[1] === ' ') { const s = line.trim().split(/\s+/); P.push(+s[1], +s[2], +s[3]); }
      else if (line[0] === 'f' && line[1] === ' ') { const s = line.trim().split(/\s+/).slice(1).map(t => parseInt(t, 10) - 1); for (let k = 1; k + 1 < s.length; k++) F.push(s[0], s[k], s[k + 1]); }
    }
    return { pos: Float32Array.from(P), faces: Uint32Array.from(F) };
  }

  const u8of = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  function b64enc(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function b64dec(s) { const bin = atob(s.replace(/\s+/g, '')), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
  async function streamAll(stream) { const r = stream.getReader(), parts = []; let n = 0; for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; } const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; }
  const zlib = u8 => streamAll(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate')));     // RFC 1950 (zlib), attendu par GIfTI
  const unzlib = u8 => streamAll(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate')));
  const GII_T = { NIFTI_TYPE_UINT8: Uint8Array, NIFTI_TYPE_INT8: Int8Array, NIFTI_TYPE_INT16: Int16Array, NIFTI_TYPE_UINT16: Uint16Array, NIFTI_TYPE_INT32: Int32Array, NIFTI_TYPE_UINT32: Uint32Array, NIFTI_TYPE_FLOAT32: Float32Array, NIFTI_TYPE_FLOAT64: Float64Array };
  const cdata = s => '<![CDATA[' + String(s).replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
  const mdXml = md => { const k = Object.keys(md || {}); return k.length ? '<MetaData>' + k.map(n => '<MD><Name>' + cdata(n) + '</Name><Value>' + cdata(md[n]) + '</Value></MD>').join('') + '</MetaData>' : '<MetaData/>'; };
  /** GIfTI (XML) : opts.kind 'surface' (défaut : POINTSET + TRIANGLE) | 'label' (opts.labels, opts.labelTable
   *  [{key, name, color:[r,g,b(,a)] 0–1 ou 0–255}]) | 'shape' (opts.values, p. ex. sulc) ; opts.encoding 'base64' (défaut) |
   *  'gzip' (GZipBase64Binary, zlib) | 'ascii' ; opts.structure ('CortexLeft', 'CortexRight', …), opts.geometric
   *  ('Anatomical' | 'Inflated'), opts.secondary ('Pial', …), opts.meta. → Promise<string> */
  async function toGifti(mesh, opts) {
    opts = obj(opts); const kind = opts.kind || 'surface', enc = opts.encoding || 'base64', arrays = [];
    const P = mesh && posOf(mesh), n = P ? P.length / 3 : (opts.labels || opts.values).length;
    if (kind === 'surface') {
      const md = {}; if (opts.structure) md.AnatomicalStructurePrimary = opts.structure; if (opts.secondary) md.AnatomicalStructureSecondary = opts.secondary; if (opts.geometric) md.GeometricType = opts.geometric;
      arrays.push({ intent: 'NIFTI_INTENT_POINTSET', type: 'NIFTI_TYPE_FLOAT32', data: P instanceof Float32Array ? P : Float32Array.from(P), dims: [n, 3], md, xform: true });
      arrays.push({ intent: 'NIFTI_INTENT_TRIANGLE', type: 'NIFTI_TYPE_INT32', data: Int32Array.from(mesh.faces), dims: [mesh.faces.length / 3, 3], md: {} });
    } else if (kind === 'label') arrays.push({ intent: 'NIFTI_INTENT_LABEL', type: 'NIFTI_TYPE_INT32', data: Int32Array.from(opts.labels || mesh.labels), dims: [n], md: {} });
    else arrays.push({ intent: 'NIFTI_INTENT_SHAPE', type: 'NIFTI_TYPE_FLOAT32', data: Float32Array.from(opts.values || mesh.sulc), dims: [n], md: opts.name ? { Name: opts.name } : {} });
    const top = Object.assign({}, opts.structure && kind !== 'surface' ? { AnatomicalStructurePrimary: opts.structure } : {}, opts.meta || {}, { generator: 'EpiScope' });
    let lt = '<LabelTable/>';
    if (kind === 'label') {
      let tab = opts.labelTable; if (tab instanceof Map) tab = [...tab].map(([key, v]) => Object.assign({ key }, v));
      if (!tab) { const ks = [...new Set(arrays[0].data)].sort((a, b) => a - b); tab = ks.map(k => ({ key: k, name: 'label_' + k })); }
      const c01 = c => { if (!c) return ['0.5000', '0.5000', '0.5000', '1.0000']; const s = c.some(x => x > 1) ? 1 / 255 : 1; return [c[0] * s, c[1] * s, c[2] * s, c[3] != null ? c[3] * s : 1].map(x => x.toFixed(4)); };
      lt = '<LabelTable>' + tab.map(e => { const [r, g, b, a] = c01(e.color); return '<Label Key="' + (e.key | 0) + '" Red="' + r + '" Green="' + g + '" Blue="' + b + '" Alpha="' + a + '">' + cdata(e.name || '') + '</Label>'; }).join('') + '</LabelTable>';
    }
    const ENC = { base64: 'Base64Binary', gzip: 'GZipBase64Binary', ascii: 'ASCII' }[enc];
    const parts = [];
    for (const A of arrays) {
      let payload;
      if (enc === 'ascii') { const w = A.dims[1] || 1, L = []; for (let i = 0; i < A.data.length; i += w) L.push(Array.from(A.data.subarray(i, i + w)).join(' ')); payload = L.join('\n'); }
      else payload = b64enc(enc === 'gzip' ? await zlib(u8of(A.data)) : u8of(A.data));
      const xf = A.xform ? '<CoordinateSystemTransformMatrix><DataSpace>' + cdata('NIFTI_XFORM_SCANNER_ANAT') + '</DataSpace><TransformedSpace>' + cdata('NIFTI_XFORM_SCANNER_ANAT') + '</TransformedSpace><MatrixData>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</MatrixData></CoordinateSystemTransformMatrix>' : '';
      parts.push('<DataArray Intent="' + A.intent + '" DataType="' + A.type + '" ArrayIndexingOrder="RowMajorOrder" Dimensionality="' + A.dims.length + '"' + A.dims.map((d, k) => ' Dim' + k + '="' + d + '"').join('') +
        ' Encoding="' + ENC + '" Endian="LittleEndian" ExternalFileName="" ExternalFileOffset="">\n' + mdXml(A.md) + '\n' + xf + '<Data>' + payload + '</Data>\n</DataArray>');
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE GIFTI SYSTEM "http://www.nitrc.org/frs/download.php/115/gifti.dtd">\n<GIFTI Version="1.0" NumberOfDataArrays="' + arrays.length + '">\n' +
      mdXml(top) + '\n' + lt + '\n' + parts.join('\n') + '\n</GIFTI>\n';
  }
  const attrsOf = s => { const o = {}; s.replace(/([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k] = v; return m; }); return o; };
  const textOf = s => { const m = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(s); return (m ? m[1] : s).trim(); };
  /** lecture GIfTI (ASCII, Base64Binary, GZipBase64Binary ; petit ou gros boutiste ; ordre ligne ou colonne)
   *  → Promise<{ pos?, faces?, labels?, values?, labelTable, meta, arrays:[{intent, data, dims, meta}] }> */
  async function fromGifti(text) {
    if (typeof text !== 'string') text = new TextDecoder().decode(text);
    const out = { arrays: [], labelTable: [], meta: {} };
    const metaOf = s => { const o = {}; s.replace(/<MD>\s*<Name>([\s\S]*?)<\/Name>\s*<Value>([\s\S]*?)<\/Value>\s*<\/MD>/g, (m, n, v) => { o[textOf(n)] = textOf(v); return m; }); return o; };
    const head = text.split(/<DataArray[\s>]/)[0]; out.meta = metaOf(head);
    const lt = /<LabelTable>([\s\S]*?)<\/LabelTable>/.exec(head);
    if (lt) lt[1].replace(/<Label([^>]*)>([\s\S]*?)<\/Label>/g, (m, a, n) => { const A = attrsOf(a); out.labelTable.push({ key: +(A.Key != null ? A.Key : A.Index), name: textOf(n), color: [+A.Red, +A.Green, +A.Blue, +A.Alpha] }); return m; });
    const re = /<DataArray([^>]*)>([\s\S]*?)<\/DataArray>/g; let m;
    while ((m = re.exec(text))) {
      const A = attrsOf(m[1]), body = m[2], T = GII_T[A.DataType]; if (!T) throw new Error('GIfTI : type non pris en charge ' + A.DataType);
      const nd = +A.Dimensionality || 1, dims = []; for (let k = 0; k < nd; k++) dims.push(+A['Dim' + k]);
      const n = dims.reduce((a, b) => a * b, 1), dm = /<Data>([\s\S]*?)<\/Data>/.exec(body), raw = dm ? dm[1] : '';
      let data;
      if (A.Encoding === 'ASCII') data = T.from(raw.trim().split(/\s+/).filter(Boolean).map(Number));
      else if (A.Encoding === 'Base64Binary' || A.Encoding === 'GZipBase64Binary') {
        let u8 = b64dec(raw); if (A.Encoding === 'GZipBase64Binary') u8 = await unzlib(u8);
        const bpe = T.BYTES_PER_ELEMENT, al = new Uint8Array(n * bpe); al.set(u8.subarray(0, n * bpe));
        if (A.Endian === 'BigEndian' && bpe > 1) for (let i = 0; i < al.length; i += bpe) al.subarray(i, i + bpe).reverse();
        data = new T(al.buffer);
      } else throw new Error('GIfTI : encodage non pris en charge ' + A.Encoding);
      if (nd === 2 && A.ArrayIndexingOrder === 'ColumnMajorOrder') { const [r, c] = dims, t = new T(n); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) t[i * c + j] = data[j * r + i]; data = t; }
      const arr = { intent: A.Intent, data, dims, meta: metaOf(body) }; out.arrays.push(arr);
      if (A.Intent === 'NIFTI_INTENT_POINTSET' && !out.pos) out.pos = data instanceof Float32Array ? data : Float32Array.from(data);
      else if (A.Intent === 'NIFTI_INTENT_TRIANGLE' && !out.faces) out.faces = Uint32Array.from(data);
      else if (A.Intent === 'NIFTI_INTENT_LABEL' && !out.labels) out.labels = data;
      else if (!out.values && A.Intent !== 'NIFTI_INTENT_POINTSET' && A.Intent !== 'NIFTI_INTENT_TRIANGLE') out.values = data;
    }
    return out;
  }

  /* format binaire compact : 'SVMS' | u32 version | u32 longueur de l'en-tête | en-tête JSON (utf-8) | tableaux alignés
   * sur 8 octets. En-tête : { meta: {champs non typés}, arrays: [[nom, type, décalage, longueur]] } */
  const PK_T = { Float32Array: 'f32', Float64Array: 'f64', Int32Array: 'i32', Uint32Array: 'u32', Int16Array: 'i16', Uint16Array: 'u16', Int8Array: 'i8', Uint8Array: 'u8' };
  const PK_C = { f32: Float32Array, f64: Float64Array, i32: Int32Array, u32: Uint32Array, i16: Int16Array, u16: Uint16Array, i8: Int8Array, u8: Uint8Array };
  /** objet (tableaux typés + champs JSON) → Uint8Array */
  function pack(obj) {
    const arrays = [], meta = {}; let off = 0;
    for (const k in obj) {
      const v = obj[k];
      if (ArrayBuffer.isView(v) && PK_T[v.constructor.name]) { arrays.push([k, PK_T[v.constructor.name], off, v.length, v]); off += Math.ceil(v.byteLength / 8) * 8; }
      else if (v !== undefined && typeof v !== 'function') meta[k] = v;
    }
    const hj = new TextEncoder().encode(JSON.stringify({ meta, arrays: arrays.map(a => a.slice(0, 4)) })), hs = Math.ceil((12 + hj.length) / 8) * 8;
    const out = new Uint8Array(hs + off), dv = new DataView(out.buffer);
    out.set([0x53, 0x56, 0x4d, 0x53]); dv.setUint32(4, 1, true); dv.setUint32(8, hj.length, true); out.set(hj, 12);
    for (const [, , o, , v] of arrays) out.set(u8of(v), hs + o);
    return out;
  }
  function unpack(u8) {
    if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8.buffer || u8, u8.byteOffset || 0, u8.byteLength);
    if (u8[0] !== 0x53 || u8[1] !== 0x56 || u8[2] !== 0x4d || u8[3] !== 0x53) throw new Error('format de maillage inconnu');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), hl = dv.getUint32(8, true), h = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hl))), hs = Math.ceil((12 + hl) / 8) * 8;
    const out = Object.assign({}, h.meta);
    for (const [k, t, o, n] of h.arrays) { const T = PK_C[t], a = new T(n); new Uint8Array(a.buffer).set(u8.subarray(hs + o, hs + o + n * T.BYTES_PER_ELEMENT)); out[k] = a; }   // copie alignée (Buffer Node : vue sur un tampon partagé)
    return out;
  }

  // =====================================================================  chaînes complètes
  function progArgs(opts, progress) { if (typeof opts === 'function') return [{}, opts]; return [opts || {}, typeof progress === 'function' ? progress : () => {}]; }
  function timer(T, progress) { let t0 = now(); return name => { const t = now(); T[name] = Math.round(t - t0); t0 = t; progress({ stage: name }); }; }
  function VOps() { if (!SV.VolOps) throw new Error('SV.VolOps requis (imaging/volops.js)'); return SV.VolOps; }

  /** surface d'un hémisphère depuis un volume d'étiquettes : masque (insideLabels : Set d'étiquettes « dedans » : cortex,
   *  substance blanche, noyaux gris, ventricules…) éventuellement restreint à un côté (opts.side 'L'|'R' et opts.midX, x monde
   *  du plan médian, défaut 0), plus grande composante 26-connexe, fermeture (opts.closeRadius, défaut 0), scellement des
   *  cavités presque closes (opts.sealRadius, défaut 0), comblement des cavités, correction topologique (opts.topology, défaut
   *  vrai : VolOps.topoCorrect, surface de genre 0 garantie ; opts.topoOpts), flou gaussien (opts.sigma, défaut 0.8 voxel) contraint au masque
   *  corrigé, marching cubes à 0.5, plus grande composante, Taubin (opts.taubin, défaut 10 itérations), décimation
   *  (opts.targetVertices, défaut 60000), gonflement (opts.inflate) et sulc.
   *  → { n, pial, inflated, faces, sulc, timings (ms), info } */
  function pipelineHemisphere(labelVol, insideLabels, opts, progress) {
    [opts, progress] = progArgs(opts, progress);
    const VO = VOps(), T = {}, tick = timer(T, progress), t00 = now(), info = {};
    const { dims, affine } = labelVol, [nx, ny, nz] = dims;
    let mask = VO.maskOf(labelVol.data, insideLabels);
    if (opts.side) {
      const left = opts.side === 'L' || opts.side === 'lh', x0 = opts.midX || 0, A = affine;
      for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) { const b = A[1] * j + A[2] * k + A[3]; for (let i = 0; i < nx; i++, o++) if (mask[o]) { const x = A[0] * i + b; if (left ? x >= x0 : x < x0) mask[o] = 0; } }
    }
    tick('mask');
    const sigma = opts.sigma != null ? opts.sigma : 0.8, pad = Math.ceil(Math.max(opts.closeRadius || 0, opts.sealRadius || 0)) + Math.ceil(3 * sigma) + 3;
    const bb = VO.bbox(mask, dims, pad, { clamp: false }); if (!bb) throw new Error('masque d\'hémisphère vide');
    const C = VO.crop(mask, dims, bb, Uint8Array), cd = C.dims, Ac = VO.cropAffine(affine, bb); mask = null;
    let m = VO.keepLargest(C.data, cd, 26);
    if (opts.closeRadius > 0) m = VO.close(m, cd, opts.closeRadius);
    if (opts.sealRadius > 0) { const Cl = VO.close(m, cd, opts.sealRadius), H = VO.fillHoles(Cl, cd); let s = 0; for (let v = 0; v < m.length; v++) if (H[v] && !Cl[v] && !m[v]) { m[v] = 1; s++; } info.sealed = s; }
    const before = VO.count(m); m = VO.fillHoles(m, cd); info.filled = VO.count(m) - before; info.voxels = before + info.filled;
    tick('morphology');
    const topo = opts.topology !== false, iso = opts.iso != null ? opts.iso : 0.5;
    if (topo) { const g = VO.topoCorrect(m, cd, opts.topoOpts); m = g.mask; info.topoAdded = g.added; info.topoRemoved = g.removed; tick('topology'); }
    let field = sigma > 0 ? VO.gaussian(m, cd, sigma, { border: 'zero' }) : Float32Array.from(m);
    if (topo) { const dl = opts.clampDelta || 0.2; for (let v = 0; v < field.length; v++) field[v] = m[v] ? Math.max(field[v], iso + dl) : Math.min(field[v], iso - dl); }   // classement des nœuds = masque corrigé
    tick('gaussian');
    let mesh = marchingCubes(field, cd, iso, Ac, null, { ambiguity: topo ? 'separate' : 'decider' });
    info.mcVertices = mesh.pos.length / 3; info.mcFaces = mesh.faces.length / 3;
    tick('marchingCubes');
    mesh = largestComponent(mesh);
    tick('component');
    const ti = opts.taubin != null ? opts.taubin : 10;
    if (ti > 0) mesh.pos = smoothTaubin(mesh.pos, mesh.faces, ti, 0.5, -0.53);
    tick('smooth');
    const tv = opts.targetVertices || 60000;
    if (mesh.faces.length / 3 > 2 * tv) { const d = decimate(mesh.pos, mesh.faces, 2 * tv, opts.decimate); mesh = { pos: d.pos, faces: d.faces }; info.decimate = d.stats; }
    tick('decimate');
    const pi = opts.postTaubin != null ? opts.postTaubin : 2; if (pi > 0) mesh.pos = smoothTaubin(mesh.pos, mesh.faces, pi, 0.5, -0.53);
    const adj = adjacency(mesh.faces, mesh.pos.length / 3);
    info.inflate = {}; info.pialFolded = foldedFaces(mesh.pos, mesh.faces).length;
    const inflated = inflate(mesh.pos, mesh.faces, Object.assign({ adj, stats: info.inflate }, opts.inflate));
    tick('inflate');
    const s = sulc(mesh.pos, mesh.faces, inflated, opts.sulc);
    tick('sulc');
    info.topology = topology(mesh); info.area = area(mesh.pos, mesh.faces); info.volume = volume(mesh.pos, mesh.faces);
    T.total = Math.round(now() - t00);
    return { n: mesh.pos.length / 3, pial: mesh.pos, inflated, faces: mesh.faces, sulc: s, timings: T, info };
  }

  /** boîtes englobantes (voxels) de chaque étiquette non nulle en une passe → Map(valeur → {min,max}) */
  function labelBoxes(labels, dims) {
    const [nx, ny, nz] = dims, M = new Map();
    for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) {
      const L = labels[o]; if (!L) continue; let b = M.get(L);
      if (!b) M.set(L, { min: [i, j, k], max: [i, j, k] });
      else { if (i < b.min[0]) b.min[0] = i; if (i > b.max[0]) b.max[0] = i; if (j < b.min[1]) b.min[1] = j; if (j > b.max[1]) b.max[1] = j; if (k > b.max[2]) b.max[2] = k; }
    }
    return M;
  }
  /** maillage d'une structure (noyau gris, ventricule…) : étiquette(s) → masque, plus grande composante (opts.largest, défaut
   *  vrai), comblement, flou (opts.sigma, défaut 0.7), marching cubes, Taubin (opts.taubin, 6), décimation (opts.targetFaces,
   *  défaut 6000). opts.boxes : Map de labelBoxes (réutilisable). → { pos, faces, info } ou null si absente */
  function pipelineStructure(labelVol, labels, opts) {
    opts = obj(opts);
    const VO = VOps(), { dims, affine } = labelVol, L = labels instanceof Set ? labels : new Set([].concat(labels));
    const boxes = opts.boxes || labelBoxes(labelVol.data, dims); let bb = null; for (const l of L) bb = VO.bboxUnion(bb, boxes.get(l) && { min: boxes.get(l).min.slice(), max: boxes.get(l).max.slice() });
    if (!bb) return null;
    const sigma = opts.sigma != null ? opts.sigma : 0.7, pad = Math.ceil(3 * sigma) + 2;
    bb = { min: bb.min.map(v => v - pad), max: bb.max.map(v => v + pad) };
    const C = VO.crop(labelVol.data, dims, bb), cd = C.dims, Ac = VO.cropAffine(affine, bb);
    let m = VO.maskOf(C.data, L); if (opts.largest !== false) m = VO.keepLargest(m, cd, 26); m = VO.fillHoles(m, cd);
    let mesh = marchingCubes(sigma > 0 ? VO.gaussian(m, cd, sigma, { border: 'zero' }) : m, cd, 0.5, Ac);
    if (opts.largest !== false) mesh = largestComponent(mesh);
    const ti = opts.taubin != null ? opts.taubin : 6; if (ti > 0) mesh.pos = smoothTaubin(mesh.pos, mesh.faces, ti, 0.5, -0.53);
    const tf = opts.targetFaces || 6000; if (mesh.faces.length / 3 > tf) { const d = decimate(mesh.pos, mesh.faces, tf, opts.decimate); mesh = { pos: d.pos, faces: d.faces }; }
    return { pos: mesh.pos, faces: mesh.faces, info: { voxels: VO.count(m), volume: volume(mesh.pos, mesh.faces) } };
  }
  /** plusieurs structures : items [{ name, labels }] → [{ name, labels, pos, faces, info }] (structures absentes omises) */
  function pipelineStructures(labelVol, items, opts, progress) {
    [opts, progress] = progArgs(opts, progress);
    const boxes = labelBoxes(labelVol.data, labelVol.dims), out = [];
    items.forEach((it, i) => { const r = pipelineStructure(labelVol, it.labels, Object.assign({}, opts, it.opts, { boxes })); if (r) out.push(Object.assign({ name: it.name, labels: [].concat(it.labels instanceof Set ? [...it.labels] : it.labels) }, r)); progress({ stage: 'structure', done: i + 1, total: items.length }); });
    return out;
  }
  /** isosurface d'un volume d'intensité (p. ex. métal des électrodes au scanner, iso en unités mises à l'échelle, HU) :
   *  opts.bbox (voxels), opts.sigma (défaut 0), suppression des composantes < opts.minFaces (défaut 20), Taubin
   *  (opts.taubin, défaut 0), décimation optionnelle (opts.targetFaces). → { pos, faces, components, timings } */
  function pipelineIso(vol, iso, opts, progress) {
    [opts, progress] = progArgs(opts, progress);
    const T = {}, tick = timer(T, progress), VO = SV.VolOps, slope = vol.slope || 1, inter = vol.inter || 0;
    let field = vol.data, dims = vol.dims, A = vol.affine, isoRaw = (iso - inter) / slope;
    if (slope < 0 || opts.sigma > 0 || opts.bbox) {
      const bb = opts.bbox ? { min: opts.bbox.min.map(v => v - 3), max: opts.bbox.max.map(v => v + 3) } : { min: [0, 0, 0], max: dims.map(d => d - 1) };
      const C = VO ? VO.crop(field, dims, bb, Float32Array) : { data: Float32Array.from(field), dims, bb };
      for (let i = 0; i < C.data.length; i++) C.data[i] = C.data[i] * slope + inter;
      field = opts.sigma > 0 ? VO.gaussian(C.data, C.dims, opts.sigma) : C.data; dims = C.dims; A = VO ? VO.cropAffine(vol.affine, bb) : A; isoRaw = iso;
    }
    tick('field');
    let mesh = marchingCubes(field, dims, isoRaw, A);
    tick('marchingCubes');
    const r = removeSmallComponents(mesh, opts.minFaces != null ? opts.minFaces : 20); mesh = { pos: r.pos, faces: r.faces };
    if (opts.taubin > 0) mesh.pos = smoothTaubin(mesh.pos, mesh.faces, opts.taubin, 0.5, -0.53);
    if (opts.targetFaces && mesh.faces.length / 3 > opts.targetFaces) { const d = decimate(mesh.pos, mesh.faces, opts.targetFaces, opts.decimate); mesh = { pos: d.pos, faces: d.faces }; }
    tick('mesh');
    return { pos: mesh.pos, faces: mesh.faces, components: r.components, timings: T };
  }

  SV.Mesh = {
    marchingCubes, topology, opposites, compact, faceComponents, largestComponent, removeSmallComponents, cleanup,
    normals, areas, area, volume, meanEdge, adjacency, smoothLaplacian, smoothTaubin, decimate, inflate, foldedFaces, untangle, sulcRaw, sulc,
    sampleLabels, fillVertexLabels, modeFilterLabels, toObj, fromObj, toGifti, fromGifti, pack, unpack,
    labelBoxes, pipelineHemisphere, pipelineStructure, pipelineStructures, pipelineIso,
  };
});
