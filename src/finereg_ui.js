/* EpiScope — finereg_ui.js (v3.5.0) : recalage fin (elastix, dense, non linéaire) proposé en second temps.
 *
 * Par défaut, EpiScope garde ses recalages rapides : rigide pour les images du patient, affine / spline sur les centres des
 * structures vers MNI (orientation clinique, affichage). Le recalage fin les complète, à la demande :
 *   - vers MNI 2009b (« research-grade ») : elastix affine puis B-spline (imaging/elastix.js) du T1 du patient (cerveau seul) vers
 *     le T1 du gabarit (cerveau seul) ; transformation enregistrée dans derivatives/anat/…_from-T1w_to-MNI152NLin2009bAsym_
 *     mode-elastix_xfm.json.gz, utilisée par S.toMNI (exports, cohorte, requêtes) une fois relue ; contrôle publié avec le
 *     résultat (déterminant jacobien) ; la transformation rapide précédente est gardée (an.mni.previous) ;
 *   - entre deux images du patient (plusieurs années d'écart, croissance, IRM post-opératoire) : l'image, déjà recalée en
 *     rigide, est recalée finement (affine puis B-spline) sur la référence ; le résultat est une nouvelle image du dossier
 *     (derived.kind 'finereg'), sur la grille de la référence ; l'image d'origine est gardée.
 * Les calculs tournent dans un worker (SV.Work : fabriques 'nifti', 'volops', 'elastixwasm', 'elastix').                    */
