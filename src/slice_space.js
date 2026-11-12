/* EpiScope — slice_space.js (v5.1) : espace des coupes — IRM du patient (monde du T1) ou gabarit MNI.
 *
 *   Le volet « Coupes IRM » de l'espace de travail suit l'anatomie de la vue 3D : gabarit → T1 moyen MNI ICBM152 2009a
 *   (2 mm, espace fsaverage / MNI305, celui de la méthode atlas) avec la parcellation VEP du gabarit, électrodes prévues
 *   dans leurs coordonnées, électrodes réelles ramenées par l'affine patient → gabarit ; patient → IRM du patient et sa
 *   segmentation. « Gabarit MNI | IRM du patient » bascule le volet (stimulations, thermocoagulations : toujours le
 *   patient). Les coupes affichées dans la 3D suivent la même règle et ne demandent plus ni T1 ni anatomie en gabarit.
 *   Toutes les positions passent par toSlv / viewToSlv / slvToView : le reste du code ignore l'espace des coupes. */
(function (SV) {
  'use strict';
  const $ = id => document.getElementById(id), S = SV.Store, M4 = SV.Mat4;
  const M = {
    /** T1 du gabarit (asset template_spm) et parcellation VEP du gabarit, au format des volumes NIfTI */
    async tplVolumes() {
      if (this._tpl) return this._tpl;
      const tj = this.asset && this.asset('template_spm'); if (!tj) throw new Error('gabarit MNI absent de cette version');
      const t1 = await SV.Nifti.read(SV.b64ToArray(tj.t1, Uint8Array));
      t1.name = 'T1 MNI ICBM152 2009a';
      return (this._tpl = { t1, vep: this.tplVepVol() });
    },
    /** volume VEP de l'atlas (2 mm, i = (128 − x)/2, j = (128 − z)/2, k = (y + 128)/2, k le plus rapide) en volume NIfTI */
    tplVepVol() {
      const v = this.vol; if (!v) return null; if (this._tplVep && this._tplVep.src === v) return this._tplVep.vol;
      const [d0, d1, d2] = v.dims, [o0, o1, o2] = v.off, s = v.vox, A = M4.identity();
      A[0] = 0; A[2] = -s; A[3] = 128 - s * o0; A[4] = s; A[5] = 0; A[7] = s * o2 - 128; A[8] = 0; A[9] = -s; A[10] = 0; A[11] = 128 - s * o1;
      const vol = { dims: [d2, d1, d0], pixdim: [s, s, s], affine: A, data: v.data, slope: 1, inter: 0 };
      this._tplVep = { src: v, vol }; return vol;
    },
    /** espace voulu pour le volet de l'espace de travail : sans T1 du patient → gabarit ; stimulations, thermocoagulations →
     *  patient ; sinon le choix du volet, à défaut l'anatomie de la vue 3D */
    dockSpace() {
      const d = this.dossier; if (!d || !S.refImaging(d)) return 'tpl';
      if (['stim', 'thermo'].includes(this.ui.wm)) return 'pat';
      return this.ui.dockSpace || (this.anatMode === 'patient' ? 'pat' : 'tpl');
    },
    /** espace des coupes montées */
    slvSpace() { return this.slices && this._ipSpace === 'tpl' ? 'tpl' : 'pat'; },
    /** point vers l'espace des coupes, depuis le monde du T1 ('w') ou le gabarit ('t') ; null si la transformation manque */
    toSlv(p, from) {
      if (!p) return null; const tpl = this.slvSpace() === 'tpl'; if ((from === 't') === tpl) return p;
      const A = this.patientAnat; return A ? M4.apply(tpl ? A.toTemplate : A.fromTemplate, p[0], p[1], p[2]) : null;
    },
    /** point des coupes vers le monde du T1 (ROI, plots, cible chirurgicale) */
    slvToWorld(p) { if (!p) return null; if (this.slvSpace() !== 'tpl') return p; const A = this.patientAnat; return A ? M4.apply(A.fromTemplate, p[0], p[1], p[2]) : null; },
    /** espace de la vue 3D ↔ espace des coupes */
    viewToSlv(p) {
      if (!p) return null; const A = this.patientAnat;
      if (this.slvSpace() === 'tpl') return this.anatMode === 'patient' && A ? M4.apply(A.templateFromDisplay, p[0], p[1], p[2]) : p;
      return A ? M4.apply(this.anatMode === 'patient' ? A.fromDisplay : A.fromTemplate, p[0], p[1], p[2]) : null;
    },
    slvToView(p) {
      if (!p) return null; const A = this.patientAnat;
      if (this.slvSpace() === 'tpl') return this.anatMode === 'patient' && A ? M4.apply(A.dispFromTemplate, p[0], p[1], p[2]) : p;
      return this.worldToView ? this.worldToView(p) : null;
    },
    /** électrode { pts, tip, entry } d'un espace ('w' ou 't') vers celui des coupes ; null si impossible */
    elecToSlv(o, from) {
      const f = p => this.toSlv(p, from), pts = o.pts.map(f); if (pts.some(q => !q)) return null;
      return Object.assign(o, { pts, tip: f(o.tip), entry: f(o.entry) });
    },
    /** parcellation VEP de l'espace demandé (coupes : celui des coupes) */
    vepVolFor(space) { space = space || this.slvSpace(); return space === 'tpl' ? this.tplVepVol() : this.patientAnat && this.patientAnat.vepVol; },
    /** bascule du volet (gabarit ↔ patient) */
    setDockSpace(sp) {
      this.ui.dockSpace = sp; const dock = $('sliceDock');
      if (this.ui.dock && dock && this._ipHost === dock && this.dockSpace() !== this._ipSpace) {
        if (this.slvState().elec) this.slvState().elec = null;
        this.mountImagingPanel(dock);
      }
    },
    /** boutons du volet ; rien hors de l'espace de travail ni sans T1 du patient */
    slvSpaceHtml() {
      const dock = $('sliceDock'), d = this.dossier; if (!dock || this._ipHost !== dock || this.ui.screen !== 'work' || !d || !S.refImaging(d) || ['stim', 'thermo'].includes(this.ui.wm)) return '';
      const sp = this.slvSpace();
      return `<div class="seg ip-space" title="images du volet : gabarit MNI (comme la vue 3D sur gabarit) ou IRM du patient">${[['tpl', 'MNI', 'gabarit : T1 moyen MNI ICBM152 2009a, parcellation VEP du gabarit, électrodes prévues sur le gabarit'], ['pat', 'Patient', 'IRM du patient, sa segmentation, électrodes réelles']].map(([k, l, t]) => `<button data-sp="${k}" class="${sp === k ? 'on' : ''}" title="${t}">${l}</button>`).join('')}</div>`;
    },
  };
  Object.assign(SV.app, M);
  // la vue 3D change d'anatomie : le volet la suit (le choix fait dans le volet est oublié)
  const sa0 = SV.app.setAnatomy;
  if (sa0) SV.app.setAnatomy = function () {
    const before = this.anatMode; if (arguments[0] !== before) this._sl3Cursor = null;   // curseur des coupes 3D : autre espace
    const r = sa0.apply(this, arguments);
    if (before !== this.anatMode) { this.ui.dockSpace = null; const dock = $('sliceDock'); if (this.ui.dock && dock && this._ipHost === dock && this.dockSpace() !== this._ipSpace) this.mountImagingPanel(dock); }
    return r;
  };
})(window.SV = window.SV || {});
