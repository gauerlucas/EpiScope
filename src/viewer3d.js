/* EpiScope — viewer3d.js : rendu 3D en mosaïque (three.js / WebGL) avec repli Canvas 2D sans WebGL.
 * Une scène unique (cortex G/D morphable pial ↔ gonflé, sous-cortical, limites, couches de réseau, électrodes) rendue
 * dans N cellules ; chaque cellule a sa caméra, ses contrôles orbitaux et sa propre configuration d'affichage :
 *   view, hemi (both/L/R), inflate (0 pial … 1 gonflé), opacity (0…1), sub, borders, fibers, nodes, sync, electrodes,
 *   labels (étiquettes d'électrodes), netLabels (étiquettes du réseau), hubLabels (étiquettes ◆ des hubs, off par défaut),
 *   thermo / stims (marqueurs de thermocoagulation et de stimulation), quant (id du jeu de quantification affiché),
 *   ccep (réseau dirigé des potentiels évoqués), neutral (cortex et plots sans couleur d'activation), tilt (élévation en degrés
 *   ajoutée aux vues latérales / médiales / antérieure / postérieure, pour dégager les électrodes orthogonales),
 *   frontGlass (cortex transparent réduit à sa couche la plus proche de la caméra : effet de volume de verre),
 *   stimSet (pastilles de stimulation : 'all' réponse max. | 'elec' crises / PD | 'subj' subjectives | 'func' fonctionnelles),
 *   subOpacity (opacité des structures profondes), subHemi ('both' | 'L' | 'R', en plus des hémisphères affichés), subFams (familles
 *   de structures montrées, null = toutes), subFilter (structures profondes montrées : 'all' | 'noCb' sans cervelet | 'mtl' amygdale et hippocampe seuls), hyps (couches d'hypothèses affichées ; vide =
 *   graphe global neutre).
 * Couches de réseau : 'global' (faisceaux neutres cyan → violet) et 'h0', 'h1'… (une teinte par hypothèse), chacune avec
 * ses faisceaux, nœuds, liens de synchronisation et étiquettes ; une cellule qui montre une seule hypothèse colore le
 * cortex avec la dynamique conditionnée à cette hypothèse.
 * Gonflement : tout suit la surface. Les sommets du cortex sont interpolés pial → gonflé ; les centroïdes des régions
 * corticales suivent le déplacement moyen de leurs sommets ; les points profonds (structures sous-corticales, pointes
 * d'électrodes) suivent une transformation affine par hémisphère (échelle globale pial → gonflé) ; une électrode reste
 * rectiligne entre son entrée (qui suit la surface) et sa pointe (qui suit l'échelle globale). */
