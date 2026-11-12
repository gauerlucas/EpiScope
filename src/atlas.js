/* EpiScope — atlas.js : atlas VEP (fsaverage5), régions, adjacence, matrice de connectivité */
(function (SV) {
  'use strict';

  function b64ToArray(b64, Type) {
    const bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return new Type(u8.buffer);
  }

  class Atlas {
    constructor(mesh, db) {
      this.mesh = mesh;
      this.regions = mesh.regions;              // 163 (0 = Unknown)
      this.N = this.regions.length;
      this.famIndex = new Map();                // family → {L, R}
      for (const r of this.regions) {
        if (r.index === 0) continue;
        if (!this.famIndex.has(r.family)) this.famIndex.set(r.family, {});
        this.famIndex.get(r.family)[r.hemi] = r.index;
      }
      this.hemiOf = this.regions.map(r => r.hemi);
      this.homotopic = new Int16Array(this.N).fill(-1);
      for (const [fam, lr] of this.famIndex) if (lr.L && lr.R) { this.homotopic[lr.L] = lr.R; this.homotopic[lr.R] = lr.L; }
      this.dist = b64ToArray(mesh.centroid_distances, Float32Array);
      this.adj = new Uint8Array(this.N * this.N);
      for (const [i, j] of mesh.adjacency) { this.adj[i * this.N + j] = 1; this.adj[j * this.N + i] = 1; }
      this.db = db;
      this.hemis = {};
      for (const h of ['lh', 'rh']) {
        const H = mesh.hemis[h];
        this.hemis[h] = {
          n: H.n_vertices, pial: b64ToArray(H.pial, Float32Array), inflated: b64ToArray(H.inflated, Float32Array),
          flat: H.flat ? b64ToArray(H.flat, Float32Array) : null, faces: b64ToArray(H.faces, Uint16Array),
          sulc: b64ToArray(H.sulc, Int8Array), labels: b64ToArray(H.labels, Uint8Array),
        };
      }
      this.subcortical = mesh.subcortical.map(s => ({ index: s.region_index, name: s.name, vertices: b64ToArray(s.vertices, Float32Array), faces: b64ToArray(s.faces, Uint16Array) }));
      this.patientSC = null; this.patientFC = null;
    }

    region(i) { return this.regions[i]; }
    label(i) {
      const r = this.regions[i]; if (!r || !r.index) return '—';
      const meta = this.db && this.db.regionByFamily.get(r.family);
      return (meta ? meta.label_fr : r.family) + (r.hemi === 'L' ? ' G' : ' D');
    }
    labelEn(i) { const r = this.regions[i]; return r ? r.name : '—'; }
    system(i) { const r = this.regions[i]; const m = r && this.db && this.db.regionByFamily.get(r.family); return m ? m.system : ''; }
    ezPrior(i) { const r = this.regions[i]; const m = r && this.db && this.db.regionByFamily.get(r.family); return m ? (parseFloat(m.ez_prior) || 1) : 1; }

    /** index de région pour (family, hemi) */
    idx(family, hemi) { const lr = this.famIndex.get(family); return lr ? (lr[hemi] || 0) : 0; }

    /** Charge une matrice patient (TVB/VEP : weights.txt + centres.txt ou noms). names = tableau de noms VEP (Left-xxx).
     *  Retourne {matched, missing}. */
    setPatientMatrix(kind, matrix, names) {
      const N = this.N, M = new Float32Array(N * N);
      const byName = new Map(this.regions.map(r => [r.name.toLowerCase(), r.index]));
      const map = names.map(nm => {
        let k = nm.trim().toLowerCase().replace(/^ctx[-_][lr]h[-_]/, m => (m[4] === 'l' ? 'left-' : 'right-')).replace(/_/g, '-');
        return byName.get(k) || 0;
      });
      const n = names.length; let maxv = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = Math.abs(matrix[i][j]); if (i !== j && v > maxv) maxv = v; }
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const a = map[i], b = map[j]; if (!a || !b || a === b) continue;
        let v = Math.abs(matrix[i][j]);
        v = kind === 'sc' ? Math.log1p(v) / Math.log1p(maxv) : v / maxv; // log pour les comptes de fibres
        M[a * N + b] = Math.max(M[a * N + b], v); M[b * N + a] = M[a * N + b];
      }
      if (kind === 'sc') this.patientSC = M; else this.patientFC = M;
      const matched = map.filter(Boolean).length;
      return { matched, missing: names.filter((_, i) => !map[i]) };
    }
    clearPatient(kind) { if (kind === 'sc') this.patientSC = null; else this.patientFC = null; }

    /** Matrice de connectivité C (N×N, 0–1) = max( adjacence, distance, liens curés, homotopique, patient ) */
    buildConnectivity(p) {
      const N = this.N, C = new Float32Array(N * N);
      const lam = p.dist_lambda || 25, wAdj = p.w_adj, wDist = p.w_dist, wEdges = p.w_edges, wHom = p.homotopic;
      for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
        if (i === j) continue;
        let v = 0;
        if (this.adj[i * N + j]) v = wAdj;
        if (this.hemiOf[i] === this.hemiOf[j]) { const d = this.dist[i * N + j]; v = Math.max(v, wDist * Math.exp(-d / lam)); }
        C[i * N + j] = v;
      }
      for (const e of this.db.edges) {
        for (const h of ['L', 'R']) {
          const a = this.idx(e.family_a, h), b = this.idx(e.family_b, h); if (!a || !b) continue;
          const v = wEdges * e.weight;
          if (v > C[a * N + b]) { C[a * N + b] = v; C[b * N + a] = v; }
        }
      }
      for (let i = 1; i < N; i++) { const j = this.homotopic[i]; if (j > 0 && wHom > C[i * N + j]) C[i * N + j] = wHom; }
      const alpha = p.patient_alpha;
      if (this.patientSC && alpha > 0) for (let k = 0; k < N * N; k++) C[k] = (1 - alpha) * C[k] + alpha * Math.max(C[k], this.patientSC[k]);
      if (this.patientFC && p.fc_alpha > 0) for (let k = 0; k < N * N; k++) C[k] = Math.max(C[k], p.fc_alpha * this.patientFC[k]);
      return C;
    }
  }

  SV.Atlas = Atlas; SV.b64ToArray = b64ToArray;
})(window.SV = window.SV || {});
