/* EpiScope — imaging_panel.js : panneau de coupes réutilisable (écran Imagerie et volet « Coupes » de la vue des crises).
 *
 *   barre : mode de la souris (✛ curseur · ◐ contraste/luminosité · ✋ déplacer), zoom, vue d'origine (⌂), calques (image de base,
 *           superpositions empilées avec visibilité, palette, opacité, fenêtre, cible du contraste), parcellation,
 *           convention radiologique, vérification d'une électrode, PNG ;
 *   vérification d'électrode : coupes obliques alignées sur la trajectoire (deux coupes le long de l'axe, une coupe
 *           transverse au plot courant), plots nommés, ◀ ▶ (ou flèches ← →) d'un plot à l'autre, encart « cerveau de verre »
 *           (cortex du patient en transparence, électrode étudiée en surbrillance parmi les autres), scanner superposé ;
 *   état dans ui.slv (calques, fenêtres, mode, électrode), propre à chaque vue (slvKey : imagerie, localisation, stimulations,
 *   thermocoagulations, chaque crise…) et enregistré avec le dossier (d.sliceViews) ; il suit dans les coupes de la 3D.  */
(function (SV) {
  'use strict';
  const MIP_PLANES = ['sagittal', 'long1', 'long2'];   // coupes où la projection d'intensité maximale s'applique (v4.21)
  const $ = id => document.getElementById(id), S = SV.Store, V = S.V, M4 = SV.Mat4;
  const esc = SV.U.esc;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? String(s) : d.toLocaleDateString(SV.LOC); };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], norm = a => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const WL_ICON = '<svg class="wl-ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.7a6.3 6.3 0 0 1 0 12.6z" fill="currentColor"/></svg>';
  const kindOf = im => im.derived && im.derived.cmap ? im.derived.cmap : im.modality === 'PET' || im.modality === 'SPECT' ? 'pet' : im.modality === 'CT' ? 'hot' : 'gray';   // cartes calculées : leur palette (chaud / froid, chaud)   // IRM (FLAIR, T2, T1 injecté…) en gris, comme le T1
  const ROI_COLORS = ['#ff5ad1', '#4cc9f0', '#7bd389', '#ffcf4a', '#ff7a45', '#b18cff'];
  /** axes d'écran d'une coupe de normale N, aux conventions des coupes orthogonales (repère B = { ex, ey, ez }, AC-PC s'il
   *  est défini) : coupe plutôt verticale → haut du crâne en haut ; plutôt horizontale → l'avant en haut ; droite du patient
   *  à gauche de l'écran en convention radiologique (xs = −1) ; l'avant à gauche en sagittal */
  function screenAxes(N, xs, B) {
    const c = v => [dot(v, B.ex), dot(v, B.ey), dot(v, B.ez)], n = norm(N), nc = c(n);
    const proj = v => { const t = dot(v, n); return norm([v[0] - n[0] * t, v[1] - n[1] * t, v[2] - n[2] * t]); };
    const horiz = Math.abs(nc[2]) >= 0.75, V = proj(horiz ? B.ey : B.ez); let U = cross(V, n);
    const uc = c(U), sag = !horiz && Math.abs(nc[0]) > Math.abs(nc[1]);
    if (sag ? uc[1] > 0 : uc[0] * xs < 0) U = U.map(v => -v);
    return { U, V, kind: horiz ? 'dessus' : sag ? 'côté' : 'face' };
  }

  const M = {
    // ================================================================ réglages des coupes par contexte
    /** contexte des coupes : chaque écran ou mode a ses réglages (calques, fenêtres, parcellation…) — Imagerie, Localisation
     *  d'une SEEG, stimulations et thermocoagulations d'une SEEG, chaque crise, présentation du staff */
    slvKey() {
      const d = this.dossier; if (!d) return null; const scr = this.ui.screen, ctx = this.ctx || {};
      if (this._slvForce && this._slvForceHost && this._slvForceHost.isConnected) return this._slvForce;   // v5.2 : coupes intégrées (diaporama : électrodes d'une SEEG, intervention ; écran de l'intervention), tant qu'elles sont affichées
      if (scr === 'loc') return 'loc:' + ((this.ui.ce && this.ui.ce.exId) || '');
      if (scr === 'work') { const wm = this.ui.wm; if (wm === 'stim' || wm === 'thermo' || wm === 'plan') return wm + ':' + (ctx.explorationId || ''); if (ctx.seizureId) return 'sz:' + ctx.seizureId; return 'work:' + (wm || 'semio'); }
      if (scr === 'staff') return 'pres';
      return 'imaging';
    },
    /** réglages par défaut d'un contexte : stimulations / thermocoagulations — FLAIR (sinon T1), parcellation VEP légère,
     *  électrodes (scanner non superposé d'office) ; localisation — scanner en base, fenêtre osseuse ; les autres crises,
     *  stimulations ou thermocoagulations reprennent la dernière vue de leur famille */
    slvDefault(key) {
      const d = this.dossier, fam = key.split(':')[0], V = d.sliceViews || {}, last = V._last && V._last[fam];
      const rad = (() => { try { return localStorage.getItem('sv_slice_rad') !== '0'; } catch (e) { return true; } })();
      const base = { overlays: [], labels: 'none', labOpacity: 0.45, radiological: rad, mode: 'cursor', wlTarget: 'base', showElec: true, showRois: true };
      const copy = v => { const c = JSON.parse(JSON.stringify(v)); delete c.elec; delete c.elecK; delete c.pair; return c; };
      // v5.2 : électrodes d'une SEEG sur le T1 du patient (diaporama) ; régions d'une intervention (proposée ou réalisée) peintes sur le T1
      if (fam === 'pimpl') return Object.assign(base, { base: null, labels: 'none', autoCT: false, elecExs: [key.split(':')[1]] });
      if (fam === 'psurg' || fam === 'proc') return Object.assign(base, { base: null, labels: 'surg', labOpacity: 0.5, autoCT: false, showElec: false });
      if (last && last !== key && V[last] && fam !== 'loc') return copy(V[last]);
      if (fam === 'plan') { const b = this.slicePresets().find(x => x.anat); return Object.assign(base, { base: b ? b.base : null, autoCT: false }); }   // planification : une seule image (T1 injecté, sinon T1, sinon FLAIR), sans calque
      if (['sz', 'work', 'pres'].includes(fam) && V.imaging) return copy(V.imaging);   // première vue de ce genre : réglages de Dossier › Imagerie
      const ref = S.refImaging(d), reg = im => im === ref || !!(im.coreg && im.coreg.T);
      if (fam === 'stim' || fam === 'thermo') {
        const fl = d.imaging.filter(im => im.modality === 'FLAIR' && reg(im)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
        return Object.assign(base, { base: fl && fl !== ref ? fl.id : null, labels: 'none', labOpacity: 0.22, autoCT: false, showTc: fam === 'thermo' });   // v5.1 : parcellation au choix (Multimodalité)
      }
      if (fam === 'loc') {
        const W = this.ui.ce || {}, ct = (W.ctId && S.byId(d.imaging, W.ctId)) || d.imaging.find(im => im.modality === 'CT' && im.timepoint === 'postimplant') || d.imaging.find(im => im.modality === 'CT'), ok = ct && ct.coreg && ct.coreg.T;
        return Object.assign(base, { base: ok ? ct.id : null, baseWin: ok ? [-150, 2600] : null, overlays: ref && ok ? [{ id: ref.id, on: false, opacity: 0.45 }] : [] });
      }
      return base;
    },
    /** images de base proposées en un clic (si elles existent, recalées) : T1 injecté, T1, FLAIR, FLAIR + TEP ;
     *  anat = candidates à l'image par défaut de la planification, dans cet ordre */
    slicePresets() {
      const d = this.dossier; if (!d) return []; const ref = S.refImaging(d), reg = im => im === ref || !!(im.coreg && im.coreg.T);
      const rep = d.imagingRep || {}, repOf = m => { const im = rep[m] && S.byId(d.imaging, rep[m]); return im && reg(im) ? im : null; };   // v5.1 : examen « représentatif » choisi dans la liste des images
      const last = m => repOf(m) || d.imaging.filter(im => im.modality === m && reg(im) && !im.derived).sort((a, b) => (b === ref) - (a === ref) || String(b.date).localeCompare(String(a.date)))[0];
      const id = im => im && im !== ref ? im.id : null, t1c = last('T1c'), t1 = last('T1') || (ref && ref.modality !== 'T1c' ? ref : null), fl = last('FLAIR'), pet = last('PET'), out = [];
      if (t1c) out.push({ key: 't1c', label: 'T1 gado', title: 'T1 injecté (gadolinium)', base: id(t1c), overlays: [], anat: true, rank: 0 });
      if (t1) out.push({ key: 't1', label: 'T1', title: 'T1 3D', base: id(t1), overlays: [], anat: true, rank: 1 });
      if (fl) out.push({ key: 'flair', label: 'FLAIR', title: 'FLAIR 3D', base: id(fl), overlays: [], anat: true, rank: 2 });
      if (fl && pet) out.push({ key: 'flpet', label: 'TEP + FLAIR', title: 'FLAIR, TEP superposée', base: id(fl), overlays: [{ id: pet.id, on: true, opacity: 0.45 }] });
      else if (t1 && pet) out.push({ key: 't1pet', label: 'TEP + T1', title: 'T1, TEP superposée (pas de FLAIR recalée)', base: id(t1), overlays: [{ id: pet.id, on: true, opacity: 0.45 }] });
      return out;
    },
    /** preset actif : même image de base et mêmes superpositions visibles */
    slicePresetOn(P, st) { const on = (st.overlays || []).filter(o => o.on !== false).map(o => o.id).sort().join(','); return (st.base || null) === P.base && on === P.overlays.map(o => o.id).sort().join(','); },
    applySlicePreset(key) {
      const P = this.slicePresets().find(x => x.key === key); if (!P) return; const st = this.slvState();
      st.base = P.base; st.baseWin = null; st.overlays = P.overlays.map(o => Object.assign({}, st.overlays.find(x => x.id === o.id) || {}, o));
      this.updateImagingLayers().then(() => this.renderImagingBar());
    },
    slvLabel() { const k = this._slvKey || '', f = k.split(':')[0]; return { imaging: 'Dossier › Imagerie', loc: 'Localisation', stim: 'Stimulations', thermo: 'Thermocoagulations', plan: 'Planification', sz: 'cette crise', pres: 'présentation du staff', work: 'espace de travail', pimpl: 'implantation (diaporama)', psurg: 'intervention proposée', proc: 'intervention' }[f] || f; },
    slvDisplay(st) { const o = {}; for (const k of Object.keys(st || {})) if (!['elec', 'elecK', 'pair', 'mode'].includes(k)) o[k] = st[k]; return JSON.stringify(o); },
    /** change de contexte : les réglages du contexte quitté restent dans le dossier (d.sliceViews), ceux du nouveau
     *  contexte sont repris (ou créés) ; les coupes déjà montées sont mises à jour */
    slvSwitch(key) {
      const d = this.dossier, V = d.sliceViews = d.sliceViews || {}, prev = this._slvKey;
      if (prev && this.ui.slv && V[prev] === this.ui.slv && this._slvSnap != null && this.slvDisplay(this.ui.slv) !== this._slvSnap) this.touch();   // réglages modifiés : enregistrés avec le dossier
      this._slvKey = key; let st = V[key]; if (!st) { st = V[key] = this.slvDefault(key); }
      else if (/^(stim|thermo):/.test(key) && st.labels === 'vep' && st.labOpacity === 0.22 && !st.v51) { st.labels = 'none'; st.v51 = 1; }   // ancien réglage par défaut (parcellation d'office), jamais retouché
      (V._last = V._last || {})[key.split(':')[0]] = key;
      this.ui.slv = st; this._slvSnap = this.slvDisplay(st);
      if (this.slices && this._ipHost && this._ipHost.isConnected && !this._slvRefresh) {
        this._slvRefresh = setTimeout(() => {
          this._slvRefresh = null; const S3 = this.slices; if (!S3) return; const s2 = this.slvState();
          if (s2.elec) { if (!this.checkElectrode(s2.elec, true)) s2.elec = null; } else if (S3.oblique) this.exitElectrodeCheck();
          S3.setMode(s2.mode || 'cursor'); this.updateImagingLayers(); this.renderImagingBar();
        }, 0);
      }
    },
    /** réglages du contexte courant remis à leurs valeurs par défaut */
    slvReset() { const d = this.dossier, k = this._slvKey; if (d && k && d.sliceViews) { delete d.sliceViews[k]; if (d.sliceViews._last) delete d.sliceViews._last[k.split(':')[0]]; } this._slvKey = null; this.ui.slv = null; },
    /** état du panneau (migration de l'ancienne superposition unique) */
    slvState() {
      const key = this.slvKey(); if (key && key !== this._slvKey) this.slvSwitch(key);
      const st = this.ui.slv = this.ui.slv || {};
      if (!st.overlays) { st.overlays = []; if (st.overlay) st.overlays.push({ id: st.overlay, on: true, opacity: st.opacity == null ? 0.5 : st.opacity }); delete st.overlay; }
      return Object.assign(st, Object.assign({ base: null, labels: 'none', labOpacity: 0.45, radiological: true, mode: 'cursor', wlTarget: 'base', elec: null, elecK: 0, showElec: true, showRois: true }, st));
    },
    /** ajoute (ou affiche) une superposition */
    addOverlay(imId, on) {
      const st = this.slvState(); let o = st.overlays.find(x => x.id === imId);
      if (!o) { const im = S.byId(this.dossier.imaging, imId); if (!im) return; o = { id: imId, on: true, opacity: im.modality === 'CT' ? 0.6 : 0.5 }; st.overlays.push(o); }
      if (on !== false) o.on = true; return o;
    },

    // ================================================================ montage
    async mountImagingPanel(host, o) {
      const d = this.dossier; if (!host || !d) return;
      this._slvForce = (o && o.key) || null; this._slvForceHost = this._slvForce ? host : null;   // contexte imposé par l'appelant (sinon : écran, mode, crise)
      const ref = S.refImaging(d), st = this.slvState(), tok = this._ipMount = (this._ipMount || 0) + 1;
      const space = host === $('sliceDock') && this.ui.screen === 'work' && this.dockSpace ? this.dockSpace() : 'pat';   // v5.1 : volet de l'espace de travail sur le gabarit MNI
      host.classList.add('ip-host'); host.innerHTML = '<div class="ip-bar"></div><div class="ip-slices"></div>';
      const box = host.querySelector('.ip-slices');
      if (!ref && space !== 'tpl') { box.innerHTML = '<div class="hint" style="padding:30px">Ajoutez au moins un T1 (référence) pour afficher les coupes : écran Imagerie (F7).</div>'; return; }
      let refVol; try { refVol = space === 'tpl' ? (await this.tplVolumes()).t1 : await this.imagingVolume(ref); } catch (e) { box.innerHTML = `<div class="hint" style="padding:30px">${esc(e.message)}</div>`; return; }
      if (tok !== this._ipMount || !box.isConnected) return;   // montage plus récent, ou écran redessiné entre-temps
      const view = S0 => ({ cursor: S0.cursor.slice(), zoom: S0.zoom, viewC: S0.viewC && !S0.oblique ? S0.viewC.slice() : null, pan: !S0.oblique ? S0.pan.map(q => q.slice()) : null });
      const keep = this.slices && this.slices.ref === refVol ? view(this.slices) : this._ipSpace === space ? this._slvView || null : null;
      if (this.slices) { this._slvView = view(this.slices); this.slices.destroy(); }
      const S3 = this.slices = new SV.Slices(box, { radiological: st.radiological, main: st.main || 'axial' }); this._ipHost = host; this._ipSpace = space;
      S3.onMain = k => { this.slvState().main = k; };
      S3.labelName = (Lr, v) => Lr.names ? Lr.names(v) : v;
      S3.setReference(refVol); S3.setAlign(space === 'tpl' ? null : this.acpcAxes()); if (keep) { S3.cursor = keep.cursor.slice(); S3.zoom = keep.zoom || 1; if (keep.viewC) S3.viewC = keep.viewC.slice(); if (keep.pan) S3.pan = keep.pan.map(q => q.slice()); }
      S3.setMode(st.mode); S3.wlTarget = st.wlTarget; S3.markerAlpha = st.elecAlpha != null ? st.elecAlpha : 1;
      S3.onWindow = L => { if (L.id === 'base') st.baseWin = L.win.slice(); else { const o = st.overlays.find(x => 'ov:' + x.id === L.id); if (o) o.win = L.win.slice(); } this.syncSlices3d(); const lr = host.querySelector('.ipl-win-' + (L.id === 'base' ? 'base' : L.id.slice(3))); if (lr) lr.textContent = Math.round(L.win[0]) + '–' + Math.round(L.win[1]); };
      S3.onCursor = p => {
        this._slvView = { cursor: p.slice(), zoom: S3.zoom, viewC: S3.viewC && !S3.oblique ? S3.viewC.slice() : null, pan: !S3.oblique ? S3.pan.map(q => q.slice()) : null };
        const q = this.slvToView(p); if (q) { if (this.slices3dShown && this.slices3dShown()) this.setSlices3dCursor(q); if (this.ui.screen === 'work' && this.viewer && this.viewer.setProbe && !['stim', 'thermo'].includes(this.ui.wm)) this.viewer.setProbe(q); }   // stimulations, thermocoagulations : le halo marque la paire choisie (stim3d)
        if (st.elec) this.updateElecInset();
      };
      S3.onPick = (p, plane, e) => this.onSlicePick && this.onSlicePick(p, plane, e);
      if (this.ui.ce && this.ui.ce.pick) S3.pickMode = 'elec';
      this.renderImagingBar();
      await this.updateImagingLayers();
      if (st.elec && !this.checkElectrode(st.elec, true)) { st.elec = null; this.renderImagingBar(); }
      return S3;
    },
    imagingKind(im) { return kindOf(im); },
    /** parcellation « activation de la crise » des coupes : suit le temps de la vue des crises (au plus ~3 fois par seconde) */
    refreshActSlices() {
      if (this._actT) return; this._actT = setTimeout(() => {
        this._actT = null; const S3 = this.slices, st = this.slvState(); if (!S3 || st.labels !== 'act') return;
        const lab = this.sliceLabelLayer && this.sliceLabelLayer('act'); if (lab) S3.updateLayer('lab', { lut: lab.lut, names: lab.names });
      }, 300);
    },
    /** coupes de la vue 3D recalculées après un changement de calque ou de fenêtre (regroupé) */
    syncSlices3d() { clearTimeout(this._s3t); this._s3t = setTimeout(() => { if (this.updateSlices3d && this.slices3dShown && this.slices3dShown()) this.updateSlices3d(); }, 120); },
    /** calques des coupes d'après l'état : image de base, superpositions (dans l'ordre), parcellation */
    async updateImagingLayers() {
      const d = this.dossier, S3 = this.slices, st = this.slvState(); if (!S3 || !d) return;
      if (this.slvSpace() === 'tpl') {   // gabarit : T1 MNI, parcellation du gabarit, électrodes (pas d'images du patient, ni ROI, ni contours)
        const T = await this.tplVolumes(); if (S3 !== this.slices) return;
        const lab = st.labels && st.labels !== 'seg' && this.sliceLabelLayer && this.sliceLabelLayer(st.labels, 'tpl');
        S3.setLayers([{ id: 'base', name: 'T1 MNI', vol: T.t1, T: null, kind: st.baseKind || 'gray', opacity: 1, win: null }].concat(lab ? [Object.assign(lab, { opacity: st.labOpacity })] : [])); S3.wlTarget = 'base';
        if (st.elec) this.electrodeCheckMarkers(); else if (this.sliceMarkers) this.sliceMarkers();
        S3.setRois([]); if (S3.setContours) S3.setContours([]);
        if (this.updateSlices3d && this.slices3dShown && this.slices3dShown()) this.updateSlices3d();
        return;
      }
      const ref = S.refImaging(d), baseIm = (st.base && S.byId(d.imaging, st.base)) || ref; if (!baseIm) return;
      const tok = this._ipTok = (this._ipTok || 0) + 1;
      const layers = [];
      try {
        const bv = await this.imagingVolume(baseIm);
        layers.push({ id: 'base', name: V.modality[baseIm.modality] || baseIm.modality, vol: bv, T: baseIm !== ref && baseIm.coreg && baseIm.coreg.T ? M4.from(baseIm.coreg.T) : null, kind: st.baseKind || 'gray', opacity: 1, win: st.baseWin || null, mip: baseIm.modality === 'CT' ? st.baseMip || 0 : 0, mipPlanes: MIP_PLANES });
        for (const o of st.overlays) {
          const im = S.byId(d.imaging, o.id); if (!im || im === baseIm) continue;
          const vol = await this.imagingVolume(im), ct = im.modality === 'CT';
          const D0 = im.derived || {}; layers.push({ id: 'ov:' + im.id, name: (im.modality === 'other' && im.derived ? '' : (V.modality[im.modality] || im.modality) + ' · ') .replace(/ · $/, '') + (im.derived ? (im.modality === 'other' ? '' : ' · ') + (im.derived.short || 'dérivée') : o.native ? ' (sans recalage)' : ''), vol, T: !o.native && im !== ref && im.coreg && im.coreg.T ? M4.from(im.coreg.T) : null, mip: o.mip || 0, mipPlanes: MIP_PLANES, kind: o.kind || kindOf(im), opacity: o.opacity == null ? (D0.cmap ? 0.8 : 0.5) : o.opacity, visible: o.on !== false, win: o.win || (ct ? [500, 3000] : D0.win ? D0.win.slice() : null), threshold: ct ? (o.threshold == null ? 500 : o.threshold) : D0.thr != null ? D0.thr : null, unregistered: im !== ref && !(im.coreg && im.coreg.T) });
        }
      } catch (e) { this.toast(e.message, 4000); }
      if (tok !== this._ipTok || S3 !== this.slices) return;
      const lab = this.sliceLabelLayer && this.sliceLabelLayer(st.labels); if (lab) layers.push(Object.assign(lab, { opacity: st.labOpacity }));
      S3.setLayers(layers); S3.wlTarget = st.wlTarget === 'base' ? 'base' : 'ov:' + st.wlTarget;
      if (st.elec) this.electrodeCheckMarkers(); else if (this.sliceMarkers) this.sliceMarkers();
      this.sliceRois(); this.updateContours();
      if (this.updateSlices3d && this.slices3dShown && this.slices3dShown()) this.updateSlices3d();
    },
    /** contours de l'anatomie calculée, pour vérifier la segmentation : surface piale (maillage du cortex de la 3D, rouge) et
     *  interface substance blanche / substance grise (segmentation aparc+aseg, jaune, comme dans FreeSurfer) */
    updateContours() {
      const S3 = this.slices, st = this.slvState(), A = this.patientAnat; if (!S3 || !S3.setContours) return;
      const C = st.contours || {}, out = []; if (!A || this.slvSpace() === 'tpl') { S3.setContours([]); return; }
      if (C.pial) {
        if (!this._pialWorld || this._pialWorld.A !== A) {
          const Di = A.fromDisplay, parts = [];
          for (const h of ['lh', 'rh']) { const H = A.atlas.hemis[h]; if (!H || !H.pial) continue; const P = new Float32Array(H.pial.length); for (let i = 0; i < P.length; i += 3) { const q = M4.apply(Di, H.pial[i], H.pial[i + 1], H.pial[i + 2]); P[i] = q[0]; P[i + 1] = q[1]; P[i + 2] = q[2]; } parts.push({ kind: 'mesh', pos: P, faces: H.faces, color: '#ff5a5a' }); }
          this._pialWorld = { A, parts };
        }
        out.push(...this._pialWorld.parts);
      }
      if (C.white && A.segVol) {
        if (!this._whiteMask || this._whiteMask.A !== A) {
          const names = A.meta.names || [], inside = new Uint8Array(256), re = /Cerebral-White-Matter|Lateral-Ventricle|Inf-Lat-Vent|Thalamus|Caudate|Putamen|Pallidum|Accumbens|VentralDC|^CC_|3rd-Ventricle|WM-hypo|choroid/i;
          names.forEach((n, i) => { if (i < 256 && re.test(n)) inside[i] = 1; });
          if (!names.length) { inside[85] = inside[86] = 1; }
          this._whiteMask = { A, part: { kind: 'mask', vol: A.segVol, inside, color: '#ffd23f', width: 1.2 } };
        }
        out.push(this._whiteMask.part);
      }
      S3.setContours(out);
    },
    /** ROI annotées du dossier (calque « ROI ») dans les coupes et dans la vue 3D */
    sliceRois() {
      const d = this.dossier, st = this.slvState(), L = d && st.showRois !== false && this.slvSpace() !== 'tpl' ? (d.rois || []).filter(r => r.visible !== false) : [];
      if (this.slices) this.slices.setRois(L.map(r => ({ kind: r.kind, p: r.p, r: r.r, label: r.label, color: r.color, sel: this._roiSel === r.id })));
      if (this.viewerRois) this.viewerRois();
    },
    /** menu ROI : liste (afficher, libellé, couleur, rayon, aller à, replacer au réticule, supprimer), ajout au réticule */
    roiMenu(anchor) {
      const d = this.dossier, st = this.slvState(), S3 = this.slices, panel = h('div', 'cell-panel ip-rois'); if (!d || !S3) return;
      const save = (r, msg) => { this.touch('roi', r ? r.id : null, msg || (r ? r.label : 'ROI')); this.sliceRois(); if (msg) { const b = this._ipHost && this._ipHost.querySelector('.ip-bar [data-a=rois]'); if (b) { const n = (d.rois || []).length; b.textContent = 'ROI' + (n ? ' (' + n + ')' : '') + ' ▾'; b.classList.toggle('on', !!n); } } };
      const draw = () => {
        const R = d.rois || [];
        panel.innerHTML = `<div class="ctx-head">ROI annotées <label class="chip" style="margin-left:auto"><input type="checkbox" class="all"${st.showRois !== false ? ' checked' : ''}> afficher</label></div>
          ${R.map(r => `<div class="roi-row" data-id="${r.id}"><input type="checkbox" class="vis"${r.visible !== false ? ' checked' : ''} title="afficher cette ROI"><span class="roi-k" title="${esc(V.roiKind[r.kind])}">${r.kind === 'arrow' ? '➘' : '◯'}</span><input class="lb" value="${esc(r.label)}" placeholder="libellé (ex. DCF ?)">
            <span class="roi-cols">${ROI_COLORS.map(c => `<button data-c="${c}" class="${r.color === c ? 'on' : ''}" style="background:${c}" title="couleur"></button>`).join('')}</span>
            ${r.kind === 'sphere' ? `<label class="small" title="rayon (mm)"><input type="range" class="rad" min="2" max="25" value="${r.r}"> <span class="mono">${r.r} mm</span></label>` : ''}
            <button class="mini-btn" data-a="go" title="placer le réticule sur la ROI">⌖</button><button class="mini-btn" data-a="here" title="replacer la ROI au réticule">↧</button><b class="x" data-a="rm" title="supprimer">✕</b>
            <input class="nt" value="${esc(r.notes || '')}" placeholder="note (vue en staff, dans le compte rendu)">${(d.lesions || []).length ? `<select class="les" title="lésion à laquelle cette ROI se rapporte (compte rendu : une ligne par lésion ou ROI)"><option value="">— ROI libre (sans lésion)</option>${d.lesions.map(l => `<option value="${l.id}"${r.lesionId === l.id ? ' selected' : ''}>lésion : ${esc(l.label || V.lesionType[l.type] || '')}</option>`).join('')}</select>` : ''}</div>`).join('') || '<div class="hint">Aucune ROI. Placez le réticule sur la zone d’intérêt (dysplasie suspectée, lésion…), puis ajoutez une sphère ou une flèche.</div>'}
          <div class="btnrow"><button class="mini-btn primary" data-add="sphere">+ sphère au réticule</button><button class="mini-btn" data-add="arrow">+ flèche au réticule</button></div>
          <div class="hint">Coordonnées dans le monde du T1 de référence ; affichées dans les coupes (et la vue 3D avec l’anatomie du patient), en staff et dans le compte rendu.</div>`;
        panel.querySelector('.all').onchange = e => { st.showRois = e.target.checked; this.sliceRois(); };
        panel.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const k = b.dataset.add, n = (d.rois || []).length; const r = S.addRoi(d, { kind: k, p: S3.cursor.slice(), r: 5, label: k === 'arrow' ? 'Flèche ' + (n + 1) : 'ROI ' + (n + 1), color: ROI_COLORS[n % ROI_COLORS.length], by: SV.Library.user }); st.showRois = true; save(r, 'ROI ajoutée'); draw(); const lb = panel.querySelector(`.roi-row[data-id="${r.id}"] .lb`); if (lb) { lb.focus(); lb.select(); } });
        panel.querySelectorAll('.roi-row').forEach(row => {
          const r = S.byId(d.rois, row.dataset.id);
          row.querySelector('.vis').onchange = e => { r.visible = e.target.checked; save(r); };
          row.querySelector('.lb').oninput = e => { r.label = e.target.value; save(r); };
          row.querySelector('.nt').oninput = e => { r.notes = e.target.value; this.touch('roi', r.id, r.label); };
          const ls = row.querySelector('.les'); if (ls) ls.onchange = () => { r.lesionId = ls.value || null; this.touch('roi', r.id, r.label); };
          row.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { r.color = b.dataset.c; save(r); draw(); });
          const rd = row.querySelector('.rad'); if (rd) rd.oninput = e => { r.r = +e.target.value; e.target.nextElementSibling.textContent = r.r + ' mm'; save(r); };
          row.querySelector('[data-a=go]').onclick = () => { if (st.elec) this.exitElectrodeCheck(); S3.setCursor(r.p); };
          row.querySelector('[data-a=here]').onclick = () => { r.p = S3.cursor.slice(); save(r, 'ROI déplacée'); };
          row.querySelector('[data-a=rm]').onclick = () => { if (!confirm(`Supprimer « ${r.label} » ?`)) return; S.remove(d, 'roi', r.id); save(null, 'ROI supprimée'); draw(); };
        });
      };
      draw(); const rc = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], Math.min(rc.left, window.innerWidth - 600), rc.bottom + 4);
    },

    // ================================================================ barre d'outils
    renderImagingBar() {
      const host = this._ipHost, bar = host && host.querySelector('.ip-bar'), S3 = this.slices, st = this.slvState(), d = this.dossier; if (!bar || !S3) return;
      const anat = this.patientAnat, E = st.elec ? this.findWorldElectrode(st.elec) : null;
      // stimulations, thermocoagulations : barre allégée (paire ◀ ▶, zoom, calques, PNG) ; le reste dans « ⋯ »
      const planC = this.ui.screen === 'work' && this.ui.wm === 'plan', compact = (!!E && this.ui.screen === 'work' && ['stim', 'thermo'].includes(this.ui.wm)) || planC;
      const tpl = this.slvSpace() === 'tpl', spaceH = this.slvSpaceHtml ? this.slvSpaceHtml() : '';
      const PR = tpl ? [] : this.slicePresets(), quickH = PR.length >= 1 ? `<div class="seg ip-quick" title="image de base en un clic (réglages fins : Calques ▾)">${PR.map(P => `<button data-preset="${P.key}" class="${this.slicePresetOn(P, st) ? 'on' : ''}" title="${esc(P.title)}">${esc(P.label)}</button>`).join('')}</div>` : '';
      const modeH = `<div class="seg ip-mode" title="action de la souris dans les coupes">${[['cursor', '✛', 'curseur : cliquer / glisser'], ['wl', WL_ICON, 'contraste et luminosité : glisser ↔ contraste, ↕ luminosité (sans déplacer le curseur) — aussi Maj + glisser dans le mode curseur'], ['pan', '✋', 'déplacer la vue (aussi clic droit + glisser)']].map(([m, i, t]) => `<button data-m="${m}" class="${st.mode === m ? 'on' : ''}" title="${t}">${i}</button>`).join('')}</div>`;
      const zoomH = `<button class="mini-btn" data-a="zin" title="zoom +">＋</button><button class="mini-btn" data-a="zout" title="zoom −">－</button>`;
      const resetH = `<button class="mini-btn ip-home" data-a="reset" title="vue d’origine : recentrer, zoom 1, contraste par défaut"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2.2 7.6 8 2.6l5.8 5M3.9 6.3v7.2h3V9.9h2.2v3.6h3V6.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg></button>`;
      const layersH = tpl ? '' : `<button class="mini-btn" data-a="layers" title="image de base, superpositions, électrodes, ROI, fenêtres">Calques ▾</button>`;
      const elecH = `<button class="mini-btn${E ? ' on' : ''}" data-a="elec" title="aligner les coupes sur une électrode (vérification)">Électrode ▾</button>`;
      const nMulti = [st.labels && st.labels !== 'none', st.showElec !== false, st.showRois !== false && (d.rois || []).length, st.showTc, (st.contours || {}).pial || (st.contours || {}).white].filter(Boolean).length;
      const multiH = `<button class="mini-btn${nMulti ? ' on' : ''}" data-a="multi" title="ce qui s’affiche par-dessus les images : parcellation, valeurs, contours, électrodes (de quelle exploration), ROI, thermocoagulations">Multimodalité ▾</button>`;
      const optH = `<button class="mini-btn" data-a="opts" title="options des coupes : convention radiologique, réglages par défaut">⚙</button>`;
      const pngH = `<button class="mini-btn" data-a="shot" title="capture des coupes : galerie (à montrer au staff, à lier à une lésion), fichier PNG, presse-papiers">Capture ▾</button>`
        + (this.ui.screen === 'loc' && this.loc3dOn ? `<button class="mini-btn${this.loc3dOn() ? ' on' : ''}" data-a="loc3d" title="vue 3D à droite des coupes : électrodes reconstruites et projet d’implantation, pour les reconnaître et les nommer">3D</button>` : '');
      if (compact) {
        const lab = !E ? '' : st.pair ? `${E.name}${st.pair[0] + 1}–${E.name}${st.pair[1] + 1}` : `${E.name} · plot ${st.elecK + 1}/${E.pts.length}`;
        const orH = E && !planC ? `<div class="seg ip-orient" title="orientation des coupes : le long de l’électrode, ou axiale / coronale / sagittale conventionnelles (le curseur suit la paire)">${[['axis', 'Axe'], ['ortho', 'Ax/Cor/Sag']].map(([k, l]) => `<button data-or="${k}" class="${(k === 'ortho') === !!st.elecOrtho ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';
        bar.innerHTML = `${spaceH}${quickH}${E ? `<span class="ip-elec ip-pairnav"><button class="mini-btn" data-a="prev" title="${st.pair ? 'paire précédente' : 'plot précédent'} (←)">◀</button><b class="ip-pair">${esc(lab)}</b><button class="mini-btn" data-a="next" title="${st.pair ? 'paire suivante' : 'plot suivant'} (→)">▶</button>${planC ? '<button class="mini-btn" data-a="ortho" title="revenir aux coupes axiale, coronale, sagittale">✕</button>' : ''}</span>` : ''}${orH}${modeH}${zoomH}${resetH}${layersH}<span class="spacer"></span>${pngH}<button class="mini-btn" data-a="more" title="autres outils : ROI, parcellation, radiologique, contours, électrode, coupes axiale / coronale / sagittale">⋯</button>`;
      } else bar.innerHTML = `${spaceH}${quickH}${modeH}${zoomH}${resetH}${layersH}${multiH}${elecH}
        ${E ? `<span class="ip-elec"><b>${esc(E.name)}</b> <span class="muted">${{ real: 'réelle', detected: 'détectée', planned: 'prévue' }[E.kind]}</span> <button class="mini-btn" data-a="prev" title="plot précédent (←)">◀</button> plot <b class="ip-k">${st.elecK + 1}</b>/${E.pts.length} <button class="mini-btn" data-a="next" title="plot suivant (→)">▶</button>${this.locEditable && this.locEditable(E) ? `<button class="mini-btn${this.ui.plotEdit ? ' on primary' : ''}" data-a="pedit" title="éditer les plots dans les coupes : glisser un anneau pour le déplacer, cliquer ailleurs pour ajouter un plot, clic droit sur un anneau pour le retirer">✎ plots</button>${this.ui.plotEdit && this.locUndoN && this.locUndoN() ? `<button class="mini-btn" data-a="pundo" title="annuler la dernière modification des plots">↶</button>` : ''}` : ''}<button class="mini-btn" data-a="ortho" title="revenir aux coupes axiale, coronale, sagittale">✕ axial/cor/sag</button></span>` : ''}
        <span class="spacer"></span>${pngH}${optH}`;
      const bind = (root, inMenu) => {
        const act = a => root.querySelector(`[data-a=${a}]`), on = (a, f) => { const b = act(a); if (b) b.onclick = ev => { if (inMenu) this.closeMenu(); f(ev); }; };
        root.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { if (inMenu) this.closeMenu(); this.applySlicePreset(b.dataset.preset); });
        root.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => this.setDockSpace(b.dataset.sp));
        root.querySelectorAll('[data-or]').forEach(b => b.onclick = () => { st.elecOrtho = b.dataset.or === 'ortho'; if (st.elec) this.checkElectrode(st.elec, true); this.renderImagingBar(); });
        root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { st.mode = b.dataset.m; S3.setMode(st.mode); if (inMenu) this.closeMenu(); this.renderImagingBar(); });
        on('zin', () => S3.setZoom(S3.zoom * 1.25)); on('zout', () => S3.setZoom(S3.zoom / 1.25));
        on('reset', () => { S3.resetView(); S3.resetWindow(S3.wlTarget); });
        const lay = act('layers'); if (lay) lay.onclick = e => this.layersMenu(compact ? bar.querySelector('[data-a=layers]') : e.currentTarget);
        const mu = act('multi'); if (mu) mu.onclick = e => { if (inMenu) this.closeMenu(); this.multiMenu(compact ? bar : e.currentTarget); };
        const op = act('opts'); if (op) op.onclick = e => { if (inMenu) this.closeMenu(); this.sliceOptionsMenu(compact ? bar : e.currentTarget); };
        const roi = act('rois'); if (roi) roi.onclick = e => this.roiMenu(compact ? bar : e.currentTarget);
        const lb = root.querySelector('.ip-lab'); if (lb) lb.onchange = e => { st.labels = e.target.value; this.updateImagingLayers(); };
        root.querySelectorAll('.ip-cp, .ip-cw').forEach(cb => cb.onchange = () => { st.contours = Object.assign({}, st.contours, { [cb.classList.contains('ip-cp') ? 'pial' : 'white']: cb.checked }); this.updateContours(); });
        const rd = root.querySelector('.ip-rad'); if (rd) rd.onchange = e => { st.radiological = e.target.checked; if (!st.elec) S3.setOrtho(st.radiological); else this.checkElectrode(st.elec, true); };
        const el = act('elec'); if (el) el.onclick = e => this.electrodeMenu(compact ? bar : e.currentTarget);
        const step = dir => compact && S3.onStep ? S3.onStep(dir) : this.stepElectrode(dir);
        on('prev', () => step(-1)); on('next', () => step(1)); on('ortho', () => this.exitElectrodeCheck());
        on('pedit', () => { this.ui.plotEdit = !this.ui.plotEdit; this.electrodeCheckMarkers(); this.renderImagingBar(); if (this.ui.plotEdit) this.toast('Édition des plots : glisser un anneau pour le déplacer · clic ailleurs = plot ajouté · clic droit sur un anneau = plot retiré · ↶ annule', 6000); });
        on('pundo', () => this.locUndo && this.locUndo());
        on('loc3d', () => this.loc3dToggle());
        const sh = act('shot'); if (sh) sh.onclick = e => { const r = e.currentTarget.getBoundingClientRect(); this.popupMenu([{ head: 'Capture des coupes' }, { label: 'Ranger dans la galerie (imagerie)', run: () => capGal() }, { label: 'Copier (coller dans Word, PowerPoint)', run: async () => { const ok = SV.Clip && await SV.Clip.copyImage(S3.snapshot()); this.toast(ok ? 'Coupes copiées' : 'Copie impossible', 2000); } }, { label: 'Enregistrer en PNG', run: () => pngDl() }], Math.min(r.left, window.innerWidth - 300), r.bottom + 4); };
        const pngDl = () => { const u = S3.snapshot(), a = document.createElement('a'); a.href = u; a.download = 'EpiScope_coupes.png'; a.click(); };
        const capGal = async () => { if (!this.galleryAdd) return; const u = S3.snapshot(), b = await (await fetch(u)).blob(), base = (st.base && S.byId(d.imaging, st.base)) || S.refImaging(d), c = S3.cursor || [0, 0, 0];
          const what = tpl ? 'gabarit MNI' : base ? (V.modality[base.modality] || base.modality) : '';
          const g = (await this.galleryAdd([new File([b], 'coupes.png', { type: 'image/png' })], Object.assign({ modality: 'imaging', kind: '', title: `Coupes ${what} (${c.map(v => Math.round(v)).join(', ')} mm${tpl ? ' MNI305' : ''})` }, this.ctx && this.ui.screen === 'work' ? { explorationId: this.ctx.explorationId || null, seizureId: this.ctx.seizureId || null } : {})))[0];
          if (g) { g.date = S.today(); this.touch('gallery', g.id, g.title); this.toast('Capture des coupes rangée dans la galerie (imagerie) : à montrer au staff, à lier à une lésion depuis la Synthèse', 4000); } };
      };
      bind(bar, false);
      const more = bar.querySelector('[data-a=more]');
      if (more) more.onclick = () => {
        const panel = h('div', 'cell-panel ip-more');
        panel.innerHTML = `<div class="ctx-head">Coupes · autres outils</div><div class="row"><span>Affichage</span>${multiH}${optH}</div><div class="row"><span>Électrode</span>${elecH}<button class="mini-btn" data-a="ortho" title="revenir aux coupes axiale, coronale, sagittale">✕ coupes axiale / coronale / sagittale</button></div>`;
        bind(panel, true); const r = more.getBoundingClientRect(); this.popupMenu([{ node: panel }], r.right - 380, r.bottom + 4);
      };
    },
    sliceLabHtml(st) { const anat = this.patientAnat;
      return `<select class="ip-lab" title="parcellation affichée"><option value="none">parcellation —</option>${anat ? `<option value="vep"${st.labels === 'vep' ? ' selected' : ''}>régions VEP</option><option value="act"${st.labels === 'act' ? ' selected' : ''}>activation de la crise</option><option value="seg"${st.labels === 'seg' ? ' selected' : ''}>segmentation</option><option value="quant"${st.labels === 'quant' ? ' selected' : ''} title="régions colorées par la valeur maximale (ou moyenne) des plots qu'elles contiennent, pour le jeu affiché dans Analyses (EI, cEI, PEI, taux…)">valeurs (Analyses)</option>` : ''}<option value="lesion"${st.labels === 'lesion' ? ' selected' : ''}>lésions</option>${this._slvSurg ? `<option value="surg"${st.labels === 'surg' ? ' selected' : ''}>régions de l’intervention</option>` : ''}</select>`;
    },
    sliceContourHtml(st) { const anat = this.patientAnat;
      return anat ? `<span class="ip-contours" title="contours de l'anatomie calculée, pour vérifier la segmentation"><label class="chip" title="surface piale : maillage du cortex utilisé dans la 3D (rouge)"><input type="checkbox" class="ip-cp"${(st.contours || {}).pial ? ' checked' : ''}> <i class="ct-sw" style="background:#ff5a5a"></i>piale</label><label class="chip" title="interface substance blanche / substance grise, d'après la segmentation (jaune)"><input type="checkbox" class="ip-cw"${(st.contours || {}).white ? ' checked' : ''}> <i class="ct-sw" style="background:#ffd23f"></i>SB / SG</label></span>` : '';
    },
    /** v5.1 — « Multimodalité » : ce qui s'affiche par-dessus les images (parcellation et valeurs, contours, électrodes et de
     *  quelle exploration, ROI annotées, volumes de thermocoagulation) ; les calques d'images restent dans « Calques » */
    multiMenu(anchor) {
      const d = this.dossier, st = this.slvState(), S3 = this.slices, panel = h('div', 'cell-panel ip-multi');
      const exs = S.explorationsSorted(d).filter(e => e.electrodes.length || e.ctDetect), W = this.worldElectrodes(), sel = new Set(st.elecExs || []);
      const draw = () => {
        const ct = this.sliceContourHtml(st);
        panel.innerHTML = `<div class="ctx-head">Multimodalité · par-dessus les coupes</div>
          <div class="ipm-sec"><div class="ipm-h">Parcellation, valeurs</div><div class="row">${this.sliceLabHtml(st)}<input type="range" class="lop" min="0" max="100" value="${Math.round(st.labOpacity * 100)}" title="opacité"></div>${ct ? `<div class="row">${ct}</div>` : ''}</div>
          <div class="ipm-sec"><div class="ipm-h"><label class="chip"><input type="checkbox" class="sel"${st.showElec !== false ? ' checked' : ''}> Électrodes</label><span class="muted small">réelles, détectées, prévues</span></div>
            ${exs.length > 1 ? `<div class="row">${exs.map(e => `<label class="chip"><input type="checkbox" data-ex="${e.id}"${sel.size ? (sel.has(e.id) ? ' checked' : '') : (W.ex === e ? ' checked' : '')}> ${esc(e.label)}${e.start ? ' · ' + fmtDate(e.start) : ''}</label>`).join('')}</div>` : exs.length ? `<div class="muted small">${esc(exs[0].label)}</div>` : '<div class="muted small">aucune électrode dans le dossier</div>'}
            <div class="row"><span>opacité</span><input type="range" class="eop" min="10" max="100" step="5" value="${Math.round((st.elecAlpha != null ? st.elecAlpha : 1) * 100)}"></div></div>
          <div class="ipm-sec"><div class="ipm-h"><label class="chip"><input type="checkbox" class="sroi"${st.showRois !== false ? ' checked' : ''}> ROI annotées (${(d.rois || []).length})</label><button class="mini-btn" data-a="rois">gérer…</button></div></div>
          <div class="ipm-sec"><label class="chip" title="volume théorique d'une thermocoagulation standard (ellipsoïde entre les deux plots), dans la couleur de son étape"><input type="checkbox" class="stc"${st.showTc ? ' checked' : ''}> volumes de thermocoagulation</label></div>`;
        const lb = panel.querySelector('.ip-lab'); if (lb) lb.onchange = e => { st.labels = e.target.value; this.updateImagingLayers(); this.renderImagingBar(); };
        panel.querySelector('.lop').oninput = e => { st.labOpacity = +e.target.value / 100; S3.updateLayer('lab', { opacity: st.labOpacity }); this.syncSlices3d(); };
        panel.querySelectorAll('.ip-cp, .ip-cw').forEach(cb => cb.onchange = () => { st.contours = Object.assign({}, st.contours, { [cb.classList.contains('ip-cp') ? 'pial' : 'white']: cb.checked }); this.updateContours(); this.renderImagingBar(); });
        panel.querySelector('.sel').onchange = e => { st.showElec = e.target.checked; if (st.elec) this.electrodeCheckMarkers(); else if (this.sliceMarkers) this.sliceMarkers(); this.renderImagingBar(); };
        panel.querySelectorAll('[data-ex]').forEach(cb => cb.onchange = () => { const s2 = new Set(panel.querySelectorAll('[data-ex]:checked').length ? [...panel.querySelectorAll('[data-ex]:checked')].map(x => x.dataset.ex) : []); st.elecExs = [...s2]; if (st.elec) this.electrodeCheckMarkers(); else if (this.sliceMarkers) this.sliceMarkers(); });
        panel.querySelector('.eop').oninput = e => this.setElecAlpha(+e.target.value / 100);
        panel.querySelector('.sroi').onchange = e => { st.showRois = e.target.checked; this.sliceRois(); this.renderImagingBar(); };
        panel.querySelector('[data-a=rois]').onclick = () => { this.closeMenu(); this.roiMenu(anchor); };
        panel.querySelector('.stc').onchange = e => { st.showTc = e.target.checked; if (this.sliceThermo) this.sliceThermo(); this.renderImagingBar(); };
      };
      draw(); const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], Math.min(r.left, window.innerWidth - 460), r.bottom + 4);
    },
    // ---------------------------------------------------------------- redressement AC-PC (v5.1)
    /** axes du repère AC-PC défini sur l'IRM de référence (null : pas de redressement, ou désactivé dans cette vue) */
    acpcAxes() { const d = this.dossier, ref = d && S.refImaging(d), st = this.ui.slv; return ref && ref.acpc && ref.acpc.ex && !(st && st.align === false) ? ref.acpc : null; },
    /** repère à partir de AC, PC et d'un point haut de la scissure interhémisphérique : y = PC → AC, x = normale au plan
     *  médian (vers la droite), z = x × y (vers le haut) */
    acpcFrame(ac, pc, mid) {
      const ey0 = norm(sub(ac, pc)); let ex = norm(cross(ey0, sub(mid, pc))); if (ex[0] < 0) ex = ex.map(v => -v);
      const ez = norm(cross(ex, ey0)), ey = norm(cross(ez, ex)); return ez[2] < 0 ? null : { ex, ey, ez };
    },
    /** outil : poser AC, PC et un point médian haut au curseur des coupes de l'IRM de référence, puis appliquer à toutes les coupes */
    acpcTool() {
      const d = this.dossier, ref = S.refImaging(d), S3 = this.slices, host = this._ipHost; if (!ref || !S3 || !host) return;
      const P = this._acpc = Object.assign({}, ref.acpc ? { ac: ref.acpc.ac, pc: ref.acpc.pc, mid: ref.acpc.mid } : {}), old = host.querySelector('.acpc-tool'); if (old) old.remove();
      const box = h('div', 'acpc-tool'); host.appendChild(box); const f = p => p ? p.map(v => v.toFixed(0)).join(', ') : '—';
      const draw = () => {
        box.innerHTML = `<b>Redresser les coupes (AC-PC)</b><span class="muted small">placer le curseur, puis :</span>
          <button class="mini-btn${P.ac ? ' on' : ''}" data-k="ac" title="commissure antérieure (coupe sagittale médiane)">AC ← curseur</button><span class="mono small">${f(P.ac)}</span>
          <button class="mini-btn${P.pc ? ' on' : ''}" data-k="pc" title="commissure postérieure">PC ← curseur</button><span class="mono small">${f(P.pc)}</span>
          <button class="mini-btn${P.mid ? ' on' : ''}" data-k="mid" title="un point haut de la scissure interhémisphérique (plan médian, au-dessus des commissures)">médian haut ← curseur</button><span class="mono small">${f(P.mid)}</span>
          <span class="spacer"></span>${ref.acpc ? '<button class="mini-btn danger" data-a="off" title="revenir aux axes de l’IRM">retirer</button>' : ''}<button class="mini-btn primary" data-a="ok"${P.ac && P.pc && P.mid ? '' : ' disabled'}>appliquer à toutes les coupes</button><button class="mini-btn" data-a="x">✕</button>`;
        box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { P[b.dataset.k] = S3.cursor.slice(); draw(); });
        box.querySelector('[data-a=x]').onclick = () => box.remove();
        const off = box.querySelector('[data-a=off]'); if (off) off.onclick = () => { delete ref.acpc; this.touch('imaging', ref.id, 'redressement AC-PC retiré'); S3.setAlign(null); box.remove(); };
        box.querySelector('[data-a=ok]').onclick = () => { const F = this.acpcFrame(P.ac, P.pc, P.mid); if (!F) { this.toast('Repère incohérent : le point médian doit être au-dessus de la ligne AC-PC', 4000); return; }
          ref.acpc = Object.assign({ ac: P.ac, pc: P.pc, mid: P.mid, at: S.now() }, F); this.touch('imaging', ref.id, 'redressement AC-PC'); const st = this.slvState(); st.align = true; S3.setAlign(F); box.remove();
          this.toast('Coupes redressées sur la ligne AC-PC et le plan interhémisphérique (toutes les images recalées, toutes les vues ; ⚙ pour désactiver)', 5000); };
      };
      draw();
    },
    /** options générales des coupes : convention (radiologique / neurologique), redressement AC-PC, réglages par défaut */
    sliceOptionsMenu(anchor) {
      const st = this.slvState(), S3 = this.slices, panel = h('div', 'cell-panel ip-opts'), ref = S.refImaging(this.dossier);
      panel.innerHTML = `<div class="ctx-head">Options des coupes</div>
        <div class="row"><span>Convention</span><span class="seg"><button data-r="1" class="${st.radiological ? 'on' : ''}" title="droite du patient à gauche de l’écran">radiologique</button><button data-r="0" class="${st.radiological ? '' : 'on'}" title="droite du patient à droite de l’écran">neurologique</button></span></div>
        <div class="row"><span>AC-PC</span>${ref && ref.acpc ? `<label class="chip"><input type="checkbox" class="al"${st.align !== false ? ' checked' : ''}> coupes redressées</label>` : '<span class="muted small">non défini</span>'}<button class="mini-btn" data-a="acpc" title="placer AC, PC et un point médian sur l’IRM de référence">${ref && ref.acpc ? 'modifier…' : 'définir…'}</button></div>
        <div class="hint">Réglages propres à cette vue (${esc(this.slvLabel())}), retrouvés en y revenant.</div><div class="btnrow"><button class="mini-btn" data-a="reset">réglages par défaut de ces coupes</button></div>`;
      panel.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { st.radiological = b.dataset.r === '1'; try { localStorage.setItem('sv_slice_rad', st.radiological ? '1' : '0'); } catch (e) { } if (!st.elec) S3.setOrtho(st.radiological); else this.checkElectrode(st.elec, true); this.closeMenu(); });
      const al = panel.querySelector('.al'); if (al) al.onchange = () => { st.align = al.checked; S3.setAlign(this.acpcAxes()); };
      panel.querySelector('[data-a=acpc]').onclick = () => { this.closeMenu(); if (st.elec) this.exitElectrodeCheck(); this.acpcTool(); };
      panel.querySelector('[data-a=reset]').onclick = () => { this.slvReset(); this.closeMenu(); this.slvState(); this.updateImagingLayers(); this.renderImagingBar(); this.toast('Réglages par défaut de ces coupes', 2000); };
      const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], Math.min(r.left, window.innerWidth - 360), r.bottom + 4);
    },
    /** calques : base, superpositions (visibilité, palette, opacité, fenêtre, cible du contraste), ajout */
    layersMenu(anchor) {
      const d = this.dossier, st = this.slvState(), ref = S.refImaging(d), S3 = this.slices, panel = h('div', 'cell-panel ip-layers');
      const L = id => S3.layers.find(x => x.id === id), CM = SV.Slices.CMAP_FR;
      const mipSel = v => `<label class="ipl-mip" title="projection d’intensité maximale sur une tranche épaisse : les électrodes du scanner apparaissent en entier sur la coupe sagittale (et sur les coupes le long de l’axe d’une électrode), pour reconnaître les électrodes voisines"><span>MIP</span><select class="mip"><option value="0"${!v ? ' selected' : ''}>non</option>${[10, 20, 30, 50].map(x => `<option value="${x}"${v === x ? ' selected' : ''}>${x} mm</option>`).join('')}</select></label>`;
      const draw = () => {
        const baseIm = (st.base && S.byId(d.imaging, st.base)) || ref, used = new Set(st.overlays.map(o => o.id).concat([baseIm.id]));
        const imgs = d.imaging.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const lbl = im => im.derived && im.modality === 'other' ? (im.label || im.derived.short) : `${V.modality[im.modality] || im.modality}${im.derived ? ' · ' + (im.derived.short || 'dérivée') : ''} ${V.timepoint[im.timepoint] || ''} ${fmtDate(im.date)}${im !== ref && !(im.coreg && im.coreg.T) ? ' (non recalée)' : ''}`;
        const bl = L('base');
        panel.innerHTML = `<div class="ctx-head">Calques des coupes</div>
          <div class="ipl-row base"><label class="ipl-radio" title="cible du contraste à la souris"><input type="radio" name="wlt" value="base"${st.wlTarget === 'base' ? ' checked' : ''}>${WL_ICON}</label><b>Base</b><select class="ipl-base">${imgs.map(im => `<option value="${im.id}"${im === baseIm ? ' selected' : ''}>${esc(lbl(im))}</option>`).join('')}</select><select class="cm-base" title="palette de l’image de base">${Object.entries(CM).map(([k, f]) => `<option value="${k}"${(st.baseKind || 'gray') === k ? ' selected' : ''}>${f}</option>`).join('')}</select><span class="mono small ipl-win-base">${bl && bl.win ? Math.round(bl.win[0]) + '–' + Math.round(bl.win[1]) : ''}</span><button class="mini-btn" data-rw="base" title="fenêtre par défaut">⟲</button>${baseIm.modality === 'CT' ? mipSel(st.baseMip || 0) : ''}</div>
          ${st.overlays.map((o, i) => { const im = S.byId(d.imaging, o.id); if (!im || im === baseIm) return ''; const l = L('ov:' + o.id); return `<div class="ipl-row" data-i="${i}"><label class="ipl-radio" title="cible du contraste à la souris"><input type="radio" name="wlt" value="${o.id}"${st.wlTarget === o.id ? ' checked' : ''}>${WL_ICON}</label><input type="checkbox" class="on"${o.on !== false ? ' checked' : ''} title="afficher"><span class="nm">${esc(lbl(im))}</span>
            <select class="cm">${Object.entries(CM).map(([k, f]) => `<option value="${k}"${(o.kind || kindOf(im)) === k ? ' selected' : ''}>${f}</option>`).join('')}</select><input type="range" class="op" min="0" max="100" value="${Math.round((o.opacity == null ? 0.5 : o.opacity) * 100)}" title="opacité">
            <span class="mono small ipl-win-${o.id}">${l && l.win ? Math.round(l.win[0]) + '–' + Math.round(l.win[1]) : ''}</span><button class="mini-btn" data-rw="ov:${o.id}" title="fenêtre par défaut">⟲</button><button class="mini-btn" data-up="${i}" title="${i === 0 ? 'monter : devient l’image de base (la base actuelle passe en superposition)' : 'monter d’un rang (dessinée sous les suivantes)'}">↑</button><b class="x" data-rm="${i}" title="retirer">✕</b>${im.modality === 'CT' ? mipSel(o.mip || 0) : ''}</div>`; }).join('')}
          <div class="ipl-row"><select class="ipl-add"><option value="">+ superposition…</option>${imgs.filter(im => !used.has(im.id)).map(im => `<option value="${im.id}">${esc(lbl(im))}</option>`).join('')}</select></div>
          <div class="ipl-foot muted small">Parcellation, électrodes, ROI : « Multimodalité ▾ » · convention, réglages par défaut : ⚙</div>`;
        panel.querySelector('.cm-base').onchange = e => { st.baseKind = e.target.value; S3.updateLayer('base', { kind: st.baseKind }); this.syncSlices3d(); };
        panel.querySelector('.ipl-base').onchange = e => { st.base = e.target.value === (ref && ref.id) ? null : e.target.value; st.baseWin = null; this.updateImagingLayers().then(draw); };
        const bm = panel.querySelector('.ipl-row.base .mip'); if (bm) bm.onchange = e => { st.baseMip = +e.target.value || 0; S3.updateLayer('base', { mip: st.baseMip, mipPlanes: MIP_PLANES }); };
        panel.querySelectorAll('input[name=wlt]').forEach(r => r.onchange = () => { st.wlTarget = r.value; S3.wlTarget = r.value === 'base' ? 'base' : 'ov:' + r.value; });
        panel.querySelectorAll('.ipl-row[data-i]').forEach(row => {
          const o = st.overlays[+row.dataset.i];
          row.querySelector('.on').onchange = e => { o.on = e.target.checked; S3.updateLayer('ov:' + o.id, { visible: o.on }); this.syncSlices3d(); };
          row.querySelector('.cm').onchange = e => { o.kind = e.target.value; S3.updateLayer('ov:' + o.id, { kind: o.kind }); this.syncSlices3d(); };
          row.querySelector('.op').oninput = e => { o.opacity = +e.target.value / 100; S3.updateLayer('ov:' + o.id, { opacity: o.opacity }); this.syncSlices3d(); };
          const mp = row.querySelector('.mip'); if (mp) mp.onchange = e => { o.mip = +e.target.value || 0; S3.updateLayer('ov:' + o.id, { mip: o.mip, mipPlanes: MIP_PLANES }); };
        });
        panel.querySelectorAll('[data-rw]').forEach(b => b.onclick = () => { S3.resetWindow(b.dataset.rw); draw(); });
        panel.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { st.overlays.splice(+b.dataset.rm, 1); this.updateImagingLayers().then(draw); });
        // ↑ : vers la base ; la première superposition qui monte devient la base, l'ancienne base redescend en superposition
        panel.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up;
          if (i > 0) { const [o] = st.overlays.splice(i, 1); st.overlays.splice(i - 1, 0, o); }
          else { const o = st.overlays[0], oldBase = (st.base && S.byId(d.imaging, st.base)) || ref; st.overlays.splice(0, 1); if (oldBase) st.overlays.unshift({ id: oldBase.id, on: true, opacity: 0.5, kind: st.baseKind && st.baseKind !== 'gray' ? st.baseKind : undefined }); st.base = o.id === (ref && ref.id) ? null : o.id; st.baseKind = o.kind || kindOf(S.byId(d.imaging, o.id) || {}); if (st.baseKind === 'pet') st.baseKind = 'pet'; st.baseWin = null; if (st.wlTarget === o.id) st.wlTarget = 'base'; }
          this.updateImagingLayers().then(() => { draw(); this.renderImagingBar(); }); });
        panel.querySelector('.ipl-add').onchange = e => { if (e.target.value) { this.addOverlay(e.target.value); this.updateImagingLayers().then(draw); } };

      };
      draw(); const r = anchor.getBoundingClientRect(); this.popupMenu([{ node: panel }], Math.min(r.left, window.innerWidth - 560), r.bottom + 4);
    },

    // ================================================================ vérification d'une électrode
    /** électrodes dans le monde du T1 : réelles (validées), détectées sur le scanner (non validées), prévues (portées sur
     *  le patient par la transformation gabarit → patient) ; exploration : celle de la carte Électrodes, sinon le contexte */
    worldElectrodes() {
      const d = this.dossier, A = this.patientAnat; if (!d) return { ex: null, list: [] };
      const cx = this.ctx && S.byId(d.explorations, this.ctx.explorationId), wsp = cx && this.state && this.state.electrodes && this.state.electrodes.length ? this.state.electrodes : null;
      const ex = (['imaging', 'loc'].includes(this.ui.screen) && this.ui.ce && this.ui.ce.exId && S.byId(d.explorations, this.ui.ce.exId)) || (cx && (wsp || cx.electrodes.length) && cx) || S.explorationsSorted(d).filter(e => e.kind === 'seeg').pop() || S.explorationsSorted(d).filter(e => e.electrodes.length).pop();
      if (!ex) return { ex: null, list: [] };
      // v5.1 : explorations choisies dans « Multimodalité » (plusieurs SEEG possibles), sinon celle du contexte
      const want = ((this.ui.slv && this.ui.slv.elecExs) || []).map(id => S.byId(d.explorations, id)).filter(Boolean), exList = want.length ? want : [ex], out = [];
      for (const ex2 of exList) {
      // schéma de la vue des crises s'il s'agit de la même exploration (modifications pas encore rangées dans le dossier)
      const specs = ex2 === cx && wsp ? wsp : ex2.electrodes;
      for (const spec of specs) {
        let o = null;   // v5.1 : positions dans l'espace des coupes (monde du T1, ou gabarit MNI)
        if (spec.real && spec.real.contacts && spec.real.contacts.length) o = this.elecToSlv({ key: 'r:' + spec.id, id: spec.id, name: spec.name, kind: 'real', pts: spec.real.contacts, tip: spec.real.tip || spec.real.contacts[0], entry: spec.real.entry || spec.real.contacts[spec.real.contacts.length - 1], hemi: spec.hemi }, 'w');
        else if (spec.plan && spec.plan.tip) { const P = spec.plan, dir = norm(sub(P.entry, P.tip)), n = P.n || 12; o = this.elecToSlv({ key: 'p:' + spec.id, id: spec.id, name: spec.name, kind: 'planned', surgical: true, pts: SV.CTElec.contacts(P.tip, dir, n), tip: P.tip, entry: P.entry, hemi: spec.hemi }, 'w'); }
        else if (spec.target && this.vol) { const e = SV.Electrodes.build(spec, this.atlas, this.vol); if (e) o = this.elecToSlv({ key: 'p:' + spec.id, id: spec.id, name: spec.name, kind: 'planned', pts: e.contacts.map(c => c.xyz), tip: e.tip, entry: e.entry, hemi: spec.hemi }, 't'); }
        if (o) out.push(o);
      }
      const det = ex2.ctDetect; if (det) for (const it of det.items) if (!out.some(o => o.kind === 'real' && o.name === it.name)) { const o = this.elecToSlv({ key: 'd:' + it.id, id: it.id, name: it.name || '?', kind: 'detected', pts: it.contacts, tip: it.tip, entry: it.entry, hemi: it.hemi }, 'w'); if (o) out.push(o); }
      }
      return { ex: want[0] || ex, list: out };
    },
    /** trajectoire prévue d'une électrode du schéma, dans le monde du T1 (planification chirurgicale, sinon gabarit porté sur le patient) */
    plannedWorld(specId) {
      const d = this.dossier, A = this.patientAnat; if (!specId || !d) return null;
      const spec = d.explorations.flatMap(e => e.electrodes).find(e => e.id === specId) || (this.state.electrodes || []).find(e => e.id === specId) || d.explorations.flatMap(e => e.implantPlan ? e.implantPlan.electrodes : []).find(e => e.id === specId); if (!spec) return null;
      if (spec.plan && spec.plan.tip) { const tip = this.toSlv(spec.plan.tip, 'w'), entry = this.toSlv(spec.plan.entry, 'w'); return tip && entry ? { tip, entry } : null; }
      if (spec.target && this.vol) { const e = SV.Electrodes.build(spec, this.atlas, this.vol); if (e) { const tip = this.toSlv(e.tip, 't'), entry = this.toSlv(e.entry, 't'); return tip && entry ? { tip, entry } : null; } }
      return null;
    },
    detectedItem(id) { const d = this.dossier; for (const ex of d.explorations) if (ex.ctDetect) { const it = ex.ctDetect.items.find(x => x.id === id); if (it) return it; } return null; },
    findWorldElectrode(key) { return this.worldElectrodes().list.find(e => e.key === key) || null; },
    /** électrode du schéma (identifiant de la spécification) → clé de vérification (réelle, sinon prévue) */
    worldKeyOf(id) { const L = this.worldElectrodes().list; const e = L.find(x => x.id === id && x.kind === 'real') || L.find(x => x.id === id && x.kind === 'planned'); return e ? e.key : null; },
    /** clé d'une électrode même si elle n'est pas localisable dans l'espace des coupes actuel (réelle vue sur le gabarit sans anatomie) */
    worldKeyOfAny(id) { const sp = this.dossier && this.dossier.explorations.flatMap(e => e.electrodes).find(s => s.id === id); return sp && sp.real && sp.real.contacts && sp.real.contacts.length ? 'r:' + id : null; },
    /** vue des crises : ouvre le volet « Coupes » aligné sur l'électrode (bouton « coupes » d'une électrode) */
    async checkElectrodeInDock(id, k) {
      if (!this.dossier || !S.refImaging(this.dossier)) { this.toast('Coupes IRM : ouvrez le dossier du patient et importez son T1 (écran Imagerie)', 4500); return; }
      const key = this.worldKeyOf(id) || this.worldKeyOfAny(id); if (!key) { this.toast(this.patientAnat ? 'Électrode non localisable sur l’IRM' : 'Électrode prévue : calculez d’abord l’anatomie du patient (écran Imagerie) pour la porter sur son IRM', 5000); return; }
      const st = this.slvState(); st.elec = key; st.elecK = k || 0; st.pair = null;
      const want = /^p:/.test(key) ? null : 'pat';   // réelle ou détectée : vérification sur l'IRM du patient
      if (want && this.dockSpace() !== want) { this.ui.dockSpace = want; if (this.ui.dock && this._ipHost === $('sliceDock')) { await this.mountImagingPanel($('sliceDock')); return; } }
      if (this.ui.dock && this.slices && this._ipHost === $('sliceDock')) this.checkElectrode(key); else await this.toggleDock(true);
    },
    /** clic sur un plot ou une électrode en 3D, volet ouvert : les coupes suivent */
    dockFollowElectrode(id, k) {
      const st = this.slvState(), key = this.worldKeyOf(id); if (!key || !this.slices) return; const E = this.findWorldElectrode(key);
      if (st.elec) { st.elecK = k || 0; if (st.elec !== key) this.checkElectrode(key, true); else this.stepElectrode(0); }
      else if (E) this.slices.setCursor(E.pts[Math.max(0, Math.min(E.pts.length - 1, k || 0))]);
    },
    /** volet « Coupes » de la vue des crises */
    async toggleDock(on) {
      on = on == null ? !this.ui.dock : !!on; this.ui.dock = on;
      const dock = $('sliceDock'), hd = $('dockHandle'), b = $('btnDock'); if (!dock) return;
      dock.hidden = !on; if (hd) hd.hidden = !on; if (b) b.classList.toggle('on', on);
      if (on) {
        if (!this.dossier) dock.innerHTML = '<div class="hint" style="padding:24px">Coupes de l’IRM : ouvrez le dossier d’un patient (écran Patients) et importez son T1 (écran Imagerie).</div>';
        else await this.mountImagingPanel(dock);
      } else {
        if (this.slices && this._ipHost === dock) { this._slvView = { cursor: this.slices.cursor.slice(), zoom: this.slices.zoom }; this.slices.destroy(); this.slices = null; this._ipHost = null; }
        dock.innerHTML = ''; if (this.viewer && this.viewer.setProbe && !['stim', 'thermo'].includes(this.ui.wm)) this.viewer.setProbe(null);
      }
      setTimeout(() => this.viewer && this.viewer.resize(), 30);
    },
    /** vue 3D : glisser = contraste / luminosité des coupes IRM affichées dans la 3D (la vue ne tourne plus) */
    toggle3dWL(on) {
      on = on == null ? !this.ui.wl3d : !!on;
      if (on && !(this.slices3dShown && this.slices3dShown() && this.viewer && this.viewer._sl)) { this.toast('Contraste à la souris en 3D : affichez d’abord les coupes IRM dans la vue (⚙ de la vue → coupes IRM). Dans les coupes du volet « Coupes IRM », utilisez le bouton ◐.', 6000); on = false; }
      this.ui.wl3d = on; const b = $('btn3dWL'); if (b) b.classList.toggle('on', on);
      this.viewer.setDragMode(on ? 'wl' : null, (dx, dy, ph) => this.drag3dWL(dx, dy, ph));
      if (on) this.toast('◐ glisser ↔ contraste, ↕ luminosité (calque choisi dans « Calques ») — recliquez ◐ pour faire tourner la vue', 4000);
    },
    drag3dWL(dx, dy, phase) {
      const src = this.viewer && this.viewer._sl, st = this.slvState(); if (!src) { if (phase === 'start') this.toggle3dWL(false); return; }   // coupes 3D retirées entre-temps : la vue tourne de nouveau
      const tgt = (st.wlTarget !== 'base' && (src.overlays || []).find(o => o.id === st.wlTarget)) || src.base;
      if (phase === 'start') { this._wl3 = tgt.win.slice(); return; }
      const w0 = this._wl3[1] - this._wl3[0], c0 = (this._wl3[0] + this._wl3[1]) / 2, ww = Math.max(1e-3, w0 * Math.exp(-dx / 180)), c = c0 + dy * w0 / 260;
      tgt.win = [c - ww / 2, c + ww / 2]; this.viewer.refreshSlices();
      if (phase === 'end') {
        const win = tgt.win.slice();
        if (tgt === src.base) { st.baseWin = win; if (this.slices) this.slices.updateLayer('base', { win: win.slice() }); }
        else { const o = st.overlays.find(x => x.id === tgt.id); if (o) o.win = win; if (this.slices) this.slices.updateLayer('ov:' + tgt.id, { win: win.slice() }); }
      }
    },
    /** poignée de redimensionnement du volet */
    bindDockHandle() {
      const hd = $('dockHandle'), dock = $('sliceDock'); if (!hd || !dock) return;
      hd.addEventListener('pointerdown', e => {
        hd.setPointerCapture(e.pointerId); const box = dock.parentElement.getBoundingClientRect();
        const mv = ev => { const w = Math.max(280, Math.min(box.width - 260, box.right - ev.clientX)); dock.style.width = w + 'px'; this.viewer && this.viewer.resize(); };
        const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); try { localStorage.setItem(this.ui.wm === 'plan' && this.ui.screen === 'work' ? 'episcope.dockW.plan' : 'episcope.dockW', dock.style.width); } catch (_) { } };
        hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up);
      });
      try { const w = localStorage.getItem('episcope.dockW'); if (w) dock.style.width = w; } catch (_) { }
    },
    electrodeMenu(anchor) {
      const W = this.worldElectrodes(), st = this.slvState();
      if (!W.list.length) { this.toast(W.ex ? `${W.ex.label} : aucune électrode localisable (scanner non traité, ou anatomie du patient non calculée pour porter le schéma prévu)` : 'Aucune exploration avec des électrodes', 5000); return; }
      const items = [{ head: `Vérifier une électrode — ${W.ex.label}` }];
      for (const [k, t] of [['real', 'réelles (scanner, validées)'], ['detected', 'détectées sur le scanner (à valider)'], ['planned', 'prévues (portées sur le patient)']]) {
        const L = W.list.filter(e => e.kind === k); if (!L.length) continue; items.push({ head: t });
        for (const e of L.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }))) items.push({ label: `${e.name} · ${e.pts.length} plots${st.elec === e.key ? ' ✓' : ''}`, run: () => { st.elecK = 0; st.pair = null; this.checkElectrode(e.key); } });
      }
      if (st.elec) items.push({ label: '✕ revenir aux coupes axiale, coronale, sagittale', run: () => this.exitElectrodeCheck() });
      const r = anchor.getBoundingClientRect(); this.popupMenu(items, Math.min(r.left, window.innerWidth - 360), r.bottom + 4);
    },
    /** coupes alignées sur l'électrode : (1) et (2) le long de l'axe, (3) transverse au plot courant */
    checkElectrode(key, quiet) {
      const S3 = this.slices, st = this.slvState(), E = this.findWorldElectrode(key); if (!S3 || !E) return false;
      st.elec = key; st.elecK = Math.max(0, Math.min(E.pts.length - 1, st.elecK || 0));
      // v5.1 : deux coupes contenant l'axe (la plus verticale, puis la plus horizontale) et une coupe transverse ; chacune
      // orientée comme les coupes orthogonales (screenAxes) : le haut du crâne reste en haut pour une électrode oblique
      const Ax = norm(sub(E.entry, E.tip)), xs = st.radiological ? -1 : 1, al = this.slvSpace() !== 'tpl' && this.acpcAxes ? this.acpcAxes() : null;
      const Bz = al && al.ex ? { ex: al.ex, ey: al.ey, ez: al.ez } : { ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] };
      S3.opts.radiological = st.radiological; if (!S3.oblique) this._zoomBeforeElec = S3.zoom;
      S3.onStep = dir => this.stepElectrode(dir);
      const mid = [0, 1, 2].map(i => (E.tip[i] + E.entry[i]) / 2);
      if (st.elecOrtho) { if (S3.oblique) S3.setOrtho(st.radiological); S3.setViewCenter(mid); }   // coupes axiale, coronale, sagittale conventionnelles, le curseur suit les plots
      else {
        const vz = Math.abs(dot(Ax, Bz.ez)) < 0.95 ? cross(Ax, Bz.ez) : sub(Bz.ey, Ax.map(v => v * dot(Bz.ey, Ax))), N1 = norm(vz), N2 = norm(cross(Ax, N1));
        const F1 = screenAxes(N1, xs, Bz), F2 = screenAxes(N2, xs, Bz), Ft = screenAxes(Ax, xs, Bz);
        S3.setOblique([
          { key: 'long1', fr: `${E.name} · le long de l’axe, vue de ${F1.kind}`, U: F1.U, V: F1.V, N: N1 },
          { key: 'long2', fr: `${E.name} · le long de l’axe, vue de ${F2.kind}`, U: F2.U, V: F2.V, N: N2 },
          { key: 'trans', fr: `${E.name} · transverse`, U: Ft.U, V: Ft.V, N: Ax },
        ], { elec: key });
        // cadrage : l'électrode (et 15 mm autour) occupe l'essentiel de la largeur des coupes longitudinales
        const len = Math.hypot(...sub(E.entry, E.tip)); S3.zoom = Math.max(1.4, Math.min(4, S3.fov * 0.8 / (len + 30)));
        S3.setViewCenter(mid);   // l'électrode reste centrée et immobile ; le réticule passe d'un plot à l'autre
      }
      // le scanner superposé aide à juger le métal
      const ct = st.autoCT !== false && this.slvSpace() !== 'tpl' && this.dossier.imaging.find(im => im.modality === 'CT' && im.coreg && im.coreg.T); if (ct && st.base !== ct.id && !st.overlays.some(o => o.id === ct.id && o.on !== false)) { this.addOverlay(ct.id); this.updateImagingLayers(); }
      this.stepElectrode(0); this.renderImagingBar(); this.updateElecInset();
      if (!quiet) this.toast(`${E.name} : coupes alignées sur la trajectoire — ◀ ▶ ou flèches ← → pour passer d’un plot à l’autre, ↑ ↓ pour glisser la coupe`, 5000);
      return true;
    },
    stepElectrode(dir) {
      const st = this.slvState(), E = st.elec && this.findWorldElectrode(st.elec), S3 = this.slices; if (!E || !S3) return;
      st.elecK = Math.max(0, Math.min(E.pts.length - 1, (st.elecK || 0) + dir));
      if (!st.elecOrtho) S3.frames[2].sub = st.pair ? `paire ${st.pair[0] + 1}-${st.pair[1] + 1}` : `plot ${st.elecK + 1}/${E.pts.length}`;
      // l'électrode reste immobile à l'écran (centrée) pendant que le curseur glisse d'un plot à l'autre
      const pr = st.pair && E.pts[st.pair[0]] && E.pts[st.pair[1]] ? [0, 1, 2].map(i => (E.pts[st.pair[0]][i] + E.pts[st.pair[1]][i]) / 2) : null;
      S3.setCursor(pr || E.pts[st.elecK]); this.electrodeCheckMarkers();
      const b = this._ipHost && this._ipHost.querySelector('.ip-k'); if (b) b.textContent = st.elecK + 1; else this.renderImagingBar();
    },
    exitElectrodeCheck() { const st = this.slvState(); st.elec = null; this.ui.plotEdit = false; if (this.slices) { this.slices.editMarkers = false; this.slices.onMarkerEdit = null; if (this._zoomBeforeElec != null) this.slices.zoom = this._zoomBeforeElec; this._zoomBeforeElec = null; this.slices.setOrtho(st.radiological); this.slices.onStep = null; this.slices.setInset(null); } this.renderImagingBar(); if (this.sliceMarkers) this.sliceMarkers(); },
    /** plots de l'électrode étudiée (nommés, en surbrillance), plots des autres électrodes atténués */
    electrodeCheckMarkers() {
      const S3 = this.slices, st = this.slvState(), W = this.worldElectrodes(), E = W.list.find(e => e.key === st.elec); if (!S3 || !E) return;
      const mk = [], shafts = [];
      for (const e of W.list) { if (e === E || st.showElec === false || (this.sliceElecFilter && !this.sliceElecFilter(e))) continue; e.pts.forEach((p, k) => mk.push({ p, r: 1.2, color: 'rgba(150,170,190,.6)', label: k === e.pts.length - 1 ? e.name : '' })); shafts.push({ a: e.tip, b: e.entry, color: 'rgba(150,170,190,.3)', width: 1 }); }
      const inPair = k => st.pair ? k === st.pair[0] || k === st.pair[1] : k === st.elecK;
      const edit = !!this.ui.plotEdit && !!this.locEditable && this.locEditable(E);
      E.pts.forEach((p, k) => { const lab = inPair(k) || k === 0 || k === E.pts.length - 1; mk.push({ p, r: 1.3, ring: true, num: k + 1, color: inPair(k) ? '#ffffff' : edit ? '#7fe3ff' : '#ffcf4a', sel: inPair(k), halo: inPair(k), label: lab ? (inPair(k) ? E.name + (k + 1) : k === E.pts.length - 1 ? E.name : '') : '', showLabel: lab, edit: edit ? k : null, ek: E.key }); });
      S3.editMarkers = edit; S3.onMarkerEdit = edit ? (kind, m, p) => this.locContactEdit(kind, m, p) : null;
      shafts.push({ a: E.tip, b: E.entry, color: 'rgba(255,207,74,.7)', width: 1.6 });
      // trajectoire prévue (schéma, ou planification chirurgicale) en pointillé, pour juger l'écart de la pose
      const pw = E.kind !== 'planned' && this.plannedWorld(E.kind === 'detected' ? (this.detectedItem(E.id) || {}).planId : E.id);
      if (pw) { shafts.push({ a: pw.tip, b: pw.entry, color: 'rgba(255,140,60,.85)', width: 1.4, dash: true }); mk.push({ p: pw.tip, r: 1, color: 'rgba(255,140,60,.9)', label: 'prévue', showLabel: true }); }
      S3.setMarkers(mk); S3.setShafts(shafts); this.updateElecInset();
    },
    /** encart : cortex du patient en verre (monde du T1), électrodes, celle étudiée en surbrillance ; vue latérale de son côté + dessus */
    updateElecInset() {
      const S3 = this.slices, st = this.slvState(), A = this.patientAnat; if (!S3) return;
      if (!st.elec || (this.ui.screen === 'loc' && this.loc3dOn && this.loc3dOn())) { S3.setInset(null); return; }   // localisation avec la vue 3D : l'encart ferait doublon
      const W = this.worldElectrodes(), E = W.list.find(e => e.key === st.elec); if (!E) { S3.setInset(null); return; }
      const tpl = this.slvSpace() === 'tpl', key = tpl ? 'tpl' : A;
      if (!this._insetPts || this._insetPts.A !== key) {
        let pts = new Float32Array(0);
        if (tpl && this.atlas) { const out = []; for (const H of [this.atlas.hemis.lh, this.atlas.hemis.rh]) for (let v = 0; v < H.n; v += 1) out.push(H.pial[3 * v], H.pial[3 * v + 1], H.pial[3 * v + 2]); pts = Float32Array.from(out); }
        else if (A && A.atlas && A.atlas.patient) { const Di = A.fromDisplay, n = A.atlas.hemis.lh.n + A.atlas.hemis.rh.n, step = Math.max(1, Math.round(n / 24000)), out = []; for (const H of [A.atlas.hemis.lh, A.atlas.hemis.rh]) for (let v = 0; v < H.n; v += step) { const q = M4.apply(Di, H.pial[3 * v], H.pial[3 * v + 1], H.pial[3 * v + 2]); out.push(q[0], q[1], q[2]); } pts = Float32Array.from(out); }
        this._insetPts = { A: key, pts };
      }
      const side = !tpl && A && A.sideOf ? A.sideOf(E.tip) : (E.tip[0] < 0 ? 'L' : 'R');
      const views = [{ U: side === 'L' ? [0, -1, 0] : [0, 1, 0], V: [0, 0, 1], title: side === 'L' ? 'latéral G' : 'latéral D' }, { U: [1, 0, 0], V: [0, 1, 0], title: 'dessus' }];
      const prev = S3.inset, same = prev && prev.points === this._insetPts.pts && prev.views[0].title === views[0].title;
      S3.onInsetPick = name => this.selectElectrodeByName && this.selectElectrodeByName(name);
      S3.setInset({ points: this._insetPts.pts.length ? this._insetPts.pts : Float32Array.from(W.list.flatMap(e => e.pts).flat()), views, bounds: same ? prev.bounds : null, elecs: W.list.map(e => ({ name: e.name, pts: e.pts, sel: e === E })), cursor: S3.cursor });
    },
  };
  M.viewerRois = function () {
    const V3 = this.viewer, A = this.patientAnat, d = this.dossier; if (!V3 || !V3.setRois) return;
    const st = this.slvState(); if (!A || !d || st.showRois === false) { V3.setRois([]); return; }
    V3.setRois((d.rois || []).filter(r => r.visible !== false).map(r => ({ kind: r.kind, p: this.worldToView(r.p), r: r.r, color: r.color, label: r.label })).filter(r => r.p));
  };
  Object.assign(SV.app, M);
  // ROI de la vue 3D refaites avec les électrodes (ouverture d'un contexte, changement d'anatomie)
  const rb0 = SV.app.rebuildElectrodes;
  if (rb0) SV.app.rebuildElectrodes = function () { const r = rb0.apply(this, arguments); try { if (this.viewerRois) this.viewerRois(); } catch (e) { console.warn(e); } return r; };
})(window.SV = window.SV || {});