(function (SV) {
  'use strict';

  // ---------- palette d'activation (cortex neutre → or → orange → carmin → lie-de-vin)
  const RAMP = [[0.0, [255, 230, 150]], [0.35, [255, 196, 70]], [0.6, [255, 120, 55]], [0.85, [214, 40, 70]], [1.0, [140, 25, 95]]];
  function rampColor(a) {
    a = Math.max(0, Math.min(1, a));
    for (let i = 1; i < RAMP.length; i++) if (a <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i], f = (a - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
    return RAMP[RAMP.length - 1][1];
  }
  const mixF = a => Math.max(0, Math.min(1, (a - 0.06) / 0.3));
  /** échelle « chaleur » de l'aire stimulée : jaune pâle → orange → rouge */
  const HEAT = [[0, [255, 150, 25]], [0.5, [240, 80, 25]], [1, [190, 15, 40]]];
  function heatColor(a) { a = Math.max(0, Math.min(1, a)); for (let i = 1; i < HEAT.length; i++) if (a <= HEAT[i][0]) { const [t0, c0] = HEAT[i - 1], [t1, c1] = HEAT[i], f = (a - t0) / (t1 - t0); return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]; } return HEAT[HEAT.length - 1][1]; }
  function cssRamp(a) { const c = rampColor(a); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

  const BASE_GYRUS = [222, 217, 208], BASE_SULCUS = [150, 143, 135];
  const SUB_BASE = { 'Hippocampus-anterior': [120, 140, 190], 'Hippocampus-posterior': [110, 125, 175], 'Amygdala': [150, 120, 185], 'Thalamus': [120, 160, 160], 'Caudate-nucleus': [140, 160, 180], 'Putamen': [160, 140, 150], 'Pallidum': [140, 130, 140], 'Nucleus-accumbens': [170, 140, 160], 'Cerebellar-cortex': [170, 170, 165] };
  const MTL = new Set(['Amygdala', 'Hippocampus-anterior', 'Hippocampus-posterior']);   // structures temporales mésiales
  const ARC_A = [76, 201, 240], ARC_B = [164, 108, 255];   // faisceaux neutres : cyan → violet
  /** teintes des hypothèses H1…H4 (bleu, jaune, vert, rose) */
  const HYP_COLORS = [[78, 168, 255], [255, 210, 63], [123, 211, 137], [232, 121, 201]];
  const INFL_DX = 32;                                        // écartement des hémisphères gonflés (mm)

  // ---------- géométrie écran pour le placement des étiquettes (fractions de recouvrement, 0…1)
  /** part de la plus petite des deux boîtes recouverte par l'autre */
  function rectOverlap(b, x, y, w, h) { const ix = Math.max(0, Math.min(b.x + b.w, x + w) - Math.max(b.x, x)), iy = Math.max(0, Math.min(b.y + b.h, y + h) - Math.max(b.y, y)); return ix * iy / Math.max(1, Math.min(w * h, b.w * b.h)); }
  /** longueur d'un segment à l'intérieur d'une boîte (Liang–Barsky), rapportée à la diagonale de la boîte */
  function segOverlap(s, x, y, w, h) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, p = [-dx, dx, -dy, dy], q = [s.x1 - x, x + w - s.x1, s.y1 - y, y + h - s.y1]; let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return 0; continue; } const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return 0; if (t > t0) t0 = t; } else { if (t < t0) return 0; if (t < t1) t1 = t; } }
    return Math.max(0, t1 - t0) * Math.hypot(dx, dy) / Math.max(1, Math.hypot(w, h));
  }
  /** point du bord d'une boîte le plus proche d'un point extérieur */
  function edgePoint(b, px, py) { return [Math.max(b.x, Math.min(b.x + b.w, px)), Math.max(b.y, Math.min(b.y + b.h, py))]; }
  const LABEL_DIRS = 12, LABEL_DIST = [6, 20, 40, 64, 92, 126];   // cases candidates : directions (tous les 30°) × écarts au nœud (px)

  const VIEWS = {
    latL: { pos: [-420, 0, 0], hemi: 'both', fr: 'Latéral G', rot: [0, 90] }, latR: { pos: [420, 0, 0], hemi: 'both', fr: 'Latéral D', rot: [0, -90] },
    medL: { pos: [420, 0, 0], hemi: 'L', fr: 'Médial G', rot: [0, -90] }, medR: { pos: [-420, 0, 0], hemi: 'R', fr: 'Médial D', rot: [0, 90] },
    sup: { pos: [0, -30, 440], hemi: 'both', fr: 'Supérieur', rot: [90, 0] }, inf: { pos: [0, -30, -440], hemi: 'both', fr: 'Inférieur', rot: [-90, 0] },
    ant: { pos: [0, 440, 0], hemi: 'both', fr: 'Antérieur', rot: [0, 180] }, post: { pos: [0, -440, 0], hemi: 'both', fr: 'Postérieur', rot: [0, 0] },
    // inférieur en convention radiologique (antérieur en haut, droite du patient à gauche de l'image) — rapports, implantation
    infRad: { pos: [0, 0, -440], up: [0, 1, 0], hemi: 'both', fr: 'Inférieur', rot: [-90, 0] },
    // 3/4 antéro-supérieur « en plongée » : à mi-chemin entre latéral et antérieur, 35° au-dessus de l'horizontale
    aslL: { pos: [-255, 255, 252], hemi: 'both', fr: '3/4 ant.-sup. G', rot: [35, 135] }, aslR: { pos: [255, 255, 252], hemi: 'both', fr: '3/4 ant.-sup. D', rot: [35, -135] },
  };
  /** configuration d'affichage par défaut d'une cellule */
  const CELL_DEFAULTS = { view: 'latL', hemi: 'both', inflate: 0, opacity: 1, sub: true, borders: false, fibers: true, nodes: true, sync: true, electrodes: true, elecHemi: 'both', labels: true, netLabels: true, hubLabels: false, thermo: true, stims: true, quant: null, ccep: false, neutral: false, tilt: 0, frontGlass: true, subFilter: 'all', stimSet: 'all', subOpacity: 0.95, subHemi: 'both', subFams: null, hyps: [], slices3d: false, clip: '', paint: null, title: '', viewFr: '', tcStatus: null, probe: true, zones: null, rois: true };
  const DISPLAY_KEYS = ['tcStatus', 'inflate', 'opacity', 'sub', 'borders', 'fibers', 'nodes', 'sync', 'electrodes', 'elecHemi', 'labels', 'netLabels', 'hubLabels', 'thermo', 'stims', 'quant', 'ccep', 'neutral', 'frontGlass', 'subFilter', 'stimSet', 'subOpacity', 'subHemi', 'subFams', 'hyps', 'slices3d', 'clip', 'paint'];
  const LAYOUTS = {
    single: { cols: 1, rows: 1, fr: '1 vue', cells: [{ view: 'latL' }] },
    duo: { cols: 2, rows: 1, fr: '2 vues', cells: [{ view: 'latL' }, { view: 'medL', hemi: 'L' }] },
    quad: { cols: 2, rows: 2, fr: '4 faces', cells: [{ view: 'latL' }, { view: 'latR' }, { view: 'medL', hemi: 'L' }, { view: 'medR', hemi: 'R' }] },
    mosaic: { cols: 2, rows: 2, fr: 'Lat · Méd · Gonflé · Profond', cells: [{ view: 'latL' }, { view: 'medL', hemi: 'L' }, { view: 'latL', inflate: 1, sub: false, electrodes: false, borders: true }, { view: 'latL', opacity: 0.25, fibers: false, sync: false }] },
    // stimulations SEEG : en haut le contact stimulé dans le verre (structures profondes sans cervelet), en bas le cortex opaque
    // coloré par l'aire échantillonnée (peinture par sommet 'stimCortex')
    stim: { cols: 1, rows: 2, fr: 'Stimulation : contact · cortex stimulé', cells: [
      { view: 'aslL', opacity: 0.3, frontGlass: true, sub: true, subFilter: 'noCb', subOpacity: 0.3, fibers: false, nodes: false, sync: false, netLabels: false, title: 'Contact stimulé' },
      { view: 'aslL', opacity: 1, frontGlass: false, sub: false, fibers: false, nodes: false, sync: false, netLabels: false, labels: false, paint: 'stimCortex', title: 'Cortex stimulé' }] },
  };
  /** normalise une configuration (clés anciennes `surface` / `glass` comprises) */
  function normCfg(cfg) {
    const c = Object.assign({}, CELL_DEFAULTS, cfg);
    if (cfg && cfg.surface !== undefined) c.inflate = cfg.surface === 'inflated' ? 1 : 0;
    if (cfg && cfg.glass !== undefined) c.opacity = cfg.glass ? 0.25 : 1;
    c.inflate = Math.round(Math.max(0, Math.min(1, +c.inflate || 0)) * 20) / 20; c.opacity = Math.round(Math.max(0.05, Math.min(1, +c.opacity || 0)) * 20) / 20;
    c.hyps = Array.isArray(c.hyps) ? c.hyps.slice() : [];
    c.subOpacity = Math.round(Math.max(0.05, Math.min(1, c.subOpacity == null ? 0.95 : +c.subOpacity)) * 20) / 20; c.subFams = Array.isArray(c.subFams) ? c.subFams.slice() : null; c.tcStatus = Array.isArray(c.tcStatus) ? c.tcStatus.slice() : null;
    delete c.surface; delete c.glass;
    return c;
  }

  /** limites de parcellation : segments reliant les milieux d'arêtes des faces à étiquettes mixtes, légèrement décollés */
  function buildBorders(pos, faces, labels, normals) {
    const out = [];
    const mid = (a, b, o) => { for (let k = 0; k < 3; k++) o.push((pos[a * 3 + k] + pos[b * 3 + k]) / 2 + (normals[a * 3 + k] + normals[b * 3 + k]) * 0.3); };
    for (let f = 0; f < faces.length; f += 3) {
      const i = faces[f], j = faces[f + 1], k = faces[f + 2], li = labels[i], lj = labels[j], lk = labels[k];
      if (li === lj && lj === lk) continue;
      if (li === lj) { mid(i, k, out); mid(j, k, out); }
      else if (lj === lk) { mid(j, i, out); mid(k, i, out); }
      else if (li === lk) { mid(i, j, out); mid(k, j, out); }
      else { const c = []; for (let q = 0; q < 3; q++) c.push((pos[i * 3 + q] + pos[j * 3 + q] + pos[k * 3 + q]) / 3 + (normals[i * 3 + q] + normals[j * 3 + q] + normals[k * 3 + q]) * 0.1); mid(i, j, out); out.push(...c); mid(j, k, out); out.push(...c); mid(k, i, out); out.push(...c); }
    }
    return new Float32Array(out);
  }
  function vertexNormals(pos, faces, n) {
    const N = new Float32Array(n * 3);
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f] * 3, b = faces[f + 1] * 3, c = faces[f + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; }
    }
    for (let v = 0; v < n; v++) { const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l; }
    return N;
  }
  const lvlKey = a => a.toFixed(2);

  class Viewer3D {
    constructor(container, atlas, onPick) {
      this.el = container; this.atlas = atlas; this.onPick = onPick || (() => {});
      this.N = atlas.N; this.activation = new Float32Array(this.N); this.hypActs = {};
      this.highlight = -1; this.time = 0; this.linked = false;
      this.cells = []; this.active = 0; this.onCellChange = () => {};
      this.electrodes = []; this.elecStyle = 'dark-bg'; this.layers = new Map();
      this.cellLayer = document.createElement('div'); this.cellLayer.className = 'sv-cells'; this.el.appendChild(this.cellLayer);
      this._morphCache = new Map(); this._colorCache = {};
      this._prepareMapping();
      this.mode = 'webgl';
      try { this._initWebGL(); } catch (e) { console.warn('WebGL indisponible, repli Canvas 2D :', e); this.mode = 'canvas'; this._initCanvas(); }
      this.setLayout('single');
      this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(this.el);
    }

    // =====================================================================  gonflement : morphing et transport des points
    /** par hémisphère : transformation affine pial → gonflé (boîtes englobantes) et déplacement moyen par région */
    _prepareMapping() {
      this.map = {}; this.regDisp = new Array(this.N).fill(null);
      const sum = new Float64Array(this.N * 6), cnt = new Uint32Array(this.N);
      for (const h of ['lh', 'rh']) {
        const H = this.atlas.hemis[h], P = H.pial, I = H.inflated, dx = h === 'lh' ? -INFL_DX : INFL_DX;
        const pmin = [1e9, 1e9, 1e9], pmax = [-1e9, -1e9, -1e9], imin = [1e9, 1e9, 1e9], imax = [-1e9, -1e9, -1e9];
        for (let v = 0; v < H.n; v++) {
          for (let k = 0; k < 3; k++) { const p = P[v * 3 + k], q = I[v * 3 + k]; if (p < pmin[k]) pmin[k] = p; if (p > pmax[k]) pmax[k] = p; if (q < imin[k]) imin[k] = q; if (q > imax[k]) imax[k] = q; }
          const r = H.labels[v]; if (r) { cnt[r]++; for (let k = 0; k < 3; k++) { sum[r * 6 + k] += P[v * 3 + k]; sum[r * 6 + 3 + k] += I[v * 3 + k]; } }
        }
        const cP = pmin.map((m, k) => (m + pmax[k]) / 2), cI = imin.map((m, k) => (m + imax[k]) / 2), S = pmin.map((m, k) => (imax[k] - imin[k]) / Math.max(1e-6, pmax[k] - m));
        this.map[h] = { cP, cI, S, dx, t: [cI[0] - cP[0] + dx, cI[1] - cP[1], cI[2] - cP[2]] };
      }
      for (let r = 1; r < this.N; r++) if (cnt[r]) { const dx = this.atlas.hemiOf[r] === 'L' ? -INFL_DX : INFL_DX; this.regDisp[r] = [sum[r * 6 + 3] / cnt[r] - sum[r * 6] / cnt[r] + dx, sum[r * 6 + 4] / cnt[r] - sum[r * 6 + 1] / cnt[r], sum[r * 6 + 5] / cnt[r] - sum[r * 6 + 2] / cnt[r]]; }
    }
    _hemiOfPoint(p, hemi) { return hemi ? (hemi === 'L' ? 'lh' : 'rh') : (p[0] < 0 ? 'lh' : 'rh'); }
    /** point profond : échelle globale (affine) de l'hémisphère, interpolée par le niveau a */
    mapDeep(p, a, hemi) {
      if (!a) return p.slice(); const m = this.map[this._hemiOfPoint(p, hemi)], out = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const q = m.cP[k] + m.S[k] * (p[k] - m.cP[k]) + m.t[k]; out[k] = p[k] + a * (q - p[k]); }
      return out;
    }
    /** sommet pial le plus proche d'un point (pour transporter un point de surface) */
    nearestVertex(p, hemi) {
      const h = this._hemiOfPoint(p, hemi), P = this.atlas.hemis[h].pial; let bv = 0, bd = Infinity;
      for (let v = 0, n = P.length / 3; v < n; v++) { const d = (P[v * 3] - p[0]) ** 2 + (P[v * 3 + 1] - p[1]) ** 2 + (P[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; bv = v; } }
      return { h, v: bv, d2: bd };
    }
    mapSurface(p, a, nv) {
      if (!a) return p.slice(); const H = this.atlas.hemis[nv.h], v = nv.v, dx = nv.h === 'lh' ? -INFL_DX : INFL_DX;
      return [p[0] + a * (H.inflated[v * 3] - H.pial[v * 3] + dx), p[1] + a * (H.inflated[v * 3 + 1] - H.pial[v * 3 + 1]), p[2] + a * (H.inflated[v * 3 + 2] - H.pial[v * 3 + 2])];
    }
    /** centroïde d'une région transporté au niveau a : régions corticales par déplacement moyen de leurs sommets, profondes par l'affine */
    regionPoint(r, a) {
      const c = this.atlas.region(r).centroid; if (!c) return null; if (!a) return c;
      const d = this.regDisp[r]; if (d) return [c[0] + a * d[0], c[1] + a * d[1], c[2] + a * d[2]];
      return this.mapDeep(c, a, this.atlas.hemiOf[r]);
    }
    /** géométrie d'électrode transportée au niveau a : entrée sur la surface, pointe à l'échelle globale, trajet rectiligne */
    elecGeom(e, a) {
      if (!a) return { tip: e.tip, entry: e.entry, dir: e.dir, contacts: e.contacts.map(c => c.xyz) };
      e._cache = e._cache || {}; const k = lvlKey(a); if (e._cache[k]) return e._cache[k];
      if (!e._nv) e._nv = this.nearestVertex(e.entry, e.hemi);
      const entry = this.mapSurface(e.entry, a, e._nv), tip = this.mapDeep(e.tip, a, e.hemi);
      const L0 = Math.hypot(e.entry[0] - e.tip[0], e.entry[1] - e.tip[1], e.entry[2] - e.tip[2]) || 1, dv = [entry[0] - tip[0], entry[1] - tip[1], entry[2] - tip[2]], L1 = Math.hypot(...dv) || 1, dir = dv.map(x => x / L1);
      const contacts = e.contacts.map(c => { const f = Math.hypot(c.xyz[0] - e.tip[0], c.xyz[1] - e.tip[1], c.xyz[2] - e.tip[2]) / L0; return [tip[0] + dv[0] * f, tip[1] + dv[1] * f, tip[2] + dv[2] * f]; });
      return e._cache[k] = { tip, entry, dir, contacts };
    }
    /** géométrie morphée pial → gonflé (a ∈ [0,1]) : positions, normales, limites ; mise en cache par niveau */
    _morph(h, a) {
      const key = h + ':' + lvlKey(a); let M = this._morphCache.get(key); if (M) return M;
      const H = this.atlas.hemis[h], P = H.pial, I = H.inflated, dx = (h === 'lh' ? -INFL_DX : INFL_DX) * a, pos = new Float32Array(P.length);
      for (let i = 0; i < P.length; i += 3) { pos[i] = P[i] * (1 - a) + (I[i] + dx) * a; pos[i + 1] = P[i + 1] * (1 - a) + I[i + 1] * a; pos[i + 2] = P[i + 2] * (1 - a) + I[i + 2] * a; }
      const nrm = vertexNormals(pos, H.faces, H.n), border = buildBorders(pos, H.faces, H.labels, nrm);
      M = { pos, nrm, border };
      if (this.mode === 'webgl') { const THREE = window.THREE; M.posAttr = new THREE.BufferAttribute(pos, 3); M.nrmAttr = new THREE.BufferAttribute(nrm, 3); M.borderAttr = new THREE.BufferAttribute(border, 3); }
      this._morphCache.set(key, M); return M;
    }

    // =====================================================================  cellules / disposition
    setLayout(name) {
      const L = LAYOUTS[name] || LAYOUTS.single; this.layoutName = name; this.cols = L.cols; this.rows = L.rows;
      while (this.cells.length > L.cells.length) { const c = this.cells.pop(); if (c.controls) c.controls.dispose(); if (c.camera) this.scene.remove(c.camera); c.el.remove(); }
      L.cells.forEach((cfg, i) => {
        if (this.cells[i]) { const keep = this.cells[i].cfg.hyps; Object.assign(this.cells[i].cfg, normCfg(cfg)); this.cells[i].cfg.hyps = keep; this._applyView(this.cells[i], cfg.view, false); }
        else this.cells.push(this._makeCell(normCfg(cfg), i));
      });
      this.active = 0; this._layoutCells(); this.onCellChange();
      if (this.mode === 'canvas') this._draw(); else this._buildLabels();
    }
    _layoutCells() {
      const n = this.cells.length;
      this.cells.forEach((c, i) => {
        const col = i % this.cols, row = Math.floor(i / this.cols);
        c.el.style.left = (col / this.cols * 100) + '%'; c.el.style.top = (row / this.rows * 100) + '%';
        c.el.style.width = (100 / this.cols) + '%'; c.el.style.height = (100 / this.rows) + '%';
        c.el.classList.toggle('active', i === this.active && n > 1); c.el.classList.toggle('solo', n === 1);
        c.label.innerHTML = this.cellTitle(c.cfg, true);
      });
    }
    cellTitle(cfg, html) {
      if (this.compactTitles && cfg.title) return (html ? `<b>${cfg.title}</b>` : cfg.title) + (cfg.viewFr ? ' · ' + cfg.viewFr : '');   // titres courts (stimulations, thermocoagulations)
      const surf = cfg.inflate >= 0.95 ? 'gonflé' : cfg.inflate <= 0.05 ? 'pial' : 'gonflé ' + Math.round(cfg.inflate * 100) + ' %';
      let t = (cfg.title ? (html ? `<b>${cfg.title}</b> · ` : cfg.title + ' · ') : '') + (cfg.viewFr || VIEWS[cfg.view].fr) + ' · ' + surf + (cfg.hemi === 'both' ? '' : cfg.hemi === 'L' ? ' · hémi. G' : ' · hémi. D') + (cfg.opacity < 0.95 ? ' · ' + Math.round(cfg.opacity * 100) + ' %' : '') + (cfg.sub ? '' : ' · sans profond');
      if (cfg.hyps.length) t += ' · ' + cfg.hyps.map(k => { const i = +k.slice(1), c = HYP_COLORS[i % HYP_COLORS.length]; return html ? `<b style="color:rgb(${c.join(',')})">H${i + 1}</b>` : 'H' + (i + 1); }).join(html ? ' ' : '+');
      return t;
    }
    _makeCell(cfg, i) {
      const el = document.createElement('div'); el.className = 'sv-cell';
      const label = document.createElement('div'); label.className = 'sv-cell-label'; el.appendChild(label);
      const gear = document.createElement('button'); gear.className = 'sv-cell-gear'; gear.textContent = '⚙'; gear.title = 'Réglages de cette vue'; el.appendChild(gear);
      gear.addEventListener('pointerdown', e => e.stopPropagation());
      const cell = { cfg, el, label, index: i };
      gear.addEventListener('click', e => { e.stopPropagation(); this.onCellMenu && this.onCellMenu(this.cells.indexOf(cell), e); });
      this.cellLayer.appendChild(el);
      if (this.mode === 'webgl') {
        const THREE = window.THREE;
        cell.camera = new THREE.PerspectiveCamera(28, 1, 10, 3000); cell.camera.up.set(0, 0, 1);
        const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(0.6, 0.8, 1.2); cell.camera.add(key);
        const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(-1, -0.4, -0.6); cell.camera.add(fill);
        this.scene.add(cell.camera);
        cell.controls = new THREE.OrbitControls(cell.camera, el);
        Object.assign(cell.controls, { enableDamping: true, dampingFactor: 0.12, rotateSpeed: 0.7, zoomSpeed: 0.8, enablePan: true, panSpeed: 0.6 });
        cell.controls.target.copy(this.center); cell.controls.enabled = !this.dragMode;
      } else { cell.rot = VIEWS[cfg.view].rot.slice(); cell.zoom = 1; this._bindCanvasCell(cell); }
      this._applyView(cell, cfg.view, false);
      this._bindPointer(el, cell);
      return cell;
    }
    /** modifie la configuration d'une cellule ; en mode « vues liées », les réglages d'affichage sont propagés à toutes */
    setCellConfig(i, patch, noLink) {
      const c = this.cells[i]; if (!c) return; const prevView = c.cfg.view, prevInfl = c.cfg.inflate, prevTilt = c.cfg.tilt;
      Object.assign(c.cfg, normCfg(Object.assign({}, c.cfg, patch)));
      if (patch.view && patch.view !== prevView) { this._applyView(c, patch.view, true); if (patch.viewFr === undefined) c.cfg.viewFr = ''; }
      else if (patch.tilt !== undefined && patch.tilt !== prevTilt) this._applyView(c, c.cfg.view, false, true);   // seule l'élévation change : l'hémisphère affiché est conservé
      // le cerveau gonflé est plus grand : la caméra recule d'autant (sans toucher à l'orientation)
      if (c.cfg.inflate !== prevInfl) { const f = (1 + 0.3 * c.cfg.inflate) / (1 + 0.3 * prevInfl); if (this.mode === 'webgl') { const t = c.controls.target, p = c.camera.position; p.sub(t).multiplyScalar(f).add(t); } else c.zoom /= f; }
      if (this.linked && !noLink) { const disp = {}; let any = false; for (const k of DISPLAY_KEYS) if (patch[k] !== undefined) { disp[k] = patch[k]; any = true; } if (any) this.cells.forEach((o, j) => { if (j !== i) this.setCellConfig(j, disp, true); }); }
      this._layoutCells(); this.onCellChange(); if (this.mode === 'canvas') this._draw(); else this._buildLabels();
    }
    setAllCells(patch) { this.cells.forEach((c, i) => this.setCellConfig(i, patch, true)); }
    applyActiveToAll() { const src = this.activeCfg, patch = {}; for (const k of DISPLAY_KEYS) patch[k] = src[k]; this.setAllCells(patch); }
    setLinked(b) { this.linked = !!b; if (this.linked) this.applyActiveToAll(); }
    get activeCfg() { return this.cells[this.active] ? this.cells[this.active].cfg : normCfg(LAYOUTS.single.cells[0]); }
    setActive(i) { this.active = i; this._layoutCells(); this.onCellChange(); }
    /** cellules concernées par une commande « vue active » : toutes si les vues sont liées */
    targetCells() { return this.linked ? this.cells.map((c, i) => i) : [this.active]; }

    _applyView(cell, name, animate, keepHemi) {
      const v = VIEWS[name]; if (!v) return; cell.cfg.view = name;
      if (v.hemi !== 'both' && !keepHemi) cell.cfg.hemi = v.hemi;
      if (this.mode === 'canvas') { cell.rot = v.rot.slice(); if (cell.cfg.tilt && Math.abs(v.rot[0]) < 45) cell.rot[0] += +cell.cfg.tilt; return; }
      const THREE = window.THREE, p = new THREE.Vector3(...v.pos), tilt = +cell.cfg.tilt || 0;
      if (tilt && Math.abs(p.z) < p.length() * 0.5) { const L = p.length(), r = tilt * Math.PI / 180; p.multiplyScalar(Math.cos(r)).z += L * Math.sin(r); }   // élévation : la caméra monte sans rouler
      const target = this.center.clone().add(p); const up = v.up || [0, 0, 1]; cell.camera.up.set(up[0], up[1], up[2]);
      const tok = cell._animTok = (cell._animTok || 0) + 1;   // toute nouvelle vue annule une animation en cours (sinon elle écraserait la caméra des captures suivantes)
      if (!animate) { cell.camera.position.copy(target); cell.controls.target.copy(this.center); cell.camera.lookAt(this.center); return; }   // orientation tout de suite : la boucle de rendu ne tourne pas quand la vue est masquée (captures)
      const from = cell.camera.position.clone(), t0 = performance.now();
      const step = () => { if (cell._animTok !== tok) return; const f = Math.min(1, (performance.now() - t0) / 450), e = 1 - Math.pow(1 - f, 3); cell.camera.position.lerpVectors(from, target, e); cell.controls.target.copy(this.center); this._dirty = true; if (f < 1) requestAnimationFrame(step); };
      step();
    }
    /** recentre la caméra d'une cellule sur un point (orientation conservée) ; dist : distance caméra – cible (mm) */
    focusOn(i, p, dist, animate, dir) {
      const c = this.cells[i]; if (!c || !p) return;
      if (this.mode !== 'webgl') { this._draw(); return; }
      const THREE = window.THREE, T = new THREE.Vector3(p[0], p[1], p[2]), off = c.camera.position.clone().sub(c.controls.target);
      if (dir) { const D = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(); if (Math.abs(D.z) > 0.94) { D.z = Math.sign(D.z) * 0.94; const h = Math.hypot(D.x, D.y) || 1, k = Math.sqrt(1 - 0.94 * 0.94) / h; D.x = (D.x || 0.001) * k; D.y *= k; } off.copy(D).multiplyScalar(dist || off.length()); }   // pas de vue exactement verticale (axe « haut » = z)
      else if (dist) off.setLength(dist);
      const fromP = c.camera.position.clone(), fromT = c.controls.target.clone(), toP = T.clone().add(off), tok = c._animTok = (c._animTok || 0) + 1;
      if (animate === false) { c.controls.target.copy(T); c.camera.position.copy(toP); this._dirty = true; return; }
      const t0 = performance.now(), step = () => { if (c._animTok !== tok) return; const f = Math.min(1, (performance.now() - t0) / 450), e = 1 - Math.pow(1 - f, 3); c.controls.target.lerpVectors(fromT, T, e); c.camera.position.lerpVectors(fromP, toP, e); this._dirty = true; if (f < 1) requestAnimationFrame(step); };
      step();
    }
    /** API compatible : agit sur la cellule active (ou cellIndex) */
    setView(name, animate, cellIndex) { const c = this.cells[cellIndex == null ? this.active : cellIndex]; if (!c) return; this._applyView(c, name, animate); this._layoutCells(); this.onCellChange(); if (this.mode === 'canvas') this._draw(); }
    get visible() { const c = this.activeCfg; return { L: c.hemi !== 'R', R: c.hemi !== 'L' }; }

    // =====================================================================  WebGL
    _initWebGL() {
      const THREE = window.THREE; if (!THREE) throw new Error('three.js non chargé');
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      if (!renderer.getContext()) throw new Error('pas de contexte WebGL');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0); renderer.setScissorTest(true); renderer.localClippingEnabled = true;
      this.renderer = renderer; this.el.insertBefore(renderer.domElement, this.cellLayer); renderer.domElement.className = 'sv-gl';
      const scene = this.scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.9));
      this.root = new THREE.Group(); scene.add(this.root);
      this._buildBrain();
      this.netGroup = new THREE.Group(); this.root.add(this.netGroup);
      this.elecGroup = new THREE.Group(); this.root.add(this.elecGroup);
      this.markGroup = new THREE.Group(); this.root.add(this.markGroup); this.markObjs = []; this.markLinks = null; this.contactHL = new Set();
      this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
      // rendu à la demande : chaque image si le réseau est animé ou si une caméra bouge (amortissement compris), sinon
      // seulement après un changement (toute méthode publique marque la vue « à redessiner »), au plus tard toutes les secondes
      const loop = () => {
        if (this.destroyed) return; this._raf = requestAnimationFrame(loop);
        if (this.el.offsetParent === null) return;   // vue masquée (autre écran) : rien à dessiner
        const now = performance.now(), anim = this.layers.size && (this._netAnim || this._hasSync);
        let moved = false; for (const c of this.cells) if (c.controls && c.controls.update()) moved = true;
        if (!anim && !moved && !this._dirty && now - (this._lastRender || 0) < 1000) return;
        this._dirty = false; this._lastRender = now;
        if (anim) this._animateNetwork(now); else this._updateLabels();
        this._renderAll(true);
      };
      loop();
    }

    /** maillages du cerveau (cortex par hémisphère, pré-passe de profondeur, limites, structures profondes) depuis this.atlas */
    _buildBrain() {
      const THREE = window.THREE;
      this.hemiMesh = {}; this.borderLines = {};
      for (const h of ['lh', 'rh']) {
        const H = this.atlas.hemis[h], geo = new THREE.BufferGeometry(), M = this._morph(h, 0);
        geo.setAttribute('position', M.posAttr); geo.setAttribute('normal', M.nrmAttr);
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(H.faces), 1));
        geo.setAttribute('color', this._colorsFor('global')[h]);
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.0, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat); mesh.userData = { hemi: h === 'lh' ? 'L' : 'R', h, labels: H.labels, kind: 'cortex', morph: 0, colorSrc: 'global' }; mesh.frustumCulled = false;
        mesh.renderOrder = 2; this.root.add(mesh); this.hemiMesh[h] = mesh;
        // pré-passe de profondeur (même géométrie, aucune couleur) : en mode « verre 1re couche », elle inscrit la profondeur de la
        // surface la plus proche, puis le cortex transparent n'est dessiné qu'à cette profondeur — les plis situés derrière
        // (face mésiale vue de côté, hémisphère opposé, parois profondes des sillons) ne s'additionnent plus
        const dm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, opacity: 1 })); dm.renderOrder = 20;   // « transparent » : rangée avec les objets transparents, donc après structures profondes et hampes (sinon three.js la dessinerait avant eux)
        dm.visible = false; dm.frustumCulled = false; dm.userData = { kind: 'depth' }; this.root.add(dm); mesh.userData.depthMesh = dm;
        const bg = new THREE.BufferGeometry(); bg.setAttribute('position', M.borderAttr);
        const lines = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0x1a1d24, transparent: true, opacity: 0.55 })); lines.renderOrder = 4; lines.frustumCulled = false;
        this.root.add(lines); this.borderLines[h] = lines;
      }
      this.subMesh = [];
      for (const s of this.atlas.subcortical) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(s.vertices, 3)); geo.setIndex(new THREE.BufferAttribute(new Uint32Array(s.faces), 1)); geo.computeVertexNormals();
        const fam = this.atlas.region(s.index).family, base = SUB_BASE[fam] || [160, 160, 160];
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(base[0] / 255, base[1] / 255, base[2] / 255), roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.95 });
        const mesh = new THREE.Mesh(geo, mat); mesh.userData = { region: s.index, kind: 'sub', base, h: this.atlas.hemiOf[s.index] === 'L' ? 'lh' : 'rh' }; mesh.renderOrder = 1; mesh.frustumCulled = false;
        this.root.add(mesh); this.subMesh.push(mesh);
      }
      const box = new THREE.Box3().setFromObject(this.hemiMesh.lh).union(new THREE.Box3().setFromObject(this.hemiMesh.rh));
      this.center = box.getCenter(new THREE.Vector3());
    }
    /** change d'anatomie (gabarit fsaverage ou anatomie du patient, même interface que SV.Atlas) : maillages, transport
     *  au gonflement, couleurs, centre et caméras ; réseaux, électrodes et marqueurs sont reconstruits par l'application */
    setAtlas(atlas) {
      if (atlas === this.atlas) return;
      if (this._zoneMesh) { for (const k in this._zoneMesh) for (const m of this._zoneMesh[k].meshes) { this.root.remove(m); m.geometry.dispose(); m.material.dispose(); } this._zoneMesh = {}; }
      this.atlas = atlas; this._morphCache.clear(); this._colorCache = {}; this._zeroAct = null; this._prepareMapping();
      if (this.mode === 'webgl') {
        for (const h of ['lh', 'rh']) { const m = this.hemiMesh[h]; if (!m) continue; this.root.remove(m); this.root.remove(m.userData.depthMesh); m.geometry.dispose(); m.material.dispose(); m.userData.depthMesh.material.dispose(); const b = this.borderLines[h]; this.root.remove(b); b.geometry.dispose(); b.material.dispose(); }
        for (const m of this.subMesh || []) { this.root.remove(m); m.geometry.dispose(); m.material.dispose(); }
        this._buildBrain();
        for (const [, L] of this.layers) { L.levels && L.levels.clear(); L.level = -1; }
        for (const c of this.cells) { c.controls.target.copy(this.center); this._applyView(c, c.cfg.view, false); }
        this.elecLevel = -1; this.markLevel = -1;
      } else this._canvasCenter();
      this._buildLabels && this.mode === 'webgl' && this._buildLabels(); if (this.mode === 'canvas') this._draw();
    }
    _renderAll(controlsDone) {
      const r = this.renderer, W = r.domElement.width / r.getPixelRatio(), H = r.domElement.height / r.getPixelRatio(); if (!W || !H) return;
      for (const cell of this.cells) {
        if (!controlsDone) cell.controls.update();
        const cw = Math.floor(W / this.cols), ch = Math.floor(H / this.rows), col = cell.index % this.cols, row = Math.floor(cell.index / this.cols);
        const x = col * cw, y = H - (row + 1) * ch;
        r.setViewport(x, y, cw, ch); r.setScissor(x, y, cw, ch);
        // v5.3 : cellule étroite → champ vertical élargi pour garder la largeur visible d'une cellule 1,2:1 (cerveau entier de profil)
        const asp = cw / ch, fov = asp < 1.2 ? 2 * Math.atan(Math.tan(14 * Math.PI / 180) * 1.2 / asp) * 180 / Math.PI : 28;
        if (cell.camera.aspect !== asp || cell.camera.fov !== fov) { cell.camera.aspect = asp; cell.camera.fov = fov; cell.camera.updateProjectionMatrix(); }
        this._applyCfg(cell.cfg); if (this._scalpElecs && this._scalpElecs.length) this._scalpFacing(cell.camera);
        r.render(this.scene, cell.camera);
      }
    }
    /** source d'activation d'une cellule : la dynamique conditionnée si elle montre une seule hypothèse, sinon le champ global */
    sourceOf(cfg) { if (cfg.paint && this.paints && this.paints[cfg.paint]) return 'paint:' + cfg.paint; return cfg.neutral ? 'neutral' : cfg.hyps.length === 1 && this.hypActs[cfg.hyps[0]] ? cfg.hyps[0] : 'global'; }
    /** peinture de régions (p. ex. résection proposée) : Map(région → [r, g, b, part 0–1]) ; affichée par les vues dont
     *  cfg.paint = key, à la place de l'activation */
    setPaint(key, map) { this.paints = this.paints || {}; if (map) this.paints[key] = map; else delete this.paints[key]; const c = this._colorCache['paint:' + key]; if (c) c.dirty = true; if (this.mode === 'canvas') this._draw(); }
    /** couleur d'une région pour une source : { c: [r,g,b], f: mélange 0–1 } */
    _regionMix(src, act, r) {
      if (!r) return null;
      if (src.startsWith('paint:')) {
        const P = this.paints[src.slice(6)]; if (!P) return null;
        if (P.vertex) { const w = P.sub && P.sub.get(r); return w > 0.02 ? { c: (P.subc && P.subc.get(r)) || heatColor(w), f: Math.min(1, 0.3 + w) } : null; }
        const p = P.get(r); return p ? { c: p, f: p[3] == null ? 0.85 : p[3] } : null;
      }
      const v = act[r] || 0, f = mixF(v); return f > 0 ? { c: rampColor(v), f } : null;
    }
    actOf(key) { if (key === 'neutral' || key.startsWith('paint:')) return this._zeroAct || (this._zeroAct = new Float32Array(this.N || (this.activation ? this.activation.length : 200))); return key === 'global' ? this.activation : (this.hypActs[key] || this.activation); }
    shownLayers(cfg) { return cfg.hyps.length ? cfg.hyps.filter(k => this.layers.has(k)) : ['global']; }
    /** applique la configuration d'une cellule à la scène partagée (juste avant son rendu ou un picking) */
    _applyCfg(cfg) {
      const vis = { L: cfg.hemi !== 'R', R: cfg.hemi !== 'L' }, a = cfg.inflate, src = this.sourceOf(cfg), act = this.actOf(src), cols = this._colorsFor(src);
      // imagerie de source : dipôles et scalp seulement dans la cellule qui montre la carte (jamais ailleurs, ni dans les captures)
      if (this.dipGroup) this.dipGroup.visible = src === 'paint:esi'; if (this.scalpGroup) this.scalpGroup.visible = src === 'paint:esi' || !!(this.scalp && this.scalp.free);
      for (const h of ['lh', 'rh']) {
        const m = this.hemiMesh[h], on = vis[h === 'lh' ? 'L' : 'R'];
        if (m.userData.morph !== a) { const M = this._morph(h, a); m.geometry.setAttribute('position', M.posAttr); m.geometry.setAttribute('normal', M.nrmAttr); m.userData.morph = a; this.borderLines[h].geometry.setAttribute('position', M.borderAttr); }
        if (m.userData.colorSrc !== src) { m.geometry.setAttribute('color', cols[h]); m.userData.colorSrc = src; }
        m.visible = on; m.material.opacity = cfg.opacity; m.material.depthWrite = cfg.opacity >= 0.9;
        const front = !!cfg.frontGlass && cfg.opacity < 0.9; m.userData.depthMesh.visible = on && front; m.renderOrder = front ? 21 : 2;   // après électrodes (5–6) : elles restent vues à travers la couche
        this.borderLines[h].visible = on && cfg.borders && cfg.opacity >= 0.5;
      }
      for (const m of this.subMesh) {
        const r = m.userData.region, fam = this.atlas.region(r).family, sf = cfg.subFilter || 'all';
        const sh = cfg.subHemi || 'both', hm = this.atlas.hemiOf[r];
        const zr = this._zoneOf(cfg, r);   // structure profonde comprise dans une zone (ZE, propagation) : colorée, vue à travers
        if (zr) { m.visible = !!vis[hm]; m.material.opacity = zr.opacity; m.material.depthWrite = false; m.material.depthTest = false; m.renderOrder = 4; m.material.color.setStyle(`rgb(${zr.color.join(',')})`); m.material.emissive.copy(m.material.color).multiplyScalar(0.35); const mp0 = this.map[m.userData.h], sx0 = 1 + a * (mp0.S[0] - 1), sy0 = 1 + a * (mp0.S[1] - 1), sz0 = 1 + a * (mp0.S[2] - 1); m.scale.set(sx0, sy0, sz0); m.position.set(mp0.cP[0] - sx0 * mp0.cP[0] + a * mp0.t[0], mp0.cP[1] - sy0 * mp0.cP[1] + a * mp0.t[1], mp0.cP[2] - sz0 * mp0.cP[2] + a * mp0.t[2]); continue; }
        if (!m.material.depthTest) { m.material.depthTest = true; m.renderOrder = 1; m.material.emissive.setRGB(0, 0, 0); }
        m.visible = cfg.sub && vis[hm] && (sh === 'both' || sh === hm) && (!cfg.subFams || cfg.subFams.includes(fam)) && (sf === 'all' || (sf === 'noCb' ? fam !== 'Cerebellar-cortex' : MTL.has(fam))); if (!m.visible) continue;
        const so = cfg.subOpacity == null ? 0.95 : cfg.subOpacity; m.material.opacity = so; m.material.depthWrite = so >= 0.9;
        const mp = this.map[m.userData.h], sx = 1 + a * (mp.S[0] - 1), sy = 1 + a * (mp.S[1] - 1), sz = 1 + a * (mp.S[2] - 1);
        m.scale.set(sx, sy, sz); m.position.set(mp.cP[0] - sx * mp.cP[0] + a * mp.t[0], mp.cP[1] - sy * mp.cP[1] + a * mp.t[1], mp.cP[2] - sz * mp.cP[2] + a * mp.t[2]);
        const mx = this._regionMix(src, act, r), f = mx ? mx.f : 0, b = m.userData.base, c = mx ? mx.c : b;
        m.material.color.setRGB((b[0] + (c[0] - b[0]) * f) / 255, (b[1] + (c[1] - b[1]) * f) / 255, (b[2] + (c[2] - b[2]) * f) / 255);
        if (r === this.highlight) m.material.emissive.setRGB(0.25, 0.3, 0.35); else m.material.emissive.setRGB(0, 0, 0);
      }
      const shown = new Set(this.shownLayers(cfg));
      for (const [key, L] of this.layers) {
        const on = shown.has(key); if (on) this._layerLevel(L, a);
        if (L.lines) L.lines.visible = on && cfg.fibers;
        if (L.sync) L.sync.visible = on && cfg.sync;
        for (const [r, m] of L.nodes) { m.visible = on && cfg.nodes && !!m.userData.on; const h = L.halos && L.halos.get(r); if (h) h.visible = m.visible; }
      }
      this.elecGroup.visible = cfg.electrodes;
      if (this.roiGroup) this.roiGroup.visible = a < 0.05 && cfg.rois !== false;
      if (this.ghostGroup) this.ghostGroup.visible = a < 0.05 && !!cfg.electrodes;
      if (this._probe) this._probe.visible = !!this._probeOn && cfg.probe !== false;
      if (this.roiGroup) this.roiGroup.visible = cfg.rois !== false;   // ROI annotées : masquées dans les vues d'hypothèses, de synthèse, de décision
      this._applyZones(cfg, a, vis);
      if (cfg.electrodes && this.elecObjs) {
        if (this.elecLevel !== a) this._placeElectrodes(a);
        const ef = cfg.elecHemi || 'both';
        for (const o of this.elecObjs) {
          const on = (ef === 'both' || o.e.hemi === ef) && (!this.elecFilter || this.elecFilter.has(o.e.id)); o.shaft.visible = on; for (const { mesh } of o.contacts) mesh.visible = on; if (!on) continue;
          for (const { mesh, c } of o.contacts) {
          const r = c.label >= 1 && c.label <= 162 ? c.label : 0, v = r ? (act[r] || 0) : 0, f = mixF(v), col = f > 0 ? rampColor(v) : null, light = this.elecStyle === 'light-bg';
          if (this.contactHL.size && this.contactHL.has(o.e.id + ':' + c.k)) { mesh.material.color.setRGB(1, 1, 1); mesh.material.emissive.setRGB(0.55, 0.55, 0.55); continue; }   // plots sélectionnés (paire bipolaire) : blancs, comme le halo de la sélection active
          if (r) { const b = light ? [70, 78, 92] : [150, 158, 170]; mesh.material.color.setRGB((b[0] + ((col ? col[0] : b[0]) - b[0]) * f) / 255, (b[1] + ((col ? col[1] : b[1]) - b[1]) * f) / 255, (b[2] + ((col ? col[2] : b[2]) - b[2]) * f) / 255); mesh.material.emissive.setRGB(f * 0.45 * (col ? col[0] : 0) / 255, f * 0.45 * (col ? col[1] : 0) / 255, f * 0.45 * (col ? col[2] : 0) / 255); }
          else { if (light) mesh.material.color.setRGB(0.2, 0.22, 0.26); else mesh.material.color.setRGB(0.3, 0.32, 0.36); mesh.material.emissive.setRGB(0, 0, 0); }
          }
        }
      }
      // marqueurs SEEG (thermocoagulations, stimulations, quantification) : suivent les plots, filtrés par la configuration
      if (this._applySliceCfg) this._applySliceCfg(cfg);
      if (this.markObjs.length || this.markLinks) {
        if (this.markLevel !== a) this._placeMarkers(a);
        const ef = cfg.elecHemi || 'both';
        // cortex transparent : les marqueurs profonds (dans l'hippocampe, l'amygdale…) restent visibles à travers les structures
        const through = cfg.opacity < 0.6;
        for (const m of this.markObjs) {
          const d = m.userData.m, on = (ef === 'both' || m.userData.hemi === ef) && vis[m.userData.hemi] && (!this.elecFilter || this.elecFilter.has(m.userData.eid)) && (d.kind === 'thermo' ? !!cfg.thermo && (!d.status || !cfg.tcStatus || cfg.tcStatus.includes(d.status)) : d.kind === 'stim' ? !!cfg.stims && (d.set || 'all') === (cfg.stimSet === 'clin' ? 'func' : cfg.stimSet || 'all') : d.kind === 'quant' ? cfg.quant === d.set : true);
          m.visible = on; m.renderOrder = cfg.frontGlass ? 30 : 7; if (m.material.depthTest !== !through) { m.material.depthTest = !through; m.material.needsUpdate = true; }
          if (m.userData.halo) { m.userData.halo.visible = on; m.userData.halo.renderOrder = cfg.frontGlass ? 29 : 6; if (m.userData.halo.material.depthTest !== !through) { m.userData.halo.material.depthTest = !through; m.userData.halo.material.needsUpdate = true; } }
        }
        if (this.markLinks) {   // liens CCEP (case « réseau CCEP ») ; liens d'un réseau de connectivité : avec le jeu affiché dans la vue
          let any = false; const ro = cfg.frontGlass ? 31 : 8;
          this.markLinks.children.forEach(c => { const st = c.userData && c.userData.set, on = !!cfg.electrodes && (st ? cfg.quant === st : !!cfg.ccep); c.visible = on; any = any || on; c.renderOrder = ro + (c.geometry === this._headGeo || c.geometry === this._sphereGeo ? 1 : 0); });
          this.markLinks.visible = any;
        }
      }
    }
    /** marqueurs : [{id, kind:'thermo'|'stim'|'quant', set, eid, ks:[plots], color:[r,g,b], radius, opacity, label, value}] ;
     *  chacun est une sphère placée sur le plot (ou le milieu de la paire) et transportée avec l'électrode au gonflement */
    setMarkers(list) {
      if (this.mode === 'canvas') { this.markers = list || []; this._draw(); return; }
      const THREE = window.THREE, g = this.markGroup;
      for (const m of this.markObjs) { g.remove(m); m.material.dispose(); if (m.userData.halo) { g.remove(m.userData.halo); m.userData.halo.material.dispose(); } } this.markObjs = [];
      const sph = this._sphereGeo || (this._sphereGeo = new THREE.SphereGeometry(1, 14, 10));
      for (const d of list || []) {
        const o = (this.elecObjs || []).find(x => x.e.id === d.eid); if (!o) continue;
        const c = d.color || [255, 80, 80];
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), emissive: new THREE.Color(c[0] / 255 * 0.35, c[1] / 255 * 0.35, c[2] / 255 * 0.35), roughness: 0.45, metalness: 0.05, transparent: true, opacity: d.opacity == null ? 0.9 : d.opacity, depthWrite: (d.opacity == null ? 0.9 : d.opacity) >= 0.9 });
        const m = new THREE.Mesh(sph, mat); m.renderOrder = 7; if (d.ell) m.scale.set(d.ell.b, d.ell.a, d.ell.b); else m.scale.setScalar(d.radius || 2);
        m.userData = { kind: 'marker', m: d, hemi: o.e.hemi, eid: d.eid }; g.add(m); this.markObjs.push(m);   // ellipsoïde (volume de thermocoagulation) : grand axe le long de l'électrode
        if (d.halo) { const h = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false })); h.renderOrder = 6; h.scale.setScalar((d.radius || 2) * 1.35); h.userData = { kind: 'halo' }; g.add(h); m.userData.halo = h; }
      }
      this.markers = list || []; this.markLevel = null; this._placeMarkers(this.cells[this.active] ? this.cells[this.active].cfg.inflate : 0);
    }
    /** liens dirigés entre marqueurs (CCEP : plots stimulés → plots de recueil) : [{from:{eid,ks}, to:{eid,ks}, w (0…1), sel}] ;
     *  arc tubulaire (épaisseur ∝ w) bombé vers l'extérieur, pointe conique au contact d'une petite pastille sur le plot de recueil ;
     *  couleurs selon le fond : bleu nuit sur fond blanc (rapport), cyan sur fond sombre ; lien sélectionné en orange / blanc */
    setMarkerLinks(list) {
      if (this.mode === 'canvas') { this.links = list || []; this._draw(); return; }
      const g = this.markGroup;
      if (this.markLinks) { g.remove(this.markLinks); this.markLinks.traverse(o => { if (o.geometry && o.geometry !== this._sphereGeo && o.geometry !== this._headGeo) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.markLinks = null; }
      this.links = list || []; if (!this.links.length) return;
      this.markLinks = new window.THREE.Group(); this.markLinks.userData.n = 0; g.add(this.markLinks);
      this.markLevel = null;
    }
    _linkColor(l) { const light = this.elecStyle === 'light-bg'; if (l.set && l.color) return l.color; return l.sel ? (light ? [214, 110, 0] : [255, 255, 255]) : (light ? [28, 52, 128] : [120, 220, 255]); }
    _buildLinks(a) {
      const THREE = window.THREE, G = this.markLinks; if (!G) return;
      G.traverse(o => { if (o !== G && o.geometry && o.geometry !== this._sphereGeo && o.geometry !== this._headGeo) o.geometry.dispose(); if (o !== G && o.material) o.material.dispose(); }); G.clear();
      const sph = this._sphereGeo || (this._sphereGeo = new THREE.SphereGeometry(1, 14, 10)), head = this._headGeo || (this._headGeo = new THREE.ConeGeometry(1, 1, 16)), Y = new THREE.Vector3(0, 1, 0);
      const ends = new Map();
      for (const l of this.links) {
        const p = this._markerPoint(l.from.eid, l.from.ks, a), q = this._markerPoint(l.to.eid, l.to.ks, a); if (!p || !q) continue;
        const al = l.alpha == null ? 1 : Math.max(0, Math.min(1, l.alpha)); if (al < 0.03) continue;   // alpha : lien qui apparaît ou s'estompe (réseau animé)
        const c = this._linkColor(l), col = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), w = l.w == null ? 1 : l.w, ud = { set: l.set || null };
        const mat = () => new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.35), roughness: 0.5, metalness: 0, transparent: true, opacity: (l.set ? 0.88 : 0.95) * al, depthTest: false });
        const P = new THREE.Vector3(...p), Q = new THREE.Vector3(...q), L = P.distanceTo(Q) || 1, M = P.clone().add(Q).multiplyScalar(0.5);
        const out = M.clone().sub(this.center); out.y *= 0.3; if (out.lengthSq() < 1e-6) out.set(0, 0, 1); out.normalize();
        const curve = new THREE.QuadraticBezierCurve3(P, M.clone().add(out.multiplyScalar(4 + 0.28 * L)), Q);
        const undir = l.dir === 0, rEnd = 1.5, hl = undir ? 0 : 3.2 + 1.0 * w, pts = curve.getSpacedPoints(40); let k = pts.length - 1; while (!undir && k > 2 && pts[k].distanceTo(Q) < rEnd + hl) k--;
        const body = pts.slice(0, k + 1), rad = l.set ? 0.25 + 0.55 * w : 0.42 + 0.35 * w;
        if (body.length >= 2) { const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(body), Math.max(8, body.length * 2), rad, 8, false), mat()); tube.renderOrder = 8; tube.userData = ud; G.add(tube); }
        if (!undir) { const tipDir = Q.clone().sub(body[body.length - 1]).normalize(), base = body[body.length - 1];
          const cone = new THREE.Mesh(head, mat()); cone.scale.set(rad * 2.6, hl, rad * 2.6); cone.quaternion.setFromUnitVectors(Y, tipDir); cone.position.copy(base.clone().add(tipDir.clone().multiplyScalar(hl / 2))); cone.renderOrder = 9; cone.userData = ud; G.add(cone); }
        if (l.set) continue;
        const key = l.to.eid + ':' + l.to.ks.join('-'); if (!ends.has(key)) ends.set(key, { q: Q, col, sel: l.sel }); else if (l.sel) ends.get(key).sel = true;
      }
      // pastille de recueil (plot où le CCEP est enregistré)
      for (const { q, col } of ends.values()) { const d = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.3), transparent: true, opacity: 0.95, depthTest: false })); d.scale.setScalar(1.25); d.position.copy(q); d.renderOrder = 9; G.add(d); }
    }
    /** ROI annotées sur l'imagerie, dans l'espace de la vue : [{kind: 'sphere'|'arrow', p, r, color}] — sphère creuse (coque
     *  translucide + maillage), flèche venant de l'extérieur du cerveau ; vues à travers le cortex ; masquées au gonflement */
    setRois(list) {
      if (this.mode === 'canvas') return;
      const THREE = window.THREE; if (!this.roiGroup) { this.roiGroup = new THREE.Group(); this.root.add(this.roiGroup); }
      const g = this.roiGroup; g.traverse(o => { if (o === g) return; if (o.geometry && o.geometry !== this._sphereGeo && o.geometry !== this._headGeo) o.geometry.dispose(); if (o.material) o.material.dispose(); }); g.clear();
      const sph = this._sphereGeo || (this._sphereGeo = new THREE.SphereGeometry(1, 14, 10)), head = this._headGeo || (this._headGeo = new THREE.ConeGeometry(1, 1, 16)), Y = new THREE.Vector3(0, 1, 0);
      for (const r of list || []) {
        const col = new THREE.Color(r.color || '#ff5ad1'), P = new THREE.Vector3(r.p[0], r.p[1], r.p[2]);
        if (r.kind === 'arrow') {
          const dir = P.clone().sub(this.center || new THREE.Vector3()); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize();
          const L = 24, hl = 6, back = dir.clone().negate(), mat = () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false });
          const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, L - hl, 10), mat()); cyl.quaternion.setFromUnitVectors(Y, back); cyl.position.copy(P.clone().add(dir.clone().multiplyScalar(hl + (L - hl) / 2)));
          const cone = new THREE.Mesh(head, mat()); cone.scale.set(2.4, hl, 2.4); cone.quaternion.setFromUnitVectors(Y, back); cone.position.copy(P.clone().add(dir.clone().multiplyScalar(hl / 2)));
          cyl.renderOrder = 40; cone.renderOrder = 40; g.add(cyl, cone);
        } else {
          const shell = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, depthTest: false, depthWrite: false })); shell.scale.setScalar(r.r || 5); shell.position.copy(P); shell.renderOrder = 40;
          const wire = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.6, depthTest: false })); wire.scale.setScalar(r.r || 5); wire.position.copy(P); wire.renderOrder = 41;
          g.add(shell, wire);
        }
      }
      this.rois = list || [];
    }
    /** v5.3 : dipôles équivalents (imagerie de source) : [{ p, dir (moment), ci: { r: [3], axes: [[3]×3] }, color }] — bille,
     *  flèche du moment (16 mm), ellipsoïde de confiance à 95 % translucide ; vus à travers le cortex */
    setDipoles(list) {
      this.dipoles = list || []; if (this.mode === 'canvas') return;
      const THREE = window.THREE; if (!this.dipGroup) { this.dipGroup = new THREE.Group(); this.root.add(this.dipGroup); }
      const g = this.dipGroup; g.traverse(o => { if (o === g) return; if (o.geometry && o.geometry !== this._sphereGeo && o.geometry !== this._headGeo) o.geometry.dispose(); if (o.material) o.material.dispose(); }); g.clear();
      const sph = this._sphereGeo || (this._sphereGeo = new THREE.SphereGeometry(1, 14, 10)), head = this._headGeo || (this._headGeo = new THREE.ConeGeometry(1, 1, 16)), Y = new THREE.Vector3(0, 1, 0);
      const mat = (col, op, wire) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: false, depthWrite: false, wireframe: !!wire });
      for (const d of this.dipoles) {
        const col = new THREE.Color(d.color || '#ffd60a'), P = new THREE.Vector3(d.p[0], d.p[1], d.p[2]);
        if (d.ball !== false) { const ball = new THREE.Mesh(sph, mat(col, 1)); ball.scale.setScalar(2.6); ball.position.copy(P); ball.renderOrder = 46; g.add(ball); }
        if (d.ball !== false && d.dir && Math.hypot(...d.dir) > 1e-9) {
          const D = new THREE.Vector3(d.dir[0], d.dir[1], d.dir[2]).normalize(), L = 16, hl = 5;
          const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, L - hl, 10), mat(col, 0.95)); cyl.quaternion.setFromUnitVectors(Y, D); cyl.position.copy(P.clone().add(D.clone().multiplyScalar((L - hl) / 2)));
          const cone = new THREE.Mesh(head, mat(col, 0.95)); cone.scale.set(2.2, hl, 2.2); cone.quaternion.setFromUnitVectors(Y, D); cone.position.copy(P.clone().add(D.clone().multiplyScalar(L - hl / 2)));
          cyl.renderOrder = cone.renderOrder = 46; g.add(cyl, cone);
        }
        if (d.ci && d.ci.r) {
          const A = d.ci.axes || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], r = d.ci.r.map(x => Math.max(1, Math.min(60, x))), M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...A[0]).multiplyScalar(r[0]), new THREE.Vector3(...A[1]).multiplyScalar(r[1]), new THREE.Vector3(...A[2]).multiplyScalar(r[2])).setPosition(P);
          for (const [op, wire] of [[0.16, false], [0.4, true]]) { const e = new THREE.Mesh(sph, mat(col, op, wire)); e.matrixAutoUpdate = false; e.matrix.copy(M); e.renderOrder = 45; g.add(e); }
        }
      }
      this._dirty = true;
    }
    /** v5.4 : scalp du modèle de tête et électrodes de l'EEG (imagerie de source) — o = { scalp: { rr, tris }, layers: [{ rr, tris }]
     *  (crâne externe et interne, fil de fer), elecs: [{ name, p, moved, off (exclue du calcul) }], c (centre de la tête), free (montré sans résultat), edit (glisser une électrode
     *  sur le scalp), light } ou null ; this.onScalpMove(name, p) à la fin d'un glisser */
    setScalp(o) {
      this.scalp = o || null; if (this.mode !== 'webgl') return;
      const THREE = window.THREE; if (!this.scalpGroup) { this.scalpGroup = new THREE.Group(); this.root.add(this.scalpGroup); }
      const g = this.scalpGroup; g.traverse(x => { if (x === g) return; if (x.geometry && x.geometry !== this._sphereGeo) x.geometry.dispose(); if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } }); g.clear(); this._scalpElecs = []; this._scalpMesh = null;
      if (!o) { this._dirty = true; return; }
      const light = !!o.light, mk = (S, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(S.rr), 3)); geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(S.tris), 1)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; };
      // scalp : face interne (fond, derrière le cerveau) nette, face externe à peine teintée — le cortex et sa carte restent lisibles
      const skin = mk(o.scalp, new THREE.MeshStandardMaterial({ color: light ? 0xc9b291 : 0xb9a487, transparent: true, opacity: light ? 0.1 : 0.08, depthWrite: false, roughness: 0.9, metalness: 0 })); skin.renderOrder = 24; g.add(skin); this._scalpMesh = skin;
      const back = new THREE.Mesh(skin.geometry, new THREE.MeshStandardMaterial({ color: light ? 0xb8a07e : 0x8c7a62, transparent: true, opacity: light ? 0.35 : 0.3, depthWrite: false, roughness: 0.95, metalness: 0, side: THREE.BackSide })); back.renderOrder = 0; back.frustumCulled = false; g.add(back);
      for (const S of o.layers || []) { const w = mk(S, new THREE.MeshBasicMaterial({ color: light ? 0x19518e : 0x9fb6d8, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false })); w.renderOrder = 23; g.add(w); }
      const sph = this._sphereGeo || (this._sphereGeo = new THREE.SphereGeometry(1, 14, 10)), c = o.c || [this.center.x, this.center.y, this.center.z];
      for (const e of o.elecs || []) {
        const col = e.off ? 0x6b6b6b : e.moved ? 0xf08c2e : light ? 0x19518e : 0xe9dcbc, ball = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.25), roughness: 0.4, metalness: 0.05 }));
        ball.scale.setScalar(3.2); ball.renderOrder = 25; ball.userData = { kind: 'scalpElec', name: e.name }; g.add(ball);
        const cv = document.createElement('canvas'); cv.width = 160; cv.height = 64; const x = cv.getContext('2d'); x.font = '700 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 9; x.lineJoin = 'round'; x.strokeStyle = light ? 'rgba(255,255,255,0.96)' : 'rgba(8,12,20,0.92)'; x.strokeText(e.name, 80, 33); x.fillStyle = e.off ? '#8a8a8a' : e.moved ? '#f08c2e' : light ? '#14233a' : '#f2ead8'; x.fillText(e.name, 80, 33); if (e.off) { const w = x.measureText(e.name).width; x.fillRect(80 - w / 2, 32, w, 4); }
        const tex = new THREE.CanvasTexture(cv), lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); lab.scale.set(22, 8.8, 1); lab.renderOrder = 26; g.add(lab);
        const it = { name: e.name, ball, lab, c }; this._placeScalpElec(it, e.p); this._scalpElecs.push(it);
      }
      this._dirty = true;
    }
    _placeScalpElec(it, p) {
      const u = [p[0] - it.c[0], p[1] - it.c[1], p[2] - it.c[2]], r = Math.hypot(u[0], u[1], u[2]) || 1;
      it.p = p.slice(); it.ball.position.set(p[0], p[1], p[2]); it.lab.position.set(p[0] + u[0] / r * 9, p[1] + u[1] / r * 9, p[2] + u[2] / r * 9); this._dirty = true;
    }
    /** électrodes de scalp de la face cachée (tournées à l'opposé de la caméra) : étiquette masquée, bille estompée */
    _scalpFacing(cam) {
      const P = cam.position, t = Math.tan(cam.fov * Math.PI / 360), q = this._lv2 || (this._lv2 = new window.THREE.Vector3()), shown = [];
      for (const it of this._scalpElecs) { const p = it.p, u = [p[0] - it.c[0], p[1] - it.c[1], p[2] - it.c[2]], v = [p[0] - P.x, p[1] - P.y, p[2] - P.z], d = Math.hypot(v[0], v[1], v[2]) || 1; it.f = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ((Math.hypot(u[0], u[1], u[2]) * d) || 1); it.d = d;
        const m = it.ball.material, back = it.f > 0.55; if (m.transparent !== back) { m.transparent = back; m.opacity = back ? 0.35 : 1; m.needsUpdate = true; } }
      // étiquettes : face cachée masquée ; à l'écran, une étiquette qui en recouvre une plus tournée vers la caméra s'efface
      for (const it of [...this._scalpElecs].sort((a, b) => a.f - b.f)) {
        if (it.f >= 0.4) { it.lab.visible = false; continue; } q.copy(it.lab.position).project(cam); const hh = 4.4 / (it.d * t), hw = hh * 2.5 / cam.aspect;
        it.lab.visible = !shown.some(b => Math.abs(b.x - q.x) < 0.8 * (b.hw + hw) && Math.abs(b.y - q.y) < 0.8 * (b.hh + hh)); if (it.lab.visible) shown.push({ x: q.x, y: q.y, hw, hh });
      }
    }
    /** glisser une électrode de scalp : elle suit le curseur sur la surface du scalp */
    _scalpDown(e, cell, dom) {
      if (!this._scalpIn(cell) || !this.scalp.edit || !this._scalpMesh) return false;
      const THREE = window.THREE, r = cell.el.getBoundingClientRect(), ray = new THREE.Raycaster(), m = new THREE.Vector2();
      const at = ev => { m.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(m, cell.camera); };
      at(e); const hits = ray.intersectObjects(this._scalpElecs.map(x => x.ball), false); if (!hits.length) return false;
      const it = this._scalpElecs.find(x => x.ball === hits[0].object), p0 = it.p.slice(); let p = p0;
      cell.controls.enabled = false; try { dom.setPointerCapture(e.pointerId); } catch (_) { } this.el.classList.add('drag-elec');
      const move = ev => { at(ev); const h = ray.intersectObject(this._scalpMesh, false)[0]; if (!h) return; const q = this.root.worldToLocal(h.point.clone()); p = [q.x, q.y, q.z]; this._placeScalpElec(it, p); };
      const up = () => { dom.removeEventListener('pointermove', move); dom.removeEventListener('pointerup', up); dom.removeEventListener('pointercancel', up); cell.controls.enabled = !this.dragMode; this.el.classList.remove('drag-elec');
        if (Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) > 0.5 && this.onScalpMove) this.onScalpMove(it.name, p); };
      dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
      return true;
    }
    /** calques d'implantation (projet, implantation réelle, autre exploration) : [{ key, color: [r,g,b], list: électrodes }] ;
     *  hampes et plots translucides dans la couleur du calque, vus à travers le cortex, sans sélection ; masqués si gonflé */
    setGhostElectrodes(groups) {
      this.ghostGroups = groups || []; if (this.mode === 'canvas') { this._draw(); return; }
      const THREE = window.THREE; if (!this.ghostGroup) { this.ghostGroup = new THREE.Group(); this.root.add(this.ghostGroup); }
      const g = this.ghostGroup; g.traverse(o => { if (o === g) return; if (o.geometry && o.geometry !== this._sphereGeo && o.geometry !== this._headGeo) o.geometry.dispose(); if (o.material) o.material.dispose(); }); g.clear();
      const sph = this._sphereGeo || (this._sphereGeo = new THREE.SphereGeometry(1, 14, 10)), m4 = new THREE.Matrix4();
      for (const G of this.ghostGroups) {
        const col = new THREE.Color(G.color[0] / 255, G.color[1] / 255, G.color[2] / 255), L = (G.list || []).filter(e => e && e.tip && e.contacts && e.contacts.length); if (!L.length) continue;
        const pts = []; for (const e of L) { const dir = e.dir || [0, 0, 1]; pts.push(...e.tip, e.entry[0] + dir[0] * 12, e.entry[1] + dir[1] * 12, e.entry[2] + dir[2] * 12); }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false })); lines.renderOrder = 35; lines.frustumCulled = false; g.add(lines);
        const n = L.reduce((s, e) => s + e.contacts.length, 0), im = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthTest: false }), n); let k = 0;
        for (const e of L) for (const c of e.contacts) { const p = c.xyz || c; m4.makeScale(0.95, 0.95, 0.95).setPosition(p[0], p[1], p[2]); im.setMatrixAt(k++, m4); }
        im.instanceMatrix.needsUpdate = true; im.renderOrder = 36; im.frustumCulled = false; g.add(im);
      }
      if (this._ghostLabels || this.ghostGroups.some(G => G.labels)) { this._ghostLabels = this.ghostGroups.some(G => G.labels); this._buildLabels(); }
    }
    /** électrodes affichées (ids) ou null pour toutes — p. ex. seulement celles qui portent des cibles de thermocoagulation */
    setElectrodeFilter(ids) { this.elecFilter = ids ? new Set(ids) : null; if (this.mode === 'canvas') this._draw(); else this._buildLabels(); }
    /** zones de régions colorées vues à travers le cortex (zone épileptogène, propagation précoce…) : key → [{regions, color, opacity}] ;
     *  affichées par les vues dont cfg.zones = key ; cortex : faces dont au moins deux sommets sont dans la zone ; profond : structure entière */
    setZones(key, zones) {
      this.zoneSets = this.zoneSets || {}; this._zoneMesh = this._zoneMesh || {};
      if (this._zoneMesh[key]) { for (const m of this._zoneMesh[key].meshes) { this.root.remove(m); m.geometry.dispose(); m.material.dispose(); } delete this._zoneMesh[key]; }
      if (!zones || !zones.length) delete this.zoneSets[key]; else this.zoneSets[key] = zones.map(z => ({ regions: new Set(z.regions), color: z.color, opacity: z.opacity == null ? 0.5 : z.opacity }));
      if (this.mode === 'canvas') this._draw();
    }
    _zoneOf(cfg, r) { const Z = cfg.zones && this.zoneSets && this.zoneSets[cfg.zones]; if (!Z) return null; for (const z of Z) if (z.regions.has(r)) return z; return null; }
    _applyZones(cfg, a, vis) {
      if (this.mode !== 'webgl' || !this._zoneMesh && !this.zoneSets) return; this._zoneMesh = this._zoneMesh || {};
      for (const k in this._zoneMesh) for (const m of this._zoneMesh[k].meshes) m.visible = false;
      const key = cfg.zones, Z = key && this.zoneSets && this.zoneSets[key]; if (!Z) return;
      let E = this._zoneMesh[key];
      if (!E) {
        const THREE = window.THREE; E = this._zoneMesh[key] = { meshes: [], level: -1 };
        for (const h of ['lh', 'rh']) {
          const H = this.atlas.hemis[h], F = H.faces, lab = H.labels;
          for (const z of Z) {
            const idx = []; for (let f = 0; f < F.length; f += 3) { const n = (z.regions.has(lab[F[f]]) ? 1 : 0) + (z.regions.has(lab[F[f + 1]]) ? 1 : 0) + (z.regions.has(lab[F[f + 2]]) ? 1 : 0); if (n >= 2) idx.push(F[f], F[f + 1], F[f + 2]); }
            if (!idx.length) continue;
            const g = new THREE.BufferGeometry(); g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
            const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(`rgb(${z.color.join(',')})`), transparent: true, opacity: z.opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });   // couleur franche (sans éclairage)
            const m = new THREE.Mesh(g, mat); m.renderOrder = 4; m.frustumCulled = false; m.userData = { kind: 'zone', h }; this.root.add(m); E.meshes.push(m);
          }
        }
      }
      if (E.level !== a) { for (const m of E.meshes) { const M = this._morph(m.userData.h, a); m.geometry.setAttribute('position', M.posAttr); m.geometry.setAttribute('normal', M.nrmAttr); } E.level = a; }
      for (const m of E.meshes) m.visible = !!vis[m.userData.h === 'lh' ? 'L' : 'R'];
    }
    /** plots mis en évidence (paire bipolaire sélectionnée) : ['eid:k', …] */
    setContactHighlight(keys) { this.contactHL = new Set(keys || []); if (this.mode === 'canvas') this._draw(); }
    _markerPoint(eid, ks, a) {
      const o = (this.elecObjs || []).find(x => x.e.id === eid); if (!o) return null;
      const g = this.elecGeom(o.e, a), pts = (ks || []).map(k => g.contacts[k - 1]).filter(Boolean); if (!pts.length) return null;
      return [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
    }
    _placeMarkers(a) {
      const Y = window.THREE && new window.THREE.Vector3(0, 1, 0);
      for (const m of this.markObjs) {
        const p = this._markerPoint(m.userData.eid, m.userData.m.ks, a), o = m.userData.m.off; if (p && o) { p[0] += o[0]; p[1] += o[1]; p[2] += o[2]; } if (p) { m.position.set(p[0], p[1], p[2]); if (m.userData.halo) m.userData.halo.position.set(p[0], p[1], p[2]); }
        if (m.userData.m.ell && Y) { const eo = (this.elecObjs || []).find(x => x.e.id === m.userData.eid); if (eo) { const g = this.elecGeom(eo.e, a); m.quaternion.setFromUnitVectors(Y, new window.THREE.Vector3(...g.dir)); } }
      }
      if (this.markLinks) this._buildLinks(a);
      this.markLevel = a;
    }
    /** disposition et réglages de toutes les vues (pour l'enregistrement du cas) */
    layoutState() { return { v: 2, layout: this.layoutName, active: this.active, linked: !!this.linked, cells: this.cells.map(c => Object.assign({}, c.cfg, { hyps: c.cfg.hyps.slice() })) }; }
    restoreLayout(st) {
      if (!st || !st.layout) return;
      // vues enregistrées avant la v2 : le verre « sans le fond » (1re couche seule) devient la transparence par défaut
      this.setLayout(st.layout); (st.cells || []).forEach((cfg, i) => { if (this.cells[i]) this.setCellConfig(i, st.v >= 2 ? cfg : Object.assign({}, cfg, { frontGlass: true }), true); });
      if (st.active != null && this.cells[st.active]) this.setActive(st.active); this.setLinked(!!st.linked);
    }
    /** place hampes et plots au niveau de gonflement a (trajet rectiligne entre entrée transportée et pointe transportée) */
    _placeElectrodes(a) {
      const THREE = window.THREE, Y = new THREE.Vector3(0, 1, 0);
      for (const o of this.elecObjs) {
        const g = this.elecGeom(o.e, a), d = new THREE.Vector3(...g.dir), q = new THREE.Quaternion().setFromUnitVectors(Y, d);
        const tip = new THREE.Vector3(...g.tip), outer = new THREE.Vector3(...g.entry).add(d.clone().multiplyScalar(12)), len = tip.distanceTo(outer), sel = o.e.id === this.selectedElectrode;
        o.shaft.position.copy(tip.clone().add(outer).multiplyScalar(0.5)); o.shaft.quaternion.copy(q); o.shaft.scale.set(sel ? 1.4 : 1, len, sel ? 1.4 : 1);
        o.contacts.forEach(({ mesh }, k) => { mesh.position.set(...g.contacts[k]); mesh.quaternion.copy(q); });
      }
      this.elecLevel = a;
    }

    resize() {
      const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300;
      if (this.mode === 'webgl') this.renderer.setSize(w, h, false);
      else { this.cv.width = w * (window.devicePixelRatio || 1); this.cv.height = h * (window.devicePixelRatio || 1); this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; this._draw(); }
    }

    /** glisser à la souris : null = tourner la vue (OrbitControls) ; 'wl' = contraste / luminosité des coupes IRM,
     *  onDrag(dx, dy, phase ∈ start | move | end) — la vue ne tourne plus tant que le mode est actif */
    setDragMode(mode, onDrag) {
      this.dragMode = mode || null; this._onDrag = onDrag || null;
      for (const c of this.cells) if (c.controls) c.controls.enabled = !this.dragMode;
      this.el.classList.toggle('drag-wl', this.dragMode === 'wl');
    }
    _bindPointer(dom, cell) {
      let down = null, wl = null;
      dom.addEventListener('pointerdown', e => { if (e.button === 0 && (this._handleDown(e, cell, dom) || this._scalpDown(e, cell, dom))) { e.stopImmediatePropagation(); e.preventDefault(); down = null; } }, true);   // poignées d'électrode, électrodes de scalp : avant la rotation de la vue
      dom.addEventListener('pointerdown', e => {
        down = [e.clientX, e.clientY]; const i = this.cells.indexOf(cell); if (i !== this.active) this.setActive(i);
        if (this.dragMode && this._onDrag && e.button === 0) { wl = [e.clientX, e.clientY]; try { dom.setPointerCapture(e.pointerId); } catch (_) { } this._onDrag(0, 0, 'start'); }
      });
      dom.addEventListener('pointermove', e => { if (wl) this._onDrag(e.clientX - wl[0], e.clientY - wl[1], 'move'); });
      dom.addEventListener('pointerup', e => {
        if (wl) { this._onDrag(e.clientX - wl[0], e.clientY - wl[1], 'end'); wl = null; down = null; return; }
        if (!down) return; const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4; down = null;
        if (!moved && e.button === 0) this.onPick(this.pick(e.clientX, e.clientY, cell), 'click', e);
      });
      dom.addEventListener('pointermove', e => { if (!down && !wl) this.onPick(this.pick(e.clientX, e.clientY, cell), 'hover', e); });
      dom.addEventListener('pointerleave', () => this.onPick(0, 'hover', null));
      dom.addEventListener('contextmenu', e => { e.preventDefault(); const n = this.onScalpMenu && this._scalpHit(e, cell); if (n) { e.stopPropagation(); this.onScalpMenu(n, e); } });
    }
    /** scalp et électrodes affichés dans cette cellule */
    _scalpIn(cell) { return !!(this.scalp && this._scalpElecs && this._scalpElecs.length && this.mode === 'webgl' && (this.scalp.free || this.sourceOf(cell.cfg) === 'paint:esi')); }
    /** électrode de scalp sous le curseur (nom) ou null */
    _scalpHit(e, cell) {
      if (!this._scalpIn(cell)) return null;
      const THREE = window.THREE, r = cell.el.getBoundingClientRect(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cell.camera);
      const h = ray.intersectObjects(this._scalpElecs.map(x => x.ball), false)[0]; return h ? h.object.userData.name : null;
    }

    /** région sous le curseur ; this.lastPick = {kind:'surface'|'sub'|'contact'|'electrode', region, point (espace pial), hemi, …} */
    pick(cx, cy, cell) {
      cell = cell || this.cells[this.active]; const r = cell.el.getBoundingClientRect();
      if (this.mode === 'canvas') return this._pickCanvas(cx - r.left, cy - r.top, cell);
      this.mouse.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.mouse, cell.camera);
      this._applyCfg(cell.cfg);
      const objs = [], glass = cell.cfg.opacity < 0.6, seeg = this.pickFilter === 'seeg';
      if (!seeg) {
        for (const h of ['lh', 'rh']) { const m = this.hemiMesh[h]; if (m.visible && !glass) objs.push(m); }
        for (const m of this.subMesh) if (m.visible) objs.push(m);
        if (glass) for (const h of ['lh', 'rh']) { const m = this.hemiMesh[h]; if (m.visible) objs.push(m); }
      }
      if (cell.cfg.electrodes && this.elecObjs) for (const o of this.elecObjs) { if (!o.shaft.visible) continue; objs.push(o.shaft); for (const c of o.contacts) objs.push(c.mesh); }
      for (const m of this.markObjs) if (m.visible) objs.push(m);
      const hits = this.raycaster.intersectObjects(objs, false);
      this.lastPick = null;
      if (!hits.length) return 0;
      const hit = hits[0], ud = hit.object.userData;
      if (ud.kind === 'marker') { this.lastPick = { kind: 'marker', marker: ud.m, eid: ud.eid }; return 0; }
      if (ud.kind === 'contact' || ud.kind === 'electrode') { this.lastPick = { kind: ud.kind, eid: ud.eid, k: ud.k, label: ud.label }; return ud.kind === 'contact' && ud.label >= 1 && ud.label <= 162 ? ud.label : 0; }
      if (ud.kind === 'sub') { this.lastPick = { kind: 'sub', region: ud.region, point: [hit.point.x, hit.point.y, hit.point.z], hemi: this.atlas.hemiOf[ud.region] }; return ud.region; }
      const face = hit.face, labs = ud.labels, counts = {};
      for (const v of [face.a, face.b, face.c]) counts[labs[v]] = (counts[labs[v]] || 0) + 1;
      const region = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      // point d'impact ramené dans l'espace pial (sommet de la face le plus proche)
      const H = this.atlas.hemis[ud.h], pos = hit.object.geometry.attributes.position.array; let bv = face.a, bd = Infinity;
      for (const v of [face.a, face.b, face.c]) { const d = (pos[v * 3] - hit.point.x) ** 2 + (pos[v * 3 + 1] - hit.point.y) ** 2 + (pos[v * 3 + 2] - hit.point.z) ** 2; if (d < bd) { bd = d; bv = v; } }
      this.lastPick = { kind: 'surface', region, vertex: bv, point: [H.pial[bv * 3], H.pial[bv * 3 + 1], H.pial[bv * 3 + 2]], hemi: ud.hemi };
      return region;
    }

    // =====================================================================  activation et couleurs du cortex (par source)
    /** couleurs des sommets pour une source d'activation ('global' ou clé d'hypothèse), recalculées si nécessaire */
    _colorsFor(key) {
      const THREE = window.THREE; let C = this._colorCache[key];
      if (!C) { C = this._colorCache[key] = { dirty: true }; for (const h of ['lh', 'rh']) { const arr = new Float32Array(this.atlas.hemis[h].n * 3); C[h] = this.mode === 'webgl' && THREE ? new THREE.BufferAttribute(arr, 3) : { array: arr }; } }
      if (!C.dirty) return C;
      const a = this.actOf(key), VP = key.startsWith('paint:') && this.paints && this.paints[key.slice(6)] && this.paints[key.slice(6)].vertex ? this.paints[key.slice(6)] : null;
      if (VP) {   // peinture par sommet (cortex échantillonné par un contact) : fond uni modulé par les sillons, chaleur selon le poids
        const base = VP.base || [86, 122, 196];
        for (const h of ['lh', 'rh']) {
          const H = this.atlas.hemis[h], sulc = H.sulc, col = C[h].array, w = VP.vertex[h] && VP.vertex[h].length === H.n ? VP.vertex[h] : null;
          const LY = (VP.layers || []).filter(l => l.vertex[h] && l.vertex[h].length === H.n);   // plusieurs cartes comparées : une teinte chacune, mélangées où elles se recouvrent
          for (let v = 0; v < H.n; v++) {
            const s = (sulc[v] / 127 + 1) / 2, k = 1.12 - 0.42 * s; let x = w ? w[v] : 0, f = x > 0.02 ? Math.min(1, 0.85 + x * 0.3) : 0, c = f ? heatColor(x) : null;
            if (LY.length) { let sw = 0, mx = 0; const q = [0, 0, 0]; for (const l of LY) { const y = l.vertex[h][v]; if (y > 0.02) { sw += y; mx = Math.max(mx, y); for (let i = 0; i < 3; i++) q[i] += l.color[i] * y; } } c = sw ? q.map(z => z / sw) : null; f = sw ? Math.min(1, 0.75 + mx * 0.25) : 0; }
            let R = base[0] * k, G = base[1] * k, B = base[2] * k; if (c) { R += (c[0] - R) * f; G += (c[1] - G) * f; B += (c[2] - B) * f; }
            col[v * 3] = Math.min(255, R) / 255; col[v * 3 + 1] = Math.min(255, G) / 255; col[v * 3 + 2] = Math.min(255, B) / 255;
          }
          if (C[h].isBufferAttribute) C[h].needsUpdate = true;
        }
        C.dirty = false; return C;
      }
      for (const h of ['lh', 'rh']) {
        const H = this.atlas.hemis[h], labs = H.labels, sulc = H.sulc, col = C[h].array;
        for (let v = 0; v < H.n; v++) {
          const s = (sulc[v] / 127 + 1) / 2, r = labs[v];
          let b0 = BASE_GYRUS[0] + (BASE_SULCUS[0] - BASE_GYRUS[0]) * s, b1 = BASE_GYRUS[1] + (BASE_SULCUS[1] - BASE_GYRUS[1]) * s, b2 = BASE_GYRUS[2] + (BASE_SULCUS[2] - BASE_GYRUS[2]) * s;
          if (!r) { b0 = b1 = b2 = 120; }
          const mx = this._regionMix(key, a, r), f = mx ? mx.f : 0, c = mx ? mx.c : null, k = 0.75 + 0.25 * (1 - s);
          let R = c ? b0 + (c[0] * k - b0) * f : b0, G = c ? b1 + (c[1] * k - b1) * f : b1, B = c ? b2 + (c[2] * k - b2) * f : b2;
          if (r === this.highlight) { R = R * 0.5 + 120; G = G * 0.5 + 140; B = B * 0.5 + 140; }
          col[v * 3] = R / 255; col[v * 3 + 1] = G / 255; col[v * 3 + 2] = B / 255;
        }
        if (C[h].isBufferAttribute) C[h].needsUpdate = true;
      }
      C.dirty = false; return C;
    }
    _invalidateColors() { for (const k in this._colorCache) if (k !== 'neutral') this._colorCache[k].dirty = true; }
    /** activation globale (compatibilité) */
    setActivation(a, highlight) { this.setActivations(a, this.hypActs, highlight); }
    /** activation globale + dynamiques conditionnées par hypothèse ({clé: Float32Array}) */
    setActivations(a, hypActs, highlight) {
      this.activation = a; this.hypActs = hypActs || {}; if (highlight !== undefined) this.highlight = highlight;
      this._invalidateColors();
      if (this.mode === 'canvas') this._draw();
    }

    // =====================================================================  couches de réseau
    /** Couche : {edges:[{from,to,t0,t1,strength}], nodes:[{region}], sync:[{a,b,c}], labels:[{region,text,sub,origin}]} ;
     *  color = [r,g,b] (teinte d'hypothèse) ou null (faisceaux neutres cyan → violet). */
    setLayer(key, net, color) {
      const old = this.layers.get(key); if (old) this._disposeLayer(old);
      const L = { key, net: net || { edges: [], nodes: [], sync: [], labels: [] }, color: color || null, nodes: new Map(), fibers: [], levels: new Map(), level: null };
      this.layers.set(key, L);
      if (this.mode === 'webgl') this._buildLayer(L);
      this._hasSync = [...this.layers.values()].some(l => l.net.sync && l.net.sync.length);
      if (this.mode === 'canvas') this._draw(); else { this._buildLabels(); this._animateNetwork(performance.now()); }
    }
    /** poignées de déplacement d'une électrode : h = { eid, tip, entry } (espace de la vue) ou null ; onHandle(eid, kind, {tip, entry})
     *  à la fin du glisser : kind = 'move' (translation dans le plan de la caméra), 'tip' (pointe, entrée fixe), 'entry' (entrée, pointe fixe) */
    setHandles(hd) {
      if (this.mode !== 'webgl') return; const THREE = window.THREE;
      if (!this.handleGroup) {
        const g = this.handleGroup = new THREE.Group(); g.renderOrder = 30; this.root.add(g);
        const mk = (kind, color, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.92 })); m.scale.setScalar(r); m.renderOrder = 31; m.userData = { handle: kind }; g.add(m); return m; };
        this._hTip = mk('tip', 0xffa94d, 2.4); this._hEntry = mk('entry', 0x4cc9f0, 2.4); this._hMid = mk('move', 0xffffff, 2.8);
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this._hLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2, gapSize: 1.5, depthTest: false, transparent: true, opacity: 0.85 })); this._hLine.renderOrder = 30; g.add(this._hLine);
      }
      this._handles = hd ? { eid: hd.eid, tip: hd.tip.slice(), entry: hd.entry.slice() } : null; this.handleGroup.visible = !!hd; this._hLine.visible = false;
      if (hd) this._placeHandles(hd.tip, hd.entry);
      this._dirty = true;
    }
    _placeHandles(tip, entry, line) {
      this._hTip.position.set(tip[0], tip[1], tip[2]); this._hEntry.position.set(entry[0], entry[1], entry[2]); this._hMid.position.set((tip[0] + entry[0]) / 2, (tip[1] + entry[1]) / 2, (tip[2] + entry[2]) / 2);
      if (line) { const a = this._hLine.geometry.attributes.position.array; a.set([tip[0], tip[1], tip[2], entry[0], entry[1], entry[2]]); this._hLine.geometry.attributes.position.needsUpdate = true; this._hLine.computeLineDistances(); this._hLine.visible = true; }
      this._dirty = true;
    }
    _handleDown(e, cell, dom) {
      if (!this._handles || !this.handleGroup || !this.handleGroup.visible || this.mode !== 'webgl') return false;
      const THREE = window.THREE, r = cell.el.getBoundingClientRect(), ray = new THREE.Raycaster(), m = new THREE.Vector2();
      const at = ev => { m.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(m, cell.camera); };
      at(e); const hits = ray.intersectObjects([this._hTip, this._hEntry, this._hMid], false); if (!hits.length) return false;
      const kind = hits[0].object.userData.handle, H = this._handles, p0 = hits[0].object.getWorldPosition(new THREE.Vector3());
      const n = cell.camera.getWorldDirection(new THREE.Vector3()), plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0), q = new THREE.Vector3();
      const tip0 = H.tip.slice(), entry0 = H.entry.slice(); let tip = tip0.slice(), entry = entry0.slice();
      cell.controls.enabled = false; try { dom.setPointerCapture(e.pointerId); } catch (_) { }
      const move = ev => {
        at(ev); if (!ray.ray.intersectPlane(plane, q)) return; const L = this.root.worldToLocal(q.clone()), P0 = this.root.worldToLocal(p0.clone()), d = [L.x - P0.x, L.y - P0.y, L.z - P0.z];
        if (kind === 'move') { tip = tip0.map((v, i) => v + d[i]); entry = entry0.map((v, i) => v + d[i]); } else if (kind === 'tip') tip = [L.x, L.y, L.z]; else entry = [L.x, L.y, L.z];
        this._placeHandles(tip, entry, true);
        // l'électrode suit la poignée pendant le glisser (au plus une reconstruction par image)
        if (this.onHandleDrag && !this._hdRaf) this._hdRaf = requestAnimationFrame(() => { this._hdRaf = 0; this.onHandleDrag(H.eid, kind, { tip: tip.slice(), entry: entry.slice() }, { tip: tip0, entry: entry0 }); });
      };
      const up = () => {
        dom.removeEventListener('pointermove', move); dom.removeEventListener('pointerup', up); dom.removeEventListener('pointercancel', up); cell.controls.enabled = !this.dragMode; if (this._hdRaf) { cancelAnimationFrame(this._hdRaf); this._hdRaf = 0; }
        const moved = Math.hypot(tip[0] - tip0[0], tip[1] - tip0[1], tip[2] - tip0[2]) + Math.hypot(entry[0] - entry0[0], entry[1] - entry0[1], entry[2] - entry0[2]) > 0.5;
        if (moved && this.onHandle) this.onHandle(H.eid, kind, { tip, entry }, { tip: tip0, entry: entry0 }); else this._placeHandles(tip0, entry0);
        this._hLine.visible = false;
      };
      dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
      return true;
    }
    /** libère la visionneuse (vue 3D secondaire : présentation, vue interactive) */
    destroy() {
      this.destroyed = true; if (this._raf) cancelAnimationFrame(this._raf); if (this._ro) this._ro.disconnect();
      for (const c of this.cells) if (c.controls) c.controls.dispose();
      if (this.renderer) { try { this.renderer.dispose(); this.renderer.forceContextLoss(); } catch (e) { } if (this.renderer.domElement) this.renderer.domElement.remove(); }
      this.el.innerHTML = '';
    }
    removeLayer(key) { const L = this.layers.get(key); if (!L) return; this._disposeLayer(L); this.layers.delete(key); if (this.mode === 'canvas') this._draw(); else this._buildLabels(); }
    clearHypLayers() { for (const k of [...this.layers.keys()]) if (k !== 'global') this.removeLayer(k); }
    _disposeLayer(L) {
      if (this.mode !== 'webgl') return;
      for (const o of [L.lines, L.sync, ...L.nodes.values(), ...(L.halos ? L.halos.values() : [])]) { if (!o) continue; this.netGroup.remove(o); if (o.material) o.material.dispose(); }
      if (L.lines) L.lines.geometry.dispose(); if (L.sync) L.sync.geometry.dispose();
    }
    /** compatibilité : la couche globale */
    setNetwork(net) { this.setLayer('global', net, null); }
    setLinks(links) { this.setNetwork({ edges: links || [], nodes: [], sync: [], labels: [] }); }
    _rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    _fiberPoints(a, b, seed, nPts, level) {
      // fibre = courbe de Bézier cubique entre deux centroïdes (transportés au niveau de gonflement), bombée vers l'extérieur, avec un écart aléatoire
      const THREE = window.THREE, rnd = this._rng(seed), ca = this.regionPoint(a, level), cb = this.regionPoint(b, level);
      const jit = m => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(2 * m);
      const p0 = new THREE.Vector3(...ca).add(jit(2.5)), p3 = new THREE.Vector3(...cb).add(jit(2.5)), d = p0.distanceTo(p3);
      const mid = p0.clone().add(p3).multiplyScalar(0.5), out = mid.clone().sub(this.center).normalize().multiplyScalar(8 + 0.22 * d);
      const dir = p3.clone().sub(p0).normalize(), perp = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(dir).normalize().multiplyScalar((3 + 0.1 * d) * (rnd() - 0.5) * 2);
      const c1 = p0.clone().lerp(mid, 0.6).add(out.clone().multiplyScalar(0.9)).add(perp), c2 = p3.clone().lerp(mid, 0.6).add(out.clone().multiplyScalar(0.9)).add(perp.clone().multiplyScalar(0.7));
      return new THREE.CubicBezierCurve3(p0, c1, c2, p3).getPoints(nPts - 1);
    }
    /** positions des faisceaux, nœuds et liens d'une couche au niveau de gonflement a (mises en cache par niveau) */
    _layerGeom(L, a) {
      const k = lvlKey(a); let G = L.levels.get(k); if (G) return G;
      const THREE = window.THREE, NP = 22, segs = []; G = { fibers: [], nodes: new Map(), syncAttr: null };
      L.net.edges.forEach((e, ei) => {
        const ca = this.atlas.region(e.from).centroid, cb = this.atlas.region(e.to).centroid; if (!ca || !cb) return;
        const st = Math.min(1, e.strength || 0.5), nF = e._tier === 'primary' ? 5 + Math.round(4 * st) : e._tier === 'secondary' ? 1 : 2 + Math.round(2 * st);
        for (let f = 0; f < nF; f++) {
          const pts = this._fiberPoints(e.from, e.to, ei * 131 + f * 17 + 7, NP, a), start = segs.length / 3;
          for (let q = 0; q + 1 < pts.length; q++) segs.push(pts[q].x, pts[q].y, pts[q].z, pts[q + 1].x, pts[q + 1].y, pts[q + 1].z);
          G.fibers.push({ edge: e, start, n: pts.length - 1, phase: this._rng(ei * 977 + f)(), tier: e._tier });
        }
      });
      G.linesAttr = new THREE.BufferAttribute(new Float32Array(segs), 3);
      for (const r of L.nodeSet) G.nodes.set(r, this.regionPoint(r, a));
      if (L.net.sync && L.net.sync.length) {
        const pos = []; for (const sl of L.net.sync) { const p = this.regionPoint(sl.a, a), q = this.regionPoint(sl.b, a); if (!p || !q) continue; pos.push(...p, ...q); }
        G.syncAttr = new THREE.BufferAttribute(new Float32Array(pos), 3);
        const ld = new Float32Array(pos.length / 3); for (let i = 0; i < ld.length; i += 2) { ld[i] = 0; ld[i + 1] = Math.hypot(pos[i * 3 + 3] - pos[i * 3], pos[i * 3 + 4] - pos[i * 3 + 1], pos[i * 3 + 5] - pos[i * 3 + 2]); }
        G.syncDist = new THREE.BufferAttribute(ld, 1);
      }
      L.levels.set(k, G); return G;
    }
    _layerLevel(L, a) {
      if (L.level === a) return; const G = this._layerGeom(L, a);
      if (L.lines) { L.lines.geometry.setAttribute('position', G.linesAttr); L.fibers = G.fibers; }
      for (const [r, m] of L.nodes) { const p = G.nodes.get(r); if (p) { m.position.set(...p); const h = L.halos && L.halos.get(r); if (h) h.position.set(...p); } }
      if (L.sync && G.syncAttr) { L.sync.geometry.setAttribute('position', G.syncAttr); L.sync.geometry.setAttribute('lineDistance', G.syncDist); }
      L.level = a;
    }
    /** Hiérarchie d'une couche : importance de chaque nœud (degré pondéré dans le graphe de mise en jeu + pic de plausibilité,
     *  origine d'hypothèse = 1), rangée en trois niveaux — hub (central), impliqué, secondaire — et niveau de chaque lien
     *  (principal : fort ou entre deux hubs ; secondaire : faible). Le rendu suit ces niveaux : hubs plus gros avec halo,
     *  faisceaux denses et lumineux pour les liens principaux, fins et atténués pour les secondaires. */
    _rankLayer(L) {
      const net = L.net, deg = new Map(), peak = new Map();
      net.nodes.forEach(n => peak.set(n.region, n.peak || 0));
      net.edges.forEach(e => { deg.set(e.from, (deg.get(e.from) || 0) + e.strength); deg.set(e.to, (deg.get(e.to) || 0) + e.strength); });
      const maxDeg = Math.max(1e-6, ...deg.values()), origin = (net.labels || []).filter(l => l.origin).map(l => l.region);
      L.imp = new Map(); L.tier = new Map();
      for (const r of L.nodeSet) { let v = 0.6 * (deg.get(r) || 0) / maxDeg + 0.4 * Math.min(1, peak.get(r) || 0); if (origin.includes(r)) v = 1; L.imp.set(r, v); }
      const ranked = [...L.imp.entries()].sort((a, b) => b[1] - a[1]);
      ranked.forEach(([r, v], i) => L.tier.set(r, (v >= 0.55 || (i < 3 && v >= 0.3)) ? 'hub' : v < 0.25 ? 'secondary' : 'mid'));
      net.edges.forEach(e => { const hh = L.tier.get(e.from) === 'hub' && L.tier.get(e.to) === 'hub'; e._tier = (e.strength >= 0.5 || hh) ? 'primary' : e.strength < 0.2 ? 'secondary' : 'mid'; });
      const labelled = new Set((net.labels || []).map(l => l.region));
      L.hubLabels = ranked.filter(([r]) => L.tier.get(r) === 'hub' && !labelled.has(r)).slice(0, 3).map(([r]) => ({ region: r, text: this.atlas.label(r).replace(/ [GD]$/, ''), sub: 'hub', hub: true }));
    }
    _buildLayer(L) {
      const THREE = window.THREE, g = this.netGroup, net = L.net;
      L.nodeSet = new Set(net.nodes.map(n => n.region)); net.edges.forEach(e => { L.nodeSet.add(e.from); L.nodeSet.add(e.to); });
      this._rankLayer(L);
      const G = this._layerGeom(L, 0);
      if (G.linesAttr.count) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', G.linesAttr); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(G.linesAttr.count * 3), 3));
        const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        L.lines = new THREE.LineSegments(geo, mat); L.lines.renderOrder = 3; L.lines.frustumCulled = false; g.add(L.lines); L.fibers = G.fibers;
      }
      const sph = this._sphereGeo || (this._sphereGeo = new THREE.SphereGeometry(1, 14, 10)); L.halos = new Map();
      for (const r of L.nodeSet) {
        const c = G.nodes.get(r); if (!c) continue; const tier = L.tier.get(r);
        const m = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: 0x8fa0b8, emissive: 0x223044, roughness: 0.4, transparent: true, opacity: 0.9 }));
        m.position.set(...c); m.scale.setScalar(1.6); m.renderOrder = 3; m.userData = { region: r, kind: 'node', on: false, layer: L.key, tier, imp: L.imp.get(r) }; g.add(m); L.nodes.set(r, m);
        if (tier === 'hub') {
          // halo doux autour des hubs (sphère plus grande, très transparente, sans écriture de profondeur)
          const h = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
          h.position.set(...c); h.renderOrder = 2; h.userData = { kind: 'halo', region: r }; g.add(h); L.halos.set(r, h);
        }
      }
      if (G.syncAttr) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', G.syncAttr); geo.setAttribute('lineDistance', G.syncDist); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(G.syncAttr.count * 3), 3));
        const mat = new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, dashSize: 2.2, gapSize: 1.6 });
        L.sync = new THREE.LineSegments(geo, mat); L.sync.renderOrder = 3; L.sync.frustumCulled = false; g.add(L.sync);
      }
      L.level = 0;
    }
    _buildLabels() {
      if (this.mode !== 'webgl') return;
      if (!this.labelLayer) { this.labelLayer = document.createElement('div'); this.labelLayer.className = 'sv-labels'; this.el.appendChild(this.labelLayer); }
      this.labelLayer.innerHTML = ''; this.labelEls = [];
      // lignes de rappel (étiquette → nœud) dans un calque SVG sous les étiquettes
      const NS = 'http://www.w3.org/2000/svg'; this.leaderSvg = document.createElementNS(NS, 'svg'); this.leaderSvg.setAttribute('class', 'sv-leaders'); this.labelLayer.appendChild(this.leaderSvg);
      for (const cell of this.cells) {
        if (cell.cfg.netLabels) for (const key of this.shownLayers(cell.cfg)) {
          const L = this.layers.get(key); if (!L) continue;
          for (const lb of [...(L.net.labels || []), ...(cell.cfg.hubLabels ? (L.hubLabels || []) : [])]) {
            const d = document.createElement('div'); d.className = 'sv-label net' + (lb.origin ? ' origin' : '') + (lb.hub ? ' hub' : '') + (L.color ? ' hue' : ''); d.innerHTML = `<b>${lb.text}</b>${lb.sub ? `<small>${lb.sub}</small>` : ''}`;
            const hue = L.color ? `rgb(${L.color.join(',')})` : null; if (hue) d.style.setProperty('--hue', hue);
            const line = document.createElementNS(NS, 'line'); line.setAttribute('class', 'sv-leader' + (lb.hub ? ' hub' : '')); line.setAttribute('stroke', hue || (lb.origin ? '#f2b84b' : 'rgba(255,255,255,0.55)')); this.leaderSvg.appendChild(line);
            this.labelLayer.appendChild(d); this.labelEls.push({ el: d, line, region: lb.region, hemi: this.atlas.hemiOf[lb.region], cell, layer: key, origin: !!lb.origin, hub: !!lb.hub, imp: (L.imp && L.imp.get(lb.region)) || 0 });
          }
        }
        if (cell.cfg.electrodes && cell.cfg.labels) for (const e of this.electrodes || []) {
          if ((cell.cfg.elecHemi || 'both') !== 'both' && e.hemi !== cell.cfg.elecHemi) continue;
          if (this.elecFilter && !this.elecFilter.has(e.id)) continue;
          const d = document.createElement('div'); d.className = 'sv-label elec' + (e.id === this.selectedElectrode ? ' sel' : '') + (e.status === 'red' || e.status === 'orange' ? ' st-' + e.status : ''); d.textContent = e.name;
          this.labelLayer.appendChild(d); this.labelEls.push({ el: d, elec: e, hemi: e.hemi, cell });
        }
        // calques d'électrodes (autre projet, exploration précédente) : nom suivi de l'étiquette du calque, dans sa couleur
        if (cell.cfg.electrodes && cell.cfg.labels) for (const G of this.ghostGroups || []) if (G.labels) for (const e of G.list || []) {
          if (!e || !e.tip || !e.entry) continue; if ((cell.cfg.elecHemi || 'both') !== 'both' && e.hemi !== cell.cfg.elecHemi) continue;
          const d = document.createElement('div'); d.className = 'sv-label elec ghost'; d.textContent = e.name + (G.tag ? ' · ' + G.tag : ''); d.style.setProperty('--gc', `rgb(${G.color.join(',')})`);
          this.labelLayer.appendChild(d); this.labelEls.push({ el: d, elec: e, hemi: e.hemi, cell, ghost: true });
        }
      }
      // taille des boîtes (mesurée une fois), complète et compacte (titre seul, utilisée quand la place manque)
      for (const L of this.labelEls) { L.W = L.el.offsetWidth || 60; L.H = L.el.offsetHeight || 18; }
      for (const L of this.labelEls) if (L.line) L.el.classList.add('compact');
      for (const L of this.labelEls) { L.Wc = L.el.offsetWidth || L.W; L.Hc = L.el.offsetHeight || L.H; L.el.classList.remove('compact'); L.w = L.W; L.h = L.H; L.compact = false; }
      this._updateLabels();
    }
    /** Visibilité d'une étiquette dans une cellule : hémisphère affiché, et pas sur la face cachée (hémisphère éloigné de
     *  la caméra en vue latérale ; entrée d'électrode tournée à l'opposé de la caméra) — toujours pour les électrodes,
     *  seulement si le cortex est opaque pour les étiquettes du réseau. */
    _labelVisible(L, cell, camPos, p, dir) {
      const cfg = cell.cfg;
      if (cfg.hemi !== 'both' && cfg.hemi !== L.hemi) return false;
      if (cfg.opacity < 0.6 && !L.elec) return true;   // cortex en verre : les étiquettes du réseau restent ; celles des électrodes de la face cachée non (v4.10)
      if (cfg.hemi === 'both' && Math.abs(camPos.x - this.center.x) > 0.5 * camPos.distanceTo(this.center)) {
        const far = (camPos.x - this.center.x < 0) ? 'R' : 'L'; if (L.hemi === far) return false;
      }
      if (dir) { const vx = p[0] - camPos.x, vy = p[1] - camPos.y, vz = p[2] - camPos.z, n = Math.hypot(vx, vy, vz) || 1; if ((vx * dir[0] + vy * dir[1] + vz * dir[2]) / n > 0.25) return false; }
      return true;
    }
    _labelPoint(L) {
      const a = L.cell.cfg.inflate;
      if (L.elec) { const g = this.elecGeom(L.elec, a); return { p: [g.entry[0] + g.dir[0] * 14, g.entry[1] + g.dir[1] * 14, g.entry[2] + g.dir[2] * 14], dir: g.dir }; }
      return { p: this.regionPoint(L.region, a), dir: null };
    }
    /** Placement des étiquettes. Électrodes : centrées sur leur ancre (hors du cortex), empilées si proches. Réseau : chaque
     *  étiquette est posée dans la meilleure des cases candidates autour de son nœud (12 directions × 5 écarts), celle qui
     *  recouvre le moins de nœuds, de faisceaux, d'électrodes et d'étiquettes déjà posées, en préférant l'extérieur du réseau
     *  et une faible distance ; une ligne de rappel la relie au nœud. Les étiquettes importantes (origine, hubs) choisissent
     *  en premier ; la case retenue est conservée d'une image à l'autre tant qu'elle reste presque aussi bonne (pas de sauts). */
    _updateLabels() {
      if (!this.labelEls || !this.labelEls.length) return;
      const THREE = window.THREE, v = this._lv || (this._lv = new THREE.Vector3()), base = this.el.getBoundingClientRect();
      const project = (cell, R, p) => { v.set(p[0], p[1], p[2]).project(cell.camera); return [R.x + (v.x + 1) / 2 * R.w, R.y + (1 - v.y) / 2 * R.h, v.z]; };
      const hide = L => { L.el.style.display = 'none'; if (L.line) L.line.style.display = 'none'; };
      // 1. ancres à l'écran
      for (const cell of this.cells) { const r = cell.el.getBoundingClientRect(); cell._R = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }; }
      for (const L of this.labelEls) {
        const { p, dir } = this._labelPoint(L), cell = L.cell, camPos = cell.camera.position;
        L.shown = false;
        if (!p || !this._labelVisible(L, cell, camPos, p, dir)) { hide(L); continue; }
        const R = cell._R, P = project(cell, R, p);
        if (P[2] > 1 || P[0] < R.x || P[0] > R.x + R.w || P[1] < R.y || P[1] > R.y + R.h) { hide(L); continue; }
        L.ax = P[0]; L.ay = P[1]; L.p = p; L.shown = true; L.a = L.elec ? 1 : (this.actOf(L.layer || 'global')[L.region] || 0);
      }
      // 2. placement par cellule
      for (const cell of this.cells) {
        const ls = this.labelEls.filter(L => L.cell === cell && L.shown); if (!ls.length) continue;
        const cfg = cell.cfg, a = cfg.inflate, R = cell._R, cam = cell.camera, tanF = Math.tan(cam.fov * Math.PI / 360);
        // le placement n'est refait que si la caméra, le temps (au ½ s), le gonflement ou l'ensemble des étiquettes a changé
        const me = cam.matrixWorld.elements, sig = `${me[12] | 0},${me[13] | 0},${me[14] | 0},${(me[0] * 100) | 0},${(me[5] * 100) | 0},${(me[10] * 100) | 0}|${Math.round(this.time * 2)}|${a}|${R.w}x${R.h}|${ls.map(L => L.el.textContent).join('')}`;
        const now = performance.now(), cached = cell._labelSig != null && ls.every(L => L.dx != null);
        if (cached && (cell._labelSig === sig || now - cell._labelAt < 90)) { this._applyLabels(ls); continue; }   // pendant un mouvement continu : au plus ~11 placements/s, les boîtes suivent leur ancre entre deux
        cell._labelSig = sig; cell._labelAt = now;
        const pxPerMm = p => (R.h / 2) / (Math.max(1, Math.hypot(p[0] - cam.position.x, p[1] - cam.position.y, p[2] - cam.position.z)) * tanF);
        // obstacles : nœuds allumés (rayon écran), liens (segments entre centroïdes), électrodes (segments pointe → extérieur)
        const nodes = [], segs = [], placed = []; let cx = 0, cy = 0, cn = 0;
        const nets = ls.filter(L => !L.elec);
        if (nets.length) {
          for (const key of this.shownLayers(cfg)) {
            const Ly = this.layers.get(key); if (!Ly) continue; const pts = new Map();
            const pt = r => { if (pts.has(r)) return pts.get(r); const p = this.regionPoint(r, a), q = p ? project(cell, R, p) : null; if (q) q.mm = pxPerMm(p); pts.set(r, q); return q; };
            if (cfg.nodes) for (const [r, m] of Ly.nodes) { if (!m.userData.on) continue; const q = pt(r); if (!q) continue; const tier = m.userData.tier; nodes.push({ x: q[0], y: q[1], r: m.scale.x * q.mm + 2, w: tier === 'hub' ? 1.6 : tier === 'secondary' ? 0.5 : 1, region: r }); cx += q[0]; cy += q[1]; cn++; }
            if (cfg.fibers) for (const e of Ly.net.edges) {
              // faisceau approché par deux segments passant par le milieu bombé de la courbe (cf. _fiberPoints)
              const p = pt(e.from), q = pt(e.to), A = this.regionPoint(e.from, a), B = this.regionPoint(e.to, a); if (!p || !q || !A || !B) continue;
              const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, mz = (A[2] + B[2]) / 2, ox = mx - this.center.x, oy = my - this.center.y, oz = mz - this.center.z, on = Math.hypot(ox, oy, oz) || 1, d = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), bl = 0.67 * (8 + 0.22 * d) / on;
              const m = project(cell, R, [mx + ox * bl, my + oy * bl, mz + oz * bl]), w = e._tier === 'primary' ? 1 : e._tier === 'secondary' ? 0.15 : 0.5;
              segs.push({ x1: p[0], y1: p[1], x2: m[0], y2: m[1], w }, { x1: m[0], y1: m[1], x2: q[0], y2: q[1], w });
            }
          }
          if (cfg.electrodes) for (const o of this.elecObjs || []) {
            if (!o.shaft.visible) continue; const g = this.elecGeom(o.e, a), p = project(cell, R, g.tip), q = project(cell, R, [g.entry[0] + g.dir[0] * 12, g.entry[1] + g.dir[1] * 12, g.entry[2] + g.dir[2] * 12]);
            segs.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1], w: 0.8 });
          }
        }
        const ctr = cn ? [cx / cn, cy / cn] : project(cell, R, [this.center.x, this.center.y, this.center.z]);
        // carte d'occupation de la cellule (grille de G px) : les nœuds y déposent leur poids réparti sur leur disque, les
        // segments un poids par cellule traversée ; l'image intégrale donne ensuite le coût d'une boîte en temps constant
        const G = 8, GW = Math.ceil(R.w / G) + 1, GH = Math.ceil(R.h / G) + 1, occ = new Float32Array(GW * GH);
        const cellOf = (x, y) => [Math.max(0, Math.min(GW - 1, ((x - R.x) / G) | 0)), Math.max(0, Math.min(GH - 1, ((y - R.y) / G) | 0))];
        for (const n of nodes) {
          const [i0, j0] = cellOf(n.x - n.r, n.y - n.r), [i1, j1] = cellOf(n.x + n.r, n.y + n.r), cells = [];
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = R.x + (i + 0.5) * G - n.x, dy = R.y + (j + 0.5) * G - n.y; if (dx * dx + dy * dy <= (n.r + 0.6 * G) ** 2) cells.push(j * GW + i); }
          const val = 2 * n.w / Math.max(1, cells.length); for (const c of cells) occ[c] += val;   // boîte couvrant tout le nœud → 2·w
        }
        for (const s of segs) {
          const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), nst = Math.max(1, Math.ceil(len / (G / 2))), val = 1.2 * s.w * G / 120; let last = -1;
          for (let k = 0; k <= nst; k++) { const t = k / nst, [i, j] = cellOf(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t), c = j * GW + i; if (c !== last) { occ[c] += val; last = c; } }
        }
        const SW = GW + 1, S = new Float32Array(SW * (GH + 1));   // image intégrale
        for (let j = 0; j < GH; j++) { let row = 0; for (let i = 0; i < GW; i++) { row += occ[j * GW + i]; S[(j + 1) * SW + i + 1] = S[j * SW + i + 1] + row; } }
        const occSum = (x, y, w, h) => { const [i0, j0] = cellOf(x, y), [i1, j1] = cellOf(x + w, y + h); return S[(j1 + 1) * SW + i1 + 1] - S[j0 * SW + i1 + 1] - S[(j1 + 1) * SW + i0] + S[j0 * SW + i0]; };
        // étiquettes d'électrodes : centrées sur l'ancre, empilées vers le bas si proches
        const els = ls.filter(L => L.elec).sort((p, q) => p.ay - q.ay); for (const L of els) L.sy = L.ay;
        const grp = els.map((L, i) => i), root = i => grp[i] === i ? i : (grp[i] = root(grp[i]));
        for (let i = 1; i < els.length; i++) for (let j = 0; j < i; j++) if (Math.abs(els[i].ax - els[j].ax) < 46 && els[i].sy - els[j].sy < 22) { els[i].sy = els[j].sy + 22; grp[root(i)] = root(j); }
        // v5.3 : une pile est recentrée sur ses électrodes (moitié au-dessus, moitié au-dessous) au lieu de descendre loin d'elles
        const off = new Map(); els.forEach((L, i) => { const g = root(i), o = off.get(g) || [0, 0]; o[0] += L.sy - L.ay; o[1]++; off.set(g, o); });
        els.forEach((L, i) => { const o = off.get(root(i)); if (o[1] > 1) L.sy -= o[0] / o[1]; });
        // … et, si les entrées sont alignées, rangée en colonne à côté des électrodes, du côté extérieur de la vue
        const cols = new Map(); els.forEach((L, i) => { if (off.get(root(i))[1] > 1) { const g = root(i), c = cols.get(g) || { a0: 1e9, a1: -1e9, w: 0, m: 0, n: 0 }; c.a0 = Math.min(c.a0, L.ax); c.a1 = Math.max(c.a1, L.ax); c.w = Math.max(c.w, L.w); c.m += L.ax; c.n++; cols.set(g, c); } });
        for (const c of cols.values()) { c.dir = c.m / c.n >= R.x + R.w / 2 ? 1 : -1; c.x = c.dir > 0 ? c.a1 + 10 : c.a0 - 10; if (c.n < 3 || c.n * 22 < 3.2 * (c.a1 - c.a0) || (c.dir > 0 ? c.x + c.w > R.x + R.w - 2 : c.x - c.w < R.x + 2)) c.x = null; }   // seulement pour une pile verticale (entrées alignées)
        els.forEach((L, i) => { const c = cols.get(root(i)); L.x = c && c.x != null ? (c.dir > 0 ? c.x : c.x - L.w) : L.ax - L.w / 2; L.y = L.sy - L.h / 2; });
        els.sort((p, q) => p.y - q.y).forEach((L, i) => { for (let j = 0; j < i; j++) { const B = els[j]; if (rectOverlap(B, L.x, L.y, L.w, L.h) > 0) L.y = B.y + B.h + 2; } placed.push({ x: L.x, y: L.y, w: L.w, h: L.h }); });   // aucun chevauchement entre piles
        // étiquettes de réseau : les plus importantes d'abord
        nets.sort((p, q) => ((q.origin ? 2 : 0) + (q.hub ? 1 : 0) + q.imp + q.a) - ((p.origin ? 2 : 0) + (p.hub ? 1 : 0) + p.imp + p.a));
        // coût d'une case pour l'étiquette L, compte tenu des boîtes `others` déjà posées
        const DMAX = LABEL_DIST[LABEL_DIST.length - 1];
        const place = (L, others) => {
          const own = nodes.find(n => n.region === L.region), rn = own ? own.r : 3;
          const ox = L.ax - ctr[0], oy = L.ay - ctr[1], on = Math.hypot(ox, oy) || 1, owx = ox / on, owy = oy / on;
          // seules les boîtes à portée des cases candidates sont testées
          const reach = rn + DMAX + Math.hypot(L.w, L.h) + 4, rx0 = L.ax - reach, rx1 = L.ax + reach, ry0 = L.ay - reach, ry1 = L.ay + reach;
          const oo = others.filter(b => b.x + b.w > rx0 && b.x < rx1 && b.y + b.h > ry0 && b.y < ry1);
          const big = nodes.filter(n => n !== own && n.r > 6 && n.x + n.r > rx0 && n.x - n.r < rx1 && n.y + n.r > ry0 && n.y - n.r < ry1);   // gros nœuds que la ligne de rappel ne doit pas traverser
          // cases candidates, triées par coût de base (distance, direction) ; les coûts d'obstacles étant positifs, la
          // recherche s'arrête dès que le coût de base dépasse le meilleur coût trouvé
          const cl = [];
          for (let di = 0; di < LABEL_DIRS; di++) {
            const ang = di * 2 * Math.PI / LABEL_DIRS, ux = Math.cos(ang), uy = Math.sin(ang), ext = Math.min(L.w / 2 / Math.max(1e-6, Math.abs(ux)), L.h / 2 / Math.max(1e-6, Math.abs(uy)));
            LABEL_DIST.forEach((d0, k) => { const d = rn + d0; cl.push({ id: di * LABEL_DIST.length + k, d0, x: L.ax + ux * (d + ext) - L.w / 2, y: L.ay + uy * (d + ext) - L.h / 2, base: 0.012 * d0 + 0.6 * (1 - (ux * owx + uy * owy)) + 0.12 * Math.abs(uy) }); });   // près, vers l'extérieur, plutôt à côté qu'au-dessus
          }
          const cost = k => {
            const { x, y, d0 } = k; let c = k.base;
            if (x < R.x + 2 || y < R.y + 2 || x + L.w > R.x + R.w - 2 || y + L.h > R.y + R.h - 2) c += 50;   // hors de la vue : dernier recours
            c += occSum(x, y, L.w, L.h);                                                                       // nœuds, faisceaux, électrodes recouverts
            for (const b of oo) { const f = rectOverlap(b, x, y, L.w, L.h); if (f) c += 2.5 + 6 * f; }   // jamais sur une autre étiquette
            if (d0 > LABEL_DIST[0]) {   // la ligne de rappel ne doit pas traverser une autre étiquette ni un gros nœud
              const [ex, ey] = edgePoint({ x, y, w: L.w, h: L.h }, L.ax, L.ay), ld = { x1: L.ax, y1: L.ay, x2: ex, y2: ey };
              for (const b of oo) if (segOverlap(ld, b.x, b.y, b.w, b.h)) c += 2.5;
              for (const n of big) if (segOverlap(ld, n.x - n.r, n.y - n.r, 2 * n.r, 2 * n.r)) c += 0.8 * n.w;
            }
            k.c = c; return c;
          };
          const prev = L.ci != null ? cl.find(k => k.id === L.ci) : null; if (prev) cost(prev);
          cl.sort((p, q) => p.base - q.base);
          let best = null; for (const k of cl) { if (best && k.base >= best.c) break; cost(k); if (!best || k.c < best.c) best = k; }
          const pick = prev && prev.c <= best.c + 0.35 ? prev : best;   // hystérésis : on garde la case précédente tant qu'elle reste presque aussi bonne
          L.ci = pick.id; L.x = pick.x; L.y = pick.y; L.box = { x: L.x, y: L.y, w: L.w, h: L.h, L }; L.cost = pick.c;
        };
        // première passe dans l'ordre d'importance, puis, s'il reste des chevauchements, une passe de correction où chaque
        // étiquette revoit sa case en connaissant toutes les autres
        const clashing = () => nets.filter(L => placed.some(b => b !== L.box && rectOverlap(b, L.x, L.y, L.w, L.h) > 0.02));
        const replace = L => { const others = placed.filter(b => b.L !== L), i = placed.indexOf(L.box); place(L, others); placed[i] = L.box; };
        for (const L of nets) { if (L.compact) { L.compact = false; L.w = L.W; L.h = L.H; } place(L, placed); placed.push(L.box); }
        if (clashing().length) nets.forEach(replace);
        // dernier recours : les étiquettes encore en conflit passent en version compacte (titre seul) et sont replacées
        for (const L of clashing()) { if (L.W === L.Wc && L.H === L.Hc) continue; L.compact = true; L.w = L.Wc; L.h = L.Hc; replace(L); }
        for (const L of ls) { L.dx = L.x - L.ax; L.dy = L.y - L.ay; }
        this._applyLabels(ls);
      }
    }
    /** applique les positions calculées (boîte solidaire de son ancre entre deux placements) */
    _applyLabels(ls) {
      for (const L of ls) {
        const op = 0.35 + 0.65 * Math.min(1, L.a / 0.6), R = L.cell._R; L.x = L.ax + L.dx; L.y = L.ay + L.dy;
        if (R && (L.x + L.w < R.x || L.x > R.x + R.w || L.y + L.h < R.y || L.y > R.y + R.h)) { L.shown = false; L.el.style.display = 'none'; if (L.line) L.line.style.display = 'none'; continue; }   // sortie de sa cellule
        if (L.line) L.el.classList.toggle('compact', !!L.compact);
        L.el.style.display = ''; L.el.style.left = L.x + 'px'; L.el.style.top = L.y + 'px'; L.el.style.opacity = op;
        if (L.line) { const [ex, ey] = edgePoint({ x: L.x, y: L.y, w: L.w, h: L.h }, L.ax, L.ay); L.line.style.display = ''; L.line.setAttribute('x1', L.ax); L.line.setAttribute('y1', L.ay); L.line.setAttribute('x2', ex); L.line.setAttribute('y2', ey); L.line.style.opacity = op; }
      }
    }
    setTime(t) {
      this.time = t; if (this.mode === 'canvas') { this._draw(); return; }
      this._animateNetwork(performance.now());
    }
    _animateNetwork(now) {
      const t = this.time; let any = false;
      for (const [key, L] of this.layers) {
        const a = this.actOf(key), hue = L.color;
        // nœuds : taille et couleur selon la plausibilité courante (la visibilité par cellule est appliquée dans _applyCfg)
        for (const [r, m] of L.nodes) {
          const tier = m.userData.tier, imp = m.userData.imp || 0, v = a[r] || 0, f = mixF(v), on = v >= (tier === 'hub' ? 0.12 : tier === 'secondary' ? 0.3 : 0.22);
          m.userData.on = on; if (!on) continue;
          // taille : hubs nettement plus gros, secondaires discrets ; opacité réduite pour les secondaires
          const size = tier === 'hub' ? 2.8 + 3.8 * v + 1.2 * imp : tier === 'secondary' ? 1.1 + 1.4 * v : 1.7 + 2.8 * v;
          m.scale.setScalar(size); m.material.opacity = (tier === 'secondary' ? 0.25 : 0.4) + 0.6 * Math.min(1, v / 0.5);
          const grey = tier === 'secondary' ? 0.5 : 0, sat = tier === 'hub' ? 1 : 0;   // secondaires vers le gris, hubs saturés
          if (hue) { const w = sat ? 0.75 + 0.25 * f : 0.35 + 0.65 * f; let R = (hue[0] * w + 153 * (1 - w)) / 255, G = (hue[1] * w + 153 * (1 - w)) / 255, B = (hue[2] * w + 153 * (1 - w)) / 255; const l = (R + G + B) / 3; m.material.color.setRGB(R + (l - R) * grey, G + (l - G) * grey, B + (l - B) * grey); const em = sat ? 0.7 * Math.max(f, 0.4) : 0.55 * f * (1 - grey); m.material.emissive.setRGB(em * hue[0] / 255, em * hue[1] / 255, em * hue[2] / 255); }
          else { const c = rampColor(sat ? Math.max(v, 0.35) : v); let R = sat ? c[0] / 255 : 0.55 + 0.45 * f * c[0] / 255, G = sat ? c[1] / 255 : 0.6 * (1 - f) + f * c[1] / 255, B = sat ? c[2] / 255 : 0.72 * (1 - f) + f * c[2] / 255; const l = (R + G + B) / 3; m.material.color.setRGB(R + (l - R) * grey, G + (l - G) * grey, B + (l - B) * grey); const em = sat ? 0.45 : 0.5 * f * (1 - grey); m.material.emissive.setRGB(em * c[0] / 255, em * c[1] / 255, em * c[2] / 255); }
          if (r === this.highlight) m.material.emissive.setRGB(0.3, 0.6, 0.8);
          const h = L.halos && L.halos.get(r);
          if (h) { h.scale.setScalar(size * (imp >= 1 ? 2.6 : 2.1)); h.material.opacity = 0.1 + 0.14 * Math.min(1, v / 0.5); if (hue) h.material.color.setRGB(hue[0] / 255, hue[1] / 255, hue[2] / 255); else { const c = rampColor(Math.max(v, 0.3)); h.material.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255); } }
        }
        // fibres : partie allumée, flux, intensité ∝ force × activité de la source ; teinte de la couche ou dégradé neutre
        if (L.lines) {
          const col = L.lines.geometry.attributes.color.array;
          const cA = hue ? hue.map(x => x * 0.8) : ARC_A, cB = hue ? hue.map(x => x + (255 - x) * 0.5) : ARC_B;
          const TIER_MUL = { primary: 1.15, mid: 0.65, secondary: 0.3 }, TIER_GREY = { primary: 0, mid: 0.15, secondary: 0.55 };
          for (const fb of L.fibers) {
            const e = fb.edge, span = Math.max(e.t1 - e.t0, 0.25), p = Math.max(0, Math.min(1, (t - e.t0) / span)), src = a[e.from] || 0, mul = TIER_MUL[fb.tier] || 0.65, grey = TIER_GREY[fb.tier] || 0;
            const amp = mul * (0.25 + 0.75 * Math.min(1, e.strength || 0.5)) * (0.35 + 0.65 * Math.min(1, src / 0.5)), flow = (now / 1400 + fb.phase) % 1;
            for (let k = 0; k < fb.n; k++) {
              const u = k / fb.n, lit = u <= p, i = (fb.start + k * 2) * 3;
              let g = lit ? amp * (0.45 + 0.55 * Math.pow(Math.max(0, Math.cos((u - flow) * Math.PI * 2)), 6)) : (p > 0 ? 0.05 * mul : 0.02 * mul);
              if (lit) any = true;
              let R = cA[0] + (cB[0] - cA[0]) * u, G = cA[1] + (cB[1] - cA[1]) * u, B = cA[2] + (cB[2] - cA[2]) * u; const l = (R + G + B) / 3; R += (l - R) * grey; G += (l - G) * grey; B += (l - B) * grey;
              col[i] = col[i + 3] = R / 255 * g * 0.62; col[i + 1] = col[i + 4] = G / 255 * g * 0.62; col[i + 2] = col[i + 5] = B / 255 * g * 0.62;
            }
          }
          L.lines.geometry.attributes.color.needsUpdate = true;
        }
        // synchronisation : visible quand les deux nœuds sont actifs, pulsation lente
        if (L.sync) {
          const col = L.sync.geometry.attributes.color.array, pulse = 0.5 + 0.5 * Math.sin(now / 350), cs = hue ? hue.map(x => x / 255) : [0.95, 0.98, 1];
          L.net.sync.forEach((sl, k) => { const v = Math.min(a[sl.a] || 0, a[sl.b] || 0), w = Math.min(1, Math.min(L.imp.get(sl.a) || 0, L.imp.get(sl.b) || 0) / 0.45), g = v >= 0.5 ? 0.25 * sl.c * w * (0.6 + 0.4 * pulse) : 0, i = k * 6; col[i] = col[i + 3] = g * cs[0]; col[i + 1] = col[i + 4] = g * cs[1]; col[i + 2] = col[i + 5] = g * cs[2]; });
          L.sync.geometry.attributes.color.needsUpdate = true;
        }
      }
      this._netAnim = any;
      this._updateLabels();
    }

    /** électrodes SEEG : list = objets construits par SV.Electrodes.build ; selectedId = surbrillance */
    setElectrodes(list, selectedId) {
      this.electrodes = list || []; this.selectedElectrode = selectedId;
      if (this.mode === 'canvas') { this._draw(); return; }
      const THREE = window.THREE, g = this.elecGroup, light = this.elecStyle === 'light-bg';
      while (g.children.length) { const c = g.children.pop(); if (c.material) c.material.dispose(); }
      this.elecObjs = [];
      const shaftGeo = this._shaftGeo || (this._shaftGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 10, 1)), contactGeo = this._contactGeo || (this._contactGeo = new THREE.CylinderGeometry(0.95, 0.95, 2, 12, 1));
      for (const e of this.electrodes) {
        const sel = e.id === selectedId;
        const tint = this.elecTint && !sel ? new THREE.Color(this.elecTint[0] / 255, this.elecTint[1] / 255, this.elecTint[2] / 255) : null;   // comparaison de schémas : électrodes principales dans la couleur de leur schéma
        // planification : électrode irréalisable en rouge, à revoir en orange (plan_traj.js)
        const stc = e.status === 'red' ? 0xff4b4b : e.status === 'orange' ? 0xffa53d : null;
        const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshStandardMaterial({ color: stc != null ? stc : tint || (sel ? (light ? 0xd99a12 : 0xffe9a8) : (light ? 0x3a4350 : 0xc3ccd8)), emissive: stc != null && sel ? 0x332200 : 0x000000, roughness: 0.35, metalness: light ? 0.25 : 0.55, transparent: true, opacity: sel ? 1 : 0.95 }));
        shaft.renderOrder = 5; shaft.userData = { kind: 'electrode', eid: e.id, shared: true }; g.add(shaft);
        const contacts = [];
        for (const c of e.contacts) {
          const m = new THREE.Mesh(contactGeo, new THREE.MeshStandardMaterial({ color: 0x555b66, emissive: 0x000000, roughness: 0.3, metalness: light ? 0.2 : 0.6 }));
          m.renderOrder = 6; m.userData = { kind: 'contact', eid: e.id, k: c.k, label: c.label, shared: true }; g.add(m); contacts.push({ mesh: m, c });
        }
        this.elecObjs.push({ e, shaft, contacts });
      }
      this.elecLevel = null; this._placeElectrodes(0);
      if (this.markers && this.markers.length) this.setMarkers(this.markers); if (this.links && this.links.length) this.setMarkerLinks(this.links);
      this._buildLabels();
    }
    /** une électrode redessinée sans tout reconstruire (glisser d'une poignée) : même nombre de plots → positions mises à jour,
     *  sinon reconstruction de la liste ; les noms suivent au plus toutes les 120 ms */
    previewElectrode(e2) {
      const i = (this.electrodes || []).findIndex(x => x.id === e2.id); if (i < 0) return;
      if (this.mode !== 'webgl') { this.electrodes[i] = e2; this._draw(); return; }
      const o = (this.elecObjs || []).find(x => x.e.id === e2.id);
      if (!o || o.contacts.length !== e2.contacts.length) { const L = this.electrodes.slice(); L[i] = e2; this.setElectrodes(L, this.selectedElectrode); return; }
      this.electrodes[i] = e2; o.e = e2; o.contacts.forEach((x, k) => { x.c = e2.contacts[k]; x.mesh.userData.label = e2.contacts[k].label; });
      if (o.shaft && o.shaft.material && (e2.status || o._st)) { const sel = e2.id === this.selectedElectrode, light = this.elecStyle === 'light-bg'; o.shaft.material.color.setHex(e2.status === 'red' ? 0xff4b4b : e2.status === 'orange' ? 0xffa53d : (sel ? (light ? 0xd99a12 : 0xffe9a8) : (light ? 0x3a4350 : 0xc3ccd8))); o._st = e2.status; }
      const a = this.elecLevel || 0; this.elecLevel = null; this._placeElectrodes(a); this._dirty = true;
      const t = performance.now(); if (!this._lblT || t - this._lblT > 120) { this._lblT = t; this._buildLabels(); }
    }
    /** teinte des hampes des électrodes principales ([r,g,b] ou null) */
    setElectrodeTint(c) { const k = c ? c.join(',') : ''; if ((this.elecTint ? this.elecTint.join(',') : '') === k) return; this.elecTint = c || null; this.setElectrodes(this.electrodes, this.selectedElectrode); }
    /** style des électrodes : 'dark-bg' (défaut) ou 'light-bg' (hampes sombres pour un fond blanc) */
    setElectrodeStyle(style) { if (this.elecStyle === style) return; this.elecStyle = style; this.setElectrodes(this.electrodes, this.selectedElectrode); }

    /** v5.3 : recul de la caméra des cellules dont le dessin (cortex, électrodes) touche le bord du rendu, jusqu'à ce qu'il tienne
     *  entier — la forme de la fenêtre (colonne étroite, mosaïque) ne coupe plus les captures. Rend les positions d'origine. */
    _fitForShot() {
      const r = this.renderer, gl = r.getContext(), W = r.domElement.width, H = r.domElement.height, pr = r.getPixelRatio(), px = new Uint8Array(W * H * 4);
      const saved = this.cells.map(c => c.camera.position.clone()), cw = Math.floor(W / pr / this.cols) * pr, ch = Math.floor(H / pr / this.rows) * pr;
      const on = (x, y) => px[(Math.round(y) * W + Math.round(x)) * 4 + 3] > 8;
      for (let it = 0; it < 7; it++) {
        this._renderAll(); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); let moved = false;
        for (const c of this.cells) {
          const x0 = (c.index % this.cols) * cw, y0 = H - (Math.floor(c.index / this.cols) + 1) * ch, m = Math.max(2, Math.round(0.015 * Math.min(cw, ch)));
          let hit = false;
          for (let x = x0; x < x0 + cw - 1 && !hit; x += 2) for (let k = 0; k < m && !hit; k++) hit = on(x, y0 + k) || on(x, y0 + ch - 1 - k);
          for (let y = y0; y < y0 + ch - 1 && !hit; y += 2) for (let k = 0; k < m && !hit; k++) hit = on(x0 + k, y) || on(x0 + cw - 1 - k, y);
          if (hit) { const t = c.controls.target; c.camera.position.sub(t).multiplyScalar(1.13).add(t); moved = true; }
        }
        if (!moved) break;
      }
      return saved;
    }
    /** image de la fenêtre (toutes les cellules), étiquettes incluses.
     *  opts = {labels:true, background:'#fff'|null, scale: facteur de résolution (1 = écran), format:'png'|'jpeg', quality} */
    snapshot(opts) {
      opts = typeof opts === 'boolean' ? { labels: opts } : Object.assign({ labels: true, background: null, scale: 1, format: 'png', quality: 0.9, crop: false, mirror: false }, opts || {});
      // mirror : image retournée gauche-droite (face mésiale présentée dans l'orientation de la face latérale du même hémisphère) ; les étiquettes restent lisibles
      const mime = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
      if (this.mode === 'canvas') return this.cv.toDataURL(mime, opts.quality);
      const r = this.renderer, pr0 = r.getPixelRatio(), w = this.el.clientWidth, h = this.el.clientHeight, scaled = opts.scale && Math.abs(opts.scale - pr0) > 1e-3;
      if (scaled) { r.setPixelRatio(opts.scale); r.setSize(w, h, false); }
      for (const c of this.cells) if (c.camera && c.controls) c.camera.lookAt(c.controls.target);   // vue masquée : caméras orientées sans attendre la boucle de rendu
      const cams = opts.crop ? this._fitForShot() : null;   // v5.3 : capture recadrée → rien de coupé au bord du rendu
      this._renderAll(); this.cells.forEach(c => { c._labelSig = null; }); this._updateLabels();   // placement recalculé pour l'état courant
      const src = r.domElement, light = !!opts.background, bg = opts.background || (mime === 'image/jpeg' ? '#0d1016' : null);
      // recadrage : marge autour du rendu pour que les étiquettes placées au bord de la vue ne soient pas coupées
      const PAD = opts.crop && opts.labels ? Math.round(90 * (opts.scale || 1)) : 0, W0 = src.width, H0 = src.height;
      const cv = document.createElement('canvas'); cv.width = W0 + 2 * PAD; cv.height = H0 + 2 * PAD; const ctx = cv.getContext('2d');
      // boîte englobante du dessin (canal alpha du rendu WebGL, sous-échantillonné) pour recadrer l'image
      let box = null;
      if (opts.crop) {
        const gl = r.getContext(), W = src.width, Hh = src.height, px = new Uint8Array(W * Hh * 4); gl.readPixels(0, 0, W, Hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let x0 = W, y0 = Hh, x1 = -1, y1 = -1;
        for (let y = 0; y < Hh; y += 3) for (let x = 0; x < W; x += 3) { if (px[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 >= 0) box = opts.mirror ? { x0: W - 1 - x1 + PAD, x1: W - 1 - x0 + PAD, y0: Hh - 1 - y1 + PAD, y1: Hh - 1 - y0 + PAD } : { x0: x0 + PAD, x1: x1 + PAD, y0: Hh - 1 - y1 + PAD, y1: Hh - 1 - y0 + PAD };   // readPixels est inversé verticalement
      }
      const boxes = [];
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); }
      if (opts.mirror) { ctx.save(); ctx.translate(PAD + W0, PAD); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0); ctx.restore(); } else ctx.drawImage(src, PAD, PAD);
      // repère d'orientation (D/G, A/P, S/I) aux bords de l'image, d'après la caméra de la vue (miroir compris)
      const orient = c => {
        if (!opts.orient || !this.cells[0] || !this.cells[0].camera) return c;
        const cam = this.cells[0].camera; cam.updateMatrixWorld(); const e = cam.matrixWorld.elements, X = [e[0], e[1], e[2]], Y = [e[4], e[5], e[6]];
        const L = ['D', 'G', 'A', 'P', 'S', 'I'], let1 = v => { const a = v.map(Math.abs), i = a.indexOf(Math.max(...a)); return a[i] < 0.5 ? '' : L[2 * i + (v[i] >= 0 ? 0 : 1)]; };
        let right = let1(X), left = let1(X.map(x => -x)); const top = let1(Y), bottom = let1(Y.map(x => -x)); if (opts.mirror) { const t = right; right = left; left = t; }
        const g = c.getContext('2d'), k = Math.max(1, (opts.scale || 1)), fs = Math.round(13 * k), pad = Math.round(6 * k);
        g.font = `700 ${fs}px "Segoe UI", system-ui, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'center';
        const pill = (t, x, y) => { if (!t) return; const tw = g.measureText(t).width + fs * 0.7, hh = fs * 1.35; g.fillStyle = light ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.55)'; g.fillRect(x - tw / 2, y - hh / 2, tw, hh); g.fillStyle = light ? '#1d2330' : '#e8ecf4'; g.fillText(t, x, y + 0.5); };
        pill(left, pad + fs * 0.7, c.height / 2); pill(right, c.width - pad - fs * 0.7, c.height / 2); pill(top, c.width / 2, pad + fs * 0.7); pill(bottom, c.width / 2, c.height - pad - fs * 0.7);
        return c;
      };
      const done = () => {
        if (scaled) { r.setPixelRatio(pr0); r.setSize(w, h, false); }
        if (cams) { this.cells.forEach((c, i) => c.camera.position.copy(cams[i])); this.cells.forEach(c => { c._labelSig = null; }); this._dirty = true; }
        if (box) {
          for (const b of boxes) { box.x0 = Math.min(box.x0, b.x); box.y0 = Math.min(box.y0, b.y); box.x1 = Math.max(box.x1, b.x + b.w); box.y1 = Math.max(box.y1, b.y + b.h); }
          const m = 28 * (opts.scale || 1), X0 = Math.max(0, Math.floor(box.x0 - m)), Y0 = Math.max(0, Math.floor(box.y0 - m)), X1 = Math.min(cv.width, Math.ceil(box.x1 + m)), Y1 = Math.min(cv.height, Math.ceil(box.y1 + m));
          if (X1 - X0 > 40 && Y1 - Y0 > 40) { const c2 = document.createElement('canvas'); c2.width = X1 - X0; c2.height = Y1 - Y0; const g2 = c2.getContext('2d'); if (bg) { g2.fillStyle = bg; g2.fillRect(0, 0, c2.width, c2.height); } g2.drawImage(cv, X0, Y0, X1 - X0, Y1 - Y0, 0, 0, X1 - X0, Y1 - Y0); return orient(c2).toDataURL(mime, opts.quality); }
        }
        return orient(cv).toDataURL(mime, opts.quality);
      };
      if (!opts.labels || !this.labelEls) return done();
      const k = src.width / (this.el.clientWidth || src.width);
      const fam = (this.labelEls[0] && getComputedStyle(this.labelEls[0].el).fontFamily) || 'system-ui, Segoe UI, sans-serif';   // même police qu'à l'écran
      for (const L of this.labelEls) {
        if (!L.shown) continue;
        const text = L.elec ? L.el.textContent : (L.el.querySelector('b') || L.el).textContent, sub = L.elec || L.compact ? '' : ((L.el.querySelector('small') || {}).textContent || '');
        const hue = L.el.style.getPropertyValue('--hue'), sel = L.el.classList.contains('sel'), origin = L.el.classList.contains('origin');
        const fs = (L.elec ? 12 : 11.5) * k, mainFont = `${L.elec ? '700' : '600'} ${fs}px ${fam}`; ctx.font = mainFont;
        const tw = ctx.measureText(text).width, subFont = `500 ${10 * k}px ${fam}`;
        // sous-titre replié sur plusieurs lignes (comme à l'écran, largeur maximale 200 px)
        const subLines = []; if (sub) { ctx.font = subFont; let cur = ''; for (const wd of sub.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (cur && ctx.measureText(t).width > 200 * k) { subLines.push(cur); cur = wd; } else cur = t; } if (cur) subLines.push(cur); }
        const sw = subLines.reduce((m, s) => Math.max(m, ctx.measureText(s).width), 0); ctx.font = mainFont;
        const w = Math.max(tw, sw) + 12 * k, hgt = (sub ? 15 + 12 * subLines.length : 17) * k;
        // boîte alignée sur la case choisie à l'écran : le bord tourné vers l'ancre reste au même endroit
        let x, y;
        if (L.elec) { x = (L.x + L.w / 2) * k - w / 2; y = (L.y + L.h / 2) * k - hgt / 2; }
        else {
          x = L.x + L.w <= L.ax ? (L.x + L.w) * k - w : L.x >= L.ax ? L.x * k : (L.x + L.w / 2) * k - w / 2;
          y = L.y + L.h <= L.ay ? (L.y + L.h) * k - hgt : L.y >= L.ay ? L.y * k : (L.y + L.h / 2) * k - hgt / 2;
        }
        if (opts.mirror) x = W0 - x - w;   // image retournée : la boîte suit son ancre, le texte reste à l'endroit
        x += PAD; y += PAD; const AX = PAD + (opts.mirror ? W0 - L.ax * k : L.ax * k), AY = PAD + L.ay * k;
        ctx.globalAlpha = L.elec ? 1 : 0.5 + 0.5 * Math.min(1, (L.a || 0) / 0.6);
        const border = hue || (L.elec ? (light ? '#8a6d1f' : 'rgba(255,233,168,0.5)') : origin ? '#f2b84b' : light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)');
        const moved = L.elec && Math.hypot(x + w / 2 - AX, y + hgt / 2 - AY) > 9 * k;   // v5.3 : nom d'électrode décalé par l'empilement → relié à son électrode
        if (L.line || moved) {   // ligne de rappel vers le nœud
          const [ex, ey] = edgePoint({ x, y, w, h: hgt }, AX, AY);
          ctx.strokeStyle = moved ? border : hue || (origin ? '#f2b84b' : light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)'); ctx.lineWidth = 1 * k; ctx.setLineDash(!moved && L.el.classList.contains('hub') ? [3 * k, 2 * k] : []);
          ctx.beginPath(); ctx.moveTo(AX, AY); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
          if (moved) { ctx.fillStyle = border; ctx.beginPath(); ctx.arc(AX, AY, 2 * k, 0, 7); ctx.fill(); }
        }
        ctx.fillStyle = sel ? '#f2b84b' : light ? 'rgba(255,255,255,0.9)' : 'rgba(14,17,22,0.82)';
        ctx.strokeStyle = border; ctx.lineWidth = (hue ? 1.5 : 1) * k;
        ctx.beginPath(); ctx.roundRect(x, y, w, hgt, 6 * k); ctx.fill(); ctx.stroke(); boxes.push({ x, y, w, h: hgt });
        ctx.fillStyle = sel ? '#1a1407' : L.elec ? (light ? '#6b4f00' : '#ffe9a8') : light ? '#1a1d23' : '#e8ecf4'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 6 * k, y + 8.5 * k);
        if (sub) { ctx.font = subFont; ctx.fillStyle = L.el.classList.contains('hub') ? (light ? '#5a6a80' : '#9fb3c8') : (hue || '#f2b84b'); subLines.forEach((s, i) => ctx.fillText(s, x + 6 * k, y + (20 + 12 * i) * k)); }
      }
      ctx.globalAlpha = 1;
      return done();
    }

    // =====================================================================  Canvas 2D (repli)
    _initCanvas() {
      this.cv = document.createElement('canvas'); this.cv.className = 'sv-gl'; this.el.insertBefore(this.cv, this.cellLayer);
      this.ctx = this.cv.getContext('2d');
      this._canvasCenter();
    }
    _canvasCenter() {
      const A = this.atlas; let cx = 0, cy = 0, cz = 0, n = 0;
      for (const h of ['lh', 'rh']) { const p = A.hemis[h].pial; for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; n++; } }
      this.center = { x: cx / n, y: cy / n, z: cz / n };
    }
    _bindCanvasCell(cell) {
      let drag = null;
      cell.el.addEventListener('pointerdown', e => { if (e.button !== 0 || this.dragMode) return; drag = [e.clientX, e.clientY, cell.rot[0], cell.rot[1]]; });
      window.addEventListener('pointermove', e => { if (!drag) return; cell.rot = [Math.max(-90, Math.min(90, drag[2] + (e.clientY - drag[1]) * 0.4)), drag[3] + (e.clientX - drag[0]) * 0.4]; this._drawThrottled(); });
      window.addEventListener('pointerup', () => { if (drag) { drag = null; this._draw(); } });
      cell.el.addEventListener('wheel', e => { e.preventDefault(); cell.zoom *= e.deltaY < 0 ? 1.1 : 0.9; this._drawThrottled(); }, { passive: false });
    }
    _drawThrottled() { if (this._pending) return; this._pending = true; requestAnimationFrame(() => { this._pending = false; this._draw(); }); }
    _project(cell, rect) {
      const [ex, ez] = cell.rot.map(d => d * Math.PI / 180), ce = Math.cos(ex), se = Math.sin(ex), cz = Math.cos(ez), sz = Math.sin(ez);
      const c = this.center, s = Math.min(rect.w, rect.h) / 230 * cell.zoom;
      return (x, y, z) => { x -= c.x; y -= c.y; z -= c.z; const x1 = x * cz - y * sz, y1 = x * sz + y * cz; const y2 = y1 * ce - z * se, z2 = y1 * se + z * ce; return [rect.x + rect.w / 2 + x1 * s, rect.y + rect.h / 2 - z2 * s, y2]; };
    }
    _draw() {
      if (!this.ctx) return; const ctx = this.ctx, W = this.cv.width, H = this.cv.height; ctx.clearRect(0, 0, W, H);
      const dpr = window.devicePixelRatio || 1;
      for (const cell of this.cells) {
        const col = cell.index % this.cols, row = Math.floor(cell.index / this.cols);
        const rect = { x: col * W / this.cols, y: row * H / this.rows, w: W / this.cols, h: H / this.rows };
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
        this._drawCell(cell, rect, dpr); ctx.restore();
      }
    }
    _drawCell(cell, rect, dpr) {
      const ctx = this.ctx, proj = this._project(cell, rect), A = this.atlas, cfg = cell.cfg, lvl = cfg.inflate, src0 = this.sourceOf(cfg), a = this.actOf(src0), tris = [], vis = { L: cfg.hemi !== 'R', R: cfg.hemi !== 'L' };
      cell._proj = proj; cell._rect = rect;
      const addMesh = (pos, faces, colorOf, alpha, xf) => {
        for (let f = 0; f < faces.length; f += 3) {
          const i0 = faces[f] * 3, i1 = faces[f + 1] * 3, i2 = faces[f + 2] * 3;
          const P = i => xf ? xf([pos[i], pos[i + 1], pos[i + 2]]) : [pos[i], pos[i + 1], pos[i + 2]];
          const p0 = proj(...P(i0)), p1 = proj(...P(i1)), p2 = proj(...P(i2));
          const nx = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]); if (nx >= 0) continue;
          const col = colorOf(faces[f]); if (!col) continue;
          tris.push([(p0[2] + p1[2] + p2[2]) / 3, p0, p1, p2, col, alpha]);
        }
      };
      const morphs = {};
      for (const h of ['lh', 'rh']) {
        if (!vis[h === 'lh' ? 'L' : 'R']) continue;
        const Hm = A.hemis[h], M = morphs[h] = this._morph(h, lvl), pos = M.pos, labs = Hm.labels, sulc = Hm.sulc;
        addMesh(pos, Hm.faces, v0 => {
          const r = labs[v0], s = (sulc[v0] / 127 + 1) / 2, mx = this._regionMix(src0, a, r), f = mx ? mx.f : 0, c = mx ? mx.c : null;
          let R = BASE_GYRUS[0] + (BASE_SULCUS[0] - BASE_GYRUS[0]) * s, G = BASE_GYRUS[1] + (BASE_SULCUS[1] - BASE_GYRUS[1]) * s, B = BASE_GYRUS[2] + (BASE_SULCUS[2] - BASE_GYRUS[2]) * s;
          if (c) { R += (c[0] - R) * f; G += (c[1] - G) * f; B += (c[2] - B) * f; }
          if (r === this.highlight) { R = R * 0.5 + 120; G = G * 0.5 + 140; B = B * 0.5 + 140; }
          return [R, G, B];
        }, cfg.opacity, null);
      }
      if (cfg.sub) for (const s of A.subcortical) {
        const fam = A.region(s.index).family, hm = A.hemiOf[s.index], sh = cfg.subHemi || 'both', sf = cfg.subFilter || 'all';
        if (!vis[hm] || (sh !== 'both' && sh !== hm) || (cfg.subFams && !cfg.subFams.includes(fam)) || (sf === 'noCb' && fam === 'Cerebellar-cortex') || (sf === 'mtl' && !MTL.has(fam))) continue;
        const b = SUB_BASE[A.region(s.index).family] || [160, 160, 160], mx = this._regionMix(src0, a, s.index), f = mx ? mx.f : 0, c = mx ? mx.c : b;
        const col = [b[0] + (c[0] - b[0]) * f, b[1] + (c[1] - b[1]) * f, b[2] + (c[2] - b[2]) * f], hemi = A.hemiOf[s.index];
        addMesh(s.vertices, s.faces, () => col, cfg.subOpacity == null ? 1 : cfg.subOpacity, lvl ? p => this.mapDeep(p, lvl, hemi) : null);
      }
      tris.sort((x, y) => y[0] - x[0]);
      for (const [d, p0, p1, p2, c, alpha] of tris) {
        const ex = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
        const area3d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) * Math.hypot(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]) + 1e-6;
        const sh = 0.55 + 0.45 * Math.min(1, Math.abs(ex) / area3d);
        ctx.fillStyle = `rgba(${(c[0] * sh) | 0},${(c[1] * sh) | 0},${(c[2] * sh) | 0},${alpha})`;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath(); ctx.fill();
      }
      if (cfg.borders && cfg.opacity >= 0.5) {
        ctx.strokeStyle = 'rgba(20,24,32,0.55)'; ctx.lineWidth = 1 * dpr; ctx.beginPath();
        for (const h of ['lh', 'rh']) { if (!morphs[h]) continue; const b = morphs[h].border; for (let i = 0; i < b.length; i += 6) { const p = proj(b[i], b[i + 1], b[i + 2]), q = proj(b[i + 3], b[i + 4], b[i + 5]); if (p[2] > 0 && q[2] > 0) continue; ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } }
        ctx.stroke();
      }
      for (const key of this.shownLayers(cfg)) {
        const L = this.layers.get(key); if (!L) continue; const la = this.actOf(key), hue = L.color;
        if (cfg.fibers) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          L.net.edges.forEach((l, ei) => {
            const ca = this.regionPoint(l.from, lvl), cb = this.regionPoint(l.to, lvl); if (!ca || !cb) return;
            const span = Math.max((l.t1 - l.t0) || 1, 0.25), pr = Math.max(0, Math.min(1, (this.time - l.t0) / span)); if (pr <= 0) return;
            const tier = l._tier || 'mid', P0 = proj(...ca), P1 = proj(...cb), rnd = this._rng(ei * 131 + 7), nF = tier === 'primary' ? 4 + Math.round(4 * (l.strength || 0.5)) : tier === 'secondary' ? 1 : 2 + Math.round(2 * (l.strength || 0.5));
            const cc = hue || [ARC_A[0] + (ARC_B[0] - ARC_A[0]) * 0.5, ARC_A[1] + (ARC_B[1] - ARC_A[1]) * 0.5, ARC_A[2]], alpha = (tier === 'primary' ? 0.2 : tier === 'secondary' ? 0.05 : 0.1) + 0.25 * (l.strength || 0.5);
            for (let f = 0; f < nF; f++) {
              const mx = (P0[0] + P1[0]) / 2 + (rnd() - 0.5) * 50 * dpr, my = (P0[1] + P1[1]) / 2 - (14 + rnd() * 30) * dpr;
              ctx.strokeStyle = `rgba(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0},${alpha})`;
              ctx.lineWidth = (tier === 'primary' ? 2 : tier === 'secondary' ? 0.7 : 1.2) * dpr; ctx.beginPath(); ctx.moveTo(P0[0], P0[1]);
              const n = 16; for (let i = 1; i <= Math.round(n * pr); i++) { const u = i / n, x = (1 - u) * (1 - u) * P0[0] + 2 * (1 - u) * u * mx + u * u * P1[0], y = (1 - u) * (1 - u) * P0[1] + 2 * (1 - u) * u * my + u * u * P1[1]; ctx.lineTo(x, y); }
              ctx.stroke();
            }
          });
          ctx.restore();
        }
        if (cfg.nodes) {
          const nodeSet = new Set(L.net.nodes.map(n => n.region)); L.net.edges.forEach(e => { nodeSet.add(e.from); nodeSet.add(e.to); });
          for (const r of nodeSet) {
            const c = this.regionPoint(r, lvl), v = la[r] || 0, tier = (L.tier && L.tier.get(r)) || 'mid'; if (!c || v < (tier === 'hub' ? 0.12 : 0.22)) continue;
            const P = proj(...c), col = hue || rampColor(v), rad = (tier === 'hub' ? 3.5 + 6 * v : tier === 'secondary' ? 1.2 + 1.5 * v : 2 + 3.5 * v) * dpr;
            if (tier === 'hub') { ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},0.18)`; ctx.beginPath(); ctx.arc(P[0], P[1], rad * 2.1, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = tier === 'secondary' ? `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},0.55)` : `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; ctx.beginPath(); ctx.arc(P[0], P[1], rad, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      if (cfg.electrodes) for (const e of this.electrodes || []) {
        if (!vis[e.hemi] || ((cfg.elecHemi || 'both') !== 'both' && e.hemi !== cfg.elecHemi)) continue;
        const g = this.elecGeom(e, lvl);
        const P0 = proj(...g.tip), P1 = proj(g.entry[0] + g.dir[0] * 12, g.entry[1] + g.dir[1] * 12, g.entry[2] + g.dir[2] * 12), sel = e.id === this.selectedElectrode;
        const hidden = cfg.opacity >= 0.6 && P1[2] > proj(this.center.x, this.center.y, this.center.z)[2] + 10;
        ctx.strokeStyle = sel ? '#ffe9a8' : hidden ? 'rgba(185,194,207,0.25)' : '#b9c2cf'; ctx.lineWidth = (sel ? 3 : 2) * dpr; ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(P1[0], P1[1]); ctx.stroke();
        if (hidden) continue;
        e.contacts.forEach((c, k) => { const r = c.label >= 1 && c.label <= 162 ? c.label : 0, v = r ? (a[r] || 0) : 0, col = mixF(v) > 0 ? rampColor(v) : [150, 158, 170]; const P = proj(...g.contacts[k]); ctx.fillStyle = r ? `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})` : '#4c515b'; ctx.beginPath(); ctx.arc(P[0], P[1], 2.2 * dpr, 0, Math.PI * 2); ctx.fill(); });
        if (cfg.labels) { ctx.fillStyle = sel ? '#ffe9a8' : '#dfe5ee'; ctx.font = `${11 * dpr}px sans-serif`; ctx.fillText(e.name, P1[0] + 4 * dpr, P1[1]); }
      }
      // marqueurs SEEG (repli Canvas) : disques sur les plots / milieux de paires
      for (const d of this.markers || []) {
        const e = (this.electrodes || []).find(x => x.id === d.eid); if (!e || !vis[e.hemi] || ((cfg.elecHemi || 'both') !== 'both' && e.hemi !== cfg.elecHemi)) continue;
        if (d.kind === 'thermo' ? !cfg.thermo : d.kind === 'stim' ? !cfg.stims || (d.set || 'all') !== (cfg.stimSet === 'clin' ? 'func' : cfg.stimSet || 'all') : d.kind === 'quant' ? cfg.quant !== d.set : false) continue;
        const g = this.elecGeom(e, lvl), pts = (d.ks || []).map(k => g.contacts[k - 1]).filter(Boolean); if (!pts.length) continue;
        const P = proj(...[0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length + (d.off ? d.off[i] : 0))), c = d.color || [255, 80, 80];
        ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${d.opacity == null ? 0.9 : d.opacity})`; ctx.beginPath(); ctx.arc(P[0], P[1], (d.radius || 2) * 1.6 * dpr, 0, Math.PI * 2); ctx.fill();
      }
      if (cfg.electrodes) for (const l of this.links || []) {
        if (l.set ? cfg.quant !== l.set : !cfg.ccep) continue;
        const pt = s => { const e = (this.electrodes || []).find(x => x.id === s.eid); if (!e) return null; const g = this.elecGeom(e, lvl), pts = (s.ks || []).map(k => g.contacts[k - 1]).filter(Boolean); if (!pts.length) return null; return proj(...[0, 1, 2].map(i => pts.reduce((u, p) => u + p[i], 0) / pts.length)); };
        const P = pt(l.from), Q = pt(l.to); if (!P || !Q) continue; const c = l.color || [120, 220, 255], al = l.alpha == null ? 1 : Math.max(0, Math.min(1, l.alpha)); if (al < 0.03) continue;
        ctx.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(0.9 * al).toFixed(3)})`; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(Q[0], Q[1]); ctx.stroke();
        const ang = Math.atan2(Q[1] - P[1], Q[0] - P[0]), ah = 7 * dpr; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(Q[0], Q[1]); ctx.lineTo(Q[0] - ah * Math.cos(ang - 0.4), Q[1] - ah * Math.sin(ang - 0.4)); ctx.lineTo(Q[0] - ah * Math.cos(ang + 0.4), Q[1] - ah * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
      }
    }
    _pickCanvas(x, y, cell) {
      const rect = cell._rect || { x: 0, y: 0, w: this.cv.width, h: this.cv.height }, proj = cell._proj || this._project(cell, rect), dpr = window.devicePixelRatio || 1;
      x = rect.x + x * dpr; y = rect.y + y * dpr;
      let best = 0, bd = 600;
      for (const r of this.atlas.regions) { if (!r.centroid || (cell.cfg.hemi !== 'both' && r.hemi !== cell.cfg.hemi)) continue; const p = proj(...this.regionPoint(r.index, cell.cfg.inflate)); const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = r.index; } }
      this.lastPick = best ? { kind: 'surface', region: best, point: this.atlas.region(best).centroid.slice(), hemi: this.atlas.hemiOf[best] } : null;
      return best;
    }
  }

  SV.SUB_FAMS = [['Amygdala', 'Amygdale'], ['Hippocampus-anterior', 'Hippocampe antérieur'], ['Hippocampus-posterior', 'Hippocampe postérieur'], ['Thalamus', 'Thalamus'], ['Caudate-nucleus', 'Noyau caudé'], ['Putamen', 'Putamen'], ['Pallidum', 'Pallidum'], ['Nucleus-accumbens', 'Noyau accumbens'], ['Cerebellar-cortex', 'Cervelet']].map(([k, fr]) => ({ k, fr, color: SUB_BASE[k] }));
  /** toute méthode publique marque la vue à redessiner (rendu à la demande) */
  Viewer3D.markDirtyOnCall = proto => { for (const k of Object.getOwnPropertyNames(proto)) { if (k === 'constructor' || k.startsWith('_') || ['pick', 'layoutState', 'cellTitle', 'sourceOf', 'actOf'].includes(k)) continue; const desc = Object.getOwnPropertyDescriptor(proto, k); if (!desc || typeof desc.value !== 'function' || desc.value._dirtyWrap) continue; const f = desc.value; const w = function () { this._dirty = true; return f.apply(this, arguments); }; w._dirtyWrap = true; proto[k] = w; } };
  Viewer3D.markDirtyOnCall(Viewer3D.prototype);
  SV.Viewer3D = Viewer3D; SV.rampColor = rampColor; SV.cssRamp = cssRamp; SV.VIEWS = VIEWS; SV.LAYOUTS = LAYOUTS; SV.CELL_DEFAULTS = CELL_DEFAULTS; SV.DISPLAY_KEYS = DISPLAY_KEYS; SV.HYP_COLORS = HYP_COLORS; SV.heatColor = heatColor;
  SV.hypColor = i => HYP_COLORS[i % HYP_COLORS.length]; SV.hypCss = i => `rgb(${HYP_COLORS[i % HYP_COLORS.length].join(',')})`;
})(window.SV = window.SV || {});
