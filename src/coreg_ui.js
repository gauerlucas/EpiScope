/* EpiScope — coreg_ui.js : aide au recalage d'une image sur le T1 de référence (v4.21).
 *   - Repères : quand le recalage automatique échoue ou doute (TEP loin du champ du T1, orientation atypique, tête d'enfant…),
 *     l'utilisateur pointe sur la référence puis sur l'image (affichée telle qu'acquise) le centre du cerveau, et s'il le
 *     veut la commissure antérieure (AC), la commissure postérieure (PC) et un point de la ligne médiane (scissure
 *     interhémisphérique). Un repère commun suffit pour un départ en translation, deux alignent l'axe AC–PC, trois et plus
 *     donnent une transformation rigide (Horn) ; le recalage par information mutuelle repart de là, sans recherche
 *     d'orientation ; « appliquer les repères seuls » pose la transformation sans optimisation.
 *   - Ajuster : poignées dans les coupes autour de la tête de l'image recalée — bords : échelle sur l'axe (croissance du
 *     crâne entre un scanner ou une TEP ancienne et l'IRM : pas strictement rigide), coins : échelle dans le plan, intérieur :
 *     déplacement, ⟳ : rotation dans le plan ; pas fins au clavier dans le panneau (0,5 mm, 0,5°, 0,5 %). La transformation
 *     devient T = Tr(c + t) · R · S · Tr(−c) · T_auto, c = centre de la tête ; im.coreg.adjust garde t, r, s pour y revenir.
 *   Pas de donnée patient ici : coordonnées monde seulement.                                                            */
