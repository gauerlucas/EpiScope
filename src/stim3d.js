/* EpiScope — stim3d.js : stimulations et thermocoagulations SEEG, vue 3D en deux temps (réglages gardés par mode).
 *   En haut  : « Contact stimulé » — les deux hémisphères en verre (30 %), structures profondes sans cervelet (30 %),
 *              vue 3/4 antéro-supérieure en plongée du côté de l'électrode, centrée sur la paire choisie.
 *   En bas   : « Cortex stimulé » — cortex opaque, coloré par l'aire échantillonnée par la paire.
 * Estimation de l'aire (à la manière de l'affichage SEEG/ECoG sur le cortex de Brainstorm) : chaque sommet du cortex
 * reçoit l'interpolation de Shepard (poids 1/d²) d'un indicateur valant 1 sur les deux plots stimulés et 0 sur les autres
 * plots, limitée aux plots situés à moins de R mm (8 plus proches) ; une fenêtre douce (1 − d²/R²)² sur la distance au plot
 * stimulé le plus proche évite le disque uniforme quand aucun autre plot n'est voisin. Les structures profondes situées à
 * moins de R mm sont teintées de la même façon. R est réglable (10 mm par défaut ; Brainstorm : 15 mm par défaut, menu
 * « Edit interpolation distance »). C'est une estimation géométrique, pas un modèle du champ électrique.            */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id);
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const TWO = ['stim', 'thermo'];   // modes en deux vues 3D
  /** vue du haut (stimulations comme thermocoagulations) : résultats des stimulations sur la paire choisie (pastilles colorées
   *  par la réponse la plus forte), paire active cerclée d'un halo blanc */
  const CELL0 = { stims: true, stimSet: 'all', thermo: false, probe: true };
  /** thermocoagulations, vue du bas : cortex en verre neutre « sans le fond », volumes des cibles (ellipsoïdes), zones du
   *  Rapport SEEG (zone épileptogène en rouge, propagation précoce en orange, moins translucides), cible active cerclée de blanc */
  const TC_CELL1 = { opacity: 0.3, frontGlass: true, neutral: true, sub: false, paint: null, zones: 'tcZones', probe: true, electrodes: true, thermo: true, stims: false, quant: null, ccep: false, labels: true, borders: false, title: 'Volumes des cibles' };
  const LAYOUT_VER = 3;   // version des réglages gardés : une version plus ancienne reprend les réglages par défaut
  const ZONE_COL = { ez: [230, 30, 45], prop: [255, 125, 20] };
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  /** poids par sommet de l'aire échantillonnée par les plots `stim` parmi tous les plots `all` (rayon R mm) */
  function sampledArea(atlas, stim, all, R) {
    const R2 = R * R, out = { vertex: {}, sub: new Map(), sum: 0, c: [0, 0, 0] };
    if (!stim.length) return out;
    const mid = [0, 1, 2].map(i => stim.reduce((s, p) => s + p[i], 0) / stim.length), ext = Math.sqrt(Math.max(...stim.map(p => d2(p, mid)))) + 2 * R;
    const near = all.filter(c => d2(c.p, mid) <= ext * ext);   // plots candidats (voisins de la paire)
    const lo = [0, 1, 2].map(i => Math.min(...stim.map(p => p[i])) - R), hi = [0, 1, 2].map(i => Math.max(...stim.map(p => p[i])) + R);
    const taper = q => { const t = 1 - q / R2; return t > 0 ? t * t : 0; };
    for (const h of ['lh', 'rh']) {
      const H = atlas.hemis[h], P = H.pial, w = new Float32Array(H.n);
      for (let v = 0; v < H.n; v++) {
        const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
        if (x < lo[0] || x > hi[0] || y < lo[1] || y > hi[1] || z < lo[2] || z > hi[2]) continue;
        const p = [x, y, z]; let dm = Infinity; for (const s of stim) { const q = d2(p, s); if (q < dm) dm = q; }
        if (dm >= R2) continue;
        const nb = []; for (const c of near) { const q = d2(p, c.p); if (q < R2) nb.push([q, c.stim]); }
        nb.sort((a, b) => a[0] - b[0]); let num = 0, den = 0;
        for (let i = 0; i < Math.min(8, nb.length); i++) { const wi = 1 / Math.max(0.25, nb[i][0]); den += wi; if (nb[i][1]) num += wi; }
        const val = den ? num / den * taper(dm) : 0; if (val <= 0.005) continue;
        w[v] = val; out.sum += val; out.c[0] += val * x; out.c[1] += val * y; out.c[2] += val * z;
      }
      out.vertex[h] = w;
    }
    for (const s of atlas.subcortical || []) {
      const V = s.vertices; let dm = Infinity;
      for (let v = 0; v < V.length; v += 3) { const p = [V[v], V[v + 1], V[v + 2]]; for (const st of stim) { const q = d2(p, st); if (q < dm) dm = q; } }
      const t = taper(dm); if (t > 0.02) out.sub.set(s.index, t);
    }
    if (out.sum > 0) out.c = out.c.map(x => x / out.sum); else out.c = null;
    let mx = 0; for (const h of ['lh', 'rh']) for (const x of out.vertex[h]) if (x > mx) mx = x;   // carte relative : le pic vaut 1
    if (mx > 0) for (const h of ['lh', 'rh']) { const w = out.vertex[h]; for (let v = 0; v < w.length; v++) w[v] /= mx; }
    return out;
  }
  /** direction d'où regarder l'aire : parmi des vues candidates (latérale, médiale, inférieure, antérieure, postérieure,
   *  supérieure, 3/4), celle qui en voit le plus — sommets pondérés de face et non masqués (tampon de profondeur grossier
   *  sur la projection du cortex affiché) ; vues médiales et inférieures avec l'hémisphère de l'électrode seul */
  function bestView(viewer, A, side) {
    if (!A.c || !viewer._morph) return null; const lat = side === 'L' ? -1 : 1, own = side === 'L' ? 'lh' : 'rh';
    const C = [[[lat, 0, 0.15], 0, 'latérale'], [[-lat, 0, 0.15], 1, 'médiale'], [[0, 0.1, -1], 1, 'inférieure'], [[0, 1, 0.2], 0, 'antérieure'], [[0, -1, 0.2], 0, 'postérieure'], [[0, 0, 1], 0, 'supérieure'], [[lat * 0.58, 0.58, 0.57], 0, '3/4 antéro-supérieure'], [[lat * 0.7, 0.2, -0.68], 1, 'inféro-latérale'], [[-lat * 0.7, 0.2, -0.68], 1, 'inféro-médiale'], [[-lat * 0.6, 0.6, 0.5], 1, 'médiale antéro-supérieure']].map(([d, m, fr]) => { const L = Math.hypot(...d); return { d: d.map(x => x / L), med: !!m, fr, s: 0 }; });
    const G = 72, M0 = { lh: viewer._morph('lh', 0), rh: viewer._morph('rh', 0) };
    for (const c of C) {
      const d = c.d, up = Math.abs(d[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1], u0 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]], ul = Math.hypot(...u0), u = u0.map(x => x / ul), v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
      const hs = c.med ? [own] : ['lh', 'rh']; let lo = [1e9, 1e9], hi = [-1e9, -1e9];
      for (const h of hs) { const P = M0[h].pos; for (let i = 0; i < P.length; i += 3) { const a = P[i] * u[0] + P[i + 1] * u[1] + P[i + 2] * u[2], b = P[i] * v[0] + P[i + 1] * v[1] + P[i + 2] * v[2]; if (a < lo[0]) lo[0] = a; if (a > hi[0]) hi[0] = a; if (b < lo[1]) lo[1] = b; if (b > hi[1]) hi[1] = b; } }
      const sx = (G - 1) / Math.max(1, hi[0] - lo[0]), sy = (G - 1) / Math.max(1, hi[1] - lo[1]), buf = new Float32Array(G * G).fill(-1e9);
      const cell = (P, i) => [Math.round(((P[i] * u[0] + P[i + 1] * u[1] + P[i + 2] * u[2]) - lo[0]) * sx), Math.round(((P[i] * v[0] + P[i + 1] * v[1] + P[i + 2] * v[2]) - lo[1]) * sy)];
      for (const h of hs) { const P = M0[h].pos, step = Math.max(1, Math.floor(P.length / 3 / 60000)) * 3; for (let i = 0; i < P.length; i += step) { const [x, y] = cell(P, i), z = P[i] * d[0] + P[i + 1] * d[1] + P[i + 2] * d[2]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= G || Y >= G) continue; const k = Y * G + X; if (z > buf[k]) buf[k] = z; } } }
      for (const h of hs) { const w = A.vertex[h]; if (!w) continue; const P = M0[h].pos, N = M0[h].nrm; for (let i = 0; i < w.length; i++) if (w[i] > 0) { const q = N[3 * i] * d[0] + N[3 * i + 1] * d[1] + N[3 * i + 2] * d[2]; if (q <= 0) continue; const [x, y] = cell(P, 3 * i), z = P[3 * i] * d[0] + P[3 * i + 1] * d[1] + P[3 * i + 2] * d[2]; if (z >= buf[y * G + x] - 3) c.s += w[i] * (0.3 + 0.7 * q); } }
    }
    C.sort((a, b) => b.s - a.s); return C[0].s > 0 ? { dir: C[0].d, hemiOnly: C[0].med, fr: 'vue ' + C[0].fr + (side === 'L' ? ' G' : ' D') } : null;
  }

  const M = {
    stim3dSettings() { return this.ui.st3d || (this.ui.st3d = Object.assign({ auto: true, R: 10 }, LS.get('sv_st3d') || {})); },
    stim3dSave() { LS.set('sv_st3d', this.stim3dSettings()); },
    /** entrée dans les stimulations : disposition « stim » (la disposition précédente est rendue à la sortie) */
    /** réglages des deux vues propres à chaque mode (stimulations, thermocoagulations) : gardés en le quittant, repris en y revenant */
    stim3dKeep(mode) { const V3 = this.viewer; if (!V3 || V3.layoutName !== 'stim' || !TWO.includes(mode)) return; const st = Object.assign(V3.layoutState(), { ver: LAYOUT_VER }); (this.ui.twoView = this.ui.twoView || {})[mode] = st; LS.set('sv_2v_' + mode, st); },
    stim3dApply(mode) {
      const V3 = this.viewer, saved = (this.ui.twoView && this.ui.twoView[mode]) || LS.get('sv_2v_' + mode);
      if (saved && saved.layout === 'stim' && Array.isArray(saved.cells) && saved.cells.length === 2 && saved.ver === LAYOUT_VER) V3.restoreLayout(saved);
      else { V3.setLayout('stim'); V3.setCellConfig(0, CELL0, true); if (mode === 'thermo') V3.setCellConfig(1, TC_CELL1, true); }
      const ls = $('layoutSel'); if (ls) ls.value = 'stim'; this._st3dKey = null;
    },
    stim3dEnter(pre) {
      const V3 = this.viewer, st = this.stim3dSettings(); if (!V3 || !st.auto || V3.layoutName === 'stim') return;
      this._preStimLayout = pre || V3.layoutState(); this.stim3dApply(this.ui.wm);
      if (this.refreshMarkers) this.refreshMarkers(); this.stim3dUpdate();
    },
    stim3dLeave(mode) {
      if (mode) this.stim3dKeep(mode);
      const V3 = this.viewer, pre = this._preStimLayout; this._preStimLayout = null; if (!V3) return;
      V3.setPaint('stimCortex', null); V3.setZones('tcZones', null); if (V3.setProbe) V3.setProbe(null); if (V3.layoutName !== 'stim') return;
      if (pre && pre.layout !== 'stim') V3.restoreLayout(pre); else V3.setLayout('single');
      const ls = $('layoutSel'); if (ls) ls.value = V3.layoutName;
    },
    /** recentre les deux vues sur la paire choisie et recalcule l'aire de cortex échantillonnée */
    stim3dUpdate() {
      const V3 = this.viewer, wm = this.ui.wm; if (!V3 || V3.layoutName !== 'stim' || !TWO.includes(wm) || !this.elecs || !this.elecs.length) return;
      const tc = wm === 'thermo', sg = this.ensureSeeg(), e = this.currentElec(tc ? 'thermoElec' : 'stimElec'); if (!e) return;
      const P = tc ? sg.tpair : sg.pair, st = this.stim3dSettings(), pair = P && P.elec === e.name ? [P.c1, P.c2] : null;
      const list = V3.electrodes || [], ve = list.find(x => x.id === e.id) || e, cs = ve.contacts || [];
      const stim = (pair || []).map(k => cs[k - 1] && cs[k - 1].xyz).filter(Boolean);
      const side = (ve.hemi || (ve.tip && ve.tip[0] < 0 ? 'L' : 'R')) === 'L' ? 'L' : 'R', view = side === 'L' ? 'aslL' : 'aslR';
      const lab0 = pair ? `${e.name}${pair[0]}–${e.name}${pair[1]}` : e.name, mid0 = stim.length ? [0, 1, 2].map(i => stim.reduce((s, p) => s + p[i], 0) / stim.length) : (cs.length ? cs[Math.floor(cs.length / 2)].xyz : null);
      if (tc) {   // thermocoagulations : en bas, les zones du Rapport SEEG et les volumes des cibles sur un cortex en verre neutre
        const Z = this.thermoZones(), key0 = 'thermo|' + view + '|' + (mid0 || []).map(x => Math.round(x)).join(',');
        V3.setPaint('stimCortex', null); V3.setZones('tcZones', Z);
        const tl = this.tcSettings ? this.tcSettings().l : 7; if (V3.setProbe) V3.setProbe(pair && mid0 ? mid0 : null, { size: Math.max(12, tl * 1.7) });
        for (const i of [0, 1]) { const c = V3.cells[i]; if (c && c.cfg.view !== view) V3._applyView(c, view, false); }
        V3.setCellConfig(0, { title: 'Résultats des stimulations · ' + lab0 }, true);
        V3.setCellConfig(1, { title: Z.length ? 'Volumes des cibles · zones du rapport SEEG' : 'Volumes des cibles' }, true);
        if (key0 !== this._st3dKey && mid0) {
          this._st3dKey = key0; V3.focusOn(0, mid0, 330);
          // en bas : la cible et les zones dans le même cadre (volumes des cibles visibles)
          const cen = Z.flatMap(z => z.regions).map(r => V3.atlas.region(r) && V3.atlas.region(r).centroid).filter(Boolean);
          if (cen.length) { const zc = [0, 1, 2].map(i => cen.reduce((s0, p) => s0 + p[i], 0) / cen.length), c = [0, 1, 2].map(i => (zc[i] + mid0[i]) / 2), dd = Math.hypot(zc[0] - mid0[0], zc[1] - mid0[1], zc[2] - mid0[2]); V3.focusOn(1, c, Math.max(220, Math.min(430, dd * 2.4 + 150))); }
          else V3.focusOn(1, mid0, 230);
        }
        return;
      }
      const all = []; for (const x of list) for (const c of x.contacts || []) if (c.xyz) all.push({ p: c.xyz, stim: stim.includes(c.xyz) });
      const A = sampledArea(V3.atlas, stim, all, st.R);
      V3.setPaint('stimCortex', { vertex: A.vertex, sub: A.sub });
      const lab = pair ? `${e.name}${pair[0]}–${e.name}${pair[1]}` : e.name;
      const mid = stim.length ? [0, 1, 2].map(i => stim.reduce((s, p) => s + p[i], 0) / stim.length) : (cs.length ? cs[Math.floor(cs.length / 2)].xyz : null);
      const key = wm + '|' + view + '|' + (mid || []).map(x => Math.round(x)).join(',');
      if (V3.setProbe) V3.setProbe(pair && mid ? mid : null, { size: 12 });
      for (const i of [0, 1]) { const c = V3.cells[i]; if (!c) continue; if (c.cfg.view !== view) V3._applyView(c, view, false); }
      const t0 = tc ? 'Cible de thermocoagulation' : 'Contact stimulé', t1 = tc ? 'Cortex au voisinage de la cible' : 'Cortex stimulé';
      V3.setCellConfig(0, { title: t0 + ' · ' + lab }, true);
      V3.setCellConfig(1, { title: t1 + ' · ' + (!pair ? 'choisir une paire' : A.c ? lab + ` (rayon ${st.R} mm)` : `aucun cortex à moins de ${st.R} mm`) }, true);
      if (key !== this._st3dKey && mid) {   // la caméra ne bouge que si la paire (ou le côté) change : l'utilisateur garde la main
        this._st3dKey = key;
        V3.focusOn(0, mid, 330);
        // en bas : l'aire vue de face (normale moyenne), hémisphère de l'électrode seul (face mésiale ou basale dégagée)
        const bv = bestView(V3, A, side);
        V3.setCellConfig(1, { hemi: bv && bv.hemiOnly ? side : 'both', viewFr: bv ? bv.fr : '' }, true);
        V3.focusOn(1, A.c || mid, 175, true, bv ? bv.dir : undefined);
      }
    },
    /** zones de la SEEG ouverte (Rapport SEEG) pour la vue des thermocoagulations */
    thermoZones() {
      const ex = this.workspaceSeeg ? this.workspaceSeeg() : null, R = ex && ex.report || {}, ez = (R.ezRegions || []).filter(r => r > 0), prop = (R.propRegions || []).filter(r => r > 0 && !ez.includes(r)), out = [];
      if (ez.length) out.push({ regions: ez, color: ZONE_COL.ez, opacity: 0.7 }); if (prop.length) out.push({ regions: prop, color: ZONE_COL.prop, opacity: 0.6 });
      return out;
    },
    /** sous le formulaire : rien quand les deux vues sont affichées (leurs réglages sont dans « Affichage ▾ » de la barre de la
     *  3D) ; sinon, un bouton pour les rétablir */
    stim3dControls(box) {
      if (!box || !this.viewer) return; const old = box.querySelector('.st3d'); if (old) old.remove();
      const st = this.stim3dSettings(); if (st.auto && this.viewer.layoutName === 'stim') return;
      const tc = this.ui.wm === 'thermo', el = document.createElement('div'); el.className = 'st3d';
      el.innerHTML = `<button class="mini-btn" id="st3dAuto" title="${tc ? 'en haut : résultats des stimulations ; en bas : volumes des cibles et zones du rapport SEEG' : 'en haut : la paire dans le cerveau en verre ; en bas : le cortex coloré par l’aire échantillonnée par la paire'}">Afficher les deux vues 3D (${tc ? 'stimulations · cibles et zones' : 'contact · cortex stimulé'})</button>`;
      box.appendChild(el);
      el.querySelector('#st3dAuto').onclick = () => { st.auto = true; this.stim3dSave(); this.stim3dEnter(); if (this.refreshMarkers) this.refreshMarkers(); el.remove(); };
    },
  };
  Object.assign(SV.app, M);

  // ---------------------------------------------------------------- greffes
  const A = SV.app, rs0 = A.renderStims, rb0 = A.rebuildElectrodes, ch0 = A.changed;
  // stimulations et thermocoagulations : même disposition en deux vues ; on la garde en passant de l'une à l'autre
  SV.Bus.on('workmode:before', function (mode, prev) {
    const V3 = this.viewer, inP = TWO.includes(prev), inM = TWO.includes(mode);
    this._s3pre = inM && !inP && V3 ? V3.layoutState() : null;
    if (inP && !inM) this.stim3dLeave(prev);
    if (inP && inM && mode !== prev) this.stim3dKeep(prev);
  }, 'stim3d');
  SV.Bus.on('workmode:after', function (mode, prev) {
    const V3 = this.viewer, inP = TWO.includes(prev), inM = TWO.includes(mode), pre = this._s3pre; this._s3pre = null;
    if (inM && !inP) { this._st3dKey = null; setTimeout(() => TWO.includes(this.ui.wm) && this.stim3dEnter(pre), 60); }
    else if (inM && inP && mode !== prev) { this._st3dKey = null; if (V3 && V3.layoutName === 'stim') { this.stim3dApply(mode); if (this.refreshMarkers) this.refreshMarkers(); } setTimeout(() => this.stim3dUpdate(), 60); }   // réglages des deux vues de ce mode
  }, 'stim3d');
  A.renderStims = function () { const r = rs0.apply(this, arguments); this.stim3dControls($('tab-stims')); clearTimeout(this._s3T); this._s3T = setTimeout(() => this.stim3dUpdate(), 40); return r; };
  if (rb0) A.rebuildElectrodes = function () { const r = rb0.apply(this, arguments); if (this.ui && TWO.includes(this.ui.wm)) { clearTimeout(this._s3T); this._s3T = setTimeout(() => this.stim3dUpdate(), 60); } return r; };
  // la disposition « stim » est propre au mode : le cas garde la disposition d'avant
  A.changed = function () {
    const V3 = this.viewer, pre = this._preStimLayout; if (!pre || !V3) return ch0.apply(this, arguments);
    V3.layoutState = () => pre; try { return ch0.apply(this, arguments); } finally { delete V3.layoutState; }
  };
  SV.Stim3D = { sampledArea, bestView };
})(window.SV = window.SV || {});
