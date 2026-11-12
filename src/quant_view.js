/* EpiScope — quant_view.js : jeux de valeurs (Analyses : EI, EImax, taux…) dans les coupes de l'IRM et sur le cortex (v4.14).
 *   - coupes : en mode Analyses, les plots du jeu affiché dans la vue active sont des pastilles colorées (et dimensionnées)
 *     au milieu de chaque paire, les autres plots atténués ; dans la coupe d'une électrode (axe), ses anneaux prennent la
 *     couleur de la valeur ; le volet des coupes s'ouvre de lui-même (comme pour les stimulations et thermocoagulations) ;
 *   - synchronisation : un plot choisi (liste des valeurs, clic en 3D sur une pastille ou un plot, clic dans les coupes)
 *     est cerclé en 3D, centre les coupes et se surligne dans la liste ;
 *   - régions : chaque région de la parcellation (cortex et structures profondes, gabarit ou anatomie du patient) prend la
 *     valeur maximale (défaut) ou moyenne des plots qu'elle contient (plot en substance blanche : région de cortex la plus
 *     proche à moins de 3 mm), peinte avec la palette du jeu ('q:<id>').                                                   */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Seeg, ST = SV.Store, A = SV.app, M4 = SV.Mat4;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), nf = v => (+v).toLocaleString(SV.LOC, { maximumFractionDigits: 2 });
  const norm = s => S.normName(s).toLowerCase();
  const NEAR = []; for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) { const d = Math.hypot(x, y, z); if (d > 0 && d <= 3) NEAR.push([x, y, z, d]); } NEAR.sort((a, b) => a[3] - b[3]);

  const M = {
    /** jeu affiché dans la vue active */
    quantActive() { const c = this.viewer && this.viewer.activeCfg; return c && c.quant ? (this.state && this.state.quant || []).find(q => q.id === c.quant) || null : null; },
    /** étiquette (parcellation) au point (coordonnées de la vue) : anatomie du patient ou gabarit */
    quantLabeler() {
      const P = this.patientAnat; if (this.anatMode === 'patient' && P && P.labelWorld && P.fromDisplay) return (x, y, z) => { const q = M4.apply(P.fromDisplay, x, y, z); return P.labelWorld.labelAt(q[0], q[1], q[2]); };
      return this.vol && this.vol.labelAt ? (x, y, z) => this.vol.labelAt(x, y, z) : null;
    },
    /** région (1–162) d'un plot ; plot hors du cortex : région la plus proche à moins de 3 mm, sinon 0 */
    quantContactRegion(e, k, lab) {
      const c = e && e.contacts && e.contacts[k - 1]; if (!c) return 0; if (c.label >= 1 && c.label <= 162) return c.label;
      const key = (this.anatMode || '') + ':' + e.id + ':' + k + ':' + (c.xyz || []).map(v => v.toFixed(1)).join(','), C = this._qRegCache || (this._qRegCache = new Map()); if (C.has(key)) return C.get(key);
      let r = 0; if (lab && c.xyz) for (const [dx, dy, dz] of NEAR) { const l = lab(c.xyz[0] + dx, c.xyz[1] + dy, c.xyz[2] + dz); if (l >= 1 && l <= 162) { r = l; break; } }
      C.set(key, r); return r;
    },
    /** régions → valeur (maximale ou moyenne) des plots qu'elles contiennent ; une paire compte pour ses deux plots */
    quantRegionValues(q, how) {
      if (q.regionValues) return new Map(Object.entries(q.regionValues).map(([r, v]) => [+r, +v]).filter(([r, v]) => r > 0 && isFinite(v)));   // jeu porteur de valeurs par région (empreinte connectivité)
      const acc = new Map(), lab = this.quantLabeler();
      for (const [key, v] of Object.entries(q.values || {})) {
        const p = S.parseLabel(key), e = p && this.elecByName(p.elec); if (!e || !isFinite(+v)) continue;
        for (const k of [p.c1, p.c2].filter(x => x != null)) { const r = this.quantContactRegion(e, k, lab); if (!r) continue; const o = acc.get(r) || { max: -Infinity, sum: 0, n: 0 }; o.max = Math.max(o.max, +v); o.sum += +v; o.n++; acc.set(r, o); }
      }
      const out = new Map(); for (const [r, o] of acc) out.set(r, how === 'mean' ? o.sum / o.n : o.max); return out;
    },
    /** peinture des régions d'un jeu : Map(région → [r, g, b, part]) */
    quantRegionPaint(q) {
      const how = q.roi || 'max'; if (how === 'off') return null; const vals = this.quantRegionValues(q, how), span = (q.max - q.min) || 1, map = new Map();
      for (const [r, v] of vals) { const t = clamp((v - q.min) / span, 0, 1), c = S.cmap(q.cmap, t); map.set(r, [c[0], c[1], c[2], 0.55 + 0.4 * t]); }
      return map;
    },
    /** position (coupes) d'un plot ou du milieu d'une paire, d'après les électrodes portées sur l'IRM */
    quantWorldPos(key) {
      const p = S.parseLabel(key); if (!p || !this.worldElectrodes) return null; const L = this.worldElectrodes().list.filter(w => norm(w.name) === norm(p.elec)); if (!L.length) return null;
      const w = L.find(x => x.kind === 'real') || L[0], a = w.pts[p.c1 - 1], b = p.c2 != null ? w.pts[p.c2 - 1] : null; if (!a) return null;
      return { w, p: b ? a.map((x, i) => (x + b[i]) / 2) : a.slice(), ks: [p.c1, p.c2].filter(x => x != null) };
    },
    /** plot choisi : cerclé en 3D, coupes centrées (ou électrode suivie dans son axe), ligne surlignée */
    quantSelect(key, q) {
      this.ui.quantSel = key; q = q || this.quantActive();
      const p = S.parseLabel(key), e = p && this.elecByName(p.elec);
      if (e && this.viewer && this.viewer.setContactHighlight) this.viewer.setContactHighlight([p.c1, p.c2].filter(x => x != null).map(k => e.id + ':' + k));
      const S3 = this.slices, pos = this.quantWorldPos(key);
      if (S3 && pos) {
        const st = this.slvState ? this.slvState() : {};
        if (st.elec && this.checkElectrode) { const k = this.worldKeyOf && e && this.worldKeyOf(e.id); st.pair = pos.ks.length === 2 ? [pos.ks[0] - 1, pos.ks[1] - 1] : null; st.elecK = pos.ks[0] - 1; if (k && st.elec !== k) this.checkElectrode(k, true); else this.stepElectrode(0); }
        else { S3.setCursor(pos.p); if (S3.setViewCenter) S3.setViewCenter(pos.p); if (this.sliceMarkers) this.sliceMarkers(); }
      } else if (!S3 && this.ui.wm === 'quant' && this.dossier && ST.refImaging(this.dossier) && this.toggleDock) this.toggleDock(true).then(() => this.quantSelect(key, q));
      if (this.ui.tab === 'quant') { const box = $('tab-quant'); if (box) box.querySelectorAll('.qx-v').forEach(r => r.classList.toggle('sel', r.dataset.k === key)); }
      if (q) this.toast(`${key} · ${q.name} = ${nf(q.values[key])}${q.unit ? ' ' + q.unit : ''}`, 2200);
    },
    /** pastilles du jeu affiché dans les coupes (orthogonales) */
    quantSliceMarkers() {
      const S3 = this.slices, q = this.quantActive(); if (!S3 || !q) return;
      const base = (S3.markers || []).filter(m => !m.qkey).map(m => Object.assign({}, m, { color: 'rgba(150,165,185,.45)', r: Math.min(m.r || 1.1, 0.9), label: '' }));
      const span = (q.max - q.min) || 1, out = [];
      for (const [key, v] of Object.entries(q.values || {})) {
        const pos = this.quantWorldPos(key); if (!pos) continue; const t = clamp((v - q.min) / span, 0, 1), c = q.mode === 'size' ? [255, 200, 90] : S.cmap(q.cmap, t), sel = key === this.ui.quantSel;
        const low = t < 0.04 && !sel;   // valeur nulle : petit plot neutre (le noir des palettes se perd sur l'IRM)
        out.push({ p: pos.p, r: low ? 0.9 : q.mode === 'color' ? 1.7 : 0.9 + 2.0 * t, color: low ? 'rgba(170,185,205,.6)' : `rgb(${c.join(',')})`, solid: true, sel, label: sel || t >= 0.6 ? `${key} ${nf(v)}` : '', showLabel: sel, qkey: key, v });
      }
      out.sort((a, b) => a.v - b.v);   // les plus fortes valeurs par-dessus
      S3.setMarkers(base.concat(out));
    },
  };
  Object.assign(A, M);

  // ---------------------------------------------------------------- greffes
  /** jeu dont les coupes reprennent les valeurs : celui de la vue active, sinon le dernier ouvert ou le dernier créé */
  A.quantForSlices = function () {
    const L = (this.state && this.state.quant) || [], id = this.ui.seeg && this.ui.seeg.quantOpenId;
    return this.quantActive() || (id && L.find(q => q.id === id)) || L[L.length - 1] || null;
  };
  const sll0 = A.sliceLabelLayer;
  /** parcellation « valeurs (Analyses) » des coupes : régions VEP du patient colorées comme sur le cortex */
  A.sliceLabelLayer = function (kind, space) {
    if (kind !== 'quant') return sll0 ? sll0.apply(this, arguments) : null;
    const P = { vepVol: this.vepVolFor(space) }; if (!P.vepVol) return null;
    const q = this.quantForSlices(), atl = this.atlas, name = v => v >= 1 && v <= 162 && atl ? atl.label(v) : v === 200 ? 'substance blanche' : 'autre', lut = new Map();
    if (!q) return { id: 'lab', name: 'valeurs', vol: P.vepVol, kind: 'labels', lut, names: v => name(v) + ' · aucun jeu de valeurs' };
    const how = q.roi === 'mean' ? 'mean' : 'max', vals = this.quantRegionValues(q, how), span = (q.max - q.min) || 1, short = String(q.name || '').split(' · ')[0];
    for (const [r, v] of vals) { const t = clamp((v - q.min) / span, 0, 1); if (t < 0.04) { lut.set(r, [150, 165, 185, 0.35]); continue; } const c = S.cmap(q.cmap, t); lut.set(r, [c[0], c[1], c[2], 0.5 + 0.5 * t]); }
    return { id: 'lab', name: q.name, vol: P.vepVol, kind: 'labels', lut, names: v => name(v) + (vals.has(v) ? ` · ${short} ${how === 'mean' ? 'moy.' : 'max'} ${nf(vals.get(v))}` : '') };
  };
  /** coupes en « valeurs (Analyses) » : mises à jour quand le jeu, ses réglages ou les régions changent */
  A.quantRefreshSliceLabels = function () {
    const S3 = this.slices, st = S3 && this.slvState ? this.slvState() : null; if (!st || st.labels !== 'quant') return;
    const lab = this.sliceLabelLayer('quant'); if (!lab) return;
    const sig = lab.name + '|' + [...lab.lut].map(([k, c]) => k + ':' + c.join(',')).join(';'), has = (S3.layers || []).some(L => L.id === 'lab');
    if (sig === this._qLabSig && has) return; this._qLabSig = sig;
    if (has) { S3.updateLayer('lab', { lut: lab.lut, names: lab.names }); if (this.syncSlices3d) this.syncSlices3d(); }
    else if (this._qLabAdd !== sig && this.updateImagingLayers) { this._qLabAdd = sig; this.updateImagingLayers(); }
  };
  /** coupes du mode Analyses : régions colorées par les valeurs, une fois par dossier (le choix de l'utilisateur prime ensuite) */
  A.quantSliceLabelsOnce = function () {
    const st = this.dossier && this.slvState ? this.slvState() : null; if (!st || st.qlab || !this.patientAnat) return; st.qlab = 1;
    if (!st.labels || st.labels === 'none' || st.labels === 'vep') { st.labels = 'quant'; st.labOpacity = Math.max(st.labOpacity || 0, 0.5); if (this.slices && this.updateImagingLayers) this.updateImagingLayers(); }
  };
  const sd0 = A.slvDefault;
  /** première vue des coupes du mode Analyses : régions colorées par les valeurs (si l'anatomie du patient est calculée) */
  if (sd0) A.slvDefault = function (key) { const st = sd0.apply(this, arguments); if (key && key.startsWith('work:quant') && this.patientAnat && st && (!st.labels || st.labels === 'none' || st.labels === 'vep')) { st.labels = 'quant'; st.labOpacity = Math.max(st.labOpacity || 0, 0.5); st.qlab = 1; } return st; };
  const rm0 = A.refreshMarkers, ism0 = A.implantSliceMarkers, ecm0 = A.electrodeCheckMarkers, op0 = A.onPick, osp0 = A.onSlicePick, ql0 = A.updateQuantLegend;
  /** marqueurs : peinture des régions de chaque jeu, plot choisi cerclé, coupes à jour */
  A.refreshMarkers = function () {
    const r = rm0.apply(this, arguments);
    try {
      if (this.viewer && this.state && this.elecs) {
        const V3 = this.viewer, ids = new Set();
        for (const q of this.state.quant || []) { ids.add('q:' + q.id); V3.setPaint('q:' + q.id, this.quantRegionPaint(q)); }
        for (const k of Object.keys(V3.paints || {})) if (k.startsWith('q:') && !ids.has(k)) V3.setPaint(k, null);
        V3.cells.forEach((c, i) => { if (c.cfg.paint && c.cfg.paint.startsWith('q:') && (!ids.has(c.cfg.paint) || c.cfg.quant !== c.cfg.paint.slice(2))) V3.setCellConfig(i, { paint: null }, true); });
        if (this.ui.tab === 'quant' && this.ui.quantSel) { const p = S.parseLabel(this.ui.quantSel), e = p && this.elecByName(p.elec); if (e) V3.setContactHighlight([p.c1, p.c2].filter(x => x != null).map(k => e.id + ':' + k)); }
      }
      if (this.ui.wm === 'quant' && this.slices && this.sliceMarkers) this.sliceMarkers();
      if (this.slices) this.quantRefreshSliceLabels();
    } catch (e) { console.warn(e); }
    return r;
  };
  if (ism0) A.implantSliceMarkers = function () { const r = ism0.apply(this, arguments); if (r && this.ui.wm === 'quant') this.quantSliceMarkers(); return r; };
  /** coupe d'une électrode dans son axe (mode Analyses) : anneaux colorés par la valeur, paire choisie en blanc */
  if (ecm0) A.electrodeCheckMarkers = function () {
    const r = ecm0.apply(this, arguments), q = this.ui.wm === 'quant' ? this.quantActive() : null, S3 = this.slices; if (!q || !S3) return r;
    try {
      const st = this.slvState(), E = this.findWorldElectrode(st.elec); if (!E) return r; const span = (q.max - q.min) || 1, per = new Map();
      for (const [key, v] of Object.entries(q.values || {})) { const p = S.parseLabel(key); if (!p || norm(p.elec) !== norm(E.name)) continue; for (const k of [p.c1, p.c2].filter(x => x != null)) per.set(k, Math.max(per.has(k) ? per.get(k) : -Infinity, +v)); }
      if (!per.size) return r;
      S3.setMarkers(S3.markers.map(m => { if (!m.ring || m.num == null || !per.has(m.num)) return m; const t = clamp((per.get(m.num) - q.min) / span, 0, 1), c = S.cmap(q.cmap, t); return Object.assign({}, m, { color: m.sel ? '#ffffff' : `rgb(${c.join(',')})`, label: m.label || (t >= 0.6 ? E.name + m.num : ''), showLabel: m.showLabel || t >= 0.6 }); }));
    } catch (e) { console.warn(e); }
    return r;
  };
  /** clic en 3D, onglet Analyses : pastille d'un jeu ou plot → plot choisi */
  A.onPick = function (r, kind, e) {
    if (kind === 'click' && this.ui.tab === 'quant' && this.viewer) {
      const lp = this.viewer.lastPick, q = this.quantActive();
      if (lp && lp.kind === 'marker' && lp.marker.kind === 'quant') { const qq = (this.state.quant || []).find(x => x.id === lp.marker.set); this.quantSelect(lp.marker.label, qq); return; }
      if (lp && lp.kind === 'contact' && q) { const el = this.elecs.find(x => x.id === lp.eid); if (el) { const keys = Object.keys(q.values || {}).filter(k => { const p = S.parseLabel(k); return p && norm(p.elec) === norm(el.name) && (p.c1 === lp.k || p.c2 === lp.k); }).sort((a, b) => q.values[b] - q.values[a]); if (keys.length) { this.quantSelect(keys[0], q); return; } } }
    }
    return op0.apply(this, arguments);
  };
  /** clic dans les coupes, mode Analyses : pastille la plus proche (≤ 6 mm) */
  A.onSlicePick = function (p) {
    if (this.ui.wm === 'quant' && this.slices && !(this.ui.slv && this.ui.slv.elec)) { const q = this.quantActive(); if (q) { let best = null, bd = 6; for (const m of this.slices.markers || []) if (m.qkey) { const d = Math.hypot(m.p[0] - p[0], m.p[1] - p[1], m.p[2] - p[2]); if (d < bd) { bd = d; best = m; } } if (best) { this.quantSelect(best.qkey, q); return; } } }
    return osp0 ? osp0.apply(this, arguments) : undefined;
  };
  /** mode Analyses : volet des coupes ouvert d'office (s'il y a une IRM), refermé en sortant s'il avait été ouvert ainsi */
  SV.Bus.on('workmode:after', function (mode, prev) {
    try {
      if (mode === 'quant' && prev !== 'quant') this.quantSliceLabelsOnce();
      if (mode === 'quant' && prev !== 'quant' && this.dossier && ST.refImaging(this.dossier) && this.toggleDock) { this._dockAutoQ = !this.ui.dock; if (!this.ui.dock) this.toggleDock(true).then(() => this.sliceMarkers && this.sliceMarkers()); }
      else if (prev === 'quant' && mode !== 'quant' && this._dockAutoQ && !['stim', 'thermo'].includes(mode)) { this._dockAutoQ = false; if (this.ui.dock && this.toggleDock) this.toggleDock(false); }
    } catch (e) { console.warn(e); }
  }, 'quant_view');
  if (ql0) A.updateQuantLegend = function () {
    const r = ql0.apply(this, arguments), lg = $('quantLegend'), q = this.quantActive && this.quantActive();
    if (lg && q && !lg.hidden && (q.roi || 'max') !== 'off' && !lg.querySelector('.ql-roi')) { const s = document.createElement('span'); s.className = 'ql-roi'; s.textContent = `régions : valeur ${(q.roi || 'max') === 'mean' ? 'moyenne' : 'maximale'} des plots`; lg.appendChild(s); }
    return r;
  };
})(window.SV);