(function (SV) {
  'use strict';
  const S = SV.Store, M4 = SV.Mat4, V = S.V;
  const esc = SV.U.esc;
  const nf = (v, k) => (Math.round(v * Math.pow(10, k == null ? 1 : k)) / Math.pow(10, k == null ? 1 : k)).toString().replace('.', ',');
  const DEG = Math.PI / 180;
  const LMK = [['center', 'centre du cerveau', 'au milieu du cerveau (3e ventricule, autour du thalamus) : suffit pour une translation'], ['ac', 'AC', 'commissure antérieure (coupe sagittale médiane, à l’avant du 3e ventricule)'], ['pc', 'PC', 'commissure postérieure (sous la glande pinéale, devant l’aqueduc)'], ['mid', 'ligne médiane', 'un point haut de la scissure interhémisphérique (faux du cerveau), sur une coupe coronale']];
  const COLS = { center: '#ffcf4a', ac: '#7fe3ff', pc: '#ff8c5a', mid: '#b7ff7a' };
  const r2 = p => p.map(v => Math.round(v * 100) / 100);

  /** boîte de la tête d'une image (monde natif, mm) : seuil d'Otsu sur un sous-échantillonnage, bornes des voxels au-dessus */
  function headBox(vol) {
    const [nx, ny, nz] = vol.dims, d = vol.data, st = Math.max(1, Math.round(Math.cbrt(d.length / 300000)));
    const vals = []; for (let z = 0; z < nz; z += st) for (let y = 0; y < ny; y += st) for (let x = 0; x < nx; x += st) vals.push(d[x + nx * (y + ny * z)]);
    const u = SV.Coreg && SV.Coreg._util && SV.Coreg._util.otsu ? SV.Coreg._util.otsu(Float32Array.from(vals)) : null;
    let thr = u; if (thr == null || !isFinite(thr)) { const s = vals.slice().sort((a, b) => a - b); thr = s[Math.floor(s.length * 0.6)]; }
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], n = 0;
    for (let z = 0; z < nz; z += st) for (let y = 0; y < ny; y += st) for (let x = 0; x < nx; x += st) { if (d[x + nx * (y + ny * z)] <= thr) continue; n++; const p = M4.apply(vol.affine, x, y, z); for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; } }
    if (!n) { lo = M4.apply(vol.affine, 0, 0, 0); hi = M4.apply(vol.affine, nx - 1, ny - 1, nz - 1); for (let k = 0; k < 3; k++) if (lo[k] > hi[k]) { const t = lo[k]; lo[k] = hi[k]; hi[k] = t; } }
    return { lo, hi, corners: [0, 1, 2, 3, 4, 5, 6, 7].map(b => [b & 1 ? hi[0] : lo[0], b & 2 ? hi[1] : lo[1], b & 4 ? hi[2] : lo[2]]) };
  }
  /** matrice d'ajustement : Tr(c + t) · Rz·Ry·Rx (degrés) · diag(s) · Tr(−c) */
  function adjustMatrix(A) {
    const c = A.c, R = M4.rigid([A.t[0], A.t[1], A.t[2], A.r[0] * DEG, A.r[1] * DEG, A.r[2] * DEG], c);
    const Sc = M4.identity(); Sc[0] = A.s[0]; Sc[5] = A.s[1]; Sc[10] = A.s[2]; Sc[3] = c[0] * (1 - A.s[0]); Sc[7] = c[1] * (1 - A.s[1]); Sc[11] = c[2] * (1 - A.s[2]);
    return M4.mul(R, Sc);
  }
  /** transformation initiale d'après des paires de repères (monde mobile → monde fixe) : 1 point = translation, 2 = translation +
   *  rotation minimale alignant les deux vecteurs, ≥ 3 = rigide (Horn) ; null sans repère commun */
  function initFromLandmarks(movP, refP) {
    const keys = LMK.map(l => l[0]).filter(k => movP[k] && refP[k]); if (!keys.length) return null;
    const A = keys.map(k => movP[k]), B = keys.map(k => refP[k]);
    if (keys.length >= 3) { const T = SV.Coreg.rigidFromPoints(A, B); const res = SV.Coreg.residual(T, A, B); return { T, n: keys.length, rms: res.rms }; }
    const T = M4.identity();
    if (keys.length === 1) { T[3] = B[0][0] - A[0][0]; T[7] = B[0][1] - A[0][1]; T[11] = B[0][2] - A[0][2]; return { T, n: 1, rms: 0 }; }
    const u = unit(sub(A[1], A[0])), v = unit(sub(B[1], B[0])), ax = cross(u, v), sn = Math.hypot(ax[0], ax[1], ax[2]), cs = Math.max(-1, Math.min(1, dot(u, v)));
    const R = M4.identity();
    if (sn > 1e-6) { const k = ax.map(x => x / sn), th = Math.atan2(sn, cs), c = Math.cos(th), s = Math.sin(th), C = 1 - c; // Rodrigues
      R[0] = c + k[0] * k[0] * C; R[1] = k[0] * k[1] * C - k[2] * s; R[2] = k[0] * k[2] * C + k[1] * s; R[4] = k[1] * k[0] * C + k[2] * s; R[5] = c + k[1] * k[1] * C; R[6] = k[1] * k[2] * C - k[0] * s; R[8] = k[2] * k[0] * C - k[1] * s; R[9] = k[2] * k[1] * C + k[0] * s; R[10] = c + k[2] * k[2] * C; }
    const ma = [0, 1, 2].map(i => (A[0][i] + A[1][i]) / 2), mb = [0, 1, 2].map(i => (B[0][i] + B[1][i]) / 2), ra = M4.apply(R, ma[0], ma[1], ma[2]);
    R[3] = mb[0] - ra[0]; R[7] = mb[1] - ra[1]; R[11] = mb[2] - ra[2];
    return { T: R, n: 2, rms: SV.Coreg.residual(R, A, B).rms };
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], unit = a => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

  const M = {
    /** après un échec ou un doute du recalage automatique : proposer les repères */
    coregSuggestLandmarks(im, why, failed) {
      const t = document.getElementById('toast'); if (!t) return;
      t.innerHTML = `${failed ? 'Recalage impossible' : 'Recalage à vérifier'} — ${esc(why || '')}. <a class="tlink">Aider avec des repères…</a>`; t.hidden = false; clearTimeout(this._toast); this._toast = setTimeout(() => { t.hidden = true; }, 12000);
      t.querySelector('.tlink').onclick = () => { t.hidden = true; if (this.ui.screen !== 'imaging') this.go({ stage: 'dossier', view: 'imagerie' }); setTimeout(() => this.coregLandmarks(im), 300); };
    },

    // ================================================================ repères
    coregLandmarks(im) {
      const d = this.dossier, ref = S.refImaging(d); if (!d || !ref || !im || im === ref) return;
      this.closeMenu(); if (this.ui.lmk) this.coregLandmarksEnd(true);
      const saved = im.coreg && im.coreg.landmarks ? JSON.parse(JSON.stringify(im.coreg.landmarks)) : null;
      const K = this.ui.lmk = { imId: im.id, show: 'ref', pick: null, pts: saved || { ref: {}, mov: {} }, keep: this.slvState ? JSON.parse(JSON.stringify(this.slvDisplay ? this.slvDisplay(this.slvState()) : {})) : null };
      const panel = document.createElement('div'); panel.className = 'cell-panel lmk-panel'; K.panel = panel;
      const render = () => {
        const n = LMK.filter(l => K.pts.ref[l[0]] && K.pts.mov[l[0]]).length, init = initFromLandmarks(K.pts.mov, K.pts.ref);
        panel.innerHTML = `<div class="ctx-head">Repères pour le recalage <span class="muted">${esc(V.modality[im.modality] || im.modality)} → ${esc(V.modality[ref.modality])}</span></div>
          <div class="row lmk-show"><span>Afficher</span><span class="seg"><button data-show="ref" class="${K.show === 'ref' ? 'on' : ''}" title="image de référence">${esc(V.modality[ref.modality])}</button><button data-show="mov" class="${K.show === 'mov' ? 'on' : ''}" title="image à recaler, affichée telle qu’acquise (sans transformation)">${esc(V.modality[im.modality] || im.modality)} brut</button></span></div>
          <table class="lmk-tab"><tr><th></th><th>référence</th><th>image</th></tr>
          ${LMK.map(([k, l, tip]) => `<tr data-k="${k}"><td title="${esc(tip)}"><i class="lmk-sw" style="background:${COLS[k]}"></i>${esc(l)}${k === 'center' ? '' : ' <span class="muted">(option)</span>'}</td>${['ref', 'mov'].map(w => { const p = K.pts[w][k], on = K.pick && K.pick.k === k && K.pick.w === w; return `<td><button class="mini-btn lmk-pk${on ? ' on primary' : p ? ' ok' : ''}" data-w="${w}" data-k="${k}" title="${on ? 'cliquez le point dans les coupes' : p ? 'pointé : ' + p.map(v => v.toFixed(0)).join(', ') + ' mm — cliquer pour pointer à nouveau' : 'pointer dans les coupes'}">${on ? '⌖ cliquez…' : p ? '✓ ' + p.map(v => v.toFixed(0)).join(', ') : '⌖ pointer'}</button></td>`; }).join('')}</tr>`).join('')}</table>
          <div class="hint">${n ? `${n} repère${n > 1 ? 's' : ''} commun${n > 1 ? 's' : ''} : ${n === 1 ? 'translation' : n === 2 ? 'translation + axe aligné' : 'transformation rigide (Horn)'}${init && init.n >= 3 ? ` · écart ${nf(init.rms, 1)} mm` : ''}` : 'Pointez au moins le centre du cerveau sur les deux images (un clic dans les coupes). Le bouton « Afficher » bascule entre la référence et l’image telle qu’acquise.'}</div>
          <div class="btnrow"><button class="primary lmk-run"${n ? '' : ' disabled'} title="le recalage par information mutuelle repart des repères, sans recherche d’orientation">Recaler à partir des repères</button><button class="lmk-apply"${n ? '' : ' disabled'} title="poser la transformation des repères telle quelle (sans optimisation) ; à affiner ensuite avec « ajuster »">Appliquer les repères seuls</button><button class="lmk-clear"${n || Object.keys(K.pts.ref).length || Object.keys(K.pts.mov).length ? '' : ' disabled'}>Effacer</button><button class="lmk-close">Fermer</button></div>`;
        panel.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { K.show = b.dataset.show; this.coregLandmarksShow(); render(); });
        panel.querySelectorAll('.lmk-pk').forEach(b => b.onclick = () => { const w = b.dataset.w, k = b.dataset.k; if (K.show !== w) { K.show = w; this.coregLandmarksShow(); } K.pick = { w, k }; if (this.slices) this.slices.pickMode = 'lmk'; render(); });
        panel.querySelector('.lmk-run').onclick = async () => { const I = initFromLandmarks(K.pts.mov, K.pts.ref); if (!I) return; im.coreg = Object.assign(im.coreg || {}, { landmarks: K.pts }); this.coregLandmarksEnd(true); const r = await this.coregImage(im, true, { init: I.T }); if (r) { this.ui.imSel = im.id; this.renderImaging(); this.toast(`Recalage à partir de ${I.n} repère${I.n > 1 ? 's' : ''} : ${im.coreg.text}`, 7000); } };
        panel.querySelector('.lmk-apply').onclick = () => { const I = initFromLandmarks(K.pts.mov, K.pts.ref); if (!I) return; const dec = SV.Coreg.decompose(I.T); im.coreg = { T: M4.toArray(I.T), refId: ref.id, method: `repères (${I.n} point${I.n > 1 ? 's' : ''}, sans optimisation)`, date: S.now(), quality: null, qc: null, warnings: [], manual: true, landmarks: K.pts, text: `repères : t = ${dec.translation.map(v => v.toFixed(1)).join(', ')} mm · r = ${dec.rotations.map(v => v.toFixed(1)).join(', ')}°` }; S.log(d, 'compute', 'imaging', im.id, 'recalage par repères'); this.touch('imaging', im.id, 'repères'); this.coregLandmarksEnd(true); this.ui.imSel = im.id; this.renderImaging(); this.toast('Transformation des repères appliquée — « ajuster » pour l’affiner', 5000); };
        panel.querySelector('.lmk-clear').onclick = () => { K.pts = { ref: {}, mov: {} }; K.pick = null; if (this.slices) this.slices.pickMode = null; this.coregLandmarksMarkers(); render(); };
        panel.querySelector('.lmk-close').onclick = () => this.coregLandmarksEnd();
      };
      K.render = render;
      render(); K.undock = this._toolDock(panel);   // en haut de la colonne des post-traitements (sans masquer les coupes), sinon panneau flottant
      this.coregLandmarksShow();
    },
    /** image affichée pendant le pointage : référence seule, ou image mobile telle qu'acquise (base native) */
    coregLandmarksShow() {
      const K = this.ui.lmk, st = this.slvState ? this.slvState() : null, S3 = this.slices; if (!K || !st || !S3) return;
      const d = this.dossier, im = S.byId(d.imaging, K.imId);
      st.overlays = (st.overlays || []).map(o => Object.assign({}, o, { on: false }));
      if (K.show === 'mov') { st.base = im.id; st.baseNative = true; st.wlTarget = 'base'; }
      else { st.base = null; st.baseNative = false; st.wlTarget = 'base'; }
      this.updateImagingLayers().then(async () => {
        if (K.show === 'mov') { const vol = await this.imagingVolume(im); const c = SV.Vol.center(vol), ext = Math.max(...vol.dims.map((n, k) => n * vol.pixdim[k])); S3.setViewCenter(c); S3.setCursor(c, true); S3.setZoom(Math.min(1, S3.fov / (ext * 1.05))); }
        else { S3.resetView(); }
        this.coregLandmarksMarkers(); if (this.renderImagingBar) this.renderImagingBar();
      });
    },
    coregLandmarksMarkers() {
      const K = this.ui.lmk, S3 = this.slices; if (!K || !S3) return; const P = K.pts[K.show] || {};
      S3.setMarkers(LMK.filter(l => P[l[0]]).map(([k, l]) => ({ p: P[k], r: 2.2, color: COLS[k], label: l, showLabel: true, always: true, solid: true }))); S3.setShafts([]);
    },
    /** clic dans les coupes en mode repères */
    coregLandmarkPick(p) {
      const K = this.ui.lmk; if (!K || !K.pick) return false; K.pts[K.pick.w][K.pick.k] = r2(p); K.pick = null; if (this.slices) this.slices.pickMode = null;
      this.coregLandmarksMarkers(); if (K.render) K.render(); return true;
    },
    coregLandmarksEnd(silent) {
      const K = this.ui.lmk; if (!K) return; this.ui.lmk = null; if (K.undock) K.undock();
      if (this.slices) { this.slices.pickMode = null; this.slices.setMarkers([]); }
      const st = this.slvState ? this.slvState() : null; if (st) { st.baseNative = false; if (K.keep) Object.assign(st, K.keep); else { st.base = null; } }
      const im = S.byId(this.dossier.imaging, K.imId); if (im && im.coreg) im.coreg.landmarks = K.pts;
      this.updateImagingLayers().then(() => { if (this.sliceMarkers) this.sliceMarkers(); if (this.renderImagingBar) this.renderImagingBar(); });
      if (!silent) this.toast('Repères fermés', 1500);
    },

    // ================================================================ ajustement par poignées
    async adjustCoreg(im) {
      const d = this.dossier, ref = S.refImaging(d), S3 = this.slices; if (!d || !ref || !im || !(im.coreg && im.coreg.T)) return;
      this.closeMenu(); if (this.ui.adj) this.adjustCoregEnd(true);
      const vol = await this.imagingVolume(im), HB = headBox(vol), base0 = im.coreg.adjust && im.coreg.adjust.base ? im.coreg.adjust.base.slice() : im.coreg.T.slice();
      const Tb = M4.from(base0), cN = [0, 1, 2].map(k => (HB.lo[k] + HB.hi[k]) / 2), c = M4.apply(Tb, cN[0], cN[1], cN[2]);
      const A = this.ui.adj = { imId: im.id, base: base0, c, t: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1], HB, drag: null };
      if (im.coreg.adjust) { A.t = im.coreg.adjust.t.slice(); A.r = im.coreg.adjust.r.slice(); A.s = im.coreg.adjust.s.slice(); if (im.coreg.adjust.c) A.c = im.coreg.adjust.c.slice(); }
      const st = this.slvState(); if (st.base !== im.id && !st.overlays.some(o => o.id === im.id && o.on !== false)) { this.addOverlay(im.id); await this.updateImagingLayers(); }
      const panel = document.createElement('div'); panel.className = 'cell-panel adj-panel'; A.panel = panel;
      const tot = () => M4.mul(adjustMatrix(A), M4.from(A.base));
      const box = () => { const T = tot(), pts = HB.corners.map(p => M4.apply(T, p[0], p[1], p[2])), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; } return { c: [0, 1, 2].map(k => (lo[k] + hi[k]) / 2), h: [0, 1, 2].map(k => Math.max(5, (hi[k] - lo[k]) / 2)) }; };
      const apply = (done) => {
        const T = tot(); im.coreg.T = M4.toArray(T); im.coreg.adjust = { base: A.base, c: A.c, t: A.t.slice(), r: A.r.slice(), s: A.s.slice() }; im.coreg.manual = true;
        if (S3) { S3.updateLayer('ov:' + im.id, { T }); if (st.base === im.id && !st.baseNative) S3.updateLayer('base', { T }); if (S3.handles) { S3.handles.box = box(); S3.draw(); } }
        if (done) { im.coreg.text = (im.coreg.text || '').replace(/ · ajusté.*$/, '') + ` · ajusté à la main (t ${A.t.map(v => nf(v, 1)).join(', ')} mm · r ${A.r.map(v => nf(v, 1)).join(', ')}° · échelle ${A.s.map(v => nf(100 * v, 1) + ' %').join(', ')})`; this.touch('imaging', im.id, 'ajustement manuel'); this.syncSlices3d && this.syncSlices3d(); render(); }
      };
      const render = () => {
        const row = (lab, k, arr, step, unit, fmt) => `<div class="row adj-row"><span>${lab}</span>${[0, 1, 2].map(i => `<label><i>${['x', 'y', 'z'][i]}</i><input type="number" step="${step}" data-k="${k}" data-i="${i}" value="${fmt(arr[i])}">${unit}</label>`).join('')}</div>`;
        panel.innerHTML = `<div class="ctx-head">Ajuster le recalage <span class="muted">${esc(V.modality[im.modality] || im.modality)}</span></div>
          <div class="hint">Dans les coupes : <b>bords</b> du cadre = échelle sur cet axe (croissance), <b>coins</b> = échelle dans le plan, <b>intérieur</b> = déplacer, <b>⟳</b> = tourner. Ou au clavier ci-dessous.</div>
          ${row('déplacement', 't', A.t, 0.5, 'mm', v => nf(v, 1).replace(',', '.'))}${row('rotation', 'r', A.r, 0.5, '°', v => nf(v, 1).replace(',', '.'))}${row('échelle', 's', A.s.map(v => 100 * v), 0.5, '%', v => nf(v, 1).replace(',', '.'))}
          <div class="row adj-row"><span>échelle uniforme</span><span class="adj-u"><button class="mini-btn" data-u="-1">−1 %</button><button class="mini-btn" data-u="-0.2">−0,2 %</button><button class="mini-btn" data-u="0.2">+0,2 %</button><button class="mini-btn" data-u="1">+1 %</button></span></div>
          <div class="btnrow"><button class="adj-reset" title="revenir au recalage automatique (ou aux repères)">Annuler les ajustements</button><button class="primary adj-ok">OK</button></div>`;
        panel.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = () => { const k = inp.dataset.k, i = +inp.dataset.i, v = +inp.value; if (!isFinite(v)) return; if (k === 's') A.s[i] = Math.max(0.5, Math.min(2, v / 100)); else A[k][i] = v; apply(true); });
        panel.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const f = 1 + (+b.dataset.u) / 100; for (let i = 0; i < 3; i++) A.s[i] = Math.max(0.5, Math.min(2, A.s[i] * f)); apply(true); });
        panel.querySelector('.adj-reset').onclick = () => { A.t = [0, 0, 0]; A.r = [0, 0, 0]; A.s = [1, 1, 1]; apply(true); im.coreg.manual = false; im.coreg.text = (im.coreg.text || '').replace(/ · ajusté.*$/, ''); delete im.coreg.adjust; this.touch('imaging', im.id, 'ajustement annulé'); render(); };
        panel.querySelector('.adj-ok').onclick = () => this.adjustCoregEnd();
      };
      // poignées : échelle, rotation et déplacement relatifs au début de chaque glisser
      let start = null;
      if (S3) S3.setHandles({ box: box(), label: `${V.modality[im.modality] || im.modality} · ajuster`, onChange: (kind, data, done) => {
        if (!start) start = { t: A.t.slice(), r: A.r.slice(), s: A.s.slice() };
        if (kind === 'translate') A.t = [0, 1, 2].map(i => start.t[i] + data.d[i]);
        else if (kind === 'rotate') { A.r = start.r.slice(); A.r[data.axis] = start.r[data.axis] + data.deg; }
        else if (kind === 'scale') { A.s = start.s.slice(); for (const ax of data.axes) A.s[ax] = Math.max(0.5, Math.min(2, start.s[ax] * data.s)); }
        apply(done); if (done) start = null;
      } });
      render(); A.undock = this._toolDock(panel);
      apply(false);
    },
    adjustCoregEnd(silent) {
      const A = this.ui.adj; if (!A) return; this.ui.adj = null; if (A.undock) A.undock();
      if (this.slices) this.slices.setHandles(null);
      const im = S.byId(this.dossier.imaging, A.imId); if (im && this.ui.screen === 'imaging') this.renderImaging();
      if (!silent) this.toast('Ajustement enregistré', 1500);
    },
    /** panneau d'outil qui dialogue avec les coupes : rangé en tête de la colonne des post-traitements de l'écran Imagerie (dépliée
     *  au besoin, sans rien masquer), sinon panneau flottant qui ne se ferme pas au clic ailleurs ; renvoie la fonction qui le retire */
    _toolDock(panel) {
      const body = this.ui.screen === 'imaging' && document.querySelector('#scr-imaging .im-right .im-rbody'), grid = body && body.closest('.im-grid3');
      if (body) {
        panel.classList.add('im-tool'); body.insertBefore(panel, body.firstChild);
        const wasCollapsed = grid && grid.classList.contains('right-collapsed'); if (wasCollapsed) grid.classList.remove('right-collapsed');
        return () => { panel.remove(); if (wasCollapsed && grid && grid.isConnected && !this.ui.imRight) grid.classList.add('right-collapsed'); };
      }
      const host = document.getElementById('imPanel') || document.body, r = host.getBoundingClientRect();
      this.popupMenu([{ node: panel }], r.left + 8, r.top + 44); this._menuSticky();
      return () => { if (panel.parentNode) this.closeMenu(); };
    },
    /** le menu flottant courant ne se ferme plus au clic ailleurs (panneaux d'outils qui dialoguent avec les coupes) */
    _menuSticky() { setTimeout(() => { if (this._menuClose) { window.removeEventListener('pointerdown', this._menuClose, true); this._menuClose = null; } }, 20); },
    _coregUiUtil: { headBox, adjustMatrix, initFromLandmarks, LMK },
  };
  Object.assign(SV.app, M);
  // clic dans les coupes : repères avant les autres usages ; base « native » pendant le pointage
  const A0 = SV.app, osp0 = A0.onSlicePick, uil0 = A0.updateImagingLayers;
  A0.onSlicePick = function (p) { if (this.ui.lmk && this.coregLandmarkPick(p)) return; return osp0 ? osp0.apply(this, arguments) : undefined; };
  A0.updateImagingLayers = async function () {
    const r = await uil0.apply(this, arguments); const st = this.ui.slv, S3 = this.slices;
    if (st && st.baseNative && S3) { const L = S3.layers.find(x => x.id === 'base'); if (L && L.T) S3.updateLayer('base', { T: null }); }
    return r;
  };
  // les marqueurs des coupes sont redessinés par d'autres écrans (électrodes…) : en mode repères, ce sont les repères qui restent
  const sm0 = A0.sliceMarkers;
  A0.sliceMarkers = function () { const r = sm0 ? sm0.apply(this, arguments) : undefined; const K = this.ui.lmk; if (K && this.slices) { this.coregLandmarksMarkers(); this.slices.pickMode = K.pick ? 'lmk' : null; } return r; };
  SV.CoregUI = { headBox, adjustMatrix, initFromLandmarks, LMK };
})(window.SV = window.SV || {});