(function (SV) {
  'use strict';
  const A = SV.app, S = SV.Store, L = SV.Library, M4 = SV.Mat4, esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIR = 'derivatives/anat/', nf = (v, d) => String(+(+v).toFixed(d)).replace('.', ',');
  const cache = new Map();   // fichier de transformation → fonction monde du T1 → MNI

  const M = {
    fineAvailable() { return !!(this.anatAsset && this.anatAsset('elastix') && SV._factories && SV._factories.elastixwasm && SV._factories.elastix); },
    /** fonction patient → MNI de la transformation fine du dossier (relue au besoin) ; null si absente */
    async fineMniLoad(d) {
      const Mn = d && d.anatomy && d.anatomy.mni; if (!Mn || Mn.method !== 'elastix' || !Mn.file) return null;
      if (cache.has(Mn.file)) return cache.get(Mn.file);
      const u8 = await L.readBytes(d, Mn.file); if (!u8) throw new Error('fichier de la transformation fine absent du dossier');
      const tpo = SV.Elastix.unpack(JSON.parse(new TextDecoder().decode(await SV.Nifti.gunzip(u8)))), f = SV.Elastix.compile(tpo);
      cache.set(Mn.file, f); return f;
    },
    /** recalage fin du T1 du patient vers MNI 2009b */
    async mniFine() {
      const d = this.dossier, an = d && d.anatomy, Ap = this.patientAnat, ref = d && S.refImaging(d);
      if (!an || an.status !== 'done' || !Ap || !Ap.segVol || !ref) { this.toast('Calculez d’abord l’anatomie du patient (segmentation du T1).'); return null; }
      if (!this.fineAvailable()) { this.toast('Recalage fin (elastix) absent de cette version.'); return null; }
      if (this.ui.fineJob) { this.toast('Un recalage fin est déjà en cours.'); return null; }
      const job = this.jobStart('Recalage fin vers MNI 2009b (elastix)'); this.ui.fineJob = true;
      try {
        job.progress(0.01, 'préparation des images');
        const vol = await this.imagingVolume(ref), conf = SV.MeshNet.conform(vol, { mode: 'niivue' });
        const tpl = await this.tplVolumes(), ts = this.anatAsset('template_spm'), tplSeg = await SV.Nifti.read(SV.b64ToArray(ts.seg, Uint8Array));
        const pack = v => ({ dims: v.dims.slice(0, 3), affine: Array.from(v.affine), data: v.data, slope: v.slope || 1, inter: v.inter || 0 });
        const args = [this.anatAsset('elastix').wasm, pack(conf), pack(Ap.segVol), pack(tpl.t1), pack(tplSeg)];
        const R = await SV.Work.run(['nifti', 'elastixwasm', 'elastix'], 'Elastix.registerMNI', args, [], p => job.progress(p));
        job.progress(0.97, 'enregistrement dans le dossier');
        const file = DIR + 'sub-' + SV.BIDS.subOf(d) + '_from-T1w_to-' + S.TEMPLATE_SPACE + '_mode-elastix_xfm.json.gz';
        await L.writeFile(d, file, await SV.Nifti.gzip(new TextEncoder().encode(JSON.stringify(R.tpo))));
        cache.delete(file);
        const prev = an.mni && an.mni.method !== 'elastix' ? an.mni : (an.mni && an.mni.previous) || null;
        an.mni = { method: 'elastix', target: S.TEMPLATE_SPACE, file, date: S.now(), previous: prev,
          elastix: { version: R.version, itkWasm: R.itkWasm, secs: R.secs, jac: R.jac, changes: SV.Elastix.MAPS_CHANGES.mni, transforms: R.maps.map(m => m.Transform[0]) },
          why: `elastix ${R.version} : affine puis B-spline (pas final ${R.maps[1].FinalGridSpacingInPhysicalUnits[0]} mm), T1 du patient → T1 MNI 2009b, cerveau seul` };
        await this.fineMniLoad(d);
        S.log(d, 'compute', 'dossier', d.id, `recalage fin vers MNI 2009b (elastix ${R.version}, ${Math.round(R.secs)} s, repliements ${nf(R.jac.negPct, 2)} %)`);
        this.touch(); job.done(`terminé en ${Math.round(R.secs / 60)} min — repliements ${nf(R.jac.negPct, 2)} % du cerveau`);
        this.toast(`Coordonnées MNI « research-grade » : recalage fin elastix enregistré (repliements : ${nf(R.jac.negPct, 2)} % du cerveau).`, 8000);
        this.renderImaging && this.renderImaging(); return an.mni;
      } catch (e) { console.warn('recalage fin', e); job.fail(e.message || String(e)); return null; }
      finally { this.ui.fineJob = false; }
    },
    /** revenir à la transformation rapide gardée */
    mniFineUndo() {
      const an = this.dossier && this.dossier.anatomy; if (!an || !an.mni || an.mni.method !== 'elastix') return;
      if (!confirm('Revenir à la transformation rapide vers MNI (centres des structures) ? Le fichier du recalage fin reste dans le dossier.')) return;
      an.mni = an.mni.previous || null; this.touch(); this.renderImaging && this.renderImaging();
    },
    /** ligne de l'encart MNI pour le recalage fin */
    mniFineLine(an) {
      if (!this.fineAvailable()) return '';
      const Mn = an.mni, fine = Mn && Mn.method === 'elastix', E = fine ? Mn.elastix || {} : null;
      const q = fine ? `<div class="mni-q ok">MNI fin (research-grade) : elastix ${esc(E.version || '')}, affine puis B-spline · repliements ${nf(E.jac ? E.jac.negPct : 0, 2)} % du cerveau${E.jac && E.jac.negPct > 1 ? ' — <b>à vérifier</b>' : ''} · ${esc(new Date(Mn.date).toLocaleDateString(SV.LOC))}</div>`
        : `<div class="mni-q approx">MNI rapide (approximatif : erreur de plusieurs millimètres sur le cortex) : suffisant pour l’orientation et l’affichage ; pour une étude de cohorte, faire le recalage fin.</div>`;
      return `${q}<div class="btnrow"><button class="mini-btn mni-fine${fine ? '' : ' primary'}" title="elastix (WebAssembly, dans EpiScope) : affine puis B-spline du T1 du patient vers le T1 MNI 2009b, cerveau seul ; 5 à 15 minutes selon l’ordinateur">${fine ? 'Refaire le recalage fin' : 'Recalage fin vers MNI (elastix)…'}</button>${fine ? '<button class="mini-btn mni-fine-undo">revenir au rapide</button>' : ''}</div>`;
    },
    mniFineBind(box) {
      const q = s => box.querySelector(s);
      if (q('.mni-fine')) q('.mni-fine').onclick = () => { if (confirm('Recalage fin vers MNI 2009b (elastix) : 5 à 15 minutes de calcul, l’application reste utilisable. Lancer ?')) this.mniFine(); };
      if (q('.mni-fine-undo')) q('.mni-fine-undo').onclick = () => this.mniFineUndo();
    },

    // ================================================================ recalage fin entre deux images du patient
    async fineCoreg(im) {
      const d = this.dossier, ref = S.refImaging(d);
      if (!ref || !im || im.ref || !im.coreg || !im.coreg.T) { this.toast('Recalez d’abord l’image (rigide) sur la référence.'); return; }
      if (!this.fineAvailable()) { this.toast('Recalage fin (elastix) absent de cette version.'); return; }
      if (!confirm(`Recalage fin (affine puis B-spline à grille large, elastix) de « ${im.label || im.modality} » sur la référence ?\nUtile entre deux IRM séparées de plusieurs années (croissance). Après une chirurgie, la déformation tend à combler la cavité : pour situer la cavité, garder le recalage rigide. Une nouvelle image recalée est ajoutée au dossier ; l’image d’origine est gardée. Quelques minutes.`)) return;
      const job = this.jobStart(`Recalage fin · ${im.label || im.modality}`);
      try {
        job.progress(0.01, 'image d’origine sur la grille de la référence (recalage rigide)');
        // grille de travail : T1 de référence conformé (1 mm, 256³, même monde) ; image d'origine portée dessus par le rigide
        const rv = SV.MeshNet.conform(await this.imagingVolume(ref), { mode: 'niivue' }), mv = await this.imagingVolume(im);
        const pre = SV.Vol.resample(mv, rv, M4.from(im.coreg.T));
        const pack = v => ({ dims: v.dims.slice(0, 3), affine: Array.from(v.affine), data: v.data, slope: v.slope || 1, inter: v.inter || 0 });
        const seg = this.patientAnat && this.patientAnat.segVol ? pack(this.patientAnat.segVol) : null;
        const R = await SV.Work.run(['nifti', 'elastixwasm', 'elastix'], 'Elastix.registerCoreg', [this.anatAsset('elastix').wasm, pack(rv), seg, pack(pre), { result: true }], [], p => job.progress(p));
        job.progress(0.96, 'enregistrement');
        const nim = S.addImaging(d, { modality: im.modality, timepoint: im.timepoint, date: im.date, label: (im.label || im.modality) + ' · recalage fin', ref: false,
          coreg: { T: Array.from(M4.identity()), refId: ref.id, method: 'elastix', date: S.now(), text: `recalage fin elastix ${R.version} (rigide EpiScope puis affine + B-spline), sur la grille de la référence conformée (1 mm)` },
          derived: { kind: 'finereg', short: 'fin', from: im.id, method: 'elastix', version: R.version, secs: R.secs, jac: R.jac, changes: SV.Elastix.MAPS_CHANGES.coreg, date: S.now() } });
        nim.file = `imaging/${nim.id}.nii.gz`; const vol = Object.assign(R.result, { datatype: 16 });
        const u8 = await SV.Nifti.encodeGz(vol); await L.writeFile(d, nim.file, u8); nim.bytes = u8.length; nim.dims = vol.dims; nim.pixdim = vol.pixdim;
        const xf = `derivatives/coreg/${nim.id}_mode-elastix_xfm.json.gz`; await L.writeFile(d, xf, await SV.Nifti.gzip(new TextEncoder().encode(JSON.stringify(R.tpo)))); nim.derived.xfm = xf;
        this.touch('imaging', nim.id, 'recalage fin'); job.done(`terminé (${Math.round(R.secs)} s, repliements ${nf(R.jac.negPct, 2)} %)`);
        this.toast(`« ${nim.label} » ajoutée : vérifiez la superposition avec la référence dans les coupes.`, 7000); this.renderImaging();
      } catch (e) { console.warn('recalage fin', e); job.fail(e.message || String(e)); }
    },
  };
  Object.assign(A, M);
  SV.FineReg = { cache };
})(window.SV);
