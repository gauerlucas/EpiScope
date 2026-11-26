/* EpiScope — layers_extra.js (v3.2.0) : calques supplémentaires des coupes, par-dessus la parcellation choisie.
 *
 * « Multimodalité ▾ » n'affichait qu'une information à la fois (parcellation, valeurs, intervention…). Les calques
 * supplémentaires s'y ajoutent, chacun avec sa case (st.extraLabs, dans l'ordre de dessin) :
 *   - surg   : régions cibles de l'intervention, déclarées sur l'atlas VEP (réséquée, partielle, déconnectée ; ZE des
 *              hypothèses comprise ou non) — celles de l'écran de l'intervention, sinon de la dernière intervention ;
 *   - cavity : volume de résection segmenté sur l'IRM post-opératoire (masque rangé par resection_ui.js), voile blanc et
 *              contour — distinct des régions cibles, qui restent visibles dessous ;
 *   - onset  : régions des plots marqués de la crise ouverte (début, précoce, tardive) ;
 *   - lesion : régions des lésions déclarées.
 * Gabarit MNI : les images du patient (et la cavité) passent par l'affine patient → gabarit de l'anatomie calculée.  */
(function (SV) {
  'use strict';
  const S = SV.Store, M4 = SV.Mat4, esc = SV.U.esc;
  const XL = [
    ['surg', 'régions cibles de l’intervention', 'régions déclarées sur l’atlas VEP : réséquée (rouge), en partie (orangé), déconnectée (violet) ; ZE des hypothèses comprise (rouge sombre) ou hors intervention (bleu)'],
    ['cavity', 'volume de résection segmenté', 'cavité segmentée sur l’IRM post-opératoire recalée (voile et contour blancs)'],
    ['onset', 'régions des plots de la crise', 'régions contenant les plots marqués début (rouge), précoce (orangé), tardive (jaune)'],
    ['lesion', 'lésions', 'régions des lésions déclarées (magenta)'],
  ];

  const M = {
    /** image du masque de la cavité : celle de l'intervention des coupes, sinon de la dernière intervention */
    cavityImaging() {
      const d = this.dossier; if (!d) return null; const P = (this._slvSurg && this._slvSurg.proc) || S.lastSurgery(d), id = P && P.resection && P.resection.cavity && P.resection.cavity.imagingId;
      return id ? S.byId(d.imaging, id) : null;
    },
    /** calques supplémentaires possibles dans ce contexte */
    extraLayerKinds() {
      const d = this.dossier; if (!d) return []; const anat = !!this.vepVolFor && !!this.vepVolFor(), out = [];
      for (const [k, l, t] of XL) {
        if (k === 'surg' && !(anat && (this._slvSurg || S.lastSurgery(d)))) continue;
        if (k === 'cavity' && !this.cavityImaging()) continue;
        if (k === 'onset' && !(anat && this.ui.wm === 'semioSeeg' && this.ui.screen === 'work')) continue;
        if (k === 'lesion' && !(anat && S.lesionRegions && S.lesionRegions(d).length)) continue;
        out.push({ k, l, t });
      }
      return out;
    },
    /** calques à ajouter (après la parcellation) ; async : la cavité est un volume à lire */
    async extraLayers(space) {
      const st = this.slvState(), on = new Set(st.extraLabs || []), avail = new Set(this.extraLayerKinds().map(x => x.k)), out = [], tpl = space === 'tpl';
      for (const [k] of XL) {
        if (!on.has(k) || !avail.has(k) || (k === st.labels)) continue;
        if (k === 'cavity') {
          const im = this.cavityImaging(); if (!im) continue; let vol; try { vol = await this.imagingVolume(im); } catch (e) { continue; }
          const T = this.extraT(im, tpl); if (tpl && !T) continue;
          out.push({ id: 'xl:cavity', name: 'cavité segmentée', vol, T, kind: 'labels', lut: new Map([[1, [255, 255, 255, 0.42]]]), opacity: 1, names: v => v ? 'volume de résection segmenté' : '' });
          continue;
        }
        const lab = this.sliceLabelLayer && this.sliceLabelLayer(k, space); if (!lab) continue;
        out.push(Object.assign(lab, { id: 'xl:' + k, opacity: st.xlOpacity != null ? st.xlOpacity : 0.6 }));
      }
      return out;
    },
    /** transformation monde(image) → monde des coupes : recalage sur le T1, puis affine vers le gabarit en MNI */
    extraT(im, tpl) {
      const d = this.dossier, ref = d && S.refImaging(d), T0 = im === ref || !(im.coreg && im.coreg.T) ? M4.identity() : M4.from(im.coreg.T);
      if (!tpl) return im === ref ? null : T0; const A = this.patientAnat; return A && A.toTemplate ? M4.mul(M4.from(A.toTemplate), T0) : null;
    },
    /** contour de la cavité (coupes du patient) */
    async cavityContour() {
      const st = this.slvState(); if (!(st.extraLabs || []).includes('cavity') || this.slvSpace() === 'tpl') return null;
      const im = this.cavityImaging(); if (!im) return null; let vol; try { vol = await this.imagingVolume(im); } catch (e) { return null; }
      const T = this.extraT(im, false), v2 = T ? Object.assign({}, vol, { affine: M4.mul(T, vol.affine) }) : vol;
      return { kind: 'mask', vol: v2, inside: Uint8Array.from([0, 1]), color: '#ffffff', width: 1.8, alpha: 0.95 };
    },
    /** gabarit MNI (écran Imagerie, volet des crises) : base T1 MNI ou image du patient, superpositions du patient — toutes
     *  ramenées par l'affine patient → gabarit (comme la 3D sur gabarit ; la transformation non linéaire sert aux coordonnées) */
    async tplPatientLayers(st) {
      const T = await this.tplVolumes(), d = this.dossier, A = this.patientAnat, ref = d && S.refImaging(d), V = S.V, kindOf = im => this.imagingKind ? this.imagingKind(im) : 'gray';
      const base = [{ id: 'base', name: 'T1 MNI', vol: T.t1, T: null, kind: st.baseKind || 'gray', opacity: 1, win: null }], overlays = [];
      if (!(A && A.toTemplate && d)) return { base, overlays };
      const ok = im => im && (im === ref || (im.coreg && im.coreg.T)), name = im => im.derived && im.modality === 'other' ? (im.label || im.derived.short || 'dérivée') : (V.modality[im.modality] || im.modality) + (im.derived ? ' · ' + (im.derived.short || 'dérivée') : '');
      const bIm = st.tplBase && S.byId(d.imaging, st.tplBase);
      if (ok(bIm)) { try { base[0] = { id: 'base', name: name(bIm) + ' (patient)', vol: await this.imagingVolume(bIm), T: this.extraT(bIm, true), kind: st.baseKind || 'gray', opacity: 1, win: st.baseWin || null }; } catch (e) { } }
      for (const o of st.overlays || []) {
        const im = S.byId(d.imaging, o.id); if (!ok(im) || im === bIm) continue; const D0 = im.derived || {}, ct = im.modality === 'CT';
        try { overlays.push({ id: 'ov:' + im.id, name: name(im), vol: await this.imagingVolume(im), T: this.extraT(im, true), kind: o.kind || kindOf(im), opacity: o.opacity == null ? (D0.cmap ? 0.8 : 0.5) : o.opacity, visible: o.on !== false, win: o.win || (ct ? [500, 3000] : D0.win ? D0.win.slice() : null), threshold: ct ? (o.threshold == null ? 500 : o.threshold) : D0.thr != null ? D0.thr : null }); } catch (e) { }
      }
      return { base, overlays };
    },
    extraLayersHtml(st) {
      const L = this.extraLayerKinds(); if (!L.length) return ''; const on = new Set(st.extraLabs || []);
      return `<div class="ipm-sec"><div class="ipm-h">Calques supplémentaires <span class="muted small">par-dessus la parcellation, plusieurs à la fois</span></div><div class="row xl-row">${L.map(x => `<label class="chip" title="${esc(x.t)}"><input type="checkbox" data-xl="${x.k}"${on.has(x.k) ? ' checked' : ''}> ${esc(x.l)}</label>`).join('')}</div>
        <div class="row"><span>opacité</span><input type="range" class="xlop" min="10" max="100" step="5" value="${Math.round((st.xlOpacity != null ? st.xlOpacity : 0.6) * 100)}"></div></div>`;
    },
    extraLayersBind(panel, st) {
      panel.querySelectorAll('[data-xl]').forEach(cb => cb.onchange = () => { const s = new Set(st.extraLabs || []); if (cb.checked) s.add(cb.dataset.xl); else s.delete(cb.dataset.xl); st.extraLabs = XL.map(x => x[0]).filter(k => s.has(k)); this.updateImagingLayers(); if (this.renderImagingBar) this.renderImagingBar(); if (this.onExtraLayers) this.onExtraLayers(); });
      const op = panel.querySelector('.xlop'); if (op) op.oninput = () => { st.xlOpacity = +op.value / 100; for (const L of this.slices.layers || []) if (L.id.startsWith('xl:') && L.id !== 'xl:cavity') this.slices.updateLayer(L.id, { opacity: st.xlOpacity }); };
    },
    setExtraLayer(k, on) { const st = this.slvState(), s = new Set(st.extraLabs || []); if (on) s.add(k); else s.delete(k); st.extraLabs = XL.map(x => x[0]).filter(x => s.has(x)); return this.updateImagingLayers(); },
  };
  Object.assign(SV.app, M);
  SV.LayersExtra = { XL };
})(window.SV = window.SV || {});
